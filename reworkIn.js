/**
 * Rework In form - GPS, ANPR/OCR, submit logic.
 * Duplicate of Rework Out with: "Number of grades received", rework grades from Settings,
 * and Total Kg below each grade dropdown.
 */

(function () {
  'use strict';

  const config = window.MATERIAL_HUB_CONFIG || {};
  const API_BASE = config.API_BASE_URL || '';

  const sessionEl = document.getElementById('rework-in-session');
  const startedAtEl = document.getElementById('rework-in-started-at');
  const locationEl = document.getElementById('rework-in-location');
  const startBtn = document.getElementById('rework-in-start');
  const scanBtn = document.getElementById('rework-in-scan-reg');
  const scanPreview = document.getElementById('rework-in-scan-preview');
  const vehicleRegInput = document.getElementById('rework-in-vehicle-reg');
  const form = document.getElementById('rework-in-form');
  const gradesCountSelect = document.getElementById('rework-in-grades-count');
  const gradesContainer = document.getElementById('rework-in-grades-container');
  const loadImagesGrid = document.getElementById('rework-in-load-images');
  const captureLoadBtn = document.getElementById('rework-in-capture-load');
  const capturePreview = document.getElementById('rework-in-capture-preview');
  const invoicePreviewEl = document.getElementById('rework-in-invoice-image-preview');
  const captureInvoiceBtn = document.getElementById('rework-in-capture-invoice');
  const invoiceCaptureArea = document.getElementById('rework-in-invoice-capture-area');

  const MAX_LOAD_IMAGES = 4;
  let loadImages = [];
  let invoiceImage = null;

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
    const btn = document.getElementById('rework-in-start');
    const session = document.getElementById('rework-in-session');
    const startedAt = document.getElementById('rework-in-started-at');
    const locEl = document.getElementById('rework-in-location');
    if (!session) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Starting…';
    }
    const now = new Date();
    sessionData.started_at = toISODateTime(now);
    if (startedAt) startedAt.textContent = now.toLocaleString();
    if (locEl) locEl.textContent = 'Getting location…';
    session.classList.remove('hidden');

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
      if (locEl) locEl.textContent = `${street} ${area ? '• ' + area : ''}`.trim() || '—';
    } catch {
      if (locEl) locEl.textContent = 'Location unavailable';
      sessionData.location_street = null;
      sessionData.location_area = null;
    }

    if (btn) {
      btn.textContent = 'Started';
      btn.disabled = false;
    }

    const checkedByEl = document.getElementById('rework-in-checked-by');
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
   * Side effect: shows camera preview, updates vehicle registration input.
   */
  async function handleScan() {
    if (!scanBtn || !vehicleRegInput) return;
    scanBtn.disabled = true;
    scanBtn.textContent = 'Loading…';
    scanPreview.classList.remove('hidden');
    scanPreview.innerHTML = '<p>Starting camera…</p>';

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
      }
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.style.display = 'block';
      video.style.maxWidth = '100%';
      scanPreview.innerHTML = '';
      scanPreview.appendChild(video);

      const captureBtn = document.createElement('button');
      captureBtn.type = 'button';
      captureBtn.className = 'btn-primary';
      captureBtn.textContent = 'Capture & read';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Cancel';

      const actions = document.createElement('div');
      actions.className = 'scan-actions';
      actions.appendChild(captureBtn);
      actions.appendChild(cancelBtn);
      scanPreview.appendChild(actions);

      await new Promise((r) => { video.onloadedmetadata = r; });
      try { await video.play(); } catch (_) {}

      cancelBtn.addEventListener('click', () => {
        stream.getTracks().forEach((t) => t.stop());
        scanPreview.classList.add('hidden');
        scanPreview.innerHTML = '';
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan with camera';
      });

      captureBtn.addEventListener('click', async () => {
        captureBtn.disabled = true;
        captureBtn.textContent = 'Reading…';
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        stream.getTracks().forEach((t) => t.stop());

        let plate = null;
        scanPreview.innerHTML = '<p>Running ANPR…</p>';
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
      });
    } catch {
      scanPreview.innerHTML = '<p>Camera access denied or unavailable.</p>';
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan with camera';
    }
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
   * Renders grade dropdowns with Total Kg below each grade.
   * Uses rework grades from Settings.
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
      gradeLabel.htmlFor = 'rework-in-grade-' + idx;
      gradeLabel.textContent = 'Material grade ' + idx;
      const select = document.createElement('select');
      select.id = 'rework-in-grade-' + idx;
      select.name = 'grade_' + idx;
      select.required = n > 0;
      select.innerHTML = '<option value="">Select material grade</option>' +
        grades.map((g) => `<option value="${escapeHtmlAttr(g)}">${escapeHtmlAttr(g)}</option>`).join('');
      const totalKgLabel = document.createElement('label');
      totalKgLabel.htmlFor = 'rework-in-totalkg-' + idx;
      totalKgLabel.textContent = 'Total Kg';
      const totalKgInput = document.createElement('input');
      totalKgInput.type = 'number';
      totalKgInput.min = '0';
      totalKgInput.step = '0.01';
      totalKgInput.placeholder = 'Total Kg';
      totalKgInput.id = 'rework-in-totalkg-' + idx;
      totalKgInput.name = 'totalkg_' + idx;
      group.appendChild(gradeLabel);
      group.appendChild(select);
      group.appendChild(totalKgLabel);
      group.appendChild(totalKgInput);
      gradesContainer.appendChild(group);
    }
  }

  /**
   * Resizes an image canvas to max dimension, returns JPEG base64 data URI.
   * @param {HTMLCanvasElement} srcCanvas
   * @param {number} maxDim - Maximum width or height in pixels
   * @param {number} quality - JPEG quality 0-1
   * @returns {string} data URI (data:image/jpeg;base64,...)
   */
  function resizeImage(srcCanvas, maxDim, quality) {
    let w = srcCanvas.width;
    let h = srcCanvas.height;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(srcCanvas, 0, 0, w, h);
    return out.toDataURL('image/jpeg', quality);
  }

  /**
   * Renders thumbnail grid of captured load images with remove buttons.
   * Hides capture button when max reached.
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
   * Opens device camera to capture a load image.
   * Resizes to 1200px max, stores as base64 data URI.
   * Side effect: camera preview UI, updates loadImages array.
   */
  async function handleCaptureLoad() {
    if (!captureLoadBtn || loadImages.length >= MAX_LOAD_IMAGES) return;
    captureLoadBtn.disabled = true;
    captureLoadBtn.textContent = 'Opening camera…';
    capturePreview.classList.remove('hidden');
    capturePreview.innerHTML = '<p>Starting camera…</p>';

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
      }
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.style.display = 'block';
      video.style.maxWidth = '100%';
      capturePreview.innerHTML = '';
      capturePreview.appendChild(video);

      const snapBtn = document.createElement('button');
      snapBtn.type = 'button';
      snapBtn.className = 'btn-primary';
      snapBtn.textContent = 'Capture';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Cancel';

      const actions = document.createElement('div');
      actions.className = 'scan-actions';
      actions.appendChild(snapBtn);
      actions.appendChild(cancelBtn);
      capturePreview.appendChild(actions);

      await new Promise((r) => { video.onloadedmetadata = r; });
      try { await video.play(); } catch (_) {}

      const cleanup = () => {
        stream.getTracks().forEach((t) => t.stop());
        capturePreview.classList.add('hidden');
        capturePreview.innerHTML = '';
        captureLoadBtn.disabled = false;
        captureLoadBtn.textContent = 'Take photo';
      };

      cancelBtn.addEventListener('click', cleanup);

      snapBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const dataUri = resizeImage(canvas, 1200, 0.7);
        loadImages.push(dataUri);
        renderLoadImageGrid();
        cleanup();
      });
    } catch {
      capturePreview.innerHTML = '<p>Camera access denied or unavailable.</p>';
      captureLoadBtn.disabled = false;
      captureLoadBtn.textContent = 'Take photo';
    }
  }

  /**
   * Renders a thumbnail preview of the captured invoice image with a remove button.
   * Shows the capture button again when the image is removed.
   * Side effect: mutates DOM.
   */
  function renderInvoiceImagePreview() {
    if (!invoicePreviewEl) return;
    invoicePreviewEl.innerHTML = '';
    if (invoiceImage) {
      const wrapper = document.createElement('div');
      wrapper.className = 'load-img-wrapper';
      const img = document.createElement('img');
      img.src = invoiceImage;
      img.className = 'load-img-thumb';
      img.alt = 'Invoice / delivery note image';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'load-img-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', 'Remove invoice image');
      removeBtn.addEventListener('click', () => {
        invoiceImage = null;
        renderInvoiceImagePreview();
      });
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      invoicePreviewEl.appendChild(wrapper);
    }
    if (captureInvoiceBtn) {
      captureInvoiceBtn.classList.toggle('hidden', !!invoiceImage);
    }
  }

  /**
   * Opens device camera to capture a single invoice / delivery note photo.
   * Reuses resizeImage helper, stores as base64 data URI in invoiceImage.
   * Side effect: camera preview UI, updates invoiceImage.
   */
  async function handleCaptureInvoice() {
    if (!captureInvoiceBtn || invoiceImage) return;
    captureInvoiceBtn.disabled = true;
    captureInvoiceBtn.textContent = 'Opening camera…';
    invoiceCaptureArea.classList.remove('hidden');
    invoiceCaptureArea.innerHTML = '<p>Starting camera…</p>';

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
      }
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.style.display = 'block';
      video.style.maxWidth = '100%';
      invoiceCaptureArea.innerHTML = '';
      invoiceCaptureArea.appendChild(video);

      const snapBtn = document.createElement('button');
      snapBtn.type = 'button';
      snapBtn.className = 'btn-primary';
      snapBtn.textContent = 'Capture';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Cancel';

      const actions = document.createElement('div');
      actions.className = 'scan-actions';
      actions.appendChild(snapBtn);
      actions.appendChild(cancelBtn);
      invoiceCaptureArea.appendChild(actions);

      await new Promise((r) => { video.onloadedmetadata = r; });
      try { await video.play(); } catch (_) {}

      const cleanup = () => {
        stream.getTracks().forEach((t) => t.stop());
        invoiceCaptureArea.classList.add('hidden');
        invoiceCaptureArea.innerHTML = '';
        captureInvoiceBtn.disabled = false;
        captureInvoiceBtn.textContent = 'Take photo';
      };

      cancelBtn.addEventListener('click', cleanup);

      snapBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        invoiceImage = resizeImage(canvas, 1200, 0.7);
        renderInvoiceImagePreview();
        cleanup();
      });
    } catch {
      invoiceCaptureArea.innerHTML = '<p>Camera access denied or unavailable.</p>';
      captureInvoiceBtn.disabled = false;
      captureInvoiceBtn.textContent = 'Take photo';
    }
  }

  /**
   * Collects grades_received from the dynamic dropdowns and Total Kg inputs.
   * @returns {{grade:string, total_kg:number|null}[]}
   */
  function getGradesReceived() {
    const n = parseInt(gradesCountSelect?.value, 10) || 0;
    const arr = [];
    for (let i = 1; i <= n; i++) {
      const gradeEl = form.querySelector('[name="grade_' + i + '"]');
      const totalKgEl = form.querySelector('[name="totalkg_' + i + '"]');
      const grade = gradeEl?.value?.trim() || null;
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

    const completedBtn = document.getElementById('rework-in-completed');
    if (completedBtn) completedBtn.disabled = true;

    const PREFIX = 'data:image/jpeg;base64,';
    const payload = {
      started_at: sessionData.started_at,
      location_street: sessionData.location_street,
      location_area: sessionData.location_area,
      location_lat: sessionData.lat,
      location_lng: sessionData.lng,
      recycler_name: form.elements.recycler_name?.value?.trim() || null,
      grades_received: getGradesReceived(),
      vehicle_registration: form.elements.vehicle_registration?.value?.trim() || null,
      load_images: loadImages.map((uri) => uri.startsWith(PREFIX) ? uri.slice(PREFIX.length) : uri),
      driver_name: form.elements.driver_name?.value?.trim() || null,
      invoice_number: form.elements.invoice_number?.value?.trim() || null,
      invoice_image: invoiceImage ? (invoiceImage.startsWith(PREFIX) ? invoiceImage.slice(PREFIX.length) : invoiceImage) : null,
      additional_comments: form.elements.additional_comments?.value?.trim() || null,
      checked_by: form.elements.checked_by?.value?.trim() || null,
      completed_at: toISODateTime(new Date())
    };

    try {
      const authFn = window.MATERIAL_HUB_AUTH?.authFetch || fetch;
      const res = await authFn(`${API_BASE}/api/rework-in`, {
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
      invoiceImage = null;
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

  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'rework-in-start') {
      handleStart();
    }
  });
  if (scanBtn) scanBtn.addEventListener('click', handleScan);
  if (captureLoadBtn) captureLoadBtn.addEventListener('click', handleCaptureLoad);
  if (captureInvoiceBtn) captureInvoiceBtn.addEventListener('click', handleCaptureInvoice);
  if (form) form.addEventListener('submit', handleSubmit);

  window.MATERIAL_HUB_REWORKIN = { refreshGradesDropdowns };
})();
