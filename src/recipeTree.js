/**
 * Recipe Tree Module
 * 
 * data/generated/filtered-items.json verisini kullanarak:
 * - Tek bir eşyanın recipe ağacını çıkarır (rekürsif)
 * - Birden fazla eşyanın toplam hammadde listesini hesaplar
 * - Yaprak düğümlerde foundIn bilgisini gösterir
 */

let itemsMap = {};
let usedInMap = {};  // reverse lookup: ingredientId → [{ id, name, quantity }]
let recycledFromMap = {};  // materialId → [{ id: sourceItemId, quantity }]
let salvagedFromMap = {};  // materialId → [{ id: sourceItemId, quantity }]

/**
 * data/generated/filtered-items.json verisini yükler ve id bazlı lookup map oluşturur
 */
async function loadItems(url = './data/generated/filtered-items.json') {
  const res = await fetch(url);
  const items = await res.json();
  itemsMap = {};
  for (const item of items) {
    itemsMap[item.id] = item;
  }
  // Build reverse lookup: which items use each ingredient
  usedInMap = {};
  for (const item of items) {
    if (!item.recipe) continue;
    for (const [ingredientId, qty] of Object.entries(item.recipe)) {
      if (!usedInMap[ingredientId]) usedInMap[ingredientId] = [];
      usedInMap[ingredientId].push({ id: item.id, quantity: qty });
    }
  }

  // Build reverse lookup: which items produce each material via recycle/salvage
  recycledFromMap = {};
  salvagedFromMap = {};
  for (const item of items) {
    if (item.recyclesInto) {
      for (const [matId, qty] of Object.entries(item.recyclesInto)) {
        if (!recycledFromMap[matId]) recycledFromMap[matId] = [];
        recycledFromMap[matId].push({ id: item.id, quantity: qty });
      }
    }
    if (item.salvagesInto) {
      for (const [matId, qty] of Object.entries(item.salvagesInto)) {
        if (!salvagedFromMap[matId]) salvagedFromMap[matId] = [];
        salvagedFromMap[matId].push({ id: item.id, quantity: qty });
      }
    }
  }

  return itemsMap;
}

/**
 * Tek bir eşyanın recipe ağacını rekürsif olarak çözer.
 * 
 * Dönen yapı:
 * {
 *   id: "sterilized_bandage",
 *   name: { en: "...", tr: "..." },
 *   type: "Quick Use",
 *   quantity: 1,
 *   craftBench: "medical_bench",
 *   foundIn: "Medical, Commercial",
 *   children: [
 *     {
 *       id: "antiseptic",
 *       quantity: 1,
 *       children: [
 *         { id: "chemicals", quantity: 10, children: [] },
 *         { id: "great_mullein", quantity: 2, children: [] }
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */
function resolveTree(itemId, quantity = 1) {
  const item = itemsMap[itemId];

  // Item veride yoksa (bilinmeyen malzeme)
  if (!item) {
    return {
      id: itemId,
      name: { en: itemId, tr: itemId },
      type: 'Unknown',
      rarity: null,
      quantity,
      craftBench: null,
      foundIn: null,
      children: []
    };
  }

  const node = {
    id: item.id,
    name: item.name,
    type: item.type,
    rarity: item.rarity,
    quantity,
    craftBench: item.craftBench || null,
    foundIn: item.foundIn || null,
    children: []
  };

  // recipe varsa → alt malzemelere in (rekürsif)
  if (item.recipe) {
    for (const [ingredientId, baseAmount] of Object.entries(item.recipe)) {
      const totalAmount = baseAmount * quantity;
      node.children.push(resolveTree(ingredientId, totalAmount));
    }
  }

  return node;
}

/**
 * Birden fazla eşyanın recipe ağacını çözer.
 * 
 * @param {Array<{id: string, quantity: number}>} selectedItems
 * @returns {Array} Her biri için ağaç
 */
function resolveMultiple(selectedItems) {
  return selectedItems.map(({ id, quantity }) => resolveTree(id, quantity || 1));
}

