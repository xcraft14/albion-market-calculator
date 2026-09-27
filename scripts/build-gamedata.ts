// Downloads the game data dumps from ao-bin-dumps and writes the small JSON files the site needs.
// Run after a game patch: npm run gamedata

import { writeFile } from 'node:fs/promises'
import type { Ingredient, RefiningData, RefiningFamily, RefiningRecipe } from '../src/gamedata/types.ts'
import { buildCrafting } from './crafting-data.ts'

const DUMPS = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master'
const OUT = new URL('../src/gamedata/refining.json', import.meta.url)
const CRAFTING_OUT = new URL('../src/gamedata/crafting.json', import.meta.url)

const FAMILIES = [
  { key: 'metalbar', name: 'Metal Bar', rawName: 'Ore', raw: 'ORE', refined: 'METALBAR', category: 'ore' },
  { key: 'planks', name: 'Planks', rawName: 'Wood', raw: 'WOOD', refined: 'PLANKS', category: 'wood' },
  { key: 'cloth', name: 'Cloth', rawName: 'Fiber', raw: 'FIBER', refined: 'CLOTH', category: 'fiber' },
  { key: 'leather', name: 'Leather', rawName: 'Hide', raw: 'HIDE', refined: 'LEATHER', category: 'hide' },
  { key: 'stoneblock', name: 'Stone Block', rawName: 'Stone', raw: 'ROCK', refined: 'STONEBLOCK', category: 'rock' },
]

// The dumps are XML converted to JSON: attributes are prefixed with "@", and a
// single child element is an object instead of a one-element array.
type Node = Record<string, any>
const list = (x: Node | Node[] | undefined): Node[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])

/** `T5_ORE_LEVEL1` → `T5_ORE_LEVEL1@1` (the ID the market API uses). */
function marketId(uniqueName: string): string {
  const level = uniqueName.match(/_LEVEL(\d)$/)
  return level ? `${uniqueName}@${level[1]}` : uniqueName
}

async function fetchJson(path: string): Promise<Node> {
  const res = await fetch(`${DUMPS}/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as Node
}

async function fetchClusterNames(): Promise<Map<string, string>> {
  const res = await fetch(`${DUMPS}/formatted/world.txt`)
  if (!res.ok) throw new Error(`world.txt: HTTP ${res.status}`)
  const names = new Map<string, string>()
  for (const line of (await res.text()).split('\n')) {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/)
    if (m) names.set(m[1], m[2])
  }
  return names
}

/** English item names: `  6201: T4_JOURNAL_WARRIOR   : Adept Blacksmith's Journal (Partially Full)` */
async function fetchItemNames(): Promise<Map<string, string>> {
  const res = await fetch(`${DUMPS}/formatted/items.txt`)
  if (!res.ok) throw new Error(`items.txt: HTTP ${res.status}`)
  const names = new Map<string, string>()
  for (const line of (await res.text()).split('\n')) {
    const m = line.match(/^\s*\d+:\s*(\S+)\s*:\s*(.+?)\s*$/)
    if (m && !names.has(m[1])) names.set(m[1], m[2])
  }
  return names
}

function buildRecipe(item: Node, rawCode: string): RefiningRecipe {
  // Refined resources also have a faction-token recipe; use the plain one.
  const requirement = list(item.craftingrequirements).find(
    (req) => !list(req.craftresource).some((r) => r['@uniquename'].includes('FACTION')),
  )
  if (!requirement) throw new Error(`${item['@uniquename']}: no plain recipe`)

  const ingredients: Ingredient[] = list(requirement.craftresource).map((r) => ({
    id: marketId(r['@uniquename']),
    count: Number(r['@count']),
  }))
  const raw = ingredients.find((i) => i.id.includes(`_${rawCode}`))
  if (!raw) throw new Error(`${item['@uniquename']}: no raw ingredient`)

  return {
    id: marketId(item['@uniquename']),
    tier: Number(item['@tier']),
    enchant: Number(item['@enchantmentlevel'] ?? 0),
    itemValue: Number(item['@itemvalue']),
    focus: Number(requirement['@craftingfocus']),
    amount: Number(requirement['@amountcrafted'] ?? 1),
    ingredients,
    raw,
    lower: ingredients.find((i) => i !== raw) ?? null,
  }
}

async function main() {
  const [items, modifiers, clusterNames, itemNames] = await Promise.all([
    fetchJson('items.json'),
    fetchJson('craftingmodifiers.json'),
    fetchClusterNames(),
    fetchItemNames(),
  ])

  const byName = new Map<string, Node>(list(items.items.simpleitem).map((i) => [i['@uniquename'], i]))

  // Royal cities share a base refining bonus; one of them adds a specialization per resource.
  const locations = list(modifiers.craftingmodifiers.craftinglocation).filter((l) => l['@clusterid'])
  const royal = locations.filter((l) => l.refiningbonus?.['@value'] === '0.18')
  const royalCityBonus = Number(royal[0].refiningbonus['@value'])
  let specializationBonus = 0

  const families: RefiningFamily[] = FAMILIES.map((f) => {
    const recipes: RefiningRecipe[] = []
    for (let tier = 2; tier <= 8; tier++) {
      for (let enchant = 0; enchant <= (tier >= 4 ? 4 : 0); enchant++) {
        const name = `T${tier}_${f.refined}${enchant ? `_LEVEL${enchant}` : ''}`
        const item = byName.get(name)
        // Not every family has enchanted versions (stone blocks don't).
        if (!item && enchant > 0) continue
        if (!item) throw new Error(`missing item ${name}`)
        recipes.push(buildRecipe(item, f.raw))
      }
    }

    const bonusLocation = royal.find((l) =>
      list(l.craftingmodifier).some((m) => m['@name'] === f.category),
    )
    if (!bonusLocation) throw new Error(`${f.key}: no specialization city`)
    const modifier = list(bonusLocation.craftingmodifier).find((m) => m['@name'] === f.category)!
    specializationBonus = Number(modifier['@value'])

    return {
      key: f.key,
      name: f.name,
      rawName: f.rawName,
      bonusCity: clusterNames.get(bonusLocation['@clusterid']) ?? bonusLocation['@clusterid'],
      recipes,
    }
  })

  const data: RefiningData = {
    generatedAt: new Date().toISOString(),
    royalCityBonus,
    specializationBonus,
    families,
  }
  await writeFile(OUT, JSON.stringify(data, null, 1) + '\n')

  for (const f of families) {
    console.log(`${f.name.padEnd(12)} ${f.recipes.length} recipes, bonus city ${f.bonusCity}`)
  }
  console.log(`royal city bonus ${royalCityBonus}, specialization bonus ${specializationBonus}`)

  const crafting = buildCrafting(items.items, modifiers, clusterNames, itemNames)
  // Compact: the file is large and only loaded when the Crafting page opens.
  await writeFile(CRAFTING_OUT, JSON.stringify(crafting) + '\n')
  const recipes = crafting.items.reduce((n, i) => n + i.recipes.length, 0)
  console.log(
    `crafting: ${crafting.items.length} items, ${recipes} recipes, ${Object.keys(crafting.ingredients).length} ingredients`,
  )
}

await main()
