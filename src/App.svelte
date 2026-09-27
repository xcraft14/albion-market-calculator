<script lang="ts">
  import { ICON_BASE } from './config'
  import { route } from './app/router.svelte'
  import { settings, SETTINGS_KEY } from './app/settings.svelte'
  import { save } from './lib/storage'
  import RefiningPage from './features/refining/RefiningPage.svelte'

  // Remember settings whenever any of them change.
  $effect(() => save(SETTINGS_KEY, $state.snapshot(settings)))

  const section = $derived(route.path[0] === 'crafting' ? 'crafting' : 'refining')
</script>

<header>
  <h1>Albion Market Calculator</h1>
  <nav>
    <a href="#/refining" class="tab" class:active={section === 'refining'}>
      <img src="{ICON_BASE}/T4_METALBAR.png?size=40" alt="" width="20" height="20" />
      Refining
    </a>
    <a href="#/crafting" class="tab" class:active={section === 'crafting'}>
      <img src="{ICON_BASE}/T4_MAIN_SWORD.png?size=40" alt="" width="20" height="20" />
      Crafting <small>soon</small>
    </a>
  </nav>
  <span class="server">EU server · prices from the Albion Online Data Project</span>
</header>

<main>
  {#if section === 'refining'}
    <RefiningPage familyKey={route.path[1]} />
  {:else}
    <p class="soon">Crafting (weapons, armor, food) is coming soon.</p>
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 10px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  h1 {
    margin: 0;
    font-size: 18px;
    color: var(--accent);
  }

  nav {
    display: flex;
    gap: 8px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    color: var(--text-muted);
    text-decoration: none;
  }

  .tab:hover {
    color: var(--text);
  }

  .tab.active {
    background: var(--surface-2);
    color: var(--text);
  }

  small {
    font-size: 11px;
    color: var(--text-muted);
  }

  .server {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
  }

  .soon {
    padding: 24px;
    color: var(--text-muted);
  }
</style>
