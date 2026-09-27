<script lang="ts">
  import { CITIES, type City } from '../../config'
  import type { CityResult, RowResult, Sale } from '../../calc/refining'
  import type { RefiningFamily } from '../../gamedata/types'
  import type { CellValue, SellVia } from '../../app/settings.svelte'
  import { age, int, percent, signed, tierLabel, volume } from '../../lib/format'
  import ItemIcon from '../../ui/ItemIcon.svelte'

  interface Props {
    rows: RowResult[]
    family: RefiningFamily
    stack: number
    sellVia: SellVia
    cellValue: CellValue
    showFocus: boolean
    minVolume: number
  }

  let { rows, family, stack, sellVia, cellValue, showFocus, minVolume }: Props = $props()

  function salesOf(c: CityResult): (Sale | null)[] {
    if (sellVia === 'order') return [c.order]
    if (sellVia === 'instant') return [c.instant]
    return [c.order, c.instant]
  }

  function lowVolume(c: CityResult): boolean {
    return minVolume > 0 && (c.volume?.avg7 ?? 0) < minVolume
  }

  /**
   * Most profitable sell city. Skips stale prices, cities under the minimum volume, and cities
   * with no trades in the last 7 days (a listing nobody buys isn't a real price).
   */
  function bestCity(row: RowResult): City | null {
    let best: City | null = null
    let bestProfit = -Infinity
    for (const city of CITIES) {
      const c = row.cities[city]
      if (lowVolume(c) || !c.volume?.avg7) continue
      for (const sale of salesOf(c)) {
        if (sale && sale.profit !== null && !sale.price.stale && sale.profit > bestProfit) {
          best = city
          bestProfit = sale.profit
        }
      }
    }
    return best
  }

  function show(sale: Sale | null, focus: boolean): string {
    if (!sale) return '—'
    if (cellValue === 'price') return int(sale.price.price)
    if (cellValue === 'percent') {
      const p = focus ? sale.percentFocus : sale.percent
      return p === null ? '—' : percent(p)
    }
    const p = focus ? sale.profitFocus : sale.profit
    return p === null ? '—' : signed(p)
  }

  function isLoss(sale: Sale | null, focus: boolean): boolean {
    const p = focus ? sale?.profitFocus : sale?.profit
    return p !== null && p !== undefined && p < 0
  }

  function tooltip(row: RowResult, city: City): string {
    const c = row.cities[city]
    const lines: string[] = [city]
    const ways: [string, Sale | null][] = [
      ['Sell order', c.order],
      ['Instant sell', c.instant],
    ]
    for (const [label, sale] of ways) {
      if (!sale) {
        lines.push(`${label}: no recent price`)
        continue
      }
      lines.push(`${label}: ${int(stack)} × ${int(sale.price.price)} (seen ${age(sale.price.ageHours)} ago)`)
      const fees = sale.setupFee ? `tax ${int(sale.tax)}, setup fee ${int(sale.setupFee)}` : `tax ${int(sale.tax)}`
      lines.push(`   revenue ${int(sale.revenue)} after ${fees}`)
      if (sale.profit !== null && sale.profitFocus !== null) {
        lines.push(
          `   profit ${signed(sale.profit)} (${percent(sale.percent!)}), with focus ${signed(sale.profitFocus)} (${percent(sale.percentFocus!)})`,
        )
      }
    }
    lines.push(
      row.materialCost === null
        ? 'Materials: no recent buy-order price'
        : `Materials ${int(row.materialCost)}, with focus ${int(row.materialCostFocus!)}`,
    )
    lines.push(`Usage fee ${int(row.usageFee)}`)
    if (c.volume) {
      lines.push(
        `Traded per day: yesterday ${volume(c.volume.yesterday)}, 7-day average ${volume(c.volume.avg7)} (${c.volume.days} days of data)`,
      )
    }
    return lines.join('\n')
  }
</script>

