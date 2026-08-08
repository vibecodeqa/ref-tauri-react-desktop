# VCQA Report

Score: **98/100** (grade **A**)

| | |
| --- | --- |
| Scanner | `@vibecodeqa/cli@0.54.4` (`npx @vibecodeqa/cli@0.54.4 --markdown`) |
| Run date | 2026-08-09 |
| Assessed commit | [`40994372b45990a96eb6440e7ae985136f164685`](https://github.com/vibecodeqa/ref-tauri-react-desktop/commit/40994372b45990a96eb6440e7ae985136f164685) |
| CI run | [Actions run 31281114952](https://github.com/vibecodeqa/ref-tauri-react-desktop/actions/runs/31281114952) — conclusion `success`, 2026-08-08 (UTC) |
| Stack detected | react / typescript |

The commit above is the exact tree that was first scanned. This report file was added in
the following commit, which was then re-scanned to the same score.

### Verification log

| Commit | CI run | Scanner result |
| --- | --- | --- |
| [`4099437`](https://github.com/vibecodeqa/ref-tauri-react-desktop/commit/40994372b45990a96eb6440e7ae985136f164685) | [31281114952](https://github.com/vibecodeqa/ref-tauri-react-desktop/actions/runs/31281114952) `success` | 98/100 A |
| [`96d0081`](https://github.com/vibecodeqa/ref-tauri-react-desktop/commit/96d0081dbe5d06017bbabce4eacf39b2097ffde6) — adds this document | [31281243502](https://github.com/vibecodeqa/ref-tauri-react-desktop/actions/runs/31281243502) `success` | 98/100 A, unchanged |

`96d0081` is the commit the standards catalog should record as `assessedCommit`. Any commit
after it changes only this verification log.

## Standards assessed against

The primary standard for this repo is a **charter, not a versioned rubric**:

- [Tauri React Desktop](https://vibecodeqa.online/docs/standards/stacks/tauri-react-desktop/)
  — status `planned`, `standardUrl: null`, maturity `draft-charter`. Scope, composition,
  detection signals and the intended rule surface are recorded, but there are no numbered
  candidate rules yet, so **nothing in this repo is judged against a Tauri rubric today**.
  What follows is an implementation of the charter's stated concerns, evidenced so that it
  can be re-judged once rules exist.

The published rubrics that do apply:

- [React SPA v1](https://vibecodeqa.online/standards/react-spa/v1/) — Vite + React 19
  client-rendered frontend, static `dist/` output, no server of its own, no SSR framework.
- [TypeScript v1](https://vibecodeqa.online/standards/typescript/v1/) — `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `noImplicitOverride`; typed-and-validated IPC boundary; zero `any`.
- [Testing v1](https://vibecodeqa.online/standards/testing/v1/) — two enforced layers
  (50 Vitest tests, 16 `cargo test` tests) plus coverage thresholds, all gated in CI.
- [Security v1](https://vibecodeqa.online/standards/security/v1/) — input validation at the
  trust boundary, no committed secrets, restrictive CSP, least-privilege workflow
  permissions, SHA-pinned third-party actions.

The resolver agrees. `standards/resolve.mjs` on this repo returns archetype `react-spa@v1`,
cross-cutting `typescript@v1`, `security@v1`, `testing@v1`, and the repo recipe
`tauri-react-desktop [PLANNED]`.

## Scores by category

| Category | Score | Weight |
| --- | --- | --- |
| Foundations | 100/100 | 23 |
| Quality | 99/100 | 30 |
| Testing | 85/100 | 13 |
| Security | 100/100 | 16 |
| Architecture | 100/100 | 9 |
| Other | 99/100 | 5 |
| LLM Readiness | 100/100 | 9 |

23 of the 27 checks that ran are at 100. The four that are not: `docs` 98,
`best-practices` 94, `testing` 85, and `dead-code` 99 (advisory, excluded from the score).

## Desktop-specific evidence

The charter's five concerns, and where each is actually demonstrated:

**Tauri command/capability boundaries.**
`src-tauri/capabilities/default.json` is committed and grants ten individually named
`core:` permissions to the `main` window — not the `core:default` aggregate.
`scripts/validate-desktop-config.mjs` fails the build if a `fs:`, `shell:`, `http:`,
`process:`, `dialog:`, `updater:`, `clipboard-manager:`, `global-shortcut:`, `os:`,
`autostart:`, `deep-link:`, `store:`, `upload:`, `websocket:`, `notification:` or
`persisted-scope:` permission appears, if `core:default` is used, if a capability names a
window that `tauri.conf.json` does not declare, if a remote capability appears, if the CSP
gains `unsafe-eval`/`unsafe-inline`/`*`, if the asset protocol is re-enabled, if
`withGlobalTauri` is turned on, if `build.devUrl` drifts from the Vite dev port, or if a
denied `tauri-plugin-*` crate reaches `Cargo.toml`. Those refusals are themselves tested in
`tests/integration/desktop-config.integration.test.ts` against deliberately broken clones
of the real config.

Backing that policy: **no filesystem, shell, HTTP, process, dialog, clipboard, updater or
global-shortcut plugin is a dependency of the shell at all** (`src-tauri/Cargo.toml`), so
there is no plugin command a compromised frontend could reach for regardless of what the
capability file said.

**Input validation at the trusted boundary.**
`src-tauri/src/vault.rs` holds every validation rule and every filesystem call, and imports
no Tauri types, so `cargo test` exercises it with no display server. Note names must match
`^[a-z0-9][a-z0-9._-]{0,63}$`; `..` is rejected by a separate check kept as defence in
depth; the resolved path must be a direct child of the vault root and must contain no
`ParentDir` component. Bodies are capped at 8 KiB **measured in bytes** and reject control
characters other than tab/CR/LF. 16 Rust tests cover traversal, separators, absolute paths,
`~` expansion, drive-letter forms, NUL and non-ASCII names, the byte-vs-character cap,
"nothing was written outside the root", and the read/list round trip.

**Frontend/backend contract typing.**
`src/ipc/contract.ts` declares the closed set of command names, the wire types and the same
validation rules; `src/ipc/client.ts` is the only module that calls `invoke`. Frontend
validation is documented in-file as a UX affordance, never the enforcement point.

**Secure storage.** Stated honestly rather than claimed: this template stores **no
secrets**. Notes are plain text under `app_data_dir()/notes`, which is not secure storage,
and `SECURITY.md` says so and points forks at the OS keychain instead.

**Packaging.** CI runs `pnpm tauri build --no-bundle --ci` on `ubuntu-latest` — the real
release compile through the full Tauri pipeline, with the `.deb`/`.AppImage` bundlers
skipped — and records the binary's size, `file` type and SHA-256 in the job summary. A
full `cargo build --release` was also verified locally on macOS (aarch64).

## CI evidence

`.github/workflows/ci.yml`, `permissions: contents: read`, third-party actions pinned by
commit SHA, two jobs:

| Requirement from issue #21 | Where |
| --- | --- |
| install with locked package manager | `pnpm install --frozen-lockfile` (both jobs), `packageManager: pnpm@10.33.3`, committed `pnpm-lock.yaml` and `src-tauri/Cargo.lock` |
| lint / typecheck | `pnpm lint` (Biome), `pnpm typecheck` (`tsc --noEmit`, TypeScript 7) |
| frontend unit tests | `pnpm test` — 50 Vitest tests |
| Rust/Tauri checks | `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` |
| capability/config validation | `pnpm validate:desktop` (run in **both** jobs) |
| package/build check | `pnpm tauri build --no-bundle --ci` on `ubuntu-latest` |

## Material findings

1. **The scanner caught a real defect on the first run.** `@vitest/coverage-v8` was not
   installed, so `vitest run --coverage` failed outright — the test suite passed but was
   uncoverable. Fixed, with 80% line/branch/function/statement thresholds now enforced
   (actual: 89.45% statements, 82.19% branches, 97.61% functions, 89.18% lines).
2. **The first cut of the UI was one 118-line component.** Split into `NoteForm`,
   `NoteList`, `StatusLine` and a `use-note-vault` hook.
3. **No error boundary.** A desktop window has no address bar to reload from, so a render
   failure meant a permanently blank app. `ErrorBoundary` added, with a working retry.
4. **A bespoke `__APP_MODE__` build define** existed where `import.meta.env.MODE` would do,
   leaving an orphan declaration file behind. Removed.

## Residual risks — why this is not 100

- **No end-to-end layer, and this is the biggest gap** (`testing` 85/100). Nothing here
  drives the *actual packaged desktop window*. Doing that properly needs `tauri-driver` +
  WebDriver plus a display server in CI; that harness was judged out of scope for a
  fixture this size. The consequence is concrete: the capability policy is proven by
  static validation and by the absence of the plugin crates, **not** by a running app
  being observed to fail when it reaches for the filesystem. A production desktop app
  should add that test.
- **The primary standard has no rubric.** The 98 is a composite over generic + React +
  TypeScript + testing + security checks. No number here is evidence that
  `tauri-react-desktop` is satisfied, because there is nothing yet to satisfy. Treat this
  repo as an input to authoring that rubric, not as a pass against it.
- **The packaging step is a build check, not a bundle.** No `.deb`, `.AppImage`, `.dmg` or
  `.msi` is produced, nothing is signed or notarised, and there is no release workflow at
  all. A real product needs per-platform signing identities, a tag-triggered release job,
  update-channel integrity (Tauri updater signing keys) and retained artifact evidence —
  none of which belongs in a public fixture.
- **Only one platform is exercised in CI.** Linux x86_64. macOS and Windows builds are
  untested by automation; the macOS release build was only verified by hand on one
  machine.
- **No `cargo audit` / `cargo deny` and no npm advisory gate.** Dependabot is configured
  for npm, cargo and GitHub Actions, but CI does not fail on a known-vulnerable
  dependency. The Dependency Hygiene standard is still `planned`.
- **No pre-commit hooks, no commit-message enforcement, no error tracking**
  (`best-practices` 94/100). Deliberate for a fixture: hooks and a Sentry DSN would be
  noise in a template that nobody runs in production. A real app should have the first two.
- **Four exports are unused by the app itself** (`dead-code` 99/100, advisory) —
  `MAX_NOTES`, `NOTE_NAME_PATTERN`, `hasControlCharacters`, `VaultErrorCode`. They are part
  of the published contract and are exercised by tests, so they are kept intentionally.
- **The vault is not concurrency-safe.** `save_note` does a read-then-write with no lock;
  two windows writing the same note would race. Single-window app, so it cannot happen
  here, but it would matter in a fork.

## Key files

| File | Why it matters |
| --- | --- |
| [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json) | The committed capability policy |
| [`src-tauri/src/vault.rs`](../src-tauri/src/vault.rs) | All validation, all filesystem access, all Rust tests |
| [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) | CSP, asset protocol, window declaration, bundle config |
| [`scripts/validate-desktop-config.mjs`](../scripts/validate-desktop-config.mjs) | The policy check that keeps the surface narrow |
| [`src/ipc/contract.ts`](../src/ipc/contract.ts) | The typed IPC contract |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Every gate above |
| [`SECURITY.md`](../SECURITY.md) | The trust-boundary statement |
