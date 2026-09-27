// Market prices as the calculators use them: fresh or ignored, manual overrides, and the cheapest city.

import { IGNORE_AFTER_HOURS, STALE_AFTER_HOURS } from '../config'
import type { ByItemCity, Price, Quote, Volume } from '../data/aodp'

/** Prices typed in by the user, for when the market data is missing or wrong. */
export interface ManualPrices {
  /**
   * Buy price, keyed by `buyKey(itemId, city)` for buy orders (before the setup fee), and by
   * `buyKey(itemId, city, 'instant')` for instant buys.
   */
  buy: Record<string, number>
  /** Sell price, keyed by item ID (plus quality, see `qualityKey`). Used in cities without a recent sell order. */
  sell: Record<string, number>
}

export type BuyVia = 'order' | 'instant'

export const buyKey = (itemId: string, city: string, via: BuyVia = 'order') =>
  via === 'order' ? `${itemId}|${city}` : `${itemId}|${city}|instant`

/** Gear prices depend on quality: `T4_MAIN_SWORD` for normal quality, `T4_MAIN_SWORD#3` for outstanding. */
export const qualityKey = (itemId: string, quality: number) => (quality > 1 ? `${itemId}#${quality}` : itemId)

export interface Market {
  prices: ByItemCity<Price>
  volumes: ByItemCity<Volume>
}

/** A price that's recent enough to use, or one the user typed in. */
export interface FreshQuote extends Quote {
  ageHours: number
  /** Older than STALE_AFTER_HOURS: shown, but flagged. */
  stale: boolean
  /** Typed in by the user. */
  manual?: boolean
}

export function fresh(q: Quote | null | undefined, now = Date.now()): FreshQuote | null {
  if (!q) return null
  const ageHours = (now - q.date.getTime()) / 3_600_000
  if (ageHours > IGNORE_AFTER_HOURS) return null
  return { ...q, ageHours, stale: ageHours > STALE_AFTER_HOURS }
}

export function manualQuote(price: number | undefined, now: number): FreshQuote | null {
  return price && price > 0 ? { price, date: new Date(now), ageHours: 0, stale: false, manual: true } : null
}

export interface BuyQuote {
  /** The market price: highest buy order, or lowest sell order for an instant buy. */
  market: FreshQuote | null
  /** The price used: manual if typed in, otherwise the market price. */
  price: FreshQuote | null
}

/** What an item costs in a city, by buy order or instant buy. `manualId` is the key for typed-in prices. */
export function buyQuote(
  market: Market,
  manual: ManualPrices,
  id: string,
  city: string,
  via: BuyVia,
  now: number,
  manualId = id,
): BuyQuote {
  const p = market.prices.get(id)?.get(city)
  const marketPrice = fresh(via === 'order' ? p?.buyMax : p?.sellMin, now)
  return { market: marketPrice, price: manualQuote(manual.buy[buyKey(manualId, city, via)], now) ?? marketPrice }
}

/** The city with the lowest price, or `null` when no city has one. Typed-in prices count too. */
export function cheapestCity<C extends string>(cities: readonly C[], quoteOf: (city: C) => BuyQuote): C | null {
  let best: C | null = null
  let bestPrice = Infinity
  for (const city of cities) {
    const price = quoteOf(city).price?.price
    if (price !== undefined && price < bestPrice) {
      best = city
      bestPrice = price
    }
  }
  return best
}
