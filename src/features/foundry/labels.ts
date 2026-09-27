// Names and colours for the foundry page.

import type { FoundryCategoryKey, FoundryData } from '../../gamedata/types'

/** The foundry's category colours: red, blue, green, and gold for all three together. */
export const CATEGORY_COLORS: Record<FoundryCategoryKey, string> = {
  warrior: '#ef6f6c',
  mage: '#6aa9f5',
  hunter: '#5cc98a',
  all: 'var(--accent)',
}

export const TIERS = [4, 5, 6, 7, 8]

/** `T6_SHARD_AVALONIAN` → "T6 Avalonian Shard" */
export function fragmentLabel(data: FoundryData, id: string): string {
  const [, tier, code] = id.match(/^T(\d)_(.+)$/) ?? []
  return `T${tier} ${data.fragments.find((f) => f.code === code)?.name ?? code}`
}

/** For sentences: "Rune" → "rune" or "runes", "Avalonian Shard" → "Avalonian shard" or "Avalonian shards". */
export const fragmentNoun = (name: string, plural = false) =>
  name.replace(/\w+$/, (word) => word.toLowerCase()) + (plural ? 's' : '')
