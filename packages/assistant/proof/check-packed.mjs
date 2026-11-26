import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const [url] = process.argv.slice(2);
if (!url) throw new Error("Usage: node check-packed.mjs http://host:port");
const session = "assistant-packed";
function browser(...args) {
  const reply = JSON.parse(execFileSync("agent-browser", ["--session", session, "--json", ...args], { encoding: "utf8" }));
  assert(reply.success, JSON.stringify(reply)); return reply.data;
}
const html = await (await fetch(url)).text();
assert(html.includes("Packed assistant React"));
assert(html.includes("Your question"));
console.log("PASS server render: heading, assistant and labeled composer in the HTTP HTML, before JavaScript.");
try {
  browser("open", url); browser("set", "viewport", "1280", "900", "2");
  browser("wait", "[data-hydrated=true]");
  browser("wait", "textarea");
  browser("fill", "textarea", "How do I fold the base?"); browser("press", "Enter");
  browser("wait", "[data-citation=c_0_1]");
  assert.equal(browser("eval", "document.querySelector('[data-citation=c_0_1]').textContent").result, "1");
  assert(browser("eval", "document.querySelector('[data-citation=c_0_1]').href").result.includes("/watch/video-1?t=30"));
  const errors = browser("errors"); assert(!errors.errors?.length, JSON.stringify(errors));
  const logs = browser("console");
  assert(!JSON.stringify(logs).match(/hydration|did not match|Minified React error|Invalid hook|Warning:/i), JSON.stringify(logs));
  console.log("PASS hydration: no browser errors or React warnings. Question reached the real handler/fake Bold; source chip 1 links to its sentence at 30s.");
} finally { browser("close"); }
