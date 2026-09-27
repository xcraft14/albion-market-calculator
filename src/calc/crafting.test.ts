import { describe, expect, it } from 'vitest'
import type { ByItemCity, Price, Volume } from '../data/aodp'
import craftingJson from '../gamedata/crafting.json'
import type { CraftingData, IngredientKind } from '../gamedata/types'
import {
  calcCraftRow,
  craftReturnRate,
  focusPerCraft,
  journalValue,
  journalsPerCraft,
  type CraftSettings,
  type Source,
} from './crafting'
import { buyKey, qualityKey, type Market } from './market'

const data = craftingJson as CraftingData
const item = (key: string) => data.items.find((i) => i.key === key)!
const recipe = (key: string, id: string) => item(key).recipes.find((r) => r.id === id)!

const NOW = Date.parse('2026-09-27T12:00:00Z')
const quote = (price: number, ageHours = 1) => ({ price, date: new Date(NOW - ageHours * 3_600_000) })

function market(entries: [item: string, city: string, price: Price][]): Market {
  const prices: ByItemCity<Price> = new Map()
  for (const [id, city, price] of entries) {
    if (!prices.has(id)) prices.set(id, new Map())
    prices.get(id)!.set(city, price)
  }
  return { prices, volumes: new Map<string, Map<string, Volume>>() }
}

const order = (city: Source['city']): Source => ({ via: 'order', city })
const instant = (city: Source['city']): Source => ({ via: 'instant', city })
const sources = {
  metalbar: order('Thetford'),
  leather: order('Martlock'),
  cloth: order('Lymhurst'),
  planks: order('Fort Sterling'),
  artifact: instant('Brecilien'),
  token: instant('Brecilien'),
  sigil: instant('Martlock'),
  base: instant('Martlock'),
  cape: instant('Martlock'),
  crest: instant('Brecilien'),
  heart: instant('Brecilien'),
  energy: instant('Brecilien'),
  tome: instant('Brecilien'),
  part: instant('Brecilien'),
} satisfies Record<IngredientKind, Source>

const settings: CraftSettings = {
  amount: 1,
  premium: true,
  dailyBonus: 0,
  usageFee: 500,
  craftCity: 'Lymhurst',
  quality: 1,
  sources,
  options: [],
  crafted: {},
  focus: {},
  manual: { buy: {}, sell: {} },
}

describe('craftReturnRate', () => {
  it('matches the in-game crafting rates', () => {
    const kingmaker = item('2H_CLAYMORE_AVALON')
    expect(kingmaker.bonusCity).toBe('Lymhurst')
    expect(craftReturnRate(data, kingmaker, 'Lymhurst', 0, false)).toBeCloseTo(0.248, 3)
    expect(craftReturnRate(data, kingmaker, 'Lymhurst', 0, true)).toBeCloseTo(0.479, 3)
    expect(craftReturnRate(data, kingmaker, 'Martlock', 0, false)).toBeCloseTo(0.153, 3)
    expect(craftReturnRate(data, kingmaker, 'Martlock', 0, true)).toBeCloseTo(0.435, 3)
  })

  it('gives capes and bags their bonus in Brecilien', () => {
    expect(item('CAPE').bonusCity).toBe('Brecilien')
    expect(item('BAG_INSIGHT').bonusCity).toBe('Brecilien')
    // Faction capes and royal items are crafted where their base item is.
    expect(item('CAPEITEM_FW_LYMHURST').bonusCity).toBe('Brecilien')
    expect(item('HEAD_PLATE_ROYAL').bonusCity).toBe('Fort Sterling')
  })
})

