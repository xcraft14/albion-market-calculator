// User settings, shared by all pages and remembered in the browser.

import type { FocusEntry, Source } from '../calc/crafting'
import type { ManualPrices } from '../calc/market'
import type { BuyCityChoice } from '../calc/refining'
import type { City, CraftCity, Place } from '../config'
import type { IngredientKind } from '../gamedata/types'
import { load } from '../lib/storage'

export type SellVia = 'order' | 'instant' | 'both'
export type CellValue = 'profit' | 'percent' | 'price'

export interface CraftingSettings {
  /** Last item shown, for when the page is opened without one. */
  item: string
  /** Items to craft. */
  amount: number
  dailyBonus: number
  usageFee: number
  /** Quality the products are sold at, 1–5. */
  quality: number
  sellVia: SellVia
  cellValue: CellValue
  showFocus: boolean
  enchants: boolean[]
  /** Crafting city per item key, when it isn't the item's bonus city. */
  city: Record<string, CraftCity>
  /** Where each kind of ingredient is bought (buy order or instant buy, and the city). */
  sources: Partial<Record<IngredientKind, Source>>
  /** Per item key: which alternative each recipe slot uses (artifact or token, which base item). */
  options: Record<string, number[]>
  /** Gear ingredients (basic Cape, royal base items) counted at their crafted cost. */
  crafted: Partial<Record<IngredientKind, boolean>>
  /** Focus cost typed in per item key, for one variant. */
  focus: Record<string, FocusEntry>
  /** Places left out of the profit table. */
  hiddenPlaces: Place[]
  /** Open nodes in the item tree. */
  openNodes: string[]
  /** Where journals are bought and sold. `null` = the crafting city. */
  journalCity: CraftCity | null
}

export interface Settings {
  view: 'profit' | 'prices'
  /** Prices view: show the refined product or the raw resource. */
  pricesOf: 'refined' | 'raw'
  stack: number
  premium: boolean
  dailyBonus: number
  usageFee: number
  sellVia: SellVia
  cellValue: CellValue
  showFocus: boolean
  /** Cities trading fewer items per day (7-day average) are greyed out. 0 = off. */
  minVolume: number
  /** Which enchant levels (.0 – .4) to show. */
  enchants: boolean[]
  /** Per family: buy-order city for the raw resource, or the cheapest per tier. */
  resourceCity: Record<string, BuyCityChoice>
  /** Per family: buy-order city for the lower-tier refined item, or the cheapest per tier. */
  refinedCity: Record<string, BuyCityChoice>
  /** Per family: refining spec levels for T4..T8. */
  specs: Record<string, number[]>
  specsOpen: boolean
  /** Cities left out of the profit table (not considered for selling). */
  hiddenCities: City[]
  /** Prices typed in by the user, for missing or wrong market data. Shared by all pages. */
  manual: ManualPrices
  crafting: CraftingSettings
}

export const SETTINGS_KEY = 'amc.settings.v1'

const defaults: Settings = {
  view: 'profit',
  pricesOf: 'refined',
  stack: 999,
  premium: true,
  dailyBonus: 0,
  usageFee: 500,
  sellVia: 'order',
  cellValue: 'profit',
  showFocus: true,
  minVolume: 0,
  enchants: [true, true, true, true, true],
  resourceCity: {},
  refinedCity: {},
  specs: {},
  specsOpen: true,
  hiddenCities: [],
  manual: { buy: {}, sell: {} },
  crafting: {
    item: '2H_CLAYMORE_AVALON',
    amount: 1,
    dailyBonus: 0,
    usageFee: 500,
    quality: 1,
    sellVia: 'both',
    cellValue: 'profit',
    showFocus: false,
    enchants: [true, true, true, true, true],
    city: {},
    sources: {},
    options: {},
    crafted: {},
    focus: {},
    hiddenPlaces: [],
    openNodes: ['weapons'],
    journalCity: null,
  },
}

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Saved settings over the defaults, one level deep, so new keys inside groups get their defaults too. */
function merge(saved: Partial<Settings>): Settings {
  const result: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(saved)) {
    const fallback = (defaults as unknown as Record<string, unknown>)[key]
    result[key] = isObject(fallback) && isObject(value) ? { ...fallback, ...value } : value
  }
  return result as unknown as Settings
}

export const settings: Settings = $state(merge(load<Settings>(SETTINGS_KEY)))
