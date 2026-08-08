import { useCallback, useEffect, useId, useState } from "react";
import type { VaultClient } from "../ipc/client";
import { createVaultClient, toVaultError } from "../ipc/client";
import type { NoteMeta, VaultError } from "../ipc/contract";
import { byteLength, MAX_NOTE_BYTES, MAX_NOTE_NAME_LEN } from "../ipc/contract";

export interface NoteVaultProps {
  /** Injectable so tests can drive the component without a Tauri runtime. */
  readonly client?: VaultClient;
}

type Status =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "saved"; readonly note: NoteMeta }
  | { readonly kind: "loaded"; readonly name: string }
  | { readonly kind: "error"; readonly error: VaultError };

export function NoteVault({ client }: NoteVaultProps) {
  const [vault] = useState<VaultClient>(() => client ?? createVaultClient());
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState<readonly NoteMeta[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const nameId = useId();
  const bodyId = useId();

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

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ kind: "busy" });
    try {
      const note = await vault.saveNote({ name, body });
      setStatus({ kind: "saved", note });
      await refresh();
    } catch (cause) {
      setStatus({ kind: "error", error: toVaultError(cause) });
    }
  };

  const onOpen = async (noteName: string) => {
    setStatus({ kind: "busy" });
    try {
      const note = await vault.readNote({ name: noteName });
      setName(note.meta.name);
      setBody(note.body);
      setStatus({ kind: "loaded", name: note.meta.name });
    } catch (cause) {
      setStatus({ kind: "error", error: toVaultError(cause) });
    }
  };

  const usedBytes = byteLength(body);

  return (
    <section className="vault">
      <h2>Note vault</h2>
      <p className="hint">
        Notes are written by the Rust command layer into the application data
        directory and nowhere else. The webview never receives a path.
      </p>

      <form onSubmit={onSave}>
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          name="name"
          value={name}
          maxLength={MAX_NOTE_NAME_LEN}
          placeholder="release-checklist"
          onChange={(event) => setName(event.target.value)}
        />

        <label htmlFor={bodyId}>Body</label>
        <textarea
          id={bodyId}
          name="body"
          rows={8}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <p className="hint">
          {usedBytes} / {MAX_NOTE_BYTES} bytes
        </p>

        <button type="submit" disabled={status.kind === "busy"}>
          Save note
        </button>
      </form>

      <output aria-live="polite">
        {status.kind === "error" ? (
          <span className="error" data-testid="status">
            {status.error.code}: {status.error.message}
          </span>
        ) : null}
        {status.kind === "saved" ? (
          <span data-testid="status">
            Saved {status.note.name} ({status.note.bytes} bytes)
          </span>
        ) : null}
        {status.kind === "loaded" ? (
          <span data-testid="status">Loaded {status.name}</span>
        ) : null}
      </output>

      <h3>Stored notes</h3>
      {notes.length === 0 ? (
        <p className="hint">No notes yet.</p>
      ) : (
        <ul>
          {notes.map((note) => (
            <li key={note.name}>
              <button type="button" onClick={() => void onOpen(note.name)}>
                {note.name}
              </button>
              <span className="hint"> {note.bytes} bytes</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
