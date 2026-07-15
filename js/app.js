// ============ App 入口：导航、数据变更广播、启动流程 ============
const App = (() => {
  let activeView = 'find';

  function switchView(view, subTab) {
    activeView = view;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));

    if (view === 'wantgo' && subTab) {
      const btn = document.querySelector(`#wantgo-toggle [data-sub="${subTab}"]`);
      if (btn) btn.click();
    }
    refreshView(view);
  }

  async function refreshView(view) {
    if (view === 'find') {
      await Find.refresh();
      Find.applyViewMode();
    } else if (view === 'wantgo') {
      await Promise.all([WantGo.renderShops(), WantGo.renderWishes()]);
    } else if (view === 'archive') {
      await Archive.renderList();
    } else if (view === 'settings') {
      await Settings.renderStats();
    }
  }

  function notifyDataChanged() {
    refreshView(activeView);
  }

  function bindNav() {
    document.getElementById('bottom-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      switchView(btn.dataset.view);
    });
  }

  async function boot() {
    await DB.open();
    await Settings.load();
    WantGo.init();
    Archive.init();
    Find.init();
    Settings.init();
    bindNav();
    await switchView('find');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW 注册失败', err));
    }
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { switchView, notifyDataChanged };
})();
