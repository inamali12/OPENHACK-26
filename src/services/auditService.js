const { getDatabase } = require('../db/database');

function logActivity({ userId = null, username = 'system', actionType, entityType, entityId = '', description, details = null }) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO activity_logs (user_id, username, action_type, entity_type, entity_id, description, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const detailsJson = details ? JSON.stringify(details) : null;
    stmt.run(userId, username, actionType, entityType, String(entityId), description, detailsJson);
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = {
  logActivity,
};
