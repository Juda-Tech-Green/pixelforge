# Agent compatibility

Primary portable destination: `<game>/.agents/skills/pixelforge-sprite-creator/`. The common request is “Use the pixelforge-sprite-creator skill.” Helpers need Node22.12+ and the locally installed CLI/package graph.

| Host | Documented local/global location | Explicit invocation | Verification here |
| --- | --- | --- | --- |
| Codex | `.agents/skills/`; user `~/.agents/skills/` | `$pixelforge-sprite-creator` or skill selector; ordinary explicit request | Local skill appears in this session's host-provided skill catalog. Installed file/metadata verified externally; separate autonomous task session not run. |
| OpenCode | `.agents/skills/` or `.opencode/skills/`; user `~/.agents/skills/` or `~/.config/opencode/skills/` | Explicit request naming the skill; native skill tool loads it | Files/frontmatter verified; OpenCode session behavior not tested. |
| Antigravity | `.agents/skills/`; App/IDE `~/.gemini/config/skills/`, CLI `~/.gemini/antigravity-cli/skills/` | `/pixelforge-sprite-creator` where supported, or explicit request | Files/frontmatter verified; Antigravity session behavior not tested. |

Codex exposes skills progressively and supports explicit or description-based selection. Repository scanning follows ancestors to the root. Official guidance: [Build skills](https://learn.chatgpt.com/docs/build-skills).

OpenCode discovers compatible folders and loads them on demand; permissions may suppress access. Official guidance: [Agent Skills](https://docs.opencode.ai/docs/skills/).

Antigravity documents surface-specific global paths and CLI slash conversion. Do not assume its App, IDE and CLI have identical global directories. Official guidance: [Agent skills](https://antigravity.google/docs/skills).

Frontmatter follows the published [Agent Skills specification](https://agentskills.io/specification). Sources checked during Phase4 implementation; host versions/configurations can change. Windows Node toolchain and Chrome were executed; macOS/Linux code paths are designed portably but have not been executed here.

Manual agent acceptance: install into a fresh game repo, open a new host session and request the reference-guided prompt without pasting the workflow. Record host/version, whether the skill was listed/loaded, commands/artifacts, visual review and actual game verification. Then repeat with explicit invocation. Retain transcripts separately from toolchain reports. Passing file discovery or the independent Phaser test is not proof of autonomous activation.
