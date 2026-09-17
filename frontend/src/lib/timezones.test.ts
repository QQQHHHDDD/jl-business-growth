import { describe, expect, it } from "vitest";
import { formatTimezoneOffset, searchTimezones } from "./timezones";

describe("timezone presentation", () => {
  it("calculates daylight-saving offsets for the selected date", () => {
    expect(formatTimezoneOffset("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe("UTC-5");
    expect(formatTimezoneOffset("America/New_York", new Date("2026-07-15T12:00:00Z"))).toBe("UTC-4");
  });

  it("searches by Chinese label, English city, IANA id and UTC offset", () => {
    const date = new Date("2026-09-17T00:00:00Z");
    expect(searchTimezones("上海", undefined, date)).toContain("Asia/Shanghai");
    expect(searchTimezones("Tokyo", undefined, date)).toContain("Asia/Tokyo");
    expect(searchTimezones("Asia/Shanghai", undefined, date)).toContain("Asia/Shanghai");
    expect(searchTimezones("UTC+8", undefined, date)).toContain("Asia/Shanghai");
  });
});
