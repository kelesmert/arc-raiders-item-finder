const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, 'data/generated/filtered-items.json');
const PHOTOS_DIR = path.join(ROOT, 'assets/item-photos');
const MAP_PATH = path.join(ROOT, 'data/maps/map-zones.json');

const errors = [];
let expectedItems = null;

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${label} is not readable JSON: ${error.message}`);
    return null;
  }
}

try {
  const { buildDataset, findRawItemsDir, readRawItems } = require('./build-dataset.js');
  const rawDir = findRawItemsDir();
  expectedItems = buildDataset(readRawItems(rawDir));
} catch (error) {
  console.warn(`Warning: raw dataset unavailable; skipping generated-vs-raw comparison. ${error.message}`);
}

const items = readJson(DATA_PATH, 'filtered-items');
if (items) {
  assert(Array.isArray(items), 'filtered-items must be an array');
  if (expectedItems) {
    assert(items.length === expectedItems.length, `filtered-items count must match generated raw output: expected ${expectedItems.length}, found ${items.length}`);
    assert(JSON.stringify(items) === JSON.stringify(expectedItems), 'filtered-items does not match the dataset produced from raw source; run npm run build:data');
  }

  const ids = new Set();
  for (const item of items) {
    assert(item && typeof item.id === 'string', 'every item must have a string id');
    if (item && item.id) {
      assert(!ids.has(item.id), `duplicate item id: ${item.id}`);
      ids.add(item.id);
    }

    for (const field of ['name', 'type', 'rarity', 'foundIn', 'value', 'stackSize', 'craftBench', 'recipe', 'recyclesInto', 'salvagesInto', 'upgradeCost', 'upgradesFrom']) {
      assert(Object.prototype.hasOwnProperty.call(item, field), `${item.id || 'unknown'} is missing ${field}`);
    }

    assert(item.name && typeof item.name.en === 'string' && typeof item.name.tr === 'string', `${item.id} must have name.en and name.tr`);
  }

  assert(fs.existsSync(PHOTOS_DIR), 'assets/item-photos directory is missing');
  if (fs.existsSync(PHOTOS_DIR)) {
    const photoFiles = fs.readdirSync(PHOTOS_DIR).filter(file => file.endsWith('.png'));
    const photos = new Set(photoFiles.map(file => path.basename(file, '.png')));
    for (const id of ids) {
      assert(photos.has(id), `missing item photo: assets/item-photos/${id}.png`);
    }
    const extras = [...photos].filter(id => !ids.has(id));
    assert(extras.length === 0, `runtime item-photos contains ${extras.length} extra image(s): ${extras.slice(0, 20).join(', ')}`);
  }
}

const maps = readJson(MAP_PATH, 'map-zones');
if (maps) {
  assert(maps.dam_battlegrounds, 'map-zones must contain dam_battlegrounds');
  const imagePath = maps.dam_battlegrounds && maps.dam_battlegrounds.image;
  assert(typeof imagePath === 'string', 'dam_battlegrounds.image must be a string');
  if (typeof imagePath === 'string') {
    assert(exists(imagePath), `map image does not exist: ${imagePath}`);
    assert(!imagePath.startsWith('map-images/'), `map image uses old path: ${imagePath}`);
  }
  assert(Array.isArray(maps.dam_battlegrounds.zones), 'dam_battlegrounds.zones must be an array');
}

const sourceFiles = [
  'index.html',
  'src/app.js',
  'src/recipeTree.js',
  'tools/map-editor.html',
  'data/maps/map-zones.json'
];
const forbidden = [
  'src="item-photos/',
  "src='item-photos/",
  "fetch('./filtered-items.json')",
  "fetch('./map-zones.json')",
  "fetch('map-zones.json')",
  '"map-images/'
];

for (const relPath of sourceFiles) {
  if (!exists(relPath)) continue;
  const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  for (const pattern of forbidden) {
    assert(!text.includes(pattern), `${relPath} still contains old path pattern: ${pattern}`);
  }
}

if (errors.length) {
  console.error('Validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Validation passed.');
