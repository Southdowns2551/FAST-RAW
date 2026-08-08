/**
 * Material Hub API - Express server.
 * Serves API routes and connects to MySQL via app-network.
 *
 * Environment: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
 * Port: 3000 (default)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { testConnection } = require('./db');
const { requireAuth, requireAdmin, requirePortalAccess } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const rawInRouter = require('./routes/rawIn');
const rawOutRouter = require('./routes/rawOut');
const reworkOutRouter = require('./routes/reworkOut');
const reworkInRouter = require('./routes/reworkIn');
const wasteRouter = require('./routes/waste');
const settingsRouter = require('./routes/settings');
const portalRouter = require('./routes/portal');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/raw-in', requireAuth, rawInRouter);
app.use('/api/raw-out', requireAuth, rawOutRouter);
app.use('/api/rework-out', requireAuth, reworkOutRouter);
app.use('/api/rework-in', requireAuth, reworkInRouter);
app.use('/api/waste', requireAuth, wasteRouter);
app.use('/api/settings', requireAuth, (req, _res, next) => {
  if (req.method === 'GET') return next();
  requireAdmin(req, _res, next);
}, settingsRouter);
app.use('/api/portal', requireAuth, requirePortalAccess, portalRouter);

app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Material Hub API listening on port ${PORT}`);
});
