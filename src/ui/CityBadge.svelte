<script lang="ts">
  import { CITY_COLORS, type Place } from '../config'

  // A city name on its colour, as chosen by the user (see CITY_COLORS).
  let { city, title, small = false }: { city: Place; title?: string; small?: boolean } = $props()
</script>

<span class="badge" class:small style="background: {CITY_COLORS[city].bg}; color: {CITY_COLORS[city].text}" {title}
  >{city}</span
>

<style>
  .badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 4px;
    font-weight: 600;
    white-space: nowrap;
  }

  .badge.small {
    padding: 0 6px;
    border-radius: 3px;
    font-size: 0.78em;
    font-style: normal;
  }
</style>