describe('game data', () => {
  it('has the Kingmaker recipe with the artifact or a token, never returned', () => {
    const r = recipe('2H_CLAYMORE_AVALON', 'T4_2H_CLAYMORE_AVALON@1')
    expect(r.slots.map((s) => [s.options, s.count, s.returned])).toEqual([
      [['T4_METALBAR_LEVEL1@1'], 20, true],
      [['T4_LEATHER_LEVEL1@1'], 12, true],
      [['T4_ARTEFACT_2H_CLAYMORE_AVALON', 'T4_ARTEFACT_TOKEN_FAVOR_4'], 1, false],
    ])
    expect(r.focus).toBe(3001)
    expect(data.ingredients.T4_ARTEFACT_2H_CLAYMORE_AVALON.name).toBe('Remnants of the Old King')
  })

  it('starts artifact items at T4 and normal items at T2 or T3', () => {
    expect(item('2H_CLAYMORE_AVALON').recipes[0].tier).toBe(4)
    expect(item('MAIN_SWORD').recipes[0].tier).toBe(2)
    expect(item('2H_CLAYMORE').recipes[0].tier).toBe(4)
  })

  it('builds royal items from a base item and sigils', () => {
    const r = recipe('HEAD_PLATE_ROYAL', 'T6_HEAD_PLATE_ROYAL')
    expect(r.slots[0].options).toEqual(['T6_HEAD_PLATE_SET1', 'T6_HEAD_PLATE_SET2', 'T6_HEAD_PLATE_SET3'])
    expect(r.slots[0].preserveQuality).toBe(true)
    expect(r.slots[1]).toMatchObject({ options: ['QUESTITEM_TOKEN_ROYAL_T6'], count: 8, returned: false })
  })
})

