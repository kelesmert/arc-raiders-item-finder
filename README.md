# ARC Item Finder

ARC Item Finder is a static web tool for ARC Raiders item data. It helps players inspect items, follow crafting chains, calculate required materials, compare recycle/salvage sources, and review loot locations on a map.

The project runs entirely in the browser. Runtime data is stored as generated JSON and image assets in the repository.

## Features

- Search and inspect ARC Raiders items.
- View crafting recipes and recursive material trees.
- Calculate total base materials for multiple selected items.
- See recycle and salvage outputs and reverse source chains.
- Display weapon upgrade costs and tier relationships.
- Compare item loot locations and preview map zones.

The map tooling is still in progress. `tools/map-editor.html` is kept as a helper for editing zone coordinates.

## Run Locally

From the project root:

```sh
npm start
```

Open:

```text
http://127.0.0.1:8123/index.html
```

Map editor:

```text
http://127.0.0.1:8123/tools/map-editor.html
```

Stop the local server with `Ctrl+C` in the terminal running `npm start`.

## Useful Commands

```sh
npm run validate
```

Checks that generated data, item images, map data, and important runtime paths are consistent.

```sh
npm run build:data
```

Regenerates `data/generated/filtered-items.json` from an existing raw data copy. The script does not download upstream data.

```sh
npm run check
```

Runs the validation command.

## Project Layout

```text
assets/
  item-photos/      Runtime item images, one image per generated item id
  map-images/       Map images used by the app
data/
  generated/        Runtime generated item dataset
  maps/             Map zone data
scripts/            Dataset build and validation scripts
src/                Browser app JavaScript and CSS
tools/              Development tools such as the map editor
```

`archive/` and `docs/` are local maintenance folders and are ignored by Git.

## Data Pipeline

Runtime item data is generated from raw ARC Raiders item JSON files:

```text
raw item JSON -> scripts/build-dataset.js -> data/generated/filtered-items.json
```

The generated dataset size is determined by the included item type rules. `upgradeCost` is copied from raw item data when present. `upgradesFrom` is derived from tiered item ids such as `_ii`, `_iii`, and `_iv`.

## Data Source

Special thanks to [@RaidTheory](https://github.com/RaidTheory) for maintaining the ARC Raiders community data project.

This app uses data derived from:

- [RaidTheory/arcraiders-data](https://github.com/RaidTheory/arcraiders-data)
- [arctracker.io](https://arctracker.io)

Attribution is required by the upstream project. ARC Raiders game content, names, mechanics, and imagery belong to Embark Studios AB. This project is a community tool and is not affiliated with or endorsed by Embark Studios AB.
