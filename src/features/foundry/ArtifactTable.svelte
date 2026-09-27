<script lang="ts">
  import type { CraftCity } from '../../config'
  import { artifactName, type ArtifactSale, type ArtifactValue, type MeldResult } from '../../calc/foundry'
  import type { Market } from '../../calc/market'
  import type { FoundryData } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import { age, int, volume } from '../../lib/format'
  import CityBadge from '../../ui/CityBadge.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import { profitTint } from '../../ui/shading'

  // The selected meld's pool: one row per artifact, one column per ticked city.
  interface Props {
    data: FoundryData
    meld: MeldResult
    /** Ticked sell cities, in column order. */
    cities: CraftCity[]
    market: Market
    /** Whether the pool's trade history has loaded (otherwise "no trades" can't be told). */
    volumesLoaded: boolean
  }

  let { data, meld, cities, market, volumesLoaded }: Props = $props()

  const volumeIn = (id: string, city: CraftCity) => market.volumes.get(id)?.get(city) ?? null
  const noTrades = (id: string, city: CraftCity) => volumesLoaded && !volumeIn(id, city)?.avg7

  /** Net shaded against what the meld costs: green when this artifact alone pays for it. */
  const tint = (sale: ArtifactSale | null) =>
    sale && meld.cost ? profitTint([(sale.net - meld.cost) / meld.cost]) : ''

  function setSell(id: string, input: HTMLInputElement) {
    const price = Math.round(Number(input.value))
    if (!input.value || !(price > 0)) delete settings.manual.sell[id]
    else settings.manual.sell[id] = price
    input.value = String(settings.manual.sell[id] ?? '')
  }

  function saleLine(label: string, sale: ArtifactSale | null): string {
    if (!sale) return `${label}: no recent price`
    const fees = sale.via === 'order' ? 'tax and setup fee' : 'tax'
    return `${label}: ${int(sale.price.price)} (seen ${age(sale.price.ageHours)} ago) → ${int(sale.net)} after ${fees}`
  }

  function cityTitle(a: ArtifactValue, city: CraftCity): string {
    const offer = a.cities[city]
    const lines: string[] = [city]
    if (offer) {
      lines.push(saleLine('Sell order', offer.order), saleLine('Instant sell', offer.instant))
    } else {
      lines.push('No price in the last 24 hours')
    }
    if (volumesLoaded) {
      const v = volumeIn(a.id, city)
      lines.push(
        v?.avg7
          ? `Traded per day: yesterday ${volume(v.yesterday)}, 7-day average ${volume(v.avg7)}`
          : 'No trades recorded in the last 7 days (the price still counts)',
      )
    }
    if (city === a.bestCity) lines.push('Pays the most of the ticked cities, so this is the price used.')
    return lines.join('\n')
  }

  function supplyTitle(a: ArtifactValue): string {
    const lines = ['Traded per day (yesterday · 7-day average):']
    for (const city of cities) {
      const v = volumeIn(a.id, city)
      lines.push(`   ${city}: ${volume(v?.yesterday ?? null)} · ${volume(v?.avg7 ?? null)}`)
    }
    return lines.join('\n')
  }
</script>

