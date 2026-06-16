const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, 'data/generated/filtered-items.json');

const RAW_CANDIDATES = [
  'data/raw/arcraiders-data/items',
  'archive/raw-source/arcraiders-data-main/items',
  'archive/raw-source/items-working-copy'
];

const CORE_TYPES = [
  'Augment',
  'Basic Material',
  'Quick Use',
  'Recyclable',
  'Refined Material',
  'Shield',
  'Topside Material'
];

const COMBAT_TYPES = new Set([
  'Ammunition',
  'Assault Rifle',
  'Battle Rifle',
  'Hand Cannon',
  'LMG',
  'Modification',
  'Pistol',
  'Shotgun',
  'SMG',
  'Sniper Rifle',
  'Special'
]);

function findRawItemsDir() {
  for (const relPath of RAW_CANDIDATES) {
    const fullPath = path.join(ROOT, relPath);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  throw new Error(`No raw items directory found. Checked: ${RAW_CANDIDATES.join(', ')}`);
}

function readRawItems(rawDir) {
  const entries = fs.readdirSync(rawDir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  return entries.map(file => {
    const fullPath = path.join(rawDir, file);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  });
}

function normalizeBench(value) {
  if (value === undefined) return null;
  if (Array.isArray(value) && value.length === 1) return value[0];
  return value;
}

function pickItem(raw) {
  return {
    id: raw.id,
    name: {
      en: raw.name && raw.name.en ? raw.name.en : raw.id,
      tr: raw.name && raw.name.tr ? raw.name.tr : raw.id
    },
    type: raw.type,
    rarity: raw.rarity ?? null,
    foundIn: raw.foundIn ?? null,
    value: raw.value ?? null,
    stackSize: raw.stackSize ?? null,
    craftBench: normalizeBench(raw.craftBench),
    recipe: raw.recipe ?? null,
    recyclesInto: raw.recyclesInto ?? null,
    salvagesInto: raw.salvagesInto ?? null,
    upgradeCost: raw.upgradeCost ?? null,
    upgradesFrom: null
  };
}

function tierNumber(id) {
  if (/_iv$/.test(id)) return 4;
  if (/_iii$/.test(id)) return 3;
  if (/_ii$/.test(id)) return 2;
  if (/_i$/.test(id)) return 1;
  return null;
}

function previousTierId(id) {
  const tier = tierNumber(id);
  if (!tier || tier <= 1) return null;
  const base = id.replace(/_(iv|iii|ii|i)$/, '');
  if (tier === 2) return `${base}_i`;
  if (tier === 3) return `${base}_ii`;
  if (tier === 4) return `${base}_iii`;
  return null;
}

function buildDataset(rawItems) {
  const output = [];
  const rawById = new Map(rawItems.map(item => [item.id, item]));
  const added = new Set();

  for (const type of CORE_TYPES) {
    for (const raw of rawItems) {
      if (raw.type !== type || added.has(raw.id)) continue;
      output.push(pickItem(raw));
      added.add(raw.id);
    }
  }

  for (const raw of rawItems) {
    if (!COMBAT_TYPES.has(raw.type) || added.has(raw.id)) continue;
    output.push(pickItem(raw));
    added.add(raw.id);
  }

  const outputIds = new Set(output.map(item => item.id));
  for (const item of output) {
    const prevId = previousTierId(item.id);
    item.upgradesFrom = prevId && outputIds.has(prevId) ? prevId : null;
    const raw = rawById.get(item.id);
    item.upgradeCost = raw && raw.upgradeCost ? raw.upgradeCost : null;
  }

  return output;
}

function main() {
  const rawDir = findRawItemsDir();
  const rawItems = readRawItems(rawDir);
  const dataset = buildDataset(rawItems);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  const withUpgradeCost = dataset.filter(item => item.upgradeCost !== null).length;
  const withUpgradesFrom = dataset.filter(item => item.upgradesFrom !== null).length;
  console.log(`Read raw items from: ${path.relative(ROOT, rawDir)}`);
  console.log(`Wrote items: ${dataset.length}`);
  console.log(`upgradeCost items: ${withUpgradeCost}`);
  console.log(`upgradesFrom items: ${withUpgradesFrom}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDataset,
  findRawItemsDir,
  readRawItems,
  CORE_TYPES,
  COMBAT_TYPES
};
