<script lang="ts">
  import { FOUNDRY_CITIES, type FragmentCost, type FragmentSource } from '../../calc/foundry'
  import { buyKey, fresh, type Market } from '../../calc/market'
  import type { FoundryData, FoundryRecipe } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import { age, int, volume } from '../../lib/format'
  import CityBadge from '../../ui/CityBadge.svelte'
  import CitySelect from '../../ui/CitySelect.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import { fragmentLabel } from './labels'

  // The fragments for the selected meld: where they're bought, and whether making them is cheaper.
  interface Props {
    data: FoundryData
    recipe: FoundryRecipe
    fragments: Map<string, FragmentCost>
    market: Market | null
  }

  let { data, recipe, fragments, market }: Props = $props()

  const source = $derived(settings.foundry.source)
  const fragment = $derived(fragments.get(recipe.fragmentId) ?? null)
  const setSource = (change: Partial<FragmentSource>) => (settings.foundry.source = { ...source, ...change })

  // Each city shows how many of the 20 fragments have a recent price there.
  const cityOptions = $derived.by(() => {
    const ids = Object.keys(data.conversions)
    const pricedIn = (id: string, city: string) => {
      const p = market?.prices.get(id)?.get(city)
      return !!fresh(source.via === 'order' ? p?.buyMax : p?.sellMin)
    }
    const label = (name: string, priced: number) => (market ? `${name} ${priced}/${ids.length}` : name)
    return [
      ...FOUNDRY_CITIES.map((city) => ({
        value: city as FragmentSource['city'],
        label: label(city, ids.filter((id) => pricedIn(id, city)).length),
      })),
      {
        value: 'cheapest' as const,
        label: label('Cheapest', ids.filter((id) => FOUNDRY_CITIES.some((c) => pricedIn(id, c))).length),
      },
    ]
  })

  // Typed-in prices are committed on change (Enter or leaving the field). Clearing the field, or typing
  // the market price, goes back to the market price.
  function setBuy(input: HTMLInputElement) {
    if (!fragment) return
    const key = buyKey(fragment.id, fragment.city, source.via)
    const price = Math.round(Number(input.value))
    if (!input.value || !(price > 0) || price === fragment.market?.price) delete settings.manual.buy[key]
    else settings.manual.buy[key] = price
    input.value = String(settings.manual.buy[key] ?? fragment.market?.price ?? '')
  }

  /** "5 × T5 Rune", "T6 Rune + 2,500 silver" */
  function wayLabel(id: string, count: number, silver: number): string {
    return `${count > 1 ? `${count} × ` : ''}${fragmentLabel(data, id)}${silver ? ` + ${int(silver)} silver` : ''}`
  }

  /** Buying it, and each way to make it, with what one costs that way. */
  const ways = $derived(
    fragment
      ? [
          { label: 'buy', cost: fragment.buyCost, used: !fragment.route },
          ...fragment.made.map((m) => ({
            label: wayLabel(m.conversion.from, m.conversion.count, m.conversion.silver),
            cost: m.cost,
            used: m === fragment!.route,
          })),
        ]
      : [],
  )

  /** How the fragment is made, step by step, down to the ones that are bought. */
  function chain(id: string): string[] {
    const f = fragments.get(id)
    if (!f || f.cost === null) return [`${fragmentLabel(data, id)}: no price`]
    if (!f.route) return [`${fragmentLabel(data, id)}: bought in ${f.city} for ${int(f.cost)}`]
    const c = f.route.conversion
    return [`${fragmentLabel(data, id)} = ${wayLabel(c.from, c.count, c.silver)} = ${int(f.cost)}`, ...chain(c.from)]
  }

  const priceTitle = $derived.by(() => {
    if (!fragment) return ''
    const how = source.via === 'order' ? 'Highest buy order' : 'Lowest sell order'
    const lines = [
      fragment.market
        ? `${how} in ${fragment.city}: ${int(fragment.market.price)} (seen ${age(fragment.market.ageHours)} ago)`
        : `No recent ${source.via === 'order' ? 'buy order' : 'sell order'} in ${fragment.city}`,
    ]
    if (fragment.price?.manual) lines.push(`Using your price ${int(fragment.price.price)}`)
    lines.push('Type a price to override it; clear the field to go back to the market price.')
    return lines.join('\n')
  })
