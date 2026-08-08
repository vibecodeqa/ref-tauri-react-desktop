import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { Invoker, VaultClient } from "../src/ipc/client";
import { createVaultClient } from "../src/ipc/client";
import type { Note, NoteMeta } from "../src/ipc/contract";

/** An in-memory stand-in for the Rust command layer, wired through the real client. */
function fakeBackend(seed: Record<string, string> = {}) {
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
      if (body === undefined)
        throw { code: "not_found", message: "No such note." };
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
  return { invoke, client: createVaultClient(invoke) satisfies VaultClient };
}

describe("App", () => {
  it("shows the command surface it is allowed to use", async () => {
    const { client } = fakeBackend();
    render(<App client={client} />);

    expect(
      screen.getByRole("heading", { name: "Reference Tauri React Desktop" }),
    ).toBeTruthy();
    expect(screen.getByText(/save_note, read_note, list_notes/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("No notes yet.")).toBeTruthy());
  });

  it("lists the notes the backend reports", async () => {
    const { client } = fakeBackend({ alpha: "one", beta: "two" });
    render(<App client={client} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "alpha" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "beta" })).toBeTruthy();
  });

  it("saves a valid note and refreshes the list", async () => {
    const user = userEvent.setup();
    const { client, invoke } = fakeBackend();
    render(<App client={client} />);

    await user.type(screen.getByLabelText("Name"), "checklist");
    await user.type(screen.getByLabelText("Body"), "ship it");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toContain("Saved"),
    );
    expect(invoke).toHaveBeenCalledWith("save_note", {
      name: "checklist",
      body: "ship it",
    });
    expect(screen.getByRole("button", { name: "checklist" })).toBeTruthy();
  });

  it("refuses a traversal name without reaching the backend", async () => {
    const user = userEvent.setup();
    const { client, invoke } = fakeBackend();
    render(<App client={client} />);

    await user.type(screen.getByLabelText("Name"), "../escape");
    await user.type(screen.getByLabelText("Body"), "pwned");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toContain(
        "invalid_name",
      ),
    );
    expect(invoke).not.toHaveBeenCalledWith("save_note", expect.anything());
  });

  it("surfaces a backend error code to the user", async () => {
    const user = userEvent.setup();
    const { client } = fakeBackend({ alpha: "one" });
    // The note is listed, but disappears before it can be opened.
    const failing: VaultClient = {
      listNotes: () => client.listNotes(),
      saveNote: (args) => client.saveNote(args),
      readNote: () =>
        Promise.reject({ code: "not_found", message: "No such note." }),
    };
    render(<App client={failing} />);

    await user.click(await screen.findByRole("button", { name: "alpha" }));

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toContain("not_found"),
    );
  });
});
