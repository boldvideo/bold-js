// Prints one table across every results.json under ./out.
import { readdirSync, readFileSync, existsSync } from "node:fs";
const runs = readdirSync("out", { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(`out/${d.name}/results.json`)).map((d) => JSON.parse(readFileSync(`out/${d.name}/results.json`)));
const ids = [...new Set(runs.flatMap((r) => r.results.map((x) => x.id)))];
const title = Object.fromEntries(runs.flatMap((r) => r.results.map((x) => [x.id, x.title])));
const cols = runs.map((r) => `${r.engine}/${r.target}`);
console.log(["scenario", ...cols].join(" | "));
for (const id of ids) {
  const cells = runs.map((r) => {
    const x = r.results.find((y) => y.id === id);
    if (!x) return "-";
    const f = x.failoverMs != null && x.final?.source === "mp4" ? ` ${(x.failoverMs / 1000).toFixed(1)}s` : "";
    if (x.interruptionMs != null) return `${x.pass ? "PASS" : "FAIL"} (paused ${(x.interruptionMs / 1000).toFixed(1)}s)`;
    return `${x.pass ? "PASS" : "FAIL"}${f}`;
  });
  console.log([title[id], ...cells].join(" | "));
}
console.log("\nversions:", runs.map((r) => `${r.engine}/${r.target}: ${r.version} @ ${r.ranAt}`).join("; "));
for (const r of runs) {
  const m = r.results.find((x) => x.id === "mid-playback");
  if (m) console.log(`\n${r.engine}/${r.target} mid-playback: ${m.checks.map((c) => `${c.ok ? "ok" : "FAIL"} ${c.name} (${c.detail})`).join("; ")}`);
  for (const x of r.results) for (const c of x.checks) if (!c.ok) console.log(`  FAIL ${r.engine}/${r.target} ${x.id}: ${c.name} (${c.detail})`);
}
