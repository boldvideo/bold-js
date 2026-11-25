// A local origin in front of Mux that can break any layer of a stream on
// demand: the master manifest, the rendition playlists, the segments, the MP4.
// The player talks to this server over plain HTTP, so every failure it sees is
// a real network failure, and the request log below is independent of anything
// the browser reports about itself.
//
//   /s/<scenario>/hls/<playbackId>.m3u8          master manifest
//   /s/<scenario>/rendition?u=<mux url>          rendition playlist
//   /s/<scenario>/segment?u=<mux url>            media segment
//   /s/<scenario>/mp4/<playbackId>/highest.mp4   static MP4
//   POST /__faults/<scenario>  {master, rendition, segment, mp4}
//   GET  /__log/<scenario>
import http from "node:http";
import net from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const PORT = Number(process.env.PORT ?? 4477);
const ORIGIN = `http://localhost:${PORT}`;
// URL prefix -> folder. Defaults: the example next to this folder, and the built starter page.
const here = path.dirname(new URL(import.meta.url).pathname);
const STATIC = JSON.parse(process.env.STATIC_DIRS ?? "null") ?? { "/demo/": path.join(here, "../"), "/react/": path.join(here, "react/") };

// Node gives each connection attempt 250ms by default, which a busy machine
// misses now and then. That would fail the rig's own request to Mux.
net.setDefaultAutoSelectFamilyAttemptTimeout(5000);

/** The rig's own request to Mux, tried twice so a blip here is not mistaken for a player failure. */
async function fetchUpstream(url, init) {
  try {
    return await fetch(url, init);
  } catch {
    return await fetch(url, init);
  }
}

const faults = new Map(); // scenario -> { master, rendition, segment, mp4 }
const logs = new Map(); // scenario -> entries
const hanging = new Set();
const t0 = Date.now();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "*",
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };

function log(scenario, entry) {
  if (!logs.has(scenario)) logs.set(scenario, []);
  const stored = { t: Date.now() - t0, ...entry };
  logs.get(scenario).push(stored);
  return stored;
}

/** Apply the scenario's fault for this layer. Returns true when the request was broken. */
function applyFault(scenario, kind, req, res) {
  const fault = faults.get(scenario)?.[kind] ?? "ok";
  if (fault === "ok") return false;
  if (fault === "hang") {
    hanging.add(res);
    res.on("close", () => hanging.delete(res));
    log(scenario, { kind, fault, status: "no response" });
    return true;
  }
  if (fault === "reset") {
    log(scenario, { kind, fault, status: "connection reset" });
    req.socket.destroy();
    return true;
  }
  if (fault === "garbage") {
    log(scenario, { kind, fault, status: 200 });
    res.writeHead(200, { ...CORS, "content-type": "text/html" });
    res.end("<html><body><h1>Service Unavailable</h1></body></html>");
    return true;
  }
  const status = Number(fault);
  log(scenario, { kind, fault, status });
  res.writeHead(status, { ...CORS, "content-type": "application/json" });
  res.end(JSON.stringify({ error: { type: "injected_fault", status } }));
  return true;
}

function rewritePlaylist(text, baseUrl, scenario, childKind) {
  const proxied = (uri, kind) =>
    `${ORIGIN}/s/${scenario}/${kind}?u=${encodeURIComponent(new URL(uri, baseUrl).href)}`;
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // EXT-X-MEDIA in a master points at a rendition; EXT-X-MAP / KEY in a rendition at media.
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxied(uri, childKind)}"`);
      }
      return proxied(trimmed, childKind);
    })
    .join("\n");
}

async function pipeUpstream(scenario, kind, upstreamUrl, req, res) {
  const headers = {};
  if (req.headers.range) headers.range = req.headers.range;
  const upstream = await fetchUpstream(upstreamUrl, { headers });
  const out = { ...CORS };
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) out[name] = value;
  }
  res.writeHead(upstream.status, out);
  const entry = log(scenario, { kind, fault: "ok", status: upstream.status, range: req.headers.range, bytes: 0 });
  if (!upstream.body) return res.end();
  const body = Readable.fromWeb(upstream.body);
  body.on("data", (chunk) => (entry.bytes += chunk.length));
  body.on("error", () => res.destroy());
  res.on("close", () => body.destroy());
  body.pipe(res);
}