</script>

{#if fragment}
  <div class="tile">
    <div class="head">
      <ItemIcon id={fragment.id} size={40} />
      <div>
        <div class="name">{fragmentLabel(data, fragment.id)} <span class="count">×{recipe.count} per meld</span></div>
        <div class="note">
          {#if fragment.cost === null}
            no price: type one in, or pick another city
          {:else}
            {int(fragment.cost)} each{#if fragment.route}, made from cheaper fragments{/if} · {int(
              recipe.count * fragment.cost,
            )} per meld
          {/if}
        </div>
      </div>
    </div>

    <div class="row">
      <Segmented
        options={[
          {
            value: 'order' as const,
            label: 'Buy order',
            title: 'Place a buy order: highest buy order + 2.5% setup fee',
          },
          { value: 'instant' as const, label: 'Instant buy', title: 'Buy from the lowest sell order, no fee' },
        ]}
        bind:value={() => source.via, (via) => setSource({ via })}
      />
      <CitySelect
        options={cityOptions}
        bind:value={() => source.city, (city) => setSource({ city })}
        title="Where to buy fragments. The numbers count the fragments (of 20) with a recent price there."
      />
      <Segmented
        options={[
          { value: false, label: 'Buy', title: 'Always buy the fragments' },
          {
            value: true,
            label: 'Make if cheaper',
            title: 'Make fragments at the foundry when that costs less: 5 of the tier below, or the power level below + silver',
          },
        ]}
        bind:value={settings.foundry.make}
      />
    </div>

    <div class="row">
      <input
        type="number"
        min="1"
        class="price-input"
        class:manual={fragment.price?.manual}
        class:missing={!fragment.price}
        value={fragment.price?.price ?? ''}
        placeholder="price?"
        title={priceTitle}
        onchange={(e) => setBuy(e.currentTarget)}
      />
      {#if fragment.price?.manual}
        <button
          type="button"
          class="reset"
          title="Use the market price"
          onclick={() => delete settings.manual.buy[buyKey(fragment.id, fragment.city, source.via)]}>×</button
        >
      {/if}
      <span class="unit" class:stale={fragment.price?.stale}>
        {fragment.buyCost === null ? '—' : int(fragment.buyCost)}
        <span class="small">{source.via === 'order' ? 'incl. fee' : 'instant'}</span>
      </span>
      <CityBadge city={fragment.city} small />
      <span class="small" title="Fragments traded per day in {fragment.city}">
        traded {volume(fragment.volume?.yesterday ?? null)} · {volume(fragment.volume?.avg7 ?? null)}/day
      </span>
    </div>

    {#if settings.foundry.make}
      <div class="ways">
        {#if fragment.made.length}
          <div>
            Ways to get one:
            {#each ways as way, i (i)}
              {#if i > 0}<span class="sep">·</span>{/if}
              <span class:used={way.used}>{way.label} {way.cost === null ? '—' : int(way.cost)}</span>
            {/each}
          </div>
          {#if fragment.route}
            <ul>
              {#each chain(fragment.id) as step, i (i)}
                <li>{step}</li>
              {/each}
            </ul>
          {/if}
        {:else}
          <div>T4 runes can only be bought.</div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 10px 14px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
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

  .note,
  .small {
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .price-input {
    width: 90px;
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
  }

  .stale {
    font-style: italic;
    opacity: 0.75;
  }

  .ways {
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .ways .used {
    color: var(--text);
    font-weight: 600;
  }

  .sep {
    margin: 0 4px;
  }

  ul {
    margin: 4px 0 0;
    padding-left: 18px;
  }
</style>
