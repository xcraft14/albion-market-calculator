// User settings, shared by all pages and remembered in the browser.

import type { City } from '../config'
import { load } from '../lib/storage'

export type SellVia = 'order' | 'instant' | 'both'
export type CellValue = 'profit' | 'percent' | 'price'

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
  /** Per family: buy-order city for the raw resource. */
  resourceCity: Record<string, City>
  /** Per family: buy-order city for the lower-tier refined item. */
  refinedCity: Record<string, City>
  /** Per family: refining spec levels for T4..T8. */
  specs: Record<string, number[]>
  specsOpen: boolean
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
}

export const settings: Settings = $state({ ...defaults, ...load<Settings>(SETTINGS_KEY) })
