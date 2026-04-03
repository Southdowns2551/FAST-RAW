/**
 * Authentication routes.
 *
 * GET  /api/auth/setup-status  - { needsSetup: bool } — true when no users exist
 * POST /api/auth/setup         - create first admin account (one-time)
 * POST /api/auth/login         - validate credentials, return JWT
 * GET  /api/auth/me            - return current user from JWT
 *
 * Body (setup):  { username, password, display_name }
 * Body (login):  { username, password }
 * Returns JWT:   { token, user: { id, username, display_name, role } }
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '30d';
const COOKIE_NAME = 'mh_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SECRET = () => process.env.JWT_SECRET || 'material-hub-default-secret';

/**
 * Sets the JWT as an HttpOnly cookie on the response.
 * Survives iOS PWA reinstalls since cookies are tied to the domain.
 * @param {import('express').Response} res
 * @param {string} token
 */
function setSessionCookie(res, token) {
  const isSecure = res.req?.get('X-Forwarded-Proto') === 'https'
    || process.env.NODE_ENV === 'production'
    || process.env.HTTPS === '1';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  });
}

/**
 * Clears the session cookie.
 * @param {import('express').Response} res
 */
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, path: '/' });
}

/**
 * Signs a JWT for the given user row.
 * @param {{ id: number, username: string, role: string }} user
 * @returns {string} signed JWT
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * GET /setup-status - checks if any users exist.
 * @returns {{ needsSetup: boolean }}
 */
router.get('/setup-status', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    res.json({ needsSetup: rows[0].cnt === 0 });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ needsSetup: true });
    }
    console.error('Setup status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /setup - create the first admin account. Disabled once any user exists.
 * Body: { username, password, display_name }
 * @returns {{ token, user }}
 */
router.post('/setup', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    if (existing[0].cnt > 0) {
      return res.status(403).json({ error: 'Setup already completed' });
    }

    const { username, password, display_name } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      [username.trim(), hash, (display_name || username).trim(), 'admin']
    );

    const user = { id: result.insertId, username: username.trim(), display_name: (display_name || username).trim(), role: 'admin' };
    const token = signToken(user);
    setSessionCookie(res, token);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Setup error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /login - authenticate with username/password.
 * Body: { username, password }
 * @returns {{ token, user }}
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({
      token,
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /me - return current user from JWT.
 * When authenticated via cookie (no Authorization header), also returns a fresh
 * token so the frontend can repopulate localStorage after iOS purges it.
 * @returns {{ id, username, display_name, role, token? }}
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, display_name, role FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    const hasBearer = (req.headers.authorization || '').startsWith('Bearer ');
    if (hasBearer) {
      return res.json(user);
    }
    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({ user, token });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /logout - clears the session cookie.
 */
router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'Logged out' });
});

module.exports = router;
