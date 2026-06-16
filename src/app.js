import {
  loadItems,
  resolveTree,
  resolveMultiple,
  flattenToBaseMaterials,
  groupByLocation,
  resolveObtainTree,
  itemsMap,
  usedInMap
} from './recipeTree.js';

// ===== State =====
let allItems = [];
let selected = [];          // calculator: { id, quantity }
let lootSelected = [];      // loot finder: { id }
let currentDetailId = null; // currently displayed item in browse tab
let mapZonesData = null;    // loaded data/maps/map-zones.json data

// Location metadata (for future use: photos, descriptions, etc.)
const LOCATIONS = {
  'ARC':           { id: 'arc',           label: 'ARC',           color: '#6c5ce7' },
  'Residential':   { id: 'residential',   label: 'Residential',   color: '#00b894' },
  'Exodus':        { id: 'exodus',        label: 'Exodus',        color: '#e17055' },
  'Security':      { id: 'security',      label: 'Security',      color: '#d63031' },
  'Commercial':    { id: 'commercial',    label: 'Commercial',    color: '#fdcb6e' },
  'Industrial':    { id: 'industrial',    label: 'Industrial',    color: '#636e72' },
  'Mechanical':    { id: 'mechanical',    label: 'Mechanical',    color: '#b2bec3' },
  'Electrical':    { id: 'electrical',    label: 'Electrical',    color: '#0984e3' },
  'Medical':       { id: 'medical',       label: 'Medical',       color: '#55efc4' },
  'Technological': { id: 'technological', label: 'Technological', color: '#a29bfe' },
  'Raider':        { id: 'raider',        label: 'Raider',        color: '#ff7675' },
  'Nature':        { id: 'nature',        label: 'Nature',        color: '#00cec9' }
};

const COMBAT_TYPES = new Set([
  'Ammunition', 'Assault Rifle', 'Battle Rifle', 'Hand Cannon',
  'LMG', 'Modification', 'Pistol', 'Shotgun', 'SMG', 'Sniper Rifle', 'Special'
]);

function isCombatItem(item) { return COMBAT_TYPES.has(item.type); }

// ===== Helpers =====
function benchLabel(bench) {
  if (!bench) return null;
  const b = Array.isArray(bench) ? bench[0] : bench;
  return b.replace(/_/g, ' ');
}
function imgTag(id, cls) {
  return `<img class="item-icon ${cls}" src="assets/item-photos/${id}.png" alt="" loading="lazy">`;
}
function rarityClass(r) { return r ? `rarity-${r.toLowerCase()}` : ''; }

/** For a craftable material and a quantity, return inline HTML showing base material breakdown */
function baseBreakdownHint(matId, qty) {
  const mat = itemsMap[matId];
  if (!mat || !mat.recipe) return '';  // base material, no breakdown
  const tree = resolveTree(matId, qty);
  const bases = flattenToBaseMaterials(tree);
  const parts = Object.values(bases)
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .map(b => `${imgTag(b.id, 'item-icon-xs')}<span class="${rarityClass(b.rarity)}">${b.totalQuantity} ${b.name.en}</span>`)
    .join(' + ');
  return `<div class="base-hint">${qty}×${mat.recipe ? Object.keys(mat.recipe).length + ' mats' : ''} = ${parts}</div>`;
}

// ===== Filter combat items from obtain tree nodes =====
function filterObtainNodes(nodes) {
  return nodes
    .filter(n => {
      const item = itemsMap[n.id];
      return !item || !isCombatItem(item);
    })
    .map(n => ({
      ...n,
      children: n.children ? {
        recycle: filterObtainNodes(n.children.recycle || []),
        salvage: filterObtainNodes(n.children.salvage || [])
      } : n.children
    }));
}

// ===== Obtain Node Renderer (multi-level reverse tree) =====
function renderObtainNode(node) {
  const rc = rarityClass(node.rarity);
  const hasChildren = node.children &&
    (node.children.recycle.length > 0 || node.children.salvage.length > 0);

  let html = `<div class="obtain-item">
    <div class="obtain-row clickable-item" data-id="${node.id}">
      ${hasChildren ? '<span class="expand-btn">▸</span>' : '<span class="expand-placeholder"></span>'}
      ${imgTag(node.id, 'item-icon-md')}
      <span class="obtain-name ${rc}">${node.name.en}</span>
      <span class="qty-badge">${node.quantity}×</span>
      <span class="obtain-type">${node.type || ''}</span>
    </div>`;

  if (hasChildren) {
    html += `<div class="obtain-children hidden">`;
    if (node.children.recycle.length > 0) {
      html += `<div class="obtain-sub-label">♻ Recycle:</div>`;
      const sorted = [...node.children.recycle].sort((a, b) => b.quantity - a.quantity);
      for (const sub of sorted) {
        html += `
          <div class="obtain-sub-row clickable-item" data-id="${sub.id}">
            ${imgTag(sub.id, 'item-icon-sm')}
            <span class="${rarityClass(sub.rarity)}">${sub.name.en}</span>
            <span class="qty-badge">${sub.quantity}×</span>
          </div>`;
      }
    }
    if (node.children.salvage.length > 0) {
      html += `<div class="obtain-sub-label">🔨 Salvage:</div>`;
      const sorted = [...node.children.salvage].sort((a, b) => b.quantity - a.quantity);
      for (const sub of sorted) {
        html += `
          <div class="obtain-sub-row clickable-item" data-id="${sub.id}">
            ${imgTag(sub.id, 'item-icon-sm')}
            <span class="${rarityClass(sub.rarity)}">${sub.name.en}</span>
            <span class="qty-badge">${sub.quantity}×</span>
          </div>`;
      }
    }
    html += `</div></div>`;
  } else {
    html += `</div>`;
  }

  return html;
}

