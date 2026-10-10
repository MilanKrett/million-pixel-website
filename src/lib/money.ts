/** Format an amount in cents, without decimals when they are zero ("10 €", "€10", "0,10 €"). */
export function formatMoney(cents: number, currency: string, intlLocale: string): string {
  const whole = Math.round(cents) % 100 === 0;
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
