// ============ 高德 API 集成（可选）：搜索同品牌分店 ============
// 仅在用户于设置页填写了高德 Key 后才会加载高德 JS SDK，默认零依赖。
const AMapService = (() => {
  let loadPromise = null;

  async function getConfig() {
    const key = await DB.Meta.getValue('amapKey', '');
    const securityCode = await DB.Meta.getValue('amapSecurityCode', '');
    return { key, securityCode };
  }

  async function saveConfig(key, securityCode) {
    await DB.Meta.setValue('amapKey', key);
    await DB.Meta.setValue('amapSecurityCode', securityCode);
    loadPromise = null;
  }

  async function isConfigured() {
    const { key } = await getConfig();
    return !!key;
  }

  function loadScript(key, securityCode) {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      if (window.AMap) { resolve(window.AMap); return; }
      window._AMapSecurityConfig = { securityJsCode: securityCode || '' };
      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
      script.onload = () => {
        if (window.AMap) resolve(window.AMap);
        else reject(new Error('高德 Key 无效或未开通 Web端(JS API)，请检查设置里的 Key 和安全密钥'));
      };
      script.onerror = () => reject(new Error('高德地图脚本加载失败，请检查网络是否可用'));
      document.head.appendChild(script);
    }).catch((err) => {
      loadPromise = null; // 失败后清空缓存，允许改好 Key 后重试
      throw err;
    });
    return loadPromise;
  }

  async function ensureLoaded() {
    const { key, securityCode } = await getConfig();
    if (!key) throw new Error('尚未配置高德 Key，请先去设置页填写');
    return loadScript(key, securityCode);
  }

  function toLngLat(loc) {
    if (!loc) return null;
    if (typeof loc.getLng === 'function') return { lng: loc.getLng(), lat: loc.getLat() };
    return { lng: loc.lng, lat: loc.lat };
  }

  async function searchPOI(keyword, cityHint) {
    const AMap = await ensureLoaded();
    return new Promise((resolve, reject) => {
      AMap.plugin('AMap.PlaceSearch', () => {
        const search = new AMap.PlaceSearch({
          pageSize: 25,
          city: cityHint || undefined,
        });
        search.search(keyword, (status, result) => {
          if (status !== 'complete' || !result || !result.poiList) {
            resolve([]);
            return;
          }
          const pois = result.poiList.pois.map((p) => ({
            id: p.id,
            name: p.name,
            address: p.address,
            city: p.cityname || p.pname || '',
            district: p.adname || '',
            tel: p.tel || '',
            location: toLngLat(p.location), // GCJ-02，导入时需转换为 WGS-84
          }));
          resolve(pois);
        });
      });
    });
  }

  return { getConfig, saveConfig, isConfigured, searchPOI };
})();