<table>
  <thead>
    <tr>
      <th class="left">
        Artifact
        <div class="sub">each 1 in {meld.recipe.pool.length}</div>
      </th>
      {#each cities as city (city)}
        <th class="city"><CityBadge {city} small /></th>
      {/each}
      <th class="left edge">
        Best
        <div class="sub">price · city</div>
      </th>
      <th>
        Net
        <div class="sub">after fees</div>
      </th>
      <th title="Items traded per day in the best city: yesterday · 7-day average">
        Supply
        <div class="sub">yesterday · 7-day</div>
      </th>
      <th class="left">
        Your price
        <div class="sub">where none</div>
      </th>
    </tr>
  </thead>
  <tbody>
    {#each meld.artifacts as a (a.id)}
      {@const manual = settings.manual.sell[a.id]}
      {@const best = a.bestCity ? volumeIn(a.id, a.bestCity) : null}
      <tr>
        <td class="artifact">
          <div>
            <ItemIcon id={a.id} size={32} />
            {artifactName(data, a.id)}
          </div>
        </td>
        {#each cities as city (city)}
          {@const offer = a.cities[city]}
          <td class="num city-start" class:best={city === a.bestCity} title={cityTitle(a, city)}>
            {#if offer}
              <span class:stale={offer.best.price.stale}>{int(offer.best.price.price)}</span>{#if offer.best.via === 'instant'}<span
                  class="flag">⚡</span
                >{/if}
              {#if noTrades(a.id, city)}<div class="small">no trades</div>{/if}
            {:else}
              <span class="none">—</span>
            {/if}
          </td>
        {/each}
        <td class="edge">
          {#if a.sale}
            <span class="best-price">
              <span class:stale={a.sale.price.stale} class:manual-price={a.sale.price.manual}
                >{int(a.sale.price.price)}</span
              >{#if a.sale.via === 'instant'}<span class="flag">⚡</span>{/if}
              {#if a.bestCity}
                <CityBadge city={a.bestCity} small />
              {:else}
                <span class="small">your price</span>
              {/if}
            </span>
          {:else}
            <span class="none">—</span>
          {/if}
        </td>
        <td class="num net" style={tint(a.sale)}>{a.sale ? int(a.sale.net) : '—'}</td>
        <td class="num small" title={supplyTitle(a)}>
          {#if a.bestCity}{volume(best?.yesterday ?? null)} · {volume(best?.avg7 ?? null)}{:else}—{/if}
        </td>
        <td>
          <div class="price-cell">
            <input
              type="number"
              min="1"
              class="price-input"
              class:manual={!!manual}
              class:missing={!a.bestCity && !manual}
              value={manual ?? ''}
              placeholder={a.bestCity ? '—' : 'price?'}
              title="Your sell price, used only when none of the ticked cities has a price. Clear the field to remove it."
              onchange={(e) => setSell(a.id, e.currentTarget)}
            />
            {#if manual}
              <button type="button" class="reset" title="Remove" onclick={() => delete settings.manual.sell[a.id]}
                >×</button
              >
            {/if}
          </div>
        </td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr>
      <td colspan={cities.length + 2} class="total-label">
        Average: what one meld is worth
        {#if meld.priced < meld.recipe.pool.length}
          <span class="warn">({meld.priced}/{meld.recipe.pool.length} priced)</span>
        {/if}
      </td>
      <td class="num net total">{meld.expected === null ? '—' : int(meld.expected)}</td>
      <td colspan="2"></td>
    </tr>
  </tfoot>
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

  .edge {
    border-left: 2px solid var(--border);
  }

  .sub {
    font-size: 0.78em;
    font-weight: 400;
    color: var(--text-muted);
  }

  /* Long names wrap on narrower screens. */
  td.artifact {
    min-width: 170px;
    white-space: normal;
  }

  .artifact div {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }

  .num {
    text-align: right;
  }

  .none {
    color: var(--text-muted);
  }

  .small {
    font-size: 0.78em;
    font-weight: 400;
    color: rgb(230 232 235 / 0.6);
  }

  .best {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .best-price {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }

  .net {
    font-weight: 600;
  }

  .flag {
    margin-left: 2px;
  }

  .stale {
    font-style: italic;
    opacity: 0.75;
  }

  .manual-price {
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }

  .price-cell {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .price-input {
    width: 80px;
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

  tbody tr:hover td {
    background-color: color-mix(in srgb, var(--surface-2) 70%, transparent);
  }

  tfoot td {
    border-bottom: 0;
    font-weight: 600;
  }

  .total-label {
    text-align: right;
    color: var(--text-muted);
  }

  .total {
    color: var(--text);
  }

  .warn {
    color: var(--bad);
  }
</style>
