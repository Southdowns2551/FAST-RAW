/**
 * Waste form - date, shift, department, Extrusion-only type, kg and submit logic.
 * Unlike the Raw/Rework forms there is no GPS session or image capture: the
 * operator picks the date manually and all fields are visible immediately.
 */

(function () {
  'use strict';

  const config = window.MATERIAL_HUB_CONFIG || {};
  const API_BASE = config.API_BASE_URL || '';

  const form = document.getElementById('waste-form');
  const dateInput = document.getElementById('waste-date');
  const shiftSelect = document.getElementById('waste-shift');
  const departmentSelect = document.getElementById('waste-department');
  const typeGroup = document.getElementById('waste-type-group');
  const typeSelect = document.getElementById('waste-type');
  const kgInput = document.getElementById('waste-kg');
  const completedByEl = document.getElementById('waste-completed-by');
  const submitBtn = document.getElementById('waste-submit');

  const WASTE_TYPE_DEPARTMENT = 'Extrusion';

  /**
   * Returns today's date as an ISO date string in local time.
   * @returns {string} "YYYY-MM-DD"
   */
  function todayISO() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * Displays the logged-in user's name in the read-only "Completed by" field.
   * The stored value is set server-side from the session, so this is display only.
   * @sideeffect Updates the Completed by output element.
   */
  function showCompletedBy() {
    if (!completedByEl) return;
    const user = window.MATERIAL_HUB_AUTH?.getUser();
    completedByEl.textContent = user ? (user.display_name || user.username) : '—';
  }

  /**
   * Shows or hides the waste type dropdown based on the selected department.
   * Clears and un-requires the field when the department is not Extrusion.
   * @sideeffect Toggles visibility and resets the type select.
   */
  function syncTypeVisibility() {
    if (!typeGroup || !typeSelect || !departmentSelect) return;
    const isExtrusion = departmentSelect.value === WASTE_TYPE_DEPARTMENT;
    typeGroup.classList.toggle('hidden', !isExtrusion);
    typeSelect.required = isExtrusion;
    if (!isExtrusion) typeSelect.value = '';
  }

  /**
   * Resets the form to its initial state after a successful submission.
   * @sideeffect Clears inputs and restores the default date.
   */
  function resetForm() {
    if (form) form.reset();
    if (dateInput) dateInput.value = todayISO();
    syncTypeVisibility();
    showCompletedBy();
  }

  /**
   * Validates the form and posts the Waste submission to the API.
   * @param {SubmitEvent} e - form submit event
   * @returns {Promise<void>}
   * @sideeffect Sends a POST request and resets the form on success.
   */
  async function handleSubmit(e) {
    e.preventDefault();

    const wasteDate = dateInput?.value || '';
    const shift = shiftSelect?.value || '';
    const department = departmentSelect?.value || '';
    const wasteType = typeSelect?.value || '';
    const kgRaw = kgInput?.value ?? '';

    if (!wasteDate) return alert('Please select a date.');
    if (!shift) return alert('Please select a shift.');
    if (!department) return alert('Please select a department.');
    if (department === WASTE_TYPE_DEPARTMENT && !wasteType) {
      return alert('Please select a type.');
    }
    const kg = Number(kgRaw);
    if (kgRaw === '' || !isFinite(kg) || kg < 0) {
      return alert('Please enter a valid weight in kg.');
    }

    const payload = {
      waste_date: wasteDate,
      shift,
      department,
      waste_type: department === WASTE_TYPE_DEPARTMENT ? wasteType : null,
      kg
    };

    if (submitBtn) submitBtn.disabled = true;
    try {
      const authFn = window.MATERIAL_HUB_AUTH?.authFetch || fetch;
      const res = await authFn(`${API_BASE}/api/waste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed');
      }
      resetForm();
      alert('Waste entry saved.');
    } catch (err) {
      alert('Could not save the waste entry: ' + err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  if (dateInput && !dateInput.value) dateInput.value = todayISO();
  showCompletedBy();
  syncTypeVisibility();

  if (departmentSelect) departmentSelect.addEventListener('change', syncTypeVisibility);
  if (form) form.addEventListener('submit', handleSubmit);

  // The panel is revealed by app.js without an event, so refresh the displayed
  // user when the tile is tapped (the session may have changed since page load).
  document.addEventListener('click', (e) => {
    const tile = e.target.closest?.('.grid-tile[data-section="waste"]');
    if (tile) showCompletedBy();
  });
})();
