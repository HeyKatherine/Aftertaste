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
  }

  function applyViewMode() {
    document.getElementById('find-map').classList.toggle('hidden', viewMode !== 'map');
    document.getElementById('pin-card-container').classList.toggle('hidden', viewMode !== 'map');
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
  }

  function locate() {
    if (!navigator.geolocation) { UI.toast('设备不支持定位'); return; }
    const btn = document.getElementById('btn-locate');
    btn.disabled = true;
    btn.textContent = '定位中…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        btn.disabled = false;
        btn.textContent = '📍 已定位';
        ensureMap();
        map.setView([currentLocation.lat, currentLocation.lng], 15);
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([currentLocation.lat, currentLocation.lng], {
          radius: 8, color: '#3B82F6', fillColor: '#60A5FA', fillOpacity: 0.9, weight: 2,
        }).addTo(map).bindTooltip('我在这里');
        refresh();
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
    const approved = all.filter((r) => r.status === 'approved');

    const panel = document.getElementById('find-filter-panel');
    if (!filterPanelBuilt) {
      const { getState } = Filters.createPanel(panel, approved, (state) => {
        filterState = state;
        refresh();
      });
      filterPanelBuilt = true;
      filterState = getState();
    }

    let pool = Filters.apply(approved, filterState);
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
    await renderPinCards(pool.filter((r) => r.location).sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity)));
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
      const color = RATING_COLOR[r.myRating] || '#C9BBB4';
      const marker = L.circleMarker([r.location.lat, r.location.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95,
      }).addTo(map);
      marker.bindTooltip(r.name, { direction: 'top' });
      marker.on('click', () => {
        const card = document.getElementById(`pin-card-${r.id}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
      markers.push(marker);
    });
  }

  async function renderPinCards(restaurants) {
    const container = document.getElementById('pin-card-container');
    container.innerHTML = '';
    for (const r of restaurants) {
      const card = await buildPinCard(r);
      card.id = `pin-card-${r.id}`;
      container.appendChild(card);
    }
  }

  async function buildPinCard(r) {
    let thumbHTML = '<div class="card-thumb-placeholder">🍽️</div>';
    if (r.photos && r.photos.length) {
      const photo = await DB.Photos.get(r.photos[0]);
      if (photo) thumbHTML = `<img class="card-thumb" src="${URL.createObjectURL(photo.blob)}">`;
    }
    const card = UI.el(`
      <div class="pin-card">
        ${thumbHTML}
        <div class="card-title-block">
          <p class="card-title">${Utils.escapeHTML(r.name)}</p>
          <p class="card-subtitle">${[r.myRating, r._distance != null ? Utils.formatDistance(r._distance) : null].filter(Boolean).map(Utils.escapeHTML).join(' · ')}</p>
          ${r.notes ? `<p class="card-note">${Utils.escapeHTML(r.notes)}</p>` : ''}
        </div>
      </div>
    `);
    card.addEventListener('click', () => Archive.openDetail(r.id));
    return card;
  }

  async function renderList(restaurants) {
    const listEl = document.getElementById('find-list');
    listEl.innerHTML = '';
    if (!restaurants.length) {
      listEl.innerHTML = '<div class="empty-state"><p>这个范围内还没有认可的店</p><p class="empty-sub">试试放宽筛选或范围</p></div>';
      return;
    }
    for (const r of restaurants) {
      let thumbHTML = '<div class="card-thumb-placeholder">🍽️</div>';
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
            ${r.myRating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (r.myRating ? `<span class="tag tag-rating">${Utils.escapeHTML(r.myRating)}</span>` : '')}
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
