// ============ 想去 tab：店分区 + 馋分区 ============
const WantGo = (() => {
  function init() {
    document.getElementById('wantgo-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      document.querySelectorAll('#wantgo-toggle .segmented-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const sub = btn.dataset.sub;
      document.getElementById('wantgo-shops').classList.toggle('hidden', sub !== 'shops');
      document.getElementById('wantgo-wishes').classList.toggle('hidden', sub !== 'wishes');
    });

    document.getElementById('shop-quick-add').addEventListener('click', quickAddShop);
    document.getElementById('shop-quick-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') quickAddShop();
    });
    document.getElementById('wish-quick-add').addEventListener('click', quickAddWish);
    document.getElementById('wish-quick-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') quickAddWish();
    });
  }

  async function quickAddShop() {
    const input = document.getElementById('shop-quick-input');
    const name = input.value.trim();
    if (!name) { UI.toast('先填店名'); return; }
    await DB.Restaurants.create({ name, status: 'wishlist' });
    input.value = '';
    UI.toast('已存入想去 🔖');
    App.notifyDataChanged();
  }

  async function quickAddWish() {
    const input = document.getElementById('wish-quick-input');
    const content = input.value.trim();
    if (!content) { UI.toast('先写一句想吃的'); return; }
    await DB.Wishes.create({ content });
    input.value = '';
    UI.toast('已记下 🍜');
    App.notifyDataChanged();
  }

  // ---------- 店分区渲染 ----------
  async function renderShops() {
    const all = await DB.Restaurants.all();
    const shops = all.filter((r) => r.status === 'wishlist').sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    const listEl = document.getElementById('wantgo-shops-list');
    const emptyEl = document.getElementById('wantgo-shops-empty');
    const decayDays = Settings.current.shopDecayDays;
    const decayed = shops.filter((s) => Utils.daysSince(s.addedAt) > decayDays);

    const banner = document.getElementById('shop-decay-banner');
    if (decayed.length) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<span>${decayed.length} 家想去超过 ${decayDays} 天了，还想去吗？</span><button id="shop-batch-clean">批量清理</button>`;
      banner.querySelector('#shop-batch-clean').onclick = () => openBatchCleanShops(decayed);
    } else {
      banner.classList.add('hidden');
    }

    listEl.innerHTML = '';
    emptyEl.classList.toggle('hidden', shops.length > 0);

    for (const shop of shops) {
      const isDecayed = Utils.daysSince(shop.addedAt) > decayDays;
      const card = UI.el(`
        <div class="shop-card ${isDecayed ? 'decayed' : ''}">
          <div class="card-top-row">
            <div class="card-thumb-placeholder">🔖</div>
            <div class="card-title-block">
              <p class="card-title">${Utils.escapeHTML(shop.name)}</p>
              <p class="card-subtitle">${shop.links && shop.links.length ? shop.links.map((l) => Utils.detectLinkSource(l.url).icon).join(' ') : '存入 ' + shop.addedAt}</p>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary btn-approve">认可 ✅</button>
            <button class="btn btn-ghost btn-drop">拔草 ❌</button>
          </div>
        </div>
      `);
      card.querySelector('.btn-approve').onclick = () => openApproveSheet(shop);
      card.querySelector('.btn-drop').onclick = () => dropShop(shop);
      listEl.appendChild(card);
    }
  }

  async function dropShop(shop) {
    const ok = await UI.confirmDialog({
      title: '拔草',
      message: `确定不再考虑「${shop.name}」了吗？此操作会删除该记录。`,
      confirmText: '拔草',
      danger: true,
    });
    if (!ok) return;
    await DB.Restaurants.remove(shop.id);
    UI.toast('已拔草');
    App.notifyDataChanged();
  }

  async function openBatchCleanShops(decayed) {
    const rows = decayed.map((s) => `
      <div class="link-row" data-id="${s.id}">
        <span style="flex:1;">${Utils.escapeHTML(s.name)}</span>
        <button type="button" class="btn btn-ghost btn-small keep-btn">保留</button>
        <button type="button" class="btn btn-danger btn-small drop-btn">拔草</button>
      </div>
    `).join('');
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>批量清理想去</h2><button class="sheet-close">✕</button></div>
      <div class="link-list">${rows}</div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    sheet.querySelectorAll('.keep-btn').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('.link-row');
        const id = row.dataset.id;
        await DB.Restaurants.update(id, { addedAt: Utils.todayISO() });
        row.remove();
        App.notifyDataChanged();
      };
    });
    sheet.querySelectorAll('.drop-btn').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('.link-row');
        const id = row.dataset.id;
        await DB.Restaurants.remove(id);
        row.remove();
        App.notifyDataChanged();
      };
    });
  }

  // ---------- 认可表单（补充资料，全部可跳过） ----------
  function openApproveSheet(shop) {
    RestaurantForm.open({
      initial: shop,
      title: `认可「${shop.name}」`,
      submitLabel: '存入档案',
      onSubmit: async (patch) => {
        await DB.Restaurants.approve(shop.id, patch);
        UI.toast('已存入认可档案 ✅');
        App.notifyDataChanged();
      },
    });
  }

  // ---------- 馋分区渲染 ----------
  async function renderWishes() {
    const all = await DB.Wishes.all();
    const wishes = all.filter((w) => w.status === 'open').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const listEl = document.getElementById('wantgo-wishes-list');
    const emptyEl = document.getElementById('wantgo-wishes-empty');
    const decayDays = Settings.current.wishDecayDays;
    const decayed = wishes.filter((w) => Utils.daysSince(w.createdAt) > decayDays);

    const banner = document.getElementById('wish-decay-banner');
    if (decayed.length) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<span>${decayed.length} 个心愿超过 ${decayDays} 天没动静了</span><button id="wish-batch-clean">批量清理</button>`;
      banner.querySelector('#wish-batch-clean').onclick = () => openBatchCleanWishes(decayed);
    } else {
      banner.classList.add('hidden');
    }

    listEl.innerHTML = '';
    emptyEl.classList.toggle('hidden', wishes.length > 0);

    const restaurants = await DB.Restaurants.all();
    const restMap = new Map(restaurants.map((r) => [r.id, r]));

    for (const wish of wishes) {
      const isDecayed = Utils.daysSince(wish.createdAt) > decayDays;
      const linkedRest = wish.linkedRestaurantId ? restMap.get(wish.linkedRestaurantId) : null;
      let linkedHTML = '';
      if (linkedRest) linkedHTML = `<p class="wish-linked">🔗 关联店铺：${Utils.escapeHTML(linkedRest.name)}</p>`;
      else if (wish.externalLink) linkedHTML = `<p class="wish-linked">${Utils.detectLinkSource(wish.externalLink).icon} 附带外部链接</p>`;

      const card = UI.el(`
        <div class="wish-card ${isDecayed ? 'decayed' : ''}">
          <p class="wish-content">${Utils.escapeHTML(wish.content)}</p>
          ${linkedHTML}
          <div class="card-actions">
            <button class="btn btn-secondary btn-link">🔗 关联</button>
            <button class="btn btn-primary btn-done">吃到了</button>
            <button class="btn btn-ghost btn-dropwish">不想吃了</button>
          </div>
        </div>
      `);
      card.querySelector('.btn-link').onclick = () => openLinkWishSheet(wish);
      card.querySelector('.btn-done').onclick = () => markWishDone(wish);
      card.querySelector('.btn-dropwish').onclick = () => markWishDropped(wish);
      listEl.appendChild(card);
    }
  }

  async function openBatchCleanWishes(decayed) {
    const rows = decayed.map((w) => `
      <div class="link-row" data-id="${w.id}">
        <span style="flex:1;">${Utils.escapeHTML(w.content)}</span>
        <button type="button" class="btn btn-ghost btn-small keep-btn">保留</button>
        <button type="button" class="btn btn-danger btn-small drop-btn">不想了</button>
      </div>
    `).join('');
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>批量清理心愿</h2><button class="sheet-close">✕</button></div>
      <div class="link-list">${rows}</div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    sheet.querySelectorAll('.keep-btn').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('.link-row');
        const id = row.dataset.id;
        await DB.Wishes.update(id, { createdAt: Utils.todayISO() });
        row.remove();
        App.notifyDataChanged();
      };
    });
    sheet.querySelectorAll('.drop-btn').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('.link-row');
        const id = row.dataset.id;
        await DB.Wishes.update(id, { status: 'dropped' });
        row.remove();
        App.notifyDataChanged();
      };
    });
  }

  async function openLinkWishSheet(wish) {
    const restaurants = await DB.Restaurants.all();
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>关联「${Utils.escapeHTML(wish.content)}」</h2><button class="sheet-close">✕</button></div>
      <div class="form-field">
        <label>关联库内店铺</label>
        <input type="text" id="wish-link-search" placeholder="搜索店名">
        <div class="link-list" id="wish-link-results" style="max-height:200px;overflow-y:auto;margin-top:8px;"></div>
      </div>
      <div class="form-field">
        <label>或粘贴外部链接</label>
        <input type="text" id="wish-link-external" placeholder="https://..." value="${Utils.escapeHTML(wish.externalLink || '')}">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="wish-link-clear">清除关联</button>
        <button type="button" class="btn btn-primary" id="wish-link-save">保存</button>
      </div>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    let chosenRestaurantId = wish.linkedRestaurantId || null;
    const resultsEl = sheet.querySelector('#wish-link-results');
    function renderResults(filter) {
      const f = (filter || '').trim().toLowerCase();
      const matches = f ? restaurants.filter((r) => r.name.toLowerCase().includes(f)) : restaurants.slice(0, 8);
      resultsEl.innerHTML = matches.map((r) => `
        <div class="link-row" data-id="${r.id}" style="cursor:pointer;">
          <span style="flex:1;">${r.status === 'approved' ? '✅' : '🔖'} ${Utils.escapeHTML(r.name)}</span>
        </div>
      `).join('') || '<p class="form-hint">没有匹配的店</p>';
      resultsEl.querySelectorAll('.link-row').forEach((row) => {
        row.onclick = () => {
          chosenRestaurantId = row.dataset.id;
          resultsEl.querySelectorAll('.link-row').forEach((r) => r.style.background = '');
          row.style.background = 'var(--coral-light)';
        };
      });
    }
    renderResults('');
    sheet.querySelector('#wish-link-search').addEventListener('input', (e) => renderResults(e.target.value));
    sheet.querySelector('#wish-link-clear').onclick = async () => {
      await DB.Wishes.update(wish.id, { linkedRestaurantId: null, externalLink: null });
      UI.closeSheet();
      App.notifyDataChanged();
    };
    sheet.querySelector('#wish-link-save').onclick = async () => {
      const externalLink = sheet.querySelector('#wish-link-external').value.trim();
      await DB.Wishes.update(wish.id, {
        linkedRestaurantId: chosenRestaurantId,
        externalLink: externalLink || null,
      });
      UI.closeSheet();
      UI.toast('已关联');
      App.notifyDataChanged();
    };
  }

  async function markWishDone(wish) {
    if (wish.externalLink && !wish.linkedRestaurantId) {
      const ok = await UI.confirmDialog({
        title: '吃到了 🎉',
        message: '这个心愿附带了新店链接，要不要把它转入「想去」清单？',
        confirmText: '转入想去',
        cancelText: '仅标记完成',
      });
      if (ok) {
        const src = Utils.detectLinkSource(wish.externalLink);
        const newShop = await DB.Restaurants.create({
          name: wish.content,
          status: 'wishlist',
          links: [{ url: wish.externalLink, source: src.key }],
        });
        await DB.Wishes.update(wish.id, { status: 'done', linkedRestaurantId: newShop.id });
        UI.toast('已转入想去 🔖');
        App.notifyDataChanged();
        return;
      }
    }
    await DB.Wishes.update(wish.id, { status: 'done' });
    UI.toast('馋到了，满足 🎉');
    App.notifyDataChanged();
  }

  async function markWishDropped(wish) {
    await DB.Wishes.update(wish.id, { status: 'dropped' });
    UI.toast('已划掉');
    App.notifyDataChanged();
  }

  return { init, renderShops, renderWishes, openApproveSheet };
})();
