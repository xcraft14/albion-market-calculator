<script lang="ts">
  import { untrack } from 'svelte'
  import type { CraftCity } from '../../config'
  import { calcMeld, findMeld, FOUNDRY_CITIES, fragmentCosts, type MeldSettings } from '../../calc/foundry'
  import type { Market } from '../../calc/market'
  import { fetchPrices, fetchVolumes, type ByItemCity, type Price, type Volume } from '../../data/aodp'
  import { loadFoundryData } from '../../gamedata/foundry'
  import type { FoundryCategoryKey, FoundryData, FoundryRecipe, FragmentKey } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import ArtifactTable from './ArtifactTable.svelte'
  import FoundryLegend from './FoundryLegend.svelte'
  import FragmentTile from './FragmentTile.svelte'
  import { CATEGORY_COLORS, fragmentLabel, TIERS } from './labels'
  import MeldSummary from './MeldSummary.svelte'
  import Overview from './Overview.svelte'

  /** From the address: tier, fragment, category (#/foundry/6/rune/all). */
  let { path }: { path: string[] } = $props()

  let data = $state.raw<FoundryData | null>(null)
  let dataError = $state<string | null>(null)
  loadFoundryData().then(
    (d) => (data = d),
    (e) => (dataError = `Couldn't load the foundry data: ${e instanceof Error ? e.message : e}`),
  )

  // The meld in the address, or the last one shown.
  const recipe = $derived.by(() => {
    if (!data) return null
    const [tier, fragment, category] = path
    const last = settings.foundry
    return (
      findMeld(data, Number(tier), fragment as FragmentKey, category as FoundryCategoryKey) ??
      findMeld(data, last.tier, last.fragment, last.category) ??
      data.recipes[0]
    )
  })

  // Remember the meld, so the tab reopens it.
  $effect(() => {
    if (!recipe) return
    settings.foundry.tier = recipe.tier
    settings.foundry.fragment = recipe.fragment
    settings.foundry.category = recipe.category
  })

  function select(tier: number, fragment: FragmentKey, category: FoundryCategoryKey) {
    location.hash = `#/foundry/${tier}/${fragment}/${category}`
  }
  const show = (r: FoundryRecipe) => select(r.tier, r.fragment, r.category)

  // Prices of every artifact and fragment, for the overview. Trades only for the meld shown and the fragments.
  let prices = $state.raw<ByItemCity<Price> | null>(null)
  let volumes = $state.raw<ByItemCity<Volume>>(new Map())
  let volumesFor = $state.raw<FoundryRecipe | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let loadedAt = $state<Date | null>(null)
  let priceRequest = 0
  let volumeRequest = 0

  const fragmentIds = (d: FoundryData) => Object.keys(d.conversions)

  async function loadPrices(d: FoundryData, force: boolean) {
    const id = ++priceRequest
    loading = true
    error = null
    try {
      const ids = [...fragmentIds(d), ...new Set(d.recipes.flatMap((r) => r.pool))]
      const table = await fetchPrices(ids, FOUNDRY_CITIES, force)
      if (id !== priceRequest) return
      prices = table
      loadedAt = new Date()
    } catch (e) {
      if (id === priceRequest) error = e instanceof Error ? e.message : String(e)
    } finally {
      if (id === priceRequest) loading = false
    }
  }

  async function loadVolumes(d: FoundryData, r: FoundryRecipe, force: boolean) {
    const id = ++volumeRequest
    try {
      const table = await fetchVolumes([...fragmentIds(d), ...r.pool], FOUNDRY_CITIES, force)
      if (id !== volumeRequest) return
      volumes = table
      volumesFor = r
    } catch (e) {
      if (id === volumeRequest) error = e instanceof Error ? e.message : String(e)
    }
  }

  $effect(() => {
    const d = data
    if (d) untrack(() => loadPrices(d, false))
  })

  $effect(() => {
    const d = data
    const r = recipe
    if (d && r) untrack(() => loadVolumes(d, r, false))
  })

  function refresh() {
    if (!data || !recipe) return
    loadPrices(data, true)
    loadVolumes(data, recipe, true)
  }

  const market = $derived<Market | null>(prices ? { prices, volumes } : null)

  // Cities the artifacts may be sold in. At least one always stays ticked.
  const sellCities = $derived(FOUNDRY_CITIES.filter((c) => !settings.foundry.hiddenCities.includes(c)))
  function showCity(city: CraftCity, show: boolean) {
    const hidden = settings.foundry.hiddenCities
    settings.foundry.hiddenCities = show ? hidden.filter((c) => c !== city) : [...hidden, city]
  }

  const calcSettings: MeldSettings = $derived({
    premium: settings.premium,
    source: settings.foundry.source,
    make: settings.foundry.make,
    sellCities,
    manual: settings.manual,
  })
  const amount = $derived(Math.max(1, Math.round(settings.foundry.amount || 1)))

  const fragments = $derived(market && data ? fragmentCosts(data, market, calcSettings) : new Map())
  const melds = $derived(market && data ? data.recipes.map((r) => calcMeld(r, fragments, market!, calcSettings)) : [])
  const meld = $derived(melds.find((m) => m.recipe === recipe) ?? null)

  const categoryName = $derived(data?.categories.find((c) => c.key === recipe?.category)?.name ?? '')
  const manualCount = $derived(Object.keys(settings.manual.buy).length + Object.keys(settings.manual.sell).length)
