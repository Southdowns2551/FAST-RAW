/**
 * Settings - Supplier, Transporter, Material grade, Reason, app setting, and user management.
 * All settings stored server-side in MySQL via API. Requires admin auth.
 */

(function () {
  'use strict';

  const config = window.MATERIAL_HUB_CONFIG || {};
  const API_BASE = config.API_BASE_URL || '';

  /**
   * Returns auth-aware fetch. Falls back to plain fetch if auth module unavailable.
   * @param {string} url
   * @param {RequestInit} [opts]
   * @returns {Promise<Response>}
   */
  function apiFetch(url, opts) {
    const auth = window.MATERIAL_HUB_AUTH;
    if (auth && auth.authFetch) return auth.authFetch(url, opts);
    return fetch(url, opts);
  }

  /**
   * Fetches list from API.
   * @param {string} resource - suppliers | transporters | grades
   * @returns {Promise<{id:number, name:string}[]>}
   */
  async function fetchList(resource) {
    try {
      const res = await apiFetch(`${API_BASE}/api/settings/${resource}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /**
   * Gets suppliers from database.
   * @returns {Promise<{id:number, name:string}[]>}
   */
  async function getSuppliers() {
    return fetchList('suppliers');
  }

  /**
   * Gets transporters from database.
   * @returns {Promise<{id:number, name:string}[]>}
   */
  async function getTransporters() {
    return fetchList('transporters');
  }

  /**
   * Gets material grades from database.
   * @returns {Promise<{id:number, name:string}[]>}
   */
  async function getGrades() {
    return fetchList('grades');
  }

  /**
   * Gets grade names only (for Raw In/Out dropdowns).
   * @returns {Promise<string[]>}
   */
  async function getGradeNames() {
    const items = await getGrades();
    return items.map((i) => i.name);
  }

  /**
   * Gets material out reasons from database.
   * @returns {Promise<{id:number, name:string}[]>}
   */
  async function getReasons() {
    return fetchList('reasons');
  }

  /**
   * Gets reason names only (for Raw Out dropdown).
   * @returns {Promise<string[]>}
   */
  async function getReasonNames() {
    const items = await getReasons();
    return items.map((i) => i.name);
  }

  /**
   * Gets masterbatch grades from database (separate from material_grades).
   * @returns {Promise<{id:number, name:string}[]>}
   */
  async function getMasterbatchGrades() {
    return fetchList('masterbatch_grades');
  }

  /**
   * Gets masterbatch grade names only (for Raw In/Out dropdowns).
   * @returns {Promise<string[]>}
   */
  async function getMasterbatchGradeNames() {
    const items = await getMasterbatchGrades();
    return items.map((i) => i.name);
  }

  /**
   * Gets rework grades from database (separate from material_grades).
   * @returns {Promise<{id:number, name:string}[]>}
   */
  async function getReworkGrades() {
    return fetchList('rework_grades');
  }

  /**
   * Gets rework grade names only (for Rework Out dropdowns).
   * @returns {Promise<string[]>}
   */
  async function getReworkGradeNames() {
    const items = await getReworkGrades();
    return items.map((i) => i.name);
  }

  /**
   * Adds a record via API.
   * @param {string} resource - suppliers | transporters | grades
   * @param {string} name
   * @returns {Promise<{id:number, name:string}>}
   * @throws {Error} on API error
   */
  async function addRecord(resource, name) {
    const res = await apiFetch(`${API_BASE}/api/settings/${resource}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add');
    return data;
  }

  /**
   * Deletes a record via API.
   * @param {string} resource - suppliers | transporters | grades
   * @param {number} id
   * @throws {Error} on API error
   */
  async function deleteRecord(resource, id) {
    const res = await apiFetch(`${API_BASE}/api/settings/${resource}/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
  }

  /**
   * Gets Plate Recognizer API key from server.
   * @returns {Promise<string>}
   */
  async function getAnprKey() {
    try {
      const res = await apiFetch(`${API_BASE}/api/settings/app/anpr_key`);
      if (!res.ok) return '';
      const data = await res.json();
      return data.value || '';
    } catch {
      return '';
    }
  }

  /**
   * Saves Plate Recognizer API key to server.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async function setAnprKey(key) {
    await apiFetch(`${API_BASE}/api/settings/app/anpr_key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: (key || '').trim() })
    });
  }

  /**
   * Escapes HTML for safe use in attributes/text.
   * @param {string} s
   * @returns {string}
   */
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /**
   * Populates Raw In dropdowns with suppliers/transporters from database.
   * Side effect: mutates DOM.
   */
  async function populateRawInDropdowns() {
    const supplierSelect = document.getElementById('raw-in-supplier');
    const transporterSelect = document.getElementById('raw-in-transporter');
    if (!supplierSelect || !transporterSelect) return;

    const [suppliers, transporters] = await Promise.all([getSuppliers(), getTransporters()]);

    supplierSelect.innerHTML =
      '<option value="">Select supplier</option>' +
      suppliers.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');

    transporterSelect.innerHTML =
      '<option value="">Select transporter</option>' +
      transporters.map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('');
  }

  /**
   * Populates Raw Out dropdowns with transporters and reasons from database.
   * Side effect: mutates DOM.
   */
  async function populateRawOutDropdowns() {
    const transporterSelect = document.getElementById('raw-out-transporter');
    const reasonSelect = document.getElementById('raw-out-reason');
    if (!transporterSelect && !reasonSelect) return;

    const [transporters, reasons] = await Promise.all([getTransporters(), getReasons()]);

    if (transporterSelect) {
      transporterSelect.innerHTML =
        '<option value="">Select transporter</option>' +
        transporters.map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('');
    }

    if (reasonSelect) {
      reasonSelect.innerHTML =
        '<option value="">Select reason</option>' +
        reasons.map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`).join('');
    }
  }

  /**
   * Renders supplier list in Settings panel.
   */
  async function renderSupplierList() {
    const list = document.getElementById('settings-supplier-list');
    if (!list) return;
    const items = await getSuppliers();
    list.innerHTML =
      items
        .map(
          (item) =>
            `<li class="settings-item"><span>${escapeHtml(item.name)}</span>
       <button type="button" class="settings-remove" data-id="${item.id}" aria-label="Remove">×</button></li>`
        )
        .join('') || '<li class="settings-empty">No suppliers added yet.</li>';
    list.querySelectorAll('.settings-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;
        try {
          await deleteRecord('suppliers', id);
          await renderSupplierList();
          await populateRawInDropdowns();
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not delete'));
        }
      });
    });
  }

  /**
   * Renders material grade list in Settings panel.
   */
  async function renderGradeList() {
    const list = document.getElementById('settings-grade-list');
    if (!list) return;
    const items = await getGrades();
    list.innerHTML =
      items
        .map(
          (item) =>
            `<li class="settings-item"><span>${escapeHtml(item.name)}</span>
       <button type="button" class="settings-remove" data-id="${item.id}" aria-label="Remove">×</button></li>`
        )
        .join('') ||
      '<li class="settings-empty">No material grades added yet. Add grades for the dropdowns.</li>';
    list.querySelectorAll('.settings-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;
        try {
          await deleteRecord('grades', id);
          await renderGradeList();
          if (window.MATERIAL_HUB_RAWIN && typeof window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns();
          }
          if (window.MATERIAL_HUB_RAWOUT && typeof window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns();
          }
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not delete'));
        }
      });
    });
  }

  /**
   * Renders masterbatch grade list in Settings panel.
   */
  async function renderMasterbatchGradeList() {
    const list = document.getElementById('settings-masterbatch-grade-list');
    if (!list) return;
    const items = await getMasterbatchGrades();
    list.innerHTML =
      items
        .map(
          (item) =>
            `<li class="settings-item"><span>${escapeHtml(item.name)}</span>
       <button type="button" class="settings-remove" data-id="${item.id}" aria-label="Remove">×</button></li>`
        )
        .join('') ||
      '<li class="settings-empty">No masterbatch grades added yet.</li>';
    list.querySelectorAll('.settings-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;
        try {
          await deleteRecord('masterbatch_grades', id);
          await renderMasterbatchGradeList();
          if (window.MATERIAL_HUB_RAWIN && typeof window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns();
          }
          if (window.MATERIAL_HUB_RAWOUT && typeof window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns();
          }
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not delete'));
        }
      });
    });
  }

  /**
   * Renders transporter list in Settings panel.
   */
  async function renderTransporterList() {
    const list = document.getElementById('settings-transporter-list');
    if (!list) return;
    const items = await getTransporters();
    list.innerHTML =
      items
        .map(
          (item) =>
            `<li class="settings-item"><span>${escapeHtml(item.name)}</span>
       <button type="button" class="settings-remove" data-id="${item.id}" aria-label="Remove">×</button></li>`
        )
        .join('') || '<li class="settings-empty">No transporters added yet.</li>';
    list.querySelectorAll('.settings-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;
        try {
          await deleteRecord('transporters', id);
          await renderTransporterList();
          await Promise.all([populateRawInDropdowns(), populateRawOutDropdowns()]);
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not delete'));
        }
      });
    });
  }

  /**
   * Renders reason list in Settings panel.
   */
  async function renderReasonList() {
    const list = document.getElementById('settings-reason-list');
    if (!list) return;
    const items = await getReasons();
    list.innerHTML =
      items
        .map(
          (item) =>
            `<li class="settings-item"><span>${escapeHtml(item.name)}</span>
       <button type="button" class="settings-remove" data-id="${item.id}" aria-label="Remove">×</button></li>`
        )
        .join('') || '<li class="settings-empty">No reasons added yet.</li>';
    list.querySelectorAll('.settings-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;
        try {
          await deleteRecord('reasons', id);
          await renderReasonList();
          await populateRawOutDropdowns();
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not delete'));
        }
      });
    });
  }

  /**
   * Renders rework grade list in Settings panel.
   */
  async function renderReworkGradeList() {
    const list = document.getElementById('settings-rework-grade-list');
    if (!list) return;
    const items = await getReworkGrades();
    list.innerHTML =
      items
        .map(
          (item) =>
            `<li class="settings-item"><span>${escapeHtml(item.name)}</span>
       <button type="button" class="settings-remove" data-id="${item.id}" aria-label="Remove">×</button></li>`
        )
        .join('') || '<li class="settings-empty">No rework grades added yet.</li>';
    list.querySelectorAll('.settings-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;
        try {
          await deleteRecord('rework_grades', id);
          await renderReworkGradeList();
          if (window.MATERIAL_HUB_REWORKOUT && typeof window.MATERIAL_HUB_REWORKOUT.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_REWORKOUT.refreshGradesDropdowns();
          }
          if (window.MATERIAL_HUB_REWORKIN && typeof window.MATERIAL_HUB_REWORKIN.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_REWORKIN.refreshGradesDropdowns();
          }
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not delete'));
        }
      });
    });
  }

  /**
   * Renders user list in Settings panel (admin only).
   */
  async function renderUserList() {
    const list = document.getElementById('settings-user-list');
    if (!list) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/users`);
      if (!res.ok) { list.innerHTML = '<li class="settings-empty">Could not load users.</li>'; return; }
      const users = await res.json();
      const currentUser = window.MATERIAL_HUB_AUTH?.getUser();
      list.innerHTML = users.map((u) => {
        const isSelf = currentUser && currentUser.id === u.id;
        return `<li class="settings-item">
          <span>${escapeHtml(u.display_name)} <small>(${escapeHtml(u.username)}, ${u.role})</small></span>
          ${isSelf ? '<small>you</small>' : `<button type="button" class="settings-remove" data-user-id="${u.id}" aria-label="Delete user">×</button>`}
        </li>`;
      }).join('') || '<li class="settings-empty">No users.</li>';

      list.querySelectorAll('.settings-remove[data-user-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = parseInt(btn.dataset.userId, 10);
          if (isNaN(id)) return;
          if (!confirm('Delete this user?')) return;
          try {
            const delRes = await apiFetch(`${API_BASE}/api/users/${id}`, { method: 'DELETE' });
            const data = await delRes.json().catch(() => ({}));
            if (!delRes.ok) throw new Error(data.error || 'Failed to delete');
            await renderUserList();
          } catch (err) {
            alert('Error: ' + (err.message || 'Could not delete'));
          }
        });
      });
    } catch {
      list.innerHTML = '<li class="settings-empty">Could not load users.</li>';
    }
  }

  async function init() {
    await Promise.all([renderSupplierList(), renderTransporterList(), renderGradeList(), renderMasterbatchGradeList(), renderReasonList(), renderReworkGradeList()]);
    await Promise.all([populateRawInDropdowns(), populateRawOutDropdowns()]);

    const supplierInput = document.getElementById('settings-supplier-input');
    const supplierAdd = document.getElementById('settings-supplier-add');
    const transporterInput = document.getElementById('settings-transporter-input');
    const transporterAdd = document.getElementById('settings-transporter-add');

    if (supplierAdd && supplierInput) {
      supplierAdd.addEventListener('click', async () => {
        const name = supplierInput.value.trim();
        if (!name) return;
        try {
          await addRecord('suppliers', name);
          supplierInput.value = '';
          await renderSupplierList();
          await populateRawInDropdowns();
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not add'));
        }
      });
      supplierInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') supplierAdd.click();
      });
    }

    if (transporterAdd && transporterInput) {
      transporterAdd.addEventListener('click', async () => {
        const name = transporterInput.value.trim();
        if (!name) return;
        try {
          await addRecord('transporters', name);
          transporterInput.value = '';
          await renderTransporterList();
          await Promise.all([populateRawInDropdowns(), populateRawOutDropdowns()]);
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not add'));
        }
      });
      transporterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') transporterAdd.click();
      });
    }

    const anprKeyInput = document.getElementById('settings-anpr-key');
    const anprSaveBtn = document.getElementById('settings-anpr-save');
    if (anprSaveBtn && anprKeyInput) {
      const currentKey = await getAnprKey();
      anprKeyInput.placeholder = currentKey ? 'Key configured — enter new to replace' : 'API token (optional)';
      anprSaveBtn.addEventListener('click', async () => {
        await setAnprKey(anprKeyInput.value);
        anprKeyInput.value = '';
        const updatedKey = await getAnprKey();
        anprKeyInput.placeholder = updatedKey ? 'Key configured — enter new to replace' : 'API token (optional)';
      });
    }

    const gradeInput = document.getElementById('settings-grade-input');
    const gradeAdd = document.getElementById('settings-grade-add');
    if (gradeAdd && gradeInput) {
      gradeAdd.addEventListener('click', async () => {
        const name = gradeInput.value.trim();
        if (!name) return;
        try {
          await addRecord('grades', name);
          gradeInput.value = '';
          await renderGradeList();
          if (window.MATERIAL_HUB_RAWIN && typeof window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns();
          }
          if (window.MATERIAL_HUB_RAWOUT && typeof window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns();
          }
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not add'));
        }
      });
      gradeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') gradeAdd.click();
      });
    }

    const reasonInput = document.getElementById('settings-reason-input');
    const reasonAdd = document.getElementById('settings-reason-add');
    if (reasonAdd && reasonInput) {
      reasonAdd.addEventListener('click', async () => {
        const name = reasonInput.value.trim();
        if (!name) return;
        try {
          await addRecord('reasons', name);
          reasonInput.value = '';
          await renderReasonList();
          await populateRawOutDropdowns();
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not add'));
        }
      });
      reasonInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') reasonAdd.click();
      });
    }

    const masterbatchGradeInput = document.getElementById('settings-masterbatch-grade-input');
    const masterbatchGradeAdd = document.getElementById('settings-masterbatch-grade-add');
    if (masterbatchGradeAdd && masterbatchGradeInput) {
      masterbatchGradeAdd.addEventListener('click', async () => {
        const name = masterbatchGradeInput.value.trim();
        if (!name) return;
        try {
          await addRecord('masterbatch_grades', name);
          masterbatchGradeInput.value = '';
          await renderMasterbatchGradeList();
          if (window.MATERIAL_HUB_RAWIN && typeof window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns();
          }
          if (window.MATERIAL_HUB_RAWOUT && typeof window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns();
          }
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not add'));
        }
      });
      masterbatchGradeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') masterbatchGradeAdd.click();
      });
    }

    const reworkGradeInput = document.getElementById('settings-rework-grade-input');
    const reworkGradeAdd = document.getElementById('settings-rework-grade-add');
    if (reworkGradeAdd && reworkGradeInput) {
      reworkGradeAdd.addEventListener('click', async () => {
        const name = reworkGradeInput.value.trim();
        if (!name) return;
        try {
          await addRecord('rework_grades', name);
          reworkGradeInput.value = '';
          await renderReworkGradeList();
          if (window.MATERIAL_HUB_REWORKOUT && typeof window.MATERIAL_HUB_REWORKOUT.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_REWORKOUT.refreshGradesDropdowns();
          }
          if (window.MATERIAL_HUB_REWORKIN && typeof window.MATERIAL_HUB_REWORKIN.refreshGradesDropdowns === 'function') {
            await window.MATERIAL_HUB_REWORKIN.refreshGradesDropdowns();
          }
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not add'));
        }
      });
      reworkGradeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') reworkGradeAdd.click();
      });
    }

    const userAddBtn = document.getElementById('settings-user-add');
    if (userAddBtn) {
      userAddBtn.addEventListener('click', async () => {
        const displayInput = document.getElementById('settings-user-display');
        const usernameInput = document.getElementById('settings-user-username');
        const passwordInput = document.getElementById('settings-user-password');
        const roleSelect = document.getElementById('settings-user-role');
        const display = displayInput?.value?.trim();
        const username = usernameInput?.value?.trim();
        const password = passwordInput?.value;
        const role = roleSelect?.value || 'user';

        if (!username || !password) { alert('Username and password are required'); return; }
        if (password.length < 4) { alert('Password must be at least 4 characters'); return; }

        userAddBtn.disabled = true;
        try {
          const res = await apiFetch(`${API_BASE}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, display_name: display || username, role })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to create user');
          if (displayInput) displayInput.value = '';
          if (usernameInput) usernameInput.value = '';
          if (passwordInput) passwordInput.value = '';
          if (roleSelect) roleSelect.value = 'user';
          await renderUserList();
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not add user'));
        } finally {
          userAddBtn.disabled = false;
        }
      });
    }

    const backupBtn = document.getElementById('settings-backup-btn');
    const restoreBtn = document.getElementById('settings-restore-btn');
    const restoreInput = document.getElementById('settings-restore-input');

    if (backupBtn) {
      backupBtn.addEventListener('click', async () => {
        backupBtn.disabled = true;
        backupBtn.textContent = 'Creating…';
        try {
          const res = await apiFetch(`${API_BASE}/api/settings/backup`);
          if (!res.ok) throw new Error('Backup failed');
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `material-hub-settings-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not create backup'));
        } finally {
          backupBtn.disabled = false;
          backupBtn.textContent = 'Backup settings';
        }
      });
    }

    if (restoreBtn && restoreInput) {
      restoreInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!confirm('Restore will replace ALL current settings. Continue?')) {
          restoreInput.value = '';
          return;
        }
        restoreBtn.disabled = true;
        restoreBtn.textContent = 'Restoring…';
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const res = await apiFetch(`${API_BASE}/api/settings/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const result = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(result.error || 'Restore failed');
          await Promise.all([renderSupplierList(), renderTransporterList(), renderGradeList(), renderMasterbatchGradeList(), renderReasonList(), renderReworkGradeList()]);
          await Promise.all([populateRawInDropdowns(), populateRawOutDropdowns()]);
          const anprInput = document.getElementById('settings-anpr-key');
          if (anprInput) {
            const key = data.app_settings?.find((s) => s.key === 'anpr_key')?.value || '';
            anprInput.placeholder = key ? 'Key configured — enter new to replace' : 'API token (optional)';
          }
          if (window.MATERIAL_HUB_RAWIN?.refreshGradesDropdowns) await window.MATERIAL_HUB_RAWIN.refreshGradesDropdowns();
          if (window.MATERIAL_HUB_RAWOUT?.refreshGradesDropdowns) await window.MATERIAL_HUB_RAWOUT.refreshGradesDropdowns();
          if (window.MATERIAL_HUB_REWORKOUT?.refreshGradesDropdowns) await window.MATERIAL_HUB_REWORKOUT.refreshGradesDropdowns();
          if (window.MATERIAL_HUB_REWORKIN?.refreshGradesDropdowns) await window.MATERIAL_HUB_REWORKIN.refreshGradesDropdowns();
          alert('Settings restored successfully.');
        } catch (err) {
          alert('Error: ' + (err.message || 'Could not restore'));
        } finally {
          restoreBtn.disabled = false;
          restoreBtn.textContent = 'Restore settings';
          restoreInput.value = '';
        }
      });
      restoreBtn.addEventListener('click', () => restoreInput.click());
    }

    initSettingsNav();
  }

  /**
   * Wires up the settings nav list / detail view toggle.
   * Nav items show the target detail panel; back buttons return to the nav list.
   * Side effects: mutates DOM visibility classes.
   */
  function initSettingsNav() {
    const nav = document.getElementById('settings-nav');
    if (!nav) return;

    const details = document.querySelectorAll('.settings-detail');

    /**
     * Shows the nav list and hides all detail panels.
     */
    function showNav() {
      nav.classList.remove('hidden');
      details.forEach((d) => d.classList.add('hidden'));
    }

    /**
     * Shows a specific detail panel and hides the nav list.
     * @param {string} targetId - The id of the detail panel to show.
     */
    function showDetail(targetId) {
      nav.classList.add('hidden');
      details.forEach((d) => {
        d.classList.toggle('hidden', d.id !== targetId);
      });
    }

    nav.querySelectorAll('.settings-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        if (targetId) showDetail(targetId);
        if (targetId === 'settings-detail-users') renderUserList();
      });
    });

    document.querySelectorAll('.settings-back').forEach((btn) => {
      btn.addEventListener('click', showNav);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  window.MATERIAL_HUB_SETTINGS = {
    getSuppliers,
    getTransporters,
    getGrades,
    getGradeNames,
    getMasterbatchGrades,
    getMasterbatchGradeNames,
    getReworkGrades,
    getReworkGradeNames,
    getReasons,
    getReasonNames,
    getAnprKey,
    populateRawInDropdowns,
    populateRawOutDropdowns
  };
})();
