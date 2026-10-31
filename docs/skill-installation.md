# Local skill installation

From the PixelForge checkout, install into an explicitly selected skills directory:

```sh
node .agents/skills/pixelforge-sprite-creator/scripts/install.mjs install --target /path/to/game/.agents/skills
node .agents/skills/pixelforge-sprite-creator/scripts/install.mjs verify --target /path/to/game/.agents/skills
```

Use quoted Windows paths such as `C:\games\my-game\.agents\skills`; Node runs without Bash. The installer copies every instruction, reference, helper, example and template. It performs no network requests and modifies no global host configuration. See agent-compatibility.md before selecting an optional user-global target; pass that directory explicitly.

Update with the same install command plus `--force`. Existing skills are protected by default. Installed-file receipts support integrity verification; unrelated extra files are preserved and a conflicting untracked path aborts update. Source and destination symlinks are rejected. Verify detects edited installed files. Keep custom edits separately before updating.

Uninstall with `uninstall --target SAME_DIRECTORY`. Changed files stop removal unless `--force` is supplied. Only receipted files are deleted; unrelated files and empty directories remain. Installation is not a filesystem transaction under disk failure; rerun verify after interrupted writes and restore from the canonical source.

Manual installation: copy the complete `pixelforge-sprite-creator` directory into the target `.agents/skills/` using your file manager. Check SKILL.md and all subdirectories. Manual copies have no installer receipt: remove that named directory manually after preserving custom files, or use a separate destination for managed installation. Never overwrite another skill's files to work around a conflict.

Install CLI separately using the complete local tarball set described in release-checklist.md. Then from the game repository run the installed skill's `scripts/check-environment.mjs`. No public npm publication is implied.
