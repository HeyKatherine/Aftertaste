// ============ 设置 tab：备份 / 统计 / 提醒天数 ============
const Settings = (() => {
  const current = {
    revisitDays: Constants.DEFAULT_REVISIT_DAYS,
    shopDecayDays: Constants.DEFAULT_SHOP_DECAY_DAYS,
    wishDecayDays: Constants.DEFAULT_WISH_DECAY_DAYS,
  };

  async function load() {
    const saved = await DB.Meta.getValue('reminderSettings', null);
    if (saved) Object.assign(current, saved);
    document.getElementById('setting-revisit-days').value = current.revisitDays;
    document.getElementById('setting-shop-decay-days').value = current.shopDecayDays;
    document.getElementById('setting-wish-decay-days').value = current.wishDecayDays;
    await loadAmapConfig();
  }

  async function loadAmapConfig() {
    const { key, securityCode } = await AMapService.getConfig();
    document.getElementById('setting-amap-key').value = key;
    document.getElementById('setting-amap-security').value = securityCode;
    updateAmapStatus(!!key);
  }

  function updateAmapStatus(configured) {
    document.getElementById('amap-status').textContent = configured ? '✅ 已配置' : '尚未配置';
  }

  function init() {
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-export-text').addEventListener('click', () => doExport(false));
    document.getElementById('btn-export-full').addEventListener('click', () => doExport(true));
    document.getElementById('input-import-file').addEventListener('change', handleImportFile);
    document.getElementById('btn-save-amap').addEventListener('click', saveAmapConfig);
  }

  async function saveAmapConfig() {
    const key = document.getElementById('setting-amap-key').value.trim();
    const securityCode = document.getElementById('setting-amap-security').value.trim();
    await AMapService.saveConfig(key, securityCode);
    updateAmapStatus(!!key);
    UI.toast(key ? '已保存，刷新页面后生效' : '已清空高德配置');
  }

  async function saveSettings() {
    current.revisitDays = Number(document.getElementById('setting-revisit-days').value) || Constants.DEFAULT_REVISIT_DAYS;
    current.shopDecayDays = Number(document.getElementById('setting-shop-decay-days').value) || Constants.DEFAULT_SHOP_DECAY_DAYS;
    current.wishDecayDays = Number(document.getElementById('setting-wish-decay-days').value) || Constants.DEFAULT_WISH_DECAY_DAYS;
    await DB.Meta.setValue('reminderSettings', { ...current });
    UI.toast('设置已保存');
    App.notifyDataChanged();
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function doExport(includePhotos) {
    UI.toast(includePhotos ? '正在打包图片…' : '正在导出…');
    const data = await DB.exportData({ includePhotos });
    const stamp = Utils.todayISO();
    downloadJSON(data, includePhotos ? `餐厅档案-完整备份-${stamp}.json` : `餐厅档案-文字备份-${stamp}.json`);
    await DB.Meta.setValue('lastBackupAt', Date.now());
    UI.toast('导出完成');
    renderStats();
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let payload;
      try {
        payload = JSON.parse(reader.result);
      } catch (err) {
        UI.toast('文件格式不正确');
        return;
      }
      confirmImport(payload);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function confirmImport(payload) {
    const box = UI.openModal(`
      <h2 style="font-size:18px;font-weight:800;margin-bottom:10px;">导入预览</h2>
      <p class="modal-msg">
        餐厅 ${payload.restaurants ? payload.restaurants.length : 0} 家<br>
        心愿 ${payload.wishes ? payload.wishes.length : 0} 个<br>
        照片 ${payload.photos ? payload.photos.length : 0} 张
      </p>
      <div class="form-field">
        <label>导入方式</label>
        <div class="chip-select-row">
          <span class="chip-select active" data-mode="merge">合并（保留现有数据）</span>
          <span class="chip-select" data-mode="overwrite">覆盖（清空后导入）</span>
        </div>
      </div>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" class="btn btn-ghost" id="import-cancel">取消</button>
        <button type="button" class="btn btn-primary" id="import-confirm">导入</button>
      </div>
    `);
    let mode = 'merge';
    box.querySelectorAll('.chip-select').forEach((chip) => {
      chip.onclick = () => {
        box.querySelectorAll('.chip-select').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        mode = chip.dataset.mode;
      };
    });
    box.querySelector('#import-cancel').onclick = UI.closeModal;
    box.querySelector('#import-confirm').onclick = async () => {
      try {
        const result = await DB.importData(payload, { mode });
        UI.closeModal();
        UI.toast(`导入完成：${result.restaurantCount} 家餐厅，${result.wishCount} 个心愿`);
        App.notifyDataChanged();
      } catch (err) {
        UI.toast('导入失败：' + err.message);
      }
    };
  }

  async function renderStats() {
    const [restaurants, wishes, photos, lastBackupAt] = await Promise.all([
      DB.Restaurants.all(),
      DB.Wishes.all(),
      DB.Photos.all(),
      DB.Meta.getValue('lastBackupAt', null),
    ]);
    const approvedCount = restaurants.filter((r) => r.status === 'approved').length;
    const wishlistCount = restaurants.filter((r) => r.status === 'wishlist').length;
    const openWishCount = wishes.filter((w) => w.status === 'open').length;
    const photoBytes = photos.reduce((sum, p) => sum + (p.size || 0), 0);

    document.getElementById('stat-restaurants').textContent = approvedCount;
    document.getElementById('stat-wishlist-shops').textContent = wishlistCount;
    document.getElementById('stat-wishes').textContent = openWishCount;
    document.getElementById('stat-photo-size').textContent = Utils.formatBytes(photoBytes);

    const backupEl = document.getElementById('stat-last-backup');
    const backupRow = backupEl.closest('.stat-row');
    if (!lastBackupAt) {
      backupEl.textContent = '从未备份';
      backupRow.classList.add('warn');
    } else {
      const days = Math.floor((Date.now() - lastBackupAt) / (1000 * 60 * 60 * 24));
      backupEl.textContent = `${days} 天前`;
      backupRow.classList.toggle('warn', days > 14);
    }

    await renderDismissedList();
  }

  async function renderDismissedList() {
    const container = document.getElementById('dismissed-list');
    const muted = await Reminders.getMuted();
    if (!muted.length) {
      container.innerHTML = '<p class="form-hint">暂无已忽略的提醒</p>';
      return;
    }
    const rows = await Promise.all(muted.map(async (key) => {
      const label = await Reminders.describeKey(key);
      return `<div class="dismissed-item" data-key="${Utils.escapeHTML(key)}"><span>${Utils.escapeHTML(label)}</span><button>恢复提醒</button></div>`;
    }));
    container.innerHTML = rows.join('');
    container.querySelectorAll('.dismissed-item button').forEach((btn) => {
      btn.onclick = async () => {
        const key = btn.closest('.dismissed-item').dataset.key;
        await Reminders.unmute(key);
        renderDismissedList();
        UI.toast('已恢复提醒');
      };
    });
  }

  return { current, load, init, renderStats };
})();
