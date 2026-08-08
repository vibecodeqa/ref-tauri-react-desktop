import { NoteVault } from "./components/NoteVault";
import type { VaultClient } from "./ipc/client";
import { COMMANDS } from "./ipc/contract";

/** Props for {@link App}. */
export interface AppProps {
  readonly client?: VaultClient;
}

/**
 * The application shell: a header stating what the frontend is allowed to do, the note
 * vault, and a footer restating the capability posture.
 */
export function App({ client }: AppProps) {
  return (
    <main>
      <header>
        <h1>Reference Tauri React Desktop</h1>
        <p className="hint">
          Build mode: <code>{import.meta.env.MODE}</code> · Command surface:{" "}
          <code>{COMMANDS.join(", ")}</code>
        </p>
      </header>
      <NoteVault {...(client ? { client } : {})} />
      <footer>
        <p className="hint">
          The frontend has no filesystem, shell or network plugin permission.
          See
          <code> src-tauri/capabilities/default.json</code>.
        </p>
      </footer>
    </main>
  );
}
