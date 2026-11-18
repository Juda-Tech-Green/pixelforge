import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";

// Retain these tiny artifacts so another agent can inspect the exact outputs.
const directory = mkdtempSync(join(tmpdir(), "pixelforge-v08-"));
const source = join(directory, "tiny.sprite.json");
const invalid = join(directory, "invalid.rigAnimation.json");
const preview = join(directory, "preview.png"), sheet = join(directory, "contact.png");
const document = {
  version: "1.0", name: "Tiny", width: 2, height: 2,
  palette: [[0, 0, 0, 0], [255, 0, 0, 255]],
  layers: [{ id: "base", name: "Base", visible: true }],
  frames: [{ id: "a", layers: { base: [1, 0, 0, 0] } }, { id: "b", layers: { base: [0, 0, 0, 1] } }],
  animations: [{ name: "blink", loop: true, frames: [{ frameId: "a", durationMs: 80 }, { frameId: "b", durationMs: 120 }] }],
};
const original = JSON.stringify(document, null, 2) + "\n";
writeFileSync(source, original);
writeFileSync(invalid, JSON.stringify({ id: "walk", loop: true, frames: 2, durationMs: 200,
  keys: [{ time: 0, pose: "rest" }], contacts: [{ id: "left.foot", root: "hip", middle: "knee", end: "foot", position: [0, 0], start: 0, endTime: 1 }] }));
const invalidOriginal = readFileSync(invalid, "utf8");
function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", resolve("packages/cli/src/index.ts"), ...args], { encoding: "utf8" });
  return { ...result, data: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
}
test("runtime capabilities expose commands, schemas, flags and limits", () => {
  const result = cli("capabilities", "--json");
  expect(result.status, result.stderr).toBe(0);
  expect(result.data.runtimeVersion).toBe("0.8.2");
  expect(result.data.commands.find((c: { name: string }) => c.name === "preview").flags).toContainEqual(expect.objectContaining({ flags: "--out <png>", required: true }));
  expect(result.data.operations.length).toBeGreaterThan(0);
  expect(result.data.rendering.previewLimits.maxScale).toBe(16);
  expect(cli("capabilities", "--schema", "rig").data.required).toContain("id");
});
test("doctor returns actionable stable contact identifier diagnostics", () => {
  const result = cli("doctor", invalid, "--json");
  expect(result.status).toBe(1);
  expect(result.data.diagnostics).toContainEqual(expect.objectContaining({ code: "PF_CONTACT_ID_INVALID", path: '$["contacts"][0]["id"]', automaticRepair: false, suggestion: expect.stringContaining("left_foot") }));
  expect(cli("doctor", source, "--json").data.ok).toBe(true);
});
test("tiny sprite preview preserves RGBA and uses nearest-neighbor scaling", async () => {
  const result = cli("preview", source, "--out", preview, "--scale", "4", "--json");
  expect(result.status, result.stderr).toBe(0);
  const image = await sharp(preview).raw().toBuffer({ resolveWithObject: true });
  expect([image.info.width, image.info.height]).toEqual([8, 8]);
  expect([...image.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  expect([...image.data.subarray(12, 16)]).toEqual([255, 0, 0, 255]);
  expect(image.data[19]).toBe(0);
  expect(cli("preview", source, "--out", preview, "--json").status).toBe(1);
  expect(cli("preview", source, "--out", source, "--force").status).toBe(1);
});
test("animation contact sheet preserves frame ordering, dimensions and timing", async () => {
  const result = cli("preview", source, "--contact-sheet", "--animation", "blink", "--columns", "2", "--out", sheet, "--json");
  expect(result.status, result.stderr).toBe(0);
  const map = JSON.parse(readFileSync(sheet.replace(".png", ".contact.json"), "utf8"));
  expect(map.cells.map((c: { frameId: string; durationMs: number }) => [c.frameId, c.durationMs])).toEqual([["a", 80], ["b", 120]]);
  const image = await sharp(sheet).metadata();
  expect([image.width, image.height]).toEqual([map.width, map.height]);
});
test("inspection and preview keep valid and invalid source bytes unchanged", () => {
  expect(readFileSync(source, "utf8")).toBe(original);
  expect(readFileSync(invalid, "utf8")).toBe(invalidOriginal);
  console.log(JSON.stringify({ directory, source, invalid, preview, sheet }));
});
