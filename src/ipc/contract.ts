/**
 * The typed IPC contract between the webview and the Rust backend.
 *
 * This file is the single frontend-side description of every command the UI is allowed to
 * invoke, plus the validation rules those commands enforce. The rules are deliberately
 * duplicated in `src-tauri/src/vault.rs`, and `tests/contract.test.ts` +
 * `src-tauri/src/vault.rs`'s unit tests pin both halves to the same constants.
 *
 * Frontend validation exists only to give fast, local feedback. It is **not** a security
 * control: the Rust side re-validates every field and is the only thing that decides
 * whether a byte reaches the disk.
 */

/** Maximum note name length, in characters. Mirrors `vault::MAX_NOTE_NAME_LEN`. */
export const MAX_NOTE_NAME_LEN = 64;

/** Maximum note body size, in UTF-8 bytes. Mirrors `vault::MAX_NOTE_BYTES`. */
export const MAX_NOTE_BYTES = 8 * 1024;

/** Maximum number of notes a vault will hold. Mirrors `vault::MAX_NOTES`. */
export const MAX_NOTES = 200;

/** The accepted note-name shape. Mirrors the checks in `vault::validate_note_name`. */
export const NOTE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Every command name the frontend is permitted to invoke. */
export const COMMANDS = ["save_note", "read_note", "list_notes"] as const;

export type CommandName = (typeof COMMANDS)[number];

/** Machine-readable failure codes returned by the Rust command layer. */
export type VaultErrorCode =
  | "invalid_name"
  | "invalid_body"
  | "note_too_large"
  | "not_found"
  | "vault_full"
  | "io_error";

export interface VaultError {
  readonly code: VaultErrorCode;
  readonly message: string;
}

export interface NoteMeta {
  readonly name: string;
  readonly bytes: number;
  readonly modifiedMs: number;
}

export interface Note {
  readonly meta: NoteMeta;
  readonly body: string;
}

export interface SaveNoteArgs {
  readonly name: string;
  readonly body: string;
}

export interface ReadNoteArgs {
  readonly name: string;
}

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;

/**
 * True when `value` holds a C0 control character (or DEL) other than tab, LF or CR.
 *
 * Written as a scan rather than a regex on purpose: a regex containing literal control
 * characters is both unreadable and a lint error, and an escaped one is easy to get
 * subtly wrong. Mirrors the same check in `vault::validate_note_body`.
 */
export function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN)
      continue;
    if (code < FIRST_PRINTABLE || code === DELETE) return true;
  }
  return false;
}

/** UTF-8 byte length, which is what the Rust side measures. */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Returns `null` when the name is acceptable, otherwise the reason it is not.
 *
 * The character class alone already excludes `/`, `\`, NUL and drive letters, so a
 * traversal attempt cannot survive it. The explicit `..` check is defence in depth and is
 * kept deliberately, so that widening the character class later cannot silently
 * reintroduce traversal.
 */
export function validateNoteName(name: string): VaultError | null {
  if (name.length === 0) {
    return { code: "invalid_name", message: "Note name must not be empty." };
  }
  if (name.length > MAX_NOTE_NAME_LEN) {
    return {
      code: "invalid_name",
      message: `Note name must be at most ${MAX_NOTE_NAME_LEN} characters.`,
    };
  }
  if (name.includes("..")) {
    return {
      code: "invalid_name",
      message: "Note name must not contain '..'.",
    };
  }
  if (!NOTE_NAME_PATTERN.test(name)) {
    return {
      code: "invalid_name",
      message:
        "Note name must start with a lowercase letter or digit and use only a-z, 0-9, '.', '_' and '-'.",
    };
  }
  return null;
}

/** Returns `null` when the body is acceptable, otherwise the reason it is not. */
export function validateNoteBody(body: string): VaultError | null {
  const bytes = byteLength(body);
  if (bytes > MAX_NOTE_BYTES) {
    return {
      code: "note_too_large",
      message: `Note body must be at most ${MAX_NOTE_BYTES} bytes (got ${bytes}).`,
    };
  }
  if (hasControlCharacters(body)) {
    return {
      code: "invalid_body",
      message: "Note body must not contain control characters.",
    };
  }
  return null;
}

/** Narrows an unknown rejection value to the error shape the Rust layer serialises. */
export function isVaultError(value: unknown): value is VaultError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" && typeof candidate.message === "string"
  );
}
