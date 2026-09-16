const fallbackTimezones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

export function supportedTimezones(current?: string): string[] {
  const nativeValues = (Intl as IntlWithSupportedValues).supportedValuesOf?.("timeZone") ?? fallbackTimezones;
  return Array.from(new Set([...(current ? [current] : []), "UTC", ...nativeValues])).sort((left, right) => left.localeCompare(right));
}

export function isSupportedTimezone(value: string, current?: string): boolean {
  return supportedTimezones(current).includes(value);
}
