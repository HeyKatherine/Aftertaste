// ============ 共享的餐厅表单（认可 / 编辑 通用） ============
const RestaurantForm = (() => {
  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('设备不支持定位')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  function open({ initial = {}, title, submitLabel, onSubmit }) {
    const photoPicker = UI.createPhotoPicker(initial.photos || []);
    const linkList = UI.createLinkList(initial.links || []);
    const sheet = UI.openSheet(`
      <div class="sheet-header"><h2>${Utils.escapeHTML(title)}</h2><button class="sheet-close">✕</button></div>
      <form id="rf-form">
        <div class="form-field">
          <label>店名</label>
          <input type="text" id="rf-name" value="${Utils.escapeHTML(initial.name || '')}" required>
        </div>
        <div class="form-field">
          <label>品牌/连锁名（可选）</label>
          <input type="text" id="rf-brand" list="rf-brand-list" placeholder="比如「老王火锅」，同品牌分店可互相关联" value="${Utils.escapeHTML(initial.brand || '')}">
          <datalist id="rf-brand-list"></datalist>
        </div>
        <div class="form-field">
          <label>评级</label>
          <div class="chip-select-row" id="rf-rating">
            ${Constants.RATINGS.map((r) => `<span class="chip-select" data-value="${r}">${r}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>菜系</label>
          <div class="chip-select-row" id="rf-cuisine">
            ${Constants.CUISINES.map((c) => `<span class="chip-select" data-value="${c}">${c}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>场景</label>
          <div class="chip-select-row" id="rf-scene">
            ${Constants.SCENES.map((s) => `<span class="chip-select" data-value="${s}">${s}</span>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label>人均</label>
          <input type="number" id="rf-price" placeholder="元" min="0" value="${initial.pricePerPerson != null ? initial.pricePerPerson : ''}">
        </div>
        <div class="form-field">
          <label>标签（逗号分隔）</label>
          <input type="text" id="rf-tags" placeholder="深夜营业, 周末排队久" value="${Utils.escapeHTML((initial.tags || []).join(', '))}">
        </div>
        <div class="form-field">
          <label>备注</label>
          <textarea id="rf-notes" placeholder="牛腩要趁热吃，别点周末">${Utils.escapeHTML(initial.notes || '')}</textarea>
        </div>
        <div class="form-field">
          <label>照片</label>
        </div>
        <div class="form-field">
          <label>坐标</label>
          <div class="form-field-inline">
            <input type="text" id="rf-lat" placeholder="纬度 lat" style="flex:1;" value="${initial.location ? initial.location.lat : ''}">
            <input type="text" id="rf-lng" placeholder="经度 lng" style="flex:1;" value="${initial.location ? initial.location.lng : ''}">
          </div>
          <div class="switch-row">
            <span style="font-size:13px;color:var(--text-secondary);">坐标来自国内平台（大众点评/高德）</span>
            <label class="switch"><input type="checkbox" id="rf-gcj02"><span class="switch-track"></span></label>
          </div>
          <button type="button" id="rf-use-location" class="btn btn-ghost btn-small">📍 用当前定位</button>
          <button type="button" id="rf-amap-search-toggle" class="btn btn-ghost btn-small">🔍 高德搜索地址</button>
          <div id="rf-amap-panel" class="hidden" style="margin-top:10px;">
            <div class="quick-add-row" style="margin-bottom:8px;">
              <input type="text" id="rf-amap-keyword" placeholder="店名" value="${Utils.escapeHTML(initial.name || '')}">
              <button type="button" class="btn btn-secondary" id="rf-amap-do-search">搜索</button>
            </div>
            <div id="rf-amap-results" class="link-list"></div>
          </div>
        </div>
        <div class="form-field">
          <label>城市/地区</label>
          <input type="text" id="rf-region" placeholder="比如 上海" value="${Utils.escapeHTML(initial.region || '')}">
        </div>
        <div class="form-field">
          <label>外部链接</label>
        </div>
        <div class="modal-actions" style="margin-top:10px;">
          <button type="button" class="btn btn-ghost" id="rf-cancel">取消</button>
          <button type="submit" class="btn btn-primary">${Utils.escapeHTML(submitLabel)}</button>
        </div>
      </form>
    `);

    const fields = sheet.querySelectorAll('.form-field');
    fields[8].appendChild(photoPicker.container); // 照片
    fields[11].appendChild(linkList.container); // 外部链接

    DB.Restaurants.all().then((all) => {
      const brands = [...new Set(all.map((r) => r.brand).filter(Boolean))];
      const datalist = sheet.querySelector('#rf-brand-list');
      datalist.innerHTML = brands.map((b) => `<option value="${Utils.escapeHTML(b)}"></option>`).join('');
    });

    sheet.querySelector('.sheet-close').onclick = UI.closeSheet;
    sheet.querySelector('#rf-cancel').onclick = UI.closeSheet;

    let selectedRating = initial.myRating || '';
    const selectedScenes = new Set(initial.scene || []);
    const ratingRow = sheet.querySelector('#rf-rating');
    ratingRow.querySelectorAll('.chip-select').forEach((chip) => {
      if (chip.dataset.value === selectedRating) chip.classList.add('active');
    });
    ratingRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      ratingRow.querySelectorAll('.chip-select').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedRating = chip.dataset.value;
    });
    let selectedCuisine = initial.cuisine || '';
    const cuisineRow = sheet.querySelector('#rf-cuisine');
    cuisineRow.querySelectorAll('.chip-select').forEach((chip) => {
      if (chip.dataset.value === selectedCuisine) chip.classList.add('active');
    });
    cuisineRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      const wasActive = chip.classList.contains('active');
      cuisineRow.querySelectorAll('.chip-select').forEach((c) => c.classList.remove('active'));
      selectedCuisine = wasActive ? '' : chip.dataset.value;
      if (!wasActive) chip.classList.add('active');
    });
    const sceneRow = sheet.querySelector('#rf-scene');
    sceneRow.querySelectorAll('.chip-select').forEach((chip) => {
      if (selectedScenes.has(chip.dataset.value)) chip.classList.add('active');
    });
    sceneRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-select');
      if (!chip) return;
      chip.classList.toggle('active');
      if (chip.classList.contains('active')) selectedScenes.add(chip.dataset.value);
      else selectedScenes.delete(chip.dataset.value);
    });

    sheet.querySelector('#rf-use-location').onclick = async () => {
      try {
        const pos = await getCurrentPosition();
        sheet.querySelector('#rf-lat').value = pos.lat.toFixed(6);
        sheet.querySelector('#rf-lng').value = pos.lng.toFixed(6);
        sheet.querySelector('#rf-gcj02').checked = false;
        UI.toast('已获取当前位置');
      } catch (e) {
        UI.toast('定位失败：' + e.message);
      }
    };

    const amapPanel = sheet.querySelector('#rf-amap-panel');
    const amapResults = sheet.querySelector('#rf-amap-results');
    sheet.querySelector('#rf-amap-search-toggle').onclick = () => {
      amapPanel.classList.toggle('hidden');
    };
    async function runAmapSearch() {
      const keyword = sheet.querySelector('#rf-amap-keyword').value.trim();
      if (!keyword) { UI.toast('先填店名'); return; }
      amapResults.innerHTML = '<p class="form-hint">搜索中…</p>';
      try {
        const configured = await AMapService.isConfigured();
        if (!configured) {
          amapResults.innerHTML = `<p class="form-hint">还没有配置高德 Key，去设置页填写后才能使用。</p>`;
          return;
        }
        const pois = await AMapService.searchPOI(keyword, sheet.querySelector('#rf-region').value.trim());
        if (!pois.length) {
          amapResults.innerHTML = '<p class="form-hint">没搜到，换个关键词试试。</p>';
          return;
        }
        const existingNames = new Set(
          (await DB.Restaurants.all()).filter((x) => x.id !== initial.id).map((x) => x.name)
        );
        amapResults.innerHTML = `
          <p class="form-hint" style="margin: 4px 0 8px;">点店名把坐标填给当前这家；勾选其他分店可以批量加进想去</p>
          <div id="rf-amap-result-rows"></div>
          <button type="button" class="btn btn-secondary btn-full" id="rf-amap-bulk-import" style="margin-top:10px;" disabled>批量加入想去（0）</button>
        `;
        const rowsEl = amapResults.querySelector('#rf-amap-result-rows');
        rowsEl.innerHTML = pois.map((p, i) => `
          <div class="link-row" style="align-items:flex-start;">
            <input type="checkbox" data-bulk-idx="${i}" ${existingNames.has(p.name) ? 'disabled' : ''} style="margin-top:4px;">
            <span style="flex:1; cursor:pointer;" data-pick-idx="${i}">
              <b>${Utils.escapeHTML(p.name)}</b>${existingNames.has(p.name) ? ' <span class="form-hint">（已存在，仍可点击选用坐标）</span>' : ''}${!p.location ? ' <span class="form-hint">⚠️ 无坐标</span>' : ''}<br>
              <span class="form-hint">${Utils.escapeHTML(p.address || '')}</span>
            </span>
          </div>
        `).join('');
        rowsEl.querySelectorAll('[data-pick-idx]').forEach((span) => {
          span.onclick = () => {
            const p = pois[Number(span.dataset.pickIdx)];
            if (!p.location) { UI.toast('这条结果没有坐标'); return; }
            const wgs84 = Utils.gcj02ToWgs84(p.location.lng, p.location.lat);
            sheet.querySelector('#rf-lat').value = wgs84.lat.toFixed(6);
            sheet.querySelector('#rf-lng').value = wgs84.lng.toFixed(6);
            sheet.querySelector('#rf-gcj02').checked = false;
            const regionInput = sheet.querySelector('#rf-region');
            if (!regionInput.value.trim() && p.city) regionInput.value = p.city;
            amapPanel.classList.add('hidden');
            UI.toast(`已选择「${p.name}」的坐标`);
          };
        });
        const bulkBtn = amapResults.querySelector('#rf-amap-bulk-import');
        function updateBulkBtn() {
          const n = rowsEl.querySelectorAll('input:checked').length;
          bulkBtn.textContent = `批量加入想去（${n}）`;
          bulkBtn.disabled = n === 0;
        }
        rowsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.addEventListener('change', updateBulkBtn);
        });
        bulkBtn.onclick = async () => {
          const brand = sheet.querySelector('#rf-brand').value.trim();
          // 分店直接继承你在这张表单里已经填好的连锁店共有属性（跟「认可全部」应用的字段一致）。
          // 以前只带 brand，导进来全是空壳，等于每家分店都要再认可一遍、重填一次信息。
          // 店名/坐标/地区是每家自己的，不继承。
          const formNotes = sheet.querySelector('#rf-notes').value.trim();
          const shared = {
            myRating: selectedRating,
            cuisine: selectedCuisine,
            scene: [...selectedScenes],
            pricePerPerson: sheet.querySelector('#rf-price').value ? Number(sheet.querySelector('#rf-price').value) : null,
            tags: sheet.querySelector('#rf-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
          };
          const checked = [...rowsEl.querySelectorAll('input:checked')];
          for (const cb of checked) {
            const p = pois[Number(cb.dataset.bulkIdx)];
            const location = p.location ? Utils.gcj02ToWgs84(p.location.lng, p.location.lat) : null;
            await DB.Restaurants.create({
              ...shared,
              name: p.name,
              brand,
              status: 'wishlist',
              region: p.city || '',
              location,
              notes: formNotes || p.address || '', // 你自己写的备注优先，没写才退回门店地址
            });
          }
          // 同 archive.js：没坐标的要当场说清楚，别等认可之后才冒出提醒
          const noCoords = checked.filter((cb) => !pois[Number(cb.dataset.bulkIdx)].location).length;

          // 正在编辑的这条其实只是用来填连锁店信息的模板：信息已经带到每家分店上了，
          // 它自己又没有地址，留下来就是列表里一条永远定位不到的重复项。
          // 只清理「想去」里没填坐标的记录，认可过的店一律不动。
          const latRaw = sheet.querySelector('#rf-lat').value.trim();
          const lngRaw = sheet.querySelector('#rf-lng').value.trim();
          const templateName = sheet.querySelector('#rf-name').value.trim() || initial.name || '';
          const dropTemplate = !!initial.id && initial.status === 'wishlist'
            && !latRaw && !lngRaw && checked.length > 0;

          let msg = `已加入 ${checked.length} 家到想去`;
          if (noCoords) msg += `，其中 ${noCoords} 家高德没给坐标，之后要手动补`;
          if (dropTemplate) msg += `；没有地址的「${templateName}」已清理`;

          if (dropTemplate) {
            await DB.Restaurants.remove(initial.id);
            UI.closeSheet(); // 记录都删了，表单不能再留着提交，否则保存会报「餐厅不存在」
          } else {
            amapPanel.classList.add('hidden');
          }
          UI.toast(msg);
          App.notifyDataChanged();
        };
      } catch (e) {
        amapResults.innerHTML = `<p class="form-hint">${Utils.escapeHTML(e.message)}</p>`;
      }
    }
    sheet.querySelector('#rf-amap-do-search').onclick = runAmapSearch;
    sheet.querySelector('#rf-amap-keyword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runAmapSearch(); }
    });

    sheet.querySelector('#rf-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = sheet.querySelector('#rf-name').value.trim();
      if (!name) { UI.toast('店名不能为空'); return; }
      const latRaw = sheet.querySelector('#rf-lat').value.trim();
      const lngRaw = sheet.querySelector('#rf-lng').value.trim();
      let location = initial.location || null;
      if (latRaw && lngRaw) {
        let lat = parseFloat(latRaw), lng = parseFloat(lngRaw);
        if (sheet.querySelector('#rf-gcj02').checked) {
          const converted = Utils.gcj02ToWgs84(lng, lat);
          lat = converted.lat; lng = converted.lng;
        }
        location = { lat, lng };
      } else if (!latRaw && !lngRaw) {
        location = null;
      }
      const tags = sheet.querySelector('#rf-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
      const patch = {
        name,
        brand: sheet.querySelector('#rf-brand').value.trim(),
        myRating: selectedRating,
        cuisine: selectedCuisine,
        scene: [...selectedScenes],
        pricePerPerson: sheet.querySelector('#rf-price').value ? Number(sheet.querySelector('#rf-price').value) : null,
        tags,
        notes: sheet.querySelector('#rf-notes').value.trim(),
        photos: photoPicker.getIds(),
        links: linkList.getLinks(),
        location,
        region: sheet.querySelector('#rf-region').value.trim(),
      };
      await onSubmit(patch);
      UI.closeSheet();
    });

    return sheet;
  }

  return { open };
})();
