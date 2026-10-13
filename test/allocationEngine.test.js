const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const { getDatabase } = require('../src/db/database');
const { seedDatabase } = require('../src/db/seed');
const { getRecommendation, confirmAllocation } = require('../src/services/allocationEngine');

describe('Transparent Allocation Recommendation Engine Tests', () => {
  before(() => {
    // Ensure clean seeded test state
    seedDatabase(true);
  });

  test('Should generate a transparent recommendation for pending emergency case', () => {
    const db = getDatabase();
    // CAS-2026-011 is a pending Critical cardiovascular case requesting ICU bed and transport
    const testCase = db.prepare("SELECT * FROM emergency_cases WHERE case_number = 'CAS-2026-011'").get();
    assert.ok(testCase, 'Test case CAS-2026-011 should exist');

    const rec = getRecommendation(testCase.id);

    assert.strictEqual(rec.case.case_number, 'CAS-2026-011');
    assert.strictEqual(rec.case.priority, 'Critical');
    assert.ok(rec.recommendations.bed.isAvailable, 'A bed recommendation should be available');
    assert.strictEqual(rec.recommendations.bed.resource.ward, 'ICU', 'Recommended bed should be in ICU');
    assert.ok(rec.recommendations.bed.rationale.length > 0, 'Bed rationale must be populated');

    assert.ok(rec.recommendations.doctor.isAvailable, 'A doctor should be available');
    assert.ok(rec.recommendations.doctor.rationale.length > 0, 'Doctor rationale must be populated');

    assert.ok(rec.recommendations.ambulance.isNeeded, 'Transport was requested');
    assert.ok(rec.recommendations.ambulance.isAvailable, 'An ambulance should be available');
    assert.ok(rec.disclaimer.includes('Administrative resource matching'), 'Disclaimer must be present');
  });

  test('Should atomically confirm allocation and update bed, doctor, ambulance status', () => {
    const db = getDatabase();
    const testCase = db.prepare("SELECT * FROM emergency_cases WHERE case_number = 'CAS-2026-011'").get();
    const rec = getRecommendation(testCase.id);

    const bedId = rec.recommendations.bed.resource.id;
    const doctorId = rec.recommendations.doctor.resource.id;
    const ambulanceId = rec.recommendations.ambulance.resource.id;

    // Doctor workload before
    const docBefore = db.prepare('SELECT current_workload FROM doctors WHERE id = ?').get(doctorId);

    const coordUser = db.prepare("SELECT id FROM users WHERE username = 'coordinator'").get();

    // Confirm allocation
    const result = confirmAllocation({
      caseId: testCase.id,
      bedId,
      doctorId,
      ambulanceId,
      userId: coordUser.id,
      username: 'coordinator',
      notes: 'Automated test assignment',
    });

    assert.ok(result.allocationId, 'Allocation ID should be returned');
    assert.strictEqual(result.caseNumber, 'CAS-2026-011');

    // Verify bed is now Occupied
    const bedAfter = db.prepare('SELECT * FROM beds WHERE id = ?').get(bedId);
    assert.strictEqual(bedAfter.status, 'Occupied');
    assert.strictEqual(bedAfter.current_case_id, testCase.id);

    // Verify doctor workload incremented
    const docAfter = db.prepare('SELECT current_workload FROM doctors WHERE id = ?').get(doctorId);
    assert.strictEqual(docAfter.current_workload, docBefore.current_workload + 1);

    // Verify ambulance is Dispatched
    const ambAfter = db.prepare('SELECT * FROM ambulances WHERE id = ?').get(ambulanceId);
    assert.strictEqual(ambAfter.status, 'Dispatched');
    assert.strictEqual(ambAfter.current_case_id, testCase.id);

    // Verify case status updated to Allocated
    const caseAfter = db.prepare('SELECT status FROM emergency_cases WHERE id = ?').get(testCase.id);
    assert.strictEqual(caseAfter.status, 'Allocated');
  });

  test('Should reject conflicting allocation if bed is already occupied', () => {
    const db = getDatabase();
    const coordUser = db.prepare("SELECT id FROM users WHERE username = 'coordinator'").get();
    const occupiedBed = db.prepare("SELECT * FROM beds WHERE status = 'Occupied' LIMIT 1").get();
    assert.ok(occupiedBed, 'There should be an occupied bed');

    // Create a new case
    const res = db.prepare(`
      INSERT INTO emergency_cases (case_number, patient_ref, arrival_time, category, priority, care_area, status)
      VALUES ('TEST-CONFLICT-01', 'PT-TEST-01', datetime('now'), 'General', 'Medium', 'Emergency Dept', 'New')
    `).run();
    const newCaseId = Number(res.lastInsertRowid);

    assert.throws(
      () => {
        confirmAllocation({
          caseId: newCaseId,
          bedId: occupiedBed.id,
          doctorId: null,
          ambulanceId: null,
          userId: coordUser.id,
          username: 'coordinator',
        });
      },
      (err) => {
        return err.status === 409 && err.message.includes('Conflict: Bed');
      },
      'Should reject assignment of already occupied bed with 409 Conflict'
    );
  });
});
