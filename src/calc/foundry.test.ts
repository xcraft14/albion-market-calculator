import { describe, expect, it } from 'vitest'
import type { ByItemCity, Price, Volume } from '../data/aodp'
import foundryJson from '../gamedata/foundry.json'
import type { FoundryData } from '../gamedata/types'
import {
  artifactName,
  artifactValue,
  calcMeld,
  findMeld,
  FOUNDRY_CITIES,
  fragmentCosts,
  type MeldSettings,
} from './foundry'
import { buyKey, type Market } from './market'

const data = foundryJson as FoundryData

const NOW = Date.parse('2026-09-27T12:00:00Z')
const quote = (price: number, ageHours = 1) => ({ price, date: new Date(NOW - ageHours * 3_600_000) })
const sell = (price: number, ageHours = 1): Price => ({ sellMin: quote(price, ageHours), buyMax: null })
const buy = (price: number, ageHours = 1): Price => ({ sellMin: null, buyMax: quote(price, ageHours) })

function market(entries: [item: string, city: string, price: Price][]): Market {
  const prices: ByItemCity<Price> = new Map()
  for (const [id, city, price] of entries) {
    if (!prices.has(id)) prices.set(id, new Map())
    prices.get(id)!.set(city, price)
  }
  return { prices, volumes: new Map<string, Map<string, Volume>>() }
}

const settings: MeldSettings = {
  premium: true,
  source: { via: 'order', city: 'cheapest' },
  make: false,
  sellCities: FOUNDRY_CITIES,
  manual: { buy: {}, sell: {} },
}

describe('foundry game data', () => {
  it('has every meld: T4–T8 × 4 fragments × 4 categories', () => {
    expect(data.recipes).toHaveLength(80)
    const all = findMeld(data, 6, 'rune', 'all')!
    expect(all.fragmentId).toBe('T6_RUNE')
    expect(all.count).toBe(36)
    expect(all.pool).toHaveLength(28)
    const warrior = findMeld(data, 8, 'shard', 'warrior')!
    expect(warrior.count).toBe(50)
    expect(warrior.pool).toHaveLength(10)
    expect(warrior.pool).toContain('T8_ARTEFACT_2H_CLAYMORE_AVALON')
    expect(artifactName(data, 'T8_ARTEFACT_2H_CLAYMORE_AVALON')).toBe('Remnants of the Old King')
  })

  it('has the fragment conversions', () => {
    expect(data.conversions.T4_RUNE).toEqual([])
    expect(data.conversions.T5_RUNE).toEqual([{ from: 'T4_RUNE', count: 5, silver: 0 }])
    expect(data.conversions.T6_SOUL).toEqual([
      { from: 'T5_SOUL', count: 5, silver: 0 },
      { from: 'T6_RUNE', count: 1, silver: 2500 },
    ])
    expect(data.conversions.T8_SHARD_AVALONIAN).toContainEqual({ from: 'T8_RELIC', count: 1, silver: 40000 })
  })
})

