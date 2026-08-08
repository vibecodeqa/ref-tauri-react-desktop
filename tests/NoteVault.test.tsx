import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NoteVault } from "../src/components/NoteVault";
import type { VaultClient } from "../src/ipc/client";
import { fakeBackend } from "./support/fakeBackend";

describe("NoteVault", () => {
  it("starts empty", async () => {
    render(<NoteVault client={fakeBackend().client} />);
    await waitFor(() => expect(screen.getByText("No notes yet.")).toBeTruthy());
  });

  it("lists every note the backend reports", async () => {
    render(
      <NoteVault client={fakeBackend({ alpha: "one", beta: "two" }).client} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "alpha" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "beta" })).toBeTruthy();
  });

  it("saves a valid note and refreshes the list", async () => {
    const user = userEvent.setup();
    const { client, invoke } = fakeBackend();
    render(<NoteVault client={client} />);

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
    render(<NoteVault client={client} />);

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

  it("loads a note back into the form when it is opened", async () => {
    const user = userEvent.setup();
    render(<NoteVault client={fakeBackend({ alpha: "one" }).client} />);

    await user.click(await screen.findByRole("button", { name: "alpha" }));

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toContain(
        "Loaded alpha",
      ),
    );
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
      "one",
    );
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
    render(<NoteVault client={failing} />);

    await user.click(await screen.findByRole("button", { name: "alpha" }));

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toContain("not_found"),
    );
  });
});
