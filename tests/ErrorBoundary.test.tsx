import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

let shouldExplode = true;

function Flaky() {
  if (shouldExplode) throw new Error("render exploded");
  return <p>recovered</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldExplode = true;
    // React logs the caught error itself; silence it so a passing run stays readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children when nothing fails", () => {
    shouldExplode = false;
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered")).toBeTruthy();
  });

  it("shows an alert instead of a blank window", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("render exploded")).toBeTruthy();
    expect(onError).toHaveBeenCalled();
  });

  it("recovers when the retry control is used", async () => {
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    shouldExplode = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