/**
 * Ağaçtan yaprak düğümleri (temel hammaddeler) düz liste olarak toplar.
 * Aynı malzemeler toplanır (miktarlar birleşir).
 * 
 * Dönen yapı:
 * {
 *   "chemicals": { id, name, type, foundIn, totalQuantity },
 *   "fabric": { ... },
 *   ...
 * }
 */
function flattenToBaseMaterials(trees) {
  const materials = {};

  function walk(node) {
    // Yaprak düğüm = recipe'si yok (children boş)
    if (node.children.length === 0) {
      if (materials[node.id]) {
        materials[node.id].totalQuantity += node.quantity;
      } else {
        materials[node.id] = {
          id: node.id,
          name: node.name,
          type: node.type,
          rarity: node.rarity,
          foundIn: node.foundIn,
          totalQuantity: node.quantity
        };
      }
      return;
    }

    // Ara düğüm = alt malzemelere devam
    for (const child of node.children) {
      walk(child);
    }
  }

  // trees tek ağaç veya dizi olabilir
  const list = Array.isArray(trees) ? trees : [trees];
  for (const tree of list) {
    walk(tree);
  }

  return materials;
}

/**
 * flattenToBasesMaterials çıktısını foundIn bazında gruplar.
 * "Nerede ne toplayacaksın?" sorusuna cevap verir.
 * 
 * Dönen yapı:
 * {
 *   "Industrial": [ { id, name, totalQuantity }, ... ],
 *   "Medical": [ ... ],
 *   ...
 * }
 */
function groupByLocation(baseMaterials) {
  const locations = {};

  for (const mat of Object.values(baseMaterials)) {
    if (!mat.foundIn) continue;

    const locs = mat.foundIn.split(',').map(s => s.trim());
    for (const loc of locs) {
      if (!locations[loc]) locations[loc] = [];
      locations[loc].push({
        id: mat.id,
        name: mat.name,
        type: mat.type,
        rarity: mat.rarity,
        totalQuantity: mat.totalQuantity
      });
    }
  }

  return locations;
}

/**
 * Reverse tree: shows which items can be recycled/salvaged to obtain targetId.
 * Multi-level: for each source, also shows what produces THAT source.
 *
 * Returns { recycle: [...nodes], salvage: [...nodes] }
 * Each node: { id, name, rarity, type, quantity, foundIn, children: { recycle, salvage } }
 */
function resolveObtainTree(targetId, maxDepth = 2) {
  function resolve(id, depth, visited) {
    if (depth >= maxDepth) return { recycle: [], salvage: [] };
    const seen = new Set(visited);
    seen.add(id);

    const recycle = (recycledFromMap[id] || [])
      .filter(s => !seen.has(s.id))
      .map(s => {
        const item = itemsMap[s.id];
        return {
          id: s.id,
          name: item ? item.name : { en: s.id, tr: s.id },
          rarity: item ? item.rarity : null,
          type: item ? item.type : null,
          quantity: s.quantity,
          foundIn: item ? item.foundIn : null,
          children: resolve(s.id, depth + 1, seen)
        };
      });

    const salvage = (salvagedFromMap[id] || [])
      .filter(s => !seen.has(s.id))
      .map(s => {
        const item = itemsMap[s.id];
        return {
          id: s.id,
          name: item ? item.name : { en: s.id, tr: s.id },
          rarity: item ? item.rarity : null,
          type: item ? item.type : null,
          quantity: s.quantity,
          foundIn: item ? item.foundIn : null,
          children: resolve(s.id, depth + 1, seen)
        };
      });

    return { recycle, salvage };
  }

  return resolve(targetId, 0, new Set([targetId]));
}

// ES Module export (tarayıcı <script type="module"> ile)
export {
  loadItems,
  resolveTree,
  resolveMultiple,
  flattenToBaseMaterials,
  groupByLocation,
  resolveObtainTree,
  itemsMap,
  usedInMap,
  recycledFromMap,
  salvagedFromMap
};
