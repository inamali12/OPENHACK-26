const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../db/database');
const { loginLimiter } = require('../middleware/rateLimiter');
const { logActivity } = require('../services/auditService');

const router = express.Router();

router.post('/login', loginLimiter, (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    // Set user session
    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    };

    logActivity({
      userId: user.id,
      username: user.username,
      actionType: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      description: `User "${user.username}" (${user.role}) logged in successfully.`,
    });

    res.json({
      success: true,
      message: 'Login successful.',
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  try {
    const user = req.session ? req.session.user : null;
    if (user) {
      logActivity({
        userId: user.id,
        username: user.username,
        actionType: 'USER_LOGOUT',
        entityType: 'User',
        entityId: user.id,
        description: `User "${user.username}" logged out.`,
      });
    }

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Failed to clear session.' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Logged out successfully.' });
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      success: true,
      authenticated: true,
      user: req.session.user,
    });
  }
  res.json({
    success: true,
    authenticated: false,
    user: null,
  });
});

router.get('/demo-users', (req, res) => {
  res.json({
    success: true,
    disclaimer: 'Demonstration credentials for local hackathon evaluation only.',
    accounts: [
      { username: 'admin', role: 'admin', description: 'Administrator (System configuration, priority weights, reset database)' },
      { username: 'coordinator', role: 'coordinator', description: 'Emergency Coordinator (Case registration, allocation recommendations, triage)' },
      { username: 'staff', role: 'staff', description: 'Hospital Staff (View dashboard, beds, doctors, ambulances)' },
    ],
  });
});

module.exports = router;
