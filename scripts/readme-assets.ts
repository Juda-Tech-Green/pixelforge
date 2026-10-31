// Documentation assets only. Run: npx tsx --conditions=development scripts/readme-assets.ts
// Add --capture-editor while npm run dev is running to refresh the real UI screenshot.
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  fromDocument,
  renderFrame,
  type Project,
} from "../packages/core/src/index.js";

const output = "docs/assets";
await mkdir(output, { recursive: true });
const samples = await Promise.all(
  [
    [
      "examples/coin/coin.sprite.json",
      "spin",
      "01 / AMBER COIN",
      "16 × 16 · six-frame spin",
      10,
    ],
    [
      "examples/character/character.sprite.json",
      "walk",
      "02 / BLUE CAPE SCOUT",
      "32 × 32 · four-frame walk",
      5,
    ],
    [
      "examples/reference-scout/scout.sprite.json",
      "walk",
      "03 / REFERENCE STUDY",
      "48 × 48 · editable approximation",
      3,
    ],
  ].map(async ([path, animation, title, caption, scale]) => ({
    project: fromDocument(JSON.parse(await readFile(String(path), "utf8"))),
    animation: String(animation),
    title: String(title),
    caption: String(caption),
    scale: Number(scale),
  })),
);

function pixels(
  project: Project,
  animation: string,
  elapsed: number,
  x: number,
  scale: number,
) {
  const sequence = project.animations.find(
    (entry) => entry.name === animation,
  )!;
  const total = sequence.frames.reduce(
    (sum, entry) => sum + entry.durationMs,
    0,
  );
  let remaining = elapsed % total;
  const entry = sequence.frames.find((frame) => {
    if (remaining < frame.durationMs) return true;
    remaining -= frame.durationMs;
    return false;
  })!;
  const raster = renderFrame(project, entry.frameId);
  const left = x + (320 - raster.width * scale) / 2;
  const top = 76 + (160 - raster.height * scale) / 2;
  const rects: string[] = [];
  for (let row = 0; row < raster.height; row++) {
    for (let col = 0; col < raster.width; col++) {
      const offset = (row * raster.width + col) * 4;
      const [r, g, b, a] = raster.data.subarray(offset, offset + 4);
      if (a)
        rects.push(
          `<rect x="${left + col * scale}" y="${top + row * scale}" width="${scale}" height="${scale}" fill="rgb(${r},${g},${b})" opacity="${a! / 255}"/>`,
        );
    }
  }
  return rects.join("");
}

function showcase(elapsed: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="300" viewBox="0 0 960 300">
    <rect width="960" height="300" fill="#14181c"/>
    <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#20262c" stroke-width="1"/></pattern></defs>
    <rect width="960" height="300" fill="url(#grid)"/>
    <path d="M320 28V272M640 28V272" stroke="#343d46"/>
    <g font-family="Segoe UI,Arial,sans-serif">
      ${samples
        .map(
          (
            sample,
            index,
          ) => `<text x="${index * 320 + 24}" y="44" fill="#b0db88" font-size="12" font-weight="600" letter-spacing="1.2">${sample.title}</text>
        <g shape-rendering="crispEdges">${pixels(sample.project, sample.animation, elapsed, index * 320, sample.scale)}</g>
        <text x="${index * 320 + 160}" y="268" text-anchor="middle" fill="#b9c4ce" font-size="13">${sample.caption}</text>`,
        )
        .join("")}
    </g>
  </svg>`;
}

const frames: Buffer[] = [];
for (let elapsed = 0; elapsed < 3000; elapsed += 50) {
  frames.push(
    await sharp(Buffer.from(showcase(elapsed)))
      .ensureAlpha()
      .raw()
      .toBuffer(),
  );
}
await sharp(Buffer.concat(frames), {
  raw: {
    width: 960,
    height: 300 * frames.length,
    channels: 4,
    pageHeight: 300,
  },
})
  .gif({
    loop: 0,
    delay: frames.map(() => 50),
    colours: 128,
    dither: 0,
    effort: 3,
  })
  .toFile(`${output}/sprite-showcase.gif`);

if (process.argv.includes("--capture-editor")) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath:
      process.env.PIXELFORGE_CHROME ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
    await page
      .locator("input[type=file]")
      .setInputFiles(resolve("examples/character/character.sprite.json"));
    await page.getByText("Blue cape scout", { exact: true }).waitFor();
    await page.getByLabel("Zoom", { exact: true }).fill("10");
    await page.getByRole("button", { name: "pencil", exact: true }).click();
    await page.locator("header").click({ position: { x: 400, y: 20 } });
    await page.screenshot({ path: `${output}/editor.png` });
    await page.close();
  } finally {
    await browser.close();
  }
}
console.log(`README assets written to ${output}`);
