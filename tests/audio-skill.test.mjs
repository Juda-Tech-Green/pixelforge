import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { manageSkill } from "../.agents/skills/pixelforge-audio-creator/scripts/install.mjs";
test("portable audio skill installs, verifies, protects user changes and rejects missing target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pf-audio-skill-"));
  try {
    await assert.rejects(manageSkill("install", undefined), /target/);
    const installed = await manageSkill("install", dir);
    await manageSkill("verify", dir);
    const body = await readFile(join(installed.path, "SKILL.md"), "utf8");
    assert.match(body, /name: pixelforge-audio-creator/);
    for (const match of body.matchAll(/\]\((references\/[^)]+)\)/g))
      await readFile(resolve(installed.path, match[1]));
    const path = join(installed.path, "examples/laser-edit.ops.json");
    await writeFile(path, "user changes");
    await assert.rejects(manageSkill("verify", dir), /changed/);
    await assert.rejects(manageSkill("uninstall", dir), /changed/);
    assert.equal(await readFile(path, "utf8"), "user changes");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
