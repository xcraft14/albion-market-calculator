const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 1897 → "1,897" */
export function int(n: number): string {
  return grouped.format(n)
}

/** Compact silver amount: 9,870 · 245k · 1.23M */
export function silver(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e3)}k`
  return `${sign}${int(abs)}`
}

/** Like `silver`, with a "+" for gains. */
export function signed(n: number): string {
  return n > 0 ? `+${silver(n)}` : silver(n)
}

/** Items per day: 850 · 4.7k · 130k */
export function volume(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return int(n)
}

/** 0.312 → "31%" */
export function percent(x: number): string {
  return `${Math.round(x * 100)}%`
}

/** Age of a price: 25m · 3h */
export function age(hours: number): string {
  return hours < 1 ? `${Math.max(1, Math.round(hours * 60))}m` : `${Math.round(hours)}h`
}

export function tierLabel(tier: number, enchant: number): string {
  return `T${tier}.${enchant}`
}
