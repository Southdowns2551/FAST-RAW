/**
 * Raw In submission route.
 * POST /api/raw-in - insert a new Raw In record.
 * POST /api/raw-in/:id/email-report - send one-page report to reports@italpac.co.za
 *
 * Body: started_at, location_street, location_area, location_lat, location_lng,
 * supplier, transporter, grades_received (array of {grade, batch}), vehicle_registration, vehicle_state,
 * damaged_bags, pallets_wrapped, driver_name, invoice_number, invoice_images (array of base64 JPEG),
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
 * Saves an array of base64 JPEG invoice images to disk.
 * @param {number} submissionId
 * @param {string[]} base64Images - Array of base64 encoded JPEG strings
 * @returns {string[]} Relative paths from uploads root
 */
function saveInvoiceImages(submissionId, base64Images) {
  if (!Array.isArray(base64Images) || base64Images.length === 0) return [];
  const dir = path.join(UPLOADS_ROOT, String(submissionId));
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  base64Images.forEach((b64, idx) => {
    if (typeof b64 !== 'string' || !b64.length) return;
    const clean = b64.replace(/^data:image\/\w+;base64,/, '');
    const filename = `invoice_${idx + 1}.jpg`;
    fs.writeFileSync(path.join(dir, filename), Buffer.from(clean, 'base64'));
    saved.push(path.join('raw-in', String(submissionId), filename));
  });
  return saved;
}

/**
 * Parses the invoice_image DB column, handling both legacy single-path strings
 * and new JSON array format.
 * @param {string|null} val - Column value
 * @returns {string[]} Array of relative paths
 */
function parseInvoiceImages(val) {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [val];
  } catch (_) {
    return [val];
  }
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
      invoice_images,
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

    let invoicePaths = [];
    if (Array.isArray(invoice_images) && invoice_images.length > 0) {
      invoicePaths = saveInvoiceImages(id, invoice_images.slice(0, 5));
      if (invoicePaths.length > 0) {
        await pool.execute(
          'UPDATE raw_in_submissions SET invoice_image = ? WHERE id = ?',
          [JSON.stringify(invoicePaths), id]
        );
      }
    }

    const [rows] = await pool.query('SELECT * FROM raw_in_submissions WHERE id = ?', [id]);
    if (rows[0]) {
      const absInvoicePaths = resolveImagePaths(invoicePaths);
      sendRawInReport(rows[0], absInvoicePaths).catch((e) => console.error('[Email] send error:', e));
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
    const invoiceImgPaths = resolveImagePaths(parseInvoiceImages(rows[0].invoice_image));
    await sendRawInReport(rows[0], invoiceImgPaths);
    res.json({ message: 'Report sent' });
  } catch (err) {
    console.error('Email report error:', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});

module.exports = router;
