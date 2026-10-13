const express = require('express');
const { getDatabase } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { seedDatabase } = require('../db/seed');
const { logActivity } = require('../services/auditService');
const { broadcast } = require('../services/sseService');

const router = express.Router();

// GET priority configurations
router.get('/priorities', (req, res, next) => {
  try {
    const db = getDatabase();
    const priorities = db.prepare('SELECT * FROM priority_settings ORDER BY sort_order ASC').all();
    res.json({ success: true, data: priorities });
  } catch (err) {
    next(err);
  }
});

// PATCH update priority configuration (Admin only)
router.patch('/priorities', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    const db = getDatabase();
    const { priorities } = req.body;

    if (!Array.isArray(priorities) || priorities.length === 0) {
      return res.status(400).json({ success: false, error: 'Expected an array of priority configuration objects.' });
    }

    const updateStmt = db.prepare(`
      UPDATE priority_settings
      SET label = ?, score = ?, color = ?, sort_order = ?
      WHERE priority_key = ?
    `);

    const transaction = db.transaction(() => {
      for (const p of priorities) {
        if (!p.priority_key || p.score === undefined) continue;
        updateStmt.run(p.label, parseInt(p.score, 10), p.color || '#2563eb', parseInt(p.sort_order, 10) || 1, p.priority_key);
      }
    });

    transaction();

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'PRIORITY_CONFIG_UPDATED',
      entityType: 'SystemSettings',
      entityId: 'Priorities',
      description: 'Updated administrative priority scoring and labels.',
      details: priorities,
    });

    broadcast('dashboard:refresh', { source: 'priority:updated' });

    res.json({
      success: true,
      message: 'Priority configurations updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// GET system settings
router.get('/system', (req, res, next) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT * FROM system_settings').all();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
});

// POST reset demo data to pristine initial baseline (Admin only)
router.post('/reset-demo', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    const { confirm } = req.body;
    if (confirm !== true) {
      return res.status(400).json({ success: false, error: 'Confirmation required to reset demonstration data.' });
    }

    seedDatabase(true);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'DEMO_DATA_RESET',
      entityType: 'System',
      entityId: 'hospital.db',
      description: 'Administrator reset the hospital database to pristine demonstration seed data.',
    });

    broadcast('dashboard:refresh', { source: 'database:reset' });

    res.json({
      success: true,
      message: 'Hospital demonstration database has been successfully reset to initial pristine state.',
    });
  } catch (err) {
    next(err);
  }
});

// POST simulate mass surge / influx event (Coordinator or Admin)
router.post('/simulate-surge', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const y = new Date().getFullYear();

    const surgeCases = [
      {
        num: `CAS-${y}-${Math.floor(2000 + Math.random() * 7000)}`,
        ref: `PT-${Math.floor(1000 + Math.random() * 9000)}-S1`,
        age: 38,
        cat: 'Trauma',
        prio: 'Critical',
        area: 'Trauma Bay',
        spec: 'Trauma Surgery',
        trans: 1,
        notes: 'Simulated mass-transit accident victim. Multiple trauma with hypotension.'
      },
      {
        num: `CAS-${y}-${Math.floor(2000 + Math.random() * 7000)}`,
        ref: `PT-${Math.floor(1000 + Math.random() * 9000)}-S2`,
        age: 65,
        cat: 'Respiratory',
        prio: 'Critical',
        area: 'ICU',
        spec: 'Critical Care / ICU',
        trans: 1,
        notes: 'Simulated industrial chemical exposure with severe bronchospasm.'
      },
      {
        num: `CAS-${y}-${Math.floor(2000 + Math.random() * 7000)}`,
        ref: `PT-${Math.floor(1000 + Math.random() * 9000)}-S3`,
        age: 51,
        cat: 'Neurological',
        prio: 'High',
        area: 'Emergency Dept',
        spec: 'Neurology',
        trans: 0,
        notes: 'Simulated acute hemiparesis. Stroke protocol intake.'
      }
    ];

    const insertCase = db.prepare(`
      INSERT INTO emergency_cases (
        case_number, patient_ref, age, arrival_time, category, priority,
        care_area, specialty_needed, transport_needed, status, operational_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?)
    `);

    const transaction = db.transaction(() => {
      for (const sc of surgeCases) {
        insertCase.run(sc.num, sc.ref, sc.age, now, sc.cat, sc.prio, sc.area, sc.spec, sc.trans, sc.notes);
      }
    });

    transaction();

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'SURGE_SIMULATION',
      entityType: 'System',
      entityId: 'SURGE-EVENT',
      description: `Operator triggered simulated mass casualty surge (+3 incoming acute cases).`,
    });

    broadcast('case:created', { count: 3 });
    broadcast('dashboard:refresh', { source: 'surge:simulated' });

    res.json({
      success: true,
      message: 'Surge simulation active: 3 incoming urgent cases injected into queue.',
      casesAdded: surgeCases.map(c => c.num),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
