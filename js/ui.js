// ============ 通用 UI 组件：toast / sheet / modal / photo picker / link list ============
const UI = (() => {
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function el(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }

  // 界面内的图标统一用内联 SVG：emoji 各平台渲染不一样，粗细/颜色也没法跟主题走
  const ICON_PATHS = {
    bowl: '<path d="M4.5 11.5h15a7.5 7.5 0 0 1-15 0Z"/><path d="M3.4 11.5h17.2"/><path d="M9.5 7.4V5.2M12 6.9V4.4M14.5 7.4V5.2"/>',
    bookmark: '<path d="M6 4.6A1.6 1.6 0 0 1 7.6 3h8.8A1.6 1.6 0 0 1 18 4.6V21l-6-4.2L6 21V4.6Z"/>',
    tag: '<path d="M11.6 3H5.4A2.4 2.4 0 0 0 3 5.4v6.2a2 2 0 0 0 .6 1.4l7.4 7.4a2 2 0 0 0 2.8 0l6.6-6.6a2 2 0 0 0 0-2.8L13 3.6A2 2 0 0 0 11.6 3Z"/><circle cx="7.9" cy="7.9" r="1.3"/>',
    pin: '<path d="M20 10c0 4.4-5.6 10.3-7.4 12.1a.85.85 0 0 1-1.2 0C9.6 20.3 4 14.4 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.8"/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/>',
    camera: '<path d="M3 8.8A1.8 1.8 0 0 1 4.8 7h2.3l1.3-2.1a1 1 0 0 1 .85-.48h5.5a1 1 0 0 1 .85.48L16.9 7h2.3A1.8 1.8 0 0 1 21 8.8v9.4A1.8 1.8 0 0 1 19.2 20H4.8A1.8 1.8 0 0 1 3 18.2Z"/><circle cx="12" cy="13.2" r="3.6"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="M15.8 15.8 21 21"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2 5.2-5.2 2 2-5.2Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
    check: '<path d="m4.5 12.8 4.8 4.7L19.5 6.8"/>',
    close: '<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>',
    link: '<path d="M10.3 13.7a3.8 3.8 0 0 0 5.6.3l2.5-2.5a3.8 3.8 0 1 0-5.4-5.4l-1.4 1.4"/><path d="M13.7 10.3a3.8 3.8 0 0 0-5.6-.3l-2.5 2.5a3.8 3.8 0 1 0 5.4 5.4l1.4-1.4"/>',
    noodle: '<path d="M4.5 12.5h15a7.5 7.5 0 0 1-15 0Z"/><path d="M3.4 12.5h17.2"/><path d="m14.5 9-6-5.4M17 9.6l-4.6-4.2"/>',
    warn: '<path d="M10.7 4.2 2.9 17.6A1.5 1.5 0 0 0 4.2 20h15.6a1.5 1.5 0 0 0 1.3-2.4L13.3 4.2a1.5 1.5 0 0 0-2.6 0Z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>',
  };
  function icon(name) {
    return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.bowl}</svg>`;
  }

  const sheetRoot = () => document.getElementById('sheet-root');
  const modalRoot = () => document.getElementById('modal-root');

  // 退场：先加 .closing 播动画，动画完了再摘节点。
  // 兜底计时器是必须的——元素被 display:none 或页面切到后台时 animationend 不一定会来。
  function dismiss(backdrop, ms) {
    if (!backdrop || backdrop.classList.contains('closing')) return;
    backdrop.classList.add('closing');
    const done = () => backdrop.remove();
    backdrop.addEventListener('animationend', done, { once: true });
    setTimeout(done, ms);
  }

  function openSheet(innerHTML) {
    // 直接清空而不是走 closeSheet()：常见写法是关掉一个 sheet 紧接着开下一个
    // （比如品牌详情点进分店），等退场动画会让两层叠在一起
    sheetRoot().innerHTML = '';
    const backdrop = el(`<div class="overlay-backdrop"><div class="sheet"><div class="sheet-grabber"></div>${innerHTML}</div></div>`);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSheet();
    });
    sheetRoot().appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    const sheet = backdrop.querySelector('.sheet');
    attachSheetDrag(backdrop, sheet);
    return sheet;
  }
  function closeSheet() {
    dismiss(sheetRoot().firstElementChild, 260);
    document.body.style.overflow = '';
  }

  // 往下拖着关，跟 iOS 的 sheet 一个手感
  function attachSheetDrag(backdrop, sheet) {
    const CLOSE_AT = 110;
    let startY = 0, startX = 0, offset = 0, dragging = false, locked = false;

    sheet.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      // 内容还能往上滚的时候不抢手势，否则没法正常翻内容
      if (sheet.scrollTop > 0) return;
      dragging = true; locked = false; offset = 0;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      // 方向锁：横向滑动（详情页的照片条就是横滚的）不该被当成下拉
      if (!locked) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) { dragging = false; return; }
        if (Math.abs(dy) > 6) locked = true; else return;
      }
      if (dy <= 0) { offset = 0; sheet.style.transform = ''; return; }
      e.preventDefault();
      offset = dy;
      sheet.style.transform = `translateY(${dy}px)`;
      backdrop.style.background = `rgba(30, 20, 15, ${(0.4 * Math.max(0, 1 - dy / 420)).toFixed(3)})`;
    }, { passive: false });

    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = '';
      if (offset > CLOSE_AT) { closeSheet(); return; }
      sheet.style.transform = '';
      backdrop.style.background = '';
    };
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
  }

  function openModal(innerHTML) {
    modalRoot().innerHTML = '';
    const backdrop = el(`<div class="overlay-backdrop modal-center"><div class="modal-box">${innerHTML}</div></div>`);
    modalRoot().appendChild(backdrop);
    return backdrop.querySelector('.modal-box');
  }
  function closeModal() {
    dismiss(modalRoot().firstElementChild, 220);
  }

  function confirmDialog({ title = '确认', message = '', confirmText = '确认', cancelText = '取消', danger = false }) {
    return new Promise((resolve) => {
      const box = openModal(`
        <h2 style="font-size:18px;font-weight:800;margin-bottom:10px;">${Utils.escapeHTML(title)}</h2>
        <p class="modal-msg">${Utils.escapeHTML(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="cancel">${Utils.escapeHTML(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${Utils.escapeHTML(confirmText)}</button>
        </div>
      `);
      box.querySelector('[data-act="cancel"]').onclick = () => { closeModal(); resolve(false); };
      box.querySelector('[data-act="ok"]').onclick = () => { closeModal(); resolve(true); };
    });
  }

  // ---------- Photo Viewer ----------
  const photoViewerRoot = () => document.getElementById('photo-viewer-root');

  function openPhotoViewer(urls, startIndex = 0) {
    photoViewerRoot().innerHTML = ''; // 同 openSheet：不等退场动画，避免两层叠着
    let idx = startIndex;
    const multi = urls.length > 1;
    const backdrop = el(`
      <div class="photo-viewer-backdrop">
        <button type="button" class="photo-viewer-close">✕</button>
        ${multi ? '<button type="button" class="photo-viewer-nav photo-viewer-prev">‹</button>' : ''}
        ${multi ? '<button type="button" class="photo-viewer-nav photo-viewer-next">›</button>' : ''}
        <img>
        ${multi ? '<p class="photo-viewer-counter"></p>' : ''}
      </div>
    `);
    const imgEl = backdrop.querySelector('img');
    const counterEl = backdrop.querySelector('.photo-viewer-counter');
    function render() {
      imgEl.src = urls[idx];
      if (counterEl) counterEl.textContent = `${idx + 1} / ${urls.length}`;
    }
    render();
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePhotoViewer();
    });
    backdrop.querySelector('.photo-viewer-close').onclick = closePhotoViewer;
    const prevBtn = backdrop.querySelector('.photo-viewer-prev');
    const nextBtn = backdrop.querySelector('.photo-viewer-next');
    if (prevBtn) prevBtn.onclick = () => { idx = (idx - 1 + urls.length) % urls.length; render(); };
    if (nextBtn) nextBtn.onclick = () => { idx = (idx + 1) % urls.length; render(); };
    photoViewerRoot().appendChild(backdrop);
  }
  function closePhotoViewer() {
    dismiss(photoViewerRoot().firstElementChild, 220);
  }

  // ---------- Photo Picker ----------
  function createPhotoPicker(initialIds = []) {
    let ids = [...initialIds];
    const container = el('<div class="photo-grid"></div>');

    async function render() {
      container.innerHTML = '';
      for (const id of ids) {
        const rec = await DB.Photos.get(id);
        if (!rec) continue;
        const url = URL.createObjectURL(rec.blob);
        const wrap = el(`<div class="photo-thumb-wrap"><img class="photo-thumb" src="${url}"><button type="button" class="photo-remove">✕</button></div>`);
        wrap.querySelector('.photo-remove').onclick = () => {
          ids = ids.filter((x) => x !== id);
          render();
        };
        container.appendChild(wrap);
      }
      const addBtn = el(`<button type="button" class="photo-add-btn">${icon('camera')}</button>`);
      const input = el('<input type="file" accept="image/*" multiple hidden>');
      addBtn.onclick = () => input.click();
      input.onchange = async () => {
        for (const file of input.files) {
          try {
            const blob = await Utils.compressImage(file);
            const id = await DB.Photos.add(blob);
            ids.push(id);
          } catch (e) { console.error(e); }
        }
        render();
      };
      container.appendChild(addBtn);
      container.appendChild(input);
    }
    render();
    return { container, getIds: () => ids };
  }

  // ---------- Link List ----------
  function createLinkList(initialLinks = []) {
    let links = [...initialLinks];
    const container = el('<div></div>');
    const list = el('<div class="link-list"></div>');
    const addRow = el(`
      <div class="quick-add-row" style="margin-bottom:0;">
        <input type="text" placeholder="粘贴链接（大众点评/小红书/Google Maps...）">
        <button type="button" class="btn btn-secondary">添加</button>
      </div>
    `);
    container.appendChild(list);
    container.appendChild(addRow);

    function render() {
      list.innerHTML = '';
      links.forEach((link, idx) => {
        const src = Utils.detectLinkSource(link.url);
        const row = el(`
          <div class="link-row">
            <span class="link-icon">${icon('link')}</span>
            <span class="link-url">${Utils.escapeHTML(link.url)}</span>
            <button type="button" class="link-remove">✕</button>
          </div>
        `);
        row.querySelector('.link-remove').onclick = () => {
          links.splice(idx, 1);
          render();
        };
        list.appendChild(row);
      });
    }
    const input = addRow.querySelector('input');
    addRow.querySelector('button').onclick = () => {
      const url = Utils.normalizeUrl(input.value);
      if (!url) return;
      const src = Utils.detectLinkSource(url);
      links.push({ url, source: src.key });
      input.value = '';
      render();
    };
    render();
    return { container, getLinks: () => links };
  }

  function renderLinkIcon(link) {
    const src = Utils.detectLinkSource(link.url);
    return `<a class="external-link-btn" href="${Utils.escapeHTML(link.url)}" target="_blank" rel="noopener">${icon('link')}${src.label}</a>`;
  }

  return {
    toast, el, icon, openSheet, closeSheet, openModal, closeModal, confirmDialog,
    openPhotoViewer, closePhotoViewer,
    createPhotoPicker, createLinkList, renderLinkIcon,
  };
})();
