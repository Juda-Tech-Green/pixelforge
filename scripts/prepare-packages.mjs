import { readFile, writeFile, cp, mkdir, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
).version;
for (const name of ["core", "exporters", "cli", "phaser", "audio-core", "audio-exporters"]) {
  const dir = resolve(root, "packages", name),
    p = JSON.parse(await readFile(resolve(dir, "package.json"), "utf8"));
  p.version = version;
  p.license = "MIT";
  p.description = `PixelForge ${name}: deterministic editable pixel sprites and game assets`;
  p.engines = { node: ">=22.12" };
  p.files = ["dist", "schemas", "README.md", "LICENSE"];
  if (name !== "cli")
    p.exports = {
      types: "./dist/index.d.ts",
      development: "./src/index.ts",
      default: "./dist/index.js",
    };
  for (const key of Object.keys(p.dependencies ?? {}))
    if (key.startsWith("@pixelforge/")) p.dependencies[key] = version;
  await writeFile(
    resolve(dir, "package.json"),
    JSON.stringify(p, null, 2) + "\n",
  );
  await cp(resolve(root, "LICENSE"), resolve(dir, "LICENSE"));
  await writeFile(
    resolve(dir, "README.md"),
    `# ${p.name}\n\n${p.description}.\n\nLocal development distribution: build PixelForge, run npm pack in this package, then install the complete local tarball set. Public registry publication is not performed. See the repository installation and release guides.\n`,
  );
  if (name === "core") {
    await mkdir(resolve(dir, "schemas"), { recursive: true });
    await cp(resolve(root, "schemas"), resolve(dir, "schemas"), {
      recursive: true,
    });
  }
  if (name === "audio-core") {
    await mkdir(resolve(dir, "schemas"), {recursive: true});
    for (const schema of ["sound", "audioOperations", "audioManifest"])
      await cp(resolve(root, "schemas", `${schema}.schema.json`), resolve(dir, "schemas", `${schema}.schema.json`));
  }
  if (name === "cli") await chmod(resolve(dir, "dist/index.js"), 0o755);
}
