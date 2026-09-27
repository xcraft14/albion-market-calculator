<script lang="ts">
  import { untrack } from 'svelte'
  import { CITIES, type City } from '../../config'
  import { calcRow, fresh, returnRate, type CalcSettings, type Market } from '../../calc/refining'
  import { fetchPrices, fetchVolumes } from '../../data/aodp'
  import refiningJson from '../../gamedata/refining.json'
  import type { RefiningData, RefiningFamily } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import PriceTable from './PriceTable.svelte'
  import ProfitTable from './ProfitTable.svelte'

  const data = refiningJson as RefiningData

  let { familyKey }: { familyKey: string | undefined } = $props()

  const family = $derived(data.families.find((f) => f.key === familyKey) ?? data.families[0])
  const tabIcon = (f: RefiningFamily) => f.recipes.find((r) => r.tier === 4 && r.enchant === 0)!.id

  let market = $state<Market | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let loadedAt = $state<Date | null>(null)

  async function load(f: RefiningFamily, force: boolean) {
    loading = true
    error = null
    try {
      const ids = [...new Set(f.recipes.flatMap((r) => [r.id, r.raw.id]))]
      const [prices, volumes] = await Promise.all([fetchPrices(ids, CITIES, force), fetchVolumes(ids, CITIES, force)])
      if (f !== family) return
      market = { prices, volumes }
      loadedAt = new Date()
    } catch (e) {
      if (f === family) error = e instanceof Error ? e.message : String(e)
    } finally {
      if (f === family) loading = false
    }
  }

  $effect(() => {
    const f = family
    untrack(() => {
      market = null
      load(f, false)
    })
  })

  // Per-family settings, falling back to the family's bonus city and zero specs.
  const resourceCity = {
    get: () => settings.resourceCity[family.key] ?? (family.bonusCity as City),
    set: (city: City) => (settings.resourceCity[family.key] = city),
  }
  const refinedCity = {
    get: () => settings.refinedCity[family.key] ?? (family.bonusCity as City),
    set: (city: City) => (settings.refinedCity[family.key] = city),
  }
  const specs = $derived(settings.specs[family.key] ?? [0, 0, 0, 0, 0])
  function setSpec(i: number, level: number) {
    const next = [...specs]
    next[i] = Math.min(100, Math.max(0, Math.round(level || 0)))
    settings.specs[family.key] = next
  }

  const calcSettings: CalcSettings = $derived({
    stack: Math.max(1, settings.stack || 1),
    premium: settings.premium,
    dailyBonus: settings.dailyBonus,
    usageFee: Math.max(0, settings.usageFee || 0),
    resourceCity: resourceCity.get(),
    refinedCity: refinedCity.get(),
    specs,
    manual: settings.manual,
  })

  // Cities shown in the profit table. At least one always stays visible.
  const sellCities = $derived(CITIES.filter((c) => !settings.hiddenCities.includes(c)))
  function showCity(city: City, show: boolean) {
    settings.hiddenCities = show ? settings.hiddenCities.filter((c) => c !== city) : [...settings.hiddenCities, city]
  }

  const manualCount = $derived(Object.keys(settings.manual.buy).length + Object.keys(settings.manual.sell).length)

  const recipes = $derived(family.recipes.filter((r) => settings.enchants[r.enchant]))
  const rows = $derived(market ? recipes.map((r) => calcRow(r, data, market!, calcSettings)) : [])

  // Buy-order data is patchy, so each city button shows how many tiers have a recent buy-order price there.
  function cityOptions(kind: 'raw' | 'lower') {
    const ingredients = recipes.map((r) => (kind === 'raw' ? r.raw : r.lower)).filter((i) => i !== null)
    return CITIES.map((city) => {
      const priced = market
        ? ingredients.filter((i) => fresh(market!.prices.get(i.id)?.get(city)?.buyMax)).length
        : null
      return {
        value: city as City,
        label: priced === null ? city : `${city} ${priced}/${ingredients.length}`,
        title: priced === null ? undefined : `Recent buy-order prices for ${priced} of ${ingredients.length} tiers`,
      }
    })
  }
  // "Buy lower-tier metal bars in", "… cloth in"
  const lowerName = $derived(
    ['Planks', 'Cloth', 'Leather'].includes(family.name) ? family.name.toLowerCase() : `${family.name.toLowerCase()}s`,
  )
</script>

