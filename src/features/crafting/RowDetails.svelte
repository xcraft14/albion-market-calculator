<script lang="ts">
  import { BLACK_MARKET, type Place } from '../../config'
  import { journalsPerCraft, type CraftRow, type IngredientLine, type JournalValue, type Sale } from '../../calc/crafting'
  import type { CraftItem, Journal } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import { int, percent, signed, tierLabel, volume } from '../../lib/format'
  import CityBadge from '../../ui/CityBadge.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'

  interface Props {
    row: CraftRow
    item: CraftItem
    places: Place[]
    amount: number
    journal: Journal | null
    journalValue: JournalValue | null
  }

  let { row, item, places, amount, journal, journalValue }: Props = $props()

  const hasFocus = $derived(row.focus > 0)
  const typedFocus = $derived(settings.crafting.focus[item.key])
  const focusNote = $derived.by(() => {
    if (!row.recipe.focus) return row.focus > 0 ? 'for the crafted base item' : ''
    if (!typedFocus) return 'base cost, no specs: type yours in the panel above'
    const typed = item.recipes.find((r) => r.id === typedFocus.id)
    return typed?.id === row.recipe.id
      ? 'your typed-in cost'
      : `scaled from your ${typed ? tierLabel(typed.tier, typed.enchant) : ''} cost`
  })

  /** 15.04 → "15.04", 2 → "2" */
  const qty = (n: number) => (Number.isInteger(n) ? int(n) : n >= 100 ? int(n) : n.toFixed(2))
  const money = (n: number | null) => (n === null ? '—' : int(n))

  const journalFill = $derived(journal ? journalsPerCraft(row.recipe, journal) : 0)

  function salesOf(place: Place): [string, Sale | null][] {
    const c = row.places[place]
    return place === BLACK_MARKET
      ? [['instant', c.instant]]
      : [
          ['sell order', c.order],
          ['instant', c.instant],
        ]
  }
</script>

