<script lang="ts">
  import { QUALITIES, SALES_TAX, SETUP_FEE, USAGE_FEE_FACTOR, type CraftCity } from '../../config'
  import type { SellVia } from '../../app/settings.svelte'
  import { int } from '../../lib/format'
  import Legend from '../../ui/Legend.svelte'

  interface Props {
    amount: number
    quality: number
    sellVia: SellVia
    premium: boolean
    usageFee: number
    craftCity: CraftCity
    returnRate: number
    returnRateFocus: number
    showFocus: boolean
  }

  let { amount, quality, sellVia, premium, usageFee, craftCity, returnRate, returnRateFocus, showFocus }: Props =
    $props()

  const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0$/, '')}%`
  const tax = $derived(premium ? SALES_TAX.premium : SALES_TAX.standard)
  const qualityName = $derived(QUALITIES.find((q) => q.value === quality)?.label ?? 'Normal')
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
        <span class="frame">gold frame</span> the most profitable of the shown places. It only counts real profits and
        prices seen in the last 6h. A sell order also needs trades there in the last 7 days; an instant sale goes into
        an existing buy order, so it doesn't.
      </li>
      <li>⚡ selling instantly earns at least as much as a sell order.</li>
      <li><span class="stale">italic</span> the price is older than 6 hours.</li>
      <li><span class="manual">underlined</span> uses a price you typed in.</li>
      <li><strong>—</strong> no price in the last 24 hours, or an ingredient price is missing.</li>
      {#if sellVia === 'both'}
        <li>In "Both" mode the top line is a sell order, the bottom line an instant sell.</li>
      {/if}
      <li>The <strong>Black Market</strong> only buys, so its column is always an instant sale into its buy orders.</li>
    </ul>
  </section>

  <section>
    <h3>Reading the numbers</h3>
    <ul>
      <li>
        Profits are for <strong>{int(amount)}</strong> item{amount === 1 ? '' : 's'} sold at
        <strong>{qualityName}</strong> quality. Click a row for the full breakdown; hover a cell for a summary.
      </li>
      <li>
        <strong>Ingredient columns:</strong> price per unit, set on the tiles above (buy order or instant buy, and
        where). The coloured tag is the city; with "Cheapest" it's the cheapest city for that row. Type a price to fill
        in or override one.
      </li>
      <li>Small numbers: the amount needed after returns, then items traded <strong>yesterday · 7-day average</strong>.</li>
      <li><strong>Cost / item:</strong> ingredients after returns plus usage fee.</li>
      {#if showFocus}
        <li>
          <strong>Focus columns:</strong> the same sale crafted with focus. Silver / focus is the extra profit from
          focus divided by the focus it costs (yours if typed in, otherwise the base cost without specs).
        </li>
      {/if}
      <li>Journals are in their own panel and never in the profit.</li>
    </ul>
  </section>

  <section>
    <h3>How profit is calculated</h3>
    <ul>
      <li>
        <strong>Ingredients:</strong> a buy order costs the highest buy order + {pct(SETUP_FEE)} fee; an instant buy
        costs the lowest sell order. They're always normal quality, except a base item the product keeps the quality
        of.
      </li>
      <li>
        <strong>Returns:</strong> crafting in {craftCity} gives back {pct(returnRate)} of the refined materials
        ({pct(returnRateFocus)} with focus). Artifacts, tokens, sigils and other special ingredients are never returned.
      </li>
      <li>
        <strong>Usage fee:</strong>
        {USAGE_FEE_FACTOR} × item value × {int(usageFee)} / 100 per craft (none for T2). The item value is the sum of the
        ingredients' values.
      </li>
      <li>
        <strong>Selling:</strong> {pct(tax, 0)} sales tax ({premium ? 'Premium' : 'no Premium'}) + {pct(SETUP_FEE)}
        sell-order fee. An instant sell pays only the tax.
      </li>
      <li><strong>Profit</strong> = sale revenue − (ingredients + usage fee) × amount.</li>
      <li class="note">
        To check in the game: the item value rule for gear, and that your specs lower every tier's focus by the same
        factor. Assumes you match the best order; outbidding by 1 silver costs slightly more.
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
