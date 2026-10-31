import { exportPhaserBundle } from "../packages/exporters/src/bundle.js";
import { rm } from "node:fs/promises";
import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import * as pf from "../packages/core/src/index.js";
const browser = await chromium.launch({
  executablePath:
    process.env.PIXELFORGE_CHROME ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  await mkdir("test-output", { recursive: true });
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto("http://127.0.0.1:5173");
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("examples/phaser-playground/character.sprite.json"));
  await page.waitForFunction(() =>
    document.body.textContent?.includes("Playground knight"),
  );
  await page.getByLabel("Origin X", { exact: true }).fill("0.25");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(
    await page.getByLabel("Origin X", { exact: true }).inputValue(),
    "0.5",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByLabel("hurtbox overlay", { exact: true }).uncheck();
  await page.getByLabel("Edit geometry on canvas", { exact: true }).check();
  const region = page.locator("[data-region=collision]"),
    canvas = page.getByLabel("Editable pixel canvas");
  const bounds = (await region.boundingBox())!,
    cb = (await canvas.boundingBox())!,
    zoom = cb.width / 32;
  await page.mouse.move(bounds.x + 3, bounds.y + 3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 3 + zoom, bounds.y + 3);
  await page.mouse.up();
  assert.equal(
    await page.getByLabel("Body x", { exact: true }).inputValue(),
    "12",
  );
  const resize = region.locator("[data-resize]");
  const handle = (await resize.boundingBox())!;
  await page.mouse.move(handle.x + 4, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 4 + zoom, handle.y + 4);
  await page.mouse.up();
  assert.equal(
    await page.getByLabel("Body width", { exact: true }).inputValue(),
    "12",
  );
  const savedEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await (await savedEvent).saveAs("test-output/game-edited.sprite.json");
  const p = pf.fromDocument(
    JSON.parse(await readFile("test-output/game-edited.sprite.json", "utf8")),
  );
  assert.equal(pf.getGameMetadata(p).body!.x, 12);
  assert.equal(pf.getGameMetadata(p).origin.x, 0.25);
  await page.getByText("Phaser export", { exact: true }).click();
  await page.getByLabel("Phaser filename", { exact: true }).fill("hero");
  const downloads: import("playwright-core").Download[] = [];
  page.on("download", (d) => downloads.push(d));
  await page
    .getByRole("button", { name: "Download Phaser bundle", exact: true })
    .click();
  for (let i = 0; i < 100 && downloads.length < 6; i++)
    await page.waitForTimeout(100);
  assert.equal(downloads.length, 6);
  for (const d of downloads)
    await d.saveAs(`test-output/game-${d.suggestedFilename()}`);
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("test-output/game-edited.sprite.json"));
  await page.waitForFunction(
    () =>
      document
        .querySelector('input[aria-label="Body width"]')
        ?.getAttribute("value") === "12",
  );
  await rm("test-output/game-cli-bundle", { recursive: true, force: true });
  await exportPhaserBundle(p, "test-output/game-cli-bundle", {
    name: "hero",
    layout: "atlas",
    padding: 1,
    maxWidth: 2048,
    maxHeight: 2048,
    columns: 4,
    powerOfTwo: false,
  });
  const expected = pf.assemblePhaserBundle(p, {
      name: "hero",
      layout: "atlas",
      padding: 1,
      maxWidth: 2048,
      maxHeight: 2048,
      columns: 4,
      powerOfTwo: false,
    }),
    decoded = await sharp("test-output/game-hero.png").raw().toBuffer();
  assert.deepEqual(Array.from(decoded), Array.from(expected.raster.data));
  assert.deepEqual(
    await sharp("test-output/game-cli-bundle/hero.png").raw().toBuffer(),
    decoded,
  );
  for (const [file, text] of Object.entries(expected.files))
    assert.equal(await readFile(`test-output/game-${file}`, "utf8"), text);
  await page.screenshot({
    path: "test-output/game-editor.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Game editor passed: origin history, snapped collision move, metadata save, atlas bundle downloads and decoded pixels/metadata equality.",
  );
} finally {
  await browser.close();
}
