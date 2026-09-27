// Crafting profit (weapons, armour, capes, bags) for every sell place.

import {
  BLACK_MARKET,
  CITIES,
  CRAFT_CITIES,
  FOCUS_BONUS,
  FREE_CRAFTING_MAX_TIER,
  PLACES,
  SALES_TAX,
  SETUP_FEE,
  USAGE_FEE_FACTOR,
  type CraftCity,
  type Place,
} from '../config'
import type { Volume } from '../data/aodp'
import type { CraftItem, CraftRecipe, CraftSlot, CraftingData, IngredientKind, Journal } from '../gamedata/types'
import {
  buyQuote,
  cheapestCity,
  fresh,
  manualQuote,
  qualityKey,
  type BuyQuote,
  type BuyVia,
  type FreshQuote,
  type ManualPrices,
  type Market,
} from './market'

export const INGREDIENT_KINDS: readonly IngredientKind[] = [
  'metalbar',
  'leather',
  'cloth',
  'planks',
  'artifact',
  'token',
  'sigil',
  'base',
  'cape',
  'crest',
  'heart',
  'energy',
  'tome',
  'part',
]

/** Refined materials: returned by the return rate, and bought in the royal cities. */
export const MATERIAL_KINDS: readonly IngredientKind[] = ['metalbar', 'leather', 'cloth', 'planks']
/** Gear used as an ingredient (the basic Cape, royal base items): bought, or crafted from its own recipe. */
export const GEAR_KINDS: readonly IngredientKind[] = ['cape', 'base']

export type BuyCity = CraftCity | 'cheapest'

/** Where one kind of ingredient comes from. */
export interface Source {
  via: BuyVia
  city: BuyCity
}

/** Special ingredients (artifacts, tokens, sigils, …) can also be bought in Brecilien. */
export function buyCities(kind: IngredientKind): readonly CraftCity[] {
  return MATERIAL_KINDS.includes(kind) ? CITIES : CRAFT_CITIES
}

/** The focus cost the user typed in for one variant of an item, with their specs. */
export interface FocusEntry {
  /** Market ID of the variant the cost was typed for. */
  id: string
  cost: number
}

export interface CraftSettings {
  /** Items to craft. */
  amount: number
  premium: boolean
  /** Daily production bonus: 0, 0.1 or 0.2. */
  dailyBonus: number
  /** Station fee in silver per 100 nutrition. */
  usageFee: number
  craftCity: CraftCity
  /** Quality the product is sold at, 1 (normal) to 5 (masterpiece). */
  quality: number
  sources: Record<IngredientKind, Source>
  /** Per recipe slot: which alternative to use (0 = the default, e.g. the artifact rather than a token). */
  options: number[]
  /** Gear ingredients counted at their crafted cost instead of the market price. */
  crafted: Partial<Record<IngredientKind, boolean>>
  /** Typed-in focus costs, per item key. */
  focus: Record<string, FocusEntry>
  manual: ManualPrices
}

export function craftReturnRate(
  data: CraftingData,
  item: CraftItem,
  city: CraftCity,
  dailyBonus: number,
  focus: boolean,
): number {
  const special = item.category && item.bonusCity === city ? (data.categoryBonus[item.category]?.bonus ?? 0) : 0
  const bonus = data.craftingBonus + special + dailyBonus + (focus ? FOCUS_BONUS : 0)
  return 1 - 1 / (1 + bonus)
}

/**
 * Focus cost of one craft. Without a typed-in cost it's the base cost (no specs). With one, every
 * variant is scaled by the same factor: typed cost × base focus / base focus of the typed variant.
 */
export function focusPerCraft(item: CraftItem, recipe: CraftRecipe, typed: FocusEntry | undefined): number {
  if (!typed || !(typed.cost > 0)) return recipe.focus
  const reference = item.recipes.find((r) => r.id === typed.id)
  if (!reference || reference.focus <= 0) return recipe.focus
  return (typed.cost * recipe.focus) / reference.focus
}

const index = new WeakMap<CraftingData, Map<string, { item: CraftItem; recipe: CraftRecipe }>>()

/** Finds the item and recipe for a product ID, e.g. `T4_CAPE@1`. */
export function findRecipe(data: CraftingData, id: string) {
  let byId = index.get(data)
  if (!byId) {
    byId = new Map(data.items.flatMap((item) => item.recipes.map((recipe) => [recipe.id, { item, recipe }] as const)))
    index.set(data, byId)
  }
  return byId.get(id) ?? null
}

