// Refining profit per stack, for every sell city.

import {
  CITIES,
  FOCUS_BONUS,
  FOCUS_EFFICIENCY_PER_LEVEL,
  IGNORE_AFTER_HOURS,
  SALES_TAX,
  SETUP_FEE,
  STALE_AFTER_HOURS,
  USAGE_FEE_FACTOR,
  type City,
} from '../config'
import type { ByItemCity, Price, Quote, Volume } from '../data/aodp'
import type { Ingredient, RefiningData, RefiningRecipe } from '../gamedata/types'

export interface CalcSettings {
  /** Refined items per stack. */
  stack: number
  premium: boolean
  /** Daily production bonus: 0, 0.1 or 0.2. */
  dailyBonus: number
  /** Station fee in silver per 100 nutrition. */
  usageFee: number
  /** Buy-order city for the raw resource. */
  resourceCity: City
  /** Buy-order city for the lower-tier refined item. */
  refinedCity: City
  /** Refining spec levels for T4..T8. */
  specs: number[]
}

export interface Market {
  prices: ByItemCity<Price>
  volumes: ByItemCity<Volume>
}

/** A price that's recent enough to use. */
export interface FreshQuote extends Quote {
  ageHours: number
  /** Older than STALE_AFTER_HOURS: shown, but flagged. */
  stale: boolean
}

export function fresh(q: Quote | null | undefined, now = Date.now()): FreshQuote | null {
  if (!q) return null
  const ageHours = (now - q.date.getTime()) / 3_600_000
  if (ageHours > IGNORE_AFTER_HOURS) return null
  return { ...q, ageHours, stale: ageHours > STALE_AFTER_HOURS }
}

export function returnRate(data: RefiningData, dailyBonus: number, focus: boolean): number {
  const bonus = data.royalCityBonus + data.specializationBonus + dailyBonus + (focus ? FOCUS_BONUS : 0)
  return 1 - 1 / (1 + bonus)
}

/** Focus cost of one craft after spec reductions. `specs` are the levels for T4..T8. */
export function focusPerCraft(recipe: RefiningRecipe, specs: number[]): number {
  const levels = [0, 1, 2, 3, 4].map((i) => Math.min(100, Math.max(0, specs[i] || 0)))
  const ownTier = recipe.tier >= 4 ? levels[recipe.tier - 4] : 0
  const efficiency =
    FOCUS_EFFICIENCY_PER_LEVEL.anyTier * levels.reduce((a, b) => a + b, 0) +
    FOCUS_EFFICIENCY_PER_LEVEL.ownTier * ownTier
  return recipe.focus * 0.5 ** (efficiency / 10_000)
}

export interface Sale {
  /** Unit price the product sells at. */
  price: FreshQuote
  /** Silver received for the stack, after tax and setup fee. */
  revenue: number
  tax: number
  setupFee: number
  /** `null` when a material price is missing. */
  profit: number | null
  profitFocus: number | null
  percent: number | null
  percentFocus: number | null
}

export interface CityResult {
  /** Listing a sell order at the lowest sell price. */
  order: Sale | null
  /** Selling instantly into the highest buy order. */
  instant: Sale | null
  /** Instant sell earns at least as much as a sell order. */
  instantBetter: boolean
  volume: Volume | null
}

export interface MaterialLine {
  id: string
  /** Amount to buy for one stack, without and with focus. */
  perStack: number
  perStackFocus: number
  /** Buy-order price in the chosen city. */
  price: FreshQuote | null
  volume: Volume | null
}

export interface RowResult {
  recipe: RefiningRecipe
  raw: MaterialLine
  lower: MaterialLine | null
  /** Cost of the materials for one stack, including the buy-order setup fee. */
  materialCost: number | null
  materialCostFocus: number | null
  usageFee: number
  focusPerStack: number
  silverPerFocus: number | null
  cities: Record<City, CityResult>
}

export function calcRow(
  recipe: RefiningRecipe,
  data: RefiningData,
  market: Market,
  s: CalcSettings,
  now = Date.now(),
): RowResult {
  const crafts = s.stack / recipe.amount
  const keep = 1 - returnRate(data, s.dailyBonus, false)
  const keepFocus = 1 - returnRate(data, s.dailyBonus, true)

  const material = (ing: Ingredient, city: City): MaterialLine => ({
    id: ing.id,
    perStack: crafts * ing.count * keep,
    perStackFocus: crafts * ing.count * keepFocus,
    price: fresh(market.prices.get(ing.id)?.get(city)?.buyMax, now),
    volume: market.volumes.get(ing.id)?.get(city) ?? null,
  })
  const raw = material(recipe.raw, s.resourceCity)
  const lower = recipe.lower && material(recipe.lower, s.refinedCity)

  const havePrices = raw.price && (!lower || lower.price)
  const cost = (amount: (m: MaterialLine) => number) =>
    havePrices
      ? (amount(raw) * raw.price!.price + (lower ? amount(lower) * lower.price!.price : 0)) * (1 + SETUP_FEE)
      : null
  const materialCost = cost((m) => m.perStack)
  const materialCostFocus = cost((m) => m.perStackFocus)

  // T2 and lower have no usage fee.
  const usageFee = recipe.tier <= 2 ? 0 : (crafts * USAGE_FEE_FACTOR * recipe.itemValue * s.usageFee) / 100
  const focusPerStack = crafts * focusPerCraft(recipe, s.specs)
  const silverPerFocus =
    materialCost !== null && materialCostFocus !== null && focusPerStack > 0
      ? (materialCost - materialCostFocus) / focusPerStack
      : null

  const taxRate = s.premium ? SALES_TAX.premium : SALES_TAX.standard
  const sale = (quote: Quote | null | undefined, isOrder: boolean): Sale | null => {
    const price = fresh(quote, now)
    if (!price) return null
    const gross = s.stack * price.price
    const tax = gross * taxRate
    const setupFee = isOrder ? gross * SETUP_FEE : 0
    const revenue = gross - tax - setupFee
    const profitFor = (materials: number | null) => (materials === null ? null : revenue - materials - usageFee)
    const percentFor = (materials: number | null, profit: number | null) =>
      materials === null || profit === null ? null : profit / (materials + usageFee)
    const profit = profitFor(materialCost)
    const profitFocus = profitFor(materialCostFocus)
    return {
      price,
      revenue,
      tax,
      setupFee,
      profit,
      profitFocus,
      percent: percentFor(materialCost, profit),
      percentFocus: percentFor(materialCostFocus, profitFocus),
    }
  }

  const cities = Object.fromEntries(
    CITIES.map((city) => {
      const p = market.prices.get(recipe.id)?.get(city)
      const order = sale(p?.sellMin, true)
      const instant = sale(p?.buyMax, false)
      const result: CityResult = {
        order,
        instant,
        instantBetter: !!order && !!instant && instant.revenue >= order.revenue,
        volume: market.volumes.get(recipe.id)?.get(city) ?? null,
      }
      return [city, result]
    }),
  ) as Record<City, CityResult>

  return { recipe, raw, lower, materialCost, materialCostFocus, usageFee, focusPerStack, silverPerFocus, cities }
}
