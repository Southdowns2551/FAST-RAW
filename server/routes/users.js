/**
 * User management routes (admin only).
 *
 * GET    /api/users              - list all users
 * POST   /api/users              - create user { username, password, display_name, role }
 * DELETE /api/users/:id          - delete user (cannot delete self)
 * PUT    /api/users/:id/password - reset password { password }
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

router.use(requireAuth, requireAdmin);

/**
 * GET / - list all users (no password hashes).
 * @returns {{ id, username, display_name, role, created_at }[]}
 */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST / - create a new user.
 * Body: { username, password, display_name, role }
 * @returns {{ id, username, display_name, role }}
 */
router.post('/', async (req, res) => {
  try {
    const { username, password, display_name, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const validRole = role === 'admin' ? 'admin' : 'user';
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      [username.trim(), hash, (display_name || username).trim(), validRole]
    );
    res.status(201).json({
      id: result.insertId,
      username: username.trim(),
      display_name: (display_name || username).trim(),
      role: validRole
    });
  } catch (err) {
    console.error('User create error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * DELETE /:id - delete a user. Cannot delete yourself.
 * @param {number} id
 */
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });

  try {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('User delete error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * PUT /:id/password - reset a user's password.
 * Body: { password }
 */
router.put('/:id/password', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
