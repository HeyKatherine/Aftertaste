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

  function openSheet(innerHTML) {
    closeSheet();
    const backdrop = el(`<div class="overlay-backdrop"><div class="sheet">${innerHTML}</div></div>`);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSheet();
    });
    sheetRoot().appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    return backdrop.querySelector('.sheet');
  }
  function closeSheet() {
    sheetRoot().innerHTML = '';
    document.body.style.overflow = '';
  }

  function openModal(innerHTML) {
    closeModal();
    const backdrop = el(`<div class="overlay-backdrop modal-center"><div class="modal-box">${innerHTML}</div></div>`);
    modalRoot().appendChild(backdrop);
    return backdrop.querySelector('.modal-box');
  }
  function closeModal() {
    modalRoot().innerHTML = '';
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
      const url = input.value.trim();
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
    createPhotoPicker, createLinkList, renderLinkIcon,
  };
})();