{#snippet lineRow(l: IngredientLine, nested: boolean)}
  <tr class:nested>
    <td class="name">
      <ItemIcon id={l.id} size={nested ? 20 : 24} />
      {l.name}
    </td>
    <td>
      {#if l.crafted}
        crafted
      {:else}
        {l.source.via === 'order' ? 'buy order' : 'instant buy'}
        {#if l.city}<CityBadge city={l.city} small />{/if}
        {#if l.source.city === 'cheapest'}<span class="muted">cheapest</span>{/if}
      {/if}
    </td>
    <td class="num">{l.count}</td>
    <td class="num">{l.slot.returned ? `${qty(l.perCraft)} / ${qty(l.perCraftFocus)}` : 'not returned'}</td>
    <td class="num">
      {money(l.unitCost)}{#if l.crafted && l.unitCostFocus !== l.unitCost}<span class="muted">
          / {money(l.unitCostFocus)}</span
        >{/if}
    </td>
    <td class="num">
      {l.unitCost === null ? '—' : int(l.perCraft * l.unitCost * amount)}
      {#if hasFocus && l.unitCostFocus !== null}
        <span class="muted">/ {int(l.perCraftFocus * l.unitCostFocus * amount)}</span>
      {/if}
    </td>
    <td class="num muted">
      {#if !l.crafted}{volume(l.volume?.yesterday ?? null)} · {volume(l.volume?.avg7 ?? null)}{/if}
    </td>
  </tr>
  {#if l.crafted}
    {#each l.crafted.lines as m (m.id)}
      {@render lineRow(m, true)}
    {/each}
    <tr class="nested">
      <td class="name" colspan="5">Usage fee for the crafted {l.name}</td>
      <td class="num">{int(l.crafted.usageFee * amount)}</td>
      <td></td>
    </tr>
  {/if}
{/snippet}

<div class="details">
  <section class="wide">
    <h4>Ingredients for {int(amount)} × {tierLabel(row.recipe.tier, row.recipe.enchant)}</h4>
    <table>
      <thead>
        <tr>
          <th class="left">Ingredient</th>
          <th class="left">Bought via</th>
          <th>Per craft</th>
          <th>After returns{hasFocus ? ' / focus' : ''}</th>
          <th>Unit cost</th>
          <th>Cost{hasFocus ? ' / focus' : ''}</th>
          <th>Traded / day</th>
        </tr>
      </thead>
      <tbody>
        {#each row.lines as l, i (i)}
          {@render lineRow(l, false)}
        {/each}
      </tbody>
    </table>
  </section>

  <section>
    <h4>Costs</h4>
    <dl>
      <dt>Ingredients</dt>
      <dd>
        {row.materialCost === null ? 'a price is missing' : int(row.materialCost * amount)}
        {#if hasFocus && row.materialCostFocus !== null}<span class="muted">
            focus {int(row.materialCostFocus * amount)}</span
          >{/if}
      </dd>
      <dt>Usage fee</dt>
      <dd>
        {int(row.usageFee * amount)}
        <span class="muted">item value {int(row.recipe.itemValue)}</span>
      </dd>
      <dt>Cost per item</dt>
      <dd>
        {money(row.costPerItem)}
        {#if hasFocus && row.costPerItemFocus !== null}<span class="muted">focus {int(row.costPerItemFocus)}</span
          >{/if}
      </dd>
      {#if hasFocus}
        <dt>Focus</dt>
        <dd>
          {int(row.focus * amount)}
          <span class="muted">{focusNote}</span>
        </dd>
        <dt>Silver / focus</dt>
        <dd>{row.silverPerFocus === null ? '—' : row.silverPerFocus.toFixed(2)}</dd>
      {:else}
        <dt>Focus</dt>
        <dd class="muted">none: nothing in this recipe is returned</dd>
      {/if}
    </dl>

    {#if journal}
      <h4>Journal <span class="muted">(not in the profit)</span></h4>
      <p>
        Fills <strong>{(journalFill * amount).toFixed(2)}</strong> × T{row.recipe.tier}
        {journal.name}
        <span class="muted">({int(row.recipe.fame)} fame per craft)</span>.
        {#if journalValue?.perJournal != null}
          Worth <strong>{signed(journalFill * amount * journalValue.perJournal)}</strong>
          <span class="muted">at {signed(journalValue.perJournal)} per journal</span>.
        {:else}
          <span class="muted">No journal prices in the journal panel.</span>
        {/if}
      </p>
    {/if}
  </section>

  <section class="wide">
    <h4>Selling {int(amount)}</h4>
    <table>
      <thead>
        <tr>
          <th class="left">Place</th>
          <th class="left">Via</th>
          <th>Price</th>
          <th>Revenue</th>
          <th>Tax + fee</th>
          <th>Profit</th>
          {#if hasFocus}<th>With focus</th>{/if}
          <th>Traded / day</th>
        </tr>
      </thead>
      <tbody>
        {#each places as place (place)}
          {#each salesOf(place) as [via, sale], i (i)}
            <tr class:first={i === 0}>
              <td>{#if i === 0}<CityBadge city={place} small />{/if}</td>
              <td class="muted">{via}</td>
              {#if sale}
                <td class="num">{int(sale.price.price)}{#if sale.price.manual}<span class="muted"> yours</span>{/if}</td>
                <td class="num">{int(sale.revenue)}</td>
                <td class="num muted">{int(sale.tax + sale.setupFee)}</td>
                <td class="num" class:gain={(sale.profit ?? 0) > 0} class:loss={(sale.profit ?? 0) < 0}>
                  {sale.profit === null ? '—' : `${signed(sale.profit)} (${percent(sale.percent!)})`}
                </td>
                {#if hasFocus}
                  <td class="num" class:gain={(sale.profitFocus ?? 0) > 0} class:loss={(sale.profitFocus ?? 0) < 0}>
                    {sale.profitFocus === null ? '—' : signed(sale.profitFocus)}
                  </td>
                {/if}
              {:else}
                <td class="muted" colspan={hasFocus ? 5 : 4}>no recent price</td>
              {/if}
              <td class="num muted">
                {#if i === 0}{volume(row.places[place].volume?.yesterday ?? null)} · {volume(
                    row.places[place].volume?.avg7 ?? null,
                  )}{/if}
              </td>
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </section>
</div>

<style>
  .details {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 36px;
    align-items: flex-start;
    font-size: 0.92em;
  }

  h4 {
    margin: 8px 0 6px;
    font-size: 0.8em;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 2px 10px 2px 0;
    white-space: nowrap;
    border: 0;
  }

  th {
    font-weight: 600;
    font-size: 0.85em;
    color: var(--text-muted);
    text-align: right;
  }

  th.left {
    text-align: left;
  }

  .num {
    text-align: right;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  tr.nested .name {
    padding-left: 22px;
    color: var(--text-muted);
  }

  tr.first td {
    border-top: 1px solid var(--border);
  }

  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 3px 16px;
    margin: 0;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  p {
    margin: 0;
    max-width: 380px;
    line-height: 1.5;
  }

  .muted {
    color: var(--text-muted);
    font-weight: 400;
  }

  .gain {
    color: var(--good);
  }

  .loss {
    color: var(--bad);
  }
</style>
