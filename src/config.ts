// Market and game constants that aren't in the generated game data.

/** Royal-continent cities used for buying and selling refining goods. */
export const CITIES = ['Bridgewatch', 'Caerleon', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford'] as const
export type City = (typeof CITIES)[number]

/** City colour badges. Text colours keep at least 4.5:1 contrast on their background. */
export const CITY_COLORS: Record<City, { bg: string; text: string }> = {
  Bridgewatch: { bg: '#f0923a', text: '#1c1105' },
  Caerleon: { bg: '#5f6672', text: '#ffffff' },
  'Fort Sterling': { bg: '#d4d8de', text: '#15181d' },
  Lymhurst: { bg: '#4fb35f', text: '#07170a' },
  Martlock: { bg: '#7cc7f2', text: '#06151f' },
  Thetford: { bg: '#8b5cc7', text: '#ffffff' },
}

export const AODP_BASE = 'https://europe.albion-online-data.com/api/v2/stats'
export const ICON_BASE = 'https://render.albiononline.com/v1/item'

/** Prices older than this are flagged as stale (hours). */
export const STALE_AFTER_HOURS = 6
/** Prices older than this are ignored (hours). */
export const IGNORE_AFTER_HOURS = 24

export const PRICE_CACHE_MINUTES = 5
export const HISTORY_CACHE_MINUTES = 60

/** Market sales tax, charged when an item sells. */
export const SALES_TAX = { premium: 0.04, standard: 0.08 }
/** Setup fee, charged when placing a buy or sell order. */
export const SETUP_FEE = 0.025
/** Usage fee = factor × item value × station fee / 100. */
export const USAGE_FEE_FACTOR = 0.1125
/** Production bonus from using focus. */
export const FOCUS_BONUS = 0.59
/** Focus efficiency per spec level: all tiers of the family, and the item's own tier. */
export const FOCUS_EFFICIENCY_PER_LEVEL = { anyTier: 30, ownTier: 250 }
