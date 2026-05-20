/**
 * Shared report HTML builders.
 * Used by both email.js (for sending reports) and portal.js (for PDF generation).
 *
 * Each builder takes a DB row and returns a complete HTML document string.
 */

/**
 * Formats a value for display, replacing nulls/empty with em-dash.
 * @param {*} v - value to format
 * @returns {string}
 */
function fmt(v) {
  return v == null || v === '' ? '—' : String(v);
}

/**
 * Parses a JSON grades column into a display string.
 * @param {string|Array} raw - grades JSON or already-parsed array
 * @param {'received'|'sent'|'sent_rework'} mode - controls which sub-fields to show
 * @returns {string}
 */
function formatGrades(raw, mode) {
  if (!raw) return '—';
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) return fmt(raw);
    return arr.map((item) => {
      if (typeof item === 'object' && item !== null && 'grade' in item) {
        const g = fmt(item.grade);
        if (mode === 'sent_rework') return g;
        const b = item.batch ? ` — Batch: ${item.batch}` : '';
        const kg = item.total_kg != null ? ` — ${item.total_kg} kg` : '';
        return g + b + kg;
      }
      return fmt(item);
    }).join('; ');
  } catch {
    return fmt(raw);
  }
}

/**
 * Counts load images from a JSON column.
 * @param {string|Array} raw - load_images JSON
 * @returns {number}
 */
function countLoadImages(raw) {
  if (!raw) return 0;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Counts invoice images from the invoice_image column.
 * Handles both legacy single-path strings and new JSON array format.
 * @param {string|null} raw - invoice_image column value
 * @returns {number}
 */
function countInvoiceImages(raw) {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    return 1;
  }
}

const REPORT_STYLES = `
  body { font-family: Arial,sans-serif; font-size: 12px; margin: 16px; color: #222; max-width: 595px; }
  h1 { font-size: 18px; margin: 0 0 12px; color: #1a237e; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 6px 8px; border: 1px solid #ccc; }
  td:first-child { font-weight: bold; width: 38%; background: #f5f5f5; }
  .footer { margin-top: 12px; font-size: 11px; color: #666; }
  @media print { body { margin: 0; } table { break-inside: avoid; } }
`;

/**
 * Builds HTML report for a Raw In submission.
 * @param {Object} row - raw_in_submissions record
 * @returns {string} complete HTML document
 */
function buildRawInHtml(row) {
  const gradesStr = formatGrades(row.grades_received, 'received');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Raw In Report #${row.id}</title><style>${REPORT_STYLES}</style></head>
<body>
  <h1>Material Hub — Raw In Report</h1>
  <table>
    <tr><td>Report ID</td><td>${row.id}</td></tr>
    <tr><td>Date &amp; Time (start)</td><td>${fmt(row.started_at)}</td></tr>
    <tr><td>Completed</td><td>${fmt(row.completed_at)}</td></tr>
    <tr><td>Location</td><td>${fmt(row.location_street)} ${fmt(row.location_area)}</td></tr>
    <tr><td>Supplier</td><td>${fmt(row.supplier)}</td></tr>
    <tr><td>Transporter</td><td>${fmt(row.transporter)}</td></tr>
    <tr><td>Grades received</td><td>${gradesStr}</td></tr>
    <tr><td>Vehicle registration</td><td>${fmt(row.vehicle_registration)}</td></tr>
    <tr><td>Vehicle state</td><td>${fmt(row.vehicle_state)}</td></tr>
    <tr><td>Damaged bags</td><td>${fmt(row.damaged_bags)}</td></tr>
    <tr><td>Pallets wrapped &amp; covered</td><td>${fmt(row.pallets_wrapped)}</td></tr>
    <tr><td>Driver name</td><td>${fmt(row.driver_name)}</td></tr>
    <tr><td>Invoice number</td><td>${fmt(row.invoice_number)}</td></tr>
    <tr><td>Checked by</td><td>${fmt(row.checked_by)}</td></tr>
    <tr><td>Additional comments</td><td>${fmt(row.additional_comments)}</td></tr>
  </table>
  <p class="footer">Material Management Services — Generated on completion</p>
</body>
</html>`;
}

/**
 * Builds HTML report for a Raw Out submission.
 * @param {Object} row - raw_out_submissions record
 * @returns {string} complete HTML document
 */
function buildRawOutHtml(row) {
  const gradesStr = formatGrades(row.grades_sent, 'sent');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Raw Out Report #${row.id}</title><style>${REPORT_STYLES}</style></head>
<body>
  <h1>Material Hub — Raw Out Report</h1>
  <table>
    <tr><td>Report ID</td><td>${row.id}</td></tr>
    <tr><td>Date &amp; Time (start)</td><td>${fmt(row.started_at)}</td></tr>
    <tr><td>Completed</td><td>${fmt(row.completed_at)}</td></tr>
    <tr><td>Location</td><td>${fmt(row.location_street)} ${fmt(row.location_area)}</td></tr>
    <tr><td>Customer name</td><td>${fmt(row.customer_name)}</td></tr>
    <tr><td>Transporter</td><td>${fmt(row.transporter)}</td></tr>
    <tr><td>Reason for material out</td><td>${fmt(row.reason_for_material_out)}</td></tr>
    <tr><td>Grades sent</td><td>${gradesStr}</td></tr>
    <tr><td>Vehicle registration</td><td>${fmt(row.vehicle_registration)}</td></tr>
    <tr><td>Load images</td><td>${countLoadImages(row.load_images)} attached</td></tr>
    <tr><td>Vehicle state</td><td>${fmt(row.vehicle_state)}</td></tr>
    <tr><td>Damaged bags</td><td>${fmt(row.damaged_bags)}</td></tr>
    <tr><td>Pallets wrapped &amp; covered</td><td>${fmt(row.pallets_wrapped)}</td></tr>
    <tr><td>Driver name</td><td>${fmt(row.driver_name)}</td></tr>
    <tr><td>Invoice / Delivery note #</td><td>${fmt(row.invoice_number)}</td></tr>
    <tr><td>Invoice / DN image</td><td>${countInvoiceImages(row.invoice_image) > 0 ? countInvoiceImages(row.invoice_image) + ' attached' : '—'}</td></tr>
    <tr><td>Checked by</td><td>${fmt(row.checked_by)}</td></tr>
    <tr><td>Additional comments</td><td>${fmt(row.additional_comments)}</td></tr>
  </table>
  <p class="footer">Material Management Services — Generated on completion</p>
</body>
</html>`;
}

