// Hash-based page addresses (#/refining/metalbar, #/crafting/2H_CLAYMORE_AVALON, #/foundry/6/rune/all), which
// work on GitHub Pages without a server.

function parse(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}

export const route = $state({ path: parse() })

window.addEventListener('hashchange', () => {
  route.path = parse()
})
