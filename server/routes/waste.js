/**
 * Waste submission route.
 * POST /api/waste - insert a new Waste record.
 * GET /api/waste - list recent Waste records.
 * POST /api/waste/:id/email-report - re-generate the report and upload it to Egnyte.
 *
 * Body: waste_date (YYYY-MM-DD), shift, department, waste_type (Extrusion only), kg
 */

const express = require('express');
const { pool } = require('../db');
const { sendWasteReport } = require('../email');

const router = express.Router();

const SHIFTS = ['Day Shift', 'Night Shift'];
const DEPARTMENTS = ['Extrusion', 'Printing', 'Slitting', 'Bagging'];
const WASTE_TYPES = ['Waste', 'Lumps'];
const WASTE_TYPE_DEPARTMENT = 'Extrusion';

/**
 * Resolves the display name of the authenticated user.
 * The JWT payload only carries { id, username, role }, so the display name is
 * read from the users table to keep "Completed by" authoritative server-side.
 * @param {{ id: number, username: string }} user - req.user from requireAuth
 * @returns {Promise<string>} Display name, falling back to the username
 */
async function resolveCompletedBy(user) {
  if (!user) return null;
  try {
    const [rows] = await pool.query('SELECT display_name FROM users WHERE id = ?', [user.id]);
    return (rows[0] && rows[0].display_name) || user.username || null;
  } catch (_) {
    return user.username || null;
  }
}

/**
 * Formats a Date as a MySQL DATETIME string in local time.
 * @param {Date} date
 * @returns {string} "YYYY-MM-DD HH:MM:SS"
 */
function toMysqlDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * POST / - create a Waste submission.
 * The selected date is stored in started_at at 00:00:00 so the portal's date
 * filters and ordering work without special-casing this table.
 * @param {Object} req.body - { waste_date, shift, department, waste_type, kg }
 * @returns {Object} { id, message }
 */
router.post('/', async (req, res) => {
  try {
    const { waste_date, shift, department, waste_type, kg } = req.body;

    if (!waste_date || !/^\d{4}-\d{2}-\d{2}$/.test(waste_date)) {
      return res.status(400).json({ error: 'A valid date is required' });
    }
    if (!SHIFTS.includes(shift)) {
      return res.status(400).json({ error: 'A valid shift is required' });
    }
    if (!DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: 'A valid department is required' });
    }

    let wasteType = null;
    if (department === WASTE_TYPE_DEPARTMENT) {
      if (!WASTE_TYPES.includes(waste_type)) {
        return res.status(400).json({ error: 'Waste or Lumps must be selected for Extrusion' });
      }
      wasteType = waste_type;
    }

    const kgValue = Number(kg);
    if (!Number.isFinite(kgValue) || kgValue < 0) {
      return res.status(400).json({ error: 'Kg must be a positive number' });
    }

    const completedBy = await resolveCompletedBy(req.user);
    const completedAt = toMysqlDateTime(new Date());

    const [result] = await pool.execute(
      `INSERT INTO waste_submissions (
        started_at, shift, department, waste_type, kg, completed_by, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`${waste_date} 00:00:00`, shift, department, wasteType, kgValue, completedBy, completedAt]
    );

    const id = result.insertId;

    const [rows] = await pool.query('SELECT * FROM waste_submissions WHERE id = ?', [id]);
    if (rows[0]) {
      sendWasteReport(rows[0]).catch((e) => console.error('[Egnyte] Waste send error:', e));
    }
    res.status(201).json({ id, message: 'Waste submission saved' });
  } catch (err) {
    console.error('Waste insert error:', err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

/**
 * GET / - list recent Waste submissions.
 * @returns {Object[]} rows
 */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM waste_submissions ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error('Waste list error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

/**
 * POST /:id/email-report - re-generate the Waste report and upload it to Egnyte.
 * @param {number} req.params.id
 */
router.post('/:id/email-report', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [rows] = await pool.query('SELECT * FROM waste_submissions WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await sendWasteReport(rows[0]);
    res.json({ message: 'Report sent' });
  } catch (err) {
    console.error('Waste email report error:', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});

module.exports = router;