export interface IngredientLine {
  slot: CraftSlot
  /** The option used for this slot. */
  id: string
  kind: IngredientKind
  name: string
  /** Amount per craft. */
  count: number
  source: Source
  /** Where it's bought: the chosen city or the cheapest one. `null` when it's crafted. */
  city: CraftCity | null
  /** The market price in that city, and the price used (manual if typed in). */
  market: FreshQuote | null
  price: FreshQuote | null
  /** Key for typed-in prices: gear ingredients have one per quality. */
  manualId: string
  /** Cost of one unit: buy order + setup fee, instant-buy price, or crafted cost. Without and with focus. */
  unitCost: number | null
  unitCostFocus: number | null
  /** Set when the ingredient is crafted instead of bought. */
  crafted: CraftResult | null
  /** Amount to buy per craft after returns, without and with focus. */
  perCraft: number
  perCraftFocus: number
  volume: Volume | null
}

/** Cost of one craft, without selling. */
export interface CraftResult {
  item: CraftItem
  recipe: CraftRecipe
  lines: IngredientLine[]
  /** Ingredients for one craft, after returns. `null` when a price is missing. */
  materialCost: number | null
  materialCostFocus: number | null
  usageFee: number
  /** Focus for one craft, including a crafted base item. */
  focus: number
}

export interface Sale {
  /** Unit price the product sells at. */
  price: FreshQuote
  /** Silver received for the whole amount, after tax and setup fee. */
  revenue: number
  tax: number
  setupFee: number
  /** For the whole amount. `null` when an ingredient price is missing. */
  profit: number | null
  profitFocus: number | null
  percent: number | null
  percentFocus: number | null
}

export interface PlaceResult {
  /** Listing a sell order at the lowest sell price. Never at the Black Market. */
  order: Sale | null
  /** Selling instantly into the highest buy order. */
  instant: Sale | null
  instantBetter: boolean
  volume: Volume | null
}

export interface CraftRow extends CraftResult {
  /** Materials after returns plus usage fee, per item. */
  costPerItem: number | null
  costPerItemFocus: number | null
  silverPerFocus: number | null
  places: Record<Place, PlaceResult>
}

function craft(
  item: CraftItem,
  recipe: CraftRecipe,
  data: CraftingData,
  market: Market,
  s: CraftSettings,
  options: number[],
  now: number,
): CraftResult {
  const keep = 1 - craftReturnRate(data, item, s.craftCity, s.dailyBonus, false)
  const keepFocus = 1 - craftReturnRate(data, item, s.craftCity, s.dailyBonus, true)

  const lines = recipe.slots.map((slot, i): IngredientLine => {
    const id = slot.options[Math.min(options[i] ?? 0, slot.options.length - 1)]
    const info = data.ingredients[id]
    const source = s.sources[info.kind]
    const line = {
      slot,
      id,
      kind: info.kind,
      name: info.name,
      count: slot.count,
      source,
      perCraft: slot.count * (slot.returned ? keep : 1),
      perCraftFocus: slot.count * (slot.returned ? keepFocus : 1),
      manualId: slot.preserveQuality ? qualityKey(id, s.quality) : id,
    }

    const base = GEAR_KINDS.includes(info.kind) && s.crafted[info.kind] ? findRecipe(data, id) : null
    if (base) {
      // Its own ingredients come from the same sources; nothing is nested deeper than this.
      const c = craft(base.item, base.recipe, data, market, s, [], now)
      const total = (m: number | null) => (m === null ? null : m + c.usageFee)
      return {
        ...line,
        city: null,
        market: null,
        price: null,
        unitCost: total(c.materialCost),
        unitCostFocus: total(c.materialCostFocus),
        crafted: c,
        volume: null,
      }
    }

    const quoteIn = (city: CraftCity): BuyQuote =>
      buyQuote(market, s.manual, id, city, source.via, now, line.manualId)
    const city =
      source.city === 'cheapest' ? (cheapestCity(buyCities(info.kind), quoteIn) ?? s.craftCity) : source.city
    const { market: marketPrice, price } = quoteIn(city)
    const unitCost = price && (source.via === 'order' ? price.price * (1 + SETUP_FEE) : price.price)
    return {
      ...line,
      city,
      market: marketPrice,
      price,
      unitCost,
      unitCostFocus: unitCost,
      crafted: null,
      volume: market.volumes.get(id)?.get(city) ?? null,
    }
  })

  const havePrices = lines.every((l) => l.unitCost !== null)
  const materialCost = havePrices ? lines.reduce((sum, l) => sum + l.perCraft * l.unitCost!, 0) : null
  const materialCostFocus = havePrices ? lines.reduce((sum, l) => sum + l.perCraftFocus * l.unitCostFocus!, 0) : null
  const usageFee =
    recipe.tier <= FREE_CRAFTING_MAX_TIER ? 0 : (USAGE_FEE_FACTOR * recipe.itemValue * s.usageFee) / 100
  const focus =
    focusPerCraft(item, recipe, s.focus[item.key]) + lines.reduce((sum, l) => sum + (l.crafted?.focus ?? 0), 0)

  return { item, recipe, lines, materialCost, materialCostFocus, usageFee, focus }
}

