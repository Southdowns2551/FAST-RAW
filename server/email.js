/**
 * Email service - sends submission reports to reports@italpac.co.za.
 * Uses shared HTML builders from reportHtml.js.
 * Requires SMTP_* env vars. If not set, logs instead of sending.
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

const nodemailer = require('nodemailer');
const { buildRawInHtml, buildRawOutHtml, buildReworkOutHtml, buildReworkInHtml } = require('./reportHtml');

const REPORT_TO = 'reports@italpac.co.za';

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
 * @param {string|null} [invoiceImagePath] - absolute path to invoice image
 * @returns {Array}
 */
function buildAttachments(imagePaths, invoiceImagePath) {
  const attachments = (imagePaths || []).map((filePath, idx) => ({
    filename: `load_image_${idx + 1}.jpg`,
    path: filePath,
    contentType: 'image/jpeg'
  }));
  if (invoiceImagePath) {
    attachments.push({ filename: 'invoice_document.jpg', path: invoiceImagePath, contentType: 'image/jpeg' });
  }
  return attachments;
}

/**
 * Sends Raw In report email with optional invoice image attachment.
 * @param {Object} row - Raw In record
 * @param {string|null} [invoiceImagePath] - Absolute path to invoice image on disk
 * @returns {Promise<void>}
 */
async function sendRawInReport(row, invoiceImagePath) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments([], invoiceImagePath);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: REPORT_TO,
    subject: `Material Hub Raw In Report #${row.id}`,
    html: buildRawInHtml(row),
    attachments
  });
  console.log('[Email] Report sent for Raw In id=%s to %s (%d attachments)', row.id, REPORT_TO, attachments.length);
}

/**
 * Sends Raw Out report email with load images and optional invoice image.
 * @param {Object} row - Raw Out record
 * @param {string[]} [imagePaths]
 * @param {string|null} [invoiceImagePath]
 * @returns {Promise<void>}
 */
async function sendRawOutReport(row, imagePaths, invoiceImagePath) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Raw Out report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments(imagePaths, invoiceImagePath);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: REPORT_TO,
    subject: `Material Hub Raw Out Report #${row.id}`,
    html: buildRawOutHtml(row),
    attachments
  });
  console.log('[Email] Raw Out report sent for id=%s to %s (%d images attached)', row.id, REPORT_TO, attachments.length);
}

/**
 * Sends Rework Out report email with load images and optional invoice image.
 * @param {Object} row - Rework Out record
 * @param {string[]} [imagePaths]
 * @param {string|null} [invoiceImagePath]
 * @returns {Promise<void>}
 */
async function sendReworkOutReport(row, imagePaths, invoiceImagePath) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Rework Out report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments(imagePaths, invoiceImagePath);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: REPORT_TO,
    subject: `Material Hub Rework Out Report #${row.id}`,
    html: buildReworkOutHtml(row),
    attachments
  });
  console.log('[Email] Rework Out report sent for id=%s to %s (%d images attached)', row.id, REPORT_TO, attachments.length);
}

/**
 * Sends Rework In report email with load images and optional invoice image.
 * @param {Object} row - Rework In record
 * @param {string[]} [imagePaths]
 * @param {string|null} [invoiceImagePath]
 * @returns {Promise<void>}
 */
async function sendReworkInReport(row, imagePaths, invoiceImagePath) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] SMTP not configured. Rework In report (id=%s) would be sent to %s', row.id, REPORT_TO);
    return;
  }
  const attachments = buildAttachments(imagePaths, invoiceImagePath);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: REPORT_TO,
    subject: `Material Hub Rework In Report #${row.id}`,
    html: buildReworkInHtml(row),
    attachments
  });
  console.log('[Email] Rework In report sent for id=%s to %s (%d images attached)', row.id, REPORT_TO, attachments.length);
}

module.exports = { sendRawInReport, sendRawOutReport, sendReworkOutReport, sendReworkInReport };
