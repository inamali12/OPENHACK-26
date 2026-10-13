const express = require('express');
const { getDatabase } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET activity and audit logs
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDatabase();
    const {
      search = '',
      actionType = '',
      entityType = '',
      page = 1,
      limit = 25,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = ['1=1'];
    let params = [];

    if (search.trim()) {
      whereClauses.push('(description LIKE ? OR entity_id LIKE ? OR username LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (actionType.trim()) {
      whereClauses.push('action_type = ?');
      params.push(actionType.trim());
    }

    if (entityType.trim()) {
      whereClauses.push('entity_type = ?');
      params.push(entityType.trim());
    }

    const whereSql = whereClauses.join(' AND ');

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM activity_logs WHERE ${whereSql}`).get(...params);
    const totalCount = countRow ? countRow.total : 0;

    const logs = db.prepare(`
      SELECT * FROM activity_logs
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      success: true,
      data: logs,
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

module.exports = router;
