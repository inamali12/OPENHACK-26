const bcrypt = require('bcryptjs');
const { getDatabase } = require('./database');

function seedDatabase(forceReset = false) {
  const db = getDatabase();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0 && !forceReset) {
    return false; // Already seeded
  }

  // Use a transaction for consistent atomic seeding
  const seedTransaction = db.transaction(() => {
    if (forceReset) {
      // Clear all existing data in reverse order of foreign keys
      db.prepare('DELETE FROM activity_logs').run();
      db.prepare('DELETE FROM allocations').run();
      db.prepare('DELETE FROM ambulances').run();
      db.prepare('DELETE FROM doctors').run();
      db.prepare('DELETE FROM beds').run();
      db.prepare('DELETE FROM emergency_cases').run();
      db.prepare('DELETE FROM system_settings').run();
      db.prepare('DELETE FROM priority_settings').run();
      db.prepare('DELETE FROM users').run();
      try {
        db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('users','beds','doctors','ambulances','emergency_cases','allocations','activity_logs','priority_settings')").run();
      } catch (e) {
        // Ignored if sqlite_sequence is empty
      }
    }

    // 1. Seed Users (passwords hashed with bcrypt)
    const salt = bcrypt.genSaltSync(10);
    const adminPass = bcrypt.hashSync('admin123', salt);
    const coordPass = bcrypt.hashSync('coord123', salt);
    const staffPass = bcrypt.hashSync('staff123', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
    `);

    const adminUser = insertUser.run('admin', adminPass, 'Chief Admin Morrison', 'admin');
    const coordUser = insertUser.run('coordinator', coordPass, 'Coord. Angela Sterling', 'coordinator');
    const staffUser = insertUser.run('staff', staffPass, 'Nurse Specialist David Kim', 'staff');

    // 2. Priority Settings
    const insertPriority = db.prepare(`
      INSERT INTO priority_settings (priority_key, label, score, color, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertPriority.run('Critical', 'Critical Priority (Immediate)', 100, '#dc2626', 1);
    insertPriority.run('High', 'High Priority (Urgent)', 75, '#ea580c', 2);
    insertPriority.run('Medium', 'Medium Priority (Semi-Urgent)', 50, '#d97706', 3);
    insertPriority.run('Low', 'Low Priority (Standard)', 25, '#2563eb', 4);

    // 3. System Settings
    const insertSetting = db.prepare(`
      INSERT INTO system_settings (key, value, description)
      VALUES (?, ?, ?)
    `);
    insertSetting.run('hospital_name', 'Metro Central Emergency Command Center', 'Display title of the emergency facility');
    insertSetting.run('max_doctor_workload', '4', 'Maximum simultaneous active cases per physician');
    insertSetting.run('auto_recommendation_tiebreaker', 'arrival_time', 'Tiebreaker criterion: arrival_time or doctor_workload');
    insertSetting.run('system_mode', 'Demonstration', 'Operating mode disclaimer banner');

    // 4. Emergency Cases
    const insertCase = db.prepare(`
      INSERT INTO emergency_cases (
        case_number, patient_ref, age, arrival_time, category, priority,
        care_area, specialty_needed, transport_needed, status, operational_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const casesData = [
      {
        num: 'CAS-2026-001', ref: 'PT-8821-X', age: 62, arrival: '2026-10-13 18:30:00',
        cat: 'Cardiovascular', prio: 'Critical', area: 'ICU', spec: 'Cardiology',
        trans: 1, status: 'Closed', notes: 'Simulated acute coronary syndrome. Successfully stabilized and transferred to inpatient cardiology.'
      },
      {
        num: 'CAS-2026-002', ref: 'PT-9143-Y', age: 34, arrival: '2026-10-13 19:15:00',
        cat: 'Trauma', prio: 'High', area: 'Trauma Bay', spec: 'Trauma Surgery',
        trans: 1, status: 'Closed', notes: 'Simulated vehicular collision lacerations. Wound closure completed.'
      },
      {
        num: 'CAS-2026-003', ref: 'PT-3091-B', age: 71, arrival: '2026-10-13 20:00:00',
        cat: 'Respiratory', prio: 'Critical', area: 'ICU', spec: 'Critical Care / ICU',
        trans: 1, status: 'In Treatment', notes: 'Simulated severe hypoxemia. High-flow oxygen support ongoing.'
      },
      {
        num: 'CAS-2026-004', ref: 'PT-4420-C', age: 48, arrival: '2026-10-13 20:45:00',
        cat: 'Cardiovascular', prio: 'Critical', area: 'ICU', spec: 'Cardiology',
        trans: 0, status: 'Allocated', notes: 'Simulated arrhythmia observation. Monitoring telemetry.'
      },
      {
        num: 'CAS-2026-005', ref: 'PT-5512-T', age: 29, arrival: '2026-10-13 21:10:00',
        cat: 'Trauma', prio: 'Critical', area: 'Trauma Bay', spec: 'Trauma Surgery',
        trans: 1, status: 'In Treatment', notes: 'Simulated multi-system trauma. Active resuscitation bay.'
      },
      {
        num: 'CAS-2026-006', ref: 'PT-6284-N', age: 55, arrival: '2026-10-13 21:20:00',
        cat: 'Neurological', prio: 'High', area: 'Emergency Dept', spec: 'Neurology',
        trans: 0, status: 'Allocated', notes: 'Simulated transient neurological symptoms. Awaiting neuro scan.'
      },
      {
        num: 'CAS-2026-007', ref: 'PT-7391-E', age: 41, arrival: '2026-10-13 21:35:00',
        cat: 'General Emergency', prio: 'High', area: 'Emergency Dept', spec: 'Emergency Medicine',
        trans: 0, status: 'In Treatment', notes: 'Simulated acute abdominal pain evaluation.'
      },
      {
        num: 'CAS-2026-008', ref: 'PT-8104-O', age: 23, arrival: '2026-10-13 21:50:00',
        cat: 'Orthopedic', prio: 'Medium', area: 'Emergency Dept', spec: 'Orthopedics',
        trans: 0, status: 'Triage', notes: 'Simulated lower limb sports injury. X-ray requisitioned.'
      },
      {
        num: 'CAS-2026-009', ref: 'PT-9932-P', age: 8, arrival: '2026-10-13 22:00:00',
        cat: 'Pediatric', prio: 'High', area: 'Observation', spec: 'Pediatrics',
        trans: 0, status: 'In Treatment', notes: 'Simulated pediatric febrile episode under observation.'
      },
      {
        num: 'CAS-2026-010', ref: 'PT-1049-M', age: 67, arrival: '2026-10-13 22:05:00',
        cat: 'General Emergency', prio: 'Medium', area: 'Step-Down', spec: 'Emergency Medicine',
        trans: 0, status: 'Allocated', notes: 'Simulated dehydration and electrolyte monitoring.'
      },
      // Pending cases waiting for allocation (Great for demonstration!)
      {
        num: 'CAS-2026-011', ref: 'PT-2291-C', age: 58, arrival: '2026-10-13 22:15:00',
        cat: 'Cardiovascular', prio: 'Critical', area: 'ICU', spec: 'Cardiology',
        trans: 1, status: 'New', notes: 'Simulated acute chest pain with diaphoresis. Transport and ICU bed requested.'
      },
      {
        num: 'CAS-2026-012', ref: 'PT-3382-T', age: 36, arrival: '2026-10-13 22:20:00',
        cat: 'Trauma', prio: 'High', area: 'Trauma Bay', spec: 'Trauma Surgery',
        trans: 1, status: 'New', notes: 'Simulated high-velocity collision injury. Rapid trauma bed and surgical standby needed.'
      },
      {
        num: 'CAS-2026-013', ref: 'PT-4751-N', age: 64, arrival: '2026-10-13 22:28:00',
        cat: 'Neurological', prio: 'High', area: 'Emergency Dept', spec: 'Neurology',
        trans: 0, status: 'New', notes: 'Simulated acute speech alteration. Urgent neurological assessment.'
      },
      {
        num: 'CAS-2026-014', ref: 'PT-5910-G', age: 19, arrival: '2026-10-13 22:32:00',
        cat: 'General Emergency', prio: 'Low', area: 'Observation', spec: 'Emergency Medicine',
        trans: 0, status: 'New', notes: 'Simulated mild allergic rash after food intake. Antihistamine protocol.'
      }
    ];

    const caseIdMap = {};
    for (const c of casesData) {
      const res = insertCase.run(
        c.num, c.ref, c.age, c.arrival, c.cat, c.prio,
        c.area, c.spec, c.trans, c.status, c.notes
      );
      caseIdMap[c.num] = Number(res.lastInsertRowid);
    }

    // 5. Beds (24 total across 5 wards)
    const insertBed = db.prepare(`
      INSERT INTO beds (bed_number, ward, bed_type, status, current_case_id, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const bedsData = [
      // Emergency Dept (8 beds)
      { num: 'ED-01', ward: 'Emergency Dept', type: 'Acute Care', status: 'Occupied', caseNum: 'CAS-2026-007', notes: 'Telemetry connected' },
      { num: 'ED-02', ward: 'Emergency Dept', type: 'Acute Care', status: 'Occupied', caseNum: 'CAS-2026-006', notes: 'Neurology consult in progress' },
      { num: 'ED-03', ward: 'Emergency Dept', type: 'Acute Care', status: 'Available', caseNum: null, notes: 'Sanitized and ready' },
      { num: 'ED-04', ward: 'Emergency Dept', type: 'Acute Care', status: 'Available', caseNum: null, notes: 'Sanitized and ready' },
      { num: 'ED-05', ward: 'Emergency Dept', type: 'Standard Emergency', status: 'Available', caseNum: null, notes: 'Sanitized and ready' },
      { num: 'ED-06', ward: 'Emergency Dept', type: 'Standard Emergency', status: 'Available', caseNum: null, notes: 'Sanitized and ready' },
      { num: 'ED-07', ward: 'Emergency Dept', type: 'Standard Emergency', status: 'Out of Service', caseNum: null, notes: 'Monitor calibration required' },
      { num: 'ED-08', ward: 'Emergency Dept', type: 'Isolation', status: 'Available', caseNum: null, notes: 'Negative pressure ready' },

      // Trauma Bay (4 beds)
      { num: 'TB-01', ward: 'Trauma Bay', type: 'Resuscitation', status: 'Occupied', caseNum: 'CAS-2026-005', notes: 'Active trauma resuscitation' },
      { num: 'TB-02', ward: 'Trauma Bay', type: 'Resuscitation', status: 'Available', caseNum: null, notes: 'Rapid infuser prepped' },
      { num: 'TB-03', ward: 'Trauma Bay', type: 'Surgical Trauma', status: 'Available', caseNum: null, notes: 'Surgical tray loaded' },
      { num: 'TB-04', ward: 'Trauma Bay', type: 'Surgical Trauma', status: 'Out of Service', caseNum: null, notes: 'Overhead surgical light maintenance' },

      // ICU (6 beds)
      { num: 'ICU-01', ward: 'ICU', type: 'Critical Care', status: 'Occupied', caseNum: 'CAS-2026-003', notes: 'Ventilator active' },
      { num: 'ICU-02', ward: 'ICU', type: 'Critical Care', status: 'Occupied', caseNum: 'CAS-2026-004', notes: 'Cardiac telemetry active' },
      { num: 'ICU-03', ward: 'ICU', type: 'Critical Care', status: 'Available', caseNum: null, notes: 'Ventilator tested and sterile' },
      { num: 'ICU-04', ward: 'ICU', type: 'Critical Care', status: 'Available', caseNum: null, notes: 'Cleaned and ready' },
      { num: 'ICU-05', ward: 'ICU', type: 'Cardiac Care', status: 'Available', caseNum: null, notes: 'Dedicated cardiac monitor' },
      { num: 'ICU-06', ward: 'ICU', type: 'Cardiac Care', status: 'Out of Service', caseNum: null, notes: 'HEPA filtration check' },

      // Step-Down Unit (3 beds)
      { num: 'SDU-01', ward: 'Step-Down', type: 'Sub-acute', status: 'Occupied', caseNum: 'CAS-2026-010', notes: 'Infusion pump running' },
      { num: 'SDU-02', ward: 'Step-Down', type: 'Sub-acute', status: 'Available', caseNum: null, notes: 'Cleaned and ready' },
      { num: 'SDU-03', ward: 'Step-Down', type: 'Sub-acute', status: 'Available', caseNum: null, notes: 'Cleaned and ready' },

      // Observation Unit (3 beds)
      { num: 'OBS-01', ward: 'Observation', type: 'Short-stay', status: 'Occupied', caseNum: 'CAS-2026-009', notes: 'Pediatric care monitoring' },
      { num: 'OBS-02', ward: 'Observation', type: 'Short-stay', status: 'Available', caseNum: null, notes: 'Ready for intake' },
      { num: 'OBS-03', ward: 'Observation', type: 'Short-stay', status: 'Available', caseNum: null, notes: 'Ready for intake' },
    ];

    const bedIdMap = {};
    for (const b of bedsData) {
      const caseId = b.caseNum ? caseIdMap[b.caseNum] : null;
      const res = insertBed.run(b.num, b.ward, b.type, b.status, caseId, b.notes);
      bedIdMap[b.num] = Number(res.lastInsertRowid);
    }

    // 6. Doctors (10 doctors across specialties)
    const insertDoctor = db.prepare(`
      INSERT INTO doctors (name, specialty, shift, status, max_workload, current_workload, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const doctorsData = [
      { name: 'Dr. Sarah Jenkins', spec: 'Emergency Medicine', shift: 'Day', status: 'Available', maxW: 4, curW: 1, notes: 'Attending physician' },
      { name: 'Dr. Marcus Vance', spec: 'Trauma Surgery', shift: 'Day', status: 'Available', maxW: 4, curW: 1, notes: 'Chief of Trauma Services' },
      { name: 'Dr. Elena Rostova', spec: 'Cardiology', shift: 'Day', status: 'Available', maxW: 4, curW: 1, notes: 'Cardiovascular emergency lead' },
      { name: 'Dr. Tariq Al-Mansoor', spec: 'Neurology', shift: 'Day', status: 'Available', maxW: 3, curW: 1, notes: 'Stroke protocol certified' },
      { name: 'Dr. Chen Wei', spec: 'Orthopedics', shift: 'Day', status: 'Available', maxW: 4, curW: 0, notes: 'Orthopedic trauma specialist' },
      { name: 'Dr. Emily Watson', spec: 'Pediatrics', shift: 'Day', status: 'Available', maxW: 4, curW: 1, notes: 'Pediatric emergency lead' },
      { name: 'Dr. Robert Hayes', spec: 'Emergency Medicine', shift: 'Evening', status: 'Off Duty', maxW: 4, curW: 0, notes: 'Next shift starts 23:00' },
      { name: 'Dr. Fiona Gallagher', spec: 'Trauma Surgery', shift: 'Evening', status: 'Off Duty', maxW: 4, curW: 0, notes: 'On call for mass casualty' },
      { name: 'Dr. Julian Ramirez', spec: 'Critical Care / ICU', shift: 'Day', status: 'Available', maxW: 4, curW: 1, notes: 'Intensive care supervisor' },
      { name: 'Dr. Priya Patel', spec: 'General Emergency', shift: 'Day', status: 'Available', maxW: 4, curW: 0, notes: 'Rapid triage certified' },
    ];

    const doctorIdMap = {};
    for (const d of doctorsData) {
      const res = insertDoctor.run(d.name, d.spec, d.shift, d.status, d.maxW, d.curW, d.notes);
      doctorIdMap[d.name] = Number(res.lastInsertRowid);
    }

    // 7. Ambulances (6 simulated ambulances)
    const insertAmbulance = db.prepare(`
      INSERT INTO ambulances (
        call_sign, plate_number, capability, status, current_location, current_case_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const ambulancesData = [
      { call: 'MEDIC-101', plate: 'SIM-EM-101', cap: 'Advanced Life Support', status: 'Available', loc: 'Metro Base Station (Simulated)', caseNum: null, notes: 'Defibrillator, IV drug kit calibrated' },
      { call: 'MEDIC-102', plate: 'SIM-EM-102', cap: 'Advanced Life Support', status: 'Dispatched', loc: 'Downtown Highway Sector 4 (Simulated)', caseNum: 'CAS-2026-005', notes: 'Dispatched to scene' },
      { call: 'RESCUE-201', plate: 'SIM-TR-201', cap: 'Critical Care Transport', status: 'Available', loc: 'Trauma Bay Parking (Simulated)', caseNum: null, notes: 'Equipped with transport ventilator' },
      { call: 'RESCUE-202', plate: 'SIM-TR-202', cap: 'Critical Care Transport', status: 'En Route', loc: 'Corridor 8 Northbound (Simulated)', caseNum: 'CAS-2026-003', notes: 'Simulated transport to hospital' },
      { call: 'TRANSIT-301', plate: 'SIM-BS-301', cap: 'Basic Life Support', status: 'Available', loc: 'South Suburban Station (Simulated)', caseNum: null, notes: 'Basic oxygen & splinting equipment' },
      { call: 'TRANSIT-302', plate: 'SIM-BS-302', cap: 'Basic Life Support', status: 'Out of Service', loc: 'Fleet Maintenance Bay (Simulated)', caseNum: null, notes: 'Simulated alternator scheduled inspection' },
    ];

    const ambulanceIdMap = {};
    for (const a of ambulancesData) {
      const caseId = a.caseNum ? caseIdMap[a.caseNum] : null;
      const res = insertAmbulance.run(a.call, a.plate, a.cap, a.status, a.loc, caseId, a.notes);
      ambulanceIdMap[a.call] = Number(res.lastInsertRowid);
    }

    // 8. Sample Allocations History
    const insertAllocation = db.prepare(`
      INSERT INTO allocations (
        case_id, bed_id, doctor_id, ambulance_id, allocated_by_user_id, status, recommendation_rationale, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Past completed allocations
    insertAllocation.run(
      caseIdMap['CAS-2026-001'], bedIdMap['ICU-01'], doctorIdMap['Dr. Elena Rostova'], ambulanceIdMap['MEDIC-101'],
      coordUser.lastInsertRowid, 'Completed',
      'Recommended Bed ICU-01 for acute cardiac monitoring; Dr. Elena Rostova matched Cardiology specialty.',
      'Case treated and completed successfully.'
    );

    insertAllocation.run(
      caseIdMap['CAS-2026-002'], bedIdMap['TB-01'], doctorIdMap['Dr. Marcus Vance'], ambulanceIdMap['RESCUE-201'],
      coordUser.lastInsertRowid, 'Completed',
      'Recommended Trauma Bay TB-01 and Dr. Marcus Vance for emergency laceration repair.',
      'Discharged post suture and observation.'
    );

    // Active allocations
    insertAllocation.run(
      caseIdMap['CAS-2026-003'], bedIdMap['ICU-01'], doctorIdMap['Dr. Julian Ramirez'], ambulanceIdMap['RESCUE-202'],
      coordUser.lastInsertRowid, 'Active',
      'Recommended Bed ICU-01 (Ventilator support) and Dr. Julian Ramirez (Critical Care). Ambulance RESCUE-202 en route.',
      'Active intensive respiratory care protocol.'
    );

    insertAllocation.run(
      caseIdMap['CAS-2026-005'], bedIdMap['TB-01'], doctorIdMap['Dr. Marcus Vance'], ambulanceIdMap['MEDIC-102'],
      coordUser.lastInsertRowid, 'Active',
      'Recommended Bed TB-01 (Resuscitation) and Dr. Marcus Vance (Trauma Surgery). Ambulance MEDIC-102 dispatched.',
      'Active polytrauma stabilization.'
    );

    insertAllocation.run(
      caseIdMap['CAS-2026-006'], bedIdMap['ED-02'], doctorIdMap['Dr. Tariq Al-Mansoor'], null,
      coordUser.lastInsertRowid, 'Active',
      'Recommended Bed ED-02 and Dr. Tariq Al-Mansoor (Neurology specialist matching requested profile).',
      'Awaiting CT angiography results.'
    );

    insertAllocation.run(
      caseIdMap['CAS-2026-007'], bedIdMap['ED-01'], doctorIdMap['Dr. Sarah Jenkins'], null,
      staffUser.lastInsertRowid, 'Active',
      'Recommended Bed ED-01 and Dr. Sarah Jenkins (Emergency Medicine). No transport needed.',
      'IV hydration and analgesia administered.'
    );

    insertAllocation.run(
      caseIdMap['CAS-2026-009'], bedIdMap['OBS-01'], doctorIdMap['Dr. Emily Watson'], null,
      coordUser.lastInsertRowid, 'Active',
      'Recommended Bed OBS-01 (Short-stay) and Dr. Emily Watson (Pediatrics).',
      'Pediatric monitoring underway.'
    );

    insertAllocation.run(
      caseIdMap['CAS-2026-010'], bedIdMap['SDU-01'], doctorIdMap['Dr. Priya Patel'], null,
      staffUser.lastInsertRowid, 'Active',
      'Recommended Bed SDU-01 (Sub-acute) and Dr. Priya Patel (General Emergency).',
      'Electrolyte infusion running.'
    );

    // 9. Activity / Audit Logs
    const insertLog = db.prepare(`
      INSERT INTO activity_logs (user_id, username, action_type, entity_type, entity_id, description, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertLog.run(adminUser.lastInsertRowid, 'admin', 'SYSTEM_INIT', 'System', '0', 'System database initialized with baseline demonstration seed data', JSON.stringify({ mode: 'Demonstration' }));
    insertLog.run(coordUser.lastInsertRowid, 'coordinator', 'CASE_REGISTER', 'Case', 'CAS-2026-011', 'Registered emergency case CAS-2026-011 with Critical priority (Cardiology/ICU)', JSON.stringify({ priority: 'Critical', area: 'ICU' }));
    insertLog.run(coordUser.lastInsertRowid, 'coordinator', 'CASE_REGISTER', 'Case', 'CAS-2026-012', 'Registered emergency case CAS-2026-012 with High priority (Trauma Bay)', JSON.stringify({ priority: 'High', area: 'Trauma Bay' }));
    insertLog.run(coordUser.lastInsertRowid, 'coordinator', 'ALLOCATION_CONFIRM', 'Allocation', 'CAS-2026-005', 'Confirmed resource allocation for CAS-2026-005: Bed TB-01, Dr. Marcus Vance, Ambulance MEDIC-102', JSON.stringify({ bed: 'TB-01', doctor: 'Dr. Marcus Vance', ambulance: 'MEDIC-102' }));
    insertLog.run(staffUser.lastInsertRowid, 'staff', 'BED_UPDATE', 'Bed', 'ED-07', 'Marked Bed ED-07 as Out of Service for sensor calibration', JSON.stringify({ status: 'Out of Service' }));
    insertLog.run(coordUser.lastInsertRowid, 'coordinator', 'AMBULANCE_DISPATCH', 'Ambulance', 'MEDIC-102', 'Dispatched MEDIC-102 for simulated emergency transport (CAS-2026-005)', JSON.stringify({ status: 'Dispatched' }));
  });

  seedTransaction();
  return true;
}

module.exports = {
  seedDatabase,
};
