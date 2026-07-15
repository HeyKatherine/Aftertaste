// ============ 共享筛选器（菜系 / 场景 / 人均 / 评级 / 城市） ============
const Filters = (() => {
  function createPanel(container, restaurants, onChange) {
    const cuisines = [...new Set(restaurants.map((r) => r.cuisine).filter(Boolean))];
    const cities = [...new Set(restaurants.map((r) => r.region).filter(Boolean))];
    const brands = [...new Set(restaurants.map((r) => r.brand).filter(Boolean))];

    const state = { cuisine: null, scene: null, rating: null, city: null, brand: null, priceMin: '', priceMax: '' };

    container.innerHTML = `
      ${brands.length ? `
      <div class="filter-group">
        <label>品牌</label>
        <div class="filter-chip-row" data-key="brand">
          ${brands.map((b) => `<span class="filter-chip" data-value="${Utils.escapeHTML(b)}">${Utils.escapeHTML(b)}</span>`).join('')}
        </div>
      </div>` : ''}
      ${cuisines.length ? `
      <div class="filter-group">
        <label>菜系</label>
        <div class="filter-chip-row" data-key="cuisine">
          ${cuisines.map((c) => `<span class="filter-chip" data-value="${Utils.escapeHTML(c)}">${Utils.escapeHTML(c)}</span>`).join('')}
        </div>
      </div>` : ''}
      <div class="filter-group">
        <label>场景</label>
        <div class="filter-chip-row" data-key="scene">
          ${Constants.SCENES.map((s) => `<span class="filter-chip" data-value="${s}">${s}</span>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label>评级</label>
        <div class="filter-chip-row" data-key="rating">
          ${Constants.RATINGS.map((r) => `<span class="filter-chip" data-value="${r}">${r}</span>`).join('')}
        </div>
      </div>
      ${cities.length ? `
      <div class="filter-group">
        <label>城市</label>
        <div class="filter-chip-row" data-key="city">
          ${cities.map((c) => `<span class="filter-chip" data-value="${Utils.escapeHTML(c)}">${Utils.escapeHTML(c)}</span>`).join('')}
        </div>
      </div>` : ''}
      <div class="filter-group">
        <label>人均区间</label>
        <div class="form-field-inline">
          <input type="number" id="filter-price-min" placeholder="最低" min="0" style="flex:1;">
          <span>—</span>
          <input type="number" id="filter-price-max" placeholder="最高" min="0" style="flex:1;">
        </div>
      </div>
      <div class="filter-panel-actions">
        <button type="button" class="btn btn-ghost" id="filter-reset">清空筛选</button>
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
    const priceMin = container.querySelector('#filter-price-min');
    const priceMax = container.querySelector('#filter-price-max');
    priceMin.addEventListener('input', () => { state.priceMin = priceMin.value; onChange(state); });
    priceMax.addEventListener('input', () => { state.priceMax = priceMax.value; onChange(state); });
    container.querySelector('#filter-reset').addEventListener('click', () => {
      Object.assign(state, { cuisine: null, scene: null, rating: null, city: null, brand: null, priceMin: '', priceMax: '' });
      container.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      priceMin.value = ''; priceMax.value = '';
      onChange(state);
    });

    return { getState: () => state };
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

  return { createPanel, apply };
})();
