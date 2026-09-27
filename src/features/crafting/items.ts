// Small helpers for showing crafting items.

import type { CraftItem, CraftRecipe, CraftingData, TreeNode } from '../../gamedata/types'

/** The recipe that stands for the item in tiles and icons: T4.0, or the lowest tier. */
export const mainRecipe = (item: CraftItem): CraftRecipe =>
  item.recipes.find((r) => r.tier === 4 && !r.enchant) ?? item.recipes[0]

export const iconOf = (item: CraftItem) => mainRecipe(item).id

/** Tree branches above an item, e.g. Weapons › Sword or Armor › Plate › Helmet. */
export function treePath(data: CraftingData, key: string, nodes: TreeNode[] = data.tree): TreeNode[] | null {
  for (const node of nodes) {
    if (node.items?.includes(key)) return [node]
    const below = treePath(data, key, node.children ?? [])
    if (below) return [node, ...below]
  }
  return null
}
