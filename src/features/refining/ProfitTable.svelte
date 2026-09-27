<script lang="ts">
  import { CITIES, type City } from '../../config'
  import { buyKey, type CityResult, type MaterialLine, type RowResult, type Sale } from '../../calc/refining'
  import type { RefiningFamily } from '../../gamedata/types'
  import { settings, type CellValue, type SellVia } from '../../app/settings.svelte'
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
   * Most profitable sell city, if any makes a profit. Skips stale prices, cities under the minimum
   * volume, and cities with no trades in the last 7 days (a listing nobody buys isn't a real price).
   */
  function bestCity(row: RowResult): City | null {
    let best: City | null = null
    let bestProfit = 0
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

  /**
   * Green for profit, red for loss, stronger the bigger the margin. Uses profit % so low and high
   * tiers are comparable: full green at +100%, full red at −50%.
   */
  function tint(sales: (Sale | null)[], focus: boolean): string {
    const margins = sales
      .map((s) => (focus ? s?.percentFocus : s?.percent))
      .filter((p): p is number => p !== null && p !== undefined)
    if (!margins.length) return ''
    const margin = Math.max(...margins)
    const strength = margin >= 0 ? Math.min(1, margin / 1) : Math.min(1, -margin / 0.5)
    const alpha = (0.06 + 0.54 * strength ** 0.7).toFixed(2)
    return margin >= 0 ? `background-color: rgb(34 197 94 / ${alpha})` : `background-color: rgb(239 68 68 / ${alpha})`
  }

  // Manual prices are committed on change (Enter or leaving the field), so typing isn't interrupted.
  // Clearing a field, or typing the market price, goes back to the market price.
  function setBuy(m: MaterialLine, input: HTMLInputElement) {
    const key = buyKey(m.id, m.city)
    const price = Math.round(Number(input.value))
    if (!input.value || !(price > 0) || price === m.market?.price) delete settings.manual.buy[key]
    else settings.manual.buy[key] = price
    input.value = String(settings.manual.buy[key] ?? m.market?.price ?? '')
  }

  function setSell(id: string, input: HTMLInputElement) {
    const price = Math.round(Number(input.value))
    if (!input.value || !(price > 0)) delete settings.manual.sell[id]
    else settings.manual.sell[id] = price
    input.value = String(settings.manual.sell[id] ?? '')
  }

  function materialTitle(m: MaterialLine): string {
    const lines = [
      `${m.count} per craft · buy ${int(m.perStack)} per stack (${int(m.perStackFocus)} with focus) in ${m.city}`,
      m.market
        ? `Highest buy order ${int(m.market.price)} (seen ${age(m.market.ageHours)} ago)`
        : `No recent buy order in ${m.city}`,
    ]
    if (m.price?.manual) lines.push(`Using your price ${int(m.price.price)}`)
    if (m.unitCost !== null) lines.push(`${int(m.price!.price)} + 2.5% setup fee = ${int(m.unitCost)} per unit`)
    if (m.volume) {
      lines.push(`Traded per day: yesterday ${volume(m.volume.yesterday)}, 7-day average ${volume(m.volume.avg7)}`)
    }
    lines.push('Type a price to override it; clear the field to go back to the market price.')
    return lines.join('\n')
  }

  function cellTitle(row: RowResult, city: City): string {
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
      const seen = sale.price.manual ? 'your manual price' : `seen ${age(sale.price.ageHours)} ago`
      lines.push(`${label}: ${int(stack)} × ${int(sale.price.price)} (${seen})`)
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
        ? 'Materials: price missing (type one in on the left)'
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

{#snippet material(m: MaterialLine | null)}
  {#if m}
    <div title={materialTitle(m)}>
      <div class="mat-top">
        <ItemIcon id={m.id} size={24} />
        <input
          type="number"
          min="1"
          class="price-input"
          class:manual={m.price?.manual}
          class:missing={!m.price}
          value={m.price?.price ?? ''}
          placeholder="price?"
          onchange={(e) => setBuy(m, e.currentTarget)}
        />
        {#if m.price?.manual}
          <button
            type="button"
            class="reset"
            title="Use the market price"
            onclick={() => delete settings.manual.buy[buyKey(m.id, m.city)]}>×</button
          >
        {/if}
      </div>
      <div class="unit" class:stale={m.price?.stale}>
        {m.unitCost === null ? '—' : int(m.unitCost)} <span class="small">incl. fee</span>
      </div>
      <div class="small">
        {int(m.perStack)}/stack · {volume(m.volume?.yesterday ?? null)} · {volume(m.volume?.avg7 ?? null)}
      </div>
    </div>
  {:else}
    <span class="small">—</span>
  {/if}
{/snippet}

<table>
  <thead>
    <tr>
      <th rowspan="2" class="left">Item</th>
      <th rowspan="2" class="left">
        Buy {family.rawName.toLowerCase()}
        <div class="sub">buy order · per unit</div>
      </th>
      <th rowspan="2" class="left">
        Buy lower tier
        <div class="sub">buy order · per unit</div>
      </th>
      <th rowspan="2">
        Cost / item
        <div class="sub">after returns, incl. fees</div>
      </th>
      <th rowspan="2" class="left">
        Your sell price
        <div class="sub">for cities without one</div>
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
      {@const manualSell = settings.manual.sell[row.recipe.id]}
      <tr>
        <td class="item">
          <ItemIcon id={row.recipe.id} size={36} />
          <span>{tierLabel(row.recipe.tier, row.recipe.enchant)}</span>
        </td>
        <td>{@render material(row.raw)}</td>
        <td>{@render material(row.lower)}</td>
        <td class="num">
          <div class="unit">{row.costPerItem === null ? '—' : int(row.costPerItem)}</div>
          {#if showFocus && row.costPerItemFocus !== null}
            <div class="small">focus {int(row.costPerItemFocus)}</div>
          {/if}
        </td>
        <td>
          <div class="mat-top">
            <input
              type="number"
              min="1"
              class="price-input"
              class:manual={!!manualSell}
              value={manualSell ?? ''}
              placeholder="—"
              title="Sell price used in cities with no recent sell order. Clear the field to remove it."
              onchange={(e) => setSell(row.recipe.id, e.currentTarget)}
            />
            {#if manualSell}
              <button
                type="button"
                class="reset"
                title="Remove"
                onclick={() => delete settings.manual.sell[row.recipe.id]}>×</button
              >
            {/if}
          </div>
        </td>
        {#each CITIES as city (city)}
          {@const c = row.cities[city]}
          {@const sales = salesOf(c)}
          <td
            class="num profit city-start"
            class:best={city === best}
            class:low={lowVolume(c)}
            style={tint(sales, false)}
            title={cellTitle(row, city)}
          >
            {#each sales as sale, i (i)}
              <div class:stale={sale?.price.stale} class:manual-price={sale?.price.manual} class:second={i === 1}>
                {show(sale, false)}{#if i === 0 && c.instantBetter && show(sale, false) !== '—'}<span class="flag"
                    >⚡</span
                  >{/if}
              </div>
            {/each}
            <div class="small">{volume(c.volume?.yesterday ?? null)} · {volume(c.volume?.avg7 ?? null)}</div>
          </td>
          {#if showFocus}
            <td
              class="num profit"
              class:best={city === best}
              class:low={lowVolume(c)}
              style={tint(sales, true)}
              title={cellTitle(row, city)}
            >
              {#each sales as sale, i (i)}
                <div class:stale={sale?.price.stale} class:manual-price={sale?.price.manual} class:second={i === 1}>
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
  Profits per stack of {int(stack)}; hover any cell for the full breakdown.
  <span class="swatch gain">green</span> profit and <span class="swatch loss">red</span> loss get stronger with the
  margin (full at +100% / −50%) ·
  <span class="best-chip">gold frame</span> most profitable city, ignoring stale prices, cities with no trades in 7 days{minVolume >
  0
    ? ' and cities under your minimum volume'
    : ''} · ⚡ instant sell earns at least as much as a sell order ·
  <span class="stale">italic</span> price older than 6h · <span class="manual-price">underlined</span> uses your
  manual price · — no price in the last 24h · small numbers: items traded yesterday · 7-day average
  {#if sellVia === 'both'}· top line sell order, bottom line instant sell{/if}
</p>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th,
  td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  th {
    background: var(--surface);
    font-weight: 600;
    text-align: right;
    vertical-align: bottom;
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
    font-size: 0.78em;
    font-weight: 400;
    color: var(--text-muted);
  }

  .bonus {
    margin-left: 4px;
    color: var(--accent);
  }

  .item {
    font-weight: 700;
  }

  .item :global(img) {
    margin-right: 6px;
  }

  .mat-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .price-input {
    width: 84px;
    padding: 2px 6px;
    text-align: right;
    appearance: textfield;
  }

  .price-input::-webkit-inner-spin-button,
  .price-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .price-input.manual {
    border-color: var(--accent);
    color: var(--accent);
  }

  .price-input.missing {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--border));
  }

  .price-input.missing::placeholder {
    color: color-mix(in srgb, var(--bad) 70%, var(--text-muted));
  }

  .reset {
    padding: 0 6px;
    line-height: 1.3;
  }

  .unit {
    font-weight: 600;
    margin-top: 2px;
  }

  .small {
    font-size: 0.78em;
    font-weight: 400;
    color: rgb(230 232 235 / 0.6);
  }

  .num {
    text-align: right;
  }

  .profit {
    font-weight: 600;
  }

  .second {
    font-size: 0.85em;
    opacity: 0.8;
  }

  .stale {
    font-style: italic;
    opacity: 0.75;
  }

  .manual-price {
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }

  .best {
    box-shadow: inset 0 0 0 2px var(--accent);
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

  .legend {
    margin-top: 12px;
    font-size: 0.86em;
    color: var(--text-muted);
    line-height: 1.8;
  }

  .swatch {
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--text);
  }

  .swatch.gain {
    background: rgb(34 197 94 / 0.5);
  }

  .swatch.loss {
    background: rgb(239 68 68 / 0.5);
  }

  .best-chip {
    padding: 1px 6px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 2px var(--accent);
    color: var(--text);
  }
</style>
