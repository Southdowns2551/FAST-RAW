/**
 * Raw In submission route.
 * POST /api/raw-in - insert a new Raw In record.
 * POST /api/raw-in/:id/email-report - send one-page report to reports@italpac.co.za
 *
 * Body: started_at, location_street, location_area, location_lat, location_lng,
 * supplier, transporter, grades_received (array of {grade, batch}), vehicle_registration, vehicle_state,
 * damaged_bags, pallets_wrapped, driver_name, invoice_number, invoice_image (base64 JPEG),
 * additional_comments, checked_by, completed_at
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { sendRawInReport } = require('../email');

const router = express.Router();

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'raw-in');

/**
 * Resolves relative image paths to absolute paths.
 * @param {string[]} relativePaths
 * @returns {string[]} Absolute file paths that exist on disk
 */
function resolveImagePaths(relativePaths) {
  if (!Array.isArray(relativePaths)) return [];
  const uploadsBase = path.join(__dirname, '..', 'uploads');
  return relativePaths
    .map((p) => path.join(uploadsBase, p))
    .filter((p) => fs.existsSync(p));
}

/**
 * Saves a single base64 JPEG invoice image to disk.
 * @param {number} submissionId
 * @param {string} base64Str - Base64 encoded JPEG (no data URI prefix)
 * @returns {string} Relative path from uploads root
 */
function saveInvoiceImage(submissionId, base64Str) {
  const dir = path.join(UPLOADS_ROOT, String(submissionId));
  fs.mkdirSync(dir, { recursive: true });
  const clean = base64Str.replace(/^data:image\/\w+;base64,/, '');
  const filename = 'invoice.jpg';
  fs.writeFileSync(path.join(dir, filename), Buffer.from(clean, 'base64'));
  return path.join('raw-in', String(submissionId), filename);
}

router.post('/', async (req, res) => {
  try {
    const {
      started_at,
      location_street,
      location_area,
      location_lat,
      location_lng,
      supplier,
      transporter,
      grades_received,
      vehicle_registration,
      vehicle_state,
      damaged_bags,
      pallets_wrapped,
      driver_name,
      invoice_number,
      invoice_image,
      additional_comments,
      checked_by,
      completed_at
    } = req.body;

    if (!started_at) {
      return res.status(400).json({ error: 'started_at is required' });
    }

    const gradesJson = Array.isArray(grades_received) && grades_received.length > 0
      ? JSON.stringify(grades_received) : null;

    const [result] = await pool.execute(
      `INSERT INTO raw_in_submissions (
        started_at, location_street, location_area, location_lat, location_lng,
        supplier, transporter, grades_received, vehicle_registration, vehicle_state,
        damaged_bags, pallets_wrapped, driver_name, invoice_number, additional_comments,
        checked_by, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        started_at,
        location_street || null,
        location_area || null,
        location_lat ?? null,
        location_lng ?? null,
        supplier || null,
        transporter || null,
        gradesJson,
        vehicle_registration || null,
        vehicle_state || null,
        damaged_bags || null,
        pallets_wrapped || null,
        driver_name || null,
        invoice_number || null,
        additional_comments || null,
        checked_by || null,
        completed_at || null
      ]
    );

    const id = result.insertId;

    let invoicePath = null;
    if (typeof invoice_image === 'string' && invoice_image.length > 0) {
      invoicePath = saveInvoiceImage(id, invoice_image);
      await pool.execute(
        'UPDATE raw_in_submissions SET invoice_image = ? WHERE id = ?',
        [invoicePath, id]
      );
    }

    const [rows] = await pool.query('SELECT * FROM raw_in_submissions WHERE id = ?', [id]);
    if (rows[0]) {
      const absInvoicePath = invoicePath ? resolveImagePaths([invoicePath])[0] || null : null;
      sendRawInReport(rows[0], absInvoicePath).catch((e) => console.error('[Email] send error:', e));
    }
    res.status(201).json({ id, message: 'Raw In submission saved' });
  } catch (err) {
    console.error('Raw In insert error:', err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM raw_in_submissions ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error('Raw In list error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

router.post('/:id/email-report', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [rows] = await pool.query('SELECT * FROM raw_in_submissions WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const invoiceImgPath = rows[0].invoice_image
      ? (resolveImagePaths([rows[0].invoice_image])[0] || null)
      : null;
    await sendRawInReport(rows[0], invoiceImgPath);
    res.json({ message: 'Report sent' });
  } catch (err) {
    console.error('Email report error:', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});

module.exports = router;
