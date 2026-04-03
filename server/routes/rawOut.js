/**
 * Raw Out submission route.
 * POST /api/raw-out - insert a new Raw Out record with optional load images.
 * GET /api/raw-out - list recent Raw Out records.
 * POST /api/raw-out/:id/email-report - re-send report.
 *
 * Body: started_at, location_street, location_area, location_lat, location_lng,
 * customer_name, transporter, reason_for_material_out,
 * grades_sent (array of {grade, batch}), vehicle_registration, vehicle_state,
 * load_images (array of base64 JPEG strings),
 * damaged_bags, pallets_wrapped, driver_name, invoice_number,
 * additional_comments, checked_by, completed_at
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { sendRawOutReport } = require('../email');

const router = express.Router();

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'raw-out');

/**
 * Saves base64 JPEG images to disk and returns relative paths.
 * @param {number} submissionId - Raw Out submission ID
 * @param {string[]} base64Images - Array of base64 encoded JPEG strings (no data URI prefix)
 * @returns {string[]} Saved file paths relative to uploads root
 */
function saveLoadImages(submissionId, base64Images) {
  if (!Array.isArray(base64Images) || base64Images.length === 0) return [];
  const dir = path.join(UPLOADS_ROOT, String(submissionId));
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  base64Images.forEach((b64, idx) => {
    if (typeof b64 !== 'string' || !b64.length) return;
    const clean = b64.replace(/^data:image\/\w+;base64,/, '');
    const filename = `img_${idx + 1}.jpg`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, Buffer.from(clean, 'base64'));
    saved.push(path.join('raw-out', String(submissionId), filename));
  });
  return saved;
}

/**
 * Resolves relative image paths to absolute paths.
 * @param {string[]} relativePaths
 * @returns {string[]} Absolute file paths
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
  return path.join('raw-out', String(submissionId), filename);
}

/**
 * POST / - create Raw Out submission.
 * @param {Object} req.body - Raw Out payload
 * @returns {Object} { id, message }
 */
router.post('/', async (req, res) => {
  try {
    const {
      started_at,
      location_street,
      location_area,
      location_lat,
      location_lng,
      customer_name,
      transporter,
      reason_for_material_out,
      grades_sent,
      vehicle_registration,
      load_images,
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

    const gradesJson = Array.isArray(grades_sent) && grades_sent.length > 0
      ? JSON.stringify(grades_sent) : null;

    const [result] = await pool.execute(
      `INSERT INTO raw_out_submissions (
        started_at, location_street, location_area, location_lat, location_lng,
        customer_name, transporter, reason_for_material_out, grades_sent,
        vehicle_registration, vehicle_state, damaged_bags, pallets_wrapped,
        driver_name, invoice_number, additional_comments, checked_by, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        started_at,
        location_street || null,
        location_area || null,
        location_lat ?? null,
        location_lng ?? null,
        customer_name || null,
        transporter || null,
        reason_for_material_out || null,
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

    let savedPaths = [];
    if (Array.isArray(load_images) && load_images.length > 0) {
      savedPaths = saveLoadImages(id, load_images.slice(0, 4));
      if (savedPaths.length > 0) {
        await pool.execute(
          'UPDATE raw_out_submissions SET load_images = ? WHERE id = ?',
          [JSON.stringify(savedPaths), id]
        );
      }
    }

    let invoicePath = null;
    if (typeof invoice_image === 'string' && invoice_image.length > 0) {
      invoicePath = saveInvoiceImage(id, invoice_image);
      await pool.execute(
        'UPDATE raw_out_submissions SET invoice_image = ? WHERE id = ?',
        [invoicePath, id]
      );
    }

    const [rows] = await pool.query('SELECT * FROM raw_out_submissions WHERE id = ?', [id]);
    if (rows[0]) {
      const absolutePaths = resolveImagePaths(savedPaths);
      const absInvoicePath = invoicePath ? resolveImagePaths([invoicePath])[0] || null : null;
      sendRawOutReport(rows[0], absolutePaths, absInvoicePath).catch((e) => console.error('[Email] Raw Out send error:', e));
    }
    res.status(201).json({ id, message: 'Raw Out submission saved' });
  } catch (err) {
    console.error('Raw Out insert error:', err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

/**
 * GET / - list recent Raw Out submissions.
 * @returns {Object[]} rows
 */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM raw_out_submissions ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error('Raw Out list error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

/**
 * POST /:id/email-report - re-send Raw Out report.
 * @param {number} req.params.id
 */
router.post('/:id/email-report', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const [rows] = await pool.query('SELECT * FROM raw_out_submissions WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const imgPaths = rows[0].load_images
      ? resolveImagePaths(typeof rows[0].load_images === 'string' ? JSON.parse(rows[0].load_images) : rows[0].load_images)
      : [];
    const invoiceImgPath = rows[0].invoice_image
      ? (resolveImagePaths([rows[0].invoice_image])[0] || null)
      : null;
    await sendRawOutReport(rows[0], imgPaths, invoiceImgPath);
    res.json({ message: 'Report sent' });
  } catch (err) {
    console.error('Raw Out email report error:', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});

module.exports = router;
