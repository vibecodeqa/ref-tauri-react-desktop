# Security policy

This is a product-neutral reference template. It is not a shipped product and has no
release channel; do not run it against data you care about.

## Reporting

Report suspected vulnerabilities through GitHub security advisories on this repository.
Do not open a public issue for an unfixed vulnerability.

## Desktop trust boundary

The webview is treated as untrusted. Everything the UI can reach on the host is listed
here, and nothing else is reachable.

- **No filesystem, shell, HTTP, process, dialog, clipboard, or updater plugin is compiled
  into the binary.** There is therefore no plugin command the frontend could call to touch
  the disk or spawn a process, whatever the frontend code does.
- `src-tauri/capabilities/default.json` grants an explicit, narrow subset of `core:`
  permissions to the `main` window only. It is committed and reviewed, and
  `scripts/validate-desktop-config.mjs` fails CI if a denied permission family
  (`fs:`, `shell:`, `http:`, `process:`, `dialog:`, `updater:`, `clipboard-manager:`,
  `global-shortcut:`, `os:`, `autostart:`, `deep-link:`, `store:`, `upload:`, `websocket:`)
  ever appears there.
- The only host access the UI has is three application commands — `save_note`,
  `read_note`, `list_notes` — implemented in `src-tauri/src/vault.rs`. Each validates its
  input before touching the disk.
- Notes are written **only** under `app_data_dir()/notes`. Note names are restricted to
  `^[a-z0-9][a-z0-9._-]{0,63}$`, `..` is rejected explicitly, and the resolved path must be
  a direct child of the vault root or the call is refused. Bodies are capped at 8 KiB and
  may not contain control characters other than tab, CR and LF.
- The Content Security Policy in `src-tauri/tauri.conf.json` is restrictive
  (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), the custom asset
  protocol is disabled, and prototype freezing is on.

## Secrets

This template stores no credentials and reads no secret environment variables. Do not put
secrets in `VITE_*` variables — everything with that prefix is inlined into the shipped
frontend bundle and is readable by anyone with the app.

If you fork this and need real secret storage, use the OS keychain
(`tauri-plugin-stronghold`, `keyring`, or an equivalent) from Rust, keep the secret on the
Rust side of the boundary, and never return it to the webview.
