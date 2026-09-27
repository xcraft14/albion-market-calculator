<script lang="ts">
  import { buyCities, findRecipe, GEAR_KINDS, type CraftRow, type Source } from '../../calc/crafting'
  import { fresh, type Market } from '../../calc/market'
  import type { CraftItem, CraftSlot, CraftingData, IngredientKind } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import { percent } from '../../lib/format'
  import CitySelect from '../../ui/CitySelect.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import { mainRecipe } from './items'

  interface Props {
    data: CraftingData
    item: CraftItem
    market: Market | null
    /** Rows in the table, for the price coverage per city. */
    rows: CraftRow[]
    sources: Record<IngredientKind, Source>
    options: number[]
    returnRate: number
    returnRateFocus: number
  }

  let { data, item, market, rows, sources, options, returnRate, returnRateFocus }: Props = $props()

  const recipe = $derived(mainRecipe(item))
  const optionOf = (i: number) => Math.min(options[i] ?? 0, recipe.slots[i].options.length - 1)

  function setOption(i: number, value: number) {
    const next = [...(settings.crafting.options[item.key] ?? [])]
    next[i] = value
    settings.crafting.options[item.key] = next
  }

  const isCrafted = (kind: IngredientKind) => GEAR_KINDS.includes(kind) && !!settings.crafting.crafted[kind]

  // Crafted gear ingredients (basic Cape, royal base item) need their own materials: extra tiles.
  const extraSlots = $derived.by(() => {
    const kinds = new Set(recipe.slots.map((s, i) => data.ingredients[s.options[optionOf(i)]].kind))
    const extra: { slot: CraftSlot; forName: string }[] = []
    recipe.slots.forEach((s, i) => {
      const id = s.options[optionOf(i)]
      if (!isCrafted(data.ingredients[id].kind)) return
      const base = findRecipe(data, id)
      for (const bs of base?.recipe.slots ?? []) {
        const kind = data.ingredients[bs.options[0]].kind
        if (kinds.has(kind)) continue
        kinds.add(kind)
        extra.push({ slot: bs, forName: data.ingredients[id].name })
      }
    })
    return extra
  })

  /** Counts can change with the tier (e.g. royal sigils): "2–16". */
  function countLabel(i: number): string {
    const counts = item.recipes.map((r) => r.slots[i]?.count).filter((c) => c !== undefined)
    const min = Math.min(...counts)
    const max = Math.max(...counts)
    return min === max ? `${min}` : `${min}–${max}`
  }

  const setSource = (kind: IngredientKind, change: Partial<Source>) =>
    (settings.crafting.sources[kind] = { ...sources[kind], ...change })

  /** Items of this kind used by the table's rows, for "Thetford 17/25" coverage counts. */
  function idsOf(kind: IngredientKind): string[] {
    const ids = rows.flatMap((r) => [...r.lines, ...r.lines.flatMap((l) => l.crafted?.lines ?? [])])
    return [...new Set(ids.filter((l) => l.kind === kind && !l.crafted).map((l) => l.id))]
  }

  // Each city shows how many of the rows' ingredients have a recent price there, since data is patchy.
  function cityOptions(kind: IngredientKind) {
    const ids = idsOf(kind)
    const via = sources[kind].via
    const cities = buyCities(kind)
    const pricedIn = (id: string, city: string) => {
      const p = market?.prices.get(id)?.get(city)
      return !!fresh(via === 'order' ? p?.buyMax : p?.sellMin)
    }
    const label = (name: string, priced: number) => (market && ids.length ? `${name} ${priced}/${ids.length}` : name)
    return [
      ...cities.map((city) => ({
        value: city as Source['city'],
        label: label(city, ids.filter((id) => pricedIn(id, city)).length),
      })),
      {
        value: 'cheapest' as const,
        label: label('Cheapest', ids.filter((id) => cities.some((c) => pricedIn(id, c))).length),
      },
    ]
  }
</script>

{#snippet source(kind: IngredientKind)}
  <div class="source">
    <Segmented
      options={[
        { value: 'order' as const, label: 'Buy order', title: 'Place a buy order: highest buy order + 2.5% setup fee' },
        { value: 'instant' as const, label: 'Instant buy', title: 'Buy from the lowest sell order, no fee' },
      ]}
      bind:value={() => sources[kind].via, (via) => setSource(kind, { via })}
    />
    <CitySelect
      options={cityOptions(kind)}
      bind:value={() => sources[kind].city, (city) => setSource(kind, { city })}
      title="Where to buy. The numbers count the rows with a recent price there. Saved for every item that uses this kind of ingredient."
    />
  </div>
{/snippet}

<div class="tiles">
  {#each recipe.slots as slot, i (i)}
    {@const id = slot.options[optionOf(i)]}
    {@const info = data.ingredients[id]}
    <div class="tile">
      <div class="head">
        <ItemIcon {id} size={40} />
        <div>
          <div class="name">{info.name} <span class="count">×{countLabel(i)}</span></div>
          <div class="note">
            {#if slot.returned}
              returned: {percent(returnRate)} back, {percent(returnRateFocus)} with focus
            {:else}
              never returned{#if slot.preserveQuality}&ensp;·&ensp;the product keeps its quality{/if}
            {/if}
          </div>
        </div>
      </div>
      {#if slot.options.length > 1}
        <Segmented
          options={slot.options.map((o, value) => ({ value, label: data.ingredients[o].name }))}
          bind:value={() => optionOf(i), (v) => setOption(i, v)}
        />
      {/if}
      {#if GEAR_KINDS.includes(info.kind)}
        <Segmented
          options={[
            { value: false, label: 'Market price', title: `Buy the ${info.name}` },
            { value: true, label: 'Crafted cost', title: `Craft the ${info.name} yourself: its materials after returns plus usage fee` },
          ]}
          bind:value={() => isCrafted(info.kind), (v) => (settings.crafting.crafted[info.kind] = v)}
        />
      {/if}
      {#if isCrafted(info.kind)}
        <div class="note">Crafted here too; its materials are bought as set in their tiles.</div>
      {:else}
        {@render source(info.kind)}
      {/if}
    </div>
  {/each}

  {#each extraSlots as { slot, forName } (slot.options[0])}
    {@const info = data.ingredients[slot.options[0]]}
    <div class="tile extra">
      <div class="head">
        <ItemIcon id={slot.options[0]} size={40} />
        <div>
          <div class="name">{info.name} <span class="count">×{slot.count}</span></div>
          <div class="note">for the crafted {forName} · returned: {percent(returnRate)} back</div>
        </div>
      </div>
      {@render source(info.kind)}
    </div>
  {/each}
</div>

<style>
  .tiles {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 12px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .tile.extra {
    border-style: dashed;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .name {
    font-weight: 700;
  }

  .count {
    color: var(--accent);
  }

  .note {
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .source {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
</style>
