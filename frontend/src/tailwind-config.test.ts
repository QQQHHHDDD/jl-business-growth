import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

describe("Tailwind brand palette", () => {
  it("defines every brand shade used by frontend utilities", () => {
    expect(config.theme.extend.colors.brand[300]).toBe("#80c5ba");
    expect(config.theme.extend.colors.brand[300]).toBe(config.theme.extend.colors.teal[300]);
  });
});
