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
        <div class="link-row" data-idx="${i}" style="cursor:pointer; align-items:flex-start;">
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
        btn.textContent = '📍 已定位';
        setReferenceLocation(pos.coords.latitude, pos.coords.longitude, '我在这里', '#3B82F6', '#60A5FA');
      },
      (err) => {
        btn.disabled = false;
        btn.textContent = '📍 获取我的位置';
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
      const { getState } = Filters.createPanel(panel, relevant, (state) => {
        filterState = state;
        refresh();
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
    await Reminders.render(document.getElementById('reminder-stack'));
    const pool = await getPool();
    renderPins(pool.filter((r) => r.location));
    await renderList(pool.sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity)));
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
      const subtitle = [isWishlist ? '🔖 想去' : r.myRating, r._distance != null ? Utils.formatDistance(r._distance) : null]
        .filter(Boolean).map(Utils.escapeHTML).join(' · ');
      // 图片是异步取的，弹窗先用占位图标同步开出来，等 popupopen 时再补上真实照片
      marker.bindPopup(`
        <div class="map-popup-card" data-id="${r.id}">
          <div class="card-thumb-placeholder map-popup-thumb">${isWishlist ? '🔖' : '🍽️'}</div>
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
      let thumbHTML = `<div class="card-thumb-placeholder">${isWishlist ? '🔖' : '🍽️'}</div>`;
      if (r.photos && r.photos.length) {
        const photo = await DB.Photos.get(r.photos[0]);
        if (photo) thumbHTML = `<img class="card-thumb" src="${URL.createObjectURL(photo.blob)}">`;
      }
      const card = UI.el(`
        <div class="archive-card">
          <div class="card-top-row">
            ${thumbHTML}
            <div class="card-title-block">
              <p class="card-title">${Utils.escapeHTML(r.name)}</p>
              <p class="card-subtitle">${[r.cuisine, r._distance != null ? Utils.formatDistance(r._distance) : null].filter(Boolean).map(Utils.escapeHTML).join(' · ')}</p>
            </div>
            ${isWishlist ? '<span class="tag">🔖 想去</span>' : (r.myRating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (r.myRating ? `<span class="tag tag-rating">${Utils.escapeHTML(r.myRating)}</span>` : ''))}
          </div>
          ${r.notes ? `<p class="card-note">${Utils.escapeHTML(r.notes)}</p>` : ''}
        </div>
      `);
      card.addEventListener('click', () => Archive.openDetail(r.id));
      listEl.appendChild(card);
    }
  }

  function pickRandomN(pool, n) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  async function openPicker() {
    const pool = await getPool();
    if (!pool.length) { UI.toast('当前筛选下没有可选的店'); return; }
    await renderPickerModal(pool, 1);
  }

  async function renderPickerModal(pool, n) {
    const picks = pickRandomN(pool, Math.min(n, pool.length));
    const cardsHTML = await Promise.all(picks.map(async (r) => {
      let thumbHTML = '<div class="card-thumb-placeholder">🍽️</div>';
      if (r.photos && r.photos.length) {
        const photo = await DB.Photos.get(r.photos[0]);
        if (photo) thumbHTML = `<img class="card-thumb" src="${URL.createObjectURL(photo.blob)}">`;
      }
      return `
        <div class="shop-card" data-id="${r.id}" style="cursor:pointer;">
          <div class="card-top-row">
            ${thumbHTML}
            <div class="card-title-block">
              <p class="card-title">${Utils.escapeHTML(r.name)}</p>
              <p class="card-subtitle">${[r.cuisine, r.myRating].filter(Boolean).map(Utils.escapeHTML).join(' · ')}</p>
            </div>
          </div>
        </div>
      `;
    }));
    const box = UI.openModal(`
      <h2 style="font-size:18px;font-weight:800;margin-bottom:14px;text-align:center;">🎲 帮你选了这家</h2>
      <div class="card-list" id="picker-results">${cardsHTML.join('')}</div>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" class="btn btn-ghost" id="picker-reroll">再抽一次</button>
        <button type="button" class="btn btn-secondary" id="picker-three">抽3家二选一</button>
      </div>
    `);
    box.querySelectorAll('#picker-results [data-id]').forEach((el) => {
      el.onclick = () => {
        UI.closeModal();
        Archive.openDetail(el.dataset.id);
      };
    });
    box.querySelector('#picker-reroll').onclick = () => renderPickerModal(pool, n);
    box.querySelector('#picker-three').onclick = () => renderPickerModal(pool, 3);
  }

  return { init, refresh, applyViewMode };
})();
