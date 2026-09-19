export const NET_AMOUNT_PER_PV = 12.5;

function decimalHundredths(value: string): bigint | null {
  const match = /^\s*(\d+)(?:\.(\d*))?\s*$/.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(3, "0");
  const base = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2));
  return base + (Number(fraction[2]) >= 5 ? 1n : 0n);
}

function formatHundredths(value: bigint): string {
  const whole = value / 100n;
  const fraction = String(value % 100n).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function netAmountFromPV(value: string): string | null {
  if (!value.trim()) return "";
  const pvHundredths = decimalHundredths(value);
  if (pvHundredths == null) return null;
  const amountCents = (pvHundredths * 25n + 1n) / 2n;
  return formatHundredths(amountCents);
}

export function pvFromNetAmount(value: string): string | null {
  if (!value.trim()) return "";
  const amountCents = decimalHundredths(value);
  if (amountCents == null) return null;
  const pvHundredths = (amountCents * 2n + 12n) / 25n;
  return formatHundredths(pvHundredths);
}

export function pvAndNetAmountMatch(pv: string, netAmount: string): boolean {
  const pvHundredths = decimalHundredths(pv);
  const amountCents = decimalHundredths(netAmount);
  if (pvHundredths == null || amountCents == null) return false;
  return pvHundredths === (amountCents * 2n + 12n) / 25n;
}
