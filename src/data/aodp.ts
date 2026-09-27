// Client for the Albion Online Data Project API (Europe server).
// https://www.albion-online-data.com/api

import { AODP_BASE, HISTORY_CACHE_MINUTES, PRICE_CACHE_MINUTES } from '../config'

export interface Quote {
  price: number
  /** When the price was seen. */
  date: Date
}

export interface Price {
  /** Lowest sell order: the price to buy instantly, or to list a sell order at. */
  sellMin: Quote | null
  /** Highest buy order: the price to sell instantly, or to match with a buy order. */
  buyMax: Quote | null
}

export interface Volume {
  /** Items traded yesterday (UTC), the last complete day. */
  yesterday: number | null
  /** Average items traded per day over the last 7 complete days that have data. */
  avg7: number | null
  /** How many of those 7 days had data. */
  days: number
}

/** itemId → city → value */
export type ByItemCity<T> = Map<string, Map<string, T>>

// Leaves headroom under the API's 4096-character URL limit.
const MAX_URL_LENGTH = 3800

function batchIds(ids: string[], urlFor: (joined: string) => string): string[] {
  const urls: string[] = []
  let chunk: string[] = []
  for (const id of ids) {
    if (chunk.length && urlFor([...chunk, id].join(',')).length > MAX_URL_LENGTH) {
      urls.push(urlFor(chunk.join(',')))
      chunk = []
    }
    chunk.push(id)
  }
  if (chunk.length) urls.push(urlFor(chunk.join(',')))
  return urls
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 429) throw new Error('The price API is rate limiting requests. Wait a minute and refresh.')
  if (!res.ok) throw new Error(`Price API error: HTTP ${res.status}`)
  return res.json()
}

/** The API sends UTC timestamps without a zone, and "0001-01-01…" when it has no data. */
function parseDate(s: string): Date | null {
  return s.startsWith('0001') ? null : new Date(s + 'Z')
}

function quote(price: number, date: string): Quote | null {
  const d = parseDate(date)
  return price > 0 && d ? { price, date: d } : null
}

function set<T>(table: ByItemCity<T>, item: string, city: string, value: T) {
  let row = table.get(item)
  if (!row) table.set(item, (row = new Map()))
  row.set(city, value)
}

const cache = new Map<string, { at: number; data: unknown }>()

async function cached<T>(key: string, minutes: number, force: boolean, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < minutes * 60_000) return hit.data as T
  const data = await load()
  cache.set(key, { at: Date.now(), data })
  return data
}

interface PriceRow {
  item_id: string
  city: string
  sell_price_min: number
  sell_price_min_date: string
  buy_price_max: number
  buy_price_max_date: string
}

/** Current prices. Gear has 5 qualities (1 = normal); everything else only has quality 1. */
export function fetchPrices(
  ids: string[],
  cities: readonly string[],
  force = false,
  quality = 1,
): Promise<ByItemCity<Price>> {
  const key = `prices|${ids.join(',')}|${cities.join(',')}|${quality}`
  return cached(key, PRICE_CACHE_MINUTES, force, async () => {
    const locations = encodeURIComponent(cities.join(','))
    const urls = batchIds(
      ids,
      (joined) => `${AODP_BASE}/prices/${joined}.json?locations=${locations}&qualities=${quality}`,
    )
    const rows = (await Promise.all(urls.map((u) => getJson<PriceRow[]>(u)))).flat()

    const table: ByItemCity<Price> = new Map()
    for (const r of rows) {
      set(table, r.item_id, r.city, {
        sellMin: quote(r.sell_price_min, r.sell_price_min_date),
        buyMax: quote(r.buy_price_max, r.buy_price_max_date),
      })
    }
    return table
  })
}

interface HistoryRow {
  location: string
  item_id: string
  data: { item_count: number; avg_price: number; timestamp: string }[]
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10)

export function fetchVolumes(
  ids: string[],
  cities: readonly string[],
  force = false,
  quality = 1,
): Promise<ByItemCity<Volume>> {
  const key = `history|${ids.join(',')}|${cities.join(',')}|${quality}`
  return cached(key, HISTORY_CACHE_MINUTES, force, async () => {
    const today = new Date()
    const dayOffset = (n: number) => utcDay(new Date(today.getTime() - n * 86_400_000))
    const window = new Set(Array.from({ length: 7 }, (_, i) => dayOffset(i + 1)))
    const yesterday = dayOffset(1)

    const locations = encodeURIComponent(cities.join(','))
    const urls = batchIds(
      ids,
      (joined) =>
        `${AODP_BASE}/history/${joined}.json?locations=${locations}&qualities=${quality}&time-scale=24` +
        `&date=${dayOffset(8)}&end_date=${utcDay(today)}`,
    )
    const rows = (await Promise.all(urls.map((u) => getJson<HistoryRow[]>(u)))).flat()

    const table: ByItemCity<Volume> = new Map()
    for (const r of rows) {
      const inWindow = r.data.filter((d) => window.has(d.timestamp.slice(0, 10)))
      const total = inWindow.reduce((sum, d) => sum + d.item_count, 0)
      set(table, r.item_id, r.location, {
        yesterday: r.data.find((d) => d.timestamp.startsWith(yesterday))?.item_count ?? null,
        avg7: inWindow.length ? total / inWindow.length : null,
        days: inWindow.length,
      })
    }
    return table
  })
}
