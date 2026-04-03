/**
 * Settings API - Suppliers, Transporters, Material grades, Masterbatch grades, Rework grades,
 * Material out reasons, and app-wide key-value settings (ANPR key).
 *
 * Resource CRUD:
 *   GET /api/settings/suppliers|transporters|grades|masterbatch_grades|rework_grades|reasons
 *   POST /api/settings/suppliers|transporters|grades|masterbatch_grades|rework_grades|reasons (body: { name })
 *   DELETE /api/settings/suppliers|transporters|grades|masterbatch_grades|rework_grades|reasons/:id
 *
 * App settings:
 *   GET /api/settings/app/:key
 *   PUT /api/settings/app/:key (body: { value })
 */

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

/**
 * GET /api/settings/app/:key - read an app setting.
 * @param {string} key - setting_key (e.g. anpr_key)
 * @returns {{ value: string }}
 */
router.get('/app/:key', async (req, res) => {
  const key = req.params.key;
  try {
    const [rows] = await pool.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]
    );
    res.json({ value: rows[0]?.setting_value || '' });
  } catch (err) {
    console.error(`App setting get ${key} error:`, err);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

/**
 * PUT /api/settings/app/:key - upsert an app setting.
 * @param {string} key - setting_key
 * Body: { value: string }
 * @returns {{ key: string, value: string }}
 */
router.put('/app/:key', async (req, res) => {
  const key = req.params.key;
  const value = (req.body.value != null ? String(req.body.value) : '').trim();
  try {
    await pool.execute(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value]
    );
    res.json({ key, value });
  } catch (err) {
    console.error(`App setting put ${key} error:`, err);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

/**
 * GET /api/settings/backup - export all settings as JSON.
 * Returns: { version, createdAt, suppliers, transporters, grades, masterbatch_grades, rework_grades, reasons, app_settings }
 */
router.get('/backup', async (_req, res) => {
  try {
    const [suppliers] = await pool.query('SELECT id, name FROM suppliers ORDER BY name');
    const [transporters] = await pool.query('SELECT id, name FROM transporters ORDER BY name');
    const [grades] = await pool.query('SELECT id, name FROM material_grades ORDER BY name');
    const [masterbatchGrades] = await pool.query('SELECT id, name FROM masterbatch_grades ORDER BY name');
    const [reworkGrades] = await pool.query('SELECT id, name FROM rework_grades ORDER BY name');
    const [reasons] = await pool.query('SELECT id, name FROM material_out_reasons ORDER BY name');
    const [appSettings] = await pool.query('SELECT setting_key AS `key`, setting_value AS value FROM app_settings');

    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      suppliers,
      transporters,
      grades,
      masterbatch_grades: masterbatchGrades,
      rework_grades: reworkGrades,
      reasons,
      app_settings: appSettings
    };
    res.json(backup);
  } catch (err) {
    console.error('Settings backup error:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

/**
 * POST /api/settings/restore - restore settings from backup JSON.
 * Body: { suppliers, transporters, grades, masterbatch_grades, rework_grades, reasons, app_settings }
 * Replaces all existing data in settings tables.
 */
router.post('/restore', async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid backup data' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const tables = [
      ['suppliers', Array.isArray(data.suppliers) ? data.suppliers : []],
      ['transporters', Array.isArray(data.transporters) ? data.transporters : []],
      ['grades', Array.isArray(data.grades) ? data.grades : []],
      ['masterbatch_grades', Array.isArray(data.masterbatch_grades) ? data.masterbatch_grades : []],
      ['rework_grades', Array.isArray(data.rework_grades) ? data.rework_grades : []],
      ['reasons', Array.isArray(data.reasons) ? data.reasons : []]
    ];

    const tableMap = {
      suppliers: 'suppliers',
      transporters: 'transporters',
      grades: 'material_grades',
      masterbatch_grades: 'masterbatch_grades',
      rework_grades: 'rework_grades',
      reasons: 'material_out_reasons'
    };

    for (const [key, rows] of tables) {
      const table = tableMap[key];
      await conn.query(`DELETE FROM ${table}`);
      for (const row of rows) {
        const name = (row && row.name) ? String(row.name).trim() : '';
        if (name) await conn.execute(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
      }
    }

    const appSettings = Array.isArray(data.app_settings) ? data.app_settings : [];
    for (const row of appSettings) {
      const k = row && row.key ? String(row.key).trim() : '';
      const v = row && row.value != null ? String(row.value) : '';
      if (k) {
        await conn.execute(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [k, v]
        );
      }
    }

    await conn.commit();
    res.json({ message: 'Settings restored successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Settings restore error:', err);
    res.status(500).json({ error: 'Failed to restore: ' + (err.message || 'Unknown error') });
  } finally {
    conn.release();
  }
});

const TABLES = {
  suppliers: 'suppliers',
  transporters: 'transporters',
  grades: 'material_grades',
  masterbatch_grades: 'masterbatch_grades',
  rework_grades: 'rework_grades',
  reasons: 'material_out_reasons'
};

/**
 * Validates resource type.
 * @param {string} resource
 * @returns {string|null} table name or null
 */
function getTable(resource) {
  return TABLES[resource] || null;
}

/**
 * GET /api/settings/:resource - list all records
 * @param {string} resource - suppliers | transporters | grades
 */
router.get('/:resource', async (req, res) => {
  const table = getTable(req.params.resource);
  if (!table) return res.status(400).json({ error: 'Invalid resource' });
  try {
    const [rows] = await pool.query(`SELECT id, name FROM ${table} ORDER BY name ASC`);
    res.json(rows);
  } catch (err) {
    console.error(`Settings list ${table} error:`, err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

/**
 * POST /api/settings/:resource - add record
 * Body: { name: string }
 */
router.post('/:resource', async (req, res) => {
  const table = getTable(req.params.resource);
  if (!table) return res.status(400).json({ error: 'Invalid resource' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const [existing] = await pool.query(`SELECT id FROM ${table} WHERE name = ?`, [name]);
    if (existing.length > 0) return res.status(409).json({ error: 'Already exists' });
    const [result] = await pool.execute(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    console.error(`Settings add ${table} error:`, err);
    const code = err.code || '';
    const msg = code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR'
      ? 'Database tables missing. Run migrations (001–010).'
      : code === 'ER_ACCESS_DENIED_ERROR' || err.message?.includes('Access denied')
        ? 'Database connection failed. Check server configuration.'
        : 'Failed to add';
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /api/settings/:resource/:id - remove record
 */
router.delete('/:resource/:id', async (req, res) => {
  const table = getTable(req.params.resource);
  if (!table) return res.status(400).json({ error: 'Invalid resource' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const [result] = await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(`Settings delete ${table} error:`, err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
