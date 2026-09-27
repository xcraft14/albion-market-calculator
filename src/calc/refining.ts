// Refining profit per stack, for every sell city.

import {
  CITIES,
  FOCUS_BONUS,
  FOCUS_EFFICIENCY_PER_LEVEL,
  SALES_TAX,
  SETUP_FEE,
  USAGE_FEE_FACTOR,
  type City,
} from '../config'
import type { Volume } from '../data/aodp'
import type { Ingredient, RefiningData, RefiningRecipe } from '../gamedata/types'
import { buyQuote, cheapestCity, fresh, manualQuote, type FreshQuote, type ManualPrices, type Market } from './market'

/** A buy city, or the cheapest city for each tier. */
export type BuyCityChoice = City | 'cheapest'

export interface CalcSettings {
  /** Refined items per stack. */
  stack: number
  premium: boolean
  /** Daily production bonus: 0, 0.1 or 0.2. */
  dailyBonus: number
  /** Station fee in silver per 100 nutrition. */
  usageFee: number
  /** Buy-order city for the raw resource. */
  resourceCity: BuyCityChoice
  /** Buy-order city for the lower-tier refined item. */
  refinedCity: BuyCityChoice
  /** Used for "cheapest" when no city has a price, so a price can still be typed in. */
  fallbackCity: City
  /** Refining spec levels for T4..T8. */
  specs: number[]
  manual: ManualPrices
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
  /** Where the buy order is placed: the chosen city, or the cheapest one for this tier. */
  city: City
  /** The city was picked as the cheapest. */
  cheapest: boolean
  /** Amount per craft. */
  count: number
  /** Amount to buy for one stack, without and with focus. */
  perStack: number
  perStackFocus: number
  /** Highest buy order in the chosen city, from the market data. */
  market: FreshQuote | null
  /** The price used: manual if typed in, otherwise the market price. */
  price: FreshQuote | null
  /** Cost of one unit bought with a buy order, including the setup fee. */
  unitCost: number | null
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
  /** Materials (after returns) plus usage fee, per refined item. */
  costPerItem: number | null
  costPerItemFocus: number | null
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

  const material = (ing: Ingredient, choice: BuyCityChoice): MaterialLine => {
    const quoteIn = (c: City) => buyQuote(market, s.manual, ing.id, c, 'order', now)
    const city = choice === 'cheapest' ? (cheapestCity(CITIES, quoteIn) ?? s.fallbackCity) : choice
    const { market: marketPrice, price } = quoteIn(city)
    return {
      id: ing.id,
      city,
      cheapest: choice === 'cheapest',
      count: ing.count,
      perStack: crafts * ing.count * keep,
      perStackFocus: crafts * ing.count * keepFocus,
      market: marketPrice,
      price,
      unitCost: price && price.price * (1 + SETUP_FEE),
      volume: market.volumes.get(ing.id)?.get(city) ?? null,
    }
  }
  const raw = material(recipe.raw, s.resourceCity)
  const lower = recipe.lower && material(recipe.lower, s.refinedCity)

  const havePrices = raw.unitCost !== null && (!lower || lower.unitCost !== null)
  const cost = (amount: (m: MaterialLine) => number) =>
    havePrices ? amount(raw) * raw.unitCost! + (lower ? amount(lower) * lower.unitCost! : 0) : null
  const materialCost = cost((m) => m.perStack)
  const materialCostFocus = cost((m) => m.perStackFocus)

  // T2 and lower have no usage fee.
  const usageFee = recipe.tier <= 2 ? 0 : (crafts * USAGE_FEE_FACTOR * recipe.itemValue * s.usageFee) / 100
  const perItem = (materials: number | null) => (materials === null ? null : (materials + usageFee) / s.stack)
  const focusPerStack = crafts * focusPerCraft(recipe, s.specs)
  const silverPerFocus =
    materialCost !== null && materialCostFocus !== null && focusPerStack > 0
      ? (materialCost - materialCostFocus) / focusPerStack
      : null

  const taxRate = s.premium ? SALES_TAX.premium : SALES_TAX.standard
  const sale = (price: FreshQuote | null, isOrder: boolean): Sale | null => {
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

  const manualSell = manualQuote(s.manual.sell[recipe.id], now)
  const cities = Object.fromEntries(
    CITIES.map((city) => {
      const p = market.prices.get(recipe.id)?.get(city)
      // A manual sell price only fills in cities without a recent sell order.
      const order = sale(fresh(p?.sellMin, now) ?? manualSell, true)
      const instant = sale(fresh(p?.buyMax, now), false)
      const result: CityResult = {
        order,
        instant,
        instantBetter: !!order && !!instant && instant.revenue >= order.revenue,
        volume: market.volumes.get(recipe.id)?.get(city) ?? null,
      }
      return [city, result]
    }),
  ) as Record<City, CityResult>

  return {
    recipe,
    raw,
    lower,
    materialCost,
    materialCostFocus,
    usageFee,
    costPerItem: perItem(materialCost),
    costPerItemFocus: perItem(materialCostFocus),
    focusPerStack,
    silverPerFocus,
    cities,
  }
}