describe('calcMeld', () => {
  it('works out a T6 rune meld in the All category', () => {
    const meld = findMeld(data, 6, 'rune', 'all')!
    const [first, ...rest] = meld.pool
    const m = market([
      // Runes: the cheapest buy order is in Thetford.
      ['T6_RUNE', 'Thetford', buy(100)],
      ['T6_RUNE', 'Martlock', buy(120)],
      // Every artifact has a sell order at 4,000 in Martlock; the first also a buy order at 5,000 in Caerleon.
      ...meld.pool.map((id): [string, string, Price] => [id, 'Martlock', sell(4000)]),
      [first, 'Caerleon', buy(5000)],
    ])
    const r = calcMeld(meld, fragmentCosts(data, m, settings, NOW), m, settings, NOW)

    expect(r.fragment.city).toBe('Thetford')
    expect(r.fragment.cost).toBeCloseTo(102.5) // 100 + 2.5% setup fee
    expect(r.cost).toBeCloseTo(3690) // 36 × 102.5

    // Sell order: 4,000 − 4% tax − 2.5% fee = 3,740. Instant sale: 5,000 − 4% tax = 4,800.
    expect(r.artifacts[0].bestCity).toBe('Caerleon')
    expect(r.artifacts[0].sale?.via).toBe('instant')
    expect(r.artifacts[0].sale?.net).toBeCloseTo(4800)
    expect(r.artifacts[1].sale?.via).toBe('order')
    expect(r.artifacts[1].sale?.net).toBeCloseTo(3740)
    expect(rest).toHaveLength(27)

    expect(r.priced).toBe(28)
    expect(r.expected).toBeCloseTo((27 * 3740 + 4800) / 28)
    expect(r.profit).toBeCloseTo((27 * 3740 + 4800) / 28 - 3690)
    expect(r.breakEven).toBeCloseTo((27 * 3740 + 4800) / 28 / 36)
    expect(r.beating).toBe(28)
  })

  it('averages the priced artifacts and counts the missing ones', () => {
    const meld = findMeld(data, 4, 'soul', 'warrior')!
    const m = market([
      ['T4_SOUL', 'Lymhurst', sell(40)],
      ...meld.pool.slice(0, 8).map((id, i): [string, string, Price] => [id, 'Bridgewatch', sell(1000 + i * 1000)]),
    ])
    const s: MeldSettings = { ...settings, source: { via: 'instant', city: 'cheapest' }, premium: false }
    const r = calcMeld(meld, fragmentCosts(data, m, s, NOW), m, s, NOW)
    expect(r.cost).toBe(2000) // 50 × 40, instant buy: no fee
    expect(r.priced).toBe(8)
    // Without Premium: 8% tax + 2.5% fee. Average price of 1,000 … 8,000 is 4,500.
    expect(r.expected).toBeCloseTo(4500 * 0.895)
    // Worth more than 2,000: 3,000 × 0.895 and up.
    expect(r.beating).toBe(6)
  })
})

describe('artifactValue', () => {
  const id = 'T6_ARTEFACT_2H_CLAYMORE_AVALON'

  it('sells in the best ticked city, and falls back when a city has no data', () => {
    const m = market([
      [id, 'Caerleon', sell(9000)],
      [id, 'Martlock', sell(6000)],
      [id, 'Bridgewatch', sell(5000, 10)], // 10h old: still used, flagged as stale
      [id, 'Lymhurst', sell(20000, 30)], // older than 24h: ignored
    ])
    const onlyTicked = (cities: MeldSettings['sellCities']) => ({ ...settings, sellCities: cities })

    expect(artifactValue(id, m, settings, NOW).bestCity).toBe('Caerleon')
    expect(artifactValue(id, m, settings, NOW).cities.Lymhurst).toBeUndefined()

    const noCaerleon = artifactValue(id, m, onlyTicked(['Martlock', 'Bridgewatch', 'Lymhurst']), NOW)
    expect(noCaerleon.bestCity).toBe('Martlock')
    // Unticked cities keep their prices for the table.
    expect(noCaerleon.cities.Caerleon?.best.price.price).toBe(9000)

    const fallback = artifactValue(id, m, onlyTicked(['Bridgewatch', 'Lymhurst', 'Thetford']), NOW)
    expect(fallback.bestCity).toBe('Bridgewatch')
    expect(fallback.sale?.price.stale).toBe(true)

    expect(artifactValue(id, m, onlyTicked(['Lymhurst', 'Thetford']), NOW).sale).toBeNull()
  })

  it('takes whichever pays more: a sell order or an instant sale', () => {
    // Sell order 1,000 → 935. Buy order 980 → 940.8, so the instant sale wins.
    const m = market([[id, 'Martlock', { sellMin: quote(1000), buyMax: quote(980) }]])
    const v = artifactValue(id, m, settings, NOW)
    expect(v.cities.Martlock?.order?.net).toBeCloseTo(935)
    expect(v.sale).toMatchObject({ via: 'instant' })
    expect(v.sale?.net).toBeCloseTo(940.8)

    const lowerBid = market([[id, 'Martlock', { sellMin: quote(1000), buyMax: quote(900) }]])
    expect(artifactValue(id, lowerBid, settings, NOW).sale?.via).toBe('order')
  })

  it('uses your price only when no ticked city has one', () => {
    const s = { ...settings, manual: { buy: {}, sell: { [id]: 2000 } } }
    const none = artifactValue(id, market([]), s, NOW)
    expect(none.bestCity).toBeNull()
    expect(none.sale?.via).toBe('order')
    expect(none.sale?.net).toBeCloseTo(1870)
    expect(none.sale?.price.manual).toBe(true)

    const priced = artifactValue(id, market([[id, 'Thetford', sell(1500)]]), s, NOW)
    expect(priced.bestCity).toBe('Thetford')
    expect(priced.sale?.price.price).toBe(1500)

    // Only an unticked city has a price: your price counts.
    const hidden = artifactValue(id, market([[id, 'Thetford', sell(1500)]]), { ...s, sellCities: ['Martlock'] }, NOW)
    expect(hidden.sale?.price.manual).toBe(true)
  })
})