// ===== Tab Navigation =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`page-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });
}

// ===== Generic Search Dropdown =====
function setupSearch(inputEl, resultsEl, onSelect, filterFn) {
  inputEl.addEventListener('input', () => showDropdown(inputEl, resultsEl, onSelect, filterFn));
  inputEl.addEventListener('focus', () => showDropdown(inputEl, resultsEl, onSelect, filterFn));
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) resultsEl.classList.add('hidden');
  });
}

function showDropdown(inputEl, resultsEl, onSelect, filterFn) {
  const q = inputEl.value.trim().toLowerCase();
  if (q.length < 1) { resultsEl.classList.add('hidden'); return; }

  let matches = allItems.filter(item => {
    if (filterFn && !filterFn(item)) return false;
    const en = (item.name.en || '').toLowerCase();
    const tr = (item.name.tr || '').toLowerCase();
    return en.includes(q) || tr.includes(q) || item.id.includes(q);
  }).slice(0, 12);

  if (!matches.length) { resultsEl.classList.add('hidden'); return; }

  resultsEl.innerHTML = matches.map(item => `
    <div class="search-result-item" data-id="${item.id}">
      ${imgTag(item.id, 'item-icon-sm')}
      <span class="sr-info">
        <span class="item-name">${item.name.en}</span>
        <span class="item-name-sub">${item.name.tr || ''}</span>
      </span>
      <span class="item-type">${item.type}</span>
    </div>
  `).join('');

  resultsEl.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      onSelect(el.dataset.id);
      inputEl.value = '';
      resultsEl.classList.add('hidden');
    });
  });
  resultsEl.classList.remove('hidden');
}

// ================================================================
//  PAGE 1: Item Browser
// ================================================================
function initBrowse() {
  const input = document.getElementById('browseSearch');
  const results = document.getElementById('browseResults');
  const toggle = document.getElementById('browseIncludeCombat');
  // Search always shows all items (no combat filter on search)
  setupSearch(input, results, showItemDetail);
  toggle.addEventListener('change', () => {
    // Re-render current detail to apply combat filter to detail sections
    if (currentDetailId) showItemDetail(currentDetailId);
  });
}

