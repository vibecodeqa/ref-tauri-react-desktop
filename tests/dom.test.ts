import { afterEach, describe, expect, it } from "vitest";
import { requireElement } from "../src/dom";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("requireElement", () => {
  it("returns the mount point when it exists", () => {
    document.body.innerHTML = '<div id="root"></div>';
    expect(requireElement("root").id).toBe("root");
  });

  it("throws a named error when the mount point is missing", () => {
    expect(() => requireElement("root")).toThrow(
      "Missing #root container in index.html",
    );
  });
});
