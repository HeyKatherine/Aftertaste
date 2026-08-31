// ============ 找店 tab：地图 + 列表 + 帮我选 ============
// 地图具体实现集中在 initMap/renderPins/clearPins 内，日后切换高德底图只需替换这几个函数。
const Find = (() => {
  let map = null;
  let markers = [];
  let userMarker = null;
  let currentLocation = null;
  let viewMode = 'map';
  let rangeMeters = 1000;
  let filterState = {};
  let filterPanelBuilt = false;

  function init() {
    document.getElementById('btn-locate').addEventListener('click', locate);
    document.getElementById('find-view-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      document.querySelectorAll('#find-view-toggle .segmented-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      viewMode = btn.dataset.mode;
      applyViewMode();
    });
    document.getElementById('range-slider').addEventListener('change', (e) => {
      rangeMeters = Number(e.target.value);
      refresh();
    });
    document.getElementById('btn-filter-toggle').addEventListener('click', () => {
      document.getElementById('find-filter-panel').classList.toggle('hidden');
      updateFilterToggle();
    });
    document.getElementById('btn-pick-random').addEventListener('click', () => openPicker());

    document.getElementById('find-address-search').addEventListener('click', runAddressSearch);
    document.getElementById('find-address-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runAddressSearch(); }
    });
  }

  async function runAddressSearch() {
    const input = document.getElementById('find-address-input');
    const keyword = input.value.trim();
    const resultsEl = document.getElementById('find-address-results');
    if (!keyword) { UI.toast('先输入地址'); return; }
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = '<p class="form-hint">搜索中…</p>';
    try {
      const configured = await AMapService.isConfigured();
      if (!configured) {
        resultsEl.innerHTML = `
          <p class="form-hint">还没有配置高德 Key，去设置页填写后才能搜索地址。</p>
          <button type="button" class="btn btn-primary btn-full" id="find-address-goto-settings" style="margin-top:8px;">去设置填写</button>
        `;
        resultsEl.querySelector('#find-address-goto-settings').onclick = () => App.switchView('settings');
        return;
      }
      const pois = await AMapService.searchPOI(keyword);
      if (!pois.length) {
        resultsEl.innerHTML = '<p class="form-hint">没搜到，换个关键词试试。</p>';
        return;
      }
      resultsEl.innerHTML = pois.map((p, i) => `
        <div class="link-row tappable" data-idx="${i}" style="cursor:pointer; align-items:flex-start;">
          <span style="flex:1;">
            <b>${Utils.escapeHTML(p.name)}</b><br>
            <span class="form-hint">${Utils.escapeHTML(p.address || '')}</span>
          </span>
        </div>
      `).join('');
      resultsEl.querySelectorAll('[data-idx]').forEach((row) => {
        row.onclick = () => {
          const p = pois[Number(row.dataset.idx)];
          if (!p.location) { UI.toast('这条结果没有坐标'); return; }
          const wgs84 = Utils.gcj02ToWgs84(p.location.lng, p.location.lat);
          setReferenceLocation(wgs84.lat, wgs84.lng, p.name, '#8B5CF6', '#C4B5FD');
          resultsEl.classList.add('hidden');
          resultsEl.innerHTML = '';
          UI.toast(`已把「${p.name}」设为参考位置`);
        };
      });
    } catch (e) {
      resultsEl.innerHTML = `<p class="form-hint">${Utils.escapeHTML(e.message)}</p>`;
    }
  }

  // 按钮上带箭头方向和生效条件数，不展开也知道现在筛没筛
  function updateFilterToggle() {
    const btn = document.getElementById('btn-filter-toggle');
    const open = !document.getElementById('find-filter-panel').classList.contains('hidden');
    const n = Filters.countActive(filterState);
    btn.textContent = `筛选${n ? ' · ' + n : ''} ${open ? '▴' : '▾'}`;
  }

  function applyViewMode() {
    document.getElementById('find-map').classList.toggle('hidden', viewMode !== 'map');
    document.getElementById('find-list').classList.toggle('hidden', viewMode !== 'list');
    if (viewMode === 'map') setTimeout(() => map && map.invalidateSize(), 50);
  }

  function ensureMap() {
    if (map) return;
    map = L.map('find-map', { zoomControl: true, attributionControl: true }).setView([31.23, 121.47], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    // 点击地图任意位置即可把该点设为参考位置，不依赖 GPS
    map.on('click', (e) => {
      setReferenceLocation(e.latlng.lat, e.latlng.lng, '参考位置', '#8B5CF6', '#C4B5FD');
      UI.toast('已把这里设为参考位置');
    });
    // 图钉弹出的小卡片点一下直接进详情；照片是异步取的，弹窗开出来之后再补上
    map.on('popupopen', async (e) => {
      const card = e.popup.getElement()?.querySelector('.map-popup-card');
      if (!card) return;
      const id = card.dataset.id;
      card.onclick = () => Archive.openDetail(id);
      const r = await DB.Restaurants.get(id);
      if (r && r.photos && r.photos.length) {
        const photo = await DB.Photos.get(r.photos[0]);
        const thumb = card.querySelector('.map-popup-thumb');
        if (photo && thumb) {
          // 不能调用 e.popup.update()：它会用绑定时的原始 HTML 字符串重置 innerHTML，
          // 把刚插入的 <img> 又冲掉、打回占位图标。直接改 DOM 就够了，不需要 Leaflet 重新布局。
          thumb.outerHTML = `<img class="card-thumb map-popup-thumb" src="${URL.createObjectURL(photo.blob)}">`;
        }
      }
    });
  }

  function setReferenceLocation(lat, lng, label, color, fillColor) {
    currentLocation = { lat, lng };
    ensureMap();
    map.setView([lat, lng], 15);
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([lat, lng], {
      radius: 8, color, fillColor, fillOpacity: 0.9, weight: 2,
    }).addTo(map).bindTooltip(label);
    refresh();
  }

  function locate() {
    if (!navigator.geolocation) { UI.toast('设备不支持定位'); return; }
    const btn = document.getElementById('btn-locate');
    btn.disabled = true;
    btn.textContent = '定位中…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.disabled = false;
        btn.innerHTML = `${UI.icon('pin')}已定位`;
        setReferenceLocation(pos.coords.latitude, pos.coords.longitude, '我在这里', '#3B82F6', '#60A5FA');
      },
      (err) => {
        btn.disabled = false;
        btn.innerHTML = `${UI.icon('pin')}获取我的位置`;
        UI.toast('定位失败：' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function getPool() {
    const all = await DB.Restaurants.all();
    // 认可的店和想去的店都要能在地图/列表上找到；想去的店视觉上单独区分，不代表已经去过
    const relevant = all.filter((r) => r.status === 'approved' || r.status === 'wishlist');

    const panel = document.getElementById('find-filter-panel');
    if (!filterPanelBuilt) {
      // 品牌是逛档案时的维度，这里不需要（连锁已经按品牌合并了）。
      // 城市要留着：帮我选可以不设参考位置直接抽，那时范围筛选不生效，
      // 池子是所有城市的店——人在上海却抽到东京那家就没意义了。
      const { getState } = Filters.createPanel(panel, relevant, (state) => {
        filterState = state;
        updateFilterToggle();
        refresh();
      }, {
        groups: ['cuisine', 'scene', 'rating', 'city', 'price'],
        onClose: () => { panel.classList.add('hidden'); updateFilterToggle(); },
      });
      filterPanelBuilt = true;
      filterState = getState();
    }

    let pool = Filters.apply(relevant, filterState);
    pool = pool.map((r) => ({
      ...r,
      _distance: currentLocation && r.location
        ? Utils.haversineDistance(currentLocation.lat, currentLocation.lng, r.location.lat, r.location.lng)
        : null,
    }));
    if (currentLocation && rangeMeters > 0) {
      pool = pool.filter((r) => r._distance == null || r._distance <= rangeMeters);
    }
    return pool;
  }

  async function refresh() {
    ensureMap();
    const pool = await getPool();
    // 图钉不合并：地图本来就是按位置看的，每家分店该各占一个点
    renderPins(pool.filter((r) => r.location));
    await renderList(groupByBrand(pool).sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity)));
  }

  // 列表和抽卡都是"今天去哪家"的决策，同一个牌子按品牌出现一次就够了。
  // 顺带修掉一个公平性问题：不合并的话，有 5 家分店的连锁在抽卡时被抽中的概率是别人的 5 倍。
  function groupByBrand(pool) {
    const groups = new Map();
    const items = [];
    for (const r of pool) {
      if (!r.brand) { items.push(r); continue; }
      if (!groups.has(r.brand)) {
        const entry = { isBrand: true, brand: r.brand, branches: [] };
        groups.set(r.brand, entry);
        items.push(entry);
      }
      groups.get(r.brand).branches.push(r);
    }
    const shared = (branches, key) => {
      for (const b of branches) {
        const v = b[key];
        if (Array.isArray(v) ? v.length : (v !== null && v !== undefined && v !== '')) return v;
      }
      return '';
    };
    return items.map((it) => {
      if (!it.isBrand) return it;
      if (it.branches.length === 1) return it.branches[0]; // 就一家的话没必要包一层
      it.branches.sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity));
      const nearest = it.branches[0];
      it.name = it.brand;
      it._distance = nearest._distance; // 用最近那家的距离代表整个品牌
      it.cuisine = shared(it.branches, 'cuisine');
      it.myRating = shared(it.branches, 'myRating');
      it.notes = shared(it.branches, 'notes');
      it.photos = shared(it.branches, 'photos') || [];
      it.status = it.branches.every((b) => b.status === 'wishlist') ? 'wishlist' : 'approved';
      return it;
    });
  }

  function openEntry(entry) {
    if (entry.isBrand) Archive.openBrandDetail(entry.brand, entry.branches);
    else Archive.openDetail(entry.id);
  }

  const RATING_COLOR = { '必回访': '#F26B57', '不错': '#E0B96B', '一般': '#9FDCC0' };

  function clearPins() {
    markers.forEach((m) => map.removeLayer(m));
    markers = [];
  }

  function renderPins(restaurants) {
    clearPins();
    restaurants.forEach((r) => {
      const isWishlist = r.status === 'wishlist';
      const color = isWishlist ? '#D9A441' : (RATING_COLOR[r.myRating] || '#C9BBB4');
      const marker = L.circleMarker([r.location.lat, r.location.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: isWishlist ? 0.75 : 0.95,
        bubblingMouseEvents: false, // 点图钉不应该同时把这里设成新的参考位置
      }).addTo(map);
      const subtitle = [isWishlist ? '想去' : r.myRating, r._distance != null ? Utils.formatDistance(r._distance) : null]
        .filter(Boolean).map(Utils.escapeHTML).join(' · ');
      // 图片是异步取的，弹窗先用占位图标同步开出来，等 popupopen 时再补上真实照片
      marker.bindPopup(`
        <div class="map-popup-card" data-id="${r.id}">
          <div class="card-thumb-placeholder map-popup-thumb">${UI.icon(isWishlist ? 'bookmark' : 'bowl')}</div>
          <div class="card-title-block">
            <p class="card-title">${Utils.escapeHTML(r.name)}</p>
            ${subtitle ? `<p class="card-subtitle">${subtitle}</p>` : ''}
            ${r.notes ? `<p class="card-note">${Utils.escapeHTML(r.notes)}</p>` : ''}
          </div>
        </div>
      `, { maxWidth: 240 });
      markers.push(marker);
    });
  }

  async function renderList(restaurants) {
    const listEl = document.getElementById('find-list');
    listEl.innerHTML = '';
    if (!restaurants.length) {
      listEl.innerHTML = '<div class="empty-state"><p>这个范围内还没有认可或想去的店</p><p class="empty-sub">试试放宽筛选或范围</p></div>';
      return;
    }
    for (const r of restaurants) {
      const isWishlist = r.status === 'wishlist';
      let thumbHTML = `<div class="card-thumb-placeholder">${UI.icon(isWishlist ? 'bookmark' : 'bowl')}</div>`;
      if (r.photos && r.photos.length) {
        const photo = await DB.Photos.get(r.photos[0]);
        if (photo) thumbHTML = `<img class="card-thumb" src="${URL.createObjectURL(photo.blob)}">`;
      }
      // 连锁店合并成一条，距离显示最近那家的，点进去再挑分店
      const subtitle = [
        r.cuisine,
        r.isBrand ? `${r.branches.length} 家分店` : null,
        r._distance != null ? `最近 ${Utils.formatDistance(r._distance)}` : null,
      ].filter(Boolean).map(Utils.escapeHTML).join(' · ');
      const card = UI.el(`
        <div class="archive-card">
          <div class="card-top-row">
            ${thumbHTML}
            <div class="card-title-block">
              <p class="card-title">${r.isBrand ? UI.icon('tag') : ''}${Utils.escapeHTML(r.name)}</p>
              <p class="card-subtitle">${subtitle}</p>
            </div>
            ${isWishlist ? `<span class="tag">${UI.icon('bookmark')}想去</span>` : (r.myRating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (r.myRating ? `<span class="tag tag-rating">${Utils.escapeHTML(r.myRating)}</span>` : ''))}
          </div>
          ${r.notes ? `<p class="card-note">${Utils.escapeHTML(r.notes)}</p>` : ''}
        </div>
      `);
      card.addEventListener('click', () => openEntry(r));
      listEl.appendChild(card);
    }
  }

  const LOOKAHEAD = 3; // 同时挂在 DOM 里的牌数，够看出"下面还有"就行

  async function openPicker() {
    // 按品牌合并后再抽，否则分店多的连锁会被超额抽到
    const pool = groupByBrand(await getPool());
    if (!pool.length) { UI.toast('当前筛选下没有可选的店'); return; }
    await renderPickerModal(pool);
  }

  async function buildDrawCard(r) {
    let photoStyle = '';
    if (r.photos && r.photos.length) {
      const photo = await DB.Photos.get(r.photos[0]);
      if (photo) photoStyle = ` style="background-image:url(${URL.createObjectURL(photo.blob)})"`;
    }
    const meta = [
      r.cuisine, r.myRating,
      r.isBrand ? `${r.branches.length} 家分店` : null,
      r._distance != null ? `最近 ${Utils.formatDistance(r._distance)}` : null,
    ].filter(Boolean).map(Utils.escapeHTML).join(' · ');
    // 每张给个几度的随机倾斜，像一沓随手摞起来的牌，而不是对齐的方块
    const tilt = (Math.random() * 5 - 2.5).toFixed(2);
    const card = UI.el(`
      <div class="draw-card" style="--tilt:${tilt}deg;">
        <div class="draw-card-inner">
          <div class="draw-card-face">
            <div class="draw-face-photo${photoStyle ? '' : ' is-empty'}"${photoStyle}>${photoStyle ? '' : '🍽️'}</div>
            <div class="draw-face-info">
              <p class="draw-face-name">${r.isBrand ? UI.icon('tag') : ''}${Utils.escapeHTML(r.name)}</p>
              ${meta ? `<p class="draw-face-meta">${meta}</p>` : ''}
            </div>
          </div>
          <div class="draw-card-back">${UI.icon('dice')}</div>
        </div>
      </div>
    `);
    card._entry = r; // 品牌条目没有 id，直接把整条挂在元素上
    return card;
  }

  async function renderPickerModal(pool) {
    let queue = [...pool].sort(() => Math.random() - 0.5);
    let cursor = 0;
    const single = pool.length === 1;

    const box = UI.openModal(`
      <button type="button" class="sheet-close picker-close" id="picker-close" aria-label="关闭">✕</button>
      <h2 class="picker-title">${UI.icon('dice')}帮你选了这家</h2>
      <div class="draw-stack" id="draw-stack"></div>
      <p class="draw-hint" id="draw-hint">${single ? '就这一家了' : '← 左右划走，换下一家 →'}</p>
      <div class="modal-actions" style="margin-top:10px;">
        <button type="button" class="btn btn-ghost btn-full" id="picker-reroll" style="flex:1;">${single ? '重新翻一次' : '换一家'}</button>
      </div>
    `);
    box.classList.add('picker-box');
    const stack = box.querySelector('#draw-stack');

    const topCard = () => stack.querySelector('.draw-card.is-top');

    function relayout() {
      const cards = [...stack.querySelectorAll('.draw-card')];
      // DOM 里靠后的在视觉上更靠上，所以 depth 从后往前数
      cards.forEach((c, i) => {
        const depth = cards.length - 1 - i;
        c.style.setProperty('--depth', depth);
        c.classList.toggle('is-top', depth === 0);
      });
      const top = cards[cards.length - 1];
      if (top && !top.classList.contains('revealed')) {
        top.classList.add('shaking');
        setTimeout(() => {
          top.classList.remove('shaking');
          top.classList.add('revealed');
        }, 320);
      }
    }

    // 池子比 LOOKAHEAD 还小的时候别硬凑，否则会叠出几张一模一样的牌
    const maxStack = Math.min(LOOKAHEAD, pool.length);

    async function fill() {
      while (stack.querySelectorAll('.draw-card').length < maxStack) {
        if (cursor >= queue.length) {
          if (!queue.length) break;
          queue = [...pool].sort(() => Math.random() - 0.5); // 看完一轮就重新洗牌，接着抽
          cursor = 0;
        }
        const card = await buildDrawCard(queue[cursor++]);
        attachCardHandlers(card);
        stack.prepend(card); // 插到最底下
      }
      relayout();
    }

    async function advance() {
      await fill();
    }

    function flyOut(card, dir) {
      card.style.transition = 'transform 0.32s ease-in, opacity 0.32s ease-in';
      card.style.transform = `translateX(${dir * 520}px) rotate(${dir * 20}deg)`;
      card.style.opacity = '0';
      setTimeout(() => { card.remove(); advance(); }, 300);
    }

    function attachCardHandlers(card) {
      let x0 = 0, y0 = 0, dx = 0, dragging = false, locked = false, moved = false;

      card.addEventListener('touchstart', (e) => {
        if (!card.classList.contains('is-top') || e.touches.length !== 1) return;
        dragging = true; locked = false; moved = false; dx = 0;
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
        card.style.transition = 'none';
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        const ddx = e.touches[0].clientX - x0;
        const ddy = e.touches[0].clientY - y0;
        // 方向锁：竖着划是想滚页面，别抢
        if (!locked) {
          if (Math.abs(ddy) > Math.abs(ddx) && Math.abs(ddy) > 8) { dragging = false; return; }
          if (Math.abs(ddx) > 8) locked = true; else return;
        }
        e.preventDefault();
        dx = ddx; moved = true;
        card.style.transform = `translateX(${dx}px) rotate(${(dx / 22).toFixed(2)}deg)`;
        card.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 420));
      }, { passive: false });

      const end = () => {
        if (!dragging) return;
        dragging = false;
        card.style.transition = '';
        if (Math.abs(dx) > 90 && !single) { flyOut(card, dx > 0 ? 1 : -1); return; }
        card.style.transform = ''; card.style.opacity = ''; // 没划够就弹回去
      };
      card.addEventListener('touchend', end);
      card.addEventListener('touchcancel', end);

      card.addEventListener('click', () => {
        if (moved) { moved = false; return; } // 刚划过就别当成点击
        if (!card.classList.contains('revealed')) {
          card.classList.remove('shaking');
          card.classList.add('revealed');
          return;
        }
        UI.closeModal();
        openEntry(card._entry);
      });
    }

    await fill();

    // openModal 本身没有点背景关闭的行为（confirmDialog 要靠按钮 resolve promise，
    // 全局加上会让它的 promise 永远挂着），所以只在抽卡这里补关闭入口
    box.querySelector('#picker-close').onclick = UI.closeModal;
    const backdrop = box.parentElement;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) UI.closeModal();
    });
    box.querySelector('#picker-reroll').onclick = () => {
      const top = topCard();
      if (!top) return;
      if (single) { // 只有一家可选，划走没意义，就重新翻一次
        top.classList.remove('revealed');
        setTimeout(() => top.classList.add('revealed'), 260);
        return;
      }
      flyOut(top, 1);
    };
  }

  return { init, refresh, applyViewMode };
})();
