// Runs tsc on apps/web and fails on any error not matching KNOWN_NOISE (upstream issues at pinned commit).
// Usage: node typecheck.mjs <dub-checkout>   (run after patch.mjs, before/after build)
import { spawnSync } from "node:child_process";
const root = process.argv[2] || ".";
// Add only entries verified as upstream noise at the pinned commit: { file: regex, code: "TSxxxx" }
const KNOWN_NOISE = JSON.parse(process.env.TS_NOISE_JSON || "[]").map((n) => ({ file: new RegExp(n.file), code: n.code }));
const r = spawnSync("npx", ["tsc", "--noEmit", "-p", "apps/web"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const lines = (r.stdout + r.stderr).split("\n").filter((l) => /\berror TS\d+:/.test(l));
const bad = lines.filter((l) => { const m = l.match(/^(.*?)\(\d+,\d+\): error (TS\d+):/); return !(m && KNOWN_NOISE.some((n) => n.code === m[2] && n.file.test(m[1]))); });
console.log(`tsc errors: ${lines.length}, ignored as known noise: ${lines.length - bad.length}, blocking: ${bad.length}`);
if (bad.length) { console.error(bad.slice(0, 50).join("\n")); process.exit(1); }
if (r.status !== 0 && !lines.length) { console.error("tsc failed without parseable errors"); process.exit(1); }