describe('calcCraftRow', () => {
  // T4 Kingmaker in Lymhurst: bars 100 and leather 120 by buy order, the artifact 30 000 instantly in
  // Brecilien, sold instantly to the Black Market at 45 000.
  const m = market([
    ['T4_METALBAR', 'Thetford', { sellMin: null, buyMax: quote(100) }],
    ['T4_LEATHER', 'Martlock', { sellMin: null, buyMax: quote(120) }],
    ['T4_ARTEFACT_2H_CLAYMORE_AVALON', 'Brecilien', { sellMin: quote(30_000), buyMax: null }],
    ['T4_ARTEFACT_2H_CLAYMORE_AVALON', 'Caerleon', { sellMin: quote(28_000), buyMax: null }],
    ['T4_ARTEFACT_TOKEN_FAVOR_4', 'Brecilien', { sellMin: quote(40_000), buyMax: null }],
    ['T4_2H_CLAYMORE_AVALON', 'Black Market', { sellMin: null, buyMax: quote(45_000) }],
    ['T4_2H_CLAYMORE_AVALON', 'Martlock', { sellMin: quote(50_000), buyMax: null }],
  ])
  const kingmaker = item('2H_CLAYMORE_AVALON')
  const t4 = recipe('2H_CLAYMORE_AVALON', 'T4_2H_CLAYMORE_AVALON')
  const row = calcCraftRow(kingmaker, t4, data, m, settings, NOW)

  it('buys materials after returns, and the artifact whole', () => {
    const [bars, leather, artifact] = row.lines
    expect(bars.perCraft).toBeCloseTo(15.0376, 4)
    expect(bars.unitCost).toBeCloseTo(102.5)
    expect(leather.perCraft).toBeCloseTo(9.0226, 4)
    expect(artifact.perCraft).toBe(1)
    expect(artifact.unitCost).toBe(30_000)
    expect(artifact.city).toBe('Brecilien')
    expect(row.materialCost).toBeCloseTo(32_651.13, 2)
  })

  it('charges the usage fee on the sum of the ingredient values', () => {
    // (20 + 12) × 16 + 1 920 = 2 432
    expect(t4.itemValue).toBe(2432)
    expect(row.usageFee).toBeCloseTo(1368)
    expect(row.costPerItem).toBeCloseTo(34_019.13, 2)
  })

  it('sells instantly to the Black Market, and never with a sell order there', () => {
    const bm = row.places['Black Market']
    expect(bm.order).toBeNull()
    expect(bm.instant!.revenue).toBeCloseTo(43_200)
    expect(bm.instant!.profit).toBeCloseTo(9_180.87, 2)
    expect(bm.instant!.percent).toBeCloseTo(0.26987, 4)
  })

  it('pays tax and the setup fee on sell orders', () => {
    const sale = row.places.Martlock.order!
    expect(sale.revenue).toBeCloseTo(50_000 * 0.935)
    expect(sale.profit).toBeCloseTo(50_000 * 0.935 - 34_019.13, 1)
  })

  it('works out focus without specs, and silver per focus', () => {
    expect(row.focus).toBe(1715)
    expect(row.materialCostFocus).toBeCloseTo(31_836.46, 2)
    expect(row.silverPerFocus).toBeCloseTo(0.475, 3)
  })

  it('multiplies by the amount', () => {
    const three = calcCraftRow(kingmaker, t4, data, m, { ...settings, amount: 3 }, NOW)
    expect(three.places['Black Market'].instant!.profit).toBeCloseTo(3 * 9_180.87, 1)
    expect(three.costPerItem).toBeCloseTo(34_019.13, 2)
  })

  it('uses the token instead of the artifact when chosen', () => {
    const r = calcCraftRow(kingmaker, t4, data, m, { ...settings, options: [0, 0, 1] }, NOW)
    expect(r.lines[2].id).toBe('T4_ARTEFACT_TOKEN_FAVOR_4')
    expect(r.lines[2].unitCost).toBe(40_000)
  })

  it('picks the cheapest city per ingredient, Brecilien included for artifacts', () => {
    const r = calcCraftRow(kingmaker, t4, data, m, { ...settings, sources: { ...sources, artifact: instant('cheapest') } }, NOW)
    expect(r.lines[2].city).toBe('Caerleon')
    expect(r.lines[2].unitCost).toBe(28_000)
  })

  it('scales a typed-in focus cost to every variant', () => {
    const focus = { '2H_CLAYMORE_AVALON': { id: 'T4_2H_CLAYMORE_AVALON', cost: 1000 } }
    const t41 = recipe('2H_CLAYMORE_AVALON', 'T4_2H_CLAYMORE_AVALON@1')
    expect(focusPerCraft(kingmaker, t4, focus['2H_CLAYMORE_AVALON'])).toBe(1000)
    expect(focusPerCraft(kingmaker, t41, focus['2H_CLAYMORE_AVALON'])).toBeCloseTo((1000 * 3001) / 1715)
    expect(focusPerCraft(kingmaker, t41, undefined)).toBe(3001)
  })

  it('uses manual prices for missing ingredients and per-quality sell prices', () => {
    const manual = {
      buy: { [buyKey('T4_METALBAR', 'Thetford')]: 200, [buyKey('T4_ARTEFACT_2H_CLAYMORE_AVALON', 'Brecilien', 'instant')]: 1 },
      sell: { [qualityKey('T4_2H_CLAYMORE_AVALON', 3)]: 99_000 },
    }
    const r = calcCraftRow(kingmaker, t4, data, m, { ...settings, manual, quality: 3 }, NOW)
    expect(r.lines[0].price!.manual).toBe(true)
    expect(r.lines[0].unitCost).toBeCloseTo(205)
    expect(r.lines[2].unitCost).toBe(1)
    // At quality 3 there are no market prices in this test, so the typed-in price fills every city.
    expect(r.places.Caerleon.order!.price.price).toBe(99_000)
    expect(r.places.Martlock.order!.price.price).toBe(50_000)
  })

  it('has no cost when an ingredient price is missing', () => {
    const t5 = recipe('2H_CLAYMORE_AVALON', 'T5_2H_CLAYMORE_AVALON')
    const r = calcCraftRow(kingmaker, t5, data, m, settings, NOW)
    expect(r.materialCost).toBeNull()
    expect(r.costPerItem).toBeNull()
  })

  it('charges no usage fee at T2', () => {
    const sword = item('MAIN_SWORD')
    expect(calcCraftRow(sword, sword.recipes[0], data, m, settings, NOW).usageFee).toBe(0)
  })
})

