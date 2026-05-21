/**
 * Shared fullscreen camera module for Material Hub.
 * Provides a mobile-friendly camera overlay with shutter button,
 * review-before-accept flow, and multi-photo continuous mode.
 *
 * @namespace MATERIAL_HUB_CAMERA
 */
(function () {
  'use strict';

  const overlay = document.getElementById('camera-overlay');
  const videoEl = document.getElementById('camera-video');
  const shutterBtn = document.getElementById('camera-shutter');
  const closeBtn = document.getElementById('camera-close');
  const flashEl = document.getElementById('camera-flash');
  const counterEl = document.getElementById('camera-counter');
  const reviewEl = document.getElementById('camera-review');
  const reviewImg = document.getElementById('camera-review-img');
  const reviewUseBtn = document.getElementById('camera-review-use');
  const reviewRetakeBtn = document.getElementById('camera-review-retake');
  const reviewDoneBtn = document.getElementById('camera-review-done');

  let activeStream = null;
  let currentOptions = null;
  let capturedCount = 0;

  /**
   * Resizes a canvas image to a maximum dimension and returns a JPEG data URI.
   * @param {HTMLCanvasElement} srcCanvas - Source canvas with captured frame
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
   * Stops the active camera stream and cleans up tracks.
   * Side effect: sets activeStream to null.
   */
  function stopStream() {
    if (activeStream) {
      activeStream.getTracks().forEach(function (t) { t.stop(); });
      activeStream = null;
    }
  }

  /**
   * Shows the camera overlay with a fade-in transition.
   * Locks body scroll while overlay is visible.
   * Side effect: mutates DOM classes.
   */
  function showOverlay() {
    overlay.classList.remove('hidden');
    requestAnimationFrame(function () {
      overlay.classList.add('camera-overlay--visible');
    });
    document.body.style.overflow = 'hidden';
  }

  /**
   * Hides the camera overlay with a fade-out transition.
   * Restores body scroll.
   * Side effect: mutates DOM classes, stops stream.
   */
  function hideOverlay() {
    overlay.classList.remove('camera-overlay--visible');
    setTimeout(function () {
      overlay.classList.add('hidden');
      reviewEl.classList.add('hidden');
      videoEl.srcObject = null;
    }, 200);
    document.body.style.overflow = '';
    stopStream();
    currentOptions = null;
  }

  /**
   * Updates the photo counter badge in multi-photo mode.
   * @param {number} current - Number of photos taken so far
   * @param {number} max - Maximum allowed photos
   * Side effect: mutates DOM text content and visibility.
   */
  function updateCounter(current, max) {
    if (currentOptions && currentOptions.mode === 'multi') {
      counterEl.textContent = current + ' / ' + max;
      counterEl.classList.remove('hidden');
    } else {
      counterEl.classList.add('hidden');
    }
  }

  /**
   * Triggers shutter flash animation and optional haptic feedback.
   * Side effect: briefly shows flash overlay, vibrates device.
   */
  function triggerFlash() {
    flashEl.classList.add('camera-flash--active');
    setTimeout(function () {
      flashEl.classList.remove('camera-flash--active');
    }, 150);
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  /**
   * Shows the review screen with the captured image and action buttons.
   * In multi mode, shows "Done" button alongside "Use Photo".
   * @param {string} dataUri - The captured image as a data URI
   * Side effect: hides video, shows review UI.
   */
  function showReview(dataUri) {
    reviewImg.src = dataUri;
    reviewEl.classList.remove('hidden');
    videoEl.classList.add('hidden');
    shutterBtn.classList.add('hidden');

    var isMulti = currentOptions && currentOptions.mode === 'multi';
    var atMax = isMulti && (capturedCount + 1) >= currentOptions.maxPhotos;
    reviewDoneBtn.classList.toggle('hidden', !isMulti || atMax);
  }

  /**
   * Hides the review screen and shows the live video feed again.
   * Side effect: shows video and shutter, hides review.
   */
  function hideReview() {
    reviewEl.classList.add('hidden');
    videoEl.classList.remove('hidden');
    shutterBtn.classList.remove('hidden');
  }

  /**
   * Captures a single frame from the video feed as a canvas.
   * @returns {HTMLCanvasElement} Canvas with the captured video frame
   */
  function captureFrame() {
    var canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    return canvas;
  }

  /**
   * Opens the fullscreen camera overlay.
   *
   * @param {Object} options - Configuration for the camera session
   * @param {string} options.mode - 'single' for one photo, 'multi' for multiple
   * @param {number} [options.maxPhotos=1] - Max photos in multi mode
   * @param {number} [options.maxDim=1200] - Max pixel dimension for resize
   * @param {number} [options.quality=0.7] - JPEG quality 0-1
   * @param {boolean} [options.rawCanvas=false] - If true, passes canvas to onPhoto instead of data URI
   * @param {function} options.onPhoto - Called with (dataUri, canvas) for each accepted photo
   * @param {function} [options.onDone] - Called when session ends (multi mode "Done" or single accept)
   * @param {function} [options.onCancel] - Called when user cancels without any photo
   * @returns {Promise<void>}
   * @throws Will call onCancel if camera access is denied
   * Side effect: opens camera stream, shows fullscreen overlay.
   */
  async function openCamera(options) {
    currentOptions = Object.assign({
      mode: 'single',
      maxPhotos: 1,
      maxDim: 1200,
      quality: 0.7,
      rawCanvas: false,
      onPhoto: function () {},
      onDone: function () {},
      onCancel: function () {}
    }, options);

    capturedCount = 0;
    updateCounter(0, currentOptions.maxPhotos);
    hideReview();
    showOverlay();

    try {
      var stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
      }

      activeStream = stream;
      videoEl.srcObject = stream;
      videoEl.classList.remove('hidden');
      shutterBtn.classList.remove('hidden');

      await new Promise(function (r) { videoEl.onloadedmetadata = r; });
      try { await videoEl.play(); } catch (_) {}

    } catch (_) {
      hideOverlay();
      currentOptions.onCancel();
    }
  }

  var pendingDataUri = null;
  var pendingCanvas = null;

  shutterBtn.addEventListener('click', function () {
    if (!activeStream) return;
    triggerFlash();
    pendingCanvas = captureFrame();
    pendingDataUri = resizeImage(pendingCanvas, currentOptions.maxDim, currentOptions.quality);
    showReview(pendingDataUri);
  });

  reviewUseBtn.addEventListener('click', function () {
    if (!pendingDataUri || !currentOptions) return;
    capturedCount++;
    var opts = currentOptions;
    opts.onPhoto(pendingDataUri, pendingCanvas);

    if (opts.mode === 'single' || capturedCount >= opts.maxPhotos) {
      hideOverlay();
      opts.onDone();
    } else {
      updateCounter(capturedCount, opts.maxPhotos);
      hideReview();
    }
    pendingDataUri = null;
    pendingCanvas = null;
  });

  reviewRetakeBtn.addEventListener('click', function () {
    pendingDataUri = null;
    pendingCanvas = null;
    hideReview();
  });

  reviewDoneBtn.addEventListener('click', function () {
    var opts = currentOptions;
    if (pendingDataUri && opts) {
      capturedCount++;
      opts.onPhoto(pendingDataUri, pendingCanvas);
    }
    pendingDataUri = null;
    pendingCanvas = null;
    hideOverlay();
    if (opts) opts.onDone();
  });

  closeBtn.addEventListener('click', function () {
    var opts = currentOptions;
    var count = capturedCount;
    pendingDataUri = null;
    pendingCanvas = null;
    hideOverlay();
    if (opts) {
      if (count > 0) {
        opts.onDone();
      } else {
        opts.onCancel();
      }
    }
  });

  window.MATERIAL_HUB_CAMERA = {
    openCamera: openCamera,
    resizeImage: resizeImage
  };
})();
