<script lang="ts">
  import { SALES_TAX, SETUP_FEE } from '../../config'
  import type { BuyVia } from '../../calc/market'
  import { int } from '../../lib/format'
  import Legend from '../../ui/Legend.svelte'

  interface Props {
    premium: boolean
    amount: number
    via: BuyVia
    make: boolean
  }

  let { premium, amount, via, make }: Props = $props()

  const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0$/, '')}%`
  const tax = $derived(premium ? SALES_TAX.premium : SALES_TAX.standard)
</script>

<Legend>
  <section>
    <h3>Colours and markers</h3>
    <ul>
      <li>
        <span class="swatch gain">green</span> profit and <span class="swatch loss">red</span> loss, stronger with the
        margin: full green at +100%, full red at −50%. In the Net column it compares the artifact with what the meld
        costs.
      </li>
      <li>
        <span class="frame">gold frame</span> in the overview, the meld shown; in the table, the city each artifact is
        sold in.
      </li>
      <li>⚡ an instant sale into a buy order pays more than a sell order there.</li>
      <li><span class="stale">italic</span> the price is 6–24 hours old. It still counts.</li>
      <li><strong>no trades</strong>: no trades recorded there in the last 7 days. The price still counts.</li>
      <li><span class="manual">underlined</span> uses a price you typed in.</li>
      <li>
        <strong>27/28</strong> only that many artifacts have a price, so the average is incomplete. Type the missing
        ones in "Your price".
      </li>
      <li><strong>—</strong> no price in the last 24 hours. <span class="made">⚒</span> the fragment is made, not bought.</li>
    </ul>
  </section>

  <section>
    <h3>Reading the numbers</h3>
    <ul>
      <li>
        A meld turns the fragments into <strong>one random artifact</strong> from the pool. Every artifact has the same
        chance, so the average of the Net column is what one meld is worth.
      </li>
      <li>
        <strong>City columns:</strong> the better of a sell order and an instant sale, per ticked city. Hover for both
        and the trades there.
      </li>
      <li>
        <strong>Best:</strong> the ticked city that pays the most. A city without a price is skipped; with none at all,
        your price counts as a sell order.
      </li>
      <li><strong>Supply:</strong> items traded yesterday · 7-day average in the best city.</li>
      <li>
        <strong>Break-even:</strong> the most a fragment may cost. <strong>Beats the cost:</strong> artifacts that alone
        are worth more than the fragments.
      </li>
      <li>
        The overview and the table are per meld{#if amount > 1}; the summary also shows {int(amount)} melds{/if}.
      </li>
    </ul>
  </section>

  <section>
    <h3>How profit is calculated</h3>
    <ul>
      <li>
        <strong>Fragments:</strong>
        {via === 'order'
          ? `a buy order costs the highest buy order + ${pct(SETUP_FEE)} fee`
          : 'an instant buy costs the lowest sell order'}.
        {#if make}
          Made at the foundry when that's cheaper: 5 of the tier below, or the power level below + silver, worked out
          step by step down to T4 runes.
        {/if}
      </li>
      <li>
        <strong>Selling:</strong> a sell order pays {pct(tax, 0)} sales tax ({premium ? 'Premium' : 'no Premium'}) +
        {pct(SETUP_FEE)} setup fee; an instant sale only the tax.
      </li>
      <li>The foundry charges no fee, gives nothing back and uses no focus.</li>
      <li><strong>Profit per meld</strong> = average Net − fragments per meld × fragment cost.</li>
      <li class="note">
        It's an average: one meld can give any artifact in the pool. Assumes you match the best order; outbidding by 1
        silver costs slightly more.
      </li>
    </ul>
  </section>
</Legend>

<style>
  .swatch,
  .frame {
    padding: 1px 7px;
    border-radius: 4px;
    font-weight: 600;
  }

  .swatch.gain {
    background: rgb(34 197 94 / 0.5);
  }

  .swatch.loss {
    background: rgb(239 68 68 / 0.5);
  }

  .frame {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .stale {
    font-style: italic;
    opacity: 0.75;
  }

  .manual {
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }

  .made {
    color: var(--accent);
  }
</style>
