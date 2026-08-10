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
      const addBtn = el('<button type="button" class="photo-add-btn">📷</button>');
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
            <span class="link-icon">${src.icon}</span>
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
    return `<a class="external-link-btn" href="${Utils.escapeHTML(link.url)}" target="_blank" rel="noopener">${src.icon} ${src.label}</a>`;
  }

  return {
    toast, el, openSheet, closeSheet, openModal, closeModal, confirmDialog,
    openPhotoViewer, closePhotoViewer,
    createPhotoPicker, createLinkList, renderLinkIcon,
  };
})();
