/**
 * JWT authentication middleware.
 * Verifies Bearer token from Authorization header and attaches decoded user to req.user.
 *
 * Exports:
 *   requireAuth  - rejects 401 if token missing/invalid
 *   requireAdmin - rejects 403 if user role is not 'admin'
 *
 * Requires env: JWT_SECRET
 */

const jwt = require('jsonwebtoken');

const SECRET = () => process.env.JWT_SECRET || 'material-hub-default-secret';

/**
 * Express middleware that requires a valid JWT.
 * Attaches decoded payload { id, username, role } to req.user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.mh_session || '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, SECRET());
    req.user = decoded;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

/**
 * Express middleware that requires admin role.
 * Must be used after requireAuth.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

/**
 * Express middleware that allows any authenticated user (admin, user, viewer).
 * Used for portal routes accessible to all roles.
 * Must be used after requireAuth.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requirePortalAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const allowed = ['admin', 'user', 'viewer'];
  if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

module.exports = { requireAuth, requireAdmin, requirePortalAccess };
