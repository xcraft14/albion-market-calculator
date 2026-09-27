<script lang="ts">
  import type { FragmentCost, MeldResult } from '../../calc/foundry'
  import type { FoundryData, FoundryRecipe } from '../../gamedata/types'
  import { int, percent, signed, silver } from '../../lib/format'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import { profitTint } from '../../ui/shading'
  import { CATEGORY_COLORS, fragmentLabel, TIERS } from './labels'

  // Every meld at once (T4–T8 × fragment × category), so the best combination stands out. Clicking a
  // cell shows that meld.
  interface Props {
    data: FoundryData
    melds: MeldResult[]
    fragments: Map<string, FragmentCost>
    selected: FoundryRecipe
    onselect: (recipe: FoundryRecipe) => void
  }

  let { data, melds, fragments, selected, onselect }: Props = $props()

  const byRecipe = $derived(new Map(melds.map((m) => [m.recipe, m])))
  const meldOf = (tier: number, fragment: string, category: string) =>
    byRecipe.get(
      data.recipes.find((r) => r.tier === tier && r.fragment === fragment && r.category === category)!,
    )!

  function cellTitle(m: MeldResult): string {
    const r = m.recipe
    const name = `${fragmentLabel(data, r.fragmentId)} · ${data.categories.find((c) => c.key === r.category)?.name}`
    const lines = [name]
    lines.push(
      m.expected === null
        ? 'No artifact in the pool has a price'
        : `Worth ${int(m.expected)} per meld on average (${m.priced}/${r.pool.length} artifacts priced)`,
    )
    const fragment = fragments.get(r.fragmentId)
    lines.push(
      m.cost === null
        ? `Fragments: no price for ${fragmentLabel(data, r.fragmentId)}`
        : `Fragments: ${r.count} × ${int(fragment?.cost ?? 0)} = ${int(m.cost)}`,
    )
    if (m.profit !== null) lines.push(`Profit ${signed(m.profit)} per meld (${percent(m.margin ?? 0)})`)
    if (m.cost !== null && m.priced) lines.push(`${m.beating} of ${m.priced} priced artifacts are worth more than that`)
    lines.push('Click to show this meld.')
    return lines.join('\n')
  }

  function fragmentTitle(id: string): string {
    const f = fragments.get(id)
    if (!f || f.cost === null) return `${fragmentLabel(data, id)}: no price`
    const how = f.route ? 'made from cheaper fragments' : `bought in ${f.city}`
    return `${fragmentLabel(data, id)}: ${int(f.cost)} each, ${how}`
  }
</script>

<section class="overview">
  <h3>Profit per meld</h3>
  <table>
    <thead>
      <tr>
        <th colspan="2" class="left">Fragment</th>
        <th title="Cost of one fragment">Cost</th>
        {#each data.categories as c (c.key)}
          <th style="color: {CATEGORY_COLORS[c.key]}">
            {c.name}
            <div class="sub">{c.key === 'all' ? '36 each' : '50 each'}</div>
          </th>
        {/each}
      </tr>
    </thead>
    {#each TIERS as tier (tier)}
      <tbody>
        {#each data.fragments as f, i (f.key)}
          {@const id = `T${tier}_${f.code}`}
          {@const cost = fragments.get(id)}
          <tr>
            {#if i === 0}<th rowspan={data.fragments.length} class="tier">T{tier}</th>{/if}
            <td title={f.name}>
              <div class="fragment">
                <ItemIcon {id} size={22} />
                {f.key === 'shard' ? 'Av. Shard' : f.name}
              </div>
            </td>
            <td class="num cost" title={fragmentTitle(id)}>
              {cost?.cost == null ? '—' : silver(cost.cost)}{#if cost?.route}<span class="made">⚒</span>{/if}
            </td>
            {#each data.categories as c (c.key)}
              {@const m = meldOf(tier, f.key, c.key)}
              {@const partial = m.priced < m.recipe.pool.length}
              <td class="cell" class:selected={m.recipe === selected} style={profitTint([m.margin])}>
                <button type="button" title={cellTitle(m)} onclick={() => onselect(m.recipe)}>
                  {m.profit === null ? '—' : signed(m.profit)}
                  {#if partial && m.priced}<span class="partial">{m.priced}/{m.recipe.pool.length}</span>{/if}
                </button>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    {/each}
  </table>
</section>

<style>
  .overview {
    padding: 14px 12px 16px;
  }

  h3 {
    margin: 0 0 10px 4px;
    font-size: 0.78em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 3px 5px;
    white-space: nowrap;
  }

  thead th {
    text-align: right;
    font-weight: 700;
    vertical-align: bottom;
    border-bottom: 1px solid var(--border);
  }

  thead th.left {
    text-align: left;
    color: var(--text-muted);
    font-weight: 600;
  }

  .sub {
    font-size: 0.75em;
    font-weight: 400;
    color: var(--text-muted);
  }

  tbody {
    border-bottom: 1px solid var(--border);
  }

  tbody tr:first-child td,
  tbody tr:first-child th {
    padding-top: 6px;
  }

  tbody tr:last-child td {
    padding-bottom: 6px;
  }

  .tier {
    width: 1%;
    padding-right: 2px;
    text-align: left;
    vertical-align: top;
    color: var(--accent);
  }

  .fragment {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.9em;
  }

  .num {
    text-align: right;
  }

  .cost {
    font-size: 0.9em;
    color: var(--text-muted);
  }

  .made {
    margin-left: 2px;
    color: var(--accent);
  }

  .cell {
    padding: 1px;
  }

  .cell button {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
    width: 100%;
    padding: 3px 5px;
    border: 0;
    border-radius: 3px;
    background: none;
    font-weight: 600;
    text-align: right;
  }

  .cell button:hover {
    box-shadow: inset 0 0 0 1px var(--text-muted);
  }

  .cell.selected button {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .partial {
    font-size: 0.72em;
    font-weight: 400;
    color: var(--text-muted);
  }
</style>
