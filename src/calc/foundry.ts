// Artifact Foundry: a meld turns fragments into one random artifact from a pool where every artifact has
// the same chance, so the average of their prices is what a meld is worth.

import { CRAFT_CITIES, SALES_TAX, SETUP_FEE, type CraftCity } from '../config'
import type { Volume } from '../data/aodp'
import type {
  FoundryCategoryKey,
  FoundryData,
  FoundryRecipe,
  FragmentConversion,
  FragmentKey,
} from '../gamedata/types'
import {
  buyQuote,
  cheapestCity,
  fresh,
  manualQuote,
  type BuyVia,
  type FreshQuote,
  type ManualPrices,
  type Market,
} from './market'

/**
 * Where fragments are bought and artifacts sold: the royal cities and Brecilien. The Black Market
 * doesn't buy artifacts.
 */
export const FOUNDRY_CITIES = CRAFT_CITIES

/** Where fragments come from. */
export interface FragmentSource {
  via: BuyVia
  city: CraftCity | 'cheapest'
}

export interface MeldSettings {
  premium: boolean
  source: FragmentSource
  /** Make fragments from cheaper ones when that costs less than buying them. */
  make: boolean
  /** Cities the artifacts may be sold in. */
  sellCities: readonly CraftCity[]
  manual: ManualPrices
}

export const findMeld = (data: FoundryData, tier: number, fragment: FragmentKey, category: FoundryCategoryKey) =>
  data.recipes.find((r) => r.tier === tier && r.fragment === fragment && r.category === category) ?? null

/** `T6_ARTEFACT_2H_CLAYMORE_AVALON` → "Remnants of the Old King" */
export const artifactName = (data: FoundryData, id: string) => data.names[id.replace(/^T\d_/, '')] ?? id

/** One way to make a fragment, and what one costs that way. */
export interface MadeOption {
  conversion: FragmentConversion
  /** `null` when a price is missing. */
  cost: number | null
}

export interface FragmentCost {
  id: string
  /** Where it's bought: the chosen city, or the cheapest one. */
  city: CraftCity
  /** The market price there, and the price used (manual if typed in). */
  market: FreshQuote | null
  price: FreshQuote | null
  /** Buying one: the price, plus the setup fee for a buy order. */
  buyCost: number | null
  /** Making one from cheaper fragments. Empty unless "make" is on. */
  made: MadeOption[]
  /** The way used when it's cheaper than buying; `null` = bought. */
  route: MadeOption | null
  /** One fragment, the cheapest way. */
  cost: number | null
  volume: Volume | null
}

/**
 * What every fragment costs. With "make" on, each one is the cheapest of buying it, 5 of the tier
 * below, or the power level below + silver, worked out step by step down to T4 runes.
 */
export function fragmentCosts(
  data: FoundryData,
  market: Market,
  s: MeldSettings,
  now = Date.now(),
): Map<string, FragmentCost> {
  const costs = new Map<string, FragmentCost>()

  function costOf(id: string): FragmentCost {
    const known = costs.get(id)
    if (known) return known
    const quoteIn = (city: CraftCity) => buyQuote(market, s.manual, id, city, s.source.via, now)
    const city =
      s.source.city === 'cheapest' ? (cheapestCity(FOUNDRY_CITIES, quoteIn) ?? 'Caerleon') : s.source.city
    const { market: marketPrice, price } = quoteIn(city)
    const buyCost = price && (s.source.via === 'order' ? price.price * (1 + SETUP_FEE) : price.price)

    const made = s.make
      ? (data.conversions[id] ?? []).map((conversion): MadeOption => {
          const input = costOf(conversion.from).cost
          return { conversion, cost: input === null ? null : conversion.count * input + conversion.silver }
        })
      : []
    let route: MadeOption | null = null
    let cost = buyCost
    for (const m of made) {
      if (m.cost !== null && (cost === null || m.cost < cost)) {
        route = m
        cost = m.cost
      }
    }

    const result: FragmentCost = {
      id,
      city,
      market: marketPrice,
      price,
      buyCost,
      made,
      route,
      cost,
      volume: market.volumes.get(id)?.get(city) ?? null,
    }
    costs.set(id, result)
    return result
  }

  for (const id of Object.keys(data.conversions)) costOf(id)
  return costs
}

