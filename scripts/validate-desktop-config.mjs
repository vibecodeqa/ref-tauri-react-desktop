#!/usr/bin/env node
/**
 * Capability and desktop-config validator.
 *
 * Tauri's own schema will tell you whether `tauri.conf.json` is *well formed*. It will
 * not tell you whether the capability files still describe a narrow app. This script is
 * the policy check: it fails the build if the committed capability set ever grows a
 * filesystem, shell, process, network or dialog permission, if the coarse `core:default`
 * aggregate is used instead of explicit permissions, if a denied plugin crate appears in
 * `Cargo.toml`, if the CSP is loosened, or if a capability points at a window that does
 * not exist.
 *
 * Run it directly (`pnpm validate:desktop`) or import `validateDesktopConfig` — the unit
 * tests in `tests/validate-desktop-config.test.ts` exercise it against both the real repo
 * files and deliberately broken fixtures.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Permission families that must never appear in a capability file. Each of these would
 * hand the untrusted webview a direct route to the host that bypasses the validated
 * command surface in `src-tauri/src/vault.rs`.
 */
export const DENIED_PERMISSION_FAMILIES = [
  "fs",
  "shell",
  "http",
  "process",
  "dialog",
  "updater",
  "clipboard-manager",
  "global-shortcut",
  "os",
  "autostart",
  "deep-link",
  "store",
  "upload",
  "websocket",
  "notification",
  "persisted-scope",
];

/** Core permissions that are technically `core:` but still widen the blast radius. */
export const DENIED_CORE_PERMISSIONS = [
  "core:default",
  "core:resources:default",
  "core:tray:default",
  "core:webview:default",
  "core:webview:allow-create-webview",
  "core:webview:allow-create-webview-window",
  "core:window:default",
  "core:window:allow-create",
];

/** Plugin crates that must not be dependencies of the Tauri shell. */
export const DENIED_PLUGIN_CRATES = DENIED_PERMISSION_FAMILIES.map(
  (family) => `tauri-plugin-${family}`,
);

const CSP_REQUIRED_DIRECTIVES = [
  "default-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
];
const CSP_FORBIDDEN_TOKENS = ["unsafe-eval", "unsafe-inline", "*"];

const IDENTIFIER_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const PERMISSION_PATTERN = /^[a-z0-9-]+:[a-z0-9:-]+$/;

/**
 * @typedef {object} DesktopConfigInput
 * @property {Record<string, any>} config Parsed `src-tauri/tauri.conf.json`.
 * @property {{ file: string, capability: Record<string, any> }[]} capabilities Parsed capability files.
 * @property {string} cargoToml Raw `src-tauri/Cargo.toml`.
 * @property {string} viteConfig Raw `vite.config.ts`.
 */

/**
 * @param {DesktopConfigInput} input
 * @returns {string[]} human-readable problems; empty means the config is acceptable.
 */
