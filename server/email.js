/**
 * Email service - sends submission reports to reports@italpac.co.za.
 * Uses shared HTML builders from reportHtml.js.
 * Requires SMTP_* env vars. If not set, logs instead of sending.
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

const nodemailer = require('nodemailer');
const archiver = require('archiver');
const { buildRawInHtml, buildRawOutHtml, buildReworkOutHtml, buildReworkInHtml } = require('./reportHtml');
const egnyte = require('./egnyte');

const REPORT_TO = 'reports@italpac.co.za';
const REPORT_FROM_NAME = 'Material Hub Report';

/**
 * Creates a nodemailer transporter from env vars, or null if not configured.
 * @returns {import('nodemailer').Transporter|null}
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  });
}

/**
 * Builds image attachments array from file paths.
 * @param {string[]} [imagePaths] - absolute paths to load images
 * @param {string[]} [invoiceImagePaths] - absolute paths to invoice images
 * @returns {Array}
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
 * Failures are logged but never thrown (fire-and-forget; must not affect email/submission).
 * @param {string} subfolder - Egnyte category subfolder (e.g. "Raw In").
 * @param {string} baseName - Base file name (timestamp + .zip appended).
 * @param {string} html - Full HTML report document.
 * @param {Array<{filename: string, path: string}>} attachments - Image attachments.
 * @returns {Promise<void>}
 * @sideeffect Builds an in-memory ZIP and performs an outbound upload to Egnyte.
 */
async function pushToEgnyte(subfolder, baseName, html, attachments) {
  if (!egnyte.isConfigured()) return;
  const zipName = `${baseName}_${Date.now()}.zip`;
  try {
    const zipBuffer = await buildReportZip(html, attachments);
    const result = await egnyte.uploadReport(zipName, zipBuffer, 'application/zip', subfolder);
    if (result.ok) {
      console.log('[Egnyte] Uploaded %s/%s', subfolder, zipName);
    } else {
      console.error('[Egnyte] Upload failed %s/%s — %s', subfolder, zipName, result.error);
    }
  } catch (err) {
    console.error('[Egnyte] Upload error %s/%s — %s', subfolder, zipName, err.message);
  }
}

/**
 * Sends Raw In report email with optional invoice image attachments.
 * @param {Object} row - Raw In record
 * @param {string[]} [invoiceImagePaths] - Absolute paths to invoice images on disk
 * @returns {Promise<void>}
 */
async function sendRawInReport(row, invoiceImagePaths) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments([], invoiceImagePaths);
  const html = buildRawInHtml(row);
  await transporter.sendMail({
    from: `"${REPORT_FROM_NAME}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: REPORT_TO,
    subject: `Material Hub Raw In Report #${row.id}`,
    html,
    attachments
  });
  console.log('[Email] Report sent for Raw In id=%s to %s (%d attachments)', row.id, REPORT_TO, attachments.length);
  pushToEgnyte('Raw In', `Material_Hub_Raw_In_${row.id}`, html, attachments).catch((e) => console.error('[Egnyte] Raw In push error:', e));
}

/**
 * Sends Raw Out report email with load images and optional invoice images.
 * @param {Object} row - Raw Out record
 * @param {string[]} [imagePaths]
 * @param {string[]} [invoiceImagePaths]
 * @returns {Promise<void>}
 */
async function sendRawOutReport(row, imagePaths, invoiceImagePaths) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Raw Out report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments(imagePaths, invoiceImagePaths);
  const html = buildRawOutHtml(row);
  await transporter.sendMail({
    from: `"${REPORT_FROM_NAME}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: REPORT_TO,
    subject: `Material Hub Raw Out Report #${row.id}`,
    html,
    attachments
  });
  console.log('[Email] Raw Out report sent for id=%s to %s (%d images attached)', row.id, REPORT_TO, attachments.length);
  pushToEgnyte('Raw Out', `Material_Hub_Raw_Out_${row.id}`, html, attachments).catch((e) => console.error('[Egnyte] Raw Out push error:', e));
}

/**
 * Sends Rework Out report email with load images and optional invoice images.
 * @param {Object} row - Rework Out record
 * @param {string[]} [imagePaths]
 * @param {string[]} [invoiceImagePaths]
 * @returns {Promise<void>}
 */
async function sendReworkOutReport(row, imagePaths, invoiceImagePaths) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Rework Out report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments(imagePaths, invoiceImagePaths);
  const html = buildReworkOutHtml(row);
  await transporter.sendMail({
    from: `"${REPORT_FROM_NAME}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: REPORT_TO,
    subject: `Material Hub Rework Out Report #${row.id}`,
    html,
    attachments
  });
  console.log('[Email] Rework Out report sent for id=%s to %s (%d images attached)', row.id, REPORT_TO, attachments.length);
  pushToEgnyte('Rework Out', `Material_Hub_Rework_Out_${row.id}`, html, attachments).catch((e) => console.error('[Egnyte] Rework Out push error:', e));
}

/**
 * Sends Rework In report email with load images and optional invoice images.
 * @param {Object} row - Rework In record
 * @param {string[]} [imagePaths]
 * @param {string[]} [invoiceImagePaths]
 * @returns {Promise<void>}
 */
async function sendReworkInReport(row, imagePaths, invoiceImagePaths) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Rework In report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments(imagePaths, invoiceImagePaths);
  const html = buildReworkInHtml(row);
  await transporter.sendMail({
    from: `"${REPORT_FROM_NAME}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: REPORT_TO,
    subject: `Material Hub Rework In Report #${row.id}`,
    html,
    attachments
  });
  console.log('[Email] Rework In report sent for id=%s to %s (%d images attached)', row.id, REPORT_TO, attachments.length);
  pushToEgnyte('Rework In', `Material_Hub_Rework_In_${row.id}`, html, attachments).catch((e) => console.error('[Egnyte] Rework In push error:', e));
}

module.exports = { sendRawInReport, sendRawOutReport, sendReworkOutReport, sendReworkInReport };
