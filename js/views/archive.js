// ============ 认可档案 tab ============
const Archive = (() => {
  let filterState = {};
  let filterPanelBuilt = false;

  function init() {
    document.getElementById('btn-archive-filter').addEventListener('click', () => {
      document.getElementById('archive-filter-panel').classList.toggle('hidden');
    });
  }

  async function renderList() {
    const all = await DB.Restaurants.all();
    const approved = all.filter((r) => r.status === 'approved');

    const panel = document.getElementById('archive-filter-panel');
    if (!filterPanelBuilt) {
      const { getState } = Filters.createPanel(panel, approved, (state) => {
        filterState = state;
        renderList();
      });
      filterPanelBuilt = true;
      filterState = getState();
    }

    const filtered = Filters.apply(approved, filterState)
      .sort((a, b) => (b.lastVisitAt || b.addedAt || '').localeCompare(a.lastVisitAt || a.addedAt || ''));

    const listEl = document.getElementById('archive-list');
    const emptyEl = document.getElementById('archive-empty');
    listEl.innerHTML = '';
    emptyEl.classList.toggle('hidden', approved.length > 0);

    for (const r of filtered) {
      const card = await buildCard(r);
      listEl.appendChild(card);
    }
  }

  async function buildCard(r) {
    let thumbHTML = '<div class="card-thumb-placeholder">🍽️</div>';
    if (r.photos && r.photos.length) {
      const photo = await DB.Photos.get(r.photos[0]);
      if (photo) {
        const url = URL.createObjectURL(photo.blob);
        thumbHTML = `<img class="card-thumb" src="${url}">`;
      }
    }
    const card = UI.el(`
      <div class="archive-card">
        <div class="card-top-row">
          ${thumbHTML}
          <div class="card-title-block">
            <p class="card-title">${Utils.escapeHTML(r.name)}</p>
            <p class="card-subtitle">${[r.brand ? '🏷️ ' + r.brand : null, r.cuisine, r.region].filter(Boolean).map(Utils.escapeHTML).join(' · ')}</p>
          </div>
          ${r.myRating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (r.myRating ? `<span class="tag tag-rating">${Utils.escapeHTML(r.myRating)}</span>` : '')}
        </div>
        ${r.notes ? `<p class="card-note">${Utils.escapeHTML(r.notes)}</p>` : ''}
      </div>
    `);
    card.addEventListener('click', () => openDetail(r.id));
    return card;
  }

  async function openDetail(id) {
    const r = await DB.Restaurants.get(id);
    if (!r) return;

    let photosHTML = '';
    if (r.photos && r.photos.length) {
      const imgs = await Promise.all(r.photos.map(async (pid) => {
        const p = await DB.Photos.get(pid);
        return p ? `<img src="${URL.createObjectURL(p.blob)}">` : '';
      }));
      photosHTML = `<div class="detail-photos">${imgs.join('')}</div>`;
    }

    const wishes = await DB.Wishes.all();
    const linkedWishes = wishes.filter((w) => w.linkedRestaurantId === id && w.status === 'open');
    const wishHint = linkedWishes.length
      ? `<div class="linked-wish-hint">你馋这家的「${Utils.escapeHTML(linkedWishes[0].content)}」很久了${linkedWishes.length > 1 ? ` 等 ${linkedWishes.length} 个心愿` : ''}</div>`
      : '';

    const linksHTML = (r.links && r.links.length)
      ? `<div class="external-links">${r.links.map((l) => UI.renderLinkIcon(l)).join('')}</div>`
      : '';

    let siblingsHTML = '';
    let brandActionsHTML = '';
    if (r.brand) {
      const all = await DB.Restaurants.all();
      const siblings = all.filter((s) => s.id !== id && s.brand === r.brand && s.status === 'approved');
      if (siblings.length) {
        siblingsHTML = `
          <div class="detail-field">
            <label>同品牌分店</label>
            <div class="tag-row" id="sibling-branches">
              ${siblings.map((s) => `<span class="tag" data-id="${s.id}" style="cursor:pointer;">${Utils.escapeHTML(s.name)}${s.region ? ' · ' + Utils.escapeHTML(s.region) : ''}</span>`).join('')}
            </div>
          </div>
        `;
      }
      brandActionsHTML = `
        <button type="button" class="btn btn-secondary btn-full" id="detail-amap-search">🔍 高德搜索同品牌分店</button>
      `;
    }

    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>${Utils.escapeHTML(r.name)}</h2><button class="sheet-close">✕</button></div>
      ${photosHTML}
      ${wishHint}
      <div class="tag-row" style="margin-bottom:14px;">
        ${r.myRating ? `<span class="tag ${r.myRating === '必回访' ? 'tag-must' : 'tag-rating'}">${Utils.escapeHTML(r.myRating)}</span>` : ''}
        ${r.brand ? `<span class="tag">🏷️ ${Utils.escapeHTML(r.brand)}</span>` : ''}
        ${(r.tags || []).map((t) => `<span class="tag">${Utils.escapeHTML(t)}</span>`).join('')}
      </div>
      <div class="detail-field"><label>菜系</label><div class="value">${Utils.escapeHTML(r.cuisine || '—')}</div></div>
      <div class="detail-field"><label>场景</label><div class="value">${(r.scene || []).map(Utils.escapeHTML).join(' / ') || '—'}</div></div>
      <div class="detail-field"><label>人均</label><div class="value">${r.pricePerPerson != null ? '¥' + r.pricePerPerson : '—'}</div></div>
      <div class="detail-field"><label>备注</label><div class="value">${Utils.escapeHTML(r.notes || '—')}</div></div>
      <div class="detail-field"><label>城市/地区</label><div class="value">${Utils.escapeHTML(r.region || '—')}</div></div>
      <div class="detail-field"><label>去过次数</label><div class="value">${r.visitCount || 0} 次${r.lastVisitAt ? ' · 最近 ' + r.lastVisitAt : ''}</div></div>
      ${linksHTML}
      ${siblingsHTML}
      ${brandActionsHTML}
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" class="btn btn-accent btn-full" id="detail-visited" style="flex:1;">今天去了 🎉</button>
      </div>
      <div class="modal-actions" style="margin-top:10px;">
        <button type="button" class="btn btn-ghost" id="detail-edit">编辑</button>
        <button type="button" class="btn btn-danger" id="detail-delete">删除</button>
      </div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    const siblingRow = sheet.querySelector('#sibling-branches');
    if (siblingRow) {
      siblingRow.querySelectorAll('[data-id]').forEach((el) => {
        el.onclick = () => openDetail(el.dataset.id);
      });
    }
    const amapBtn = sheet.querySelector('#detail-amap-search');
    if (amapBtn) amapBtn.onclick = () => openAmapSearchSheet(r);
    sheet.querySelector('#detail-visited').onclick = async () => {
      await DB.Restaurants.markVisited(id);
      UI.toast('已记录，回味满足 🎉');
      UI.closeSheet();
      App.notifyDataChanged();
    };
    sheet.querySelector('#detail-edit').onclick = () => {
      UI.closeSheet();
      RestaurantForm.open({
        initial: r,
        title: '编辑餐厅',
        submitLabel: '保存',
        onSubmit: async (patch) => {
          await DB.Restaurants.update(id, patch);
          UI.toast('已保存');
          App.notifyDataChanged();
        },
      });
    };
    sheet.querySelector('#detail-delete').onclick = async () => {
      const ok = await UI.confirmDialog({
        title: '删除餐厅',
        message: `确定要删除「${r.name}」吗？此操作不可恢复。`,
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      await DB.Restaurants.remove(id);
      UI.closeSheet();
      UI.toast('已删除');
      App.notifyDataChanged();
    };
  }

  async function openAmapSearchSheet(r) {
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>搜索「${Utils.escapeHTML(r.brand)}」分店</h2><button class="sheet-close">✕</button></div>
      <div id="amap-search-body"><p class="form-hint">搜索中…</p></div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    const body = sheet.querySelector('#amap-search-body');

    try {
      const configured = await AMapService.isConfigured();
      if (!configured) {
        body.innerHTML = `
          <p class="form-hint">还没有配置高德 Key，去设置页填写后才能使用自动搜索。</p>
          <button type="button" class="btn btn-primary btn-full" id="amap-goto-settings" style="margin-top:10px;">去设置填写</button>
        `;
        body.querySelector('#amap-goto-settings').onclick = () => {
          UI.closeSheet();
          App.switchView('settings');
        };
        return;
      }

      const all = await DB.Restaurants.all();
      const existingNames = new Set(all.map((x) => x.name));
      const pois = await AMapService.searchPOI(r.brand, r.region);

      if (!pois.length) {
        body.innerHTML = `<p class="form-hint">没有搜到相关分店，换个品牌名试试。</p>`;
        return;
      }

      body.innerHTML = `
        <p class="form-hint" style="margin-bottom:8px;">勾选你实际会考虑去的分店，别一股脑全加进想去清单</p>
        <div class="link-list" id="amap-results">
          ${pois.map((p, i) => `
            <label class="link-row" style="align-items:flex-start; ${existingNames.has(p.name) ? 'opacity:0.5;' : ''}">
              <input type="checkbox" data-idx="${i}" ${existingNames.has(p.name) ? 'disabled' : ''} style="margin-top:4px;">
              <span style="flex:1;">
                <b>${Utils.escapeHTML(p.name)}</b>${existingNames.has(p.name) ? ' <span class="form-hint">（已存在）</span>' : ''}<br>
                <span class="form-hint">${Utils.escapeHTML(p.address || '')}</span>
              </span>
            </label>
          `).join('')}
        </div>
        <button type="button" class="btn btn-primary btn-full" id="amap-import" style="margin-top:14px;" disabled>加入想去（0）</button>
      `;
      const importBtn = body.querySelector('#amap-import');
      function updateImportBtn() {
        const n = body.querySelectorAll('#amap-results input:checked').length;
        importBtn.textContent = `加入想去（${n}）`;
        importBtn.disabled = n === 0;
      }
      body.querySelectorAll('#amap-results input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', updateImportBtn);
      });
      importBtn.onclick = async () => {
        const checked = [...body.querySelectorAll('#amap-results input:checked')];
        for (const cb of checked) {
          const p = pois[Number(cb.dataset.idx)];
          const location = p.location ? Utils.gcj02ToWgs84(p.location.lng, p.location.lat) : null;
          await DB.Restaurants.create({
            name: p.name,
            brand: r.brand,
            status: 'wishlist',
            region: p.city || r.region || '',
            location,
            notes: p.address || '',
          });
        }
        UI.toast(`已加入 ${checked.length} 家到想去`);
        UI.closeSheet();
        App.notifyDataChanged();
      };
    } catch (e) {
      body.innerHTML = `<p class="form-hint">${Utils.escapeHTML(e.message)}</p>`;
    }
  }

  return { init, renderList, openDetail };
})();
