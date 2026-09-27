<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { CraftingData, TreeNode } from '../../gamedata/types'
  import { settings } from '../../app/settings.svelte'
  import ItemIcon from '../../ui/ItemIcon.svelte'
  import { iconOf, treePath } from './items'

  let { data, selected }: { data: CraftingData; selected: string } = $props()

  let query = $state('')
  let list: HTMLElement

  const byKey = $derived(new Map(data.items.map((i) => [i.key, i])))
  const q = $derived(query.trim().toLowerCase())

  const shownItems = (node: TreeNode) => (node.items ?? []).filter((k) => !q || byKey.get(k)!.name.toLowerCase().includes(q))
  const hasMatch = (node: TreeNode): boolean => shownItems(node).length > 0 || (node.children ?? []).some(hasMatch)
  // While searching, every branch with a match is open.
  const isOpen = (node: TreeNode) => !!q || settings.crafting.openNodes.includes(node.key)

  function toggle(node: TreeNode) {
    const open = settings.crafting.openNodes
    settings.crafting.openNodes = open.includes(node.key) ? open.filter((k) => k !== node.key) : [...open, node.key]
  }

  // Open the branches above the selected item and scroll it into view (e.g. after following a link).
  $effect(() => {
    const path = (treePath(data, selected) ?? []).map((n) => n.key)
    untrack(() => {
      const open = settings.crafting.openNodes
      const missing = path.filter((k) => !open.includes(k))
      if (missing.length) settings.crafting.openNodes = [...open, ...missing]
    })
    tick().then(() => {
      // Scroll the list only; scrollIntoView would scroll the whole page too.
      const active = list?.querySelector('.active')
      if (!active) return
      const a = active.getBoundingClientRect()
      const l = list.getBoundingClientRect()
      if (a.top < l.top || a.bottom > l.bottom) list.scrollTop += a.top - l.top - l.height / 2
    })
  })
</script>

<div class="tree">
  <input type="search" placeholder="Search items…" bind:value={query} />
  <div class="list" bind:this={list}>
    {#each data.tree as node (node.key)}
      {@render branch(node, 0)}
    {/each}
    {#if q && !data.tree.some(hasMatch)}
      <p class="none">No item matches "{query}".</p>
    {/if}
  </div>
</div>

{#snippet branch(node: TreeNode, depth: number)}
  {#if !q || hasMatch(node)}
    <button type="button" class="node" class:top={depth === 0} style="--depth: {depth}" onclick={() => toggle(node)}>
      <span class="caret">{isOpen(node) ? '▾' : '▸'}</span>
      {node.name}
    </button>
    {#if isOpen(node)}
      {#each node.children ?? [] as child (child.key)}
        {@render branch(child, depth + 1)}
      {/each}
      {#each shownItems(node) as key (key)}
        {@const item = byKey.get(key)!}
        <a href="#/crafting/{key}" class="leaf" class:active={key === selected} style="--depth: {depth + 1}">
          <ItemIcon id={iconOf(item)} size={26} />
          <span>{item.name}</span>
        </a>
      {/each}
    {/if}
  {/if}
{/snippet}

<style>
  .tree {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  input {
    margin: 12px 12px 8px;
    padding: 6px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 0 6px 16px;
  }

  .node,
  .leaf {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 8px 3px calc(8px + var(--depth) * 14px);
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text-muted);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .node.top {
    margin-top: 6px;
    color: var(--text);
    font-weight: 700;
  }

  .node:hover,
  .leaf:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .caret {
    width: 0.8em;
    color: var(--text-muted);
  }

  .leaf {
    padding-left: calc(10px + var(--depth) * 14px);
  }

  .leaf.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    font-weight: 600;
  }

  .none {
    padding: 0 12px;
    color: var(--text-muted);
  }
</style>
