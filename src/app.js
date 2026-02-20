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

// ===== Helpers =====
function benchLabel(bench) {
  if (!bench) return null;
  const b = Array.isArray(bench) ? bench[0] : bench;
  return b.replace(/_/g, ' ');
}
function imgTag(id, cls) {
  return `<img class="item-icon ${cls}" src="item-photos/${id}.png" alt="" loading="lazy">`;
}
function rarityClass(r) { return r ? `rarity-${r.toLowerCase()}` : ''; }

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
  setupSearch(input, results, showItemDetail);
}

function showItemDetail(id) {
  const item = itemsMap[id];
  if (!item) return;
  const el = document.getElementById('itemDetail');
  const rc = rarityClass(item.rarity);
  const craftable = !!item.recipe;

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
  const hasRecycleSrc = obtainTree.recycle.length > 0;
  const hasSalvageSrc = obtainTree.salvage.length > 0;
  if (hasRecycleSrc || hasSalvageSrc) {
    html += `<div class="detail-section"><h3>📥 Obtained From</h3>`;

    if (hasRecycleSrc) {
      const sorted = [...obtainTree.recycle].sort((a, b) => b.quantity - a.quantity);
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
      const sorted = [...obtainTree.salvage].sort((a, b) => b.quantity - a.quantity);
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

  // Used In (reverse lookup)
  const uses = usedInMap[item.id];
  if (uses && uses.length > 0) {
    html += `
      <div class="detail-section">
        <h3>🔧 Used to Craft</h3>
        <div class="detail-breakdown">
          ${uses.map(u => {
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
  setupSearch(input, results, addItem, item => !selected.some(s => s.id === item.id));
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

// ===== Init =====
async function init() {
  await loadItems('./filtered-items.json');
  allItems = Object.values(itemsMap);
  initTabs();
  initBrowse();
  initCalc();
}
init();
