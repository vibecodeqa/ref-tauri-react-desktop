export interface CapabilityFile {
  readonly file: string;
  readonly capability: Record<string, unknown>;
}

export interface DesktopConfigInput {
  readonly config: Record<string, unknown>;
  readonly capabilities: readonly CapabilityFile[];
  readonly cargoToml: string;
  readonly viteConfig: string;
}

export declare const DENIED_PERMISSION_FAMILIES: readonly string[];
export declare const DENIED_CORE_PERMISSIONS: readonly string[];
export declare const DENIED_PLUGIN_CRATES: readonly string[];

export declare function validateDesktopConfig(
  input: DesktopConfigInput,
): string[];
export declare function loadDesktopConfig(rootDir: string): DesktopConfigInput;
