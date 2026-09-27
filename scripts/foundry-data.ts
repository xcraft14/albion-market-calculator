// Builds foundry.json (the Artifact Foundry's melds) from the game data dumps.
// Used by build-gamedata.ts.

import type {
  FoundryCategory,
  FoundryData,
  FoundryFragment,
  FoundryRecipe,
  FragmentConversion,
} from '../src/gamedata/types.ts'

type Node = Record<string, any>
const list = (x: Node | Node[] | undefined): Node[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])

const TIERS = [4, 5, 6, 7, 8]

/** By power level (1–4), as the meld building numbers them. */
const FRAGMENTS: FoundryFragment[] = [
  { key: 'rune', name: 'Rune', code: 'RUNE' },
  { key: 'soul', name: 'Soul', code: 'SOUL' },
  { key: 'relic', name: 'Relic', code: 'RELIC' },
  { key: 'shard', name: 'Avalonian Shard', code: 'SHARD_AVALONIAN' },
]

const CATEGORIES: FoundryCategory[] = [
  { key: 'warrior', name: 'Warrior', aspect: 'red' },
  { key: 'mage', name: 'Mage', aspect: 'blue' },
  { key: 'hunter', name: 'Hunter', aspect: 'green' },
  { key: 'all', name: 'All', aspect: 'all' },
]

/** "Adept's Ancient Hammer Head" → "Ancient Hammer Head" */
function stripTier(name: string): string {
  return name.replace(/^(Adept's|Expert's|Master's|Grandmaster's|Elder's) /, '')
}

const withoutTier = (id: string) => id.replace(/^T\d_/, '')

export function buildFoundry(items: Node, buildings: Node, loot: Node, names: Map<string, string>): FoundryData {
  const meld = list(buildings.buildings.meldbuilding).find((b) => b['@uniquename'] === 'T8_MELDBUILDING')
  if (!meld) throw new Error('no T8_MELDBUILDING in buildings.json')
  const lootLists = new Map<string, Node>(list(loot.LootDefinition.Lootlist).map((l) => [l['@name'], l]))
  const simple = new Map<string, Node>(list(items.simpleitem).map((i) => [i['@uniquename'], i]))

  /** A pool's artifacts. The average price is only the expected value if they all have the same chance. */
  function pool(name: string): string[] {
    const entries = list(lootLists.get(name)?.OR?.Item)
    if (!entries.length) throw new Error(`empty loot list ${name}`)
    const weights = new Set(entries.map((e) => e['@weight']))
    if (weights.size !== 1) throw new Error(`${name}: artifacts have different chances (${[...weights].join(', ')})`)
    return entries.map((e) => e['@type'])
  }

  const recipes: FoundryRecipe[] = list(meld.meldingcombinations.combination).map((c) => {
    const fragment = FRAGMENTS[Number(c['@powerlevel']) - 1]
    const category = CATEGORIES.find((cat) => cat.aspect === c['@aspect'])
    const needed = list(c.neededitem)
    if (!fragment || !category || needed.length !== 1) throw new Error(`unexpected meld ${c['@lootlist']}`)
    const tier = Number(c['@tier'])
    const fragmentId = `T${tier}_${fragment.code}`
    if (needed[0]['@uniquename'] !== fragmentId) throw new Error(`${c['@lootlist']} needs ${needed[0]['@uniquename']}`)
    return {
      tier,
      fragment: fragment.key,
      category: category.key,
      fragmentId,
      count: Number(needed[0]['@quantity']),
      pool: pool(c['@lootlist']),
    }
  })

  // Every tier has the same pools, and All is the other three together.
  if (recipes.length !== TIERS.length * FRAGMENTS.length * CATEGORIES.length) {
    throw new Error(`expected 80 melds, found ${recipes.length}`)
  }
  const find = (tier: number, fragment: string, category: string) =>
    recipes.find((r) => r.tier === tier && r.fragment === fragment && r.category === category)
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
  for (const r of recipes) {
    const t4 = find(4, r.fragment, r.category)!
    if (!sameSet(r.pool.map(withoutTier), t4.pool.map(withoutTier))) {
      throw new Error(`T${r.tier} ${r.fragment} ${r.category}: pool differs from T4`)
    }
    if (r.pool.some((id) => !id.startsWith(`T${r.tier}_ARTEFACT_`))) throw new Error(`${r.fragmentId}: odd pool item`)
    if (r.category === 'all') {
      const parts = ['warrior', 'mage', 'hunter'].flatMap((c) => find(r.tier, r.fragment, c)!.pool)
      if (!sameSet(r.pool, parts)) throw new Error(`T${r.tier} ${r.fragment}: All isn't the three pools together`)
    }
  }

  // Fragment recipes at the foundry: 5 of the tier below, or the power level below + silver.
  // (Their other recipes turn guild tokens into fragments.)
  const conversions: Record<string, FragmentConversion[]> = {}
  for (const tier of TIERS) {
    for (const f of FRAGMENTS) {
      const id = `T${tier}_${f.code}`
      const item = simple.get(id)
      if (!item) throw new Error(`missing fragment ${id}`)
      conversions[id] = list(item.craftingrequirements)
        .map((req) => ({ req, resources: list(req.craftresource) }))
        .filter(({ resources }) => resources.length === 1 && !resources[0]['@uniquename'].includes('GVGTOKEN'))
        .map(({ req, resources }) => ({
          from: resources[0]['@uniquename'],
          count: Number(resources[0]['@count']),
          silver: Number(req['@silver'] ?? 0),
        }))
    }
  }

  const artifactNames: Record<string, string> = {}
  for (const r of recipes) {
    for (const id of r.pool) {
      const name = names.get(id)
      if (!name) throw new Error(`no English name for ${id}`)
      artifactNames[withoutTier(id)] ??= stripTier(name)
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    fragments: FRAGMENTS,
    categories: CATEGORIES,
    recipes,
    conversions,
    names: artifactNames,
  }
}
