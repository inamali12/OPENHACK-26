const express = require('express');
const { getDatabase } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity } = require('../services/auditService');
const { broadcast } = require('../services/sseService');
const { generateCaseNumber, generatePatientRef, sanitizeString } = require('../utils/helpers');

const router = express.Router();

// GET all cases with filtering, search, and pagination
router.get('/', (req, res, next) => {
  try {
    const db = getDatabase();
    const {
      search = '',
      priority = '',
      status = '',
      category = '',
      care_area = '',
      sortBy = 'priority_score',
      sortOrder = 'DESC',
      page = 1,
      limit = 15,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = ['1=1'];
    let params = [];

    if (search.trim()) {
      whereClauses.push('(c.case_number LIKE ? OR c.patient_ref LIKE ? OR c.operational_notes LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (priority.trim()) {
      whereClauses.push('c.priority = ?');
      params.push(priority.trim());
    }

    if (status.trim()) {
      whereClauses.push('c.status = ?');
      params.push(status.trim());
    }

    if (category.trim()) {
      whereClauses.push('c.category = ?');
      params.push(category.trim());
    }

    if (care_area.trim()) {
      whereClauses.push('c.care_area = ?');
      params.push(care_area.trim());
    }

    const whereSql = whereClauses.join(' AND ');

    // Count query
    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM emergency_cases c
      WHERE ${whereSql}
    `).get(...params);
    const totalCount = countRow ? countRow.total : 0;

    // Sorting
    let orderSql = 'p.score DESC, c.arrival_time ASC';
    if (sortBy === 'arrival_time') {
      orderSql = `c.arrival_time ${sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`;
    } else if (sortBy === 'case_number') {
      orderSql = `c.case_number ${sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`;
    }

    // Data query with active allocation details
    const cases = db.prepare(`
      SELECT 
        c.*,
        p.score as priority_score,
        p.color as priority_color,
        b.bed_number as allocated_bed_number,
        d.name as allocated_doctor_name,
        a.call_sign as allocated_ambulance_call_sign
      FROM emergency_cases c
      LEFT JOIN priority_settings p ON c.priority = p.priority_key
      LEFT JOIN allocations alloc ON (alloc.case_id = c.id AND alloc.status = 'Active')
      LEFT JOIN beds b ON alloc.bed_id = b.id
      LEFT JOIN doctors d ON alloc.doctor_id = d.id
      LEFT JOIN ambulances a ON alloc.ambulance_id = a.id
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      success: true,
      data: cases,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET case by ID
router.get('/:id', (req, res, next) => {
  try {
    const db = getDatabase();
    const caseId = req.params.id;

    const caseItem = db.prepare(`
      SELECT 
        c.*,
        p.score as priority_score,
        p.color as priority_color
      FROM emergency_cases c
      LEFT JOIN priority_settings p ON c.priority = p.priority_key
      WHERE c.id = ?
    `).get(caseId);

    if (!caseItem) {
      return res.status(404).json({ success: false, error: 'Emergency case not found.' });
    }

    // Fetch active and past allocations
    const allocations = db.prepare(`
      SELECT 
        al.*,
        b.bed_number, b.ward, b.bed_type,
        d.name as doctor_name, d.specialty as doctor_specialty,
        amb.call_sign as ambulance_call_sign, amb.capability as ambulance_capability,
        u.full_name as allocated_by_name
      FROM allocations al
      LEFT JOIN beds b ON al.bed_id = b.id
      LEFT JOIN doctors d ON al.doctor_id = d.id
      LEFT JOIN ambulances amb ON al.ambulance_id = amb.id
      LEFT JOIN users u ON al.allocated_by_user_id = u.id
      WHERE al.case_id = ?
      ORDER BY al.created_at DESC
    `).all(caseId);

    res.json({
      success: true,
      data: {
        ...caseItem,
        allocations,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST create emergency case
router.post('/', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    let {
      case_number,
      patient_ref,
      age,
      arrival_time,
      category,
      priority,
      care_area,
      specialty_needed,
      transport_needed,
      operational_notes,
    } = req.body;

    if (!category || !priority || !care_area) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: category, priority, and care_area are mandatory.',
      });
    }

    const caseNum = case_number ? sanitizeString(case_number) : generateCaseNumber();
    const patRef = patient_ref ? sanitizeString(patient_ref) : generatePatientRef();
    const arrival = arrival_time ? sanitizeString(arrival_time) : new Date().toISOString().slice(0, 19).replace('T', ' ');
    const ageVal = age ? parseInt(age, 10) : null;
    const transVal = transport_needed ? 1 : 0;
    const notes = sanitizeString(operational_notes || '');

    const stmt = db.prepare(`
      INSERT INTO emergency_cases (
        case_number, patient_ref, age, arrival_time, category, priority,
        care_area, specialty_needed, transport_needed, status, operational_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?)
    `);

    const result = stmt.run(
      caseNum,
      patRef,
      ageVal,
      arrival,
      category,
      priority,
      care_area,
      specialty_needed || null,
      transVal,
      notes
    );

    const newId = Number(result.lastInsertRowid);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'CASE_REGISTER',
      entityType: 'Case',
      entityId: caseNum,
      description: `Registered new emergency case ${caseNum} (${priority} - ${category})`,
      details: { id: newId, patient_ref: patRef, priority, care_area },
    });

    broadcast('case:created', { id: newId, case_number: caseNum, priority, category });
    broadcast('dashboard:refresh', { source: 'case:created' });

    res.status(201).json({
      success: true,
      message: `Emergency case ${caseNum} registered successfully.`,
      data: { id: newId, case_number: caseNum, patient_ref: patRef },
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: 'Case number already exists. Please choose a unique ID.' });
    }
    next(err);
  }
});

// PATCH update emergency case
router.patch('/:id', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const caseId = req.params.id;

    const existing = db.prepare('SELECT * FROM emergency_cases WHERE id = ?').get(caseId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Case not found.' });
    }

    const {
      priority,
      category,
      care_area,
      specialty_needed,
      transport_needed,
      status,
      operational_notes,
    } = req.body;

    const newPriority = priority || existing.priority;
    const newCategory = category || existing.category;
    const newCareArea = care_area || existing.care_area;
    const newSpecialty = specialty_needed !== undefined ? specialty_needed : existing.specialty_needed;
    const newTransport = transport_needed !== undefined ? (transport_needed ? 1 : 0) : existing.transport_needed;
    const newStatus = status || existing.status;
    const newNotes = operational_notes !== undefined ? operational_notes : existing.operational_notes;

    db.prepare(`
      UPDATE emergency_cases
      SET priority = ?, category = ?, care_area = ?, specialty_needed = ?,
          transport_needed = ?, status = ?, operational_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPriority, newCategory, newCareArea, newSpecialty, newTransport, newStatus, newNotes, caseId);

    logActivity({
      userId: req.session.user.id,
      username: req.session.user.username,
      actionType: 'CASE_UPDATE',
      entityType: 'Case',
      entityId: existing.case_number,
      description: `Updated case ${existing.case_number} (status: ${newStatus}, priority: ${newPriority})`,
      details: { caseId, status: newStatus, priority: newPriority },
    });

    broadcast('case:updated', { id: caseId, status: newStatus, priority: newPriority });
    broadcast('dashboard:refresh', { source: 'case:updated' });

    res.json({
      success: true,
      message: `Emergency case ${existing.case_number} updated.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST close emergency case and release all associated resources
router.post('/:id/close', requireAuth, requireRole('admin', 'coordinator'), (req, res, next) => {
  try {
    const db = getDatabase();
    const caseId = req.params.id;

    const closeTransaction = db.transaction(() => {
      const caseItem = db.prepare('SELECT * FROM emergency_cases WHERE id = ?').get(caseId);
      if (!caseItem) {
        throw { status: 404, message: 'Case not found.' };
      }
      if (caseItem.status === 'Closed') {
        throw { status: 400, message: 'Case is already closed.' };
      }

      // Check active allocation
      const activeAlloc = db.prepare(`
        SELECT * FROM allocations WHERE case_id = ? AND status = 'Active'
      `).get(caseId);

      if (activeAlloc) {
        // Release Bed
        if (activeAlloc.bed_id) {
          db.prepare(`
            UPDATE beds
            SET status = 'Available', current_case_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(activeAlloc.bed_id);
        }

        // Release Doctor Workload
        if (activeAlloc.doctor_id) {
          const doc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(activeAlloc.doctor_id);
          if (doc) {
            const newWorkload = Math.max(0, doc.current_workload - 1);
            const newStatus = (doc.status === 'Busy' && newWorkload < doc.max_workload) ? 'Available' : doc.status;
            db.prepare(`
              UPDATE doctors
              SET current_workload = ?, status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(newWorkload, newStatus, activeAlloc.doctor_id);
          }
        }

        // Release Ambulance
        if (activeAlloc.ambulance_id) {
          db.prepare(`
            UPDATE ambulances
            SET status = 'Available', current_case_id = NULL, last_status_update = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(activeAlloc.ambulance_id);
        }

        // Mark Allocation completed
        db.prepare(`
          UPDATE allocations
          SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(activeAlloc.id);
      }

      // Mark case closed
      db.prepare(`
        UPDATE emergency_cases
        SET status = 'Closed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(caseId);

      logActivity({
        userId: req.session.user.id,
        username: req.session.user.username,
        actionType: 'CASE_CLOSED',
        entityType: 'Case',
        entityId: caseItem.case_number,
        description: `Discharged/Closed case ${caseItem.case_number}. All reserved resources freed.`,
        details: { caseId, hadActiveAllocation: !!activeAlloc },
      });

      return caseItem;
    });

    const closedCase = closeTransaction();

    broadcast('case:closed', { id: caseId, case_number: closedCase.case_number });
    broadcast('dashboard:refresh', { source: 'case:closed' });

    res.json({
      success: true,
      message: `Emergency case ${closedCase.case_number} has been closed and resources released.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
