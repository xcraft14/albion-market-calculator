import { describe, expect, it } from 'vitest'
import type { ByItemCity, Price, Volume } from '../data/aodp'
import refiningJson from '../gamedata/refining.json'
import type { RefiningData } from '../gamedata/types'
import { buyKey, type Market } from './market'
import { calcRow, focusPerCraft, returnRate, type CalcSettings } from './refining'

const data = refiningJson as RefiningData
const bars = data.families.find((f) => f.key === 'metalbar')!
const recipe = (id: string) => bars.recipes.find((r) => r.id === id)!

const NOW = Date.parse('2026-09-27T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000)

function market(entries: [item: string, city: string, price: Price][]): Market {
  const prices: ByItemCity<Price> = new Map()
  for (const [item, city, price] of entries) {
    if (!prices.has(item)) prices.set(item, new Map())
    prices.get(item)!.set(city, price)
  }
  return { prices, volumes: new Map<string, Map<string, Volume>>() }
}

const quote = (price: number, ageHours = 1) => ({ price, date: hoursAgo(ageHours) })

const settings: CalcSettings = {
  stack: 999,
  premium: true,
  dailyBonus: 0,
  usageFee: 500,
  resourceCity: 'Thetford',
  refinedCity: 'Thetford',
  fallbackCity: 'Thetford',
  specs: [0, 0, 0, 0, 0],
  manual: { buy: {}, sell: {} },
}

describe('returnRate', () => {
  it('matches the in-game bonus-city rates', () => {
    expect(returnRate(data, 0, false)).toBeCloseTo(0.367, 3)
    expect(returnRate(data, 0.1, false)).toBeCloseTo(0.405, 3)
    expect(returnRate(data, 0.2, false)).toBeCloseTo(0.438, 3)
    expect(returnRate(data, 0, true)).toBeCloseTo(0.539, 3)
  })
})

describe('focusPerCraft', () => {
  it('uses the base cost without specs', () => {
    expect(focusPerCraft(recipe('T5_METALBAR'), [0, 0, 0, 0, 0])).toBe(94)
  })

  it('drops to 1/16 with every tier at 100', () => {
    expect(focusPerCraft(recipe('T8_METALBAR'), [100, 100, 100, 100, 100])).toBeCloseTo(503 / 16)
  })

  it('uses the item tier for enchanted items', () => {
    // T5.2 with only T5 at 100: 30×100 + 250×100 = 28 000 efficiency.
    expect(focusPerCraft(recipe('T5_METALBAR_LEVEL2@2'), [0, 100, 0, 0, 0])).toBeCloseTo(287 * 0.5 ** 2.8)
  })
})

describe('calcRow', () => {
  // The worked example from the concept document: T5 bars, ore 300, T4 bars 280, sold at 1 100.
  const m = market([
    ['T5_ORE', 'Thetford', { sellMin: null, buyMax: quote(300) }],
    ['T4_METALBAR', 'Thetford', { sellMin: null, buyMax: quote(280) }],
    ['T5_METALBAR', 'Martlock', { sellMin: quote(1100), buyMax: quote(1090) }],
  ])
  const row = calcRow(recipe('T5_METALBAR'), data, m, settings, NOW)

  it('works out the materials to buy per stack', () => {
    expect(row.raw.perStack).toBeCloseTo(1896.8, 1)
    expect(row.lower!.perStack).toBeCloseTo(632.3, 1)
    expect(row.materialCost).toBeCloseTo(764_741, 0)
    expect(row.usageFee).toBeCloseTo(17_982, 0)
  })

  it('shows unit buy-order prices with the setup fee, and the cost per refined item', () => {
    expect(row.raw.unitCost).toBeCloseTo(307.5)
    expect(row.lower!.unitCost).toBeCloseTo(287)
    // (materials 764 741 + usage fee 17 982) / 999
    expect(row.costPerItem).toBeCloseTo(783.51, 2)
  })

  it('calculates sell-order profit with and without focus', () => {
    const sale = row.cities.Martlock.order!
    expect(sale.revenue).toBeCloseTo(1_027_471.5, 1)
    expect(sale.profit).toBeCloseTo(244_749, 0)
    expect(sale.percent).toBeCloseTo(0.3127, 4)
    expect(sale.profitFocus).toBeCloseTo(452_674, 0)
    expect(row.silverPerFocus).toBeCloseTo(2.214, 3)
  })

  it('flags when instant sell beats a sell order', () => {
    // 1 090 × 0.96 = 1 046.4 per item beats 1 100 × 0.935 = 1 028.5.
    expect(row.cities.Martlock.instant!.revenue).toBeCloseTo(1_045_353.6, 1)
    expect(row.cities.Martlock.instantBetter).toBe(true)
  })

  it('has no result for cities without prices', () => {
    expect(row.cities.Caerleon.order).toBeNull()
  })

  it('ignores prices older than 24 hours and flags ones older than 6', () => {
    const old = market([
      ['T5_ORE', 'Thetford', { sellMin: null, buyMax: quote(300, 30) }],
      ['T4_METALBAR', 'Thetford', { sellMin: null, buyMax: quote(280) }],
      ['T5_METALBAR', 'Martlock', { sellMin: quote(1100, 8), buyMax: null }],
    ])
    const r = calcRow(recipe('T5_METALBAR'), data, old, settings, NOW)
    expect(r.materialCost).toBeNull()
    expect(r.cities.Martlock.order!.profit).toBeNull()
    expect(r.cities.Martlock.order!.price.stale).toBe(true)
  })

  it('uses manual prices for missing materials and missing sell prices', () => {
    const empty = market([['T4_METALBAR', 'Thetford', { sellMin: null, buyMax: quote(280) }]])
    const manual = {
      buy: { [buyKey('T5_ORE', 'Thetford')]: 300 },
      sell: { T5_METALBAR: 1100 },
    }
    const r = calcRow(recipe('T5_METALBAR'), data, empty, { ...settings, manual }, NOW)
    expect(r.raw.market).toBeNull()
    expect(r.raw.price!.manual).toBe(true)
    expect(r.materialCost).toBeCloseTo(764_741, 0)
    // No market price anywhere, so every city uses the manual sell price for sell orders.
    expect(r.cities.Caerleon.order!.price.manual).toBe(true)
    expect(r.cities.Caerleon.order!.profit).toBeCloseTo(244_749, 0)
    expect(r.cities.Caerleon.instant).toBeNull()
  })

  it('keeps market sell prices where they exist, even with a manual sell price', () => {
    const r = calcRow(recipe('T5_METALBAR'), data, m, { ...settings, manual: { buy: {}, sell: { T5_METALBAR: 5 } } }, NOW)
    expect(r.cities.Martlock.order!.price.price).toBe(1100)
    expect(r.cities.Caerleon.order!.price.price).toBe(5)
  })

  it('buys each material in the cheapest city when asked', () => {
    const spread = market([
      ['T5_ORE', 'Thetford', { sellMin: null, buyMax: quote(300) }],
      ['T5_ORE', 'Martlock', { sellMin: null, buyMax: quote(290) }],
      ['T5_ORE', 'Caerleon', { sellMin: null, buyMax: quote(250, 30) }],
      ['T4_METALBAR', 'Thetford', { sellMin: null, buyMax: quote(280) }],
    ])
    const manual = { buy: { [buyKey('T4_METALBAR', 'Lymhurst')]: 270 }, sell: {} }
    const cheapest = { ...settings, resourceCity: 'cheapest', refinedCity: 'cheapest', manual } as const
    const r = calcRow(recipe('T5_METALBAR'), data, spread, cheapest, NOW)
    // Caerleon's price is too old to count.
    expect(r.raw.city).toBe('Martlock')
    expect(r.raw.cheapest).toBe(true)
    // A typed-in price counts too.
    expect(r.lower!.city).toBe('Lymhurst')
    expect(r.lower!.price!.manual).toBe(true)
    // No prices anywhere: fall back to the given city, so a price can be typed in there.
    const none = calcRow(recipe('T6_METALBAR'), data, spread, cheapest, NOW)
    expect(none.raw.city).toBe('Thetford')
    expect(none.raw.price).toBeNull()
  })

  it('charges no usage fee and needs no lower-tier item for T2', () => {
    const t2 = calcRow(recipe('T2_METALBAR'), data, m, settings, NOW)
    expect(t2.usageFee).toBe(0)
    expect(t2.lower).toBeNull()
  })
})
