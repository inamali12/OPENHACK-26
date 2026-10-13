-- Smart Hospital Emergency Resource Manager (SHERM)
-- Database Schema for SQLite

PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'coordinator', 'staff')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Priority Configuration table
CREATE TABLE IF NOT EXISTS priority_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  priority_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  score INTEGER NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

-- System Settings table
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);

-- Emergency Cases table
CREATE TABLE IF NOT EXISTS emergency_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number TEXT UNIQUE NOT NULL,
  patient_ref TEXT NOT NULL,
  age INTEGER,
  arrival_time DATETIME NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  care_area TEXT NOT NULL,
  specialty_needed TEXT,
  transport_needed INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('New', 'Triage', 'Allocated', 'In Treatment', 'Closed')),
  operational_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Hospital Beds table
CREATE TABLE IF NOT EXISTS beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bed_number TEXT UNIQUE NOT NULL,
  ward TEXT NOT NULL,
  bed_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Available', 'Occupied', 'Out of Service')),
  current_case_id INTEGER,
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_case_id) REFERENCES emergency_cases(id) ON DELETE SET NULL
);

-- Doctors table
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  shift TEXT NOT NULL CHECK(shift IN ('Day', 'Evening', 'Night')),
  status TEXT NOT NULL CHECK(status IN ('Available', 'Busy', 'Off Duty')),
  max_workload INTEGER DEFAULT 4,
  current_workload INTEGER DEFAULT 0,
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ambulances table
CREATE TABLE IF NOT EXISTS ambulances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_sign TEXT UNIQUE NOT NULL,
  plate_number TEXT NOT NULL,
  capability TEXT NOT NULL CHECK(capability IN ('Advanced Life Support', 'Basic Life Support', 'Critical Care Transport')),
  status TEXT NOT NULL CHECK(status IN ('Available', 'Dispatched', 'En Route', 'At Hospital', 'Out of Service')),
  current_location TEXT,
  current_case_id INTEGER,
  last_status_update DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  FOREIGN KEY (current_case_id) REFERENCES emergency_cases(id) ON DELETE SET NULL
);

-- Allocations / Resource Assignments table
CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  bed_id INTEGER,
  doctor_id INTEGER,
  ambulance_id INTEGER,
  allocated_by_user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Completed', 'Cancelled')),
  recommendation_rationale TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES emergency_cases(id),
  FOREIGN KEY (bed_id) REFERENCES beds(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  FOREIGN KEY (ambulance_id) REFERENCES ambulances(id),
  FOREIGN KEY (allocated_by_user_id) REFERENCES users(id)
);

-- Activity and Audit Logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  description TEXT NOT NULL,
  details_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indices for rapid queries and lookups
CREATE INDEX IF NOT EXISTS idx_cases_priority_status ON emergency_cases(priority, status);
CREATE INDEX IF NOT EXISTS idx_cases_arrival ON emergency_cases(arrival_time);
CREATE INDEX IF NOT EXISTS idx_beds_status_ward ON beds(status, ward);
CREATE INDEX IF NOT EXISTS idx_doctors_status_specialty ON doctors(status, specialty);
CREATE INDEX IF NOT EXISTS idx_ambulances_status ON ambulances(status);
CREATE INDEX IF NOT EXISTS idx_allocations_case ON allocations(case_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
