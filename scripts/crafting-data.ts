// Builds crafting.json (weapons, armour, capes and bags) from the game data dumps.
// Used by build-gamedata.ts.

import type {
  CraftIngredient,
  CraftItem,
  CraftRecipe,
  CraftSlot,
  CraftingData,
  IngredientKind,
  JournalKind,
  TreeNode,
} from '../src/gamedata/types.ts'

type Node = Record<string, any>
const list = (x: Node | Node[] | undefined): Node[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])

const TIERS = [2, 3, 4, 5, 6, 7, 8]

const WEAPON_TREES: [subcategory: string, name: string][] = [
  ['sword', 'Sword'],
  ['axe', 'Axe'],
  ['mace', 'Mace'],
  ['hammer', 'Hammer'],
  ['knuckles', 'War Gloves'],
  ['crossbow', 'Crossbow'],
  ['bow', 'Bow'],
  ['spear', 'Spear'],
  ['dagger', 'Dagger'],
  ['quarterstaff', 'Quarterstaff'],
  ['shapeshifterstaff', 'Shapeshifter Staff'],
  ['firestaff', 'Fire Staff'],
  ['holystaff', 'Holy Staff'],
  ['arcanestaff', 'Arcane Staff'],
  ['froststaff', 'Frost Staff'],
  ['cursestaff', 'Cursed Staff'],
  ['naturestaff', 'Nature Staff'],
]
const ARMOR_MATERIALS = ['plate', 'leather', 'cloth']
const ARMOR_SLOTS: [shopcategory: string, name: string, suffix: string][] = [
  ['head', 'Helmet', 'helmet'],
  ['armors', 'Armor', 'armor'],
  ['shoes', 'Shoes', 'shoes'],
]

const JOURNAL_KINDS: JournalKind[] = ['WARRIOR', 'HUNTER', 'MAGE', 'TOOLMAKER']

const MATERIAL_NAMES: Record<string, string> = {
  metalbar: 'Metal Bar',
  leather: 'Leather',
  cloth: 'Cloth',
  planks: 'Planks',
}

/** Which kind of ingredient an item is. Source settings are saved per kind. */
function kindOf(uniqueName: string): IngredientKind {
  const material = uniqueName.match(/^T\d_(METALBAR|LEATHER|CLOTH|PLANKS)(_LEVEL\d)?$/)
  if (material) return material[1].toLowerCase() as IngredientKind
  if (uniqueName.includes('_ARTEFACT_TOKEN_FAVOR')) return 'token'
  if (uniqueName.includes('_ARTEFACT_')) return 'artifact'
  if (uniqueName.startsWith('QUESTITEM_TOKEN_ROYAL')) return 'sigil'
  if (/^QUESTITEM_TOKEN_(AVALON|MISTS)$/.test(uniqueName)) return 'energy'
  if (/^T\d_CAPE$/.test(uniqueName)) return 'cape'
  if (uniqueName.endsWith('_BP')) return 'crest'
  if (/_FACTION_\w+_TOKEN_\d$/.test(uniqueName)) return 'heart'
  if (uniqueName.includes('_SKILLBOOK_')) return 'tome'
  if (uniqueName.includes('_ALCHEMY_')) return 'part'
  if (/^T\d_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)_SET\d$/.test(uniqueName)) return 'base'
  throw new Error(`unknown ingredient type: ${uniqueName}`)
}

/** Market item ID of a recipe ingredient: `T4_METALBAR_LEVEL1@1`, `T4_CAPE@2`, `T4_ARTEFACT_…`. */
function resourceId(r: Node): string {
  const name: string = r['@uniquename']
  const level = name.match(/_LEVEL(\d)$/)?.[1] ?? r['@enchantmentlevel']
  return Number(level) > 0 ? `${name}@${level}` : name
}

