<script lang="ts" generics="T extends string">
  import { CITY_COLORS, type Place } from '../config'

  // A city dropdown in the user's city colours. Options that aren't cities (e.g. "Cheapest") stay plain.
  interface Option {
    value: T
    label: string
  }

  let { options, value = $bindable(), title }: { options: Option[]; value: T; title?: string } = $props()

  const colors = (v: string) => (v in CITY_COLORS ? CITY_COLORS[v as Place] : null)
  const style = (v: string) => {
    const c = colors(v)
    return c ? `background: ${c.bg}; color: ${c.text}` : ''
  }
</script>

<select bind:value style={style(value)} class:plain={!colors(value)} {title}>
  {#each options as option (option.value)}
    <option value={option.value} style={style(option.value) || 'background: var(--bg); color: var(--text)'}>
      {option.label}
    </option>
  {/each}
</select>

<style>
  select {
    font-weight: 600;
    border-color: transparent;
    cursor: pointer;
  }

  select.plain {
    font-weight: 400;
    border-color: var(--border);
  }
</style>