describe('upgrade recipes', () => {
  // T4 Royal Helmet: a Soldier Helmet (8 bars) + 2 royal sigils, crafted in Fort Sterling.
  const m = market([
    ['T4_METALBAR', 'Thetford', { sellMin: null, buyMax: quote(100) }],
    ['T4_HEAD_PLATE_SET1', 'Martlock', { sellMin: quote(2_000), buyMax: null }],
    ['QUESTITEM_TOKEN_ROYAL_T4', 'Martlock', { sellMin: quote(45_000), buyMax: null }],
  ])
  const royal = item('HEAD_PLATE_ROYAL')
  const t4 = recipe('HEAD_PLATE_ROYAL', 'T4_HEAD_PLATE_ROYAL')
  const s = { ...settings, craftCity: 'Fort Sterling' } as const

  it('buys the base item at its market price', () => {
    const r = calcCraftRow(royal, t4, data, m, s, NOW)
    expect(r.lines[0].unitCost).toBe(2_000)
    expect(r.lines[1].perCraft).toBe(2)
    expect(r.materialCost).toBe(92_000)
    expect(r.focus).toBe(0)
    expect(r.silverPerFocus).toBeNull()
  })

  it('or counts its crafted cost: materials after returns plus its own usage fee', () => {
    const r = calcCraftRow(royal, t4, data, m, { ...s, crafted: { base: true } }, NOW)
    const base = r.lines[0]
    expect(base.crafted!.recipe.id).toBe('T4_HEAD_PLATE_SET1')
    // 8 bars × (1 − 24.8%) × 102.5 + 0.1125 × 128 × 5
    expect(base.unitCost).toBeCloseTo(616.54 + 72, 2)
    expect(r.materialCost).toBeCloseTo(90_688.54, 2)
    // Crafting the base item costs focus, so focus now pays off.
    expect(r.focus).toBe(base.crafted!.recipe.focus)
    expect(r.silverPerFocus).toBeGreaterThan(0)
  })
})

describe('journals', () => {
  const blacksmith = data.journals.find((j) => j.kind === 'WARRIOR')!

  it('fills a share of a journal of the same tier per craft', () => {
    expect(item('2H_CLAYMORE_AVALON').journal).toBe('WARRIOR')
    // (20 + 12) × 22.5 fame per T4 material × 1.4 for artifact gear
    const t4 = recipe('2H_CLAYMORE_AVALON', 'T4_2H_CLAYMORE_AVALON')
    expect(t4.fame).toBe(1008)
    expect(journalsPerCraft(t4, blacksmith)).toBeCloseTo(0.28)
    // Each enchantment level doubles the fame.
    expect(journalsPerCraft(recipe('2H_CLAYMORE_AVALON', 'T4_2H_CLAYMORE_AVALON@2'), blacksmith)).toBeCloseTo(1.12)
  })

  it('values a journal as the full one after fees minus the empty one', () => {
    const m = market([
      ['T4_JOURNAL_WARRIOR_EMPTY', 'Lymhurst', { sellMin: quote(3_000), buyMax: null }],
      ['T4_JOURNAL_WARRIOR_FULL', 'Lymhurst', { sellMin: quote(20_000), buyMax: null }],
    ])
    const v = journalValue(blacksmith, 4, m, settings, 'Lymhurst', NOW)
    expect(v.perJournal).toBeCloseTo(20_000 * 0.935 - 3_000)
  })

  it('gives no journal for royal items and faction capes, which give no fame', () => {
    expect(item('HEAD_PLATE_ROYAL').journal).toBeNull()
    expect(item('CAPEITEM_FW_LYMHURST').journal).toBeNull()
    expect(item('CAPE').journal).toBe('TOOLMAKER')
  })
})
