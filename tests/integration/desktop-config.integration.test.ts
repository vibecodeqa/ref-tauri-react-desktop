import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DesktopConfigInput } from "../../scripts/validate-desktop-config.mjs";
import {
  loadDesktopConfig,
  validateDesktopConfig,
} from "../../scripts/validate-desktop-config.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** A mutable view of the validator's input, so cases can break one thing at a time. */
interface MutableCapability {
  identifier: string;
  description: string;
  windows: string[];
  permissions: string[];
  remote?: { urls: string[] };
  local?: boolean;
}

interface MutableInput {
  config: {
    identifier: string;
    build: { devUrl: string; frontendDist: string };
    app: {
      withGlobalTauri: boolean;
      windows: { label: string }[];
      security: {
        csp: string;
        freezePrototype: boolean;
        assetProtocol: { enable: boolean; scope: string[] };
      };
    };
  };
  capabilities: { file: string; capability: MutableCapability }[];
  cargoToml: string;
  viteConfig: string;
}

function baseline(): MutableInput {
  return structuredClone(
    loadDesktopConfig(repoRoot),
  ) as unknown as MutableInput;
}

function check(input: MutableInput): string[] {
  return validateDesktopConfig(input as unknown as DesktopConfigInput);
}

function firstCapability(input: MutableInput): MutableCapability {
  const entry = input.capabilities[0];
  if (!entry) throw new Error("no capability files were loaded");
  return entry.capability;
}

/** Breaks exactly one thing in a clone of the real config and returns the errors. */
function mutated(change: (input: MutableInput) => void): string {
  const input = baseline();
  change(input);
  return check(input).join("\n");
}

describe("the committed desktop config", () => {
  it("passes its own policy check", () => {
    expect(check(baseline())).toEqual([]);
  });

  it("grants only core: permissions", () => {
    for (const { capability } of baseline().capabilities) {
      expect(capability.permissions.length).toBeGreaterThan(0);
      for (const permission of capability.permissions) {
        expect(permission.startsWith("core:"), permission).toBe(true);
      }
    }
  });
});

describe("validateDesktopConfig rejects", () => {
  it("a filesystem permission", () => {
    const errors = mutated((input) => {
      firstCapability(input).permissions.push("fs:allow-read-text-file");
    });
    expect(errors).toContain('permission family "fs" is denied');
  });

  it("a shell permission", () => {
    const errors = mutated((input) => {
      firstCapability(input).permissions.push("shell:allow-execute");
    });
    expect(errors).toContain('permission family "shell" is denied');
  });

  it("an http permission", () => {
    const errors = mutated((input) => {
      firstCapability(input).permissions.push("http:default");
    });
    expect(errors).toContain('permission family "http" is denied');
  });

  it("the coarse core:default aggregate", () => {
    const errors = mutated((input) => {
      firstCapability(input).permissions.push("core:default");
    });
    expect(errors).toContain("core:default");
  });

  it("a capability aimed at an undeclared window", () => {
    const errors = mutated((input) => {
      firstCapability(input).windows.push("hidden-debug");
    });
    expect(errors).toContain('window "hidden-debug" is not declared');
  });

  it("a wildcard window label", () => {
    const errors = mutated((input) => {
      firstCapability(input).windows[0] = "*";
    });
    expect(errors).toContain("must not use a wildcard");
  });

  it("a remote capability", () => {
    const errors = mutated((input) => {
      firstCapability(input).remote = { urls: ["https://example.com"] };
    });
    expect(errors).toContain("remote capabilities are not permitted");
  });

  it("an empty permission list", () => {
    const errors = mutated((input) => {
      firstCapability(input).permissions = [];
    });
    expect(errors).toContain("must not be empty");
  });

  it("a CSP that allows eval", () => {
    const errors = mutated((input) => {
      input.config.app.security.csp =
        "default-src 'self'; script-src 'self' 'unsafe-eval'; object-src 'none'";
    });
    expect(errors).toContain("unsafe-eval");
  });

  it("re-enabling the asset protocol", () => {
    const errors = mutated((input) => {
      input.config.app.security.assetProtocol = { enable: true, scope: ["**"] };
    });
    expect(errors).toContain("assetProtocol.enable");
  });

  it("disabling prototype freezing", () => {
    const errors = mutated((input) => {
      input.config.app.security.freezePrototype = false;
    });
    expect(errors).toContain("freezePrototype");
  });

  it("exposing the global Tauri object", () => {
    const errors = mutated((input) => {
      input.config.app.withGlobalTauri = true;
    });
    expect(errors).toContain("withGlobalTauri");
  });

  it("a dev URL that drifts from the Vite dev port", () => {
    const errors = mutated((input) => {
      input.config.build.devUrl = "http://127.0.0.1:5173";
    });
    expect(errors).toContain("does not match the Vite dev port");
  });

  it("a denied plugin crate in Cargo.toml", () => {
    const errors = mutated((input) => {
      input.cargoToml = `${input.cargoToml}\ntauri-plugin-shell = "2"\n`;
    });
    expect(errors).toContain('denied plugin crate "tauri-plugin-shell"');
  });

  it("a Tauri v1 dependency", () => {
    const errors = mutated((input) => {
      input.cargoToml = input.cargoToml.replace(
        'tauri = { version = "2"',
        'tauri = { version = "1"',
      );
    });
    expect(errors).toContain("must be pinned to version 2");
  });
});
