import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  CommandName,
  Note,
  NoteMeta,
  ReadNoteArgs,
  SaveNoteArgs,
  VaultError,
} from "./contract";
import { isVaultError, validateNoteBody, validateNoteName } from "./contract";

/**
 * The only shape of host access the UI has.
 *
 * Everything the frontend can do to the machine goes through this function, and the set
 * of names it will accept is closed (`CommandName`). There is no `fs`, `shell`, `http`,
 * `dialog` or `process` plugin compiled into the binary, so there is no second door: see
 * `src-tauri/capabilities/default.json` and `SECURITY.md`.
 */
export type Invoker = (
  command: CommandName,
  args?: Record<string, unknown>,
) => Promise<unknown>;

const defaultInvoker: Invoker = (command, args) => tauriInvoke(command, args);

/**
 * A vault client bound to an invoker. Tests bind a fake invoker; the app binds Tauri's.
 *
 * Client-side validation here is a UX affordance and a self-check that the two halves of
 * the contract agree. It is never the enforcement point — `src-tauri/src/vault.rs`
 * re-validates every argument and is what actually protects the disk.
 */
export interface VaultClient {
  saveNote(args: SaveNoteArgs): Promise<NoteMeta>;
  readNote(args: ReadNoteArgs): Promise<Note>;
  listNotes(): Promise<NoteMeta[]>;
}

function reject(error: VaultError): Promise<never> {
  return Promise.reject(error);
}

/** Turns anything a rejected `invoke` can throw into the contract's error shape. */
export function toVaultError(cause: unknown): VaultError {
  if (isVaultError(cause)) return cause;
  return {
    code: "io_error",
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

/**
 * Builds a {@link VaultClient} over an invoker. Tests pass a fake; the app uses Tauri's.
 */
export function createVaultClient(
  invoker: Invoker = defaultInvoker,
): VaultClient {
  async function call<T>(
    command: CommandName,
    args?: Record<string, unknown>,
  ): Promise<T> {
    try {
      // The IPC boundary returns `unknown`; the command contract in `contract.ts` is what
      // says which shape belongs to which command name.
      return (await invoker(command, args)) as T;
    } catch (cause) {
      throw toVaultError(cause);
    }
  }

  return {
    saveNote({ name, body }) {
      const nameError = validateNoteName(name);
      if (nameError) return reject(nameError);
      const bodyError = validateNoteBody(body);
      if (bodyError) return reject(bodyError);
      return call<NoteMeta>("save_note", { name, body });
    },
    readNote({ name }) {
      const nameError = validateNoteName(name);
      if (nameError) return reject(nameError);
      return call<Note>("read_note", { name });
    },
    listNotes() {
      return call<NoteMeta[]>("list_notes");
    },
  };
}
