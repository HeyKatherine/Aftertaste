// ============ 共享筛选器（菜系 / 场景 / 人均 / 评级 / 城市） ============
const Filters = (() => {
  // options.groups 决定显示哪几组筛选。找店是「离我多远」的场景，
  // 城市已经被范围隐含了，品牌也不是那个场景该有的维度，所以那边只留菜系/场景/评级/人均。
  function createPanel(container, restaurants, onChange, options = {}) {
    const groups = options.groups || ['brand', 'cuisine', 'scene', 'rating', 'city', 'price'];
    const show = (g) => groups.includes(g);
    const cities = [...new Set(restaurants.map((r) => r.region).filter(Boolean))];
    const brands = [...new Set(restaurants.map((r) => r.brand).filter(Boolean))];

    const state = { cuisine: null, scene: null, rating: null, city: null, brand: null, priceMin: '', priceMax: '' };

    container.innerHTML = `
      ${show('brand') && brands.length ? `
      <div class="filter-group">
        <label>品牌</label>
        <div class="filter-chip-row" data-key="brand">
          ${brands.map((b) => `<span class="filter-chip" data-value="${Utils.escapeHTML(b)}">${Utils.escapeHTML(b)}</span>`).join('')}
        </div>
      </div>` : ''}
      ${show('cuisine') ? `
      <div class="filter-group">
        <label>菜系</label>
        <div class="filter-chip-row" data-key="cuisine">
          ${Constants.CUISINES.map((c) => `<span class="filter-chip" data-value="${c}">${c}</span>`).join('')}
        </div>
      </div>` : ''}
      ${show('scene') ? `
      <div class="filter-group">
        <label>场景</label>
        <div class="filter-chip-row" data-key="scene">
          ${Constants.SCENES.map((s) => `<span class="filter-chip" data-value="${s}">${s}</span>`).join('')}
        </div>
      </div>` : ''}
      ${show('rating') ? `
      <div class="filter-group">
        <label>评级</label>
        <div class="filter-chip-row" data-key="rating">
          ${Constants.RATINGS.map((r) => `<span class="filter-chip" data-value="${r}">${r}</span>`).join('')}
        </div>
      </div>` : ''}
      ${show('city') && cities.length ? `
      <div class="filter-group">
        <label>城市</label>
        <div class="filter-chip-row" data-key="city">
          ${cities.map((c) => `<span class="filter-chip" data-value="${Utils.escapeHTML(c)}">${Utils.escapeHTML(c)}</span>`).join('')}
        </div>
      </div>` : ''}
      ${show('price') ? `
      <div class="filter-group">
        <label>人均区间</label>
        <div class="form-field-inline">
          <input type="number" id="filter-price-min" placeholder="最低" min="0" style="flex:1;">
          <span>—</span>
          <input type="number" id="filter-price-max" placeholder="最高" min="0" style="flex:1;">
        </div>
      </div>` : ''}
      <div class="filter-panel-actions">
        <button type="button" class="btn btn-ghost" id="filter-reset">清空筛选</button>
        ${options.onClose ? '<button type="button" class="btn btn-secondary" id="filter-collapse">收起 ▴</button>' : ''}
      </div>
    `;

    container.querySelectorAll('.filter-chip-row').forEach((row) => {
      const key = row.dataset.key;
      row.addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        const active = chip.classList.contains('active');
        row.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
        if (!active) {
          chip.classList.add('active');
          state[key] = chip.dataset.value;
        } else {
          state[key] = null;
        }
        onChange(state);
      });
    });
    // 人均那组可能被 groups 关掉了，取不到就跳过
    const priceMin = container.querySelector('#filter-price-min');
    const priceMax = container.querySelector('#filter-price-max');
    if (priceMin && priceMax) {
      priceMin.addEventListener('input', () => { state.priceMin = priceMin.value; onChange(state); });
      priceMax.addEventListener('input', () => { state.priceMax = priceMax.value; onChange(state); });
    }
    container.querySelector('#filter-reset').addEventListener('click', () => {
      Object.assign(state, { cuisine: null, scene: null, rating: null, city: null, brand: null, priceMin: '', priceMax: '' });
      container.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      if (priceMin) priceMin.value = '';
      if (priceMax) priceMax.value = '';
      onChange(state);
    });
    // 面板展开后很长，底部给个收起入口，不用再滑回顶上去点「筛选」
    const collapseBtn = container.querySelector('#filter-collapse');
    if (collapseBtn) collapseBtn.addEventListener('click', () => options.onClose());

    return { getState: () => state };
  }

  // 用来在「筛选」按钮上显示当前生效了几个条件，不展开也能看出来
  function countActive(state) {
    if (!state) return 0;
    let n = ['brand', 'cuisine', 'scene', 'rating', 'city'].filter((k) => state[k]).length;
    if (state.priceMin || state.priceMax) n += 1;
    return n;
  }

  function apply(restaurants, state) {
    return restaurants.filter((r) => {
      if (state.brand && r.brand !== state.brand) return false;
      if (state.cuisine && r.cuisine !== state.cuisine) return false;
      if (state.scene && !(r.scene || []).includes(state.scene)) return false;
      if (state.rating && r.myRating !== state.rating) return false;
      if (state.city && r.region !== state.city) return false;
      if (state.priceMin && (r.pricePerPerson == null || r.pricePerPerson < Number(state.priceMin))) return false;
      if (state.priceMax && (r.pricePerPerson == null || r.pricePerPerson > Number(state.priceMax))) return false;
      return true;
    });
  }

  return { createPanel, apply, countActive };
})();
