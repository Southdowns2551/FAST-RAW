/**
 * Portal - view and filter all submission data.
 * Provides search, card-based results, and a detail modal with images.
 */

(function () {
  'use strict';

  const config = window.MATERIAL_HUB_CONFIG || {};
  const API = config.API_BASE_URL || '';

  /**
   * Auth-aware fetch wrapper.
   * @param {string} url
   * @param {RequestInit} [opts]
   * @returns {Promise<Response>}
   */
  function apiFetch(url, opts) {
    const auth = window.MATERIAL_HUB_AUTH;
    if (auth && auth.authFetch) return auth.authFetch(url, opts);
    return fetch(url, opts);
  }

  const TYPE_LABELS = {
    raw_in: 'Raw In',
    raw_out: 'Raw Out',
    rework_in: 'Rework In',
    rework_out: 'Rework Out',
    waste: 'Waste'
  };

  const TYPE_COLORS = {
    raw_in: 'portal-badge-blue',
    raw_out: 'portal-badge-orange',
    rework_in: 'portal-badge-green',
    rework_out: 'portal-badge-purple',
    waste: 'portal-badge-teal'
  };

  let currentPage = 1;
  let currentTotal = 0;
  let currentLimit = 25;
  let currentDetailType = '';
  let currentDetailId = 0;

  const resultsEl = document.getElementById('portal-results');
  const paginationEl = document.getElementById('portal-pagination');
  const prevBtn = document.getElementById('portal-prev');
  const nextBtn = document.getElementById('portal-next');
  const pageInfo = document.getElementById('portal-page-info');
  const searchBtn = document.getElementById('portal-search');
  const typeSelect = document.getElementById('portal-type');
  const fromInput = document.getElementById('portal-from');
  const toInput = document.getElementById('portal-to');
  const supplierInput = document.getElementById('portal-supplier');
  const gradeSelect = document.getElementById('portal-grade');
  const departmentSelect = document.getElementById('portal-department');
  const departmentGroup = document.getElementById('portal-department-group');
  const supplierGroup = document.getElementById('portal-supplier-group');
  const gradeGroup = document.getElementById('portal-grade-group');
  const summaryEl = document.getElementById('portal-summary');

  const modal = document.getElementById('portal-detail-modal');
  const modalTitle = document.getElementById('portal-detail-title');
  const modalBody = document.getElementById('portal-detail-body');
  const modalClose = document.getElementById('portal-detail-close');

  const lightbox = document.getElementById('portal-lightbox');
  const lightboxImg = document.getElementById('portal-lightbox-img');
  const lightboxClose = document.getElementById('portal-lightbox-close');

  /**
   * Escapes HTML entities for safe insertion.
   * @param {string} s
   * @returns {string}
   */
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /**
   * Formats a date string for display.
   * @param {string} d
   * @returns {string}
   */
  function fmtDate(d) {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(d);
    }
  }

  /**
   * Formats a date string for display without the time component.
   * Used for Waste rows, where started_at holds the selected date only.
   * @param {string} d
   * @returns {string}
   */
  function fmtDateOnly(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return String(d);
    }
  }

  /**
   * Formats a grades JSON string into a short summary.
   * @param {string|Array} raw
   * @returns {string}
   */
  function fmtGrades(raw) {
    if (!raw) return '—';
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr) || arr.length === 0) return '—';
      return arr.map((g) => {
        if (typeof g === 'object' && g.grade) {
          const kg = g.total_kg != null ? ' — ' + g.total_kg + ' kg' : '';
          return g.grade + kg;
        }
        return String(g);
      }).join(', ');
    } catch {
      return '—';
    }
  }

  /**
   * Populates the grade filter dropdown from settings API.
   */
  async function loadGradeOptions() {
    if (!gradeSelect) return;
    try {
      const [grades, masterbatchGrades, reworkGrades] = await Promise.all([
        apiFetch(`${API}/api/settings/grades`).then((r) => r.ok ? r.json() : []),
        apiFetch(`${API}/api/settings/masterbatch_grades`).then((r) => r.ok ? r.json() : []),
        apiFetch(`${API}/api/settings/rework_grades`).then((r) => r.ok ? r.json() : [])
      ]);
      const all = [...grades, ...masterbatchGrades, ...reworkGrades];
      const unique = [...new Set(all.map((g) => g.name))].sort();
      gradeSelect.innerHTML = '<option value="">All grades</option>' +
        unique.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    } catch { /* keep default */ }
  }

  /**
   * Shows the filters that apply to the selected type and hides the rest.
   * Hidden filters are cleared so a stale value cannot silently narrow the
   * query: a grade excludes all waste rows, a department excludes all others.
   * @sideeffect Toggles filter visibility and resets the hidden inputs.
   */
  function syncFilterVisibility() {
    const isWaste = typeSelect?.value === 'waste';
    if (departmentGroup) departmentGroup.classList.toggle('hidden', !isWaste);
    if (supplierGroup) supplierGroup.classList.toggle('hidden', isWaste);
    if (gradeGroup) gradeGroup.classList.toggle('hidden', isWaste);
    if (isWaste) {
      if (supplierInput) supplierInput.value = '';
      if (gradeSelect) gradeSelect.value = '';
    } else if (departmentSelect) {
      departmentSelect.value = '';
    }
  }

  /**
   * Formats a kg value with thousands separators and two decimals.
   * @param {number} kg
   * @returns {string}
   */
  function fmtKg(kg) {
    return Number(kg || 0).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /**
   * Renders the waste total for the filtered period, with a per-department
   * breakdown when no single department is selected.
   * @param {{total_kg: number, by_department: Array}|null} totals
   */
  function renderSummary(totals) {
    if (!summaryEl) return;
    if (!totals || !totals.by_department || totals.by_department.length === 0) {
      summaryEl.classList.add('hidden');
      summaryEl.innerHTML = '';
      return;
    }

    const showBreakdown = totals.by_department.length > 1;
    const breakdown = showBreakdown
      ? `<div class="portal-summary-breakdown">${totals.by_department.map((d) => `
          <span class="portal-summary-chip"><strong>${esc(d.department)}</strong> ${fmtKg(d.total_kg)} kg</span>
        `).join('')}</div>`
      : '';

    summaryEl.innerHTML = `
      <div class="portal-summary-total">Total waste: <strong>${fmtKg(totals.total_kg)} kg</strong></div>
      ${breakdown}`;
    summaryEl.classList.remove('hidden');
  }

  /**
   * Fetches submissions from the portal API with current filter state.
   * @param {number} page
   */
  async function fetchSubmissions(page) {
    if (!resultsEl) return;
    currentPage = page;
    resultsEl.innerHTML = '<p class="portal-loading">Loading...</p>';

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(currentLimit));
    if (typeSelect?.value && typeSelect.value !== 'all') params.set('type', typeSelect.value);
    if (fromInput?.value) params.set('from', fromInput.value);
    if (toInput?.value) params.set('to', toInput.value);
    if (supplierInput?.value?.trim()) params.set('supplier', supplierInput.value.trim());
    if (gradeSelect?.value) params.set('grade', gradeSelect.value);
    if (departmentSelect?.value) params.set('department', departmentSelect.value);

    try {
      const res = await apiFetch(`${API}/api/portal/submissions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      currentTotal = data.total;
      renderResults(data.rows);
      renderSummary(data.waste_totals);
      renderPagination(data.page, data.limit, data.total);
    } catch (err) {
      resultsEl.innerHTML = '<p class="portal-empty">Error loading submissions. Please try again.</p>';
      renderSummary(null);
      if (paginationEl) paginationEl.classList.add('hidden');
    }
  }

  /**
   * Renders submission cards into the results container.
   * @param {Array} rows
   */
  function renderResults(rows) {
    if (!resultsEl) return;
    if (!rows || rows.length === 0) {
      resultsEl.innerHTML = '<p class="portal-empty">No submissions found matching your filters.</p>';
      return;
    }

    resultsEl.innerHTML = rows.map((row) => {
      const isWaste = row.type === 'waste';
      const body = isWaste
        ? `<div class="portal-card-field"><strong>Department:</strong> ${esc(row.entity_name || '—')}</div>
          <div class="portal-card-field"><strong>Shift:</strong> ${esc(row.shift || '—')}</div>
          <div class="portal-card-field"><strong>Kg:</strong> ${esc(row.kg == null ? '—' : String(row.kg))}</div>`
        : `<div class="portal-card-field"><strong>Entity:</strong> ${esc(row.entity_name || '—')}</div>
          <div class="portal-card-field"><strong>Vehicle:</strong> ${esc(row.vehicle_registration || '—')}</div>
          <div class="portal-card-field"><strong>Grades:</strong> ${esc(fmtGrades(row.grades_json))}</div>
          <div class="portal-card-field"><strong>Invoice:</strong> ${esc(row.invoice_number || '—')}</div>`;
      return `
      <div class="portal-card" data-type="${esc(row.type)}" data-id="${row.id}">
        <div class="portal-card-header">
          <span class="portal-badge ${TYPE_COLORS[row.type] || ''}">${esc(TYPE_LABELS[row.type] || row.type)}</span>
          <span class="portal-card-date">${isWaste ? fmtDateOnly(row.started_at) : fmtDate(row.started_at)}</span>
        </div>
        <div class="portal-card-body">
          ${body}
        </div>
        <div class="portal-card-footer">
          <span class="portal-card-meta">${isWaste ? 'Completed by' : 'Checked by'}: ${esc(row.checked_by || '—')}</span>
          <span class="portal-card-meta">#${row.id}</span>
        </div>
      </div>
    `;
    }).join('');

    resultsEl.querySelectorAll('.portal-card').forEach((card) => {
      card.addEventListener('click', () => {
        openDetail(card.dataset.type, parseInt(card.dataset.id, 10));
      });
    });
  }

  /**
   * Updates pagination controls.
   * @param {number} page
   * @param {number} limit
   * @param {number} total
   */
  function renderPagination(page, limit, total) {
    if (!paginationEl) return;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (total === 0) {
      paginationEl.classList.add('hidden');
      return;
    }
    paginationEl.classList.remove('hidden');
    if (pageInfo) pageInfo.textContent = `Page ${page} of ${totalPages} (${total} results)`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  /**
   * Opens the detail modal for a specific submission.
   * @param {string} type
   * @param {number} id
   */
  async function openDetail(type, id) {
    if (!modal || !modalBody) return;
    currentDetailType = type;
    currentDetailId = id;

    modalBody.innerHTML = '<p class="portal-loading">Loading...</p>';
    if (modalTitle) modalTitle.textContent = `${TYPE_LABELS[type] || type} #${id}`;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    try {
      const res = await apiFetch(`${API}/api/portal/submissions/${type}/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const row = await res.json();
      renderDetail(row);
    } catch {
      modalBody.innerHTML = '<p class="portal-empty">Error loading submission detail.</p>';
    }
  }

  /**
   * Renders full detail view inside the modal.
   * @param {Object} row - full submission record
   */
  function renderDetail(row) {
    if (!modalBody) return;
    const f = (v) => (v == null || v === '') ? '—' : esc(String(v));
    const type = row.type;

    if (type === 'waste') {
      modalBody.innerHTML = `
        <table class="portal-detail-table">
          <tr><td>Report ID</td><td>${row.id}</td></tr>
          <tr><td>Date</td><td>${fmtDateOnly(row.started_at)}</td></tr>
          <tr><td>Shift</td><td>${f(row.shift)}</td></tr>
          <tr><td>Department</td><td>${f(row.department)}</td></tr>
          <tr><td>Type</td><td>${f(row.waste_type)}</td></tr>
          <tr><td>Kg</td><td>${f(row.kg)}</td></tr>
          <tr><td>Completed by</td><td>${f(row.completed_by)}</td></tr>
          <tr><td>Completed</td><td>${fmtDate(row.completed_at)}</td></tr>
        </table>`;
      return;
    }

    let fields = `
      <tr><td>Report ID</td><td>${row.id}</td></tr>
      <tr><td>Date & Time</td><td>${fmtDate(row.started_at)}</td></tr>
      <tr><td>Completed</td><td>${fmtDate(row.completed_at)}</td></tr>
      <tr><td>Location</td><td>${f(row.location_street)} ${f(row.location_area)}</td></tr>`;

    if (type === 'raw_in') {
      fields += `<tr><td>Supplier</td><td>${f(row.supplier)}</td></tr>`;
      fields += `<tr><td>Transporter</td><td>${f(row.transporter)}</td></tr>`;
      fields += `<tr><td>Grades received</td><td>${esc(fmtGrades(row.grades_received))}</td></tr>`;
    } else if (type === 'raw_out') {
      fields += `<tr><td>Customer</td><td>${f(row.customer_name)}</td></tr>`;
      fields += `<tr><td>Transporter</td><td>${f(row.transporter)}</td></tr>`;
      fields += `<tr><td>Reason</td><td>${f(row.reason_for_material_out)}</td></tr>`;
      fields += `<tr><td>Grades sent</td><td>${esc(fmtGrades(row.grades_sent))}</td></tr>`;
    } else if (type === 'rework_out') {
      fields += `<tr><td>Recycler</td><td>${f(row.recycler_name)}</td></tr>`;
      fields += `<tr><td>Grades sent</td><td>${esc(fmtGrades(row.grades_sent))}</td></tr>`;
    } else if (type === 'rework_in') {
      fields += `<tr><td>Recycler</td><td>${f(row.recycler_name)}</td></tr>`;
      fields += `<tr><td>Grades received</td><td>${esc(fmtGrades(row.grades_received))}</td></tr>`;
    }

    fields += `<tr><td>Vehicle registration</td><td>${f(row.vehicle_registration)}</td></tr>`;

    if (type === 'raw_in') {
      fields += `<tr><td>Vehicle state</td><td>${f(row.vehicle_state)}</td></tr>`;
      fields += `<tr><td>Damaged bags</td><td>${f(row.damaged_bags)}</td></tr>`;
      fields += `<tr><td>Pallets wrapped</td><td>${f(row.pallets_wrapped)}</td></tr>`;
    }
    if (type === 'raw_out') {
      fields += `<tr><td>Vehicle state</td><td>${f(row.vehicle_state)}</td></tr>`;
      fields += `<tr><td>Damaged bags</td><td>${f(row.damaged_bags)}</td></tr>`;
      fields += `<tr><td>Pallets wrapped</td><td>${f(row.pallets_wrapped)}</td></tr>`;
    }

    fields += `
      <tr><td>Driver name</td><td>${f(row.driver_name)}</td></tr>
      <tr><td>Invoice / DN #</td><td>${f(row.invoice_number)}</td></tr>
      <tr><td>Checked by</td><td>${f(row.checked_by)}</td></tr>
      <tr><td>Comments</td><td>${f(row.additional_comments)}</td></tr>`;

    let imagesHtml = '';
    const loadImgs = parseImages(row.load_images);
    const invoiceImgs = parseInvoiceImages(row.invoice_image);

    if (loadImgs.length > 0 || invoiceImgs.length > 0) {
      imagesHtml = '<div class="portal-detail-images"><h4>Images</h4><div class="portal-detail-thumbs">';
      loadImgs.forEach((imgPath) => {
        const filename = imgPath.split('/').pop();
        const src = `${API}/api/portal/images/${type}/${row.id}/${filename}`;
        imagesHtml += `<img class="portal-thumb" src="${src}" alt="Load image" loading="lazy">`;
      });
      invoiceImgs.forEach((imgPath, idx) => {
        const filename = imgPath.split('/').pop();
        const src = `${API}/api/portal/images/${type}/${row.id}/${filename}`;
        imagesHtml += `<img class="portal-thumb" src="${src}" alt="Invoice image ${idx + 1}" loading="lazy">`;
      });
      imagesHtml += '</div></div>';
    }

    modalBody.innerHTML = `
      <table class="portal-detail-table">${fields}</table>
      ${imagesHtml}`;

    modalBody.querySelectorAll('.portal-thumb').forEach((img) => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(img.src);
      });
    });
  }

  /**
   * Parses load_images JSON into an array of paths.
   * @param {string|Array} raw
   * @returns {string[]}
   */
  function parseImages(raw) {
    if (!raw) return [];
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /**
   * Parses invoice_image column into an array of paths.
   * Handles both legacy single-path strings and new JSON array format.
   * @param {string|null} raw
   * @returns {string[]}
   */
  function parseInvoiceImages(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  }

  /**
   * Opens the image lightbox.
   * @param {string} src - image URL
   */
  function openLightbox(src) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightbox.classList.remove('hidden');
  }

  /**
   * Closes the image lightbox.
   */
  function closeLightbox() {
    if (!lightbox || !lightboxImg) return;
    lightbox.classList.add('hidden');
    lightboxImg.src = '';
  }

  /**
   * Closes the detail modal.
   */
  function closeDetail() {
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  if (typeSelect) typeSelect.addEventListener('change', syncFilterVisibility);
  if (searchBtn) searchBtn.addEventListener('click', () => fetchSubmissions(1));
  if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) fetchSubmissions(currentPage - 1); });
  if (nextBtn) nextBtn.addEventListener('click', () => { const tp = Math.ceil(currentTotal / currentLimit); if (currentPage < tp) fetchSubmissions(currentPage + 1); });
  if (modalClose) modalClose.addEventListener('click', closeDetail);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeDetail(); });
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

  if (supplierInput) {
    supplierInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchSubmissions(1); });
  }

  syncFilterVisibility();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadGradeOptions());
  } else {
    loadGradeOptions();
  }
})();
