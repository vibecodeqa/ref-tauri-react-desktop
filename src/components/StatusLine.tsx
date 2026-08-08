import type { VaultStatus } from "../hooks/use-note-vault";

export interface StatusLineProps {
  readonly status: VaultStatus;
}

/** One live region for every outcome, so errors are announced rather than only coloured. */
export function StatusLine({ status }: StatusLineProps) {
  return (
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
  );
}
