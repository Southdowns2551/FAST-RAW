/**
 * Portal API - unified read-only access to all submission data.
 *
 * GET  /api/portal/submissions          - paginated, filterable listing across all 4 tables
 * GET  /api/portal/submissions/:type/:id - single record detail
 * GET  /api/portal/submissions/:type/:id/pdf - PDF download of report
 * GET  /api/portal/images/:type/:id/:filename - serve load/invoice images
 *
 * Query params for listing:
 *   type     - raw_in | raw_out | rework_in | rework_out | all (default)
 *   from     - start date YYYY-MM-DD (inclusive)
 *   to       - end date YYYY-MM-DD (inclusive)
 *   supplier - filter by supplier/customer/recycler name (partial match)
 *   grade    - filter by grade name in JSON column
 *   page     - page number (default 1)
 *   limit    - rows per page (default 25, max 100)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { buildRawInHtml, buildRawOutHtml, buildReworkOutHtml, buildReworkInHtml } = require('../reportHtml');

const router = express.Router();

const VALID_TYPES = ['raw_in', 'raw_out', 'rework_in', 'rework_out'];

const TABLE_MAP = {
  raw_in: 'raw_in_submissions',
  raw_out: 'raw_out_submissions',
  rework_out: 'rework_out_submissions',
  rework_in: 'rework_in_submissions'
};

const UPLOAD_DIR_MAP = {
  raw_out: 'raw-out',
  rework_out: 'rework-out',
  rework_in: 'rework-in'
};

const HTML_BUILDERS = {
  raw_in: buildRawInHtml,
  raw_out: buildRawOutHtml,
  rework_out: buildReworkOutHtml,
  rework_in: buildReworkInHtml
};

/**
 * Builds a WHERE clause fragment and params for a single table query.
 * @param {string} type - submission type
 * @param {object} filters - { from, to, supplier, grade }
 * @returns {{ where: string, params: Array }}
 */
function buildWhereClause(type, filters) {
  const conditions = [];
  const params = [];

  if (filters.from) {
    conditions.push('started_at >= ?');
    params.push(filters.from + ' 00:00:00');
  }
  if (filters.to) {
    conditions.push('started_at <= ?');
    params.push(filters.to + ' 23:59:59');
  }
  if (filters.supplier) {
    const col = type === 'raw_in' ? 'supplier'
      : type === 'raw_out' ? 'customer_name'
      : 'recycler_name';
    conditions.push(`${col} LIKE ?`);
    params.push(`%${filters.supplier}%`);
  }
  if (filters.grade) {
    const col = (type === 'raw_in' || type === 'rework_in') ? 'grades_received' : 'grades_sent';
    conditions.push(`JSON_SEARCH(${col}, 'one', ?, NULL, '$[*].grade') IS NOT NULL`);
    params.push(filters.grade);
  }

  return {
    where: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
    params
  };
}

/**
 * Returns the entity name column for a given type, aliased as entity_name.
 * @param {string} type
 * @returns {string}
 */
function entityCol(type) {
  if (type === 'raw_in') return 'supplier AS entity_name';
  if (type === 'raw_out') return 'customer_name AS entity_name';
  return 'recycler_name AS entity_name';
}

/**
 * Returns the grades column for a given type, aliased as grades_json.
 * @param {string} type
 * @returns {string}
 */
function gradesCol(type) {
  return (type === 'raw_in' || type === 'rework_in') ? 'grades_received AS grades_json' : 'grades_sent AS grades_json';
}

/**
 * GET /submissions - paginated, filterable listing.
 * @returns {{ rows: Array, page: number, limit: number, total: number }}
 */
router.get('/submissions', async (req, res) => {
  try {
    const typeFilter = req.query.type || 'all';
    const filters = {
      from: req.query.from || null,
      to: req.query.to || null,
      supplier: req.query.supplier || null,
      grade: req.query.grade || null
    };
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const types = typeFilter === 'all' ? VALID_TYPES : (VALID_TYPES.includes(typeFilter) ? [typeFilter] : []);
    if (types.length === 0) return res.status(400).json({ error: 'Invalid type' });

    const unionParts = [];
    const countParts = [];
    let allParams = [];
    let countParams = [];

    for (const t of types) {
      const table = TABLE_MAP[t];
      const { where, params } = buildWhereClause(t, filters);

      unionParts.push(
        `SELECT id, '${t}' AS type, started_at, completed_at, ${entityCol(t)}, vehicle_registration, ${gradesCol(t)}, checked_by, invoice_number FROM ${table} ${where}`
      );
      allParams = allParams.concat(params);

      countParts.push(`SELECT COUNT(*) AS cnt FROM ${table} ${where}`);
      countParams = countParams.concat(params);
    }

    const dataQuery = `${unionParts.join(' UNION ALL ')} ORDER BY started_at DESC LIMIT ? OFFSET ?`;
    allParams.push(limit, offset);

    const [rows] = await pool.query(dataQuery, allParams);

    let total = 0;
    for (const cq of countParts) {
      const [cRows] = await pool.query(cq, countParams.splice(0, (cq.match(/\?/g) || []).length));
      total += cRows[0].cnt;
    }

    res.json({ rows, page, limit, total });
  } catch (err) {
    console.error('Portal listing error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

/**
 * GET /submissions/:type/:id - single record detail.
 * @returns {Object} full submission record with type field
 */
router.get('/submissions/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const table = TABLE_MAP[type];
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [numId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ type, ...rows[0] });
  } catch (err) {
    console.error('Portal detail error:', err);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

/**
 * GET /submissions/:type/:id/pdf - generate and return PDF report.
 * Uses html-pdf-node to convert the report HTML to PDF.
 * @returns {Buffer} PDF file
 */
router.get('/submissions/:type/:id/pdf', async (req, res) => {
  const { type, id } = req.params;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const table = TABLE_MAP[type];
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [numId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const builder = HTML_BUILDERS[type];
    const html = builder(rows[0]);

    let htmlPdf;
    try {
      htmlPdf = require('html-pdf-node');
    } catch {
      return res.status(500).json({ error: 'PDF generation not available' });
    }

    const file = { content: html };
    const options = { format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    const label = type.replace('_', '-');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${label}-report-${numId}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Portal PDF error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

/**
 * GET /images/:type/:id/:filename - serve a submission image.
 * @returns {File} image file
 */
router.get('/images/:type/:id/:filename', (req, res) => {
  const { type, id, filename } = req.params;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });

  const dirName = UPLOAD_DIR_MAP[type];
  if (!dirName) return res.status(404).json({ error: 'No images for this type' });

  const safeName = path.basename(filename);
  const filePath = path.join(__dirname, '..', 'uploads', dirName, String(id), safeName);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image not found' });

  res.sendFile(filePath);
});

module.exports = router;
