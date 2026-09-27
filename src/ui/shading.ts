/**
 * Green for profit, red for loss, stronger the bigger the margin. Uses profit % so low and high
 * tiers are comparable: full green at +100%, full red at −50%. Takes the best of the given margins.
 */
export function profitTint(margins: (number | null | undefined)[]): string {
  const known = margins.filter((p): p is number => p !== null && p !== undefined)
  if (!known.length) return ''
  const margin = Math.max(...known)
  const strength = margin >= 0 ? Math.min(1, margin / 1) : Math.min(1, -margin / 0.5)
  const alpha = (0.06 + 0.54 * strength ** 0.7).toFixed(2)
  return margin >= 0 ? `background-color: rgb(34 197 94 / ${alpha})` : `background-color: rgb(239 68 68 / ${alpha})`
}
