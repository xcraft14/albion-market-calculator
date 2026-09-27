<script lang="ts">
  const ICON = 'https://render.albiononline.com/v1/item'
</script>

<header>
  <h1>Albion Market Calculator</h1>
  <nav>
    <span class="tab active">
      <img src="{ICON}/T4_METALBAR.png?size=40" alt="" width="20" height="20" />
      Refining
    </span>
    <span class="tab disabled" title="Coming soon">
      <img src="{ICON}/T4_MAIN_SWORD.png?size=40" alt="" width="20" height="20" />
      Crafting <small>soon</small>
    </span>
  </nav>
</header>

<main>
  <p>Under construction. The refining calculator is being built.</p>
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 12px 24px;
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
  }

  .tab.active {
    background: var(--surface-2);
  }

  .tab.disabled {
    color: var(--text-muted);
    opacity: 0.6;
  }

  main {
    padding: 24px;
    color: var(--text-muted);
  }
</style>
