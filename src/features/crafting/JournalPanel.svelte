<script lang="ts">
  import { CRAFT_CITIES, SALES_TAX, SETUP_FEE, type CraftCity } from '../../config'
  import { journalIds, journalSellKey, journalsPerCraft, type JournalValue } from '../../calc/crafting'
  import { buyKey } from '../../calc/market'
  import type { CraftItem, Journal } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import { int, signed } from '../../lib/format'
  import CitySelect from '../../ui/CitySelect.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'

  interface Props {
    journal: Journal
    item: CraftItem
    /** Journal prices per tier, in `city`. */
    values: Map<number, JournalValue>
    city: CraftCity
    amount: number
  }

  let { journal, item, values, city, amount }: Props = $props()

  // One row per tier the item exists in, using the .0 recipe (each enchantment level doubles the fame).
  const tiers = $derived(item.recipes.filter((r) => r.enchant === 0))
  const tax = $derived(settings.premium ? SALES_TAX.premium : SALES_TAX.standard)

  // Typed-in journal prices replace the market price in this city. Clearing the field goes back to it.
  function setPrice(key: Record<string, number>, id: string, market: number | undefined, input: HTMLInputElement) {
    const price = Math.round(Number(input.value))
    if (!input.value || !(price > 0) || price === market) delete key[id]
    else key[id] = price
    input.value = String(key[id] ?? market ?? '')
  }
</script>

<aside class="journal">
  <div class="head">
    <ItemIcon id="T4_JOURNAL_{journal.kind}_FULL" size={36} />
    <div>
      <h3>{journal.name}</h3>
      <div class="muted">Filled by crafting this item. Shown here only, never added to the profit.</div>
    </div>
  </div>

  <label class="city">
    Buy and sell journals in
    <CitySelect
      options={CRAFT_CITIES.map((c) => ({ value: c, label: c }))}
      bind:value={() => city, (c) => (settings.crafting.journalCity = c)}
    />
  </label>

  <table>
    <thead>
      <tr>
        <th class="left">Tier</th>
        <th>Empty</th>
        <th>Full</th>
        <th title="Full journal after {Math.round(tax * 100)}% tax and 2.5% sell-order fee, minus the empty one">
          Net / journal
        </th>
        <th title="Journals filled per craft of the .0 item">Per craft</th>
        <th>For {int(amount)}</th>
      </tr>
    </thead>
    <tbody>
      {#each tiers as recipe (recipe.id)}
        {@const v = values.get(recipe.tier)}
        {@const ids = journalIds(journal, recipe.tier)}
        {@const fill = journalsPerCraft(recipe, journal)}
        <tr>
          <td class="tier">T{recipe.tier}</td>
          <td class="num">
            <input
              type="number"
              min="1"
              class="price-input"
              class:manual={v?.empty.price?.manual}
              class:missing={!v?.empty.price}
              value={v?.empty.price?.price ?? ''}
              placeholder="price?"
              title="Empty journal, bought instantly (lowest sell order). Type a price to override it."
              onchange={(e) =>
                setPrice(settings.manual.buy, buyKey(ids.empty, city, 'instant'), v?.empty.market?.price, e.currentTarget)}
            />
          </td>
          <td class="num">
            <input
              type="number"
              min="1"
              class="price-input"
              class:manual={v?.full?.manual}
              class:missing={!v?.full}
              value={v?.full?.price ?? ''}
              placeholder="price?"
              title="Full journal, sold with a sell order (lowest sell order). Type a price to override it."
              onchange={(e) =>
                setPrice(settings.manual.sell, journalSellKey(ids.full, city), v?.fullMarket?.price, e.currentTarget)}
            />
          </td>
          <td class="num" class:gain={(v?.perJournal ?? 0) > 0} class:loss={(v?.perJournal ?? 0) < 0}>
            {v?.perJournal == null ? '—' : signed(v.perJournal)}
          </td>
          <td class="num">{fill.toFixed(2)}</td>
          <td class="num strong">{v?.perJournal == null ? '—' : signed(fill * amount * v.perJournal)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="muted">
    For .0 items. Each enchantment level doubles the fame: .1 fills 2×, .4 fills 16×; the row breakdown shows each
    variant. Assumes journals fill with the base fame, without Premium's bonus. Full journals pay {Math.round(
      tax * 100,
    )}% tax + {Math.round(SETUP_FEE * 1000) / 10}% sell-order fee.
  </p>
</aside>

<style>
  .journal {
    flex: none;
    width: 470px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.92em;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h3 {
    margin: 0;
    font-size: 1.05em;
  }

  .city {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 2px 6px;
    white-space: nowrap;
  }

  th {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--text-muted);
    text-align: right;
  }

  th.left {
    text-align: left;
  }

  .num {
    text-align: right;
  }

  .tier,
  .strong {
    font-weight: 700;
  }

  .price-input {
    width: 76px;
    padding: 1px 5px;
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

  p {
    margin: 0;
    line-height: 1.45;
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.92em;
  }

  .gain {
    color: var(--good);
  }

  .loss {
    color: var(--bad);
  }
</style>
