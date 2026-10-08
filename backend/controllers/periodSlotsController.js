/**
 * Period Slots Controller (Pydah v2.0)
 * CRUD for college-wise period slots (e.g. P1 09:00-10:00).
 */

const { masterPool, academicPool } = require('../config/database');

function buildScopeCondition(scope) {
  if (!scope || scope.unrestricted) return { condition: '1=1', params: [] };
  const params = [];
  if (scope.collegeIds && scope.collegeIds.length > 0) {
    params.push(scope.collegeIds);
    return { condition: 'college_id IN (?)', params };
  }
  return { condition: '1=1', params: [] };
}

exports.list = async (req, res) => {
  try {
    const { college_id } = req.query;

    // 1. Try querying Academic Portal DB (ap_timing_template_slots & ap_timing_templates)
    try {
      let apSql = `SELECT DISTINCT slot_order as id, label as slot_name, label as name, MIN(start_time) as start_time, MAX(end_time) as end_time, slot_order as sort_order
                   FROM ap_timing_template_slots
                   WHERE is_active = 1
                   GROUP BY slot_order, label
                   ORDER BY slot_order ASC`;
      const [apRows] = await academicPool.query(apSql);
      if (apRows.length > 0) {
        return res.json({ success: true, data: apRows, source: 'academic_portal' });
      }
    } catch (apErr) {
      console.warn('Academic Portal DB period slots fetch notice:', apErr.message);
    }

    // 2. Fallback to SDMS Master DB (student_database)
    const scope = req.userScope || {};
    const { condition, params } = buildScopeCondition(scope);

    let sql = `SELECT id, college_id, name, name as slot_name, start_time, end_time, sort_order, is_active, created_at
               FROM period_slots WHERE ${condition}`;
    const queryParams = [...params.flat()];

    if (college_id) {
      sql += ` AND college_id = ?`;
      queryParams.push(college_id);
    }
    sql += ' ORDER BY sort_order ASC, start_time ASC';

    const [rows] = await masterPool.query(sql, queryParams);
    res.json({ success: true, data: rows, source: 'master' });
  } catch (error) {
    console.error('periodSlots list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch period slots' });
  }
};

exports.create = async (req, res) => {
  try {
    const { college_id, name, start_time, end_time, sort_order } = req.body;
    if (!college_id || !name || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: 'college_id, name, start_time, end_time required' });
    }
    const scope = req.userScope || {};
    if (!scope.unrestricted && scope.collegeIds?.length && !scope.collegeIds.includes(Number(college_id))) {
      return res.status(403).json({ success: false, message: 'Not allowed for this college' });
    }
    const [r] = await masterPool.query(
      `INSERT INTO period_slots (college_id, name, start_time, end_time, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [college_id, name, start_time, end_time, sort_order != null ? sort_order : 0]
    );
    res.status(201).json({ success: true, data: { id: r.insertId, college_id, name, start_time, end_time, sort_order: sort_order ?? 0 } });
  } catch (error) {
    console.error('periodSlots create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create period slot' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, start_time, end_time, sort_order, is_active } = req.body;
    const scope = req.userScope || {};
    const { condition, params } = buildScopeCondition(scope);
    const [existing] = await masterPool.query(
      `SELECT id, college_id FROM period_slots WHERE id = ? AND (${condition})`,
      [id, ...params.flat()]
    );
    if (!existing?.length) return res.status(404).json({ success: false, message: 'Period slot not found' });

    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (start_time !== undefined) { updates.push('start_time = ?'); values.push(start_time); }
    if (end_time !== undefined) { updates.push('end_time = ?'); values.push(end_time); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
    if (updates.length === 0) return res.json({ success: true, data: existing[0] });

    values.push(id);
    await masterPool.query(`UPDATE period_slots SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: 'Updated' });
  } catch (error) {
    console.error('periodSlots update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update period slot' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const scope = req.userScope || {};
    const { condition, params } = buildScopeCondition(scope);
    const [r] = await masterPool.query(
      `DELETE FROM period_slots WHERE id = ? AND (${condition})`,
      [id, ...params.flat()]
    );
    if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Period slot not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    console.error('periodSlots remove error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete period slot' });
  }
};
