const express = require('express');
const { getDatabase } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity } = require('../services/auditService');
const { broadcast } = require('../services/sseService');

const router = express.Router();

// GET all beds
router.get('/', (req, res, next) => {
  try {
    const db = getDatabase();
    const { ward = '', status = '', bed_type = '' } = req.query;

    let whereClauses = ['1=1'];
    let params = [];

    if (ward.trim()) {
      whereClauses.push('b.ward = ?');
      params.push(ward.trim());
    }

    if (status.trim()) {
      whereClauses.push('b.status = ?');
      params.push(status.trim());
    }

    if (bed_type.trim()) {
      whereClauses.push('b.bed_type = ?');
      params.push(bed_type.trim());
    }

    const beds = db.prepare(`
      SELECT 
        b.*,
        c.case_number,
        c.priority as case_priority,
        c.category as case_category
      FROM beds b
      LEFT JOIN emergency_cases c ON b.current_case_id = c.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY b.ward ASC, b.bed_number ASC
    `).all(...params);

    // Summary counters
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'Out of Service' THEN 1 ELSE 0 END) as out_of_service
      FROM beds
    `).get();

    res.json({
      success: true,
      data: beds,
      summary: {
        total: summary.total || 0,
        available: summary.available || 0,
        occupied: summary.occupied || 0,
        outOfService: summary.out_of_service || 0,
        occupancyRate: summary.total > 0 ? Math.round((summary.occupied / summary.total) * 100) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST add new bed
router.post('/', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const { bed_number, ward, bed_type, notes = '' } = req.body;

    if (!bed_number || !ward || !bed_type) {
      return res.status(400).json({ success: false, error: 'Bed number, ward, and bed type are required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO beds (bed_number, ward, bed_type, status, notes)
      VALUES (?, ?, ?, 'Available', ?)
    `);

    const result = stmt.run(bed_number.trim(), ward.trim(), bed_type.trim(), notes.trim());

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'BED_CREATED',
      entityType: 'Bed',
      entityId: bed_number.trim(),
      description: `Added new bed ${bed_number.trim()} in ${ward.trim()} (${bed_type.trim()})`,
    });

    broadcast('bed:updated', { bedNumber: bed_number.trim() });
    broadcast('dashboard:refresh', { source: 'bed:created' });

    res.status(201).json({
      success: true,
      message: `Bed ${bed_number} created successfully.`,
      id: Number(result.lastInsertRowid),
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: 'Bed number already exists.' });
    }
    next(err);
  }
});

// PATCH update bed
router.patch('/:id', requireAuth, requireRole('admin', 'coordinator', 'staff'), (req, res, next) => {
  try {
    const db = getDatabase();
    const bedId = req.params.id;

    const existing = db.prepare('SELECT * FROM beds WHERE id = ?').get(bedId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bed not found.' });
    }

    const { status, ward, bed_type, notes } = req.body;

    // Safety checks
    if (status === 'Available' && existing.current_case_id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot mark an assigned bed Available directly. Please release the active case first.',
      });
    }

    const newStatus = status || existing.status;
    const newWard = ward || existing.ward;
    const newType = bed_type || existing.bed_type;
    const newNotes = notes !== undefined ? notes : existing.notes;

    db.prepare(`
      UPDATE beds
      SET status = ?, ward = ?, bed_type = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, newWard, newType, newNotes, bedId);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'BED_UPDATED',
      entityType: 'Bed',
      entityId: existing.bed_number,
      description: `Updated bed ${existing.bed_number} (status: ${newStatus})`,
      details: { bedId, newStatus },
    });

    broadcast('bed:updated', { bedId, status: newStatus });
    broadcast('dashboard:refresh', { source: 'bed:updated' });

    res.json({
      success: true,
      message: `Bed ${existing.bed_number} updated.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST release bed
router.post('/:id/release', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const bedId = req.params.id;

    const existing = db.prepare('SELECT * FROM beds WHERE id = ?').get(bedId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bed not found.' });
    }

    db.prepare(`
      UPDATE beds
      SET status = 'Available', current_case_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bedId);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'BED_RELEASED',
      entityType: 'Bed',
      entityId: existing.bed_number,
      description: `Released bed ${existing.bed_number} to Available pool.`,
    });

    broadcast('bed:updated', { bedId, status: 'Available' });
    broadcast('dashboard:refresh', { source: 'bed:released' });

    res.json({
      success: true,
      message: `Bed ${existing.bed_number} has been released and is now Available.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
