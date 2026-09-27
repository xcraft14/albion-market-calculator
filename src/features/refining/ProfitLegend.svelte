<script lang="ts">
  import { SALES_TAX, SETUP_FEE, USAGE_FEE_FACTOR } from '../../config'
  import type { SellVia } from '../../app/settings.svelte'
  import { int } from '../../lib/format'
  import Legend from '../../ui/Legend.svelte'

  interface Props {
    stack: number
    sellVia: SellVia
    minVolume: number
    premium: boolean
    usageFee: number
    returnRate: number
    returnRateFocus: number
    showFocus: boolean
  }

  let { stack, sellVia, minVolume, premium, usageFee, returnRate, returnRateFocus, showFocus }: Props = $props()

  const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0$/, '')}%`
  const tax = $derived(premium ? SALES_TAX.premium : SALES_TAX.standard)
</script>

<Legend>
  <section>
    <h3>Colours and markers</h3>
    <ul>
      <li>
        <span class="swatch gain">green</span> profit and <span class="swatch loss">red</span> loss. The colour gets
        stronger with the margin: full green at +100%, full red at −50%.
      </li>
      <li>
        <span class="frame">gold frame</span> the most profitable of the shown cities. It only counts real profits,
        prices seen in the last 6h, and cities with trades in the last 7 days{minVolume > 0
          ? `, above your minimum volume of ${int(minVolume)}/day`
          : ''}.
      </li>
      <li>⚡ selling instantly earns at least as much as a sell order.</li>
      <li><span class="stale">italic</span> the price is older than 6 hours.</li>
      <li><span class="manual">underlined</span> uses a price you typed in.</li>
      <li><strong>—</strong> no price in the last 24 hours, or a material price is missing.</li>
      {#if sellVia === 'both'}
        <li>In "Both" mode the top line is a sell order, the bottom line an instant sell.</li>
      {/if}
    </ul>
  </section>

  <section>
    <h3>Reading the numbers</h3>
    <ul>
      <li>Profits are per stack of <strong>{int(stack)}</strong> refined items. Hover a cell for the full breakdown.</li>
      <li>
        <strong>Buy columns:</strong> buy-order price per unit including the {pct(SETUP_FEE)} fee. The coloured tag
        is the city to place the buy order in (set in the "Buy … in" rows).
      </li>
      <li><strong>Cost / item:</strong> materials after returns plus usage fee, per refined item.</li>
      <li>Small numbers under a price: items traded <strong>yesterday · 7-day average</strong> per day.</li>
      {#if showFocus}
        <li>
          <strong>Focus columns:</strong> the same sale refined with focus. Silver / focus is the extra profit from
          focus divided by the focus it costs with your specs.
        </li>
      {/if}
    </ul>
  </section>

  <section>
    <h3>How profit is calculated</h3>
    <ul>
      <li>
        <strong>Materials:</strong> highest current buy order in the chosen city (or your price) + {pct(SETUP_FEE)}
        buy-order fee.
      </li>
      <li>
        <strong>Amount bought:</strong> only what a stack needs after the {pct(returnRate)} return rate ({pct(
          returnRateFocus,
        )} with focus).
      </li>
      <li>
        <strong>Usage fee:</strong>
        {USAGE_FEE_FACTOR} × item value × {int(usageFee)} / 100 per craft (none for T2).
      </li>
      <li>
        <strong>Selling:</strong> {pct(tax, 0)} sales tax ({premium ? 'Premium' : 'no Premium'}) + {pct(SETUP_FEE)}
        sell-order fee. An instant sell pays only the tax.
      </li>
      <li><strong>Profit</strong> = sale revenue − materials − usage fee.</li>
      <li class="note">
        Assumes you match the highest buy order; going 1 silver above costs slightly more. The {pct(SETUP_FEE)} order
        fee is assumed to be the same without Premium.
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
</style>
