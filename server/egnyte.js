/**
 * Egnyte File System API client for uploading Material Hub reports.
 *
 * Uploads files to the configured Egnyte folder via the REST API.
 * Uses a bearer token obtained via the Resource Owner Password flow.
 *
 * Required env vars:
 *   EGNYTE_DOMAIN       — Egnyte subdomain (e.g. "italpac1a")
 *   EGNYTE_ACCESS_TOKEN — OAuth2 bearer token
 *   EGNYTE_UPLOAD_PATH  — Base folder path (e.g. "/Shared/API - Material Hub")
 */

const EGNYTE_DOMAIN = process.env.EGNYTE_DOMAIN;
const EGNYTE_ACCESS_TOKEN = process.env.EGNYTE_ACCESS_TOKEN;
const EGNYTE_UPLOAD_PATH = (process.env.EGNYTE_UPLOAD_PATH || '').replace(/\\/g, '/').replace(/\/$/, '');

/**
 * Returns true when all required env vars are set.
 *
 * @returns {boolean} Whether Egnyte upload is configured.
 */
function isConfigured() {
  return Boolean(EGNYTE_DOMAIN && EGNYTE_ACCESS_TOKEN && EGNYTE_UPLOAD_PATH);
}

/**
 * Uploads a file to Egnyte under: UPLOAD_PATH/[subfolder/]fileName
 *
 * @param {string} fileName - Desired file name in the Egnyte folder.
 * @param {Buffer} buffer - Raw file content.
 * @param {string} contentType - MIME type (e.g. "application/zip").
 * @param {string} [subfolder] - Optional category subfolder. When omitted, the
 *   file is placed directly in UPLOAD_PATH.
 * @returns {Promise<{ok: boolean, statusCode?: number, error?: string}>} Upload result.
 * @throws Never throws; network/HTTP failures are returned in the result object.
 * @sideeffect Performs an outbound HTTPS POST to the Egnyte API.
 */
async function uploadReport(fileName, buffer, contentType, subfolder) {
  if (!isConfigured()) {
    return { ok: false, error: 'Egnyte not configured' };
  }

  const safeName = fileName.replace(/[<>:"|?*]/g, '_');
  const folderSegments = [EGNYTE_UPLOAD_PATH];
  if (subfolder) folderSegments.push(subfolder);

  const filePath = `${folderSegments.join('/')}/${safeName}`.replace(/^\//, '');
  const url = `https://${EGNYTE_DOMAIN}.egnyte.com/pubapi/v1/fs-content/${encodeURI(filePath)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EGNYTE_ACCESS_TOKEN}`,
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });

  if (res.ok || res.status === 200 || res.status === 201) {
    return { ok: true, statusCode: res.status };
  }

  let errorMsg = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    errorMsg += ` — ${text.slice(0, 200)}`;
  } catch {}

  return { ok: false, statusCode: res.status, error: errorMsg };
}

module.exports = { isConfigured, uploadReport };
