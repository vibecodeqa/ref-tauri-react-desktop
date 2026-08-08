import { vi } from "vitest";
import type { Invoker, VaultClient } from "../../src/ipc/client";
import { createVaultClient } from "../../src/ipc/client";
import type { Note, NoteMeta } from "../../src/ipc/contract";

export interface FakeBackend {
  readonly invoke: ReturnType<typeof vi.fn<Invoker>>;
  readonly client: VaultClient;
}

/**
 * An in-memory stand-in for the Rust command layer, driven through the *real* IPC client
 * so the client's own validation still runs. It deliberately does not re-implement the
 * Rust validation: that is what `cargo test` covers.
 */
export function fakeBackend(seed: Record<string, string> = {}): FakeBackend {
  const notes = new Map(Object.entries(seed));

  const invoke = vi.fn<Invoker>(async (command, args) => {
    const name = String(args?.name ?? "");
    if (command === "save_note") {
      const body = String(args?.body ?? "");
      notes.set(name, body);
      return { name, bytes: body.length, modifiedMs: 1 } satisfies NoteMeta;
    }
    if (command === "read_note") {
      const body = notes.get(name);
      if (body === undefined) {
        throw { code: "not_found", message: "No such note." };
      }
      return {
        meta: { name, bytes: body.length, modifiedMs: 1 },
        body,
      } satisfies Note;
    }
    return [...notes.entries()].map(([key, body]) => ({
      name: key,
      bytes: body.length,
      modifiedMs: 1,
    })) satisfies NoteMeta[];
  });

  return { invoke, client: createVaultClient(invoke) };
}
