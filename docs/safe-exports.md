# Safe managed bundle updates

```sh
pixelforge export hero.sprite.json --format phaser --layout atlas --name hero --output public/assets/hero
pixelforge export hero.sprite.json --format phaser --layout atlas --name hero --output public/assets/hero --replace
```

Default export refuses existing directories. --replace accepts only a PixelForge directory with a valid `.pixelforge-bundle.json` ownership receipt matching manifest filenames and SHA256 hashes. Unexpected files, modified owned files, links and unsafe paths are rejected. Preserve and review such files; do not force deletion. Legacy0.4 exports and browser downloads have no receipt: use a separate new path, verify integration, and handle old files explicitly through the project's normal maintenance process.

The exporter validates the source, assembles/encodes the new bundle, creates an exclusive sibling lock, and stages all new files beside the destination. Written bytes are hash-verified before publication. Existing managed bytes are rechecked, renamed to a sibling backup, and staging is renamed into place. If publication fails while observed, rollback renames the backup back. Tests inject both halfway staging failures and final publish failures, preserving the previous PNG and metadata.

This is **not** a filesystem transaction. On Windows and POSIX, replacing a nonempty directory requires two renames: readers may briefly see the path absent. Same-filesystem sibling staging avoids cross-volume rename. There is no fsync/power-loss guarantee or protection against a concurrently malicious filesystem actor changing paths between checks. Concurrent cooperating exports are serialized by an exclusive `OUTPUT.pixelforge.lock`; an existing lock causes refusal rather than waiting indefinitely.

An interrupted process can leave `.pixelforge-UUID.tmp`, `.pixelforge-UUID.backup` and the sibling lock. Check that no exporter process is active, inspect/verify the candidate and old backup, restore the backup to the intended **absent** destination if necessary, and only then remove confirmed stale lock/staging files explicitly. Never delete a backup without reviewing whether it is the last valid bundle. On a failed rollback, the error names the retained backup; automatic cleanup never deletes that previous valid bundle. Individual asset builds use these same semantics; a manifest build is not an all-assets transaction.

Generated bundle ownership is local integrity metadata, not a publisher signature. It covers bundle.json, README, texture, atlas if present, animation and game JSON. Editable source and batch files belong outside output directories. `build-assets` also places freshness/runtime-key fields in the receipt without adding unmanaged files to the bundle.
