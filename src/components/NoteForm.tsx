import type { FormEvent } from "react";
import { useId } from "react";
import { byteLength, MAX_NOTE_BYTES, MAX_NOTE_NAME_LEN } from "../ipc/contract";

/** Props for {@link NoteForm}. */
export interface NoteFormProps {
  readonly name: string;
  readonly body: string;
  readonly busy: boolean;
  readonly onNameChange: (value: string) => void;
  readonly onBodyChange: (value: string) => void;
  readonly onSubmit: () => void;
}

/**
 * Controlled form for one note. Purely presentational — it neither validates nor
 * invokes; the parent owns both.
 */
export function NoteForm(props: NoteFormProps) {
  const { name, body, busy, onNameChange, onBodyChange, onSubmit } = props;
  const nameId = useId();
  const bodyId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={nameId}>Name</label>
      <input
        id={nameId}
        name="name"
        value={name}
        maxLength={MAX_NOTE_NAME_LEN}
        placeholder="release-checklist"
        onChange={(event) => onNameChange(event.target.value)}
      />

      <label htmlFor={bodyId}>Body</label>
      <textarea
        id={bodyId}
        name="body"
        rows={8}
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
      />
      <p className="hint">
        {byteLength(body)} / {MAX_NOTE_BYTES} bytes
      </p>

      <button type="submit" disabled={busy}>
        Save note
      </button>
    </form>
  );
}