<table>
  <thead>
    <tr>
      <th rowspan="2" class="left">Item</th>
      <th rowspan="2" class="left">
        Materials / stack
        <div class="sub">buy orders{showFocus ? ' · normal / focus' : ''}</div>
      </th>
      {#each CITIES as city (city)}
        <th colspan={showFocus ? 2 : 1} class="city">
          {city}
          {#if city === family.bonusCity}<span class="bonus" title="Refining bonus city">⚒</span>{/if}
        </th>
      {/each}
      {#if showFocus}
        <th rowspan="2">Focus / stack</th>
        <th rowspan="2">Silver / focus</th>
      {/if}
    </tr>
    <tr>
      {#each CITIES as city (city)}
        <th class="sub city-start">{showFocus ? 'normal' : 'profit'}</th>
        {#if showFocus}<th class="sub">focus</th>{/if}
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.recipe.id)}
      {@const best = bestCity(row)}
      <tr>
        <td class="item">
          <ItemIcon id={row.recipe.id} size={32} />
          <span>{tierLabel(row.recipe.tier, row.recipe.enchant)}</span>
        </td>
        <td class="materials">
          {#each [row.raw, row.lower] as m, i (i)}
            {#if m}
              <div class="mat">
                <ItemIcon id={m.id} size={20} />
                <span class="qty">{int(m.perStack)}</span>
                {#if showFocus}<span class="muted">/ {int(m.perStackFocus)}</span>{/if}
                <span class="at" class:stale={m.price?.stale}>@ {m.price ? int(m.price.price) : '—'}</span>
                <span class="vol" title="Traded per day: yesterday · 7-day average">
                  {volume(m.volume?.yesterday ?? null)} · {volume(m.volume?.avg7 ?? null)}
                </span>
              </div>
            {/if}
          {/each}
        </td>
        {#each CITIES as city (city)}
          {@const c = row.cities[city]}
          {@const sales = salesOf(c)}
          <td
            class="num city-start"
            class:best={city === best}
            class:low={lowVolume(c)}
            title={tooltip(row, city)}
          >
            {#each sales as sale, i (i)}
              <div class:loss={isLoss(sale, false)} class:stale={sale?.price.stale} class:second={i === 1}>
                {show(sale, false)}{#if i === 0 && c.instantBetter && show(sale, false) !== '—'}<span class="flag"
                    >⚡</span
                  >{/if}
              </div>
            {/each}
            <div class="vol">{volume(c.volume?.yesterday ?? null)} · {volume(c.volume?.avg7 ?? null)}</div>
          </td>
          {#if showFocus}
            <td class="num focus" class:best={city === best} class:low={lowVolume(c)} title={tooltip(row, city)}>
              {#each sales as sale, i (i)}
                <div class:loss={isLoss(sale, true)} class:stale={sale?.price.stale} class:second={i === 1}>
                  {show(sale, true)}
                </div>
              {/each}
            </td>
          {/if}
        {/each}
        {#if showFocus}
          <td class="num">{int(row.focusPerStack)}</td>
          <td class="num">{row.silverPerFocus === null ? '—' : row.silverPerFocus.toFixed(2)}</td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>

<p class="legend">
  Per stack of {int(stack)}. Hover a cell for the full breakdown.
  <span class="best-chip">best city</span> most profitable, ignoring stale prices, cities with no trades in 7 days
  {minVolume > 0 ? 'and cities under your minimum volume' : ''} ·
  ⚡ instant sell earns at least as much as a sell order ·
  <span class="stale">italic</span> price older than 6h ·
  — no price in the last 24h · small numbers: items traded yesterday · 7-day average
  {#if sellVia === 'both'}· top line sell order, bottom line instant sell{/if}
</p>

<style>
  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    background: var(--surface);
    font-weight: 600;
    text-align: right;
  }

  thead tr:nth-child(2) th {
    top: 29px;
  }

  th.left {
    text-align: left;
  }

  th.city {
    text-align: center;
    border-left: 1px solid var(--border);
  }

  .city-start {
    border-left: 1px solid var(--border);
  }

  .sub {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
  }

  .bonus {
    margin-left: 4px;
    color: var(--accent);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }

  .materials .mat {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .qty {
    min-width: 44px;
    text-align: right;
  }

  .at {
    min-width: 58px;
  }

  .num {
    text-align: right;
  }

  .focus {
    color: #b9c7ff;
  }

  .second {
    font-size: 12px;
    color: var(--text-muted);
  }

  .vol {
    font-size: 11px;
    color: var(--text-muted);
  }

  .muted {
    color: var(--text-muted);
  }

  .loss {
    color: var(--bad);
  }

  .stale {
    font-style: italic;
    opacity: 0.7;
  }

  .best {
    background: color-mix(in srgb, var(--good) 18%, transparent);
    color: var(--good);
    font-weight: 600;
  }

  .low {
    opacity: 0.35;
  }

  .flag {
    margin-left: 2px;
  }

  tbody tr:hover td {
    background-color: color-mix(in srgb, var(--surface-2) 70%, transparent);
  }

  tbody tr:hover td.best {
    background: color-mix(in srgb, var(--good) 24%, transparent);
  }

  .legend {
    margin-top: 12px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.7;
  }

  .best-chip {
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--good) 18%, transparent);
    color: var(--good);
  }
</style>
