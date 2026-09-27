<script lang="ts">
  import { untrack } from 'svelte'
  import { CRAFT_CITIES, PLACES, QUALITIES, type CraftCity, type Place } from '../../config'
  import {
    calcCraftRow,
    craftReturnRate,
    findRecipe,
    GEAR_KINDS,
    INGREDIENT_KINDS,
    journalIds,
    journalValue,
    MATERIAL_KINDS,
    type CraftSettings,
    type JournalValue,
    type Source,
  } from '../../calc/crafting'
  import type { Market } from '../../calc/market'
  import { fetchPrices, fetchVolumes } from '../../data/aodp'
  import { loadCraftingData } from '../../gamedata/crafting'
  import type { CraftItem, CraftingData, IngredientKind } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import { int, tierLabel } from '../../lib/format'
  import CitySelect from '../../ui/CitySelect.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import CraftingLegend from './CraftingLegend.svelte'
  import CraftingTable from './CraftingTable.svelte'
  import IngredientTiles from './IngredientTiles.svelte'
  import ItemTree from './ItemTree.svelte'
  import JournalPanel from './JournalPanel.svelte'
  import { iconOf, mainRecipe, treePath } from './items'

  let { itemKey }: { itemKey: string | undefined } = $props()

  let data = $state.raw<CraftingData | null>(null)
  let dataError = $state<string | null>(null)
  loadCraftingData().then(
    (d) => (data = d),
    (e) => (dataError = `Couldn't load the item data: ${e instanceof Error ? e.message : e}`),
  )

  const item = $derived.by(() => {
    if (!data) return null
    const find = (key: string | undefined) => data!.items.find((i) => i.key === key)
    return find(itemKey) ?? find(settings.crafting.item) ?? data.items[0]
  })

  // Remember the item, so the Crafting tab reopens it.
  $effect(() => {
    if (item) settings.crafting.item = item.key
  })

  let market = $state.raw<Market | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let loadedAt = $state<Date | null>(null)
  let request = 0

  /**
   * Prices to load for an item: its products and gear ingredients at the chosen quality; materials,
   * special ingredients, the materials of craftable gear ingredients, and journals at normal quality.
   */
  function idsFor(d: CraftingData, it: CraftItem) {
    const gear = new Set<string>()
    const other = new Set<string>()
    for (const r of it.recipes) {
      gear.add(r.id)
      for (const slot of r.slots) {
        for (const id of slot.options) {
          ;(slot.preserveQuality ? gear : other).add(id)
          if (!GEAR_KINDS.includes(d.ingredients[id].kind)) continue
          for (const s of findRecipe(d, id)?.recipe.slots ?? []) s.options.forEach((o) => other.add(o))
        }
      }
    }
    const withoutJournals = [...other]
    const journal = d.journals.find((j) => j.kind === it.journal)
    if (journal) {
      for (const tier of new Set(it.recipes.map((r) => r.tier))) {
        const ids = journalIds(journal, tier)
        other.add(ids.empty).add(ids.full)
      }
    }
    return { gear: [...gear], other: [...other], history: withoutJournals }
  }

  async function load(it: CraftItem, quality: number, force: boolean) {
    const id = ++request
    loading = true
    error = null
    try {
      const { gear, other, history } = idsFor(data!, it)
      const [gearPrices, otherPrices, gearVolumes, otherVolumes] = await Promise.all([
        fetchPrices(gear, PLACES, force, quality),
        fetchPrices(other, PLACES, force),
        fetchVolumes(gear, PLACES, force, quality),
        fetchVolumes(history, PLACES, force),
      ])
      if (id !== request) return
      market = {
        prices: new Map([...otherPrices, ...gearPrices]),
        volumes: new Map([...otherVolumes, ...gearVolumes]),
      }
      loadedAt = new Date()
    } catch (e) {
      if (id === request) error = e instanceof Error ? e.message : String(e)
    } finally {
      if (id === request) loading = false
    }
  }

  $effect(() => {
    const it = item
    const quality = settings.crafting.quality
    if (!it) return
    untrack(() => {
      market = null
      load(it, quality, false)
    })
  })

  // The item's bonus city unless the user picked another one for it.
  const craftCity = $derived<CraftCity>(
    (item && settings.crafting.city[item.key]) || ((item?.bonusCity ?? 'Caerleon') as CraftCity),
  )
  function setCraftCity(city: CraftCity) {
    if (!item) return
    if (city === item.bonusCity) delete settings.crafting.city[item.key]
    else settings.crafting.city[item.key] = city
  }

  // Materials default to buy orders, special ingredients to instant buys; both in the cheapest city.
  const sources = $derived(
    Object.fromEntries(
      INGREDIENT_KINDS.map((k) => [
        k,
        settings.crafting.sources[k] ?? { via: MATERIAL_KINDS.includes(k) ? 'order' : 'instant', city: 'cheapest' },
      ]),
    ) as Record<IngredientKind, Source>,
  )
  const options = $derived((item && settings.crafting.options[item.key]) || [])

  const calcSettings: CraftSettings = $derived({
    amount: Math.max(1, Math.round(settings.crafting.amount || 1)),
    premium: settings.premium,
    dailyBonus: settings.crafting.dailyBonus,
    usageFee: Math.max(0, settings.crafting.usageFee || 0),
    craftCity,
    quality: settings.crafting.quality,
    sources,
    options,
    crafted: settings.crafting.crafted,
    focus: settings.crafting.focus,
    manual: settings.manual,
  })

  const returnRate = $derived(item && data ? craftReturnRate(data, item, craftCity, settings.crafting.dailyBonus, false) : 0)
  const returnRateFocus = $derived(
    item && data ? craftReturnRate(data, item, craftCity, settings.crafting.dailyBonus, true) : 0,
  )

  const recipes = $derived(item ? item.recipes.filter((r) => settings.crafting.enchants[r.enchant]) : [])
  const rows = $derived(
    market && item && data ? recipes.map((r) => calcCraftRow(item, r, data!, market!, calcSettings)) : [],
  )

  // Places shown in the profit table. At least one always stays visible.
  const shownPlaces = $derived(PLACES.filter((p) => !settings.crafting.hiddenPlaces.includes(p)))
  function showPlace(place: Place, show: boolean) {
    const hidden = settings.crafting.hiddenPlaces
    settings.crafting.hiddenPlaces = show ? hidden.filter((p) => p !== place) : [...hidden, place]
  }

  const journal = $derived((item?.journal && data?.journals.find((j) => j.kind === item.journal)) || null)
  const journalCity = $derived(settings.crafting.journalCity ?? craftCity)
  const journalValues = $derived.by(() => {
    const values = new Map<number, JournalValue>()
    if (!journal || !market || !item) return values
    for (const tier of new Set(item.recipes.map((r) => r.tier))) {
      values.set(tier, journalValue(journal, tier, market, settings, journalCity))
    }
    return values
  })

  // Focus cost: typed in for one variant, scaled to the others.
  const hasFocus = $derived(!!item?.recipes.some((r) => r.focus > 0))
  const focusEntry = $derived(item ? settings.crafting.focus[item.key] : undefined)
  let focusPick = $state<string | null>(null)
  const focusVariant = $derived(
    (item?.recipes.some((r) => r.id === focusPick) && focusPick) || focusEntry?.id || (item ? mainRecipe(item).id : ''),
  )
  const focusBase = $derived(item?.recipes.find((r) => r.id === focusVariant)?.focus ?? 0)
  function setFocusCost(input: HTMLInputElement) {
    if (!item) return
    const cost = Math.round(Number(input.value))
    if (!input.value || !(cost > 0)) delete settings.crafting.focus[item.key]
    else settings.crafting.focus[item.key] = { id: focusVariant, cost }
  }

  const manualCount = $derived(Object.keys(settings.manual.buy).length + Object.keys(settings.manual.sell).length)
  const path = $derived(item && data ? (treePath(data, item.key) ?? []) : [])