</script>

<div class="foundry">
  <aside class="sidebar">
    {#if data && recipe && market}
      <Overview {data} {melds} {fragments} selected={recipe} onselect={show} />
    {:else}
      <p class="status pad">{dataError ? '' : 'Loading prices…'}</p>
    {/if}
  </aside>

  <div class="main">
    {#if dataError}
      <p class="error">{dataError}</p>
    {:else if !data || !recipe}
      <p class="status">Loading the foundry…</p>
    {:else}
      <div class="item-head">
        <ItemIcon id={recipe.fragmentId} size={56} />
        <div>
          <h2>
            {fragmentLabel(data, recipe.fragmentId)} ·
            <span style="color: {CATEGORY_COLORS[recipe.category]}">{categoryName}</span>
          </h2>
          <div class="muted">
            Artifact Foundry&ensp;·&ensp;{recipe.count} fragments → one random artifact out of {recipe.pool.length}, each
            with the same chance
          </div>
        </div>
      </div>

      <section class="panel">
        <div class="row">
          <label>
            Tier
            <Segmented
              options={TIERS.map((t) => ({ value: t, label: `T${t}` }))}
              bind:value={() => recipe!.tier, (t) => select(t, recipe!.fragment, recipe!.category)}
            />
          </label>
          <label>
            Fragment
            <Segmented
              options={data.fragments.map((f) => ({ value: f.key, label: f.name }))}
              bind:value={() => recipe!.fragment, (f) => select(recipe!.tier, f, recipe!.category)}
            />
          </label>
          <label>
            Category
            <Segmented
              options={data.categories.map((c) => ({
                value: c.key,
                label: c.key === 'all' ? 'All (36)' : c.name,
                title: c.key === 'all' ? 'All three pools together, for 36 fragments instead of 50' : undefined,
              }))}
              bind:value={() => recipe!.category, (c) => select(recipe!.tier, recipe!.fragment, c)}
            />
          </label>

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
          <button type="button" onclick={refresh} disabled={loading}>Refresh</button>
        </div>

        <div class="row">
          <label title="How many melds, for the totals">
            Amount <input type="number" min="1" bind:value={settings.foundry.amount} class="w-num" />
          </label>
          <label><input type="checkbox" bind:checked={settings.premium} /> Premium</label>
          <span class="label" title="Untick cities you won't sell artifacts in">Sell in</span>
          <span class="sell-cities">
            {#each FOUNDRY_CITIES as city (city)}
              {@const shown = sellCities.includes(city)}
              <label class="chip" class:off={!shown}>
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={shown && sellCities.length === 1}
                  onchange={(e) => showCity(city, e.currentTarget.checked)}
                />
                {city}
              </label>
            {/each}
          </span>
        </div>
      </section>

      {#if market}
        <div class="cards">
          <FragmentTile {data} {recipe} {fragments} {market} />
          {#if meld}
            <MeldSummary {data} {meld} {amount} />
          {/if}
        </div>
      {/if}

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="table-wrap">
        {#if market && meld}
          <ArtifactTable {data} {meld} cities={sellCities} {market} volumesLoaded={volumesFor === recipe} />
          <FoundryLegend
            premium={settings.premium}
            {amount}
            via={settings.foundry.source.via}
            make={settings.foundry.make}
          />
        {:else if !error}
          <p class="status">Loading prices…</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .foundry {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .sidebar {
    position: sticky;
    top: 0;
    max-height: 100vh;
    min-width: 240px;
    overflow-y: auto;
    background: var(--surface);
    border-right: 1px solid var(--border);
  }

  .pad {
    padding: 0 16px;
  }

  .main {
    padding: 16px 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .item-head {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  h2 {
    margin: 0;
    font-size: 1.5em;
  }

  .muted,
  .status {
    color: var(--text-muted);
  }

  .panel {
    padding: 12px 16px;
    background: var(--surface);
    border-radius: 6px;
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

  .sell-cities {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .chip {
    gap: 5px;
  }

  .chip.off {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .w-num {
    width: 80px;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 12px;
  }

  .error {
    margin: 0;
    color: var(--bad);
  }
</style>
