<script lang="ts">
  import type { MeldResult } from '../../calc/foundry'
  import type { FoundryData } from '../../gamedata/types'
  import { int, percent } from '../../lib/format'
  import { profitTint } from '../../ui/shading'
  import { fragmentNoun } from './labels'

  // What the selected meld is worth, what it costs, and the profit.
  let { data, meld, amount }: { data: FoundryData; meld: MeldResult; amount: number } = $props()

  const r = $derived(meld.recipe)
  const fragmentName = $derived(data.fragments.find((f) => f.key === r.fragment)?.name ?? 'Fragment')
  const missing = $derived(r.pool.length - meld.priced)

  /** Full silver amounts with a sign: +6,277 · −3,764 */
  const full = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`
</script>

<div class="summary">
  <h3>Per meld</h3>
  <dl>
    <dt>Expected value</dt>
    <dd>
      <strong>{meld.expected === null ? '—' : int(meld.expected)}</strong>
      <span class="note">average of the Net column</span>
      {#if missing}
        <span class="warn" title="The average only covers the priced artifacts. Type a price in the table below.">
          {meld.priced}/{r.pool.length} priced: type the missing price{missing === 1 ? '' : 's'} below
        </span>
      {/if}
    </dd>

    <dt>Fragments</dt>
    <dd>
      <strong>{meld.cost === null ? '—' : full(-meld.cost)}</strong>
      {#if meld.fragment.cost !== null}
        <span class="note">{r.count} × {int(meld.fragment.cost)}</span>
      {/if}
    </dd>

    <dt>Profit</dt>
    <dd>
      <strong class="profit" style={profitTint([meld.margin])}>{meld.profit === null ? '—' : full(meld.profit)}</strong>
      {#if meld.margin !== null}<span class="note">{percent(meld.margin)} of the cost</span>{/if}
    </dd>

    {#if amount > 1}
      <dt>{int(amount)} melds</dt>
      <dd>
        <strong>{meld.profit === null ? '—' : full(meld.profit * amount)}</strong>
        {#if meld.cost !== null}<span class="note">for {int(meld.cost * amount)} in fragments</span>{/if}
      </dd>
    {/if}

    <dt>Break-even</dt>
    <dd>
      <strong>{meld.breakEven === null ? '—' : int(meld.breakEven)}</strong>
      <span class="note">the most one {fragmentNoun(fragmentName)} may cost</span>
    </dd>
  </dl>

  {#if meld.cost !== null && meld.priced}
    <p>
      <strong>{meld.beating} of {meld.priced}</strong>
      {missing ? 'priced ' : ''}artifacts are worth more than the {int(meld.cost)} the {fragmentNoun(fragmentName, true)} cost.
    </p>
  {/if}
</div>

<style>
  .summary {
    padding: 10px 16px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 0.78em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 5px 16px;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin: 0;
  }

  strong {
    min-width: 70px;
    text-align: right;
  }

  .profit {
    padding: 0 6px;
    border-radius: 4px;
  }

  .note {
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .warn {
    font-size: 0.85em;
    color: var(--bad);
  }

  p {
    margin: 10px 0 0;
  }
</style>