export function calcCraftRow(
  item: CraftItem,
  recipe: CraftRecipe,
  data: CraftingData,
  market: Market,
  s: CraftSettings,
  now = Date.now(),
): CraftRow {
  const result = craft(item, recipe, data, market, s, s.options, now)
  const { materialCost, materialCostFocus, usageFee, focus } = result
  const perItem = (materials: number | null) => (materials === null ? null : materials + usageFee)
  const costPerItem = perItem(materialCost)
  const costPerItemFocus = perItem(materialCostFocus)

  const taxRate = s.premium ? SALES_TAX.premium : SALES_TAX.standard
  const sale = (price: FreshQuote | null, isOrder: boolean): Sale | null => {
    if (!price) return null
    const gross = s.amount * price.price
    const tax = gross * taxRate
    const setupFee = isOrder ? gross * SETUP_FEE : 0
    const revenue = gross - tax - setupFee
    const profitFor = (cost: number | null) => (cost === null ? null : revenue - s.amount * cost)
    const percentFor = (cost: number | null) => (cost === null ? null : (revenue - s.amount * cost) / (s.amount * cost))
    return {
      price,
      revenue,
      tax,
      setupFee,
      profit: profitFor(costPerItem),
      profitFocus: profitFor(costPerItemFocus),
      percent: percentFor(costPerItem),
      percentFocus: percentFor(costPerItemFocus),
    }
  }

  const manualSell = manualQuote(s.manual.sell[qualityKey(recipe.id, s.quality)], now)
  const places = Object.fromEntries(
    PLACES.map((place) => {
      const p = market.prices.get(recipe.id)?.get(place)
      // You can't list sell orders at the Black Market; it only buys. A manual sell price only
      // fills in places without a recent sell order.
      const order = place === BLACK_MARKET ? null : sale(fresh(p?.sellMin, now) ?? manualSell, true)
      const instant = sale(fresh(p?.buyMax, now), false)
      const result: PlaceResult = {
        order,
        instant,
        instantBetter: !!order && !!instant && instant.revenue >= order.revenue,
        volume: market.volumes.get(recipe.id)?.get(place) ?? null,
      }
      return [place, result]
    }),
  ) as Record<Place, PlaceResult>

  return {
    ...result,
    costPerItem,
    costPerItemFocus,
    silverPerFocus:
      materialCost !== null && materialCostFocus !== null && focus > 0 ? (materialCost - materialCostFocus) / focus : null,
    places,
  }
}

/** How many journals one craft fills: its fame over what a journal of that tier holds. */
export function journalsPerCraft(recipe: CraftRecipe, journal: Journal): number {
  const max = journal.maxFame[recipe.tier]
  return max ? recipe.fame / max : 0
}

export const journalIds = (journal: Journal, tier: number) => ({
  empty: `T${tier}_JOURNAL_${journal.kind}_EMPTY`,
  full: `T${tier}_JOURNAL_${journal.kind}_FULL`,
})

/** Key for a typed-in full-journal price: unlike gear, it overrides the market price in that city. */
export const journalSellKey = (fullId: string, city: string) => `${fullId}|${city}`

export interface JournalValue {
  /** Empty journal, bought instantly. */
  empty: BuyQuote
  /** Full journal, sold with a sell order: the lowest sell order, or a typed-in price. */
  full: FreshQuote | null
  /** The market price of a full journal. */
  fullMarket: FreshQuote | null
  /** Full journal after tax and setup fee, minus the empty one. */
  perJournal: number | null
}

export function journalValue(
  journal: Journal,
  tier: number,
  market: Market,
  s: Pick<CraftSettings, 'premium' | 'manual'>,
  city: CraftCity,
  now = Date.now(),
): JournalValue {
  const ids = journalIds(journal, tier)
  const empty = buyQuote(market, s.manual, ids.empty, city, 'instant', now)
  const fullMarket = fresh(market.prices.get(ids.full)?.get(city)?.sellMin, now)
  const full = manualQuote(s.manual.sell[journalSellKey(ids.full, city)], now) ?? fullMarket
  const taxRate = s.premium ? SALES_TAX.premium : SALES_TAX.standard
  const perJournal = full && empty.price ? full.price * (1 - taxRate - SETUP_FEE) - empty.price.price : null
  return { empty, full, fullMarket, perJournal }
}
