# Linux clean-build verification

The Linux gate was exercised locally in a disposable **Alpine 3.24.3 x86-64 guest**, kernel6.18.58-0-virt, with **Node 24.22.1 and npm 11.12.1**. It uses an actual Linux kernel and ext4 filesystem, not Windows/Cygwin path emulation. QEMU uses the already available Windows Hypervisor accelerator,2vCPUs and2GiB guest RAM. No WSL installation, Windows feature change, global emulator installation, commit or push is required.

## Inputs and isolation

The working-tree snapshot contains250 source files and excludes node_modules, dist, release and test-output through the repository's tracked/unignored file inventory. It was transferred as a gzip tar into a new directory on the guest virtual disk. The runner explicitly checks that node_modules and dist do not exist before installation. Snapshot byte comparisons confirmed that a concurrent external commit did not change the files being verified.

Final snapshot SHA256: `a4069c3ce7c832d13dfde391dc4ec7b92898f0f6a33456eb4c1e1ed90e9379b3`.

The VM tools/images were kept under ignored test-output/linux-vm. QEMU's Windows provider is linked from the [upstream download page](https://www.qemu.org/download/#windows). Its installer was extracted without running setup; the executable reports11.1.0. Archive extraction used7-Zip26.05 files read from its MSI cabinet without installing it. The [Alpine 3.24.3 virtual image](https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86_64/alpine-virt-3.24.3-x86_64.iso) matched its published SHA256, `cdc1bc0efc64d8d611bf3733f54868172a545888dfd726f518bf279bcb0ff1af`. Local input hashes document exact bytes, not publisher signatures or provenance attestations.

Inside the disposable guest, Node/npm/Git and a standard font were installed through Alpine's package repositories. The font supports Sharp's SVG contact labels. The host shared only a read-only source archive through a loopback HTTP endpoint; test logs were returned to a fixed ignored output path. No source directory was mounted writable into the guest.

## Commands

In the fresh guest source directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run pack:release
npm run verify:release
npm run test:skill
```

The first snapshot passed69tests and all build/pack/integrity/7skill checks. Final API audit then corrected StaticBody detection (dynamic bodies expose the same update method) and added an atomic rejection regression. A second fresh snapshot passed the resulting70-test suite, both builds, packaging, checksums and7skill checks; final collected results are recorded in v0.5-verification.md and the acceptance matrix.

## Scope

Linux browser consumers were not run in this guest; the independent Phaser 3.90.0/4.2.1 TypeScript/WebGL consumers and original three browser suites were executed on Windows. The prepared Windows/Ubuntu/macOS GitHub workflow has not been pushed or executed by this agent. Alpine execution proves the requested clean Linux build path; it is not evidence that Ubuntu/macOS CI passed. macOS remains unverified. Build annotation/directive and Phaser chunk-size warnings are nonfatal and retained in the logs.

Final run exited0 and shut down the guest. The raw log contains18,579bytes, SHA256 e67babe20d2913ea5836d817436e5d18e38156a946ad4d2324545e62c103da84. An automatic safety review blocked deletion of the ignored VM tools/disk, so they remain local; nothing was installed globally.