/**
 * Builds HTML report for a Rework Out submission.
 * @param {Object} row - rework_out_submissions record
 * @returns {string} complete HTML document
 */
function buildReworkOutHtml(row) {
  const gradesStr = formatGrades(row.grades_sent, 'sent');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Rework Out Report #${row.id}</title><style>${REPORT_STYLES}</style></head>
<body>
  <h1>Material Hub — Rework Out Report</h1>
  <table>
    <tr><td>Report ID</td><td>${row.id}</td></tr>
    <tr><td>Date &amp; Time (start)</td><td>${fmt(row.started_at)}</td></tr>
    <tr><td>Completed</td><td>${fmt(row.completed_at)}</td></tr>
    <tr><td>Location</td><td>${fmt(row.location_street)} ${fmt(row.location_area)}</td></tr>
    <tr><td>Name of recycler</td><td>${fmt(row.recycler_name)}</td></tr>
    <tr><td>Grades sent</td><td>${gradesStr}</td></tr>
    <tr><td>Vehicle registration</td><td>${fmt(row.vehicle_registration)}</td></tr>
    <tr><td>Load images</td><td>${countLoadImages(row.load_images)} attached</td></tr>
    <tr><td>Driver name</td><td>${fmt(row.driver_name)}</td></tr>
    <tr><td>Invoice / Delivery note #</td><td>${fmt(row.invoice_number)}</td></tr>
    <tr><td>Invoice / DN image</td><td>${countInvoiceImages(row.invoice_image) > 0 ? countInvoiceImages(row.invoice_image) + ' attached' : '—'}</td></tr>
    <tr><td>Checked by</td><td>${fmt(row.checked_by)}</td></tr>
    <tr><td>Additional comments</td><td>${fmt(row.additional_comments)}</td></tr>
  </table>
  <p class="footer">Material Management Services — Generated on completion</p>
</body>
</html>`;
}

/**
 * Builds HTML report for a Rework In submission.
 * @param {Object} row - rework_in_submissions record
 * @returns {string} complete HTML document
 */
function buildReworkInHtml(row) {
  const gradesStr = formatGrades(row.grades_received, 'received');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Rework In Report #${row.id}</title><style>${REPORT_STYLES}</style></head>
<body>
  <h1>Material Hub — Rework In Report</h1>
  <table>
    <tr><td>Report ID</td><td>${row.id}</td></tr>
    <tr><td>Date &amp; Time (start)</td><td>${fmt(row.started_at)}</td></tr>
    <tr><td>Completed</td><td>${fmt(row.completed_at)}</td></tr>
    <tr><td>Location</td><td>${fmt(row.location_street)} ${fmt(row.location_area)}</td></tr>
    <tr><td>Name of recycler</td><td>${fmt(row.recycler_name)}</td></tr>
    <tr><td>Grades received</td><td>${gradesStr}</td></tr>
    <tr><td>Vehicle registration</td><td>${fmt(row.vehicle_registration)}</td></tr>
    <tr><td>Load images</td><td>${countLoadImages(row.load_images)} attached</td></tr>
    <tr><td>Driver name</td><td>${fmt(row.driver_name)}</td></tr>
    <tr><td>Invoice / Delivery note #</td><td>${fmt(row.invoice_number)}</td></tr>
    <tr><td>Invoice / DN image</td><td>${countInvoiceImages(row.invoice_image) > 0 ? countInvoiceImages(row.invoice_image) + ' attached' : '—'}</td></tr>
    <tr><td>Checked by</td><td>${fmt(row.checked_by)}</td></tr>
    <tr><td>Additional comments</td><td>${fmt(row.additional_comments)}</td></tr>
  </table>
  <p class="footer">Material Management Services — Generated on completion</p>
</body>
</html>`;
}

module.exports = {
  buildRawInHtml,
  buildRawOutHtml,
  buildReworkOutHtml,
  buildReworkInHtml,
  formatGrades,
  countLoadImages,
  countInvoiceImages,
  fmt
};
