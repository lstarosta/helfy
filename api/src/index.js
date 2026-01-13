/**
 * Helfy API Server
 * A simple authentication API with login, register, and token management
 */

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const log4js = require('log4js');

// ============================================
// LOGGING SETUP (log4js - required)
// ============================================
log4js.configure({
  appenders: {
    console: { type: 'console', layout: { type: 'pattern', pattern: '%m' } },
    default: { type: 'console', layout: { type: 'pattern', pattern: '[%d] [%p] %c - %m' } }
  },
  categories: {
    default: { appenders: ['default'], level: 'info' },
    activity: { appenders: ['console'], level: 'info' }
  }
});

const logger = log4js.getLogger('default');
const activityLogger = log4js.getLogger('activity');

// Log user activity in JSON format (required by assignment)
function logUserActivity(userId, action, ipAddress, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    ipAddress,
    ...extra
  };
  activityLogger.info(JSON.stringify(entry));
}

// ============================================
// DATABASE CONNECTION
// ============================================
const dbConfig = {
  host: process.env.DB_HOST || 'tidb',
  port: parseInt(process.env.DB_PORT) || 4000,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'helfy',
  waitForConnections: true,
  connectionLimit: 10
};

let pool;

async function getDb() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

async function query(sql, params) {
  const db = await getDb();
  const [rows] = await db.execute(sql, params);
  return rows;
}

// Wait for database to be ready
async function waitForDatabase() {
  for (let i = 0; i < 30; i++) {
    try {
      const conn = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password
      });
      await conn.query(`USE ${dbConfig.database}`);
      await conn.end();
      logger.info('Database connected!');
      return;
    } catch (err) {
      logger.warn(`Waiting for database... (${i + 1}/30)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Database connection failed');
}

// ============================================
// EXPRESS APP SETUP
// ============================================
const app = express();
app.use(cors());
app.use(express.json());

// Get client IP address
function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
async function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const rows = await query(
      `SELECT t.*, u.id as userId, u.email, u.username 
       FROM user_tokens t 
       JOIN users u ON t.user_id = u.id 
       WHERE t.token = ? AND t.expires_at > NOW()`,
      [token]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = { id: rows[0].userId, email: rows[0].email, username: rows[0].username };
    req.token = token;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth error' });
  }
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user
    const users = await query('SELECT * FROM users WHERE email = ? OR username = ?', [email, email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = users[0];
    
    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Create token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await query('INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', 
      [user.id, token, expiresAt]);
    
    // Log activity (required)
    logUserActivity(user.id, 'LOGIN', getIP(req), { username: user.username, email: user.email });
    
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, username: user.username }
    });
  } catch (err) {
    logger.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if exists
    const existing = await query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Create user
    const hash = await bcrypt.hash(password, 10);
    const result = await query('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)',
      [email, username, hash]);
    
    const userId = result.insertId;
    
    // Create token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await query('INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, token, expiresAt]);
    
    // Log activity
    logUserActivity(userId, 'REGISTER', getIP(req), { username, email });
    
    res.status(201).json({
      success: true,
      token,
      user: { id: userId, email, username }
    });
  } catch (err) {
    logger.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Logout
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM user_tokens WHERE token = ?', [req.token]);
    logUserActivity(req.user.id, 'LOGOUT', getIP(req), { username: req.user.username });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// Verify token
app.get('/api/auth/verify', authMiddleware, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ============================================
// START SERVER
// ============================================
async function ensureAdminUser() {
  try {
    const users = await query('SELECT id FROM users WHERE email = ?', ['admin@helfy.com']);
    if (users.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await query('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)',
        ['admin@helfy.com', 'admin', hash]);
      logger.info('Admin user created');
    } else {
      // Update password to ensure it works
      const hash = await bcrypt.hash('admin123', 10);
      await query('UPDATE users SET password_hash = ? WHERE email = ?', [hash, 'admin@helfy.com']);
      logger.info('Admin user ready');
    }
  } catch (err) {
    logger.error('Admin user error:', err.message);
  }
}

async function start() {
  logger.info('Starting Helfy API...');
  await waitForDatabase();
  await ensureAdminUser();
  
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`API running on port ${PORT}`);
  });
}

start();
