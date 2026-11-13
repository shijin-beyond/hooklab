import { describe, expect, it } from "vitest";

import * as hooklab from "../src/index.js";

describe("package entrypoint", () => {
  it("imports cleanly as an ES module", () => {
    expect(hooklab).toBeTypeOf("object");
  });
});
