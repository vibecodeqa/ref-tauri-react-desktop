# Reference Tauri React Desktop

Product-neutral reference implementation for the VibeCode QA
[Tauri React Desktop charter](https://vibecodeqa.online/docs/standards/stacks/tauri-react-desktop/),
composed with the published
[React SPA v1](https://vibecodeqa.online/standards/react-spa/v1/),
[TypeScript v1](https://vibecodeqa.online/standards/typescript/v1/),
[Testing v1](https://vibecodeqa.online/standards/testing/v1/) and
[Security v1](https://vibecodeqa.online/standards/security/v1/) rubrics.

> `tauri-react-desktop` is a **charter, not a versioned rubric**. Its status in the VCQA
> registry is `planned` and its `standardUrl` is `null`: the scope, composition and
> detection signals are recorded, but there are no numbered candidate rules yet. This repo
> is what the charter looks like when someone actually builds it, and it is judged today
> against the four published cross-cutting rubrics above.

## Official starter first

If you only need a new Tauri app, start with the official path:

- [Tauri v2: Create a Project](https://v2.tauri.app/start/create-project/)
- [Tauri v2: Prerequisites](https://v2.tauri.app/start/prerequisites/)

This repo is not a replacement for `create-tauri-app`. It is a VCQA reference fixture that
shows how the desktop shape is judged once a capability policy, a validated command
boundary, two test layers and CI evidence are required.

## What it actually does

A "note vault": a small React UI that saves, lists and opens short text notes. Every note
lives in one directory chosen by Rust, and the webview never sees a path.

The interesting part is the boundary, not the feature:

| Layer | File | Responsibility |
| --- | --- | --- |
| Typed contract | `src/ipc/contract.ts` | The closed set of command names, the wire types, and the validation rules — mirrored in Rust |
| IPC client | `src/ipc/client.ts` | The only place `invoke` is called; fast local validation, error normalisation |
| UI | `src/components/NoteVault.tsx` | Injectable client, so tests run with no Tauri runtime |
| Tauri shell | `src-tauri/src/lib.rs` | Three `#[tauri::command]`s; picks the vault root, delegates |
| Trusted boundary | `src-tauri/src/vault.rs` | All validation and all filesystem access; no Tauri types, so it is unit-testable |
| Capability policy | `src-tauri/capabilities/default.json` | Explicit, narrow `core:` permissions for the `main` window |
| Policy check | `scripts/validate-desktop-config.mjs` | Fails CI if the capability surface, CSP or plugin set widens |

## Security posture

Read `SECURITY.md` for the full statement. The short version:

- **No `fs`, `shell`, `http`, `process`, `dialog`, `clipboard`, `updater`, `os` or
  `global-shortcut` plugin is a dependency.** There is no plugin command the frontend
  could call to reach the host, whatever the frontend code does — the capability file
  cannot grant what is not compiled in, and the validator refuses those families anyway.
- The capability file lists individual permissions rather than the `core:default`
  aggregate, and `pnpm validate:desktop` rejects `core:default` explicitly.
- Note names must match `^[a-z0-9][a-z0-9._-]{0,63}$`, `..` is rejected separately, and the
  resolved path must be a direct child of the vault root. Bodies are capped at 8 KiB and
  reject control characters. `cargo test` proves each of those refusals.
- Frontend validation is a UX affordance only. Rust re-validates everything; it is the
  enforcement point.
- CSP is restrictive, the custom asset protocol is disabled, `withGlobalTauri` is off and
  prototype freezing is on.

### Secure storage

This template deliberately stores **no secrets**. Notes are plain text in the OS
application-data directory — that is the honest description, and it is not "secure
storage". If you fork this and need credentials, keep them in the OS keychain from the
Rust side (`tauri-plugin-stronghold`, `keyring`, …) and never hand them back to the
webview.

## Local development

Prerequisites, per the [Tauri v2 docs](https://v2.tauri.app/start/prerequisites/):

| Platform | Needs |
| --- | --- |
| All | Rust stable (via `rustup`), Node 22–26, pnpm 10 |
| macOS | Xcode Command Line Tools (`xcode-select --install`) |
| Windows | Microsoft C++ Build Tools, WebView2 runtime (bundled on Windows 11) |
| Linux (Debian/Ubuntu) | `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf` |

```bash
corepack enable
pnpm install

pnpm lint              # biome
pnpm typecheck         # tsc --noEmit
pnpm test              # vitest (frontend + config policy)
pnpm validate:desktop  # capability / tauri.conf.json policy check
pnpm build             # production frontend bundle

cargo fmt   --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml

pnpm desktop:dev       # runs the desktop shell against the Vite dev server
```

`cargo` commands need `dist/` to already exist, because `build.rs` calls
`tauri_build::build()`, which resolves `build.frontendDist`. Run `pnpm build` first in a
clean checkout.

### Build configuration: dev, preview, production

Configuration is split by Vite `mode` in `vite.config.ts`, not by ad-hoc environment
sniffing:

| Mode | Command | Shape |
| --- | --- | --- |
| `development` | `pnpm dev` / `pnpm desktop:dev` | unminified, sourcemaps, dev server on `127.0.0.1:5202` with `strictPort` |
| `preview` | `pnpm build:preview` then `pnpm preview` | production-shaped bundle with sourcemaps retained |
| `production` | `pnpm build` (also the `beforeBuildCommand` of `tauri build`) | minified, no sourcemaps |

The dev port is fixed on purpose: `build.devUrl` in `tauri.conf.json` points at exactly
that origin, and `pnpm validate:desktop` fails if the two ever drift apart.

Only `VITE_*` and `TAURI_ENV_*` are inlined into the client bundle (`envPrefix`). Anything
else in the process environment stays on the Rust side. See `.env.example`.

## Tests

Two layers, both required, both in CI:

- **Frontend (`pnpm test`, Vitest + Testing Library, 41 tests)** — contract validation
  rules, the IPC client's refusal to send invalid input, the UI's save/list/open flows, and
  the capability policy validator against both the real committed config and deliberately
  broken clones of it.
- **Rust (`cargo test`, 16 tests)** — the command boundary: traversal names, separators and
  absolute paths, oversized names and bodies, control characters, byte-vs-character
  measurement, "nothing was written outside the root", and the read/list round trip.

There is no end-to-end layer. Driving a real packaged window needs a display server and a
WebDriver harness; that gap is stated in `docs/vcqa-report.md` rather than papered over.

## Packaging and release evidence

CI runs a **package/build check, not a release**:
`pnpm tauri build --no-bundle --ci` on `ubuntu-latest`. That compiles the real release
binary through the full Tauri build pipeline (config validation, capability codegen,
frontend embedding) and then skips the `.deb`/`.AppImage` bundlers. The workflow records
the binary's size, `file` type and SHA-256 in the job summary as the platform artifact
evidence.

To be explicit: **no bundle or installer is produced, and nothing is signed, notarised or
published.** A real product would add a separate, tag-triggered release workflow with
per-platform signing identities held as repository secrets; this fixture deliberately has
no release channel. If you want a local bundle, run `pnpm desktop:build` on your own
machine — `bundle.targets` in `tauri.conf.json` is already configured.

## CI

`.github/workflows/ci.yml`, two jobs, `permissions: contents: read`, third-party actions
pinned by commit SHA:

- **web** — `pnpm install --frozen-lockfile`, lint, typecheck, unit tests, capability/config
  validation, preview build, production build.
- **desktop** — Linux WebKit/GTK prerequisites, Rust stable, cargo cache, frontend build,
  `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, capability/config
  validation, and the Linux package/build check.

## VCQA evidence

The tracked report lives at [`docs/vcqa-report.md`](docs/vcqa-report.md).

## Standards target

| Standard | Status | Role |
| --- | --- | --- |
| [Tauri React Desktop](https://vibecodeqa.online/docs/standards/stacks/tauri-react-desktop/) | charter (`planned`, no rubric) | Command/capability boundaries, secure storage posture, packaging, typed contracts |
| [React SPA v1](https://vibecodeqa.online/standards/react-spa/v1/) | published | Static client-rendered frontend shape |
| [TypeScript v1](https://vibecodeqa.online/standards/typescript/v1/) | published | Strict flags, typed-and-validated boundaries |
| [Testing v1](https://vibecodeqa.online/standards/testing/v1/) | published | Test layers and CI evidence |
| [Security v1](https://vibecodeqa.online/standards/security/v1/) | published | Input validation, secrets, least-privilege CI |

The standard is the source of truth. This repo is a forkable implementation example.

## License

MIT — see `LICENSE`.
