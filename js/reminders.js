// ============ 统一提醒系统：回味 / 想去防腐 / 心愿防腐 ============
const Reminders = (() => {
  const MUTED_KEY = 'mutedReminders';
  const sessionIgnored = new Set();

  async function getMuted() {
    return await DB.Meta.getValue(MUTED_KEY, []);
  }
  async function mute(key) {
    const muted = await getMuted();
    if (!muted.includes(key)) muted.push(key);
    await DB.Meta.setValue(MUTED_KEY, muted);
  }
  async function unmute(key) {
    const muted = await getMuted();
    await DB.Meta.setValue(MUTED_KEY, muted.filter((k) => k !== key));
  }

  async function computeAll() {
    const [restaurants, wishes, muted] = await Promise.all([DB.Restaurants.all(), DB.Wishes.all(), getMuted()]);
    const items = [];

    const approved = restaurants.filter((r) => r.status === 'approved');
    for (const r of approved) {
      const key = `revisit:${r.id}`;
      if (muted.includes(key) || sessionIgnored.has(key)) continue;
      const refDate = r.lastVisitAt || r.addedAt;
      const days = Utils.daysSince(refDate);
      if (days > Settings.current.revisitDays) {
        items.push({
          key, type: 'revisit', restaurantId: r.id,
          text: `${r.name} ${Utils.formatMonthsAgo(refDate)}没去了，回味一下？`,
          action: () => Archive.openDetail(r.id),
        });
      }
    }

    const shops = restaurants.filter((r) => r.status === 'wishlist');
    const decayedShops = shops.filter((s) => Utils.daysSince(s.addedAt) > Settings.current.shopDecayDays);
    if (decayedShops.length) {
      const key = 'shopDecay:agg';
      if (!muted.includes(key) && !sessionIgnored.has(key)) {
        items.push({
          key, type: 'shopDecay',
          text: `${decayedShops.length} 家想去超过 ${Settings.current.shopDecayDays} 天了，还想去吗？`,
          action: () => App.switchView('wantgo', 'shops'),
        });
      }
    }

    const openWishes = wishes.filter((w) => w.status === 'open');
    const decayedWishes = openWishes.filter((w) => Utils.daysSince(w.createdAt) > Settings.current.wishDecayDays);
    if (decayedWishes.length) {
      const key = 'wishDecay:agg';
      if (!muted.includes(key) && !sessionIgnored.has(key)) {
        items.push({
          key, type: 'wishDecay',
          text: `${decayedWishes.length} 个心愿超过 ${Settings.current.wishDecayDays} 天没动静了`,
          action: () => App.switchView('wantgo', 'wishes'),
        });
      }
    }

    const missingLocation = approved.filter((r) => !r.location);
    if (missingLocation.length) {
      const key = 'missingLocation:agg';
      if (!muted.includes(key) && !sessionIgnored.has(key)) {
        items.push({
          key, type: 'missingLocation',
          text: `${missingLocation.length} 家认可餐厅没填坐标，地图上看不到`,
          action: () => Archive.openMissingLocationList(),
        });
      }
    }

    return items;
  }

  async function render(container) {
    const items = await computeAll();
    container.innerHTML = '';
    for (const item of items) {
      const card = UI.el(`
        <div class="reminder-card">
          <span class="reminder-text">${Utils.escapeHTML(item.text)}</span>
          <div class="reminder-actions">
            <button data-act="ignore">忽略</button>
            <button data-act="mute">不再提醒</button>
          </div>
        </div>
      `);
      card.querySelector('.reminder-text').onclick = item.action;
      card.querySelector('[data-act="ignore"]').onclick = (e) => {
        e.stopPropagation();
        sessionIgnored.add(item.key);
        card.remove();
      };
      card.querySelector('[data-act="mute"]').onclick = async (e) => {
        e.stopPropagation();
        await mute(item.key);
        card.remove();
      };
      container.appendChild(card);
    }
  }

  async function describeKey(key) {
    const [type, id] = key.split(':');
    if (type === 'revisit') {
      const r = await DB.Restaurants.get(id);
      return r ? `回味提醒 · ${r.name}` : '回味提醒 · 已删除的餐厅';
    }
    if (type === 'shopDecay') return '想去防腐提醒';
    if (type === 'wishDecay') return '心愿防腐提醒';
    if (type === 'missingLocation') return '缺坐标提醒';
    return key;
  }

  return { computeAll, render, getMuted, mute, unmute, describeKey };
})();
