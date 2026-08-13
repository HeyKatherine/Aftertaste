// ============ 认可档案 tab ============
const Archive = (() => {
  let filterState = {};
  let filterPanelBuilt = false;
  let searchQuery = '';

  function init() {
    document.getElementById('btn-archive-filter').addEventListener('click', () => {
      document.getElementById('archive-filter-panel').classList.toggle('hidden');
      updateFilterToggle();
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
      // 档案是「翻自己的收藏」，品牌和城市在这里是有用的维度，保留
      const { getState } = Filters.createPanel(panel, approved, (state) => {
        filterState = state;
        updateFilterToggle();
        renderList();
      }, {
        onClose: () => { panel.classList.add('hidden'); updateFilterToggle(); },
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
  async function pickGroupThumbHTML(branchList, fallbackIcon) {
    for (const r of branchList) {
      if (r.photos && r.photos.length) {
        const photo = await DB.Photos.get(r.photos[0]);
        if (photo) return `<img class="card-thumb" src="${URL.createObjectURL(photo.blob)}">`;
      }
    }
    return `<div class="card-thumb-placeholder">${UI.icon(fallbackIcon)}</div>`;
  }

  function updateFilterToggle() {
    const btn = document.getElementById('btn-archive-filter');
    const open = !document.getElementById('archive-filter-panel').classList.contains('hidden');
    const n = Filters.countActive(filterState);
    btn.textContent = `筛选${n ? ' · ' + n : ''} ${open ? '▴' : '▾'}`;
  }

  // 连锁店的评级/菜系/备注这些是品牌级的，分店只负责各自的地址。批量导入时分店就继承好了，
  // 但更早导入的老数据可能参差不齐，所以取第一家填了值的分店作为品牌级展示。
  function sharedField(branchList, key, fallback = '') {
    for (const r of branchList) {
      const v = r[key];
      if (Array.isArray(v)) { if (v.length) return v; }
      else if (v !== null && v !== undefined && v !== '') return v;
    }
    return fallback;
  }

  // 照片也是品牌级的：拍的是这个牌子的菜，不属于某个地址。
  // 各家分店引用的是同一批照片 id，所以汇总时要按 id 去重，否则同一张会出现 N 次。
  function brandPhotoIds(branchList) {
    const ids = [];
    const seen = new Set();
    for (const r of branchList) {
      for (const pid of (r.photos || [])) {
        if (!seen.has(pid)) { seen.add(pid); ids.push(pid); }
      }
    }
    return ids;
  }

  function sortBranches(branchList) {
    return [...branchList].sort((a, b) =>
      (b.lastVisitAt || b.addedAt || '').localeCompare(a.lastVisitAt || a.addedAt || ''));
  }

  async function buildGroupCard(brand, branchList) {
    const thumbHTML = await pickGroupThumbHTML(branchList, 'tag');
    const cuisine = sharedField(branchList, 'cuisine');
    const rating = sharedField(branchList, 'myRating');
    const notes = sharedField(branchList, 'notes');
    const totalVisits = branchList.reduce((sum, r) => sum + (r.visitCount || 0), 0);
    const subtitle = [cuisine, `${branchList.length} 家分店`, totalVisits ? `去过 ${totalVisits} 次` : null]
      .filter(Boolean).map(Utils.escapeHTML).join(' · ');
    // 整张卡片点开的是品牌信息，不再是展开一列分店：分店只是地址，信息是共用的
    const group = UI.el(`
      <div class="archive-card">
        <div class="card-top-row">
          ${thumbHTML}
          <div class="card-title-block">
            <p class="card-title">${UI.icon('tag')}${Utils.escapeHTML(brand)}</p>
            <p class="card-subtitle">${subtitle}</p>
          </div>
          ${rating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (rating ? `<span class="tag tag-rating">${Utils.escapeHTML(rating)}</span>` : '')}
        </div>
        ${notes ? `<p class="card-note">${Utils.escapeHTML(notes)}</p>` : ''}
      </div>
    `);
    group.addEventListener('click', () => openBrandDetail(brand, branchList));
    return group;
  }

  async function buildCard(r) {
    let thumbHTML = `<div class="card-thumb-placeholder">${UI.icon('bowl')}</div>`;
    if (r.photos && r.photos.length) {
      const photo = await DB.Photos.get(r.photos[0]);
      if (photo) {
        const url = URL.createObjectURL(photo.blob);
        thumbHTML = `<img class="card-thumb" src="${url}">`;
      }
    }
    const subtitleParts = [r.brand, r.cuisine, r.region];
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
      // 百度用 marker（地点标注）而不是 direction：direction 少了 output=html 会被打到
      // baidu.com/error.html；就算补上 output=html，没有 origin/region 也只会跳到百度地图首页，
      // 目的地整个丢掉。marker 会把坐标带过去（wgs84 由百度自己转成 bd09），
      // autoOpen 直接弹出该点的信息卡，从那里可以点「到这去」。
      const baiduUrl = `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${name}&content=${name}&coord_type=wgs84&output=html&src=webapp.aftertaste.aftertaste`;
      // App 里直接进路线规划（起点用手机当前定位），比网页版的标点再点「到这去」少两步
      const baiduScheme = `baidumap://map/direction?destination=latlng:${lat},${lng}|name:${name}&mode=driving&coord_type=wgs84&src=webapp.aftertaste.aftertaste`;
      const amapUrl = `https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=car&policy=1&coordinate=wgs84&callnative=1`;
      const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      navHTML = `
        <div class="detail-field">
          <label>导航</label>
          <div class="external-links">
            <a class="external-link-btn" id="nav-baidu" href="${baiduUrl}"
               data-scheme="${Utils.escapeHTML(baiduScheme)}" target="_blank" rel="noopener">🧭 百度地图</a>
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
        ${r.brand ? `<span class="tag">${UI.icon('tag')}${Utils.escapeHTML(r.brand)}</span>` : ''}
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
    // href 仍然是网页版，JS 挂了也点得动；正常情况下先试着唤起 App
    const navBaidu = sheet.querySelector('#nav-baidu');
    if (navBaidu) {
      navBaidu.onclick = (e) => {
        e.preventDefault();
        Utils.openMapApp(navBaidu.dataset.scheme, navBaidu.href);
      };
    }
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

  // 品牌详情：连锁店当成一家店来看，分店退化成一串地址
  async function openBrandDetail(brand, branchList) {
    const cuisine = sharedField(branchList, 'cuisine');
    const rating = sharedField(branchList, 'myRating');
    const scene = sharedField(branchList, 'scene', []);
    const price = sharedField(branchList, 'pricePerPerson', null);
    const notes = sharedField(branchList, 'notes');
    const tags = sharedField(branchList, 'tags', []);
    const totalVisits = branchList.reduce((sum, r) => sum + (r.visitCount || 0), 0);
    const lastVisit = branchList.map((r) => r.lastVisitAt).filter(Boolean).sort().pop();

    const photoUrls = [];
    for (const pid of brandPhotoIds(branchList)) {
      const p = await DB.Photos.get(pid);
      if (p) photoUrls.push(URL.createObjectURL(p.blob));
    }
    const photosHTML = photoUrls.length
      ? `<div class="detail-photos">${photoUrls.map((u, i) => `<img class="detail-photo" data-idx="${i}" src="${u}">`).join('')}</div>`
      : '';

    const branchRowsHTML = sortBranches(branchList).map((r) => `
      <div class="link-row" data-branch-id="${r.id}" style="cursor:pointer; align-items:flex-start;">
        <span style="flex:1;">
          <b>${Utils.escapeHTML(r.name)}</b>${!r.location ? ' <span class="form-hint">⚠️ 没坐标</span>' : ''}<br>
          <span class="form-hint">${[r.region, r.visitCount ? `去过 ${r.visitCount} 次` : null]
            .filter(Boolean).map(Utils.escapeHTML).join(' · ') || '点开可以补地址、导航、打卡'}</span>
        </span>
      </div>
    `).join('');

    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>${UI.icon('tag')}${Utils.escapeHTML(brand)}</h2><button class="sheet-close">✕</button></div>
      ${photosHTML}
      <div class="tag-row" style="margin-bottom:14px;">
        ${rating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (rating ? `<span class="tag tag-rating">${Utils.escapeHTML(rating)}</span>` : '')}
        ${tags.map((t) => `<span class="tag">${Utils.escapeHTML(t)}</span>`).join('')}
      </div>
      <div class="detail-field"><label>菜系</label><div class="value">${Utils.escapeHTML(cuisine || '—')}</div></div>
      <div class="detail-field"><label>场景</label><div class="value">${scene.map(Utils.escapeHTML).join(' / ') || '—'}</div></div>
      <div class="detail-field"><label>人均</label><div class="value">${price != null ? '¥' + price : '—'}</div></div>
      <div class="detail-field"><label>备注</label><div class="value">${Utils.escapeHTML(notes || '—')}</div></div>
      <div class="detail-field"><label>去过次数</label><div class="value">${totalVisits} 次（全部分店合计）${lastVisit ? ' · 最近 ' + Utils.escapeHTML(lastVisit) : ''}</div></div>
      <div class="detail-field">
        <label>分店（${branchList.length}）</label>
        <div class="link-list" id="brand-branches">${branchRowsHTML}</div>
      </div>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" class="btn btn-primary btn-full" id="brand-edit" style="flex:1;">编辑品牌信息（${branchList.length} 家同时改）</button>
      </div>
      <div class="modal-actions" style="margin-top:10px;">
        <button type="button" class="btn btn-danger btn-full" id="brand-delete" style="flex:1;">删除整个品牌（${branchList.length} 家）</button>
      </div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    sheet.querySelectorAll('.detail-photo').forEach((img) => {
      img.onclick = () => UI.openPhotoViewer(photoUrls, Number(img.dataset.idx));
    });
    sheet.querySelectorAll('#brand-branches [data-branch-id]').forEach((row) => {
      row.onclick = () => openDetail(row.dataset.branchId);
    });
    sheet.querySelector('#brand-edit').onclick = () => openEditBrandSheet(brand, branchList);
    sheet.querySelector('#brand-delete').onclick = async () => {
      const ok = await UI.confirmDialog({
        title: '删除整个品牌',
        message: `确定要删除「${brand}」旗下全部 ${branchList.length} 家分店吗？此操作不可恢复。`,
        confirmText: `删除 ${branchList.length} 家`,
        danger: true,
      });
      if (!ok) return;
      for (const r of branchList) await DB.Restaurants.remove(r.id);
      UI.closeSheet();
      UI.toast(`已删除「${brand}」${branchList.length} 家分店`);
      App.notifyDataChanged();
    };
  }

  // 改一次，应用到该品牌所有分店；店名/地址/链接是每家自己的，不碰
  function openEditBrandSheet(brand, branchList) {
    const photoPicker = UI.createPhotoPicker(brandPhotoIds(branchList));
    let selectedRating = sharedField(branchList, 'myRating');
    let selectedCuisine = sharedField(branchList, 'cuisine');
    const selectedScenes = new Set(sharedField(branchList, 'scene', []));
    const price = sharedField(branchList, 'pricePerPerson', null);
    const tags = sharedField(branchList, 'tags', []);
    const notes = sharedField(branchList, 'notes');

    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>编辑「${Utils.escapeHTML(brand)}」</h2><button class="sheet-close">✕</button></div>
      <p class="form-hint" style="margin-bottom:14px;">这里改的内容（含照片）会同时写入 ${branchList.length} 家分店；每家的店名和地址不受影响</p>
      <form id="edit-brand-form">
        <div class="form-field">
          <label>评级</label>
          <div class="chip-select-row" id="eb-rating">
            ${Constants.RATINGS.map((r) => `<span class="chip-select${r === selectedRating ? ' active' : ''}" data-value="${r}">${r}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>菜系</label>
          <div class="chip-select-row" id="eb-cuisine">
            ${Constants.CUISINES.map((c) => `<span class="chip-select${c === selectedCuisine ? ' active' : ''}" data-value="${c}">${c}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>场景</label>
          <div class="chip-select-row" id="eb-scene">
            ${Constants.SCENES.map((s) => `<span class="chip-select${selectedScenes.has(s) ? ' active' : ''}" data-value="${s}">${s}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>人均</label>
          <input type="number" id="eb-price" placeholder="元" min="0" value="${price != null ? price : ''}">
        </div>
        <div class="form-field">
          <label>标签（逗号分隔）</label>
          <input type="text" id="eb-tags" placeholder="深夜营业, 周末排队久" value="${Utils.escapeHTML(tags.join(', '))}">
        </div>
        <div class="form-field">
          <label>备注</label>
          <textarea id="eb-notes" placeholder="全系列都不错">${Utils.escapeHTML(notes)}</textarea>
        </div>
        <div class="form-field">
          <label>照片</label>
          <div id="eb-photos"></div>
        </div>
        <div class="modal-actions" style="margin-top:10px;">
          <button type="button" class="btn btn-ghost" id="eb-cancel">取消</button>
          <button type="submit" class="btn btn-primary">保存到 ${branchList.length} 家</button>
        </div>
      </form>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    sheet.querySelector('#eb-cancel').onclick = UI.closeSheet;
    sheet.querySelector('#eb-photos').appendChild(photoPicker.container);

    const ratingRow = sheet.querySelector('#eb-rating');
    ratingRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      const wasActive = chip.classList.contains('active');
      ratingRow.querySelectorAll('.chip-select').forEach((c) => c.classList.remove('active'));
      selectedRating = wasActive ? '' : chip.dataset.value;
      if (!wasActive) chip.classList.add('active');
    });
    const cuisineRow = sheet.querySelector('#eb-cuisine');
    cuisineRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      const wasActive = chip.classList.contains('active');
      cuisineRow.querySelectorAll('.chip-select').forEach((c) => c.classList.remove('active'));
      selectedCuisine = wasActive ? '' : chip.dataset.value;
      if (!wasActive) chip.classList.add('active');
    });
    const sceneRow = sheet.querySelector('#eb-scene');
    sceneRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      chip.classList.toggle('active');
      if (chip.classList.contains('active')) selectedScenes.add(chip.dataset.value);
      else selectedScenes.delete(chip.dataset.value);
    });

    sheet.querySelector('#edit-brand-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = {
        myRating: selectedRating,
        cuisine: selectedCuisine,
        scene: [...selectedScenes],
        pricePerPerson: sheet.querySelector('#eb-price').value ? Number(sheet.querySelector('#eb-price').value) : null,
        tags: sheet.querySelector('#eb-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
        notes: sheet.querySelector('#eb-notes').value.trim(),
        photos: photoPicker.getIds(), // 写同一份 id 列表给每家分店，照片本身在库里只存一份
      };
      for (const r of branchList) await DB.Restaurants.update(r.id, patch);
      UI.closeSheet();
      UI.toast(`已更新「${brand}」${branchList.length} 家分店`);
      App.notifyDataChanged();
    });
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
                <b>${Utils.escapeHTML(p.name)}</b>${existingNames.has(p.name) ? ' <span class="form-hint">（已存在）</span>' : ''}${!p.location ? ' <span class="form-hint">⚠️ 无坐标</span>' : ''}<br>
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
            // 分店继承母店的连锁共有属性，不然导进来是空壳、每家都要重填一遍
            myRating: r.myRating || '',
            cuisine: r.cuisine || '',
            scene: [...(r.scene || [])],
            pricePerPerson: r.pricePerPerson != null ? r.pricePerPerson : null,
            tags: [...(r.tags || [])],
            name: p.name,
            brand: r.brand,
            status: 'wishlist',
            region: p.city || r.region || '',
            location,
            notes: r.notes || p.address || '',
          });
        }
        // 高德偶尔会返回没有坐标的 POI。以前这里是静悄悄存成 location: null，
        // 等你认可之后才冒出一条「N 家认可餐厅没填坐标」，根本联系不到是这次导入造成的。
        const noCoords = checked.filter((cb) => !pois[Number(cb.dataset.idx)].location).length;

        // 母店自己没地址的话，它的信息已经全部复制到分店上了，留着就是品牌里一条
        // 永远定位不到的重复项，还会一直触发「没填坐标」提醒。
        // 但去过的记录是它独有的，有到访次数就不动——那是真实吃过的凭证。
        const fresh = await DB.Restaurants.get(r.id);
        const dropParent = fresh && !fresh.location && !fresh.visitCount && checked.length > 0;
        if (dropParent) await DB.Restaurants.remove(r.id);

        let msg = `已加入 ${checked.length} 家到想去`;
        if (noCoords) msg += `，其中 ${noCoords} 家高德没给坐标，之后要手动补`;
        if (dropParent) msg += `；没有地址的「${fresh.name}」已清理`;
        UI.toast(msg);
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
            <div class="card-thumb-placeholder">${UI.icon('pin')}</div>
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

  return { init, renderList, openDetail, openBrandDetail, openMissingLocationList };
})();
