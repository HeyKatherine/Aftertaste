// ============ IndexedDB 数据层 ============
const DB = (() => {
  const DB_NAME = 'restaurant-diary';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('restaurants')) {
          const store = db.createObjectStore('restaurants', { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('wishes')) {
          const store = db.createObjectStore('wishes', { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeNames, mode = 'readonly') {
    return open().then((db) => db.transaction(storeNames, mode));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll(storeName) {
    return tx(storeName).then((t) => reqToPromise(t.objectStore(storeName).getAll()));
  }
  function get(storeName, id) {
    return tx(storeName).then((t) => reqToPromise(t.objectStore(storeName).get(id)));
  }
  function put(storeName, value) {
    return tx(storeName, 'readwrite').then((t) => {
      t.objectStore(storeName).put(value);
      return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve(value);
        t.onerror = () => reject(t.error);
      });
    });
  }
  function del(storeName, id) {
    return tx(storeName, 'readwrite').then((t) => {
      t.objectStore(storeName).delete(id);
      return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    });
  }
  function clearStore(storeName) {
    return tx(storeName, 'readwrite').then((t) => {
      t.objectStore(storeName).clear();
      return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    });
  }

  // ---------- Restaurants ----------
  const Restaurants = {
    all: () => getAll('restaurants'),
    get: (id) => get('restaurants', id),
    async create(data) {
      const now = Utils.todayISO();
      const record = {
        id: Utils.uuid(),
        name: '',
        brand: '',
        status: 'wishlist',
        myRating: '',
        cuisine: '',
        scene: [],
        pricePerPerson: null,
        tags: [],
        notes: '',
        photos: [],
        links: [],
        location: null,
        region: '',
        addedAt: now,
        lastVisitAt: null,
        visitCount: 0,
        dismissedReminders: [],
        ...data,
      };
      await put('restaurants', record);
      return record;
    },
    async update(id, patch) {
      const existing = await get('restaurants', id);
      if (!existing) throw new Error('餐厅不存在');
      const updated = { ...existing, ...patch };
      await put('restaurants', updated);
      return updated;
    },
    async remove(id) {
      const r = await get('restaurants', id);
      if (r && r.photos && r.photos.length) {
        await Promise.all(r.photos.map((pid) => del('photos', pid)));
      }
      await del('restaurants', id);
    },
    async approve(id, extra) {
      return this.update(id, { status: 'approved', ...extra });
    },
    async markVisited(id) {
      const r = await get('restaurants', id);
      if (!r) return;
      return this.update(id, {
        lastVisitAt: Utils.todayISO(),
        visitCount: (r.visitCount || 0) + 1,
      });
    },
  };

  // ---------- Wishes ----------
  const Wishes = {
    all: () => getAll('wishes'),
    get: (id) => get('wishes', id),
    async create(data) {
      const record = {
        id: Utils.uuid(),
        content: '',
        linkedRestaurantId: null,
        externalLink: null,
        status: 'open',
        createdAt: Utils.todayISO(),
        dismissedReminders: [],
        ...data,
      };
      await put('wishes', record);
      return record;
    },
    async update(id, patch) {
      const existing = await get('wishes', id);
      if (!existing) throw new Error('心愿不存在');
      const updated = { ...existing, ...patch };
      await put('wishes', updated);
      return updated;
    },
    async remove(id) {
      await del('wishes', id);
    },
  };

  // ---------- Photos ----------
  const Photos = {
    get: (id) => get('photos', id),
    async add(blob) {
      const id = Utils.uuid();
      await put('photos', { id, blob, size: blob.size, createdAt: Date.now() });
      return id;
    },
    async remove(id) {
      await del('photos', id);
    },
    all: () => getAll('photos'),
  };

  // ---------- Meta (settings, dismissed reminders) ----------
  const Meta = {
    async getValue(key, defaultValue) {
      const rec = await get('meta', key);
      return rec ? rec.value : defaultValue;
    },
    async setValue(key, value) {
      await put('meta', { key, value });
    },
  };

  // ---------- 导出 / 导入 ----------
  async function exportData({ includePhotos }) {
    const [restaurants, wishes, metaAll] = await Promise.all([
      Restaurants.all(),
      Wishes.all(),
      tx('meta').then((t) => reqToPromise(t.objectStore('meta').getAll())),
    ]);
    const payload = {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      includePhotos: !!includePhotos,
      restaurants,
      wishes,
      meta: metaAll,
      photos: [],
    };
    if (includePhotos) {
      const photoIds = new Set();
      restaurants.forEach((r) => (r.photos || []).forEach((pid) => photoIds.add(pid)));
      const photos = [];
      for (const pid of photoIds) {
        const p = await Photos.get(pid);
        if (p) {
          const dataUrl = await Utils.blobToDataURL(p.blob);
          photos.push({ id: p.id, dataUrl, size: p.size });
        }
      }
      payload.photos = photos;
    }
    return payload;
  }

  function dataURLToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/data:(.*);base64/)[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function importData(payload, { mode = 'merge' } = {}) {
    if (!payload || !Array.isArray(payload.restaurants) || !Array.isArray(payload.wishes)) {
      throw new Error('备份文件格式不正确');
    }
    if (mode === 'overwrite') {
      await Promise.all([clearStore('restaurants'), clearStore('wishes'), clearStore('photos')]);
    }
    if (Array.isArray(payload.photos)) {
      for (const p of payload.photos) {
        const blob = dataURLToBlob(p.dataUrl);
        await put('photos', { id: p.id, blob, size: p.size || blob.size, createdAt: Date.now() });
      }
    }
    for (const r of payload.restaurants) await put('restaurants', r);
    for (const w of payload.wishes) await put('wishes', w);
    if (Array.isArray(payload.meta)) {
      for (const m of payload.meta) await put('meta', m);
    }
    return {
      restaurantCount: payload.restaurants.length,
      wishCount: payload.wishes.length,
      photoCount: (payload.photos || []).length,
    };
  }

  return { open, Restaurants, Wishes, Photos, Meta, exportData, importData };
})();
