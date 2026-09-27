<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { BLACK_MARKET, type Place } from '../../config'
  import type { CraftRow, IngredientLine, JournalValue, PlaceResult, Sale, Source } from '../../calc/crafting'
  import { buyKey, qualityKey } from '../../calc/market'
  import type { CraftItem, Journal } from '../../gamedata/types'
  import { settings, type CellValue, type SellVia } from '../../app/settings.svelte'
  import { age, int, percent, signed, tierLabel, volume } from '../../lib/format'
  import CityBadge from '../../ui/CityBadge.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import { profitTint } from '../../ui/shading'
  import RowDetails from './RowDetails.svelte'

  interface Props {
    item: CraftItem
    rows: CraftRow[]
    /** Sell places to show, in column order. */
    places: Place[]
    amount: number
    quality: number
    sellVia: SellVia
    cellValue: CellValue
    showFocus: boolean
    journal: Journal | null
    /** Journal prices per tier. */
    journalValues: Map<number, JournalValue>
  }

  let { item, rows, places, amount, quality, sellVia, cellValue, showFocus, journal, journalValues }: Props =
    $props()

  const expanded = new SvelteSet<string>()
  const toggle = (id: string) => (expanded.has(id) ? expanded.delete(id) : expanded.add(id))

  const slotCount = $derived(rows[0]?.lines.length ?? 0)
  const columns = $derived(3 + slotCount + places.length * (showFocus ? 2 : 1) + (showFocus ? 2 : 0))

  /** The Black Market only buys, so it always shows the instant sale. */
  function salesOf(place: Place, c: PlaceResult): (Sale | null)[] {
    if (place === BLACK_MARKET || sellVia === 'instant') return [c.instant]
    if (sellVia === 'order') return [c.order]
    return [c.order, c.instant]
  }

  /**
   * Most profitable shown place, if any makes a profit with a price seen in the last 6h. A sell
   * order also needs trades in the last 7 days (a listing nobody buys isn't a real price); an
   * instant sale goes into an existing buy order, so it counts without them.
   */
  function bestPlace(row: CraftRow): Place | null {
    let best: Place | null = null
    let bestProfit = 0
    for (const place of places) {
      const c = row.places[place]
      for (const sale of salesOf(place, c)) {
        if (!sale || sale.profit === null || sale.price.stale || sale.profit <= bestProfit) continue
        if (sale === c.order && !c.volume?.avg7) continue
        best = place
        bestProfit = sale.profit
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

  const tint = (sales: (Sale | null)[], focus: boolean) =>
    profitTint(sales.map((s) => (focus ? s?.percentFocus : s?.percent)))

  /** 15.04 → "15.0", 2 → "2", 1 234 → "1,234" */
  const qty = (n: number) => (n >= 100 ? int(n) : Number.isInteger(n) ? String(n) : n.toFixed(1))

  const viaLabel = (s: Source) => (s.via === 'order' ? 'buy order + fee' : 'instant buy')
  const cityLabel = (s: Source) => (s.city === 'cheapest' ? 'cheapest' : s.city)

  // Manual prices are committed on change (Enter or leaving the field), so typing isn't interrupted.
  // Clearing a field, or typing the market price, goes back to the market price.
  function setBuy(l: IngredientLine, input: HTMLInputElement) {
    const key = buyKey(l.manualId, l.city!, l.source.via)
    const price = Math.round(Number(input.value))
    if (!input.value || !(price > 0) || price === l.market?.price) delete settings.manual.buy[key]
    else settings.manual.buy[key] = price
    input.value = String(settings.manual.buy[key] ?? l.market?.price ?? '')
  }

  function setSell(key: string, input: HTMLInputElement) {
    const price = Math.round(Number(input.value))
    if (!input.value || !(price > 0)) delete settings.manual.sell[key]
    else settings.manual.sell[key] = price
    input.value = String(settings.manual.sell[key] ?? '')
  }

  function lineTitle(l: IngredientLine): string {
    const lines = [`${l.name}: ${l.count} per craft, ${qty(l.perCraft * amount)} for ${amount} after returns`]
    if (l.crafted) {
      lines.push(`Crafted from its recipe (switch it on the ingredient tile):`)
      for (const m of l.crafted.lines) {
        lines.push(`   ${m.name}: ${qty(m.perCraft)} × ${m.unitCost === null ? '—' : int(m.unitCost)} (${m.city ?? ''})`)
      }
      lines.push(`   usage fee ${int(l.crafted.usageFee)}`)
      return lines.join('\n')
    }
    const how = l.source.via === 'order' ? 'buy order' : 'instant buy'
    lines.push(
      l.source.city === 'cheapest'
        ? `${how} in ${l.city}, the cheapest city for this row (set on the ingredient tile)`
        : `${how} in ${l.city} (set on the ingredient tile)`,
    )
    lines.push(
      l.market
        ? `${l.source.via === 'order' ? 'Highest buy order' : 'Lowest sell order'} ${int(l.market.price)} (seen ${age(l.market.ageHours)} ago)`
        : `No recent ${l.source.via === 'order' ? 'buy order' : 'sell order'} in ${l.city}`,
    )
    if (l.price?.manual) lines.push(`Using your price ${int(l.price.price)}`)
    if (l.unitCost !== null && l.source.via === 'order') {
      lines.push(`${int(l.price!.price)} + 2.5% setup fee = ${int(l.unitCost)} per unit`)
    }
    if (l.volume) {
      lines.push(`Traded per day: yesterday ${volume(l.volume.yesterday)}, 7-day average ${volume(l.volume.avg7)}`)
    }
    lines.push('Type a price to override it; clear the field to go back to the market price.')
    return lines.join('\n')
  }

  function cellTitle(row: CraftRow, place: Place): string {
    const c = row.places[place]
    const lines: string[] = [place]
    const ways: [string, Sale | null][] =
      place === BLACK_MARKET
        ? [['Instant sell (the Black Market only buys)', c.instant]]
        : [
            ['Sell order', c.order],
            ['Instant sell', c.instant],
          ]
    for (const [label, sale] of ways) {
      if (!sale) {
        lines.push(`${label}: no recent price`)
        continue
      }
      const seen = sale.price.manual ? 'your manual price' : `seen ${age(sale.price.ageHours)} ago`
      lines.push(`${label}: ${int(amount)} × ${int(sale.price.price)} (${seen})`)
      const fees = sale.setupFee ? `tax ${int(sale.tax)}, setup fee ${int(sale.setupFee)}` : `tax ${int(sale.tax)}`
      lines.push(`   revenue ${int(sale.revenue)} after ${fees}`)
      if (sale.profit !== null && sale.profitFocus !== null) {
        lines.push(
          `   profit ${signed(sale.profit)} (${percent(sale.percent!)}), with focus ${signed(sale.profitFocus)} (${percent(sale.percentFocus!)})`,
        )
      }
    }
    lines.push(
      row.costPerItem === null
        ? 'Ingredients: a price is missing (type one in on the left)'
        : `Cost per item ${int(row.costPerItem)} (ingredients + usage fee), with focus ${int(row.costPerItemFocus!)}`,
    )
    if (c.volume) {
      lines.push(
        `Traded per day: yesterday ${volume(c.volume.yesterday)}, 7-day average ${volume(c.volume.avg7)} (${c.volume.days} days of data)`,
      )
    }
    lines.push('Click the row for the full breakdown.')
    return lines.join('\n')
  }
</script>

{#snippet ingredient(l: IngredientLine)}
  <div title={lineTitle(l)}>
    <div class="mat-top">
      <ItemIcon id={l.id} size={24} />
      {#if l.crafted}
        <span class="crafted-cost">{l.unitCost === null ? '—' : int(l.unitCost)}</span>
      {:else}
        <input
          type="number"
          min="1"
          class="price-input"
          class:manual={l.price?.manual}
          class:missing={!l.price}
          value={l.price?.price ?? ''}
          placeholder="price?"
          onchange={(e) => setBuy(l, e.currentTarget)}
        />
        {#if l.price?.manual}
          <button
            type="button"
            class="reset"
            title="Use the market price"
            onclick={() => delete settings.manual.buy[buyKey(l.manualId, l.city!, l.source.via)]}>×</button
          >
        {/if}
      {/if}
    </div>
    <div class="unit" class:stale={l.price?.stale}>
      {#if l.crafted}
        <span class="small">crafted · materials + fee</span>
      {:else}
        {l.unitCost === null ? '—' : int(l.unitCost)}
        <CityBadge city={l.city!} small />
      {/if}
    </div>
    <div class="small">
      {qty(l.perCraft * amount)} needed{#if !l.crafted}&nbsp;· {volume(l.volume?.yesterday ?? null)} · {volume(
          l.volume?.avg7 ?? null,
        )}{/if}
    </div>
  </div>
{/snippet}

<table>
  <thead>
    <tr>
      <th rowspan="2" class="left">Item</th>
      {#each rows[0]?.lines ?? [] as l, i (i)}
        <th rowspan="2" class="left">
          {l.name}
          <div class="sub">
            {l.crafted ? 'crafted' : `${viaLabel(l.source)} · ${cityLabel(l.source)}`}
          </div>
        </th>
      {/each}
      <th rowspan="2">
        Cost / item
        <div class="sub">incl. fees</div>
      </th>
      <th rowspan="2" class="left">
        Your sell price
        <div class="sub">where none</div>
      </th>
      {#each places as place (place)}
        <th colspan={showFocus ? 2 : 1} class="city">
          <CityBadge city={place} small />
          {#if place === item.bonusCity}<span class="bonus" title="Crafting bonus city for this item">⚒</span>{/if}
        </th>
      {/each}
      {#if showFocus}
        <th rowspan="2">Focus / craft</th>
        <th rowspan="2">Silver / focus</th>
      {/if}
    </tr>
    <tr>
      {#each places as place (place)}
        <th class="sub city-start">
          {place === BLACK_MARKET ? 'instant' : showFocus ? 'normal' : 'profit'}
        </th>
        {#if showFocus}<th class="sub">focus</th>{/if}
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.recipe.id)}
      {@const best = bestPlace(row)}
      {@const sellKey = qualityKey(row.recipe.id, quality)}
      {@const manualSell = settings.manual.sell[sellKey]}
      {@const open = expanded.has(row.recipe.id)}
      <tr class:open>
        <td class="item">
          <button
            type="button"
            class="expand"
            title={open ? 'Hide the breakdown' : 'Show the full breakdown'}
            onclick={() => toggle(row.recipe.id)}
          >
            <span class="caret">{open ? '▾' : '▸'}</span>
            <ItemIcon id={row.recipe.id} size={36} />
            <span>{tierLabel(row.recipe.tier, row.recipe.enchant)}</span>
          </button>
        </td>
        {#each row.lines as l, i (i)}
          <td>{@render ingredient(l)}</td>
        {/each}
        <td class="num">
          <div class="unit">{row.costPerItem === null ? '—' : int(row.costPerItem)}</div>
          {#if showFocus && row.focus > 0 && row.costPerItemFocus !== null}
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
              title="Sell price used in places with no recent sell order, at this quality. Clear the field to remove it."
              onchange={(e) => setSell(sellKey, e.currentTarget)}
            />
            {#if manualSell}
              <button type="button" class="reset" title="Remove" onclick={() => delete settings.manual.sell[sellKey]}
                >×</button
              >
            {/if}
          </div>
        </td>
        {#each places as place (place)}
          {@const c = row.places[place]}
          {@const sales = salesOf(place, c)}
          <td
            class="num profit city-start"
            class:best={place === best}
            style={tint(sales, false)}
            title={cellTitle(row, place)}
          >
            {#each sales as sale, i (i)}
              <div class:stale={sale?.price.stale} class:manual-price={sale?.price.manual} class:second={i === 1}>
                {show(sale, false)}{#if i === 0 && place !== BLACK_MARKET && c.instantBetter && show(sale, false) !== '—'}<span
                    class="flag">⚡</span
                  >{/if}
              </div>
            {/each}
            <div class="small">{volume(c.volume?.yesterday ?? null)} · {volume(c.volume?.avg7 ?? null)}</div>
          </td>
          {#if showFocus}
            <td
              class="num profit"
              class:best={place === best}
              style={row.focus > 0 ? tint(sales, true) : ''}
              title={cellTitle(row, place)}
            >
              {#each sales as sale, i (i)}
                <div class:stale={sale?.price.stale} class:manual-price={sale?.price.manual} class:second={i === 1}>
                  {row.focus > 0 ? show(sale, true) : '—'}
                </div>
              {/each}
            </td>
          {/if}
        {/each}
        {#if showFocus}
          <td class="num">{row.focus > 0 ? int(row.focus) : '—'}</td>
          <td class="num">{row.silverPerFocus === null ? '—' : row.silverPerFocus.toFixed(2)}</td>
        {/if}
      </tr>
      {#if open}
        <tr class="details">
          <td colspan={columns}>
            <RowDetails
              {row}
              {item}
              {places}
              {amount}
              {journal}
              journalValue={journalValues.get(row.recipe.tier) ?? null}
            />
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>

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

  .expand {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    font-weight: 700;
  }

  .expand:hover .caret {
    color: var(--accent);
  }

  .caret {
    width: 0.8em;
    color: var(--text-muted);
  }

  .mat-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .price-input {
    width: 76px;
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

  .crafted-cost {
    font-weight: 600;
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

  .flag {
    margin-left: 2px;
  }

  tbody tr:not(.details):hover td {
    background-color: color-mix(in srgb, var(--surface-2) 70%, transparent);
  }

  tr.open td {
    border-bottom-color: transparent;
  }

  tr.details td {
    padding: 4px 8px 14px 44px;
    background: var(--surface);
    white-space: normal;
  }
</style>
