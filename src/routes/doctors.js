const express = require('express');
const { getDatabase } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity } = require('../services/auditService');
const { broadcast } = require('../services/sseService');

const router = express.Router();

// GET all doctors
router.get('/', (req, res, next) => {
  try {
    const db = getDatabase();
    const { specialty = '', shift = '', status = '' } = req.query;

    let whereClauses = ['1=1'];
    let params = [];

    if (specialty.trim()) {
      whereClauses.push('specialty = ?');
      params.push(specialty.trim());
    }

    if (shift.trim()) {
      whereClauses.push('shift = ?');
      params.push(shift.trim());
    }

    if (status.trim()) {
      whereClauses.push('status = ?');
      params.push(status.trim());
    }

    const doctors = db.prepare(`
      SELECT * FROM doctors
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY 
        CASE status 
          WHEN 'Available' THEN 1 
          WHEN 'Busy' THEN 2 
          ELSE 3 
        END,
        current_workload ASC,
        name ASC
    `).all(...params);

    // Summary counts
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'Busy' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'Off Duty' THEN 1 ELSE 0 END) as off_duty,
        SUM(current_workload) as total_workload,
        SUM(max_workload) as total_capacity
      FROM doctors
    `).get();

    res.json({
      success: true,
      data: doctors,
      summary: {
        total: summary.total || 0,
        available: summary.available || 0,
        busy: summary.busy || 0,
        offDuty: summary.off_duty || 0,
        totalWorkload: summary.total_workload || 0,
        totalCapacity: summary.total_capacity || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST add new doctor
router.post('/', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    const db = getDatabase();
    const { name, specialty, shift = 'Day', max_workload = 4, notes = '' } = req.body;

    if (!name || !specialty) {
      return res.status(400).json({ success: false, error: 'Doctor name and specialty are required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO doctors (name, specialty, shift, status, max_workload, current_workload, notes)
      VALUES (?, ?, ?, 'Available', ?, 0, ?)
    `);

    const result = stmt.run(name.trim(), specialty.trim(), shift, parseInt(max_workload, 10) || 4, notes.trim());

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'DOCTOR_ADDED',
      entityType: 'Doctor',
      entityId: name.trim(),
      description: `Added physician ${name.trim()} (${specialty.trim()}) to staff roster.`,
    });

    broadcast('doctor:updated', { doctorName: name.trim() });
    broadcast('dashboard:refresh', { source: 'doctor:added' });

    res.status(201).json({
      success: true,
      message: `Doctor ${name} added successfully.`,
      id: Number(result.lastInsertRowid),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH update doctor status or workload limit
router.patch('/:id', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const doctorId = req.params.id;

    const existing = db.prepare('SELECT * FROM doctors WHERE id = ?').get(doctorId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Doctor not found.' });
    }

    const { status, shift, max_workload, notes } = req.body;

    const newStatus = status || existing.status;
    const newShift = shift || existing.shift;
    const newMax = max_workload !== undefined ? parseInt(max_workload, 10) : existing.max_workload;
    const newNotes = notes !== undefined ? notes : existing.notes;

    db.prepare(`
      UPDATE doctors
      SET status = ?, shift = ?, max_workload = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, newShift, newMax, newNotes, doctorId);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'DOCTOR_UPDATED',
      entityType: 'Doctor',
      entityId: existing.name,
      description: `Updated doctor ${existing.name} (status: ${newStatus}, shift: ${newShift})`,
      details: { doctorId, newStatus },
    });

    broadcast('doctor:updated', { doctorId, status: newStatus });
    broadcast('dashboard:refresh', { source: 'doctor:updated' });

    res.json({
      success: true,
      message: `Physician ${existing.name} updated.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
