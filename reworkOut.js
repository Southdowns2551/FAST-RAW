/**
 * Rework Out form - GPS, ANPR/OCR, submit logic.
 * Based on rawOut.js with removed fields: transporter, reason_for_material_out,
 * vehicle_state, damaged_bags, pallets_wrapped. Customer name renamed to
 * recycler_name. Batch number removed from grade rows.
 */

(function () {
  'use strict';

  const config = window.MATERIAL_HUB_CONFIG || {};
  const API_BASE = config.API_BASE_URL || '';

  const sessionEl = document.getElementById('rework-out-session');
  const startedAtEl = document.getElementById('rework-out-started-at');
  const locationEl = document.getElementById('rework-out-location');
  const startBtn = document.getElementById('rework-out-start');
  const scanBtn = document.getElementById('rework-out-scan-reg');
  const scanPreview = document.getElementById('rework-out-scan-preview');
  const vehicleRegInput = document.getElementById('rework-out-vehicle-reg');
  const form = document.getElementById('rework-out-form');
  const gradesCountSelect = document.getElementById('rework-out-grades-count');
  const gradesContainer = document.getElementById('rework-out-grades-container');
  const loadImagesGrid = document.getElementById('rework-out-load-images');
  const captureLoadBtn = document.getElementById('rework-out-capture-load');
  const capturePreview = document.getElementById('rework-out-capture-preview');
  const invoicePreviewEl = document.getElementById('rework-out-invoice-image-preview');
  const captureInvoiceBtn = document.getElementById('rework-out-capture-invoice');
  const invoiceCaptureArea = document.getElementById('rework-out-invoice-capture-area');

  const MAX_LOAD_IMAGES = 4;
  let loadImages = [];
  const MAX_INVOICE_IMAGES = 5;
  let invoiceImages = [];

  let sessionData = {
    started_at: null,
    location_street: null,
    location_area: null,
    lat: null,
    lng: null
  };

  /**
   * Formats date as MySQL-compatible datetime string.
   * @param {Date} d
   * @returns {string}
   */
  function toISODateTime(d) {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  /**
   * Reverse geocodes lat/lng to street and area via Nominatim.
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<{street:string, area:string}>}
   */
  async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' }, signal: ctrl.signal });
    clearTimeout(id);
    const data = await res.json();
    const addr = data.address || {};
    const road = addr.road || addr.street || addr.pedestrian || '';
    const suburb = addr.suburb || addr.neighbourhood || addr.village || '';
    const city = addr.city || addr.town || addr.municipality || '';
    const area = [suburb, city].filter(Boolean).join(', ');
    return { street: road || 'Unknown', area: area || 'Unknown' };
  }

  /**
   * Handles Start button click: timestamp, GPS, geocode.
   * Side effect: updates sessionData and DOM.
   */
  async function handleStart() {
    if (!startBtn) return;
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';
    const now = new Date();
    sessionData.started_at = toISODateTime(now);
    startedAtEl.textContent = now.toLocaleString();
    locationEl.textContent = 'Getting location…';
    sessionEl.classList.remove('hidden');

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });
      const { latitude, longitude } = pos.coords;
      sessionData.lat = latitude;
      sessionData.lng = longitude;
      const { street, area } = await reverseGeocode(latitude, longitude);
      sessionData.location_street = street;
      sessionData.location_area = area;
      locationEl.textContent = `${street} ${area ? '• ' + area : ''}`.trim() || '—';
    } catch {
      locationEl.textContent = 'Location unavailable';
      sessionData.location_street = null;
      sessionData.location_area = null;
    }

    startBtn.textContent = 'Started';
    startBtn.disabled = false;

    const checkedByEl = document.getElementById('rework-out-checked-by');
    if (checkedByEl && !checkedByEl.value) {
      const user = window.MATERIAL_HUB_AUTH?.getUser();
      if (user) checkedByEl.value = user.display_name || user.username;
    }
  }

  /**
   * Runs ANPR via Plate Recognizer API.
   * @param {Blob} imageBlob
   * @returns {Promise<string|null>}
   */
  async function recognizePlateAnpr(imageBlob) {
    const settings = window.MATERIAL_HUB_SETTINGS;
    const token = (settings?.getAnprKey ? await settings.getAnprKey() : '') || '';
    if (!token.trim()) return null;
    const fd = new FormData();
    fd.append('upload', imageBlob, 'plate.jpg');
    fd.append('regions', 'za');
    const res = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: { Authorization: 'Token ' + token.trim() },
      body: fd
    });
    if (!res.ok) return null;
    const data = await res.json();
    const plate = data.results?.[0]?.plate;
    return plate ? String(plate).trim() : null;
  }

  /**
   * Runs Tesseract OCR for registration text (fallback).
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<string|null>}
   */
  async function recognizePlateOcr(canvas) {
    if (!window.Tesseract) return null;
    const { data } = await Tesseract.recognize(canvas.toDataURL('image/jpeg'), 'eng', { logger: () => {} });
    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    const regMatch = text.match(/[A-Z]{2,3}\s*\d{2,6}\s*[A-Z]{2,3}|[A-Z]{2,3}\s*-\s*\d{2,6}\s*[A-Z]{2,3}|\d{2,6}\s*[A-Z]{2,3}/i);
    return regMatch ? regMatch[0].replace(/\s+/g, ' ') : text.slice(0, 20) || null;
  }

  /**
   * Captures image from camera and runs ANPR (or OCR fallback).
   * Uses shared fullscreen camera module.
   * Side effect: opens camera overlay, updates vehicle registration input.
   */
  async function handleScan() {
    if (!scanBtn || !vehicleRegInput) return;
    scanBtn.disabled = true;
    scanBtn.textContent = 'Loading…';
    scanPreview.classList.remove('hidden');
    scanPreview.innerHTML = '<p>Opening camera…</p>';

    const cam = window.MATERIAL_HUB_CAMERA;
    await cam.openCamera({
      mode: 'single',
      maxDim: 1280,
      quality: 0.9,
      onPhoto: async function (_dataUri, canvas) {
        scanPreview.innerHTML = '<p>Running ANPR…</p>';
        let plate = null;
        const blob = await new Promise((cb) => canvas.toBlob(cb, 'image/jpeg', 0.9));
        if (blob && navigator.onLine) {
          plate = await recognizePlateAnpr(blob);
        }
        if (!plate && window.Tesseract) {
          scanPreview.innerHTML = '<p>Using OCR fallback…</p>';
          plate = await recognizePlateOcr(canvas);
        }
        vehicleRegInput.value = plate || '';
        scanPreview.classList.add('hidden');
        scanPreview.innerHTML = '';
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan with camera';
      },
      onCancel: function () {
        scanPreview.classList.add('hidden');
        scanPreview.innerHTML = '';
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan with camera';
      },
      onDone: function () {}
    });
  }

  /**
   * Gets rework grade names from Settings (separate list from material grades).
   * @returns {Promise<string[]>}
   */
  async function getMaterialGrades() {
    const settings = window.MATERIAL_HUB_SETTINGS;
    if (settings && settings.getReworkGradeNames) return await settings.getReworkGradeNames();
    return [];
  }

  /**
   * Escapes HTML for safe use in attributes/text.
   * @param {string} s
   * @returns {string}
   */
  function escapeHtmlAttr(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /**
   * Renders grade dropdowns with Total Kg input based on number selected.
   * Side effect: mutates DOM.
   */
  async function refreshGradesDropdowns() {
    if (!gradesContainer || !gradesCountSelect) return;
    const n = parseInt(gradesCountSelect.value, 10) || 0;
    const grades = await getMaterialGrades();
    gradesContainer.innerHTML = '';
    gradesContainer.classList.toggle('hidden', n === 0);
    for (let i = 0; i < n; i++) {
      const idx = i + 1;
      const group = document.createElement('div');
      group.className = 'grade-batch-group';
      const gradeLabel = document.createElement('label');
      gradeLabel.htmlFor = 'rework-out-grade-' + idx;
      gradeLabel.textContent = 'Material grade ' + idx;
      const select = document.createElement('select');
      select.id = 'rework-out-grade-' + idx;
      select.name = 'grade_' + idx;
      select.required = n > 0;
      select.innerHTML = '<option value="">Select material grade</option>' +
        grades.map((g) => `<option value="${escapeHtmlAttr(g)}">${escapeHtmlAttr(g)}</option>`).join('');
      group.appendChild(gradeLabel);
      group.appendChild(select);
      const totalKgLabel = document.createElement('label');
      totalKgLabel.htmlFor = 'rework-out-totalkg-' + idx;
      totalKgLabel.textContent = 'Total Kg';
      const totalKgInput = document.createElement('input');
      totalKgInput.type = 'number';
      totalKgInput.min = '0';
      totalKgInput.step = '0.01';
      totalKgInput.placeholder = 'Total Kg';
      totalKgInput.id = 'rework-out-totalkg-' + idx;
      totalKgInput.name = 'totalkg_' + idx;
      group.appendChild(totalKgLabel);
      group.appendChild(totalKgInput);
      gradesContainer.appendChild(group);
    }
  }

  /**
   * Renders thumbnail grid of captured load images with remove buttons.
   * Tap on thumbnail to view fullscreen. Hides capture button when max reached.
   * Side effect: mutates DOM.
   */
  function renderLoadImageGrid() {
    if (!loadImagesGrid) return;
    loadImagesGrid.innerHTML = '';
    loadImages.forEach((dataUri, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'load-img-wrapper';
      const img = document.createElement('img');
      img.src = dataUri;
      img.className = 'load-img-thumb';
      img.alt = 'Load image ' + (idx + 1);
      img.addEventListener('click', () => {
        if (window.MATERIAL_HUB_LIGHTBOX) window.MATERIAL_HUB_LIGHTBOX.show(dataUri);
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'load-img-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', 'Remove image ' + (idx + 1));
      removeBtn.addEventListener('click', () => {
        loadImages.splice(idx, 1);
        renderLoadImageGrid();
      });
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      loadImagesGrid.appendChild(wrapper);
    });
    if (captureLoadBtn) {
      captureLoadBtn.classList.toggle('hidden', loadImages.length >= MAX_LOAD_IMAGES);
    }
  }

  /**
   * Opens fullscreen camera to capture load images in multi-photo continuous mode.
   * Uses shared camera module. Up to MAX_LOAD_IMAGES photos.
   * Side effect: opens camera overlay, updates loadImages array.
   */
  async function handleCaptureLoad() {
    if (!captureLoadBtn || loadImages.length >= MAX_LOAD_IMAGES) return;

    const cam = window.MATERIAL_HUB_CAMERA;
    await cam.openCamera({
      mode: 'multi',
      maxPhotos: MAX_LOAD_IMAGES - loadImages.length,
      maxDim: 1200,
      quality: 0.7,
      onPhoto: function (dataUri) {
        loadImages.push(dataUri);
        renderLoadImageGrid();
      },
      onCancel: function () {},
      onDone: function () {}
    });
  }

  /**
   * Renders thumbnail grid of captured invoice images with remove buttons.
   * Tap on thumbnail to view fullscreen. Hides capture button when max reached.
   * Side effect: mutates DOM.
   */
  function renderInvoiceImagePreview() {
    if (!invoicePreviewEl) return;
    invoicePreviewEl.innerHTML = '';
    invoiceImages.forEach((dataUri, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'load-img-wrapper';
      const img = document.createElement('img');
      img.src = dataUri;
      img.className = 'load-img-thumb';
      img.alt = 'Invoice image ' + (idx + 1);
      img.addEventListener('click', () => {
        if (window.MATERIAL_HUB_LIGHTBOX) window.MATERIAL_HUB_LIGHTBOX.show(dataUri);
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'load-img-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', 'Remove invoice image ' + (idx + 1));
      removeBtn.addEventListener('click', () => {
        invoiceImages.splice(idx, 1);
        renderInvoiceImagePreview();
      });
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      invoicePreviewEl.appendChild(wrapper);
    });
    if (captureInvoiceBtn) {
      captureInvoiceBtn.classList.toggle('hidden', invoiceImages.length >= MAX_INVOICE_IMAGES);
    }
  }

  /**
   * Opens fullscreen camera to capture invoice / delivery note photos (up to 5).
   * Uses shared camera module in multi-photo mode.
   * Side effect: opens camera overlay, updates invoiceImages array.
   */
  async function handleCaptureInvoice() {
    if (!captureInvoiceBtn || invoiceImages.length >= MAX_INVOICE_IMAGES) return;

    const cam = window.MATERIAL_HUB_CAMERA;
    await cam.openCamera({
      mode: 'multi',
      maxPhotos: MAX_INVOICE_IMAGES - invoiceImages.length,
      maxDim: 1200,
      quality: 0.7,
      onPhoto: function (dataUri) {
        invoiceImages.push(dataUri);
        renderInvoiceImagePreview();
      },
      onCancel: function () {},
      onDone: function () {}
    });
  }

  /**
   * Collects grades_sent from the dynamic dropdowns and Total Kg inputs.
   * @returns {{grade:string, total_kg:number|null}[]}
   */
  function getGradesSent() {
    const n = parseInt(gradesCountSelect?.value, 10) || 0;
    const arr = [];
    for (let i = 1; i <= n; i++) {
      const gradeEl = form.querySelector('[name="grade_' + i + '"]');
      const grade = gradeEl?.value?.trim() || null;
      const totalKgEl = form.querySelector('[name="totalkg_' + i + '"]');
      const totalKgVal = totalKgEl?.value;
      const total_kg = totalKgVal !== undefined && totalKgVal !== '' ? parseFloat(totalKgVal) : null;
      if (grade) arr.push({ grade, total_kg: isNaN(total_kg) ? null : total_kg });
    }
    return arr;
  }

  /**
   * Submits form data to API and triggers email report.
   * @param {Event} e - Submit event
   */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!form) return;

    if (loadImages.length < 1) {
      alert('Please take at least 1 photo of the load before submitting.');
      return;
    }

    const completedBtn = document.getElementById('rework-out-completed');
    if (completedBtn) completedBtn.disabled = true;

    const PREFIX = 'data:image/jpeg;base64,';
    const payload = {
      started_at: sessionData.started_at,
      location_street: sessionData.location_street,
      location_area: sessionData.location_area,
      location_lat: sessionData.lat,
      location_lng: sessionData.lng,
      recycler_name: form.elements.recycler_name?.value?.trim() || null,
      grades_sent: getGradesSent(),
      vehicle_registration: form.elements.vehicle_registration?.value?.trim() || null,
      load_images: loadImages.map((uri) => uri.startsWith(PREFIX) ? uri.slice(PREFIX.length) : uri),
      driver_name: form.elements.driver_name?.value?.trim() || null,
      invoice_number: form.elements.invoice_number?.value?.trim() || null,
      invoice_images: invoiceImages.map((uri) => uri.startsWith(PREFIX) ? uri.slice(PREFIX.length) : uri),
      additional_comments: form.elements.additional_comments?.value?.trim() || null,
      checked_by: form.elements.checked_by?.value?.trim() || null,
      completed_at: toISODateTime(new Date())
    };

    try {
      const authFn = window.MATERIAL_HUB_AUTH?.authFetch || fetch;
      const res = await authFn(`${API_BASE}/api/rework-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      alert('Submission saved. Report sent to reports@italpac.co.za');
      form.reset();
      loadImages = [];
      invoiceImages = [];
      renderLoadImageGrid();
      renderInvoiceImagePreview();
      refreshGradesDropdowns();
      sessionEl.classList.add('hidden');
      sessionData = { started_at: null, location_street: null, location_area: null, lat: null, lng: null };
      if (startBtn) startBtn.textContent = 'Start';
    } catch (err) {
      alert('Error: ' + (err.message || 'Could not save'));
    } finally {
      if (completedBtn) completedBtn.disabled = false;
    }
  }

  if (gradesCountSelect) {
    gradesCountSelect.addEventListener('change', refreshGradesDropdowns);
  }

  if (startBtn) startBtn.addEventListener('click', handleStart);
  if (scanBtn) scanBtn.addEventListener('click', handleScan);
  if (captureLoadBtn) captureLoadBtn.addEventListener('click', handleCaptureLoad);
  if (captureInvoiceBtn) captureInvoiceBtn.addEventListener('click', handleCaptureInvoice);
  if (form) form.addEventListener('submit', handleSubmit);

  window.MATERIAL_HUB_REWORKOUT = { refreshGradesDropdowns };
})();
