/**
 * Material Hub - Authentication module.
 * Manages JWT storage, login/setup API calls, and provides auth headers for fetch.
 * Exposes window.MATERIAL_HUB_AUTH for use by other modules.
 */

(function () {
  'use strict';

  const config = window.MATERIAL_HUB_CONFIG || {};
  const API_BASE = config.API_BASE_URL || '';
  const TOKEN_KEY = 'mh_token';
  const USER_KEY = 'mh_user';

  /**
   * Returns the stored JWT or empty string.
   * @returns {string}
   */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  /**
   * Returns the stored user object or null.
   * @returns {{ id: number, username: string, display_name: string, role: string } | null}
   */
  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Whether the current user has admin role.
   * @returns {boolean}
   */
  function isAdmin() {
    const u = getUser();
    return u?.role === 'admin';
  }

  /**
   * Stores token and user after successful login/setup.
   * @param {string} token
   * @param {object} user
   */
  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  /**
   * Clears stored auth data, server cookie, and reloads the page.
   * Awaits the server logout to ensure the session cookie is cleared before reload.
   */
  async function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    document.cookie = 'mh_session=; Max-Age=0; path=/;';
    try { await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }); } catch {}
    window.location.reload();
  }

  /**
   * Returns headers object with Authorization bearer token for API calls.
   * Merges with any additional headers provided.
   * @param {object} [extra] - additional headers
   * @returns {object}
   */
  function authHeaders(extra) {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return Object.assign(headers, extra || {});
  }

  /**
   * Wrapper around fetch that automatically injects the auth header and sends cookies.
   * @param {string} url
   * @param {RequestInit} [opts]
   * @returns {Promise<Response>}
   */
  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = authHeaders(opts.headers || {});
    opts.credentials = 'include';
    return fetch(url, opts);
  }

  /**
   * Checks if the system needs first-time setup (no users exist).
   * @returns {Promise<boolean>}
   */
  async function checkSetupNeeded() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/setup-status`, { credentials: 'include' });
      const data = await res.json();
      return !!data.needsSetup;
    } catch {
      return false;
    }
  }

  /**
   * Creates the first admin account.
   * @param {string} username
   * @param {string} password
   * @param {string} displayName
   * @returns {Promise<{ token: string, user: object }>}
   * @throws {Error}
   */
  async function setup(username, password, displayName) {
    const res = await fetch(`${API_BASE}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, display_name: displayName }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Setup failed');
    saveSession(data.token, data.user);
    return data;
  }

  /**
   * Logs in with username and password.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{ token: string, user: object }>}
   * @throws {Error}
   */
  async function login(username, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    saveSession(data.token, data.user);
    return data;
  }

  /**
   * Validates the stored token by calling /api/auth/me.
   * Falls back to the HttpOnly session cookie when localStorage is empty
   * (e.g. after iOS PWA reinstall or ITP storage purge).
   * @returns {Promise<object|null>}
   */
  async function validateToken() {
    const token = getToken();
    try {
      const headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers,
        credentials: 'include'
      });
      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        return null;
      }
      const data = await res.json();
      const user = data.user || data;
      if (data.token) {
        saveSession(data.token, user);
      } else {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
      return user;
    } catch {
      return null;
    }
  }

  window.MATERIAL_HUB_AUTH = {
    getToken,
    getUser,
    isAdmin,
    logout,
    authHeaders,
    authFetch,
    checkSetupNeeded,
    setup,
    login,
    validateToken
  };
})();
