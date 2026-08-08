# Contributing

This repository is a VibeCode QA reference fixture. Changes should keep it small, honest
and green — a reference that drifts from its own claims is worse than no reference.

## Before you push

Run the same gates CI runs:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:desktop
pnpm build

cargo fmt    --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml
```

`cargo` needs `dist/` to exist first (`build.rs` resolves `build.frontendDist`), so run
`pnpm build` before the Rust gates in a clean checkout.

## Rules that are not negotiable

1. **The capability surface stays narrow.** Do not add an `fs`, `shell`, `http`, `process`,
   `dialog`, `updater`, `clipboard`, `os` or `global-shortcut` permission or plugin.
   `pnpm validate:desktop` will refuse it, and that check exists on purpose. If a change
   genuinely needs new host access, add a *validated Rust command*, not a plugin
   permission.
2. **Validation lives in Rust.** Frontend checks in `src/ipc/contract.ts` are a UX
   affordance. Any rule added there must be added to `src-tauri/src/vault.rs` too, with a
   `cargo test` case proving the refusal.
3. **Both test layers move together.** A change to the command boundary needs a Rust test;
   a change to the UI needs a Vitest test.
4. **No release from a laptop.** CI performs a package/build check only. Nothing here is
   signed, notarised or published.

## Style

- Formatting and linting are Biome's job (`pnpm lint`, `pnpm format`); Rust's is
  `cargo fmt`.
- Commit messages reference the tracking issue, e.g. `fix: narrow the note name charset (#21)`.
- Update `CHANGELOG.md` for anything a consumer of this template would notice.