export interface ArtifactSale {
  via: 'order' | 'instant'
  /** Unit price: the lowest sell order, the highest buy order, or the price typed in. */
  price: FreshQuote
  /** What one sale brings in: a sell order pays tax and the setup fee, an instant sale only tax. */
  net: number
}

export interface CityOffer {
  order: ArtifactSale | null
  instant: ArtifactSale | null
  /** The one that pays more. An instant sale wins a tie. */
  best: ArtifactSale
}

export interface ArtifactValue {
  id: string
  /** Every city with a price from the last 24 hours, ticked or not. */
  cities: Partial<Record<CraftCity, CityOffer>>
  /** The ticked city that pays the most. `null` when none has a price. */
  bestCity: CraftCity | null
  /** The sale that counts: the best city's, or the price typed in when no ticked city has one. */
  sale: ArtifactSale | null
}

export function artifactValue(id: string, market: Market, s: MeldSettings, now = Date.now()): ArtifactValue {
  const taxRate = s.premium ? SALES_TAX.premium : SALES_TAX.standard
  const order = (price: FreshQuote | null): ArtifactSale | null =>
    price && { via: 'order', price, net: price.price * (1 - taxRate - SETUP_FEE) }
  const instant = (price: FreshQuote | null): ArtifactSale | null =>
    price && { via: 'instant', price, net: price.price * (1 - taxRate) }

  const cities: Partial<Record<CraftCity, CityOffer>> = {}
  let bestCity: CraftCity | null = null
  for (const city of FOUNDRY_CITIES) {
    const p = market.prices.get(id)?.get(city)
    const o = order(fresh(p?.sellMin, now))
    const i = instant(fresh(p?.buyMax, now))
    if (!o && !i) continue
    const offer: CityOffer = { order: o, instant: i, best: i && (!o || i.net >= o.net) ? i : o! }
    cities[city] = offer
    if (s.sellCities.includes(city) && (!bestCity || offer.best.net > cities[bestCity]!.best.net)) bestCity = city
  }

  const sale = bestCity ? cities[bestCity]!.best : order(manualQuote(s.manual.sell[id], now))
  return { id, cities, bestCity, sale }
}

export interface MeldResult {
  recipe: FoundryRecipe
  fragment: FragmentCost
  /** The fragments for one meld. `null` when the fragment price is missing. */
  cost: number | null
  artifacts: ArtifactValue[]
  /** How many of the pool's artifacts have a price. The average is incomplete until all do. */
  priced: number
  /** Average net of the priced artifacts: what one meld is worth. */
  expected: number | null
  /** Per meld: expected value − cost. */
  profit: number | null
  /** Profit / cost, for the green/red shading. */
  margin: number | null
  /** The most one fragment may cost for a meld to break even. */
  breakEven: number | null
  /** Priced artifacts worth more than the meld costs. */
  beating: number
}

export function calcMeld(
  recipe: FoundryRecipe,
  fragments: Map<string, FragmentCost>,
  market: Market,
  s: MeldSettings,
  now = Date.now(),
): MeldResult {
  const fragment = fragments.get(recipe.fragmentId)
  if (!fragment) throw new Error(`no cost for ${recipe.fragmentId}`)
  const cost = fragment.cost === null ? null : recipe.count * fragment.cost
  const artifacts = recipe.pool.map((id) => artifactValue(id, market, s, now))
  const nets = artifacts.flatMap((a) => (a.sale ? [a.sale.net] : []))
  const expected = nets.length ? nets.reduce((sum, n) => sum + n, 0) / nets.length : null
  const profit = expected !== null && cost !== null ? expected - cost : null
  return {
    recipe,
    fragment,
    cost,
    artifacts,
    priced: nets.length,
    expected,
    profit,
    margin: profit !== null && cost ? profit / cost : null,
    breakEven: expected === null ? null : expected / recipe.count,
    beating: cost === null ? 0 : nets.filter((n) => n > cost).length,
  }
}
