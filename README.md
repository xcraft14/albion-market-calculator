# Albion Market Calculator

Refining (and later crafting) profit calculator for Albion Online, Europe server.
Compares market prices and supply across all royal cities at a glance.

**Live site:** https://xcraft14.github.io/albion-market-calculator/

Prices come from the [Albion Online Data Project](https://www.albion-online-data.com/).
Game data (recipes, item values, focus costs) comes from [ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps).

## Development

Requires Node.js 24 (LTS).

```sh
npm install
npm run dev      # local dev server with live reload
npm run check    # type-check
npm run build    # production build into dist/
```

Every push to `main` is built and published to GitHub Pages by `.github/workflows/deploy.yml`.
