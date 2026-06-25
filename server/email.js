/**
 * Report dispatch service - uploads submission reports to Egnyte.
 *
 * Email delivery was removed; reports are now pushed only to Egnyte as a ZIP
 * (report HTML + load/invoice images). Uses shared HTML builders from
 * reportHtml.js. Function names are retained so route handlers are unchanged.
 *
 * Env: EGNYTE_DOMAIN, EGNYTE_ACCESS_TOKEN, EGNYTE_UPLOAD_PATH
 */

const archiver = require('archiver');
const { buildRawInHtml, buildRawOutHtml, buildReworkOutHtml, buildReworkInHtml } = require('./reportHtml');
const egnyte = require('./egnyte');

/**
 * Builds image attachment descriptors from file paths, used to populate the ZIP.
 * @param {string[]} [imagePaths] - absolute paths to load images
 * @param {string[]} [invoiceImagePaths] - absolute paths to invoice images
 * @returns {Array<{filename: string, path: string, contentType: string}>}
 */
function buildAttachments(imagePaths, invoiceImagePaths) {
  const attachments = (imagePaths || []).map((filePath, idx) => ({
    filename: `load_image_${idx + 1}.jpg`,
    path: filePath,
    contentType: 'image/jpeg'
  }));
  (invoiceImagePaths || []).forEach((filePath, idx) => {
    attachments.push({
      filename: `invoice_document_${idx + 1}.jpg`,
      path: filePath,
      contentType: 'image/jpeg'
    });
  });
  return attachments;
}

/**
 * Bundles the HTML report and image attachments into an in-memory ZIP buffer.
 * @param {string} html - Full HTML report document.
 * @param {Array<{filename: string, path: string}>} attachments - Image attachments (load + invoice).
 * @returns {Promise<Buffer>} ZIP file as a Buffer.
 * @throws Rejects if the archiver stream errors.
 */
function buildReportZip(html, attachments) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.append(html, { name: 'report.html' });
    (attachments || []).forEach((a) => {
      archive.file(a.path, { name: a.filename });
    });
    archive.finalize();
  });
}

/**
 * Builds a report ZIP and uploads it to Egnyte. No-op when Egnyte is not configured.
 * Failures are logged but never thrown (must not affect the submission flow).
 * @param {string} subfolder - Egnyte category subfolder (e.g. "Raw In").
 * @param {string} baseName - Base file name (timestamp + .zip appended).
 * @param {string} html - Full HTML report document.
 * @param {Array<{filename: string, path: string}>} attachments - Image attachments.
 * @returns {Promise<void>}
 * @sideeffect Builds an in-memory ZIP and performs an outbound upload to Egnyte.
 */
async function pushToEgnyte(subfolder, baseName, html, attachments) {
  if (!egnyte.isConfigured()) {
    console.log('[Egnyte] Not configured; skipping upload for %s', baseName);
    return;
  }
  const zipName = `${baseName}_${Date.now()}.zip`;
  const dest = subfolder ? `${subfolder}/${zipName}` : zipName;
  try {
    const zipBuffer = await buildReportZip(html, attachments);
    const result = await egnyte.uploadReport(zipName, zipBuffer, 'application/zip', subfolder);
    if (result.ok) {
      console.log('[Egnyte] Uploaded %s', dest);
    } else {
      console.error('[Egnyte] Upload failed %s — %s', dest, result.error);
    }
  } catch (err) {
    console.error('[Egnyte] Upload error %s — %s', dest, err.message);
  }
}

/**
 * Uploads the Raw In report to Egnyte.
 * @param {Object} row - Raw In record
 * @param {string[]} [invoiceImagePaths] - Absolute paths to invoice images on disk
 * @returns {Promise<void>}
 */
async function sendRawInReport(row, invoiceImagePaths) {
  const attachments = buildAttachments([], invoiceImagePaths);
  const html = buildRawInHtml(row);
  await pushToEgnyte('Raw In', `Material_Hub_Raw_In_${row.id}`, html, attachments);
}

/**
 * Uploads the Raw Out report to Egnyte.
 * @param {Object} row - Raw Out record
 * @param {string[]} [imagePaths]
 * @param {string[]} [invoiceImagePaths]
 * @returns {Promise<void>}
 */
async function sendRawOutReport(row, imagePaths, invoiceImagePaths) {
  const attachments = buildAttachments(imagePaths, invoiceImagePaths);
  const html = buildRawOutHtml(row);
  await pushToEgnyte('Raw Out', `Material_Hub_Raw_Out_${row.id}`, html, attachments);
}

/**
 * Uploads the Rework Out report to Egnyte.
 * @param {Object} row - Rework Out record
 * @param {string[]} [imagePaths]
 * @param {string[]} [invoiceImagePaths]
 * @returns {Promise<void>}
 */
async function sendReworkOutReport(row, imagePaths, invoiceImagePaths) {
  const attachments = buildAttachments(imagePaths, invoiceImagePaths);
  const html = buildReworkOutHtml(row);
  await pushToEgnyte('Rework Out', `Material_Hub_Rework_Out_${row.id}`, html, attachments);
}

/**
 * Uploads the Rework In report to Egnyte.
 * @param {Object} row - Rework In record
 * @param {string[]} [imagePaths]
 * @param {string[]} [invoiceImagePaths]
 * @returns {Promise<void>}
 */
async function sendReworkInReport(row, imagePaths, invoiceImagePaths) {
  const attachments = buildAttachments(imagePaths, invoiceImagePaths);
  const html = buildReworkInHtml(row);
  await pushToEgnyte('Rework In', `Material_Hub_Rework_In_${row.id}`, html, attachments);
}

module.exports = { sendRawInReport, sendRawOutReport, sendReworkOutReport, sendReworkInReport };
