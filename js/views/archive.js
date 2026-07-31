// ============ 认可档案 tab ============
const Archive = (() => {
  let filterState = {};
  let filterPanelBuilt = false;
  let searchQuery = '';

  function init() {
    document.getElementById('btn-archive-filter').addEventListener('click', () => {
      document.getElementById('archive-filter-panel').classList.toggle('hidden');
    });
    document.getElementById('archive-search').addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderList();
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

    let filtered = Filters.apply(approved, filterState);
    if (searchQuery) {
      filtered = filtered.filter((r) =>
        r.name.toLowerCase().includes(searchQuery) || (r.brand || '').toLowerCase().includes(searchQuery));
    }

    const listEl = document.getElementById('archive-list');
    const emptyEl = document.getElementById('archive-empty');
    const noMatchEl = document.getElementById('archive-no-match');
    listEl.innerHTML = '';
    // 库里一家都没有 → 引导去认可；有但都被搜索/筛选挡掉了 → 提示放宽条件
    emptyEl.classList.toggle('hidden', approved.length > 0);
    noMatchEl.classList.toggle('hidden', approved.length === 0 || filtered.length > 0);

    const sortKeyOf = (r) => r.lastVisitAt || r.addedAt || '';
    const items = [];

    if (searchQuery) {
      // 搜索时不分组：匹配到的分店如果被折叠进品牌卡片里就等于没搜到
      for (const r of filtered) {
        items.push({ sortKey: sortKeyOf(r), el: await buildCard(r) });
      }
    } else {
      // 同品牌的多家分店合并成一张可展开卡片，跟"想去"tab 的分组逻辑一致
      const groups = new Map();
      const singles = [];
      for (const r of filtered) {
        if (r.brand) {
          if (!groups.has(r.brand)) groups.set(r.brand, []);
          groups.get(r.brand).push(r);
        } else {
          singles.push(r);
        }
      }
      for (const r of singles) {
        items.push({ sortKey: sortKeyOf(r), el: await buildCard(r) });
      }
      for (const [brand, branchList] of groups) {
        if (branchList.length === 1) {
          items.push({ sortKey: sortKeyOf(branchList[0]), el: await buildCard(branchList[0]) });
        } else {
          const latestKey = branchList.reduce((max, r) => (sortKeyOf(r) > max ? sortKeyOf(r) : max), '');
          items.push({ sortKey: latestKey, el: await buildGroupCard(brand, branchList) });
        }
      }
    }

    items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    items.forEach((item) => listEl.appendChild(item.el));
  }

  // 组内任意一家分店已经上传过照片的话，折叠卡片就用那张当封面，没有照片才退回品牌图标
  async function pickGroupThumbHTML(branchList, fallbackEmoji) {
    for (const r of branchList) {
      if (r.photos && r.photos.length) {
        const photo = await DB.Photos.get(r.photos[0]);
        if (photo) return `<img class="card-thumb" src="${URL.createObjectURL(photo.blob)}">`;
      }
    }
    return `<div class="card-thumb-placeholder">${fallbackEmoji}</div>`;
  }

  async function buildGroupCard(brand, branchList) {
    const thumbHTML = await pickGroupThumbHTML(branchList, '🏷️');
    const group = UI.el(`
      <details class="archive-card shop-group">
        <summary class="card-top-row">
          ${thumbHTML}
          <div class="card-title-block">
            <p class="card-title">${Utils.escapeHTML(brand)}</p>
            <p class="card-subtitle">${branchList.length} 家分店 · 点开选择</p>
          </div>
        </summary>
        <div class="shop-group-branches"></div>
      </details>
    `);
    const branchContainer = group.querySelector('.shop-group-branches');
    const sorted = [...branchList].sort((a, b) => {
      const ak = a.lastVisitAt || a.addedAt || '';
      const bk = b.lastVisitAt || b.addedAt || '';
      return bk.localeCompare(ak);
    });
    for (const r of sorted) {
      branchContainer.appendChild(await buildCard(r));
    }
    return group;
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
    const subtitleParts = [r.brand ? '🏷️ ' + r.brand : null, r.cuisine, r.region];
    if (r.visitCount) subtitleParts.push(`去过 ${r.visitCount} 次`);
    const card = UI.el(`
      <div class="archive-card">
        <div class="card-top-row">
          ${thumbHTML}
          <div class="card-title-block">
            <p class="card-title">${Utils.escapeHTML(r.name)}</p>
            <p class="card-subtitle">${subtitleParts.filter(Boolean).map(Utils.escapeHTML).join(' · ')}</p>
          </div>
          <div class="card-side">
            ${r.myRating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (r.myRating ? `<span class="tag tag-rating">${Utils.escapeHTML(r.myRating)}</span>` : '')}
            <button type="button" class="btn-checkin">✓ 打卡</button>
          </div>
        </div>
        ${r.notes ? `<p class="card-note">${Utils.escapeHTML(r.notes)}</p>` : ''}
      </div>
    `);
    card.querySelector('.btn-checkin').onclick = async (e) => {
      e.stopPropagation(); // 卡片本身是点开详情的，打卡不该顺带把详情弹出来
      if (r.lastVisitAt === Utils.todayISO()) {
        UI.toast('今天已经记过一次了');
        return;
      }
      await DB.Restaurants.markVisited(r.id);
      UI.toast(`已记下今天去了${r.name} 🎉`);
      App.notifyDataChanged();
    };
    card.addEventListener('click', () => openDetail(r.id));
    return card;
  }

  async function openDetail(id) {
    const r = await DB.Restaurants.get(id);
    if (!r) return;

    let photosHTML = '';
    let photoUrls = [];
    if (r.photos && r.photos.length) {
      const blobUrls = await Promise.all(r.photos.map(async (pid) => {
        const p = await DB.Photos.get(pid);
        return p ? URL.createObjectURL(p.blob) : null;
      }));
      photoUrls = blobUrls.filter(Boolean);
      photosHTML = `<div class="detail-photos">${photoUrls.map((url, i) => `<img class="detail-photo" data-idx="${i}" src="${url}">`).join('')}</div>`;
    }

    const wishes = await DB.Wishes.all();
    const linkedWishes = wishes.filter((w) => w.linkedRestaurantId === id && w.status === 'open');
    const wishHint = linkedWishes.length
      ? `<div class="linked-wish-hint">你馋这家的「${Utils.escapeHTML(linkedWishes[0].content)}」很久了${linkedWishes.length > 1 ? ` 等 ${linkedWishes.length} 个心愿` : ''}</div>`
      : '';

    const linksHTML = (r.links && r.links.length)
      ? `<div class="external-links">${r.links.map((l) => UI.renderLinkIcon(l)).join('')}</div>`
      : '';

    let navHTML = '';
    if (r.location) {
      const { lat, lng } = r.location;
      const name = encodeURIComponent(r.name);
      const baiduUrl = `https://api.map.baidu.com/direction?destination=${lat},${lng}&mode=driving&coord_type=wgs84&src=webapp`;
      const amapUrl = `https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=car&policy=1&coordinate=wgs84&callnative=1`;
      const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      navHTML = `
        <div class="detail-field">
          <label>导航</label>
          <div class="external-links">
            <a class="external-link-btn" href="${baiduUrl}" target="_blank" rel="noopener">🧭 百度地图</a>
            <a class="external-link-btn" href="${amapUrl}" target="_blank" rel="noopener">🧭 高德地图</a>
            <a class="external-link-btn" href="${googleUrl}" target="_blank" rel="noopener">🌍 Google 地图</a>
          </div>
        </div>
      `;
    }

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

    const isWishlist = r.status === 'wishlist';
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>${Utils.escapeHTML(r.name)}</h2><button class="sheet-close">✕</button></div>
      ${photosHTML}
      ${wishHint}
      <div class="tag-row" style="margin-bottom:14px;">
        ${isWishlist ? '<span class="tag">🔖 想去</span>' : ''}
        ${r.myRating ? `<span class="tag ${r.myRating === '必回访' ? 'tag-must' : 'tag-rating'}">${Utils.escapeHTML(r.myRating)}</span>` : ''}
        ${r.brand ? `<span class="tag">🏷️ ${Utils.escapeHTML(r.brand)}</span>` : ''}
        ${(r.tags || []).map((t) => `<span class="tag">${Utils.escapeHTML(t)}</span>`).join('')}
      </div>
      <div class="detail-field"><label>菜系</label><div class="value">${Utils.escapeHTML(r.cuisine || '—')}</div></div>
      <div class="detail-field"><label>场景</label><div class="value">${(r.scene || []).map(Utils.escapeHTML).join(' / ') || '—'}</div></div>
      <div class="detail-field"><label>人均</label><div class="value">${r.pricePerPerson != null ? '¥' + r.pricePerPerson : '—'}</div></div>
      <div class="detail-field"><label>备注</label><div class="value">${Utils.escapeHTML(r.notes || '—')}</div></div>
      <div class="detail-field"><label>城市/地区</label><div class="value">${Utils.escapeHTML(r.region || '—')}</div></div>
      ${isWishlist ? '' : `<div class="detail-field"><label>去过次数</label><div class="value">${r.visitCount || 0} 次${r.lastVisitAt ? ' · 最近 ' + r.lastVisitAt : ''}</div></div>`}
      ${navHTML}
      ${linksHTML}
      ${siblingsHTML}
      ${brandActionsHTML}
      <div class="modal-actions" style="margin-top:16px;">
        ${isWishlist
          ? '<button type="button" class="btn btn-primary btn-full" id="detail-approve" style="flex:1;">认可 ✅</button>'
          : '<button type="button" class="btn btn-accent btn-full" id="detail-visited" style="flex:1;">今天去了 🎉</button>'}
      </div>
      <div class="modal-actions" style="margin-top:10px;">
        <button type="button" class="btn btn-ghost" id="detail-edit">编辑</button>
        <button type="button" class="btn btn-danger" id="detail-delete">删除</button>
      </div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    sheet.querySelectorAll('.detail-photo').forEach((img) => {
      img.onclick = () => UI.openPhotoViewer(photoUrls, Number(img.dataset.idx));
    });
    const siblingRow = sheet.querySelector('#sibling-branches');
    if (siblingRow) {
      siblingRow.querySelectorAll('[data-id]').forEach((el) => {
        el.onclick = () => openDetail(el.dataset.id);
      });
    }
    const amapBtn = sheet.querySelector('#detail-amap-search');
    if (amapBtn) amapBtn.onclick = () => openAmapSearchSheet(r);
    const visitedBtn = sheet.querySelector('#detail-visited');
    if (visitedBtn) {
      visitedBtn.onclick = async () => {
        await DB.Restaurants.markVisited(id);
        UI.toast('已记录，回味满足 🎉');
        UI.closeSheet();
        App.notifyDataChanged();
      };
    }
    const approveBtn = sheet.querySelector('#detail-approve');
    if (approveBtn) {
      approveBtn.onclick = () => {
        UI.closeSheet();
        WantGo.openApproveSheet(r);
      };
    }
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

  async function openMissingLocationList() {
    const all = await DB.Restaurants.all();
    const missing = all.filter((r) => r.status === 'approved' && !r.location);
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>缺坐标的认可餐厅</h2><button class="sheet-close">✕</button></div>
      <p class="form-hint" style="margin-bottom:10px;">这些店没有坐标，地图上看不到图钉，点"编辑补坐标"用高德搜地址或定位补一下</p>
      <div class="card-list" id="missing-location-list"></div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    const listEl = sheet.querySelector('#missing-location-list');

    if (!missing.length) {
      listEl.innerHTML = '<p class="form-hint">都补全啦 🎉</p>';
      return;
    }
    missing.forEach((r) => {
      const row = UI.el(`
        <div class="shop-card">
          <div class="card-top-row">
            <div class="card-thumb-placeholder">📍</div>
            <div class="card-title-block">
              <p class="card-title">${Utils.escapeHTML(r.name)}</p>
              <p class="card-subtitle">${Utils.escapeHTML(r.region || '')}</p>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary btn-fix">编辑补坐标</button>
          </div>
        </div>
      `);
      row.querySelector('.btn-fix').onclick = () => {
        RestaurantForm.open({
          initial: r,
          title: '编辑餐厅',
          submitLabel: '保存',
          onSubmit: async (patch) => {
            await DB.Restaurants.update(r.id, patch);
            UI.toast('已保存');
            App.notifyDataChanged();
            if (patch.location) openMissingLocationList();
          },
        });
      };
      listEl.appendChild(row);
    });
  }

  return { init, renderList, openDetail, openMissingLocationList };
})();
