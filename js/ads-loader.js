// Global ad loader for head-level ad network codes (Monetag / Adsterra)
// Loads codes saved in data/content.json -> settings.ads and injects them into <head>.

(function () {
  function executeScripts(container) {
    container.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
  }

  function injectHeadCode(id, code) {
    if (!code || !String(code).trim() || document.getElementById(id)) return;
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.style.display = 'none';
    wrap.innerHTML = code;
    document.head.appendChild(wrap);
    executeScripts(wrap);
  }

  async function getContentData() {
    if (window.PHANTOM_CONTENT_CACHE) return window.PHANTOM_CONTENT_CACHE;
    try {
      const cached = sessionStorage.getItem('phantom_content_cache');
      const cacheTime = sessionStorage.getItem('phantom_content_time');
      if (cached && cacheTime && (Date.now() - Number(cacheTime) < 10 * 60 * 1000)) {
        const parsed = JSON.parse(cached);
        window.PHANTOM_CONTENT_CACHE = parsed;
        return parsed;
      }
    } catch (_) {}

    const res = await fetch('data/content.json');
    if (!res.ok) return null;
    const data = await res.json();
    window.PHANTOM_CONTENT_CACHE = data;
    try {
      sessionStorage.setItem('phantom_content_cache', JSON.stringify(data));
      sessionStorage.setItem('phantom_content_time', String(Date.now()));
    } catch (_) {}
    return data;
  }

  async function loadGlobalAds() {
    try {
      const data = await getContentData();
      if (!data) return;
      const ads = data.settings && data.settings.ads;
      if (!ads || ads.enabled === false) return;

      injectHeadCode('monetag-head-code', ads.monetagHead || '');
      injectHeadCode('monetag-multitag-code', ads.monetagMultitag || '');
      injectHeadCode('adsterra-head-code', ads.adsterraHead || '');
      injectHeadCode('adsterra-socialbar-code', ads.adsterraSocialBar || '');
    } catch (err) {
      console.warn('Global ads failed to load:', err);
    }
  }

  loadGlobalAds();
})();
