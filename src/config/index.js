require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SESSION_SECRET: process.env.SESSION_SECRET || 'sherm_emergency_super_secret_session_key_2026_hec',
  DB_FILE: path.resolve(process.cwd(), process.env.DB_FILE || 'hospital.db'),
  DEFAULT_MAX_DOCTOR_WORKLOAD: 4,
};
