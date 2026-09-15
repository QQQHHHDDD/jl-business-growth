export function formatMoney(value: string | number | null | undefined): string {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(amount)) return "¥0.00";
  return `¥${amount.toFixed(2)}`;
}

