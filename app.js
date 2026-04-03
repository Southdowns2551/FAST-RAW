/**
 * Material Hub - Main application script.
 * Handles authentication flow, service worker registration, install prompt,
 * connection status, and icon-grid home screen navigation.
 */

(function () {
  'use strict';

  const connectionStatus = document.getElementById('connection-status');
  const installPrompt = document.getElementById('install-prompt');
  const installBtn = document.getElementById('install-btn');
  const homeGrid = document.getElementById('home-grid');
  const bottomNav = document.getElementById('bottom-nav');
  const bottomHomeBtn = document.getElementById('bottom-home-btn');
  const settingsBtn = document.getElementById('header-settings-btn');
  const logoutBtn = document.getElementById('header-logout-btn');
  const headerUserName = document.getElementById('header-user-name');

  const panelSetup = document.getElementById('panel-setup');
  const panelLogin = document.getElementById('panel-login');
  const setupForm = document.getElementById('setup-form');
  const loginForm = document.getElementById('login-form');
  const setupError = document.getElementById('setup-error');
  const loginError = document.getElementById('login-error');

  let deferredPrompt = null;

  /**
   * Updates the connection status badge based on navigator.onLine.
   * Side effect: mutates DOM.
   */
  function updateConnectionStatus() {
    if (!connectionStatus) return;
    const isOnline = navigator.onLine;
    connectionStatus.textContent = isOnline ? 'Online' : 'Offline';
    connectionStatus.classList.toggle('online', isOnline);
    connectionStatus.classList.toggle('offline', !isOnline);
  }

  /**
   * Registers the service worker if supported.
   * @returns {Promise<void>}
   */
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js?v=38', { scope: '/' });
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (newSW) newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            newSW.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }

  /**
   * Captures beforeinstallprompt and shows install button.
   * @param {Event} e - beforeinstallprompt event
   */
  function handleBeforeInstallPrompt(e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installPrompt) installPrompt.classList.remove('hidden');
  }

  /**
   * Triggers PWA install prompt when user clicks install button.
   */
  async function handleInstallClick() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (installPrompt) installPrompt.classList.add('hidden');
  }

  /**
   * Hides all auth panels and content panels.
   */
  function hideAllPanels() {
    if (panelSetup) panelSetup.classList.add('hidden');
    if (panelLogin) panelLogin.classList.add('hidden');
    if (homeGrid) homeGrid.classList.add('hidden');
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    if (bottomNav) bottomNav.classList.add('hidden');
  }

  /**
   * Shows the setup screen for first-time admin creation.
   */
  function showSetup() {
    hideAllPanels();
    if (panelSetup) panelSetup.classList.remove('hidden');
    if (settingsBtn) settingsBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (headerUserName) headerUserName.classList.add('hidden');
  }

  /**
   * Shows the login screen.
   */
  function showLogin() {
    hideAllPanels();
    if (panelLogin) panelLogin.classList.remove('hidden');
    if (settingsBtn) settingsBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (headerUserName) headerUserName.classList.add('hidden');
  }

  /**
   * Shows the authenticated home screen with appropriate header controls.
   */
  function showAuthenticatedHome() {
    hideAllPanels();
    if (homeGrid) homeGrid.classList.remove('hidden');

    const auth = window.MATERIAL_HUB_AUTH;
    const user = auth ? auth.getUser() : null;

    if (settingsBtn) {
      settingsBtn.classList.toggle('hidden', !(user && user.role === 'admin'));
    }
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (headerUserName && user) {
      headerUserName.textContent = user.display_name || user.username;
      headerUserName.classList.remove('hidden');
    }
  }

  /**
   * Opens a section panel by id and hides the home grid.
   * @param {string} sectionId - panel suffix (raw-in, raw-out, settings, etc.)
   * Side effect: hides home grid, shows panel and bottom nav.
   */
  /**
   * Checks whether the current user's role is allowed to open a given section.
   * @param {string} sectionId
   * @returns {boolean}
   */
  function canAccess(sectionId) {
    const auth = window.MATERIAL_HUB_AUTH;
    const user = auth ? auth.getUser() : null;
    const role = user ? user.role : 'user';

    if (sectionId === 'settings') return role === 'admin';
    if (sectionId === 'portal') return true;
    if (role === 'viewer') return false;
    return true;
  }

  function openSection(sectionId) {
    if (!canAccess(sectionId)) {
      if (sectionId === 'settings') {
        alert('Admin access required');
      } else {
        alert('You do not have access to this section');
      }
      return;
    }
    if (homeGrid) homeGrid.classList.add('hidden');
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('hidden', p.id !== 'panel-' + sectionId);
    });
    if (bottomNav) bottomNav.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  /**
   * Returns to the home grid view from any section.
   * Side effect: hides all panels and bottom nav, shows home grid.
   */
  function goHome() {
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    if (homeGrid) homeGrid.classList.remove('hidden');
    if (bottomNav) bottomNav.classList.add('hidden');
    window.scrollTo(0, 0);
  }

  /**
   * Main auth flow: checks setup status, validates token, shows appropriate screen.
   */
  async function initAuth() {
    const auth = window.MATERIAL_HUB_AUTH;
    if (!auth) {
      showAuthenticatedHome();
      return;
    }

    const needsSetup = await auth.checkSetupNeeded();
    if (needsSetup) {
      showSetup();
      return;
    }

    const user = await auth.validateToken();
    if (user) {
      showAuthenticatedHome();
    } else {
      showLogin();
    }
  }

  if (setupForm) {
    setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (setupError) { setupError.classList.add('hidden'); setupError.textContent = ''; }
      const displayName = document.getElementById('setup-display-name')?.value?.trim();
      const username = document.getElementById('setup-username')?.value?.trim();
      const password = document.getElementById('setup-password')?.value;
      const confirm = document.getElementById('setup-confirm')?.value;

      if (password !== confirm) {
        if (setupError) { setupError.textContent = 'Passwords do not match'; setupError.classList.remove('hidden'); }
        return;
      }

      const btn = document.getElementById('setup-submit');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

      try {
        await window.MATERIAL_HUB_AUTH.setup(username, password, displayName);
        showAuthenticatedHome();
      } catch (err) {
        if (setupError) { setupError.textContent = err.message; setupError.classList.remove('hidden'); }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Create admin account'; }
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginError) { loginError.classList.add('hidden'); loginError.textContent = ''; }
      const username = document.getElementById('login-username')?.value?.trim();
      const password = document.getElementById('login-password')?.value;

      const btn = document.getElementById('login-submit');
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

      try {
        await window.MATERIAL_HUB_AUTH.login(username, password);
        showAuthenticatedHome();
      } catch (err) {
        if (loginError) { loginError.textContent = err.message; loginError.classList.remove('hidden'); }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
      }
    });
  }

  document.querySelectorAll('.grid-tile').forEach((tile) => {
    tile.addEventListener('click', () => openSection(tile.dataset.section));
  });

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => openSection(settingsBtn.dataset.section));
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (window.MATERIAL_HUB_AUTH) window.MATERIAL_HUB_AUTH.logout();
    });
  }

  if (bottomHomeBtn) {
    bottomHomeBtn.addEventListener('click', goHome);
  }

  updateConnectionStatus();
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  if (installBtn) installBtn.addEventListener('click', handleInstallClick);

  registerServiceWorker();
  initAuth();
})();
