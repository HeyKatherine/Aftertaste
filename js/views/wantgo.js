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

    // 同品牌的多家分店合并成一张可展开的卡片，避免想去列表被同一个连锁刷屏
    const groups = new Map(); // brand -> shops[]
    const singles = [];
    for (const shop of shops) {
      if (shop.brand) {
        if (!groups.has(shop.brand)) groups.set(shop.brand, []);
        groups.get(shop.brand).push(shop);
      } else {
        singles.push(shop);
      }
    }

    const items = []; // { sortKey, el }
    for (const shop of singles) {
      items.push({ sortKey: shop.addedAt || '', el: await buildShopCard(shop, decayDays) });
    }
    for (const [brand, branchShops] of groups) {
      if (branchShops.length === 1) {
        items.push({ sortKey: branchShops[0].addedAt || '', el: await buildShopCard(branchShops[0], decayDays) });
      } else {
        const latestAdded = branchShops.reduce((max, s) => (s.addedAt || '') > max ? (s.addedAt || '') : max, '');
        items.push({ sortKey: latestAdded, el: await buildShopGroupCard(brand, branchShops, decayDays) });
      }
    }
    items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    items.forEach((item) => listEl.appendChild(item.el));
  }

  async function buildShopCard(shop, decayDays) {
    const isDecayed = Utils.daysSince(shop.addedAt) > decayDays;
    let thumbHTML = '<div class="card-thumb-placeholder">🔖</div>';
    if (shop.photos && shop.photos.length) {
      const photo = await DB.Photos.get(shop.photos[0]);
      if (photo) thumbHTML = `<img class="card-thumb" src="${URL.createObjectURL(photo.blob)}">`;
    }
    // 有菜系/品牌/地区就优先显示这些（跟认可档案卡片对齐），都没填就退回链接图标或存入日期
    const infoParts = [shop.brand ? '🏷️ ' + shop.brand : null, shop.cuisine, shop.region].filter(Boolean);
    const subtitle = infoParts.length
      ? infoParts.map(Utils.escapeHTML).join(' · ')
      : (shop.links && shop.links.length ? shop.links.map((l) => Utils.detectLinkSource(l.url).icon).join(' ') : '存入 ' + shop.addedAt);
    const card = UI.el(`
      <div class="shop-card ${isDecayed ? 'decayed' : ''}">
        <div class="card-top-row">
          ${thumbHTML}
          <div class="card-title-block">
            <p class="card-title">${Utils.escapeHTML(shop.name)}</p>
            <p class="card-subtitle">${subtitle}</p>
          </div>
          ${shop.myRating === '必回访' ? '<span class="tag tag-must">必回访</span>' : (shop.myRating ? `<span class="tag tag-rating">${Utils.escapeHTML(shop.myRating)}</span>` : '')}
        </div>
        ${shop.notes ? `<p class="card-note">${Utils.escapeHTML(shop.notes)}</p>` : ''}
        <div class="card-actions">
          <button class="btn btn-primary btn-approve">认可 ✅</button>
          <button class="btn btn-ghost btn-edit">编辑</button>
          <button class="btn btn-ghost btn-drop">拔草 ❌</button>
        </div>
      </div>
    `);
    card.querySelector('.btn-approve').onclick = () => openApproveSheet(shop);
    card.querySelector('.btn-edit').onclick = () => openEditShopSheet(shop);
    card.querySelector('.btn-drop').onclick = () => dropShop(shop);
    return card;
  }

  // ---------- 编辑想去里的店（补充地址/链接等资料，不改变「未认可」状态） ----------
  function openEditShopSheet(shop) {
    RestaurantForm.open({
      initial: shop,
      title: '编辑店铺信息',
      submitLabel: '保存',
      onSubmit: async (patch) => {
        await DB.Restaurants.update(shop.id, patch);
        UI.toast('已保存');
        App.notifyDataChanged();
      },
    });
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

  async function buildShopGroupCard(brand, branchShops, decayDays) {
    const thumbHTML = await pickGroupThumbHTML(branchShops, '🏷️');
    const group = UI.el(`
      <details class="shop-card shop-group">
        <summary class="card-top-row">
          ${thumbHTML}
          <div class="card-title-block">
            <p class="card-title">${Utils.escapeHTML(brand)}</p>
            <p class="card-subtitle">${branchShops.length} 家分店 · 点开选择</p>
          </div>
          <button type="button" class="btn btn-primary btn-small btn-approve-all">认可全部</button>
        </summary>
        <div class="shop-group-branches"></div>
      </details>
    `);
    group.querySelector('.btn-approve-all').onclick = (e) => {
      e.preventDefault(); // 避免顺带触发 <details> 展开/收起
      e.stopPropagation();
      openApproveBrandSheet(brand, branchShops);
    };
    const branchContainer = group.querySelector('.shop-group-branches');
    const sortedBranches = branchShops.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    for (const shop of sortedBranches) {
      branchContainer.appendChild(await buildShopCard(shop, decayDays));
    }
    return group;
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

  // ---------- 连锁店批量认可：评级/菜系/场景/人均/标签/备注应用到该品牌下所有分店，
  // 每家分店各自的店名/坐标/链接不受影响 ----------
  function openApproveBrandSheet(brand, branchShops) {
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>认可「${Utils.escapeHTML(brand)}」全部 ${branchShops.length} 家</h2><button class="sheet-close">✕</button></div>
      <p class="form-hint" style="margin-bottom:14px;">下面填的评级/菜系/场景/备注会应用到这 ${branchShops.length} 家分店；每家分店各自的地址、链接不受影响，之后仍可单独编辑</p>
      <form id="approve-brand-form">
        <div class="form-field">
          <label>评级</label>
          <div class="chip-select-row" id="ab-rating">
            ${Constants.RATINGS.map((r) => `<span class="chip-select" data-value="${r}">${r}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>菜系</label>
          <div class="chip-select-row" id="ab-cuisine">
            ${Constants.CUISINES.map((c) => `<span class="chip-select" data-value="${c}">${c}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>场景</label>
          <div class="chip-select-row" id="ab-scene">
            ${Constants.SCENES.map((s) => `<span class="chip-select" data-value="${s}">${s}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>人均</label>
          <input type="number" id="ab-price" placeholder="元" min="0">
        </div>
        <div class="form-field">
          <label>标签（逗号分隔）</label>
          <input type="text" id="ab-tags" placeholder="深夜营业, 周末排队久">
        </div>
        <div class="form-field">
          <label>备注</label>
          <textarea id="ab-notes" placeholder="全系列都不错"></textarea>
        </div>
        <div class="modal-actions" style="margin-top:10px;">
          <button type="button" class="btn btn-ghost" id="ab-cancel">取消</button>
          <button type="submit" class="btn btn-primary">认可全部 ${branchShops.length} 家</button>
        </div>
      </form>
    `);
    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    sheet.querySelector('#ab-cancel').onclick = UI.closeSheet;

    let selectedRating = '';
    let selectedCuisine = '';
    const selectedScenes = new Set();
    const ratingRow = sheet.querySelector('#ab-rating');
    ratingRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      ratingRow.querySelectorAll('.chip-select').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedRating = chip.dataset.value;
    });
    const cuisineRow = sheet.querySelector('#ab-cuisine');
    cuisineRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      const wasActive = chip.classList.contains('active');
      cuisineRow.querySelectorAll('.chip-select').forEach((c) => c.classList.remove('active'));
      selectedCuisine = wasActive ? '' : chip.dataset.value;
      if (!wasActive) chip.classList.add('active');
    });
    const sceneRow = sheet.querySelector('#ab-scene');
    sceneRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      chip.classList.toggle('active');
      if (chip.classList.contains('active')) selectedScenes.add(chip.dataset.value);
      else selectedScenes.delete(chip.dataset.value);
    });

    sheet.querySelector('#approve-brand-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tags = sheet.querySelector('#ab-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
      const patch = {
        status: 'approved',
        myRating: selectedRating,
        cuisine: selectedCuisine,
        scene: [...selectedScenes],
        pricePerPerson: sheet.querySelector('#ab-price').value ? Number(sheet.querySelector('#ab-price').value) : null,
        tags,
        notes: sheet.querySelector('#ab-notes').value.trim(),
      };
      for (const shop of branchShops) {
        await DB.Restaurants.approve(shop.id, patch);
      }
      UI.closeSheet();
      UI.toast(`已认可 ${branchShops.length} 家 ✅`);
      App.notifyDataChanged();
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
      const externalLink = Utils.normalizeUrl(sheet.querySelector('#wish-link-external').value);
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
