import type { NoteMeta } from "../ipc/contract";

export interface NoteListProps {
  readonly notes: readonly NoteMeta[];
  readonly onOpen: (name: string) => void;
}

export function NoteList({ notes, onOpen }: NoteListProps) {
  if (notes.length === 0) {
    return <p className="hint">No notes yet.</p>;
  }

  return (
    <ul>
      {notes.map((note) => (
        <li key={note.name}>
          <button type="button" onClick={() => onOpen(note.name)}>
            {note.name}
          </button>
          <span className="hint"> {note.bytes} bytes</span>
        </li>
      ))}
    </ul>
  );
}
