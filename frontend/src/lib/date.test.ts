import { describe, expect, it } from "vitest";
import {
  businessDate,
  businessRange,
  formatDateTimeInTimezone,
  reviewPeriodEnd,
  reviewPeriodStart,
  zonedDateTimeToISO,
} from "./date";

describe("business date ranges", () => {
  it("converts account timezone wall time without using the browser timezone", () => {
    expect(formatDateTimeInTimezone("2026-09-16T06:00:00Z", "Asia/Shanghai")).toBe("2026-09-16T14:00");
    expect(zonedDateTimeToISO("2026-09-16T14:00", "Asia/Shanghai")).toBe("2026-09-16T06:00:00.000Z");
    expect(zonedDateTimeToISO("2026-07-01T14:00", "America/New_York")).toBe("2026-07-01T18:00:00.000Z");
  });

  it("uses Monday through Sunday for a natural week", () => {
    const range = businessRange(
      "Asia/Shanghai",
      "week",
      new Date("2026-09-16T04:00:00Z"),
    );
    expect(range).toEqual({
      from: "2026-09-14",
      to: "2026-09-20",
      granularity: "day",
    });
  });

  it.each([
    ["Monday", "2026-09-14T03:00:00Z", "2026-09-14", "2026-09-20"],
    ["Sunday", "2026-09-20T03:00:00Z", "2026-09-14", "2026-09-20"],
    ["cross-month", "2026-10-01T03:00:00Z", "2026-09-28", "2026-10-04"],
    ["cross-year", "2027-01-01T03:00:00Z", "2026-12-28", "2027-01-03"],
  ])("handles the %s week boundary", (_label, now, from, to) => {
    expect(businessRange("Asia/Shanghai", "week", new Date(now))).toMatchObject({
      from,
      to,
    });
  });

  it("returns calendar-year and fiscal-year closed ranges", () => {
    const now = new Date("2026-09-16T04:00:00Z");
    expect(businessRange("Asia/Shanghai", "calendarYear", now)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
      granularity: "month",
    });
    expect(businessRange("Asia/Shanghai", "fiscalYear", now)).toEqual({
      from: "2026-09-01",
      to: "2027-08-31",
      granularity: "month",
    });
  });

  it.each([
    ["2026-09-01T00:00:00+08:00", "2026-09-01", "2027-08-31"],
    ["2027-08-31T12:00:00+08:00", "2026-09-01", "2027-08-31"],
  ])("keeps fiscal boundary %s in the same fiscal year", (now, from, to) => {
    expect(businessRange("Asia/Shanghai", "fiscalYear", new Date(now))).toMatchObject({
      from,
      to,
    });
  });

  it("honors a DST timezone when deriving the business date", () => {
    const instant = new Date("2026-03-09T03:30:00Z");
    expect(businessDate("America/New_York", instant)).toBe("2026-03-08");
    expect(businessRange("America/New_York", "week", instant)).toMatchObject({
      from: "2026-03-02",
      to: "2026-03-08",
    });
  });

  it("derives review starts and closed ends", () => {
    const now = new Date("2026-09-16T04:00:00Z");
    expect(reviewPeriodStart("Asia/Shanghai", "DAILY", now)).toBe("2026-09-16");
    expect(reviewPeriodStart("Asia/Shanghai", "WEEKLY", now)).toBe("2026-09-14");
    expect(reviewPeriodStart("Asia/Shanghai", "MONTHLY", now)).toBe("2026-09-01");
    expect(reviewPeriodEnd("2026-09-14", "WEEKLY")).toBe("2026-09-20");
    expect(reviewPeriodEnd("2026-02-01", "MONTHLY")).toBe("2026-02-28");
  });
});
