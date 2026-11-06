import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  out = resolve(root, "release");
await mkdir(out, { recursive: true });
const version = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
).version;
const sums = [];
// Invoke npm's JavaScript entry point without shell command interpolation on Windows.
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run through npm run pack:release");
for (const name of ["core", "exporters", "cli", "phaser", "audio-core", "audio-exporters"]) {
  const dir = resolve(root, "packages", name),
    file = resolve(dir, "package.json"),
    original = await readFile(file, "utf8"),
    packed = JSON.parse(original);
  if (packed.exports) delete packed.exports.development;
  let status;
  try {
    await writeFile(file, JSON.stringify(packed, null, 2) + "\n");
    const result = spawnSync(
      process.execPath,
      [npm, "pack", "--ignore-scripts", "--pack-destination", out],
      { cwd: dir, stdio: "inherit" },
    );
    status = result.status ?? 1;
  } finally {
    await writeFile(file, original);
  }
  if (status !== 0) process.exit(status);
  const filename = `pixelforge-${name}-${version}.tgz`;
  sums.push(
    `${createHash("sha256")
      .update(await readFile(resolve(out, filename)))
      .digest("hex")}  ${filename}`,
  );
}
await writeFile(resolve(out, "SHA256SUMS"), sums.join("\n") + "\n");
const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
const releaseSection =
  changelog.split(`## ${version}`)[1]?.split("\n## ")[0]?.trim() ??
  "See repository CHANGELOG.md.";
const installArchives = ["core", "exporters", "cli", "phaser", "audio-core", "audio-exporters"]
  .map((name) => `./vendor/pixelforge/pixelforge-${name}-${version}.tgz`)
  .join(" ");
await writeFile(
  resolve(out, `RELEASE-${version}.md`),
  `# PixelForge ${version} local release artifacts\n\n${releaseSection}\n\n## Reproduce and verify\n\nFrom the reviewed source checkout: npm ci, npm run typecheck, npm test, npm run pack:release. Verify with node scripts/verify-release.mjs release.\n\nCopy the six matching archives into vendor/pixelforge inside the consumer repository, inspect its Phaser version, then run:\n\n\`\`\`sh\nnpm install --ignore-scripts ${installArchives}\n\`\`\`\n\nThird-party dependencies normally require network access. --offline works only with a populated npm cache. SHA256SUMS detects corruption; it is not a signature or publisher provenance attestation. No publication or namespace ownership is implied. See docs/v0.5-verification.md for exact executed environments and acceptance evidence.\n`,
);
