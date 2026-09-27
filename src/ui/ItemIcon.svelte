<script lang="ts">
  import { ICON_BASE } from '../config'

  let { id, size = 32, title = '' }: { id: string; size?: number; title?: string } = $props()
</script>

<img
  src="{ICON_BASE}/{id}.png?size={size * 2}"
  width={size}
  height={size}
  alt={title}
  title={title || undefined}
  loading="lazy"
/>

<style>
  img {
    display: inline-block;
    vertical-align: middle;
    flex: none;
  }
</style>
