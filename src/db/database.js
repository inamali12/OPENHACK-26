const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    dbInstance = new Database(config.DB_FILE, {
      verbose: config.NODE_ENV === 'development' ? null : null,
    });
    // Enable Write-Ahead Logging for better concurrent read/write performance
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('busy_timeout = 5000');

    // Run schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    dbInstance.exec(schemaSql);
  }
  return dbInstance;
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
};
