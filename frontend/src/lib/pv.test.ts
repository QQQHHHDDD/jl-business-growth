import { describe, expect, it } from "vitest";
import { netAmountFromPV, pvAndNetAmountMatch, pvFromNetAmount } from "./pv";

describe("PV conversion", () => {
  it("uses the fixed business conversion in both directions", () => {
    expect(netAmountFromPV("100")).toBe("1250.00");
    expect(pvFromNetAmount("2500.00")).toBe("200.00");
    expect(pvFromNetAmount("11.00")).toBe("0.88");
    expect(pvFromNetAmount("10.01")).toBe("0.80");
    expect(netAmountFromPV("0.88")).toBe("11.00");
    expect(netAmountFromPV("0")).toBe("0.00");
    expect(netAmountFromPV("99999999.99")).toBe("1249999999.88");
    expect(pvAndNetAmountMatch("0.88", "11.00")).toBe(true);
    expect(pvAndNetAmountMatch("0.80", "10.01")).toBe(true);
    expect(pvAndNetAmountMatch("0.81", "10.01")).toBe(false);
  });

  it("clears the paired field and ignores invalid input", () => {
    expect(netAmountFromPV("")).toBe("");
    expect(pvFromNetAmount("")).toBe("");
    expect(netAmountFromPV("invalid")).toBeNull();
  });
});
