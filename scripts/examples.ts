import { mkdir, writeFile } from "node:fs/promises";
import {
  createProject,
  createFrame,
  drawEllipse,
  drawRect,
  drawLine,
  setPixel,
  addAnimation,
  serializeProject,
  type Project,
} from "../packages/core/src/index.js";
import {
  exportFramePNG,
  exportSpriteSheet,
} from "../packages/exporters/src/index.js";
const coin = createProject({
  name: "Amber coin",
  width: 16,
  height: 16,
  palette: [
    [0, 0, 0, 0],
    [89, 46, 19, 255],
    [191, 109, 26, 255],
    [244, 178, 43, 255],
    [255, 225, 119, 255],
    [255, 246, 201, 255],
  ],
});
for (let i = 0; i < 6; i++) {
  const f = i === 0 ? "frame-0" : createFrame(coin, `frame-${i}`).id,
    w = [12, 10, 6, 3, 6, 10][i]!,
    x = Math.floor((16 - w) / 2);
  drawEllipse(coin, f, "base", x, 1, w, 14, 1);
  drawEllipse(coin, f, "base", x + 1, 2, Math.max(1, w - 2), 12, 2);
  if (w > 3) {
    drawEllipse(coin, f, "base", x + 2, 3, Math.max(1, w - 4), 10, 3);
    drawLine(coin, f, "base", x + 2, 4, x + 2, 10, 4);
    drawLine(coin, f, "base", 8, 4, 8, 10, 4);
    setPixel(coin, f, "base", x + 3, 3, 5);
  } else drawLine(coin, f, "base", 8, 3, 8, 12, 4);
}
addAnimation(
  coin,
  "spin",
  coin.frames.map((f) => ({ frameId: f.id, durationMs: 125 })),
);
const character = createProject({
  name: "Blue cape scout",
  width: 32,
  height: 32,
  palette: [
    [0, 0, 0, 0],
    [26, 31, 44, 255],
    [63, 77, 101, 255],
    [114, 141, 163, 255],
    [217, 229, 222, 255],
    [234, 174, 117, 255],
    [35, 87, 143, 255],
    [57, 135, 192, 255],
    [116, 198, 220, 255],
    [111, 69, 47, 255],
  ],
});
for (let i = 0; i < 4; i++) {
  const f = i === 0 ? "frame-0" : createFrame(character, `frame-${i}`).id,
    bob = i % 2,
    step = [-2, 0, 2, 0][i]!;
  drawRect(character, f, "base", 10, 13 + bob, 12, 12, 1);
  drawRect(character, f, "base", 11, 14 + bob, 10, 10, 6);
  drawLine(character, f, "base", 12, 15 + bob, 12, 23, 8);
  drawRect(character, f, "base", 12, 22, 4, 6 + step, 1);
  drawRect(character, f, "base", 17, 22, 4, 6 - step, 1);
  drawRect(character, f, "base", 11, 27 + step, 5, 2, 9);
  drawRect(character, f, "base", 17, 27 - step, 5, 2, 9);
  drawRect(character, f, "base", 12, 12 + bob, 8, 11, 2);
  drawRect(character, f, "base", 13, 14 + bob, 6, 7, 3);
  drawRect(character, f, "base", 11, 6 + bob, 10, 8, 1);
  drawRect(character, f, "base", 12, 7 + bob, 8, 6, 5);
  drawRect(character, f, "base", 11, 5 + bob, 10, 4, 2);
  drawRect(character, f, "base", 12, 5 + bob, 8, 2, 3);
  drawRect(character, f, "base", 18, 9 + bob, 2, 2, 1);
  drawRect(character, f, "base", 13, 20 + bob, 7, 2, 9);
  drawRect(character, f, "base", 9, 15 + bob + Math.sign(step), 3, 7, 1);
  drawRect(character, f, "base", 10, 16 + bob + Math.sign(step), 2, 5, 3);
  setPixel(character, f, "base", 10, 22 + bob, 5);
}
addAnimation(
  character,
  "walk",
  character.frames.map((f) => ({ frameId: f.id, durationMs: 150 })),
);
async function save(p: Project, folder: string) {
  await mkdir(`examples/${folder}/frames`, { recursive: true });
  await writeFile(
    `examples/${folder}/${folder}.sprite.json`,
    serializeProject(p),
  );
  const out = await exportSpriteSheet(p);
  await writeFile(`examples/${folder}/${folder}.png`, out.png);
  await writeFile(
    `examples/${folder}/${folder}.json`,
    JSON.stringify(out.manifest, null, 2) + "\n",
  );
  for (const [i, f] of p.frames.entries())
    await writeFile(
      `examples/${folder}/frames/${i}.png`,
      await exportFramePNG(p, f.id),
    );
}
await save(coin, "coin");
await save(character, "character");
await mkdir("apps/web/public/examples", { recursive: true });
await writeFile(
  "apps/web/public/examples/coin.sprite.json",
  serializeProject(coin),
);
await writeFile(
  "apps/web/public/examples/character.sprite.json",
  serializeProject(character),
);

await writeFile(
  "apps/web/public/examples/coin.png",
  (await exportSpriteSheet(coin)).png,
);
