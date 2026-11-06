import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  audioPresetNames,
  createSound,
  renderSound,
} from "@pixelforge/audio-core";

const root = resolve(".").replaceAll("\\", "/");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PIXELFORGE_CHROME ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const report: unknown[] = [];
await mkdir("test-output/audio-browser", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/audio.html");
  await page.getByRole("button", { name: "Play sound", exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>(".audio-play")?.disabled,
  );
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.getByRole("button", { name: "Play sound", exact: true }).click();
  await page.getByRole("button", { name: "Replay", exact: true }).waitFor();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  for (const preset of audioPresetNames) {
    const project = createSound(preset, preset),
      node = renderSound(project);
    const browserPcm = await page.evaluate(
      async ({ root, project }) => {
        const module = await import(
          `/@fs/${root}/packages/audio-core/src/index.ts`
        );
        return Array.from(module.renderSound(project).pcm) as number[];
      },
      { root, project },
    );
    assert.equal(browserPcm.length, node.pcm.length);
    let maximumDifference = 0;
    for (let i = 0; i < browserPcm.length; i++)
      maximumDifference = Math.max(
        maximumDifference,
        Math.abs(browserPcm[i]! - node.pcm[i]!),
      );
    assert.ok(
      maximumDifference < 1e-10,
      `${preset}: browser/Node delta ${maximumDifference}`,
    );
    await page
      .getByRole("button", { name: preset.replaceAll("-", " "), exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>(".audio-play")?.disabled,
    );
    assert.equal(await page.getByRole("alert").count(), 0);
    report.push({
      preset,
      maximumPcmDifference: maximumDifference,
      samples: node.pcm.length,
    });
  }
  await page.getByRole("button", { name: "laser shot", exact: true }).click();
  await page.getByLabel("Start frequency (Hz)", { exact: true }).fill("800");
  await page.getByLabel("Start frequency (Hz)", { exact: true }).blur();
  const dialog = page.waitForEvent("dialog");
  const replace = page
    .getByRole("button", { name: "gunshot", exact: true })
    .click();
  (await dialog).dismiss();
  await replace;
  assert.equal(
    await page.getByLabel("Start frequency (Hz)", { exact: true }).inputValue(),
    "800",
  );
  await page
    .locator("summary")
    .filter({ hasText: /^Envelope$/ })
    .click();
  const envelope = page.getByRole("textbox", { name: "Envelope", exact: true });
  const draft = JSON.parse(await envelope.inputValue());
  draft.points[1].timeMs = 5;
  const text = JSON.stringify(draft, null, 2);
  await envelope.fill(text);
  await page.getByLabel("Gain", { exact: true }).fill("0.36");
  assert.equal(
    await envelope.inputValue(),
    text,
    "Unapplied envelope draft must survive gain edits",
  );
  await page
    .getByRole("button", { name: "Apply envelope", exact: true })
    .click();
  await page.getByRole("button", { name: "Add highpass", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>(".audio-play")?.disabled,
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Render WAV", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs("test-output/audio-browser/editor.wav");
  assert.equal(
    (await readFile("test-output/audio-browser/editor.wav"))
      .subarray(0, 4)
      .toString(),
    "RIFF",
  );
  const definitionEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  const definition = await definitionEvent;
  await definition.saveAs("test-output/audio-browser/editor.sound.json");
  await page.getByRole("button", { name: "New sound", exact: true }).click();
  await page
    .getByLabel("Import sound definition", { exact: true })
    .setInputFiles("test-output/audio-browser/editor.sound.json");
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>(".audio-play")?.disabled,
  );
  assert.equal(
    await page.getByLabel("Start frequency (Hz)", { exact: true }).inputValue(),
    "800",
  );
  await page.screenshot({
    path: "test-output/audio-browser/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-output/audio-browser/mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile horizontal overflow",
  );
  assert.ok(
    await page.locator(".audio-wave").evaluate((svg) => {
      const viewbox = (svg as SVGSVGElement).viewBox.baseVal;
      return svg.getBoundingClientRect().width / viewbox.width >= 0.95;
    }),
    "Mobile waveform must keep readable text scale",
  );
  const sampler = await browser.newPage();
  sampler.on("pageerror", (e) => errors.push(e.message));
  await sampler.goto("http://127.0.0.1:5173/audio-game.html");
  await sampler.waitForFunction(() =>
    document
      .querySelector('[role="status"]')
      ?.textContent?.includes("all five WAV assets loaded"),
  );
  for (const preset of audioPresetNames) {
    await sampler
      .getByRole("button", { name: preset.replaceAll("-", " "), exact: true })
      .click();
    await sampler.waitForFunction(
      (name) =>
        document.querySelector('[role="status"]')?.textContent ===
        `Playing ${name}`,
      preset,
    );
    assert.equal(
      await sampler.getByRole("status").textContent(),
      `Playing ${preset}`,
    );
  }
  await sampler.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "test-output/audio-browser/results.json",
    JSON.stringify(
      {
        browser: browser.version(),
        node: process.version,
        comparisons: report,
        pageErrors: errors,
        controls: [
          "play",
          "stop",
          "presets",
          "frequency",
          "add-effect",
          "wav-download",
          "definition-roundtrip",
          "dirty-discard-cancel",
          "draft-preservation",
          "mobile-axis-scale",
        ],
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