async function servePlaylist(scenario, kind, upstreamUrl, childKind, res) {
  const upstream = await fetchUpstream(upstreamUrl);
  const text = await upstream.text();
  log(scenario, { kind, fault: "ok", status: upstream.status });
  res.writeHead(upstream.status, { ...CORS, "content-type": "application/vnd.apple.mpegurl" });
  res.end(upstream.ok ? rewritePlaylist(text, upstreamUrl, scenario, childKind) : text);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN);
    if (req.method === "OPTIONS") return res.writeHead(204, CORS).end();

    const control = url.pathname.match(/^\/__(faults|log)\/([\w-]+)$/);
    if (control) {
      const [, action, scenario] = control;
      if (action === "faults") {
        let body = "";
        for await (const chunk of req) body += chunk;
        faults.set(scenario, JSON.parse(body || "{}"));
        log(scenario, { kind: "control", note: `faults set: ${body}` });
        return res.writeHead(204, CORS).end();
      }
      return res.writeHead(200, { ...CORS, "content-type": "application/json" }).end(JSON.stringify(logs.get(scenario) ?? []));
    }

    const scoped = url.pathname.match(/^\/s\/([\w-]+)\/(.*)$/);
    if (scoped) {
      const [, scenario, rest] = scoped;
      const master = rest.match(/^hls\/([\w-]+)\.m3u8$/);
      const mp4 = rest.match(/^mp4\/([\w-]+)\/highest\.mp4$/);
      if (master) {
        if (applyFault(scenario, "master", req, res)) return;
        return await servePlaylist(scenario, "master", `https://stream.mux.com/${master[1]}.m3u8`, "rendition", res);
      }
      if (rest === "rendition") {
        if (applyFault(scenario, "rendition", req, res)) return;
        return await servePlaylist(scenario, "rendition", url.searchParams.get("u"), "segment", res);
      }
      if (rest === "segment") {
        if (applyFault(scenario, "segment", req, res)) return;
        return await pipeUpstream(scenario, "segment", url.searchParams.get("u"), req, res);
      }
      if (mp4) {
        if (applyFault(scenario, "mp4", req, res)) return;
        return await pipeUpstream(scenario, "mp4", `https://stream.mux.com/${mp4[1]}/highest.mp4`, req, res);
      }
    }

    // The starter's analytics client posts to its own origin; record that it
    // keeps reporting. The scenario comes from the page that sent it.
    if (url.pathname.startsWith("/api/bold/analytics")) {
      const scenario = new URL(req.headers.referer ?? ORIGIN).searchParams.get("s") ?? "unknown";
      let body = "";
      for await (const chunk of req) body += chunk;
      log(scenario, { kind: "analytics", status: 204, note: body.slice(0, 160) });
      return res.writeHead(204, CORS).end();
    }

    for (const [prefix, dir] of Object.entries(STATIC)) {
      if (!url.pathname.startsWith(prefix)) continue;
      const file = path.join(dir, url.pathname.slice(prefix.length) || "index.html");
      if (!file.startsWith(dir)) break;
      const data = await readFile(file);
      return res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(data);
    }
    res.writeHead(404, CORS).end("not found");
  } catch (error) {
    // The proxy's own request to Mux failed. Not an injected fault: say so
    // loudly, because a run that hits this is measuring the rig, not the player.
    const scenario = req.url.match(/^\/s\/([\w-]+)\//)?.[1] ?? "unknown";
    log(scenario, { kind: "rig-error", status: 502, note: `${error?.cause?.code ?? ""} ${String(error).slice(0, 120)} ${req.headers.range ?? ""}` });
    console.error("upstream error", req.url.slice(0, 80), error?.cause ?? error);
    if (!res.headersSent) res.writeHead(502, CORS);
    res.end(String(error));
  }
});

server.listen(PORT, () => console.log(`fault proxy on ${ORIGIN}`));
process.on("SIGTERM", () => {
  for (const res of hanging) res.destroy();
  server.close(() => process.exit(0));
});
