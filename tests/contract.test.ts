import { describe, expect, it } from "vitest";
import {
  byteLength,
  isVaultError,
  MAX_NOTE_BYTES,
  MAX_NOTE_NAME_LEN,
  validateNoteBody,
  validateNoteName,
} from "../src/ipc/contract";

/**
 * These cases mirror `src-tauri/src/vault.rs`'s unit tests one-for-one. If the two
 * validators ever disagree, one of these suites goes red.
 */
describe("validateNoteName", () => {
  it("accepts plain names", () => {
    for (const name of [
      "a",
      "note",
      "release-checklist",
      "2026.01_draft",
      "x9",
    ]) {
      expect(validateNoteName(name), name).toBeNull();
    }
  });

  it("rejects parent-directory traversal", () => {
    for (const name of ["..", "../etc/passwd", "a/../../b", "notes/.."]) {
      expect(validateNoteName(name)?.code, name).toBe("invalid_name");
    }
  });

  it("rejects separators, absolute paths and home expansion", () => {
    for (const name of [
      "a/b",
      "a\\b",
      "/etc/passwd",
      "c:notes",
      "~/secrets",
      "./hidden",
    ]) {
      expect(validateNoteName(name)?.code, name).toBe("invalid_name");
    }
  });

  it("rejects empty, uppercase and control-character names", () => {
    for (const name of [
      "",
      "Note",
      "no te",
      "nul\u{0000}byte",
      "emoji\u{1f600}",
    ]) {
      expect(validateNoteName(name)?.code, JSON.stringify(name)).toBe(
        "invalid_name",
      );
    }
  });

  it("enforces the name length cap", () => {
    expect(validateNoteName("a".repeat(MAX_NOTE_NAME_LEN))).toBeNull();
    expect(validateNoteName("a".repeat(MAX_NOTE_NAME_LEN + 1))?.code).toBe(
      "invalid_name",
    );
  });
});

describe("validateNoteBody", () => {
  it("accepts ordinary text with tabs and newlines", () => {
    expect(validateNoteBody("line one\nline two\r\n\ttabbed")).toBeNull();
  });

  it("enforces the byte cap", () => {
    expect(validateNoteBody("x".repeat(MAX_NOTE_BYTES))).toBeNull();
    expect(validateNoteBody("x".repeat(MAX_NOTE_BYTES + 1))?.code).toBe(
      "note_too_large",
    );
  });

  it("measures bytes, not characters", () => {
    const multibyte = "中".repeat(MAX_NOTE_BYTES / 2);
    expect(multibyte.length).toBeLessThan(MAX_NOTE_BYTES);
    expect(byteLength(multibyte)).toBeGreaterThan(MAX_NOTE_BYTES);
    expect(validateNoteBody(multibyte)?.code).toBe("note_too_large");
  });

  it("rejects control characters", () => {
    expect(validateNoteBody("ok\u{0000}bad")?.code).toBe("invalid_body");
  });
});

describe("isVaultError", () => {
  it("recognises the serialised error shape", () => {
    expect(isVaultError({ code: "not_found", message: "No such note." })).toBe(
      true,
    );
  });

  it("rejects anything else", () => {
    for (const value of [
      null,
      undefined,
      "boom",
      42,
      {},
      { code: 1, message: "x" },
    ]) {
      expect(isVaultError(value)).toBe(false);
    }
  });
});