describe('fragmentCosts', () => {
  const m = market([
    ['T4_RUNE', 'Martlock', sell(10)],
    ['T5_RUNE', 'Martlock', sell(60)],
    ['T6_RUNE', 'Martlock', sell(700)],
    ['T5_SOUL', 'Martlock', sell(2000)],
    ['T6_SOUL', 'Martlock', sell(3000)],
  ])
  const s: MeldSettings = { ...settings, source: { via: 'instant', city: 'Martlock' } }

  it('buys every fragment when "make" is off', () => {
    const costs = fragmentCosts(data, m, s, NOW)
    expect(costs.get('T6_SOUL')).toMatchObject({ cost: 3000, route: null, made: [] })
    expect(costs.get('T4_SOUL')?.cost).toBeNull()
  })

  it('makes a fragment from cheaper ones, step by step down to T4 runes', () => {
    const costs = fragmentCosts(data, m, { ...s, make: true }, NOW)
    // T5 rune: 5 × T4 rune = 50, cheaper than buying at 60.
    expect(costs.get('T5_RUNE')).toMatchObject({ cost: 50, route: { conversion: { from: 'T4_RUNE' } } })
    // T6 rune: 5 × T5 rune = 250, cheaper than 700.
    expect(costs.get('T6_RUNE')?.cost).toBe(250)
    // T4 soul has no price: T4 rune + 625 = 635.
    expect(costs.get('T4_SOUL')).toMatchObject({ cost: 635, buyCost: null })
    // T5 soul: T5 rune + 1,250 = 1,300; 5 × T4 soul = 3,175; buying 2,000.
    expect(costs.get('T5_SOUL')?.cost).toBe(1300)
    // T6 soul: T6 rune + 2,500 = 2,750; 5 × T5 soul = 6,500; buying 3,000.
    const soul = costs.get('T6_SOUL')!
    expect(soul.buyCost).toBe(3000)
    expect(soul.made.map((o) => o.cost)).toEqual([6500, 2750])
    expect(soul.route?.conversion).toEqual({ from: 'T6_RUNE', count: 1, silver: 2500 })
    expect(soul.cost).toBe(2750)
  })

  it('uses typed-in prices and the setup fee for buy orders', () => {
    const typed: MeldSettings = {
      ...settings,
      source: { via: 'order', city: 'Thetford' },
      manual: { buy: { [buyKey('T6_RUNE', 'Thetford')]: 200 }, sell: {} },
    }
    const rune = fragmentCosts(data, market([['T6_RUNE', 'Thetford', buy(150)]]), typed, NOW).get('T6_RUNE')!
    expect(rune.market?.price).toBe(150)
    expect(rune.price?.manual).toBe(true)
    expect(rune.cost).toBeCloseTo(205)
  })
})
