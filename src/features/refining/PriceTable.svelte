<script lang="ts">
  import { CITIES, type City } from '../../config'
  import { fresh, type FreshQuote, type Market } from '../../calc/refining'
  import type { RefiningFamily, RefiningRecipe } from '../../gamedata/types'
  import { age, int, tierLabel, volume } from '../../lib/format'
  import ItemIcon from '../../ui/ItemIcon.svelte'

  interface Props {
    family: RefiningFamily
    recipes: RefiningRecipe[]
    market: Market
    pricesOf: 'refined' | 'raw'
  }

  let { family, recipes, market, pricesOf }: Props = $props()

  function quotes(id: string, city: City): { sell: FreshQuote | null; buy: FreshQuote | null } {
    const p = market.prices.get(id)?.get(city)
    return { sell: fresh(p?.sellMin), buy: fresh(p?.buyMax) }
  }

  /**
   * Refined products: the city with the highest sell order (best place to sell).
   * Raw resources: the city with the lowest buy order (cheapest place to buy with buy orders).
   * Cities with no trades in the last 7 days are skipped.
   */
  function bestCity(id: string): City | null {
    let best: City | null = null
    let bestPrice = pricesOf === 'refined' ? -Infinity : Infinity
    for (const city of CITIES) {
      const { sell, buy } = quotes(id, city)
      const q = pricesOf === 'refined' ? sell : buy
      if (!q || q.stale || !market.volumes.get(id)?.get(city)?.avg7) continue
      if (pricesOf === 'refined' ? q.price > bestPrice : q.price < bestPrice) {
        best = city
        bestPrice = q.price
      }
    }
    return best
  }
</script>

<table>
  <thead>
    <tr>
      <th class="left">Item</th>
      {#each CITIES as city (city)}
        <th class="city">
          {city}
          {#if city === family.bonusCity}<span class="bonus" title="Refining bonus city">⚒</span>{/if}
        </th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each recipes as recipe (recipe.id)}
      {@const id = pricesOf === 'refined' ? recipe.id : recipe.raw.id}
      {@const best = bestCity(id)}
      <tr>
        <td class="item">
          <ItemIcon {id} size={32} />
          <span>{tierLabel(recipe.tier, recipe.enchant)}</span>
        </td>
        {#each CITIES as city (city)}
          {@const q = quotes(id, city)}
          {@const v = market.volumes.get(id)?.get(city)}
          <td class="num">
            <div class="line" class:stale={q.sell?.stale} class:best={best === city && pricesOf === 'refined'}>
              <span class="label">sell</span>
              <span class="price">{q.sell ? int(q.sell.price) : '—'}</span>
              <span class="age">{q.sell ? age(q.sell.ageHours) : ''}</span>
            </div>
            <div class="line" class:stale={q.buy?.stale} class:best={best === city && pricesOf === 'raw'}>
              <span class="label">buy</span>
              <span class="price">{q.buy ? int(q.buy.price) : '—'}</span>
              <span class="age">{q.buy ? age(q.buy.ageHours) : ''}</span>
            </div>
            <div class="vol" title="Traded per day: yesterday · 7-day average">
              {volume(v?.yesterday ?? null)} · {volume(v?.avg7 ?? null)}
            </div>
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<p class="legend">
  sell = lowest sell order · buy = highest buy order · small grey time = how old the price is ·
  <span class="best-chip">best</span>
  {pricesOf === 'refined' ? 'highest sell order (best place to sell)' : 'lowest buy order (cheapest to buy with buy orders)'},
  ignoring prices older than 6h and cities with no trades in 7 days · <span class="stale">italic</span> older than 6h · — no price in the last 24h ·
  bottom line: items traded yesterday · 7-day average
</p>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 4px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
    font-weight: 600;
  }

  th.left {
    text-align: left;
  }

  th.city,
  td.num {
    border-left: 1px solid var(--border);
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

  .line {
    display: grid;
    grid-template-columns: 2.2em 1fr 2.4em;
    align-items: baseline;
    border-radius: 3px;
  }

  .label {
    font-size: 11px;
    color: var(--text-muted);
    text-align: left;
  }

  .price {
    text-align: right;
  }

  .age {
    font-size: 10px;
    color: var(--text-muted);
    text-align: right;
  }

  .vol {
    font-size: 11px;
    color: var(--text-muted);
    text-align: right;
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

  tbody tr:hover td {
    background-color: color-mix(in srgb, var(--surface-2) 70%, transparent);
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
