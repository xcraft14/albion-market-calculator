<script lang="ts" generics="T">
  interface Option {
    value: T
    label: string
    title?: string
  }

  let { options, value = $bindable() }: { options: Option[]; value: T } = $props()
</script>

<div class="segmented">
  {#each options as option, i (i)}
    <button
      type="button"
      class:active={option.value === value}
      title={option.title}
      onclick={() => (value = option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  button {
    padding: 4px 10px;
    border: 0;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
  }

  button:last-child {
    border-right: 0;
  }

  button:hover {
    color: var(--text);
    border-color: var(--border);
  }

  button.active {
    background: var(--surface-2);
    color: var(--accent);
  }
</style>
