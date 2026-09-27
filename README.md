# Albion Market Calculator

Refining, crafting and Artifact Foundry profit calculator for Albion Online, Europe server.
Compares market prices and supply across all royal cities (and, for crafting, Brecilien and the Black Market)
at a glance. Crafting covers weapons, armour (royal items included), capes and bags. The Artifact Foundry page
shows what melding runes, souls, relics or Avalonian shards into a random artifact is worth on average.

**Live site:** https://xcraft14.github.io/albion-market-calculator/

Prices come from the [Albion Online Data Project](https://www.albion-online-data.com/).
Game data (recipes, item values, focus costs, foundry melds) comes from [ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps).

## Development

Requires Node.js 24 (LTS).

```sh
npm install
npm run dev      # local dev server with live reload
npm run check    # type-check
npm test         # calculation unit tests
npm run build    # production build into dist/
npm run gamedata # re-download recipes, item values, focus costs, journals and melds after a game patch
```

Every push to `main` is built and published to GitHub Pages by `.github/workflows/deploy.yml`.