export function validateDesktopConfig(input) {
  /** @type {string[]} */
  const errors = [];
  const { config, capabilities, cargoToml, viteConfig } = input;

  // ── tauri.conf.json ────────────────────────────────────────────────────────────
  if (
    typeof config.identifier !== "string" ||
    !IDENTIFIER_PATTERN.test(config.identifier)
  ) {
    errors.push("tauri.conf.json: `identifier` must be a reverse-DNS string.");
  }
  if (
    typeof config.identifier === "string" &&
    config.identifier.endsWith(".app")
  ) {
    errors.push("tauri.conf.json: `identifier` must not end with `.app`.");
  }
  if (config.build?.frontendDist !== "../dist") {
    errors.push("tauri.conf.json: `build.frontendDist` must be `../dist`.");
  }
  if (config.app?.withGlobalTauri !== false) {
    errors.push("tauri.conf.json: `app.withGlobalTauri` must be false.");
  }

  const security = config.app?.security ?? {};
  const csp = security.csp;
  if (typeof csp !== "string" || csp.length === 0) {
    errors.push(
      "tauri.conf.json: `app.security.csp` must be a non-empty string.",
    );
  } else {
    for (const directive of CSP_REQUIRED_DIRECTIVES) {
      if (!csp.includes(directive)) {
        errors.push(`tauri.conf.json: CSP must contain "${directive}".`);
      }
    }
    for (const token of CSP_FORBIDDEN_TOKENS) {
      if (csp.includes(token)) {
        errors.push(`tauri.conf.json: CSP must not contain "${token}".`);
      }
    }
  }
  if (security.freezePrototype !== true) {
    errors.push(
      "tauri.conf.json: `app.security.freezePrototype` must be true.",
    );
  }
  if (security.assetProtocol?.enable !== false) {
    errors.push(
      "tauri.conf.json: `app.security.assetProtocol.enable` must be false.",
    );
  }
  if (
    Array.isArray(security.assetProtocol?.scope) &&
    security.assetProtocol.scope.length > 0
  ) {
    errors.push(
      "tauri.conf.json: `app.security.assetProtocol.scope` must be empty.",
    );
  }
  if (security.dangerousDisableAssetCspModification) {
    errors.push(
      "tauri.conf.json: `dangerousDisableAssetCspModification` must not be set.",
    );
  }

  const windows = Array.isArray(config.app?.windows) ? config.app.windows : [];
  if (windows.length === 0) {
    errors.push("tauri.conf.json: at least one window must be declared.");
  }
  /** @type {Set<string>} */
  const windowLabels = new Set();
  for (const window of windows) {
    if (typeof window.label !== "string" || window.label.length === 0) {
      errors.push(
        "tauri.conf.json: every window must have a non-empty `label`.",
      );
      continue;
    }
    if (windowLabels.has(window.label)) {
      errors.push(`tauri.conf.json: duplicate window label "${window.label}".`);
    }
    windowLabels.add(window.label);
  }

  // Dev server origin must agree with vite.config.ts, or `tauri dev` silently attaches
  // to whatever else happens to be listening on the configured port.
  const devUrl = config.build?.devUrl;
  const vitePort = /const DEV_SERVER_PORT = (\d+);/.exec(viteConfig)?.[1];
  if (typeof devUrl !== "string") {
    errors.push("tauri.conf.json: `build.devUrl` must be set.");
  } else if (!vitePort) {
    errors.push(
      "vite.config.ts: could not find `const DEV_SERVER_PORT = <n>;`.",
    );
  } else if (!devUrl.endsWith(`:${vitePort}`)) {
    errors.push(
      `tauri.conf.json: \`build.devUrl\` (${devUrl}) does not match the Vite dev port ${vitePort}.`,
    );
  }

  // ── capabilities ───────────────────────────────────────────────────────────────
  if (capabilities.length === 0) {
    errors.push(
      "src-tauri/capabilities: at least one capability file must be committed.",
    );
  }
  for (const { file, capability } of capabilities) {
    const where = `capabilities/${file}`;
    if (
      typeof capability.identifier !== "string" ||
      capability.identifier.length === 0
    ) {
      errors.push(`${where}: \`identifier\` must be a non-empty string.`);
    }
    if (
      typeof capability.description !== "string" ||
      capability.description.length < 20
    ) {
      errors.push(
        `${where}: \`description\` must explain why each permission is granted.`,
      );
    }
    if (capability.remote) {
      errors.push(`${where}: remote capabilities are not permitted.`);
    }
    if (capability.local === false) {
      errors.push(`${where}: \`local\` must not be disabled.`);
    }

    const capWindows = Array.isArray(capability.windows)
      ? capability.windows
      : [];
    if (capWindows.length === 0) {
      errors.push(
        `${where}: \`windows\` must name the windows this capability applies to.`,
      );
    }
    for (const label of capWindows) {
      if (label.includes("*")) {
        errors.push(
          `${where}: window label "${label}" must not use a wildcard.`,
        );
        continue;
      }
      if (!windowLabels.has(label)) {
        errors.push(
          `${where}: window "${label}" is not declared in tauri.conf.json.`,
        );
      }
    }

    const permissions = Array.isArray(capability.permissions)
      ? capability.permissions
      : [];
    if (permissions.length === 0) {
      errors.push(`${where}: \`permissions\` must not be empty.`);
    }
    for (const permission of permissions) {
      if (typeof permission !== "string") {
        errors.push(`${where}: scoped permission objects are not permitted.`);
        continue;
      }
      if (!PERMISSION_PATTERN.test(permission)) {
        errors.push(
          `${where}: "${permission}" is not a valid permission identifier.`,
        );
        continue;
      }
      const family = permission.split(":")[0];
      if (DENIED_PERMISSION_FAMILIES.includes(family)) {
        errors.push(
          `${where}: permission family "${family}" is denied ("${permission}").`,
        );
        continue;
      }
      if (family !== "core") {
        errors.push(
          `${where}: only \`core:\` permissions are allowed ("${permission}").`,
        );
        continue;
      }
      if (DENIED_CORE_PERMISSIONS.includes(permission)) {
        errors.push(
          `${where}: "${permission}" is too broad; grant the individual permissions instead.`,
        );
      }
    }
  }

  // ── Cargo.toml ─────────────────────────────────────────────────────────────────
  if (!/^\s*tauri\s*=\s*\{[^}]*version\s*=\s*"2/m.test(cargoToml)) {
    errors.push(
      "src-tauri/Cargo.toml: the `tauri` dependency must be pinned to version 2.",
    );
  }
  for (const crate of DENIED_PLUGIN_CRATES) {
    if (new RegExp(`^\\s*${crate}\\s*=`, "m").test(cargoToml)) {
      errors.push(
        `src-tauri/Cargo.toml: denied plugin crate "${crate}" is a dependency.`,
      );
    }
  }

  return errors;
}

/**
 * Reads the four inputs off disk.
 *
 * @param {string} rootDir repository root
 * @returns {DesktopConfigInput}
 */
export function loadDesktopConfig(rootDir) {
  const tauriDir = join(rootDir, "src-tauri");
  const capabilitiesDir = join(tauriDir, "capabilities");
  const capabilityFiles = readdirSync(capabilitiesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  return {
    config: JSON.parse(readFileSync(join(tauriDir, "tauri.conf.json"), "utf8")),
    capabilities: capabilityFiles.map((file) => ({
      file,
      capability: JSON.parse(readFileSync(join(capabilitiesDir, file), "utf8")),
    })),
    cargoToml: readFileSync(join(tauriDir, "Cargo.toml"), "utf8"),
    viteConfig: readFileSync(join(rootDir, "vite.config.ts"), "utf8"),
  };
}

/* c8 ignore start -- CLI entry point, covered by the CI step rather than by unit tests. */
const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const rootDir = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const errors = validateDesktopConfig(loadDesktopConfig(rootDir));
  if (errors.length > 0) {
    console.error(
      `Desktop config validation failed (${errors.length} problem(s)):`,
    );
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    "Desktop config validation passed: capability surface is narrow.",
  );
}
/* c8 ignore stop */
