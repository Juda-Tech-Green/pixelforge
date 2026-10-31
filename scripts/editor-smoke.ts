import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import * as pf from "../packages/core/src/index.js";
const batch = JSON.parse(
  await readFile("examples/coin/animate.ops.json", "utf8"),
);
const source = pf.fromDocument(
  JSON.parse(await readFile("examples/coin/coin.sprite.json", "utf8")),
);
await mkdir("test-output", { recursive: true });
await (
  await import("node:fs/promises")
).writeFile(
  "test-output/animated-coin.sprite.json",
  pf.serializeProject(pf.applyOperations(source, batch)),
);
const browser = await chromium.launch({
  executablePath:
    process.env.PIXELFORGE_CHROME ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
await mkdir("test-output", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "dialog",
    (d) =>
      void d.accept(
        d.type() === "prompt"
          ? d.message() === "Columns"
            ? "3"
            : d.message() === "Padding in pixels"
              ? "1"
              : "Test name"
          : undefined,
      ),
  );
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "pencil", exact: true }).waitFor();
  const canvas = page.getByLabel("Editable pixel canvas");
  const pixels = () =>
    canvas.evaluate((c) =>
      Array.from(
        (c as HTMLCanvasElement)
          .getContext("2d")!
          .getImageData(
            0,
            0,
            (c as HTMLCanvasElement).width,
            (c as HTMLCanvasElement).height,
          ).data,
      ),
    );
  const blank = pf.createProject({ name: "Tool test", width: 16, height: 16 });
  await page.locator("input[type=file]").setInputFiles({
    name: "tools.sprite.json",
    mimeType: "application/json",
    buffer: Buffer.from(pf.serializeProject(blank)),
  });
  for (const [tool, filled] of [
    ["line", false],
    ["rectangle", false],
    ["rectangle", true],
    ["ellipse", false],
    ["ellipse", true],
  ] as const) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    await page.getByLabel("Filled shapes", { exact: true }).setChecked(filled);
    await stroke(2, 2, 9, 9);
    const expected = pf.cloneProject(blank);
    if (tool === "line")
      pf.drawLine(expected, "frame-0", "base", 2, 2, 9, 9, 1);
    else if (tool === "rectangle")
      pf.drawRect(expected, "frame-0", "base", 2, 2, 8, 8, 1, filled);
    else pf.drawEllipse(expected, "frame-0", "base", 2, 2, 8, 8, 1, filled);
    assert.deepEqual(
      await pixels(),
      Array.from(pf.renderFrame(expected, "frame-0").data),
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
  }
  await page.getByRole("button", { name: "fill", exact: true }).click();
  await stroke(0, 0, 0, 0);
  assert.ok((await pixels()).every((v) => v === 255));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "picker", exact: true }).click();
  await stroke(0, 0, 0, 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Color 0", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("examples/coin/coin.sprite.json"));
  await page.getByRole("button", { name: "Color 1", exact: true }).click();
  await page.getByRole("button", { name: "pencil", exact: true }).click();
  const original = await pixels();
  const coin = pf.fromDocument(
    JSON.parse(await readFile("examples/coin/coin.sprite.json", "utf8")),
  );
  assert.deepEqual(original, Array.from(pf.renderFrame(coin, "frame-0").data));
  async function stroke(x0: number, y0: number, x1: number, y1: number) {
    const b = (await canvas.boundingBox())!,
      z = b.width / 16;
    await page.mouse.move(b.x + (x0 + 0.5) * z, b.y + (y0 + 0.5) * z);
    await page.mouse.down();
    await page.mouse.move(b.x + (x1 + 0.5) * z, b.y + (y1 + 0.5) * z, {
      steps: 2,
    });
    await page.mouse.up();
  }
  await stroke(0, 0, 15, 0);
  let painted = await pixels();
  for (let x = 0; x < 16; x++) assert.equal(painted[x * 4 + 3], 255);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.deepEqual(await pixels(), original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.deepEqual(await pixels(), painted);
  await page.getByRole("button", { name: "eraser", exact: true }).click();
  await stroke(0, 0, 15, 0);
  for (let x = 0; x < 16; x++) assert.equal((await pixels())[x * 4 + 3], 0);
  await page
    .getByRole("button", { name: "Duplicate frame", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: /Select frame \d+/ }).count(),
    7,
  );
  await page.getByLabel("Previous onion", { exact: true }).check();
  assert.equal(await page.locator("[data-onion=previous]").count(), 1);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(180);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Add layer", exact: true }).click();
  await page.getByRole("button", { name: "Test name", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add color", exact: true }).click();
  await page.getByLabel("Hex RGBA", { exact: true }).fill("#ff0000ff");
  await page.getByRole("button", { name: "Apply hex", exact: true }).click();
  const savedEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = await savedEvent;
  await saved.saveAs("test-output/editor-saved.sprite.json");
  const savedProject = pf.fromDocument(
    JSON.parse(await readFile("test-output/editor-saved.sprite.json", "utf8")),
  );
  assert.equal(savedProject.frames.length, 7);
  assert.equal(savedProject.layers.length, 2);
  assert.deepEqual(savedProject.palette.at(-1), [255, 0, 0, 255]);
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("tests/fixtures/invalid.sprite.json"));
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /Palette index/);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("test-output/editor-saved.sprite.json"));
  await page
    .getByRole("button", { name: "Select frame 1", exact: true })
    .click();
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export frame PNG", exact: true })
    .click();
  await (await exported).saveAs("test-output/editor-frame.png");
  const decoded = await sharp("test-output/editor-frame.png")
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.deepEqual(
    Array.from(decoded),
    Array.from(
      pf.renderFrame(
        savedProject,
        savedProject.animations[0]!.frames[0]!.frameId,
      ).data,
    ),
  );

  const sheetDownloads: import("playwright-core").Download[] = [];
  const collect = (d: import("playwright-core").Download) =>
    sheetDownloads.push(d);
  page.on("download", collect);
  await page.getByRole("button", { name: "Export sheet", exact: true }).click();
  for (let i = 0; i < 50 && sheetDownloads.length < 2; i++)
    await page.waitForTimeout(100);
  assert.equal(sheetDownloads.length, 2);
  page.off("download", collect);
  for (const d of sheetDownloads)
    await d.saveAs(
      "test-output/browser-sheet" +
        (d.suggestedFilename().endsWith(".png") ? ".png" : ".json"),
    );
  const sheet = pf.renderSpriteSheet(savedProject, { columns: 3, padding: 1 });
  const decodedSheet = await sharp("test-output/browser-sheet.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(decodedSheet.info.width, sheet.raster.width);
  assert.equal(decodedSheet.info.height, sheet.raster.height);
  assert.deepEqual(
    Array.from(decodedSheet.data),
    Array.from(sheet.raster.data),
  );
  assert.deepEqual(
    JSON.parse(await readFile("test-output/browser-sheet.json", "utf8")),
    sheet.manifest,
  );
  await page.getByRole("button", { name: "pencil", exact: true }).click();
  await page.getByLabel("Zoom", { exact: true }).fill("8");
  const beforeCancel = await pixels(),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 28, box.y + 4);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await pixels(), beforeCancel);
  await stroke(0, 0, 3, 0);
  for (let x = 0; x < 4; x++) assert.equal((await pixels())[x * 4], 255);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.deepEqual(await pixels(), beforeCancel);
  await page.getByLabel("Zoom", { exact: true }).fill("32");
  const viewport = page.locator(".editor-viewport");
  const vb = (await viewport.boundingBox())!;
  const beforePan = await pixels();
  await page.keyboard.down("Space");
  await page.mouse.move(vb.x + 100, vb.y + 100);
  await page.mouse.down();
  await page.mouse.move(vb.x + 20, vb.y + 20);
  await page.mouse.up();
  await page.keyboard.up("Space");
  assert.deepEqual(await pixels(), beforePan);
  await page.getByLabel("Zoom", { exact: true }).fill("12");

  // Preserve the edited document, then exercise source/reference separation and structural history.
  await page
    .getByRole("button", { name: "Delete source frame", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /references/);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("button", { name: "Move later", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Select frame 2", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Remove entry", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: /Select frame \d+/ }).count(),
    6,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByLabel("Add existing frame", { exact: true })
    .selectOption("frame-0");
  assert.equal(
    await page.getByRole("button", { name: /Select frame \d+/ }).count(),
    8,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Test name", exact: true }).click();
  await page.getByRole("button", { name: "Lower layer", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Delete layer", exact: true }).click();
  assert.equal(await page.locator(".layer-row").count(), 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await page.locator(".layer-row").count(), 2);
  await page.getByRole("button", { name: "Add color", exact: true }).click();
  const colors = await page.locator(".editor-palette button").count();
  await page
    .getByRole("button", { name: "Remove unused color", exact: true })
    .click();
  assert.equal(
    await page.locator(".editor-palette button").count(),
    colors - 1,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await page.locator(".editor-palette button").count(), colors);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  // Variable durations, repeated frame references, nonlooping onion boundaries and hold-last-frame.
  const timed = pf.cloneProject(coin);
  timed.animations = [
    {
      name: "timed",
      loop: false,
      frames: [
        { frameId: "frame-0", durationMs: 50 },
        { frameId: "frame-0", durationMs: 100 },
        { frameId: "frame-2", durationMs: 150 },
      ],
    },
  ];
  await page.locator("input[type=file]").setInputFiles({
    name: "timed.sprite.json",
    mimeType: "application/json",
    buffer: Buffer.from(pf.serializeProject(timed)),
  });
  await page.waitForFunction(
    () =>
      (
        document.querySelector(
          'select[aria-label="Animation"]',
        ) as HTMLSelectElement
      )?.value === "timed",
  );
  await page.getByLabel("Previous onion", { exact: true }).check();
  await page.getByLabel("Next onion", { exact: true }).check();
  assert.equal(await page.locator("[data-onion=previous]").count(), 0);
  assert.equal(await page.locator("[data-onion=next]").count(), 1);
  const beforeOnion = await pixels();
  await page.getByLabel("Onion opacity", { exact: true }).fill("0.7");
  assert.deepEqual(await pixels(), beforeOnion);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Select frame 3", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator("[data-onion=next]").count(), 0);
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("test-output/animated-coin.sprite.json"));
  await page
    .getByLabel("Animation", { exact: true })
    .selectOption("sparkle-spin");
  assert.equal(
    await page.getByRole("button", { name: /Select frame \d+/ }).count(),
    3,
  );
  await page
    .getByRole("button", { name: "Select frame 3", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Frame duration", { exact: true }).inputValue(),
    "250",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve("test-output/editor-saved.sprite.json"));
  await page.locator(".properties").evaluate((e) => (e.scrollTop = 0));
  await page.getByRole("button", { name: "eraser", exact: true }).focus();
  await page.keyboard.press("Space");
  assert.equal(
    await page
      .getByRole("button", { name: "eraser", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.screenshot({
    path: "test-output/editor-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-output/editor-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.goto("http://127.0.0.1:5173/phaser.html");
  await page.getByText("Loaded 6 frames · 16 × 16 · spin at 8 FPS").waitFor();
  const phaser = await page.evaluate(
    `(async()=>{const {game}=await import('/src/phaser.ts');const a=game.anims.get('spin');return {frames:game.textures.get('coin').frameTotal-1,duration:a.duration,repeat:a.repeat};})()`,
  );
  assert.deepEqual(phaser, { frames: 6, duration: 750, repeat: -1 });
  assert.deepEqual(errors, []);
  console.log(
    "Editor smoke passed: DPR2 pixels, interpolated pencil, erase, undo/redo, duplicate, onion, playback, layer/color edits, saved JSON, invalid import, reopen, PNG/core equivalence, mobile overflow.",
  );
} finally {
  await browser.close();
}
