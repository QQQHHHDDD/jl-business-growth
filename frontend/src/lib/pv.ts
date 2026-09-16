export const NET_AMOUNT_PER_PV = 12.5;

function parsedNonNegative(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function netAmountFromPV(value: string): string | null {
  if (!value.trim()) return "";
  const parsed = parsedNonNegative(value);
  return parsed == null ? null : (parsed * NET_AMOUNT_PER_PV).toFixed(2);
}

export function pvFromNetAmount(value: string): string | null {
  if (!value.trim()) return "";
  const parsed = parsedNonNegative(value);
  if (parsed == null) return null;
  return Number((parsed / NET_AMOUNT_PER_PV).toFixed(4)).toString();
}
