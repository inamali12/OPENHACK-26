const express = require('express');
const { getDatabase } = require('../db/database');
const { handleSSEConnection } = require('../services/sseService');

const router = express.Router();

// SSE Live Stream
router.get('/stream', (req, res) => {
  handleSSEConnection(req, res);
});

// Summary Counters
router.get('/summary', (req, res, next) => {
  try {
    const db = getDatabase();

    const activeCases = db.prepare(`
      SELECT 
        COUNT(*) as total_active,
        SUM(CASE WHEN priority = 'Critical' THEN 1 ELSE 0 END) as critical_active,
        SUM(CASE WHEN status IN ('New', 'Triage') THEN 1 ELSE 0 END) as awaiting_allocation
      FROM emergency_cases
      WHERE status != 'Closed'
    `).get();

    const bedsSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_beds,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_beds,
        SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied_beds,
        SUM(CASE WHEN status = 'Out of Service' THEN 1 ELSE 0 END) as oos_beds
      FROM beds
    `).get();

    const doctorsSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_doctors,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_doctors,
        SUM(CASE WHEN status = 'Busy' THEN 1 ELSE 0 END) as busy_doctors,
        SUM(CASE WHEN status = 'Off Duty' THEN 1 ELSE 0 END) as off_duty_doctors
      FROM doctors
    `).get();

    const ambulancesSummary = db.prepare(`
      SELECT 
        COUNT(*) as total_ambulances,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_ambulances,
        SUM(CASE WHEN status = 'Dispatched' THEN 1 ELSE 0 END) as dispatched_ambulances,
        SUM(CASE WHEN status = 'En Route' THEN 1 ELSE 0 END) as en_route_ambulances,
        SUM(CASE WHEN status = 'At Hospital' THEN 1 ELSE 0 END) as at_hospital_ambulances,
        SUM(CASE WHEN status = 'Out of Service' THEN 1 ELSE 0 END) as oos_ambulances
      FROM ambulances
    `).get();

    const totalBeds = bedsSummary.total_beds || 0;
    const occupiedBeds = bedsSummary.occupied_beds || 0;
    const bedOccupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // Check for resource shortages
    const shortages = [];
    if (bedsSummary.available_beds <= 2) {
      shortages.push({ type: 'Bed Shortage', severity: bedsSummary.available_beds === 0 ? 'critical' : 'warning', message: `Only ${bedsSummary.available_beds} beds currently available hospital-wide.` });
    }
    if (doctorsSummary.available_doctors <= 2) {
      shortages.push({ type: 'Doctor Shortage', severity: doctorsSummary.available_doctors === 0 ? 'critical' : 'warning', message: `Only ${doctorsSummary.available_doctors} on-duty physicians currently available.` });
    }
    if (ambulancesSummary.available_ambulances === 0) {
      shortages.push({ type: 'Ambulance Depletion', severity: 'warning', message: 'All ambulances are currently dispatched or out of service.' });
    }

    res.json({
      success: true,
      data: {
        cases: {
          totalActive: activeCases.total_active || 0,
          criticalActive: activeCases.critical_active || 0,
          awaitingAllocation: activeCases.awaiting_allocation || 0,
        },
        beds: {
          total: totalBeds,
          available: bedsSummary.available_beds || 0,
          occupied: occupiedBeds,
          outOfService: bedsSummary.oos_beds || 0,
          occupancyRate: bedOccupancyRate,
        },
        doctors: {
          total: doctorsSummary.total_doctors || 0,
          available: doctorsSummary.available_doctors || 0,
          busy: doctorsSummary.busy_doctors || 0,
          offDuty: doctorsSummary.off_duty_doctors || 0,
        },
        ambulances: {
          total: ambulancesSummary.total_ambulances || 0,
          available: ambulancesSummary.available_ambulances || 0,
          dispatched: ambulancesSummary.dispatched_ambulances || 0,
          enRoute: ambulancesSummary.en_route_ambulances || 0,
          atHospital: ambulancesSummary.at_hospital_ambulances || 0,
          outOfService: ambulancesSummary.oos_ambulances || 0,
        },
        shortages,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Chart Aggregations
router.get('/charts', (req, res, next) => {
  try {
    const db = getDatabase();

    // 1. Beds by Ward (Stacked counts)
    const bedsByWard = db.prepare(`
      SELECT 
        ward,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'Out of Service' THEN 1 ELSE 0 END) as out_of_service
      FROM beds
      GROUP BY ward
      ORDER BY ward ASC
    `).all();

    // 2. Doctor Specialty and Workloads
    const doctorSpecialties = db.prepare(`
      SELECT 
        specialty,
        COUNT(*) as total_physicians,
        SUM(current_workload) as total_workload,
        SUM(max_workload) as total_capacity
      FROM doctors
      GROUP BY specialty
      ORDER BY total_physicians DESC
    `).all();

    // 3. Ambulance Status Distribution
    const ambulanceStatus = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM ambulances
      GROUP BY status
    `).all();

    // 4. Cases by Priority
    const casesByPriority = db.prepare(`
      SELECT 
        c.priority,
        p.color,
        COUNT(*) as count
      FROM emergency_cases c
      LEFT JOIN priority_settings p ON c.priority = p.priority_key
      WHERE c.status != 'Closed'
      GROUP BY c.priority
      ORDER BY p.score DESC
    `).all();

    res.json({
      success: true,
      data: {
        bedsByWard,
        doctorSpecialties,
        ambulanceStatus,
        casesByPriority,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Urgent Priority Operational Queue
router.get('/urgent-queue', (req, res, next) => {
  try {
    const db = getDatabase();
    const queue = db.prepare(`
      SELECT c.*, p.score as priority_score, p.color as priority_color
      FROM emergency_cases c
      LEFT JOIN priority_settings p ON c.priority = p.priority_key
      WHERE c.status != 'Closed'
      ORDER BY p.score DESC, c.arrival_time ASC
      LIMIT 8
    `).all();

    res.json({ success: true, data: queue });
  } catch (err) {
    next(err);
  }
});

// Recent Activities
router.get('/activity', (req, res, next) => {
  try {
    const db = getDatabase();
    const activities = db.prepare(`
      SELECT * FROM activity_logs
      ORDER BY created_at DESC
      LIMIT 12
    `).all();

    res.json({ success: true, data: activities });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