function showItemDetail(id) {
  const item = itemsMap[id];
  if (!item) return;
  currentDetailId = id;
  const el = document.getElementById('itemDetail');
  const rc = rarityClass(item.rarity);
  const craftable = !!item.recipe;
  const includeCombat = document.getElementById('browseIncludeCombat').checked;

  // Header section
  let html = `
    <div class="detail-card panel">
      <div class="detail-header">
        ${imgTag(item.id, 'item-icon-xl')}
        <div class="detail-title">
          <h2 class="${rc}">${item.name.en}</h2>
          <span class="detail-sub">${item.name.tr || ''}</span>
          <div class="detail-tags">
            <span class="tag tag-type">${item.type}</span>
            <span class="tag tag-rarity ${rc}">${item.rarity || 'Unknown'}</span>
            ${item.value ? `<span class="tag tag-value">₿ ${item.value}</span>` : ''}
            ${item.stackSize ? `<span class="tag tag-stack">Stack: ${item.stackSize}</span>` : ''}
          </div>
        </div>
      </div>`;

  // Crafting / Found In
  if (craftable) {
    const bench = benchLabel(item.craftBench);
    html += `
      <div class="detail-section">
        <h3>Crafted at: <span class="bench-tag">${bench || 'Unknown'}</span></h3>
        <div class="detail-recipe">
          ${Object.entries(item.recipe).map(([ingId, qty]) => {
            const ing = itemsMap[ingId];
            const name = ing ? ing.name.en : ingId;
            return `
              <div class="recipe-row clickable-item" data-id="${ingId}">
                ${imgTag(ingId, 'item-icon-md')}
                <span class="${ing ? rarityClass(ing.rarity) : ''}">${name}</span>
                <span class="qty-badge">${qty}×</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  } else {
    html += `
      <div class="detail-section">
        <h3 class="loot-label">⚠ Cannot be crafted — must be found</h3>
        ${item.foundIn ? `<p class="found-location">Found in: <strong>${item.foundIn}</strong></p>` : '<p class="found-location">Drop location unknown</p>'}
      </div>`;
  }

  // Full recipe tree (if craftable)
  if (craftable) {
    const tree = resolveTree(item.id, 1);
    const baseMats = flattenToBaseMaterials(tree);
    html += `
      <div class="detail-section">
        <h3>Full Recipe Tree</h3>
        <div class="recipe-trees">
          <div class="tree-block">
            ${renderTreeChildren(tree.children)}
          </div>
        </div>
      </div>
      <div class="detail-section">
        <h3>Base Materials Needed (×1)</h3>
        <div class="detail-base-mats">
          ${Object.values(baseMats).sort((a,b) => b.totalQuantity - a.totalQuantity).map(mat => `
            <div class="recipe-row clickable-item" data-id="${mat.id}">
              ${imgTag(mat.id, 'item-icon-md')}
              <span class="${rarityClass(mat.rarity)}">${mat.name.en}</span>
              <span class="qty-badge">${mat.totalQuantity}×</span>
              ${mat.foundIn ? `<span class="found-tag">${mat.foundIn}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }

  // Recycle Into
  if (item.recyclesInto && Object.keys(item.recyclesInto).length > 0) {
    html += `
      <div class="detail-section">
        <h3>♻ Recycle Into</h3>
        <div class="detail-breakdown">
          ${Object.entries(item.recyclesInto).map(([matId, qty]) => {
            const mat = itemsMap[matId];
            const name = mat ? mat.name.en : matId;
            return `
              <div class="recipe-row clickable-item" data-id="${matId}">
                ${imgTag(matId, 'item-icon-md')}
                <span class="${mat ? rarityClass(mat.rarity) : ''}">${name}</span>
                <span class="qty-badge">${qty}×</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // Salvage Into
  if (item.salvagesInto && Object.keys(item.salvagesInto).length > 0) {
    html += `
      <div class="detail-section">
        <h3>🔨 Salvage Into</h3>
        <div class="detail-breakdown">
          ${Object.entries(item.salvagesInto).map(([matId, qty]) => {
            const mat = itemsMap[matId];
            const name = mat ? mat.name.en : matId;
            return `
              <div class="recipe-row clickable-item" data-id="${matId}">
                ${imgTag(matId, 'item-icon-md')}
                <span class="${mat ? rarityClass(mat.rarity) : ''}">${name}</span>
                <span class="qty-badge">${qty}×</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // Obtained From (reverse recycle/salvage multi-level tree)
  const obtainTree = resolveObtainTree(item.id, 2);
  // Filter out combat items if toggle is off
  const filteredRecycle = includeCombat ? obtainTree.recycle
    : filterObtainNodes(obtainTree.recycle);
  const filteredSalvage = includeCombat ? obtainTree.salvage
    : filterObtainNodes(obtainTree.salvage);
  const hasRecycleSrc = filteredRecycle.length > 0;
  const hasSalvageSrc = filteredSalvage.length > 0;
  if (hasRecycleSrc || hasSalvageSrc) {
    html += `<div class="detail-section"><h3>📥 Obtained From</h3>`;

    if (hasRecycleSrc) {
      const sorted = [...filteredRecycle].sort((a, b) => b.quantity - a.quantity);
      html += `
        <div class="obtain-group">
          <div class="obtain-group-header">
            <span class="method-badge method-recycle">♻ Recycle</span>
            <span class="obtain-count">${sorted.length} sources</span>
            <button class="sort-toggle" data-section="recycle">Qty ↓</button>
          </div>
          <div class="obtain-list" data-sort="desc">
            ${sorted.map(src => renderObtainNode(src)).join('')}
          </div>
        </div>`;
    }

    if (hasSalvageSrc) {
      const sorted = [...filteredSalvage].sort((a, b) => b.quantity - a.quantity);
      html += `
        <div class="obtain-group">
          <div class="obtain-group-header">
            <span class="method-badge method-salvage">🔨 Salvage</span>
            <span class="obtain-count">${sorted.length} sources</span>
            <button class="sort-toggle" data-section="salvage">Qty ↓</button>
          </div>
          <div class="obtain-list" data-sort="desc">
            ${sorted.map(src => renderObtainNode(src)).join('')}
          </div>
        </div>`;
    }

    html += `</div>`;
  }

  // Upgrade Info (upgradesFrom + upgradeCost)
  if (item.upgradesFrom) {
    const prev = itemsMap[item.upgradesFrom];
    const prevName = prev ? prev.name.en : item.upgradesFrom;
    html += `
      <div class="detail-section">
        <h3>⬆ Upgrade Info</h3>
        <p class="upgrade-from-label">Upgraded from:</p>
        <div class="recipe-row clickable-item" data-id="${item.upgradesFrom}">
          ${imgTag(item.upgradesFrom, 'item-icon-md')}
          <span class="${prev ? rarityClass(prev.rarity) : ''}">${prevName}</span>
        </div>`;
    if (item.upgradeCost && Object.keys(item.upgradeCost).length > 0) {
      html += `
        <p class="upgrade-cost-label">Upgrade cost:</p>
        <div class="detail-breakdown">
          ${Object.entries(item.upgradeCost).map(([matId, qty]) => {
            const mat = itemsMap[matId];
            const name = mat ? mat.name.en : matId;
            return `
              <div class="upgrade-mat-block">
                <div class="recipe-row clickable-item" data-id="${matId}">
                  ${imgTag(matId, 'item-icon-md')}
                  <span class="${mat ? rarityClass(mat.rarity) : ''}">${name}</span>
                  <span class="qty-badge">${qty}×</span>
                </div>
                ${baseBreakdownHint(matId, qty)}
              </div>`;
          }).join('')}
        </div>`;
    }

    // Full upgrade chain: I → II → III → IV total cost
    const chain = [];
    let cur = item;
    while (cur) {
      if (cur.upgradeCost) chain.unshift({ id: cur.id, name: cur.name.en, cost: cur.upgradeCost });
      const prevItem = cur.upgradesFrom ? itemsMap[cur.upgradesFrom] : null;
      cur = prevItem;
    }
    if (chain.length > 1) {
      const totalMats = {};
      for (const step of chain) {
        for (const [matId, qty] of Object.entries(step.cost)) {
          totalMats[matId] = (totalMats[matId] || 0) + qty;
        }
      }
      html += `
        <p class="upgrade-cost-label">Total upgrade chain (${chain.map(c => c.name).join(' → ')}):</p>
        <div class="detail-breakdown">
          ${Object.entries(totalMats).sort((a,b) => b[1] - a[1]).map(([matId, qty]) => {
            const mat = itemsMap[matId];
            const name = mat ? mat.name.en : matId;
            return `
              <div class="upgrade-mat-block">
                <div class="recipe-row clickable-item" data-id="${matId}">
                  ${imgTag(matId, 'item-icon-md')}
                  <span class="${mat ? rarityClass(mat.rarity) : ''}">${name}</span>
                  <span class="qty-badge">${qty}×</span>
                </div>
                ${baseBreakdownHint(matId, qty)}
              </div>`;
          }).join('')}
        </div>`;
    }

    html += `</div>`;
  }

  // Used In (reverse lookup)
  const uses = usedInMap[item.id];
  const filteredUses = uses ? uses.filter(u => {
    if (includeCombat) return true;
    const parent = itemsMap[u.id];
    return parent && !isCombatItem(parent);
  }) : [];
  if (filteredUses.length > 0) {
    html += `
      <div class="detail-section">
        <h3>🔧 Used to Craft</h3>
        <div class="detail-breakdown">
          ${filteredUses.map(u => {
            const parent = itemsMap[u.id];
            if (!parent) return '';
            return `
              <div class="recipe-row clickable-item" data-id="${u.id}">
                ${imgTag(u.id, 'item-icon-md')}
                <span class="${rarityClass(parent.rarity)}">${parent.name.en}</span>
                <span class="qty-badge">needs ${u.quantity}×</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
  el.classList.remove('hidden');

  // Bind clickable items for navigation
  el.querySelectorAll('.clickable-item').forEach(row => {
    row.addEventListener('click', () => {
      showItemDetail(row.dataset.id);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Expand/collapse for obtain tree sub-sources
  el.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.obtain-item');
      const children = item.querySelector('.obtain-children');
      if (children) {
        children.classList.toggle('hidden');
        btn.textContent = children.classList.contains('hidden') ? '▸' : '▾';
      }
    });
  });

  // Sort toggle for obtain lists
  el.querySelectorAll('.sort-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = btn.closest('.obtain-group').querySelector('.obtain-list');
      const items = Array.from(list.children);
      items.reverse();
      items.forEach(item => list.appendChild(item));
      const isDesc = list.dataset.sort === 'desc';
      list.dataset.sort = isDesc ? 'asc' : 'desc';
      btn.textContent = isDesc ? 'Qty ↑' : 'Qty ↓';
    });
  });
}

// ================================================================
//  PAGE 2: Calculator (existing logic, refactored)
// ================================================================
function initCalc() {
  const input = document.getElementById('calcSearch');
  const results = document.getElementById('calcResults');
  const toggle = document.getElementById('calcIncludeCombat');
  const filterFn = item => {
    if (selected.some(s => s.id === item.id)) return false;
    if (!toggle.checked && isCombatItem(item)) return false;
    return true;
  };
  setupSearch(input, results, addItem, filterFn);
  toggle.addEventListener('change', () => {
    if (input.value.trim().length > 0) showDropdown(input, results, addItem, filterFn);
  });
  document.getElementById('calculateBtn').addEventListener('click', onCalculate);
}

function addItem(id) {
  if (selected.some(s => s.id === id)) return;
  selected.push({ id, quantity: 1 });
  renderSelected();
}

function removeItem(id) {
  selected = selected.filter(s => s.id !== id);
  renderSelected();
  if (selected.length === 0) document.getElementById('resultsContainer').classList.add('hidden');
}

function changeQty(id, delta) {
  const item = selected.find(s => s.id === id);
  if (!item) return;
  item.quantity = Math.max(1, item.quantity + delta);
  renderSelected();
}

function renderSelected() {
  const btn = document.getElementById('calculateBtn');
  const el = document.getElementById('selectedItems');
  btn.disabled = selected.length === 0;

  el.innerHTML = selected.map(s => {
    const item = itemsMap[s.id];
    const rc = rarityClass(item.rarity);
    return `
      <div class="selected-item">
        ${imgTag(item.id, 'item-icon-md')}
        <span class="si-name ${rc}">${item.name.en}</span>
        <span class="si-type">${item.type}</span>
        <div class="si-qty">
          <button data-id="${s.id}" data-delta="-1">−</button>
          <span>${s.quantity}</span>
          <button data-id="${s.id}" data-delta="1">+</button>
        </div>
        <button class="si-remove" data-id="${s.id}">✕</button>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.si-qty button').forEach(btn => {
    btn.addEventListener('click', () => changeQty(btn.dataset.id, parseInt(btn.dataset.delta)));
  });
  el.querySelectorAll('.si-remove').forEach(btn => {
    btn.addEventListener('click', () => removeItem(btn.dataset.id));
  });
}

function onCalculate() {
  if (selected.length === 0) return;
  const trees = resolveMultiple(selected);
  const baseMats = flattenToBaseMaterials(trees);
  const locations = groupByLocation(baseMats);

  renderTrees(trees);
  renderBaseMaterials(baseMats);
  renderLocations(locations);
  document.getElementById('resultsContainer').classList.remove('hidden');
}

// ===== Render: Recipe Trees =====
function renderTrees(trees) {
  document.getElementById('recipeTrees').innerHTML = trees.map(tree => {
    const bench = benchLabel(tree.craftBench);
    return `
      <div class="tree-block">
        <div class="tree-header">
          ${imgTag(tree.id, 'item-icon-lg')}
          <span>${tree.name.en} ×${tree.quantity}</span>
          ${bench ? `<span class="bench-tag">${bench}</span>` : ''}
        </div>
        ${renderTreeChildren(tree.children)}
      </div>
    `;
  }).join('');
}

function renderTreeChildren(children) {
  if (!children || children.length === 0) return '';
  return children.map(node => {
    const isLeaf = node.children.length === 0;
    const rc = rarityClass(node.rarity);
    const foundTag = (isLeaf && node.foundIn) ? `<span class="found-tag">${node.foundIn}</span>` : '';
    const bench = (!isLeaf && node.craftBench) ? `<span class="bench-tag">${benchLabel(node.craftBench)}</span>` : '';
    const lootTag = (isLeaf && !node.foundIn) ? `<span class="loot-tag">loot</span>` : '';

    if (isLeaf) {
      return `
        <div class="tree-leaf">
          <div class="tree-leaf-row">
            ${imgTag(node.id, 'item-icon-xs')}
            <span class="qty-badge">${node.quantity}×</span>
            <span class="${rc}">${node.name.en}</span>
            ${foundTag}${lootTag}
          </div>
        </div>`;
    }
    return `
      <div class="tree-node">
        <div class="tree-node-row">
          ${imgTag(node.id, 'item-icon-xs')}
          <span class="qty-badge">${node.quantity}×</span>
          <span class="${rc}">${node.name.en}</span>
          ${bench}
        </div>
        ${renderTreeChildren(node.children)}
      </div>`;
  }).join('');
}

// ===== Render: Base Materials =====
function renderBaseMaterials(baseMats) {
  const entries = Object.values(baseMats).sort((a, b) => b.totalQuantity - a.totalQuantity);
  document.getElementById('baseMaterials').innerHTML = entries.map(mat => {
    const rc = rarityClass(mat.rarity);
    return `
      <div class="mat-card">
        ${imgTag(mat.id, 'item-icon-lg')}
        <div class="mat-info">
          <div class="mat-name ${rc}">${mat.name.en}</div>
          <div class="mat-detail">${mat.type}</div>
          <div class="mat-qty">${mat.totalQuantity}×</div>
          <div class="mat-found">${mat.foundIn || 'Unknown'}</div>
        </div>
      </div>`;
  }).join('');
}

// ===== Render: By Location =====
function renderLocations(locations) {
  const sorted = Object.keys(locations).sort();
  document.getElementById('byLocation').innerHTML = sorted.map(loc => {
    const items = locations[loc];
    const chips = items.map(mat => `
      <span class="loc-chip">
        ${imgTag(mat.id, 'item-icon-xs')}
        <span class="chip-qty">${mat.totalQuantity}×</span>
        ${mat.name.en}
      </span>
    `).join('');
    return `
      <div class="loc-group">
        <div class="loc-name">${loc}</div>
        <div class="loc-items">${chips}</div>
      </div>`;
  }).join('');
}

// ================================================================
//  PAGE 3: Where to Loot
// ================================================================
function initLoot() {
  const input = document.getElementById('lootSearch');
  const results = document.getElementById('lootSearchResults');
  const filterFn = item => {
    if (lootSelected.some(s => s.id === item.id)) return false;
    // Only show items that have foundIn data
    if (!item.foundIn) return false;
    return true;
  };
  setupSearch(input, results, addLootItem, filterFn);
  document.getElementById('lootFindBtn').addEventListener('click', onFindLoot);
}

function addLootItem(id) {
  if (lootSelected.some(s => s.id === id)) return;
  lootSelected.push({ id });
  renderLootSelected();
}

function removeLootItem(id) {
  lootSelected = lootSelected.filter(s => s.id !== id);
  renderLootSelected();
  if (lootSelected.length === 0) document.getElementById('lootResultsContainer').classList.add('hidden');
}

function renderLootSelected() {
  const btn = document.getElementById('lootFindBtn');
  const el = document.getElementById('lootSelectedItems');
  btn.disabled = lootSelected.length === 0;

  el.innerHTML = lootSelected.map(s => {
    const item = itemsMap[s.id];
    const rc = rarityClass(item.rarity);
    return `
      <div class="selected-item">
        ${imgTag(item.id, 'item-icon-md')}
        <span class="si-name ${rc}">${item.name.en}</span>
        <span class="si-type">${item.type}</span>
        <span class="si-found">${item.foundIn || '?'}</span>
        <button class="si-remove" data-id="${s.id}">✕</button>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.si-remove').forEach(btn => {
    btn.addEventListener('click', () => removeLootItem(btn.dataset.id));
  });
}

function onFindLoot() {
  if (lootSelected.length === 0) return;

  // Gather all locations per selected item
  const itemLocations = lootSelected.map(s => {
    const item = itemsMap[s.id];
    const locs = item.foundIn ? item.foundIn.split(',').map(l => l.trim()) : [];
    return { id: s.id, name: item.name.en, rarity: item.rarity, locations: new Set(locs) };
  });

  // Score each location: how many of the selected items can be found there
  const locationScores = {};
  for (const loc of Object.keys(LOCATIONS)) {
    const itemsHere = itemLocations.filter(il => il.locations.has(loc));
    if (itemsHere.length === 0) continue;
    locationScores[loc] = {
      location: loc,
      meta: LOCATIONS[loc],
      score: itemsHere.length,
      total: lootSelected.length,
      percentage: Math.round((itemsHere.length / lootSelected.length) * 100),
      items: itemsHere,
      missing: itemLocations.filter(il => !il.locations.has(loc))
    };
  }

  renderLootResults(locationScores, itemLocations);
  renderLootMap(locationScores);
  document.getElementById('lootResultsContainer').classList.remove('hidden');
}

function renderLootResults(locationScores, itemLocations) {
  const el = document.getElementById('lootLocations');
  const sorted = Object.values(locationScores).sort((a, b) => b.score - a.score || a.location.localeCompare(b.location));

  if (sorted.length === 0) {
    el.innerHTML = '<p class="no-results">No matching locations found.</p>';
    return;
  }

  const maxScore = sorted[0].score;

  el.innerHTML = sorted.map(loc => {
    const isBest = loc.score === maxScore;
    const barWidth = loc.percentage;

    const foundItems = loc.items.map(il => `
      <span class="loot-chip found">
        ${imgTag(il.id, 'item-icon-xs')}
        <span class="${rarityClass(il.rarity)}">${il.name}</span>
      </span>
    `).join('');

    const missingItems = loc.missing.map(il => `
      <span class="loot-chip missing">
        ${imgTag(il.id, 'item-icon-xs')}
        <span class="${rarityClass(il.rarity)}">${il.name}</span>
      </span>
    `).join('');

    return `
      <div class="loot-location-card ${isBest ? 'best' : ''}">
        <div class="loot-loc-header">
          <span class="loot-loc-name" style="color:${loc.meta.color}">
            ${isBest ? '⭐ ' : ''}${loc.location}
          </span>
          <span class="loot-loc-score">${loc.score}/${loc.total} items (${loc.percentage}%)</span>
        </div>
        <div class="loot-bar-track">
          <div class="loot-bar-fill ${isBest ? 'best' : ''}" style="width:${barWidth}%;background:${loc.meta.color}"></div>
        </div>
        <div class="loot-items-section">
          <div class="loot-items-label">✅ Found here:</div>
          <div class="loot-chips">${foundItems}</div>
        </div>
        ${loc.missing.length > 0 ? `
          <div class="loot-items-section">
            <div class="loot-items-label">❌ Not here:</div>
            <div class="loot-chips">${missingItems}</div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ===== Nearest-Neighbor Route (starts from best-scoring zone) =====
function nearestNeighborRoute(points, locationScores) {
  if (points.length <= 1) return [...points];

  // Find the best score among relevant zone types
  const maxScore = Math.max(...Object.values(locationScores).map(s => s.score));
  const bestTypes = new Set(
    Object.entries(locationScores)
      .filter(([, s]) => s.score === maxScore)
      .map(([type]) => type)
  );

  // Sort so best-type zones come first, then pick the first one as start
  const sorted = [...points].sort((a, b) => {
    const aIsBest = bestTypes.has(a.type) ? 0 : 1;
    const bIsBest = bestTypes.has(b.type) ? 0 : 1;
    return aIsBest - bIsBest;
  });

  const remaining = sorted.slice(1);
  const route = [sorted[0]];

  while (remaining.length > 0) {
    const last = route[route.length - 1];
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - last.x;
      const dy = remaining[i].y - last.y;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    route.push(remaining.splice(nearest, 1)[0]);
  }
  return route;
}

// ===== Loot Map State =====
let mapScale = 1, mapPanX = 0, mapPanY = 0;
let mapIsPanning = false, mapPanStartX = 0, mapPanStartY = 0;
let mapImgW = 0, mapImgH = 0;
let mapStartPoint = null;    // { x, y } user-chosen start on map
let mapSettingStart = false; // true when "Set Start" mode is active
let currentLocationScores = null;
let currentRelevantZones = null;
let currentAllZones = null;

function mapUpdateTransform() {
  const canvas = document.getElementById('imapCanvas');
  canvas.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapScale})`;
}

function mapFitToView() {
  const vp = document.getElementById('imapViewport');
  const vpW = vp.clientWidth;
  const vpH = vp.clientHeight;
  if (!mapImgW || !mapImgH) return;
  mapScale = Math.min(vpW / mapImgW, vpH / mapImgH) * 0.95;
  mapPanX = (vpW - mapImgW * mapScale) / 2;
  mapPanY = (vpH - mapImgH * mapScale) / 2;
  mapUpdateTransform();
}

function initMapInteraction() {
  const vp = document.getElementById('imapViewport');
  const coordsEl = document.getElementById('imapCoords');

  // Wheel zoom
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const prev = mapScale;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    mapScale = Math.max(0.1, Math.min(8, mapScale * factor));
    mapPanX = mx - (mx - mapPanX) * (mapScale / prev);
    mapPanY = my - (my - mapPanY) * (mapScale / prev);
    mapUpdateTransform();
  }, { passive: false });

  // Pan
  vp.addEventListener('mousedown', (e) => {
    if (mapSettingStart) return; // don't pan in set-start mode
    if (e.button === 0 || e.button === 1) {
      mapIsPanning = true;
      mapPanStartX = e.clientX - mapPanX;
      mapPanStartY = e.clientY - mapPanY;
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (mapIsPanning) {
      mapPanX = e.clientX - mapPanStartX;
      mapPanY = e.clientY - mapPanStartY;
      mapUpdateTransform();
    }
    // Show coords
    const rect = vp.getBoundingClientRect();
    const mapX = (e.clientX - rect.left - mapPanX) / mapScale;
    const mapY = (e.clientY - rect.top - mapPanY) / mapScale;
    if (mapX >= 0 && mapX <= mapImgW && mapY >= 0 && mapY <= mapImgH) {
      coordsEl.textContent = `${Math.round(mapX)}, ${Math.round(mapY)}`;
    }
  });
  window.addEventListener('mouseup', () => { mapIsPanning = false; });
  vp.addEventListener('contextmenu', (e) => e.preventDefault());

  // Click — set start point
  vp.addEventListener('click', (e) => {
    if (!mapSettingStart) return;
    const rect = vp.getBoundingClientRect();
    const mapX = Math.round((e.clientX - rect.left - mapPanX) / mapScale);
    const mapY = Math.round((e.clientY - rect.top - mapPanY) / mapScale);
    if (mapX < 0 || mapX > mapImgW || mapY < 0 || mapY > mapImgH) return;
    mapStartPoint = { x: mapX, y: mapY };
    mapSettingStart = false;
    vp.classList.remove('crosshair');
    document.getElementById('btnSetStart').classList.remove('active');
    // Re-render SVG with new start point
    if (currentLocationScores) renderMapSVG();
  });

  // Buttons
  document.getElementById('imapZoomIn').addEventListener('click', () => {
    const vp2 = document.getElementById('imapViewport');
    const cx = vp2.clientWidth / 2, cy = vp2.clientHeight / 2;
    const prev = mapScale;
    mapScale = Math.min(8, mapScale * 1.3);
    mapPanX = cx - (cx - mapPanX) * (mapScale / prev);
    mapPanY = cy - (cy - mapPanY) * (mapScale / prev);
    mapUpdateTransform();
  });
  document.getElementById('imapZoomOut').addEventListener('click', () => {
    const vp2 = document.getElementById('imapViewport');
    const cx = vp2.clientWidth / 2, cy = vp2.clientHeight / 2;
    const prev = mapScale;
    mapScale = Math.max(0.1, mapScale * 0.7);
    mapPanX = cx - (cx - mapPanX) * (mapScale / prev);
    mapPanY = cy - (cy - mapPanY) * (mapScale / prev);
    mapUpdateTransform();
  });
  document.getElementById('btnFitMap').addEventListener('click', mapFitToView);

  document.getElementById('btnSetStart').addEventListener('click', () => {
    mapSettingStart = !mapSettingStart;
    const vp2 = document.getElementById('imapViewport');
    vp2.classList.toggle('crosshair', mapSettingStart);
    document.getElementById('btnSetStart').classList.toggle('active', mapSettingStart);
  });
  document.getElementById('btnClearStart').addEventListener('click', () => {
    mapStartPoint = null;
    mapSettingStart = false;
    document.getElementById('imapViewport').classList.remove('crosshair');
    document.getElementById('btnSetStart').classList.remove('active');
    if (currentLocationScores) renderMapSVG();
  });
}

// ===== Loot Map Rendering =====
async function loadMapZones() {
  if (mapZonesData) return mapZonesData;
  try {
    const res = await fetch('./data/maps/map-zones.json');
    mapZonesData = await res.json();
  } catch (e) {
    mapZonesData = {};
  }
  return mapZonesData;
}

function renderMapSVG() {
  const locationScores = currentLocationScores;
  const overlay = document.getElementById('lootMapOverlay');
  const relevantTypes = new Set(Object.keys(locationScores));
  const zones = currentAllZones || [];
  const relevant = zones.filter(z => relevantTypes.has(z.type));
  const dimmed = zones.filter(z => !relevantTypes.has(z.type));

  let svg = '';

  // Dimmed zones
  for (const z of dimmed) {
    const color = LOCATIONS[z.type]?.color || '#888';
    svg += `
      <circle cx="${z.x}" cy="${z.y}" r="16" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1" stroke-opacity="0.3" />
      <text x="${z.x}" y="${z.y - 22}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}" fill-opacity="0.3" paint-order="stroke" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${z.label || z.type}</text>
    `;
  }

  // Relevant zones (highlighted)
  const maxScore = Math.max(...Object.values(locationScores).map(s => s.score));
  for (const z of relevant) {
    const color = LOCATIONS[z.type]?.color || '#888';
    const score = locationScores[z.type];
    const isBest = score && score.score === maxScore;
    const r = isBest ? 22 : 18;
    const pulse = isBest ? `<circle cx="${z.x}" cy="${z.y}" r="${r + 8}" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"><animate attributeName="r" from="${r}" to="${r + 20}" dur="1.5s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" /></circle>` : '';
    svg += `
      ${pulse}
      <circle cx="${z.x}" cy="${z.y}" r="${r}" fill="${color}" fill-opacity="0.85" stroke="#fff" stroke-width="2.5" />
      <text x="${z.x}" y="${z.y - r - 6}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" paint-order="stroke" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${z.label || z.type}</text>
    `;
  }

  // Start point marker
  if (mapStartPoint) {
    svg += `
      <circle cx="${mapStartPoint.x}" cy="${mapStartPoint.y}" r="14" fill="#e74c3c" fill-opacity="0.9" stroke="#fff" stroke-width="3" />
      <text x="${mapStartPoint.x}" y="${mapStartPoint.y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">S</text>
      <text x="${mapStartPoint.x}" y="${mapStartPoint.y - 20}" text-anchor="middle" font-size="12" font-weight="600" fill="#e74c3c" paint-order="stroke" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">Start</text>
    `;
  }

  // Route
  if (relevant.length >= 1) {
    // Build route points: start from user start point (if set) or from best-scoring zone
    let routePoints = [];
    if (mapStartPoint) {
      // Start from user's chosen point, then nearest-neighbor through relevant zones
      // Sort relevant zones: prefer best-scoring ones first when distances are similar
      routePoints = nearestNeighborFromPoint(mapStartPoint, relevant, locationScores);
    } else if (relevant.length >= 2) {
      routePoints = nearestNeighborRoute(relevant, locationScores);
    }

    if (routePoints.length >= 2) {
      // Draw from start point to first zone
      const first = routePoints[0];
      if (mapStartPoint) {
        svg += `
          <line x1="${mapStartPoint.x}" y1="${mapStartPoint.y}" x2="${first.x}" y2="${first.y}" stroke="#e74c3c" stroke-width="4" stroke-opacity="0.4" stroke-linecap="round" />
          <line x1="${mapStartPoint.x}" y1="${mapStartPoint.y}" x2="${first.x}" y2="${first.y}" stroke="#e74c3c" stroke-width="2" stroke-opacity="0.8" stroke-dasharray="10,6" stroke-linecap="round">
            <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1s" repeatCount="indefinite" />
          </line>
        `;
      }

      // Draw route lines between zones
      for (let i = 0; i < routePoints.length - 1; i++) {
        const a = routePoints[i];
        const b = routePoints[i + 1];
        svg += `
          <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fff" stroke-width="5" stroke-opacity="0.15" stroke-linecap="round" />
          <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fff" stroke-width="2.5" stroke-opacity="0.7" stroke-dasharray="12,8" stroke-linecap="round">
            <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.5s" repeatCount="indefinite" />
          </line>
        `;
      }
    }

    // Step numbers on route points
    const numberedPoints = routePoints.length >= 1 ? routePoints : relevant;
    for (let i = 0; i < numberedPoints.length; i++) {
      const z = numberedPoints[i];
      svg += `
        <circle cx="${z.x + 26}" cy="${z.y - 26}" r="13" fill="#6c5ce7" stroke="#fff" stroke-width="2" />
        <text x="${z.x + 26}" y="${z.y - 22}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${i + 1}</text>
      `;
    }
  }

  overlay.innerHTML = svg;

  // Legend
  const legendEl = document.getElementById('mapLegend');
  const allTypes = [...new Set(zones.map(z => z.type))];
  legendEl.innerHTML = allTypes.map(type => {
    const color = LOCATIONS[type]?.color || '#888';
    const isRelevant = relevantTypes.has(type);
    const score = locationScores[type];
    return `
      <span class="map-legend-item ${isRelevant ? 'relevant' : 'dim'}">
        <span class="legend-dot" style="background:${color}"></span>
        ${type}
        ${score ? `<span class="legend-score">${score.score}/${score.total}</span>` : ''}
      </span>`;
  }).join('');
}

// Nearest-neighbor starting from an arbitrary point
function nearestNeighborFromPoint(start, points, locationScores) {
  const remaining = [...points];
  const route = [];
  let current = start;

  while (remaining.length > 0) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - current.x;
      const dy = remaining[i].y - current.y;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    const next = remaining.splice(nearest, 1)[0];
    route.push(next);
    current = next;
  }
  return route;
}

async function renderLootMap(locationScores) {
  const data = await loadMapZones();
  const mapIds = Object.keys(data);
  if (mapIds.length === 0) return;

  const select = document.getElementById('mapSelect');
  select.innerHTML = mapIds.map(id =>
    `<option value="${id}">${data[id].name?.en || id}</option>`
  ).join('');

  currentLocationScores = locationScores;

  function showMap(mapId) {
    const mapInfo = data[mapId];
    if (!mapInfo) return;

    const img = document.getElementById('lootMapImg');
    const overlay = document.getElementById('lootMapOverlay');

    img.src = mapInfo.image;
    img.onload = () => {
      mapImgW = img.naturalWidth;
      mapImgH = img.naturalHeight;
      overlay.setAttribute('viewBox', `0 0 ${mapImgW} ${mapImgH}`);
      overlay.style.width = mapImgW + 'px';
      overlay.style.height = mapImgH + 'px';

      currentAllZones = mapInfo.zones || [];
      renderMapSVG();
      mapFitToView();
    };
  }

  select.addEventListener('change', () => showMap(select.value));
  showMap(mapIds[0]);
}

// ===== Init =====
async function init() {
  await loadItems('./data/generated/filtered-items.json');
  allItems = Object.values(itemsMap);
  initTabs();
  initBrowse();
  initCalc();
  initLoot();
  initMapInteraction();
}
init();
