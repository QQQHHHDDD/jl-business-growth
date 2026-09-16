import { describe, expect, it } from "vitest";
import { netAmountFromPV, pvFromNetAmount } from "./pv";

describe("PV conversion", () => {
  it("uses the fixed business conversion in both directions", () => {
    expect(netAmountFromPV("100")).toBe("1250.00");
    expect(pvFromNetAmount("2500.00")).toBe("200");
  });

  it("clears the paired field and ignores invalid input", () => {
    expect(netAmountFromPV("")).toBe("");
    expect(pvFromNetAmount("")).toBe("");
    expect(netAmountFromPV("invalid")).toBeNull();
  });
});
