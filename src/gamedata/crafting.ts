// The crafting data is large (all weapons, armour, capes and bags), so it's only loaded when the
// Crafting page opens.

import type { CraftingData } from './types'

let loading: Promise<CraftingData> | null = null

export function loadCraftingData(): Promise<CraftingData> {
  loading ??= import('./crafting.json').then((m) => m.default as unknown as CraftingData)
  return loading
}
