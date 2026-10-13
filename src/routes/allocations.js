const express = require('express');
const { getDatabase } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getRecommendation, confirmAllocation } = require('../services/allocationEngine');

const router = express.Router();

// POST get transparent allocation recommendation for a case
router.post('/recommend', requireAuth, (req, res, next) => {
  try {
    const { caseId } = req.body;
    if (!caseId) {
      return res.status(400).json({ success: false, error: 'Case ID is required.' });
    }

    const recommendation = getRecommendation(caseId);
    res.json({
      success: true,
      data: recommendation,
    });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// POST confirm and apply resource allocation atomically
router.post('/confirm', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const { caseId, bedId, doctorId, ambulanceId, notes } = req.body;

    if (!caseId) {
      return res.status(400).json({ success: false, error: 'Case ID is required.' });
    }

    const result = confirmAllocation({
      caseId: parseInt(caseId, 10),
      bedId: bedId ? parseInt(bedId, 10) : null,
      doctorId: doctorId ? parseInt(doctorId, 10) : null,
      ambulanceId: ambulanceId ? parseInt(ambulanceId, 10) : null,
      userId: req.session.user.id,
      username: req.session.user.username,
      notes: notes || '',
    });

    res.json({
      success: true,
      message: 'Resource allocation confirmed and executed successfully.',
      data: result,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET allocation history
router.get('/history', requireAuth, (req, res, next) => {
  try {
    const db = getDatabase();
    const history = db.prepare(`
      SELECT 
        al.*,
        c.case_number, c.patient_ref, c.priority as case_priority, c.category as case_category,
        b.bed_number, b.ward, b.bed_type,
        d.name as doctor_name, d.specialty as doctor_specialty,
        amb.call_sign as ambulance_call_sign,
        u.full_name as allocated_by_name
      FROM allocations al
      LEFT JOIN emergency_cases c ON al.case_id = c.id
      LEFT JOIN beds b ON al.bed_id = b.id
      LEFT JOIN doctors d ON al.doctor_id = d.id
      LEFT JOIN ambulances amb ON al.ambulance_id = amb.id
      LEFT JOIN users u ON al.allocated_by_user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 50
    `).all();

    res.json({
      success: true,
      data: history,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
