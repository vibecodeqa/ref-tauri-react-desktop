import { useCallback, useEffect, useState } from "react";
import type { VaultClient } from "../ipc/client";
import { createVaultClient, toVaultError } from "../ipc/client";
import type { Note, NoteMeta, SaveNoteArgs, VaultError } from "../ipc/contract";

/** Every outcome the vault UI can be in. Exhaustive, so the status line cannot drift. */
export type VaultStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "saved"; readonly note: NoteMeta }
  | { readonly kind: "loaded"; readonly name: string }
  | { readonly kind: "error"; readonly error: VaultError };

/** What {@link useNoteVault} hands back to the components. */
export interface NoteVaultApi {
  readonly notes: readonly NoteMeta[];
  readonly status: VaultStatus;
  readonly saveNote: (args: SaveNoteArgs) => Promise<void>;
  readonly openNote: (name: string) => Promise<Note | null>;
}

/** Owns every call into the IPC boundary, so the components stay presentational. */
export function useNoteVault(client?: VaultClient): NoteVaultApi {
  const [vault] = useState<VaultClient>(() => client ?? createVaultClient());
  const [notes, setNotes] = useState<readonly NoteMeta[]>([]);
  const [status, setStatus] = useState<VaultStatus>({ kind: "idle" });

  const refresh = useCallback(async () => {
    try {
      setNotes(await vault.listNotes());
    } catch (cause) {
      setStatus({ kind: "error", error: toVaultError(cause) });
    }
  }, [vault]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveNote = useCallback(
    async (args: SaveNoteArgs) => {
      setStatus({ kind: "busy" });
      try {
        setStatus({ kind: "saved", note: await vault.saveNote(args) });
        await refresh();
      } catch (cause) {
        setStatus({ kind: "error", error: toVaultError(cause) });
      }
    },
    [refresh, vault],
  );

  const openNote = useCallback(
    async (name: string) => {
      setStatus({ kind: "busy" });
      try {
        const note = await vault.readNote({ name });
        setStatus({ kind: "loaded", name: note.meta.name });
        return note;
      } catch (cause) {
        setStatus({ kind: "error", error: toVaultError(cause) });
        return null;
      }
    },
    [vault],
  );

  return { notes, status, saveNote, openNote };
}
