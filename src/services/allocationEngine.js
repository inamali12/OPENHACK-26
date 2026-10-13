const { getDatabase } = require('../db/database');
const { logActivity } = require('./auditService');
const { broadcast } = require('./sseService');

/**
 * Generate resource allocation recommendations for an emergency case.
 * Transparent, multi-criteria recommendation engine (Administrative, not diagnostic clinical triage).
 */
function getRecommendation(caseId) {
  const db = getDatabase();

  const caseItem = db.prepare(`
    SELECT c.*, p.score as priority_score
    FROM emergency_cases c
    LEFT JOIN priority_settings p ON c.priority = p.priority_key
    WHERE c.id = ?
  `).get(caseId);

  if (!caseItem) {
    throw new Error(`Emergency case with ID ${caseId} not found.`);
  }

  // Check if case is already closed or allocated
  const existingActiveAllocation = db.prepare(`
    SELECT * FROM allocations
    WHERE case_id = ? AND status = 'Active'
  `).get(caseId);

  // 1. Bed Recommendation
  // Find available beds matching requested care area first, then compatible
  const availableBeds = db.prepare(`
    SELECT * FROM beds
    WHERE status = 'Available'
    ORDER BY 
      CASE WHEN ward = ? THEN 0 ELSE 1 END,
      bed_number ASC
  `).all(caseItem.care_area);

  let recommendedBed = null;
  let bedReason = '';

  if (availableBeds.length > 0) {
    // Check if there is an exact ward match
    const exactWardBed = availableBeds.find(b => b.ward.toLowerCase() === caseItem.care_area.toLowerCase());
    if (exactWardBed) {
      recommendedBed = exactWardBed;
      bedReason = `Bed ${exactWardBed.bed_number} (${exactWardBed.ward} - ${exactWardBed.bed_type}) is available and exactly matches requested care area "${caseItem.care_area}".`;
    } else {
      // Alternative available bed in adjacent ward
      recommendedBed = availableBeds[0];
      bedReason = `No bed free in "${caseItem.care_area}". Alternative Bed ${recommendedBed.bed_number} in ${recommendedBed.ward} is available with compatible support.`;
    }
  } else {
    bedReason = `Resource Shortage Alert: No available beds currently in the facility. All beds are occupied or out of service.`;
  }

  // 2. Doctor Recommendation
  // Must be Available, on duty, matching specialty (if requested), current_workload < max_workload
  let doctorQuery = `
    SELECT * FROM doctors
    WHERE status = 'Available' AND current_workload < max_workload
  `;
  let doctorParams = [];

  let recommendedDoctor = null;
  let doctorReason = '';

  const activeDoctors = db.prepare(doctorQuery).all();

  if (caseItem.specialty_needed) {
    const specialtyDoctors = activeDoctors.filter(d => 
      d.specialty.toLowerCase().includes(caseItem.specialty_needed.toLowerCase()) ||
      caseItem.specialty_needed.toLowerCase().includes(d.specialty.toLowerCase())
    );

    if (specialtyDoctors.length > 0) {
      // Pick doctor with lowest current workload
      specialtyDoctors.sort((a, b) => a.current_workload - b.current_workload || a.id - b.id);
      recommendedDoctor = specialtyDoctors[0];
      doctorReason = `${recommendedDoctor.name} (${recommendedDoctor.specialty}) is on duty and available with current workload ${recommendedDoctor.current_workload}/${recommendedDoctor.max_workload}, matching specialty "${caseItem.specialty_needed}".`;
    } else {
      // Fallback: general emergency doctor if available
      const generalDoctors = activeDoctors.filter(d => 
        d.specialty.includes('Emergency') || d.specialty.includes('General')
      );
      if (generalDoctors.length > 0) {
        generalDoctors.sort((a, b) => a.current_workload - b.current_workload);
        recommendedDoctor = generalDoctors[0];
        doctorReason = `Specialist for "${caseItem.specialty_needed}" is unavailable/at capacity. Attending ${recommendedDoctor.name} (${recommendedDoctor.specialty}) recommended for primary intake (workload: ${recommendedDoctor.current_workload}/${recommendedDoctor.max_workload}).`;
      } else if (activeDoctors.length > 0) {
        activeDoctors.sort((a, b) => a.current_workload - b.current_workload);
        recommendedDoctor = activeDoctors[0];
        doctorReason = `No specialty match on duty. Available physician ${recommendedDoctor.name} (${recommendedDoctor.specialty}) recommended as available backup.`;
      } else {
        doctorReason = `Resource Shortage Alert: No on-duty physicians available under current workload limit.`;
      }
    }
  } else {
    // No specific specialty requested, pick lowest workload
    if (activeDoctors.length > 0) {
      activeDoctors.sort((a, b) => a.current_workload - b.current_workload || a.id - b.id);
      recommendedDoctor = activeDoctors[0];
      doctorReason = `${recommendedDoctor.name} (${recommendedDoctor.specialty}) is available with the lowest active workload (${recommendedDoctor.current_workload}/${recommendedDoctor.max_workload}).`;
    } else {
      doctorReason = `Resource Shortage Alert: All on-duty physicians are at maximum workload capacity.`;
    }
  }

  // 3. Ambulance Recommendation (Only if transport needed)
  let recommendedAmbulance = null;
  let ambulanceReason = '';

  if (caseItem.transport_needed) {
    const availableAmbulances = db.prepare(`
      SELECT * FROM ambulances
      WHERE status = 'Available'
      ORDER BY 
        CASE WHEN capability = 'Advanced Life Support' THEN 0 ELSE 1 END,
        id ASC
    `).all();

    if (availableAmbulances.length > 0) {
      // For Critical priority, prefer Advanced or Critical Care Transport
      if (caseItem.priority === 'Critical') {
        const adv = availableAmbulances.find(a => a.capability.includes('Advanced') || a.capability.includes('Critical'));
        recommendedAmbulance = adv || availableAmbulances[0];
      } else {
        recommendedAmbulance = availableAmbulances[0];
      }
      ambulanceReason = `Ambulance ${recommendedAmbulance.call_sign} (${recommendedAmbulance.capability}) is available at station "${recommendedAmbulance.current_location}" for rapid dispatch.`;
    } else {
      ambulanceReason = `Resource Shortage Alert: No ambulances currently available. All units are dispatched, en route, or out of service.`;
    }
  } else {
    ambulanceReason = 'Patient arrived at hospital emergency intake directly. No ambulance transport required.';
  }

  // Overall recommendation feasibility
  const isFullyFeasible = !!recommendedBed && !!recommendedDoctor && (!caseItem.transport_needed || !!recommendedAmbulance);

  return {
    case: {
      id: caseItem.id,
      case_number: caseItem.case_number,
      patient_ref: caseItem.patient_ref,
      priority: caseItem.priority,
      priority_score: caseItem.priority_score,
      category: caseItem.category,
      care_area: caseItem.care_area,
      specialty_needed: caseItem.specialty_needed,
      transport_needed: Boolean(caseItem.transport_needed),
      status: caseItem.status,
    },
    alreadyAllocated: !!existingActiveAllocation,
    existingAllocation: existingActiveAllocation || null,
    recommendations: {
      bed: {
        resource: recommendedBed,
        isAvailable: !!recommendedBed,
        rationale: bedReason,
      },
      doctor: {
        resource: recommendedDoctor,
        isAvailable: !!recommendedDoctor,
        rationale: doctorReason,
      },
      ambulance: {
        resource: recommendedAmbulance,
        isNeeded: Boolean(caseItem.transport_needed),
        isAvailable: !caseItem.transport_needed || !!recommendedAmbulance,
        rationale: ambulanceReason,
      },
    },
    isFullyFeasible,
    disclaimer: 'Administrative resource matching recommendation only. Final assignment requires verification and authorization by an emergency coordinator.',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Confirm and execute resource allocation atomically inside a SQLite transaction.
 * Re-validates resource availability at execution time.
 */
function confirmAllocation({ caseId, bedId = null, doctorId = null, ambulanceId = null, userId = null, username = 'coordinator', notes = '' }) {
  const db = getDatabase();

  const transaction = db.transaction(() => {
    // 1. Verify case existence & eligibility
    const caseItem = db.prepare('SELECT * FROM emergency_cases WHERE id = ?').get(caseId);
    if (!caseItem) {
      throw { status: 404, message: `Emergency case #${caseId} does not exist.` };
    }
    if (caseItem.status === 'Closed') {
      throw { status: 400, message: `Cannot allocate resources to closed case ${caseItem.case_number}.` };
    }

    // Check if there is an existing active allocation for this case
    const existingAllocation = db.prepare(`
      SELECT * FROM allocations WHERE case_id = ? AND status = 'Active'
    `).get(caseId);

    if (existingAllocation) {
      // Re-assignment: release previous resources if changing
      if (existingAllocation.bed_id && existingAllocation.bed_id !== bedId) {
        db.prepare(`UPDATE beds SET status = 'Available', current_case_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(existingAllocation.bed_id);
      }
      if (existingAllocation.doctor_id && existingAllocation.doctor_id !== doctorId) {
        db.prepare(`UPDATE doctors SET current_workload = MAX(0, current_workload - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(existingAllocation.doctor_id);
      }
      if (existingAllocation.ambulance_id && existingAllocation.ambulance_id !== ambulanceId) {
        db.prepare(`UPDATE ambulances SET status = 'Available', current_case_id = NULL, last_status_update = CURRENT_TIMESTAMP WHERE id = ?`).run(existingAllocation.ambulance_id);
      }
      // Mark old allocation completed/superseded
      db.prepare(`UPDATE allocations SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(existingAllocation.id);
    }

    // 2. Validate and reserve Bed (Race Condition & Availability Check)
    let assignedBed = null;
    if (bedId) {
      assignedBed = db.prepare('SELECT * FROM beds WHERE id = ?').get(bedId);
      if (!assignedBed) {
        throw { status: 404, message: `Selected Bed #${bedId} not found.` };
      }
      if (assignedBed.status === 'Out of Service') {
        throw { status: 409, message: `Conflict: Bed ${assignedBed.bed_number} is Out of Service and cannot be assigned.` };
      }
      if (assignedBed.status === 'Occupied' && assignedBed.current_case_id !== caseItem.id) {
        throw { status: 409, message: `Conflict: Bed ${assignedBed.bed_number} was occupied by another case just now. Please select another bed.` };
      }

      // Update Bed
      db.prepare(`
        UPDATE beds
        SET status = 'Occupied', current_case_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(caseItem.id, bedId);
    }

    // 3. Validate and reserve Doctor (Workload limit & availability)
    let assignedDoctor = null;
    if (doctorId) {
      assignedDoctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(doctorId);
      if (!assignedDoctor) {
        throw { status: 404, message: `Selected Doctor #${doctorId} not found.` };
      }
      if (assignedDoctor.status === 'Off Duty') {
        throw { status: 409, message: `Conflict: ${assignedDoctor.name} is currently Off Duty.` };
      }
      // If doctor wasn't already assigned to this case, ensure workload capacity
      const wasAlreadyAssigned = existingAllocation && existingAllocation.doctor_id === doctorId;
      if (!wasAlreadyAssigned && assignedDoctor.current_workload >= assignedDoctor.max_workload) {
        throw { status: 409, message: `Conflict: ${assignedDoctor.name} has reached maximum workload limit (${assignedDoctor.max_workload} active cases).` };
      }

      // Increment doctor workload if newly assigned
      if (!wasAlreadyAssigned) {
        const newWorkload = assignedDoctor.current_workload + 1;
        const newStatus = newWorkload >= assignedDoctor.max_workload ? 'Busy' : 'Available';
        db.prepare(`
          UPDATE doctors
          SET current_workload = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newWorkload, newStatus, doctorId);
      }
    }

    // 4. Validate and reserve Ambulance (if provided)
    let assignedAmbulance = null;
    if (ambulanceId) {
      assignedAmbulance = db.prepare('SELECT * FROM ambulances WHERE id = ?').get(ambulanceId);
      if (!assignedAmbulance) {
        throw { status: 404, message: `Selected Ambulance #${ambulanceId} not found.` };
      }
      if (assignedAmbulance.status === 'Out of Service') {
        throw { status: 409, message: `Conflict: Ambulance ${assignedAmbulance.call_sign} is Out of Service.` };
      }
      const wasAlreadyAssignedAmb = existingAllocation && existingAllocation.ambulance_id === ambulanceId;
      if (!wasAlreadyAssignedAmb && assignedAmbulance.status !== 'Available') {
        throw { status: 409, message: `Conflict: Ambulance ${assignedAmbulance.call_sign} status is "${assignedAmbulance.status}", not Available.` };
      }

      // Dispatch ambulance
      db.prepare(`
        UPDATE ambulances
        SET status = 'Dispatched', current_case_id = ?, last_status_update = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(caseItem.id, ambulanceId);
    }

    // 5. Update Emergency Case Status to 'Allocated'
    db.prepare(`
      UPDATE emergency_cases
      SET status = 'Allocated', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(caseItem.id);

    // 6. Record New Allocation
    const rationaleParts = [];
    if (assignedBed) rationaleParts.push(`Bed: ${assignedBed.bed_number} (${assignedBed.ward})`);
    if (assignedDoctor) rationaleParts.push(`Physician: ${assignedDoctor.name}`);
    if (assignedAmbulance) rationaleParts.push(`Ambulance: ${assignedAmbulance.call_sign}`);
    const rationale = `Confirmed assignment by ${username}. [${rationaleParts.join(', ')}]`;

    const allocResult = db.prepare(`
      INSERT INTO allocations (
        case_id, bed_id, doctor_id, ambulance_id, allocated_by_user_id, status, recommendation_rationale, notes
      ) VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)
    `).run(caseItem.id, bedId || null, doctorId || null, ambulanceId || null, userId, rationale, notes);

    // 7. Audit log
    logActivity({
      userId,
      username,
      actionType: 'ALLOCATION_CONFIRMED',
      entityType: 'Allocation',
      entityId: allocResult.lastInsertRowid,
      description: `Assigned resources to Case ${caseItem.case_number}: ${rationaleParts.join(', ')}`,
      details: { caseId, bedId, doctorId, ambulanceId, notes },
    });

    return {
      allocationId: Number(allocResult.lastInsertRowid),
      caseNumber: caseItem.case_number,
      bed: assignedBed ? { id: assignedBed.id, bed_number: assignedBed.bed_number, ward: assignedBed.ward } : null,
      doctor: assignedDoctor ? { id: assignedDoctor.id, name: assignedDoctor.name, specialty: assignedDoctor.specialty } : null,
      ambulance: assignedAmbulance ? { id: assignedAmbulance.id, call_sign: assignedAmbulance.call_sign, status: 'Dispatched' } : null,
      rationale,
    };
  });

  const result = transaction();

  // Broadcast live SSE update to all connected dashboards
  broadcast('allocation:confirmed', result);
  broadcast('dashboard:refresh', { source: 'allocation', caseId });

  return result;
}

module.exports = {
  getRecommendation,
  confirmAllocation,
};
