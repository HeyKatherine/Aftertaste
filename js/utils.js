// ============ 工具函数集合 ============
const Utils = (() => {

  // ---------- UUID ----------
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------- 日期 ----------
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    const then = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  }
  function formatMonthsAgo(dateStr) {
    const d = daysSince(dateStr);
    if (d === Infinity) return '从未';
    if (d < 30) return `${d} 天前`;
    const months = Math.floor(d / 30);
    return `${months} 个月前`;
  }

  // ---------- GCJ-02 → WGS-84 坐标转换（标准公开算法） ----------
  const PI = 3.1415926535897932384626;
  const A = 6378245.0;
  const EE = 0.00669342162296594323;

  function outOfChina(lng, lat) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
  }

  function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }

  function gcj02ToWgs84(lng, lat) {
    if (outOfChina(lng, lat)) return { lng, lat };
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
    dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
    const mgLat = lat + dLat;
    const mgLng = lng + dLng;
    return { lng: lng * 2 - mgLng, lat: lat * 2 - mgLat };
  }

  // 反向：WGS-84 → GCJ-02。GPS 拿到的是 WGS-84，但高德接口只认 GCJ-02，
  // 不转直接查会偏出几百米，可能落到隔壁区。
  function wgs84ToGcj02(lng, lat) {
    if (outOfChina(lng, lat)) return { lng, lat };
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
    dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
    return { lng: lng + dLng, lat: lat + dLat };
  }

  // ---------- Haversine 距离（米）----------
  function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function formatDistance(meters) {
    if (meters == null || isNaN(meters)) return '';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  }

  // ---------- 链接来源识别 ----------
  const LINK_SOURCES = [
    { key: 'dianping', label: '大众点评', match: /dianping\.com/i },
    { key: 'meituan', label: '美团', match: /meituan\.com/i },
    { key: 'xiaohongshu', label: '小红书', match: /(xiaohongshu\.com|xhslink\.com)/i },
    { key: 'google', label: 'Google Maps', match: /(google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i },
    { key: 'yelp', label: 'Yelp', match: /yelp\.com/i },
    { key: 'amap', label: '高德地图', match: /(amap\.com|autonavi\.com)/i },
  ];
  function detectLinkSource(url) {
    for (const s of LINK_SOURCES) {
      if (s.match.test(url)) return { key: s.key, label: s.label };
    }
    return { key: 'other', label: '链接' };
  }

  // 补全协议头：没有 http(s):// 前缀的链接当 <a href> 用会被当成本站内的相对路径，
  // 点开跳到自己站点的 404，而且因为在 PWA scope 内，还没有返回按钮。
  function normalizeUrl(url) {
    const trimmed = (url || '').trim();
    if (!trimmed) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // 已有协议头（http/https/其他）
    if (trimmed.startsWith('//')) return 'https:' + trimmed;
    return 'https://' + trimmed;
  }

  // ---------- 图片压缩（长边≤1280px，质量0.7）----------
  function compressImage(file, { maxSize = 1280, quality = 0.7 } = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height >= width && height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('压缩失败'));
            },
            'image/jpeg',
            quality
          );
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  function escapeHTML(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // 先用 URL scheme 唤起地图 App，唤不起来再退回网页版。
  // 判断依据是页面有没有被切到后台：App 起来了当前页就会变 hidden，没起来就还停在前台。
  // 注意几个坑：
  // - 必须用 location.href 触发 scheme。iframe 那套老写法在新版 iOS Safari 已经不生效了。
  // - App 没装时 location.href 指向未注册的 scheme 并不会真的跳走，页面还在，
  //   所以不会像之前那样把 PWA 导到一个回不来的页面。
  // - 兜底用 window.open(_blank)，在 PWA 里会开成带关闭按钮的浮层，不会困住。
  function openMapApp(schemeUrl, webUrl, timeout = 1500) {
    let leftPage = false;
    const onVisibility = () => { if (document.hidden) leftPage = true; };
    document.addEventListener('visibilitychange', onVisibility);
    window.location.href = schemeUrl;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (!leftPage && !document.hidden) window.open(webUrl, '_blank');
    }, timeout);
  }

  return {
    uuid, todayISO, daysSince, formatMonthsAgo,
    gcj02ToWgs84, wgs84ToGcj02, haversineDistance, formatDistance,
    detectLinkSource, LINK_SOURCES, normalizeUrl,
    compressImage, blobToDataURL, formatBytes, escapeHTML, openMapApp,
  };
})();
