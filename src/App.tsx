import { NoteVault } from "./components/NoteVault";
import type { VaultClient } from "./ipc/client";
import { COMMANDS } from "./ipc/contract";

export interface AppProps {
  readonly client?: VaultClient;
}

export function App({ client }: AppProps) {
  return (
    <main>
      <header>
        <h1>Reference Tauri React Desktop</h1>
        <p className="hint">
          Build mode: <code>{__APP_MODE__}</code> · Command surface:{" "}
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
