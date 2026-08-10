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

  async function loadGlobalAds() {
    try {
      const res = await fetch('data/content.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const ads = data.settings && data.settings.ads;
      if (!ads || ads.enabled === false) return;

      // Monetag usually asks to paste MultiTag/OnClick/IPP/Vignette scripts below <head>.
      injectHeadCode('monetag-head-code', ads.monetagHead || '');
      injectHeadCode('monetag-multitag-code', ads.monetagMultitag || '');

      // Adsterra global formats such as Social Bar / Popunder can also be loaded globally.
      injectHeadCode('adsterra-head-code', ads.adsterraHead || '');
      injectHeadCode('adsterra-socialbar-code', ads.adsterraSocialBar || '');
    } catch (err) {
      console.warn('Global ads failed to load:', err);
    }
  }

  loadGlobalAds();
})();
