/**
 * Material Hub - API configuration.
 * When deployed: same-origin (''), nginx proxies /api to backend.
 * Local dev: http://localhost:3000
 */
window.MATERIAL_HUB_CONFIG = (function () {
  if (typeof window === 'undefined') return { API_BASE_URL: '', PLATE_RECOGNIZER_TOKEN: '' };
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return {
    API_BASE_URL: isLocal ? 'http://localhost:3000' : '',
    PLATE_RECOGNIZER_TOKEN: 'ef2ef58168b3d5f1390bba202a869f59edd144fe'
  };
})();
