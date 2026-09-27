<script lang="ts">
  import type { Snippet } from 'svelte'

  // A card of legend sections. Each child is a <section> with an <h3> and a <ul>.
  let { children }: { children: Snippet } = $props()
</script>

<aside class="legend">
  {@render children()}
</aside>

<style>
  .legend {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px 40px;
    margin-top: 20px;
    padding: 16px 22px 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.9em;
  }

  .legend :global(h3) {
    margin: 0 0 10px;
    font-size: 0.78em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .legend :global(ul) {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin: 0;
    padding-left: 18px;
  }

  .legend :global(li) {
    line-height: 1.45;
  }

  .legend :global(li::marker) {
    color: var(--accent);
  }

  .legend :global(.note) {
    color: var(--text-muted);
  }
</style>
