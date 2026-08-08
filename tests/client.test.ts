import { describe, expect, it, vi } from "vitest";
import type { Invoker } from "../src/ipc/client";
import { createVaultClient, toVaultError } from "../src/ipc/client";
import { MAX_NOTE_BYTES } from "../src/ipc/contract";

function fakeInvoker(result: unknown = null) {
  return vi.fn<Invoker>(async () => result);
}

describe("createVaultClient", () => {
  it("sends valid arguments straight through", async () => {
    const invoke = fakeInvoker({ name: "notes", bytes: 2, modifiedMs: 1 });
    const client = createVaultClient(invoke);

    await expect(
      client.saveNote({ name: "notes", body: "hi" }),
    ).resolves.toEqual({
      name: "notes",
      bytes: 2,
      modifiedMs: 1,
    });
    expect(invoke).toHaveBeenCalledWith("save_note", {
      name: "notes",
      body: "hi",
    });
  });

  it("refuses a traversal name before any IPC happens", async () => {
    const invoke = fakeInvoker();
    const client = createVaultClient(invoke);

    await expect(
      client.saveNote({ name: "../escape", body: "x" }),
    ).rejects.toMatchObject({
      code: "invalid_name",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before any IPC happens", async () => {
    const invoke = fakeInvoker();
    const client = createVaultClient(invoke);

    await expect(
      client.saveNote({ name: "big", body: "x".repeat(MAX_NOTE_BYTES + 1) }),
    ).rejects.toMatchObject({ code: "note_too_large" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("validates the name on read too", async () => {
    const invoke = fakeInvoker();
    const client = createVaultClient(invoke);

    await expect(
      client.readNote({ name: "/etc/passwd" }),
    ).rejects.toMatchObject({
      code: "invalid_name",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("passes backend errors through unchanged", async () => {
    const invoke = vi.fn<Invoker>(async () => {
      throw { code: "not_found", message: "No such note." };
    });
    const client = createVaultClient(invoke);

    await expect(client.readNote({ name: "absent" })).rejects.toEqual({
      code: "not_found",
      message: "No such note.",
    });
  });

  it("normalises a non-contract throw into an io_error", async () => {
    const invoke = vi.fn<Invoker>(async () => {
      throw new Error("ipc channel closed");
    });
    const client = createVaultClient(invoke);

    await expect(client.listNotes()).rejects.toEqual({
      code: "io_error",
      message: "ipc channel closed",
    });
  });
});

describe("toVaultError", () => {
  it("keeps contract errors intact", () => {
    const error = { code: "invalid_name", message: "nope" } as const;
    expect(toVaultError(error)).toBe(error);
  });

  it("wraps strings", () => {
    expect(toVaultError("boom")).toEqual({ code: "io_error", message: "boom" });
  });
});
