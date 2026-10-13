const express = require('express');
const { getDatabase } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity } = require('../services/auditService');
const { broadcast } = require('../services/sseService');

const router = express.Router();

// GET all ambulances
router.get('/', (req, res, next) => {
  try {
    const db = getDatabase();
    const { capability = '', status = '' } = req.query;

    let whereClauses = ['1=1'];
    let params = [];

    if (capability.trim()) {
      whereClauses.push('a.capability = ?');
      params.push(capability.trim());
    }

    if (status.trim()) {
      whereClauses.push('a.status = ?');
      params.push(status.trim());
    }

    const ambulances = db.prepare(`
      SELECT 
        a.*,
        c.case_number,
        c.priority as case_priority
      FROM ambulances a
      LEFT JOIN emergency_cases c ON a.current_case_id = c.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY 
        CASE a.status 
          WHEN 'Available' THEN 1 
          WHEN 'Dispatched' THEN 2 
          WHEN 'En Route' THEN 3
          WHEN 'At Hospital' THEN 4
          ELSE 5
        END,
        a.call_sign ASC
    `).all(...params);

    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'Dispatched' THEN 1 ELSE 0 END) as dispatched,
        SUM(CASE WHEN status = 'En Route' THEN 1 ELSE 0 END) as en_route,
        SUM(CASE WHEN status = 'At Hospital' THEN 1 ELSE 0 END) as at_hospital,
        SUM(CASE WHEN status = 'Out of Service' THEN 1 ELSE 0 END) as out_of_service
      FROM ambulances
    `).get();

    res.json({
      success: true,
      data: ambulances,
      summary: {
        total: summary.total || 0,
        available: summary.available || 0,
        dispatched: summary.dispatched || 0,
        enRoute: summary.en_route || 0,
        atHospital: summary.at_hospital || 0,
        outOfService: summary.out_of_service || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST add ambulance
router.post('/', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const { call_sign, plate_number, capability, current_location, notes = '' } = req.body;

    if (!call_sign || !plate_number || !capability) {
      return res.status(400).json({ success: false, error: 'Call sign, license plate, and capability are required.' });
    }

    const loc = current_location ? `${current_location.trim()} (Simulated)` : 'Central Station (Simulated)';

    const stmt = db.prepare(`
      INSERT INTO ambulances (call_sign, plate_number, capability, status, current_location, notes)
      VALUES (?, ?, ?, 'Available', ?, ?)
    `);

    const result = stmt.run(call_sign.trim(), plate_number.trim(), capability.trim(), loc, notes.trim());

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'AMBULANCE_ADDED',
      entityType: 'Ambulance',
      entityId: call_sign.trim(),
      description: `Added ambulance unit ${call_sign.trim()} (${capability.trim()}) to fleet.`,
    });

    broadcast('ambulance:updated', { callSign: call_sign.trim() });
    broadcast('dashboard:refresh', { source: 'ambulance:added' });

    res.status(201).json({
      success: true,
      message: `Ambulance ${call_sign} registered.`,
      id: Number(result.lastInsertRowid),
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: 'Ambulance call sign already exists.' });
    }
    next(err);
  }
});

// PATCH update ambulance
router.patch('/:id', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const ambId = req.params.id;

    const existing = db.prepare('SELECT * FROM ambulances WHERE id = ?').get(ambId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Ambulance not found.' });
    }

    const { status, current_location, capability, notes } = req.body;

    const newStatus = status || existing.status;
    let newLoc = current_location !== undefined ? current_location : existing.current_location;
    if (newLoc && !newLoc.includes('(Simulated)')) {
      newLoc = `${newLoc} (Simulated)`;
    }
    const newCap = capability || existing.capability;
    const newNotes = notes !== undefined ? notes : existing.notes;

    db.prepare(`
      UPDATE ambulances
      SET status = ?, current_location = ?, capability = ?, notes = ?, last_status_update = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, newLoc, newCap, newNotes, ambId);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'AMBULANCE_UPDATED',
      entityType: 'Ambulance',
      entityId: existing.call_sign,
      description: `Updated ambulance ${existing.call_sign} to status "${newStatus}"`,
      details: { ambId, newStatus, newLoc },
    });

    broadcast('ambulance:updated', { ambId, status: newStatus });
    broadcast('dashboard:refresh', { source: 'ambulance:updated' });

    res.json({
      success: true,
      message: `Ambulance ${existing.call_sign} updated.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST simulate ambulance trip step progression
router.post('/:id/simulate-step', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const ambId = req.params.id;

    const existing = db.prepare('SELECT * FROM ambulances WHERE id = ?').get(ambId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Ambulance not found.' });
    }

    let nextStatus = 'Available';
    let nextLocation = 'Central Station (Simulated)';
    let caseId = existing.current_case_id;

    if (existing.status === 'Available') {
      nextStatus = 'Dispatched';
      nextLocation = 'Dispatched towards incident sector (Simulated)';
    } else if (existing.status === 'Dispatched') {
      nextStatus = 'En Route';
      nextLocation = 'In transit with patient, approaching hospital (Simulated)';
    } else if (existing.status === 'En Route') {
      nextStatus = 'At Hospital';
      nextLocation = 'ED Ambulance Bay, Dock 2 (Simulated)';
    } else if (existing.status === 'At Hospital') {
      nextStatus = 'Available';
      nextLocation = 'Base Station - Sanitized and Ready (Simulated)';
      caseId = null; // trip completed
    } else if (existing.status === 'Out of Service') {
      nextStatus = 'Available';
      nextLocation = 'Inspection Cleared - Base Station (Simulated)';
    }

    db.prepare(`
      UPDATE ambulances
      SET status = ?, current_location = ?, current_case_id = ?, last_status_update = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextStatus, nextLocation, caseId, ambId);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'AMBULANCE_STEP_SIMULATED',
      entityType: 'Ambulance',
      entityId: existing.call_sign,
      description: `Simulated trip step for ${existing.call_sign}: ${existing.status} -> ${nextStatus}`,
      details: { from: existing.status, to: nextStatus, location: nextLocation },
    });

    broadcast('ambulance:updated', { ambId, status: nextStatus, location: nextLocation });
    broadcast('dashboard:refresh', { source: 'ambulance:simulated' });

    res.json({
      success: true,
      message: `Ambulance ${existing.call_sign} simulated step advanced to "${nextStatus}".`,
      data: {
        id: ambId,
        call_sign: existing.call_sign,
        previousStatus: existing.status,
        newStatus: nextStatus,
        location: nextLocation,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
