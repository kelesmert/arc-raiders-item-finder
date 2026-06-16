# ARC Item Finder

Static web tool for exploring ARC Raiders items, crafting chains, recycle/salvage sources, upgrade costs, and loot locations.

## Run Locally

```sh
npm start
```

Then open:

```text
http://127.0.0.1:8123/index.html
```

The app is a static site. It reads JSON and image assets directly in the browser, so it can be published with GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

## Project Shape

- `index.html` and `src/` contain the web app.
- `data/generated/filtered-items.json` is the runtime item dataset.
- `assets/item-photos/` contains one image for each runtime item id.
- `data/maps/map-zones.json` and `assets/map-images/` power the Where to Loot map.
- `tools/map-editor.html` is a development tool for placing map zones. The map feature is still in progress.
- `archive/` keeps old notes, raw copies, unused images, and legacy helper scripts so nothing is lost during cleanup.

## Data Source And Attribution

Raw ARC Raiders data came from:

```text
https://github.com/RaidTheory/arcraiders-data
https://arctracker.io
```

The upstream data repository is MIT licensed. Game content, names, mechanics, and imagery belong to Embark Studios AB. This project is a community tool and is not affiliated with or endorsed by Embark Studios AB.

## Data Workflow

Current runtime flow:

```text
raw RaidTheory data -> extraction/normalization -> data/generated/filtered-items.json -> browser app
```

The generated dataset size is determined by the included item type rules, not by a hardcoded item count. `upgradeCost` comes from the raw item JSON files. `upgradesFrom` is derived from item ids that follow `_i`, `_ii`, `_iii`, `_iv` tier naming.

Useful commands:

```sh
npm start
npm run validate
npm run build:data
```

`build:data` does not download upstream data. It reads an existing raw copy from `data/raw/arcraiders-data/items`, `archive/raw-source/arcraiders-data-main/items`, or `archive/raw-source/items-working-copy`.
