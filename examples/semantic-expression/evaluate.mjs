// One deterministic CPU demonstration. Outputs must be a NEW directory.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
if (process.argv.length !== 4 || process.argv[2] !== "--out") throw new Error("Usage: node examples/semantic-expression/evaluate.mjs --out NEW_DIRECTORY");
const out = resolve(process.argv[3]);
mkdirSync(out); // Never replace an existing evaluation.
const run = (...args) => {
  const p = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { cwd: root, encoding: "utf8" });
  if (p.status !== 0) throw new Error(p.stderr || p.stdout);
  return JSON.parse(p.stdout);
};
const tired = run("sprite", "expression", "resolve", join(here, "tired.expression.json"), "--sprite", join(here, "source.sprite.json"), "--landmarks", join(here, "face.landmarks.json"), "--out", join(out, "tired.sprite.json"), "--operations-out", join(out, "tired.ops.json"), "--json");
const surprised = run("sprite", "expression", "resolve", join(here, "surprised.expression.json"), "--sprite", join(out, "tired.sprite.json"), "--landmarks", join(here, "face.landmarks.json"), "--out", join(out, "transition.sprite.json"), "--operations-out", join(out, "surprised.ops.json"), "--json");
const doctor = run("doctor", join(out, "transition.sprite.json"), "--json");
const requestDoctor = run("doctor", join(here, "surprised.expression.json"), "--sprite", join(here, "source.sprite.json"), "--landmarks", join(here, "face.landmarks.json"), "--json");
const preview = run("preview", join(out, "transition.sprite.json"), "--contact-sheet", "--animation", "reaction", "--columns", "2", "--scale", "8", "--out", join(out, "reaction.png"), "--json");
const single = run("preview", join(out, "transition.sprite.json"), "--frame", "1", "--scale", "8", "--out", join(out, "surprised.png"), "--json");
const report = { tired, surprised, doctor, requestDoctor, preview, single };
writeFileSync(join(out, "evaluation.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
// Verify the kept source remains an ordinary editable document, not a PNG-only example.
JSON.parse(readFileSync(join(here, "source.sprite.json"), "utf8"));
console.log(JSON.stringify({ ok: true, out, preview: preview.preview, single: single.preview, report: join(out, "evaluation.json") }));
