import { useState } from "react";
import { useNoteVault } from "../hooks/use-note-vault";
import type { VaultClient } from "../ipc/client";
import { NoteForm } from "./NoteForm";
import { NoteList } from "./NoteList";
import { StatusLine } from "./StatusLine";

export interface NoteVaultProps {
  /** Injectable so tests can drive the component without a Tauri runtime. */
  readonly client?: VaultClient;
}

export function NoteVault({ client }: NoteVaultProps) {
  const { notes, status, saveNote, openNote } = useNoteVault(client);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const onOpen = async (noteName: string) => {
    const note = await openNote(noteName);
    if (!note) return;
    setName(note.meta.name);
    setBody(note.body);
  };

  return (
    <section className="vault">
      <h2>Note vault</h2>
      <p className="hint">
        Notes are written by the Rust command layer into the application data
        directory and nowhere else. The webview never receives a path.
      </p>

      <NoteForm
        name={name}
        body={body}
        busy={status.kind === "busy"}
        onNameChange={setName}
        onBodyChange={setBody}
        onSubmit={() => void saveNote({ name, body })}
      />

      <StatusLine status={status} />

      <h3>Stored notes</h3>
      <NoteList notes={notes} onOpen={(noteName) => void onOpen(noteName)} />
    </section>
  );
}