<nav class="families">
  {#each data.families as f (f.key)}
    <a href="#/refining/{f.key}" class:active={f.key === family.key}>
      <ItemIcon id={tabIcon(f)} size={24} />
      {f.name}
    </a>
  {/each}
</nav>

<section class="panel">
  <div class="row">
    <Segmented
      options={[
        { value: 'profit' as const, label: 'Profit' },
        { value: 'prices' as const, label: 'Prices' },
      ]}
      bind:value={settings.view}
    />

    {#if settings.view === 'profit'}
      <label>
        Sell via
        <Segmented
          options={[
            { value: 'order' as const, label: 'Sell order' },
            { value: 'instant' as const, label: 'Instant' },
            { value: 'both' as const, label: 'Both' },
          ]}
          bind:value={settings.sellVia}
        />
      </label>
      <label>
        Show
        <Segmented
          options={[
            { value: 'profit' as const, label: 'Profit' },
            { value: 'percent' as const, label: 'Profit %' },
            { value: 'price' as const, label: 'Price' },
          ]}
          bind:value={settings.cellValue}
        />
      </label>
      <label><input type="checkbox" bind:checked={settings.showFocus} /> Focus columns</label>
    {:else}
      <label>
        Show
        <Segmented
          options={[
            { value: 'refined' as const, label: family.name },
            { value: 'raw' as const, label: family.rawName },
          ]}
          bind:value={settings.pricesOf}
        />
      </label>
    {/if}

    <span class="spacer"></span>
    {#if manualCount}
      <button
        type="button"
        title="Remove every price you typed in, on all pages"
        onclick={() => (settings.manual = { buy: {}, sell: {} })}
      >
        Clear {manualCount} manual price{manualCount === 1 ? '' : 's'}
      </button>
    {/if}
    <span class="status">
      {#if loading}Loading prices…{:else if loadedAt}Prices loaded {loadedAt.toLocaleTimeString()}{/if}
    </span>
    <button type="button" onclick={() => load(family, true)} disabled={loading}>Refresh</button>
  </div>

  <div class="row">
    <label>Stack <input type="number" min="1" bind:value={settings.stack} class="w-num" /></label>
    <label><input type="checkbox" bind:checked={settings.premium} /> Premium</label>
    <label>
      Daily bonus
      <select bind:value={settings.dailyBonus}>
        <option value={0}>none</option>
        <option value={0.1}>+10%</option>
        <option value={0.2}>+20%</option>
      </select>
    </label>
    <span class="info" title="Refining in {family.bonusCity}, the {family.name.toLowerCase()} bonus city">
      Return rate {(returnRate(data, settings.dailyBonus, false) * 100).toFixed(1)}% · with focus
      {(returnRate(data, settings.dailyBonus, true) * 100).toFixed(1)}%
    </span>
    <label title="Station fee in silver per 100 nutrition">
      Usage fee <input type="number" min="0" bind:value={settings.usageFee} class="w-num" />
    </label>
    <label title="Grey out cities trading fewer items per day (7-day average). 0 = off">
      Min. volume <input type="number" min="0" step="1000" bind:value={settings.minVolume} class="w-num" />
    </label>
    <span class="enchants">
      Enchants
      {#each [0, 1, 2, 3, 4] as e (e)}
        <label class="chip"><input type="checkbox" bind:checked={settings.enchants[e]} />.{e}</label>
      {/each}
    </span>
  </div>

  <div class="row">
    <span class="buy-label">Buy {family.rawName.toLowerCase()} in</span>
    <Segmented options={cityOptions('raw')} bind:value={resourceCity.get, resourceCity.set} />
  </div>
  <div class="row">
    <span class="buy-label">Buy lower-tier {lowerName} in</span>
    <Segmented options={cityOptions('lower')} bind:value={refinedCity.get, refinedCity.set} />
  </div>
  {#if settings.view === 'profit'}
    <div class="row">
      <span class="buy-label" title="Untick cities you won't sell in to hide them from the profit table">Sell in</span>
      <span class="sell-cities">
        {#each CITIES as city (city)}
          {@const shown = sellCities.includes(city)}
          <label class="chip" class:off={!shown}>
            <input
              type="checkbox"
              checked={shown}
              disabled={shown && sellCities.length === 1}
              onchange={(e) => showCity(city, e.currentTarget.checked)}
            />
            {city}{#if city === family.bonusCity}<span class="bonus" title="Refining bonus city">⚒</span>{/if}
          </label>
        {/each}
      </span>
    </div>
  {/if}

  <details bind:open={settings.specsOpen}>
    <summary>
      My {family.name.toLowerCase()} specs:
      {specs.map((level, i) => `T${i + 4} ${level}`).join(' · ')}
    </summary>
    <div class="row specs">
      {#each [0, 1, 2, 3, 4] as i (i)}
        <label>
          T{i + 4}
          <input
            type="number"
            min="0"
            max="100"
            value={specs[i]}
            oninput={(e) => setSpec(i, e.currentTarget.valueAsNumber)}
            class="w-spec"
          />
        </label>
      {/each}
      <span class="hint">Refining spec levels (0–100), saved in this browser. Used for focus per stack and silver per focus.</span>
    </div>
  </details>
</section>

{#if error}
  <p class="error">{error}</p>
{/if}

<div class="table-wrap">
  {#if market}
    {#if settings.view === 'profit'}
      <ProfitTable
        {rows}
        {family}
        cities={sellCities}
        stack={calcSettings.stack}
        sellVia={settings.sellVia}
        cellValue={settings.cellValue}
        showFocus={settings.showFocus}
        minVolume={settings.minVolume || 0}
      />
    {:else}
      <PriceTable {family} {recipes} {market} pricesOf={settings.pricesOf} />
    {/if}
  {:else if !error}
    <p class="status">Loading prices…</p>
  {/if}
</div>

<style>
  .families {
    display: flex;
    gap: 4px;
    padding: 12px 24px 0;
  }

  .families a {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px 6px 0 0;
    color: var(--text-muted);
    text-decoration: none;
  }

  .families a:hover {
    color: var(--text);
  }

  .families a.active {
    background: var(--surface);
    color: var(--accent);
  }

  .panel {
    margin: 0 24px;
    padding: 12px 16px;
    background: var(--surface);
    border-radius: 0 6px 6px 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 18px;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .spacer {
    flex: 1;
  }

  .status,
  .info,
  .hint {
    color: var(--text-muted);
  }

  .buy-label {
    min-width: 200px;
  }

  .enchants {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .chip {
    gap: 2px;
  }

  .sell-cities {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .sell-cities .chip {
    gap: 5px;
  }

  .chip.off {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .bonus {
    margin-left: 3px;
    color: var(--accent);
  }

  .w-num {
    width: 80px;
  }

  .w-spec {
    width: 56px;
  }

  summary {
    cursor: pointer;
    color: var(--text-muted);
  }

  .specs {
    margin-top: 8px;
  }

  .error {
    margin: 12px 24px;
    color: var(--bad);
  }

  .table-wrap {
    padding: 16px 24px 32px;
  }
</style>
