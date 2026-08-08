import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { fakeBackend } from "./support/fakeBackend";

describe("App", () => {
  it("names the closed command surface it is allowed to use", () => {
    render(<App client={fakeBackend().client} />);

    expect(
      screen.getByRole("heading", { name: "Reference Tauri React Desktop" }),
    ).toBeTruthy();
    expect(screen.getByText(/save_note, read_note, list_notes/)).toBeTruthy();
  });

  it("states that the frontend holds no host plugin permission", () => {
    render(<App client={fakeBackend().client} />);

    expect(
      screen.getByText(/no filesystem, shell or network plugin permission/i),
    ).toBeTruthy();
  });

  it("renders the vault with whatever the backend reports", async () => {
    render(<App client={fakeBackend({ alpha: "one" }).client} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "alpha" })).toBeTruthy(),
    );
  });
});