/** "Adept's Kingmaker" → "Kingmaker" */
function stripTier(name: string): string {
  return name.replace(/^(Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's) /, '')
}

export function buildCrafting(items: Node, modifiers: Node, clusterNames: Map<string, string>, names: Map<string, string>) {
  const simple = list(items.simpleitem)
  const gear = [...list(items.weapon), ...list(items.equipmentitem), ...list(items.transformationweapon)]
  const byName = new Map<string, Node>(
    [...simple, ...gear, ...list(items.journalitem)].map((i) => [i['@uniquename'], i]),
  )

  // Every item's recipes by market ID, including the enchanted versions nested in gear.
  const recipesOf = new Map<string, Node[]>()
  const fameValue = new Map<string, number>()
  const fameFactor = new Map<string, number>()
  for (const item of [...simple, ...gear]) {
    const name: string = item['@uniquename']
    const level = name.match(/_LEVEL(\d)$/)?.[1]
    const id = level ? `${name}@${level}` : name
    recipesOf.set(id, list(item.craftingrequirements))
    if (item['@famevalue'] !== undefined) fameValue.set(id, Number(item['@famevalue']))
    if (item['@destinyandjournalcraftfamefactor']) fameFactor.set(id, Number(item['@destinyandjournalcraftfamefactor']))
    for (const e of list(item.enchantments?.enchantment)) {
      const eid = `${name}@${e['@enchantmentlevel']}`
      recipesOf.set(eid, list(e.craftingrequirements))
      // Royal items and faction capes give no fame at any enchantment.
      if (item['@famevalue'] !== undefined) fameValue.set(eid, Number(item['@famevalue']))
      if (fameFactor.has(id)) fameFactor.set(eid, fameFactor.get(id)!)
    }
  }

  /** Item value: from the game data, or the sum of the ingredients' values (gear has none of its own). */
  const valueMemo = new Map<string, number>()
  function itemValue(id: string): number {
    if (valueMemo.has(id)) return valueMemo.get(id)!
    const item = byName.get(id.replace(/@\d$/, ''))
    let value = item?.['@itemvalue'] !== undefined && !item.enchantments ? Number(item['@itemvalue']) : NaN
    if (Number.isNaN(value)) {
      const req = recipesOf.get(id)?.[0]
      value = req ? list(req.craftresource).reduce((sum, r) => sum + Number(r['@count']) * itemValue(resourceId(r)), 0) : 0
    }
    valueMemo.set(id, value)
    return value
  }

  /**
   * Crafting fame of one craft, which is what fills labourer journals: resources carry a fame value,
   * crafted items sum their ingredients' fame, times the item's journal fame factor (1.4 for artifact gear).
   */
  const fameMemo = new Map<string, number>()
  function fame(id: string): number {
    if (fameValue.has(id)) return fameValue.get(id)!
    if (fameMemo.has(id)) return fameMemo.get(id)!
    fameMemo.set(id, 0)
    const req = recipesOf.get(id)?.[0]
    const total = req
      ? list(req.craftresource).reduce((sum, r) => sum + Number(r['@count']) * fame(resourceId(r)), 0) /
        Number(req['@amountcrafted'] ?? 1)
      : 0
    const result = total * (fameFactor.get(id) ?? 1)
    fameMemo.set(id, result)
    return result
  }

  const ingredients: Record<string, CraftIngredient> = {}
  function addIngredient(id: string) {
    if (ingredients[id]) return
    const kind = kindOf(id.replace(/@\d$/, ''))
    const name = MATERIAL_NAMES[kind] ?? stripTier(names.get(id.replace(/@\d$/, '')) ?? id)
    ingredients[id] = { name, kind, itemValue: itemValue(id) }
  }

  function buildSlots(requirements: Node[]): CraftSlot[] {
    // Alternative recipes (artifact or token, or one of three base items) differ in one slot.
    const [first, ...alternatives] = requirements.map((req) => list(req.craftresource))
    return first.map((r, i) => {
      const options = [resourceId(r)]
      for (const alt of alternatives) {
        const id = resourceId(alt[i])
        if (Number(alt[i]['@count']) !== Number(r['@count'])) throw new Error(`alternative with another count: ${id}`)
        if (!options.includes(id)) options.push(id)
      }
      options.forEach(addIngredient)
      const slot: CraftSlot = { options, count: Number(r['@count']), returned: r['@maxreturnamount'] !== '0' }
      if (r['@preservequality'] === 'true') slot.preserveQuality = true
      return slot
    })
  }

  function buildRecipe(id: string, tier: number, enchant: number): CraftRecipe | null {
    const requirements = recipesOf.get(id)
    if (!requirements?.length) return null
    return {
      id,
      tier,
      enchant,
      focus: Number(requirements[0]['@craftingfocus'] ?? 0),
      itemValue: itemValue(id),
      fame: Math.round(fame(id) * 1000) / 1000,
      slots: buildSlots(requirements),
    }
  }

  // Labourer journals: which items fill which journal, and how much fame a journal holds per tier.
  const journalOf = new Map<string, JournalKind>()
  const journals = JOURNAL_KINDS.map((kind) => {
    const maxFame: Record<number, number> = {}
    for (const tier of TIERS) {
      const j = byName.get(`T${tier}_JOURNAL_${kind}`)
      if (!j) continue
      maxFame[tier] = Number(j['@maxfame'])
      for (const v of list(j.famefillingmissions?.craftitemfame?.validitem)) journalOf.set(v['@id'], kind)
    }
    const name = (names.get(`T4_JOURNAL_${kind}`) ?? kind).replace(/^Adept /, '').replace(/ \(Partially Full\)$/, '')
    return { kind, name, maxFame }
  })

  // Crafting bonus: every royal city and Brecilien give a base bonus; one of them adds a bonus per category.
  const locations = list(modifiers.craftingmodifiers.craftinglocation).filter(
    (l) => l['@clusterid'] && l.craftingbonus && clusterNames.has(l['@clusterid']),
  )
  const cityLocations = locations.filter((l) =>
    ['Bridgewatch', 'Caerleon', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Brecilien'].includes(
      clusterNames.get(l['@clusterid'])!,
    ),
  )
  const craftingBonus = Number(cityLocations[0].craftingbonus['@value'])
  const categoryBonus: Record<string, { city: string; bonus: number }> = {}
  for (const l of cityLocations) {
    for (const m of list(l.craftingmodifier)) {
      categoryBonus[m['@name']] = { city: clusterNames.get(l['@clusterid'])!, bonus: Number(m['@value']) }
    }
  }

  // All items in scope, grouped by shop category. Items that can't be traded (hidden from the
  // marketplace, unreleased prototypes) and internal ones without an English name are left out.
  const inScope = gear.filter(
    (i) =>
      i['@tier'] &&
      Number(i['@tier']) >= 2 &&
      !i['@uniquename'].startsWith('UNIQUE') &&
      !i['@uniquename'].includes('PROTOTYPE') &&
      i.craftingrequirements &&
      i['@showinmarketplace'] !== 'false' &&
      names.has(i['@uniquename']) &&
      ['weapons', 'armors', 'head', 'shoes', 'capes', 'bags'].includes(i['@shopcategory']),
  )
  const itemsByKey = new Map<string, CraftItem>()
  const keysBySubcategory = new Map<string, string[]>()
  for (const i of inScope) {
    const key = i['@uniquename'].replace(/^T\d_/, '')
    if (itemsByKey.has(key)) continue
    const variants = TIERS.map((t) => byName.get(`T${t}_${key}`)).filter((v) => v !== undefined)
    const recipes: CraftRecipe[] = []
    for (const v of variants) {
      const tier = Number(v['@tier'])
      for (let enchant = 0; enchant <= 4; enchant++) {
        const recipe = buildRecipe(enchant ? `T${tier}_${key}@${enchant}` : `T${tier}_${key}`, tier, enchant)
        if (recipe) recipes.push(recipe)
      }
    }
    const first = variants[0]
    const journal = recipes.some((r) => r.fame > 0) ? (journalOf.get(first['@uniquename']) ?? null) : null
    itemsByKey.set(key, {
      key,
      name: stripTier(names.get(first['@uniquename']) ?? key),
      category: first['@craftingcategory'] ?? null,
      bonusCity: null,
      journal,
      recipes,
    })
    const group = `${i['@shopcategory']}/${i['@shopsubcategory1']}`
    keysBySubcategory.set(group, [...(keysBySubcategory.get(group) ?? []), key])
  }

  // Upgrade recipes (royal items, faction capes) have no category of their own: they're crafted where
  // their base item is, since only the base item's materials are returned.
  for (const item of itemsByKey.values()) {
    if (!item.category) {
      const base = item.recipes[0].slots.find((s) => s.preserveQuality)?.options[0]
      const baseItem = base ? itemsByKey.get(base.replace(/^T\d_/, '').replace(/@\d$/, '')) : undefined
      item.category = baseItem?.category ?? null
    }
    item.bonusCity = (item.category && categoryBonus[item.category]?.city) || null
  }

  const node = (key: string, name: string, groupKey: string): TreeNode => {
    const keys = keysBySubcategory.get(groupKey)
    if (!keys?.length) throw new Error(`empty tree node ${groupKey}`)
    return { key, name, items: keys }
  }
  const capes = [...keysBySubcategory.entries()].filter(([g]) => g.startsWith('capes/')).flatMap(([, keys]) => keys)
  const tree: TreeNode[] = [
    {
      key: 'weapons',
      name: 'Weapons',
      children: WEAPON_TREES.map(([sub, name]) => node(`weapons/${sub}`, name, `weapons/${sub}`)),
    },
    {
      key: 'armor',
      name: 'Armor',
      children: ARMOR_MATERIALS.map((material) => ({
        key: `armor/${material}`,
        name: material[0].toUpperCase() + material.slice(1),
        children: ARMOR_SLOTS.map(([shop, name, suffix]) =>
          node(`armor/${material}/${suffix}`, `${name}`, `${shop}/${material}_${suffix}`),
        ),
      })),
    },
    // The basic Cape first, then the city and faction capes.
    { key: 'capes', name: 'Capes', items: ['CAPE', ...capes.filter((k) => k !== 'CAPE')] },
    { key: 'bags', name: 'Bags', items: [...keysBySubcategory.get('bags/bags')!, ...keysBySubcategory.get('bags/satchels')!] },
  ]

  // Everything in the tree must be an item, and every item must be in the tree.
  const treeKeys = new Set<string>()
  const walk = (n: TreeNode) => {
    n.items?.forEach((k) => treeKeys.add(k))
    n.children?.forEach(walk)
  }
  tree.forEach(walk)
  for (const key of itemsByKey.keys()) if (!treeKeys.has(key)) throw new Error(`item missing from the tree: ${key}`)

  // Checks against numbers seen in the game and on albionfreemarket (base fame of one craft).
  const fameChecks: [string, number][] = [
    ['T4_BAG', 360],
    ['T5_BAG', 1440],
    ['T8_BAG', 22320],
    ['T4_2H_BOW', 720],
  ]
  for (const [id, want] of fameChecks) {
    if (Math.abs(fame(id) - want) > 0.01) throw new Error(`fame check failed for ${id}: ${fame(id)} ≠ ${want}`)
  }

  const data: CraftingData = {
    generatedAt: new Date().toISOString(),
    craftingBonus,
    categoryBonus,
    tree,
    items: [...itemsByKey.values()],
    ingredients,
    journals,
  }
  return data
}