</script>

<div class="crafting">
  <aside class="sidebar">
    {#if data && item}
      <ItemTree {data} selected={item.key} />
    {/if}
  </aside>

  <div class="main">
    {#if dataError}
      <p class="error">{dataError}</p>
    {:else if !data || !item}
      <p class="status">Loading items…</p>
    {:else}
      <div class="item-head">
        <ItemIcon id={iconOf(item)} size={56} />
        <div>
          <h2>{item.name}</h2>
          <div class="muted">
            {path.map((n) => n.name).join(' › ')}
            {#if item.bonusCity}&ensp;·&ensp;crafting bonus in {item.bonusCity}{/if}
            {#if journal}&ensp;·&ensp;fills the {journal.name}{/if}
          </div>
        </div>
      </div>

      <section class="panel">
        <div class="row">
          <label>
            Sell via
            <Segmented
              options={[
                { value: 'order' as const, label: 'Sell order' },
                { value: 'instant' as const, label: 'Instant' },
                { value: 'both' as const, label: 'Both' },
              ]}
              bind:value={settings.crafting.sellVia}
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
              bind:value={settings.crafting.cellValue}
            />
          </label>
          <label><input type="checkbox" bind:checked={settings.crafting.showFocus} /> Focus columns</label>

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
          <button type="button" onclick={() => load(item!, settings.crafting.quality, true)} disabled={loading}>
            Refresh
          </button>
        </div>

        <div class="row">
          <label title="How many items to craft and sell">
            Amount <input type="number" min="1" bind:value={settings.crafting.amount} class="w-num" />
          </label>
          <label><input type="checkbox" bind:checked={settings.premium} /> Premium</label>
          <label title="Quality the items are sold at. Ingredients are always normal quality.">
            Quality
            <select bind:value={settings.crafting.quality}>
              {#each QUALITIES as q (q.value)}
                <option value={q.value}>{q.label}</option>
              {/each}
            </select>
          </label>
          <label title="Where you craft. ⚒ marks the city with the +15% bonus for this item.">
            Crafting city
            <CitySelect
              options={CRAFT_CITIES.map((c) => ({ value: c, label: c === item!.bonusCity ? `${c} ⚒` : c }))}
              bind:value={() => craftCity, setCraftCity}
            />
          </label>
          <label>
            Daily bonus
            <select bind:value={settings.crafting.dailyBonus}>
              <option value={0}>none</option>
              <option value={0.1}>+10%</option>
              <option value={0.2}>+20%</option>
            </select>
          </label>
          <span class="info">
            Return rate {(returnRate * 100).toFixed(1)}% · with focus {(returnRateFocus * 100).toFixed(1)}%
          </span>
          <label title="Station fee in silver per 100 nutrition">
            Usage fee <input type="number" min="0" bind:value={settings.crafting.usageFee} class="w-num" />
          </label>
          <span class="enchants">
            Enchants
            {#each [0, 1, 2, 3, 4] as e (e)}
              <label class="chip"><input type="checkbox" bind:checked={settings.crafting.enchants[e]} />.{e}</label>
            {/each}
          </span>
        </div>

        <div class="row">
          <span class="label" title="Untick places you won't sell in to hide them from the profit table">Sell in</span>
          <span class="sell-places">
            {#each PLACES as place (place)}
              {@const shown = shownPlaces.includes(place)}
              <label class="chip" class:off={!shown}>
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={shown && shownPlaces.length === 1}
                  onchange={(e) => showPlace(place, e.currentTarget.checked)}
                />
                {place}
              </label>
            {/each}
          </span>
        </div>

        {#if settings.crafting.showFocus && hasFocus}
          <div class="row">
            <span class="label">My focus cost</span>
            <label>
              for
              <select value={focusVariant} onchange={(e) => (focusPick = e.currentTarget.value)}>
                {#each item.recipes.filter((r) => r.focus > 0) as r (r.id)}
                  <option value={r.id}>{tierLabel(r.tier, r.enchant)}</option>
                {/each}
              </select>
            </label>
            <input
              type="number"
              min="1"
              class="w-num"
              placeholder={int(focusBase)}
              value={focusEntry?.id === focusVariant ? focusEntry.cost : ''}
              onchange={(e) => setFocusCost(e.currentTarget)}
            />
            <span class="hint">
              {#if focusEntry}
                Scaled to every tier and enchant from your {tierLabel(
                  item.recipes.find((r) => r.id === focusEntry.id)?.tier ?? 0,
                  item.recipes.find((r) => r.id === focusEntry.id)?.enchant ?? 0,
                )} cost of {int(focusEntry.cost)} (base {int(
                  item.recipes.find((r) => r.id === focusEntry.id)?.focus ?? 0,
                )}).
              {:else}
                Type the focus cost the game shows for this variant with your specs. Until then the base cost
                (no specs, {int(focusBase)}) is used.
              {/if}
            </span>
          </div>
        {/if}
      </section>

      <div class="ingredients">
        <IngredientTiles {data} {item} {market} {rows} {sources} {options} {returnRate} {returnRateFocus} />
        {#if journal && market}
          <JournalPanel {journal} {item} values={journalValues} city={journalCity} amount={calcSettings.amount} />
        {/if}
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="table-wrap">
        {#if market}
          <CraftingTable
            {item}
            {rows}
            places={shownPlaces}
            amount={calcSettings.amount}
            quality={settings.crafting.quality}
            sellVia={settings.crafting.sellVia}
            cellValue={settings.crafting.cellValue}
            showFocus={settings.crafting.showFocus}
            {journal}
            {journalValues}
          />
          <CraftingLegend
            amount={calcSettings.amount}
            quality={settings.crafting.quality}
            sellVia={settings.crafting.sellVia}
            premium={settings.premium}
            usageFee={calcSettings.usageFee}
            {craftCity}
            {returnRate}
            {returnRateFocus}
            showFocus={settings.crafting.showFocus}
          />
        {:else if !error}
          <p class="status">Loading prices…</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .crafting {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    align-items: start;
  }

  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    background: var(--surface);
    border-right: 1px solid var(--border);
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
  .status,
  .info,
  .hint {
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

  .label {
    min-width: 110px;
  }

  .enchants {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .chip {
    gap: 2px;
  }

  .sell-places {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .sell-places .chip {
    gap: 5px;
  }

  .chip.off {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .w-num {
    width: 80px;
  }

  .ingredients {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }


  .error {
    margin: 0;
    color: var(--bad);
  }
</style>
