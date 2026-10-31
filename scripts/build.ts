import { cp, mkdir } from "node:fs/promises";
for (const name of ["core", "exporters", "cli", "phaser"]) {
  await mkdir(`packages/${name}/dist`, { recursive: true });
  await cp(`dist/packages/${name}/src`, `packages/${name}/dist`, {
    recursive: true,
  });
}
