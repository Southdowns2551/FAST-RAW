/**
 * Portal API - unified read-only access to all submission data.
 *
 * GET  /api/portal/submissions          - paginated, filterable listing across all 4 tables
 * GET  /api/portal/submissions/:type/:id - single record detail
 * GET  /api/portal/images/:type/:id/:filename - serve load/invoice images
 *
 * Query params for listing:
 *   type     - raw_in | raw_out | rework_in | rework_out | waste | all (default)
 *   from     - start date YYYY-MM-DD (inclusive)
 *   to       - end date YYYY-MM-DD (inclusive)
 *   supplier - filter by supplier/customer/recycler name (partial match)
 *   grade    - filter by grade name in JSON column
 *   department - waste only; exact reporting-department match. "Lumps" and
 *                "Trimmings" select those Extrusion rows; "Extrusion"
 *                excludes both.
 *   page     - page number (default 1)
 *   limit    - rows per page (default 25, max 100)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');

const router = express.Router();

const VALID_TYPES = ['raw_in', 'raw_out', 'rework_in', 'rework_out', 'waste'];

const TABLE_MAP = {
  raw_in: 'raw_in_submissions',
  raw_out: 'raw_out_submissions',
  rework_out: 'rework_out_submissions',
  rework_in: 'rework_in_submissions',
  waste: 'waste_submissions'
};

const UPLOAD_DIR_MAP = {
  raw_in: 'raw-in',
  raw_out: 'raw-out',
  rework_out: 'rework-out',
  rework_in: 'rework-in'
};

// Extrusion lumps and trimmings are reported as their own departments so each
// can be tracked separately; plain Extrusion waste keeps the department name.
// Shared by the department filter, the listing label and the totals grouping so
// the three cannot drift apart.
const WASTE_DEPT_LABEL =
  "CASE WHEN department = 'Extrusion' AND waste_type IN ('Lumps', 'Trimmings') "
  + "THEN waste_type ELSE department END";

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
      : type === 'waste' ? 'department'
      : 'recycler_name';
    conditions.push(`${col} LIKE ?`);
    params.push(`%${filters.supplier}%`);
  }
  if (filters.department) {
    if (type !== 'waste') {
      // Only waste rows have a department, so the filter excludes everything else.
      conditions.push('1 = 0');
    } else {
      conditions.push(`${WASTE_DEPT_LABEL} = ?`);
      params.push(filters.department);
    }
  }
  if (filters.grade) {
    if (type === 'waste') {
      // Waste rows carry no grades, so a grade filter always excludes them.
      conditions.push('1 = 0');
    } else {
      const col = (type === 'raw_in' || type === 'rework_in') ? 'grades_received' : 'grades_sent';
      conditions.push(`JSON_SEARCH(${col}, 'one', ?, NULL, '$[*].grade') IS NOT NULL`);
      params.push(filters.grade);
    }
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
  if (type === 'waste') return `${WASTE_DEPT_LABEL} AS entity_name`;
  return 'recycler_name AS entity_name';
}

/**
 * Returns the grades column for a given type, aliased as grades_json.
 * @param {string} type
 * @returns {string}
 */
function gradesCol(type) {
  if (type === 'waste') return 'NULL AS grades_json';
  return (type === 'raw_in' || type === 'rework_in') ? 'grades_received AS grades_json' : 'grades_sent AS grades_json';
}

/**
 * Builds the SELECT column list for one branch of the listing UNION.
 * Every branch must expose the same aliases; types lacking a column supply NULL.
 * @param {string} type - submission type
 * @returns {string} comma-separated column expressions
 */
function listSelect(type) {
  const isWaste = type === 'waste';
  const vehicle = isWaste ? 'NULL AS vehicle_registration' : 'vehicle_registration';
  const invoice = isWaste ? 'NULL AS invoice_number' : 'invoice_number';
  const person = isWaste ? 'completed_by AS checked_by' : 'checked_by';
  const shift = isWaste ? 'shift' : 'NULL AS shift';
  const kg = isWaste ? 'kg' : 'NULL AS kg';
  return `id, '${type}' AS type, started_at, completed_at, ${entityCol(type)}, `
    + `${vehicle}, ${gradesCol(type)}, ${person}, ${invoice}, ${shift}, ${kg}`;
}

/**
 * Sums waste kg for the current filters, grouped by reporting department.
 * Extrusion lumps and trimmings form their own buckets, so the Extrusion
 * figure covers plain extrusion waste only. Covers the whole filtered period
 * rather than just the requested page.
 * @param {Object} filters - same filter object used for the listing
 * @returns {Promise<{total_kg: number, by_department: Array<{department: string, total_kg: number, count: number}>}>}
 */
async function fetchWasteTotals(filters) {
  const { where, params } = buildWhereClause('waste', filters);
  // ORDER BY uses the column position: MySQL resolves ORDER BY identifiers
  // against select aliases first, so repeating the expression there would bind
  // "department" to this query's own alias.
  const [rows] = await pool.query(
    `SELECT ${WASTE_DEPT_LABEL} AS department, SUM(kg) AS total_kg, COUNT(*) AS cnt
     FROM waste_submissions ${where}
     GROUP BY ${WASTE_DEPT_LABEL}
     ORDER BY 1`,
    params
  );
  // DECIMAL columns come back as strings from mysql2.
  const byDepartment = rows.map((r) => ({
    department: r.department,
    total_kg: Number(r.total_kg) || 0,
    count: Number(r.cnt) || 0
  }));
  const totalKg = byDepartment.reduce((sum, d) => sum + d.total_kg, 0);
  return { total_kg: totalKg, by_department: byDepartment };
}

/**
 * GET /submissions - paginated, filterable listing.
 * @returns {{ rows: Array, page: number, limit: number, total: number, waste_totals: Object|null }}
 */
router.get('/submissions', async (req, res) => {
  try {
    const typeFilter = req.query.type || 'all';
    const filters = {
      from: req.query.from || null,
      to: req.query.to || null,
      supplier: req.query.supplier || null,
      grade: req.query.grade || null,
      department: req.query.department || null
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
        `SELECT ${listSelect(t)} FROM ${table} ${where}`
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

    const wasteTotals = types.includes('waste')
      ? await fetchWasteTotals(filters)
      : null;

    res.json({ rows, page, limit, total, waste_totals: wasteTotals });
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
