const { masterPool } = require('../config/database');
const {
  serializeTarget,
  parseTargetsFromRow,
  extractTargetsFromBody,
  isGlobalTarget
} = require('./targetingService');

let schemaReady = false;

const ensureTable = async () => {
  await masterPool.query(`
    CREATE TABLE IF NOT EXISTS custom_holidays (
      id INT AUTO_INCREMENT PRIMARY KEY,
      holiday_date DATE NOT NULL,
      title VARCHAR(120) NOT NULL,
      description TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  if (schemaReady) return;

  const targetColumns = [
    'target_college TEXT NULL',
    'target_batch TEXT NULL',
    'target_course TEXT NULL',
    'target_branch TEXT NULL',
    'target_year TEXT NULL',
    'target_semester TEXT NULL'
  ];

  for (const columnDef of targetColumns) {
    try {
      await masterPool.query(`ALTER TABLE custom_holidays ADD COLUMN ${columnDef}`);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
  }

  try {
    await masterPool.query('ALTER TABLE custom_holidays DROP INDEX holiday_date');
  } catch (error) {
    // Index may not exist after migration
  }

  try {
    await masterPool.query('CREATE INDEX idx_custom_holidays_date ON custom_holidays (holiday_date)');
  } catch (error) {
    // Index may already exist
  }

  schemaReady = true;
};

const normalizeDate = (dateInput) => {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mapHolidayRow = (row) => {
  if (!row) return null;
  const targets = parseTargetsFromRow(row);
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    description: row.description,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...targets,
    isGlobal: isGlobalTarget(targets)
  };
};

const HOLIDAY_SELECT = `
  SELECT
    id,
    DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date,
    title,
    description,
    target_college,
    target_batch,
    target_course,
    target_branch,
    target_year,
    target_semester,
    created_by AS createdBy,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM custom_holidays
`;

const listCustomHolidays = async ({ startDate, endDate } = {}) => {
  await ensureTable();

  const params = [];
  let whereClause = '';

  if (startDate && endDate) {
    whereClause = 'WHERE holiday_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (startDate) {
    whereClause = 'WHERE holiday_date >= ?';
    params.push(startDate);
  } else if (endDate) {
    whereClause = 'WHERE holiday_date <= ?';
    params.push(endDate);
  }

  const [rows] = await masterPool.query(
    `${HOLIDAY_SELECT}
      ${whereClause}
      ORDER BY holiday_date ASC, id ASC
    `,
    params
  );

  return rows.map(mapHolidayRow);
};

const getCustomHolidayById = async (id) => {
  await ensureTable();
  const [rows] = await masterPool.query(`${HOLIDAY_SELECT} WHERE id = ? LIMIT 1`, [id]);
  return mapHolidayRow(rows[0]);
};

const saveCustomHoliday = async ({
  id,
  date,
  title,
  description,
  createdBy,
  ...body
}) => {
  await ensureTable();

  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) {
    throw new Error('Invalid holiday date');
  }

  const holidayTitle = title && title.trim().length > 0 ? title.trim() : 'Holiday';
  const holidayDescription =
    description && description.trim().length > 0 ? description.trim() : null;
  const targets = extractTargetsFromBody(body);

  const serializedTargets = {
    target_college: serializeTarget(targets.target_college),
    target_batch: serializeTarget(targets.target_batch),
    target_course: serializeTarget(targets.target_course),
    target_branch: serializeTarget(targets.target_branch),
    target_year: serializeTarget(targets.target_year),
    target_semester: serializeTarget(targets.target_semester)
  };

  if (id) {
    await masterPool.query(
      `
        UPDATE custom_holidays
        SET holiday_date = ?,
            title = ?,
            description = ?,
            target_college = ?,
            target_batch = ?,
            target_course = ?,
            target_branch = ?,
            target_year = ?,
            target_semester = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        normalizedDate,
        holidayTitle,
        holidayDescription,
        serializedTargets.target_college,
        serializedTargets.target_batch,
        serializedTargets.target_course,
        serializedTargets.target_branch,
        serializedTargets.target_year,
        serializedTargets.target_semester,
        id
      ]
    );
    return getCustomHolidayById(id);
  }

  const [result] = await masterPool.query(
    `
      INSERT INTO custom_holidays (
        holiday_date,
        title,
        description,
        created_by,
        target_college,
        target_batch,
        target_course,
        target_branch,
        target_year,
        target_semester
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizedDate,
      holidayTitle,
      holidayDescription,
      createdBy || null,
      serializedTargets.target_college,
      serializedTargets.target_batch,
      serializedTargets.target_course,
      serializedTargets.target_branch,
      serializedTargets.target_year,
      serializedTargets.target_semester
    ]
  );

  return getCustomHolidayById(result.insertId);
};

const upsertCustomHoliday = saveCustomHoliday;

const deleteCustomHolidayById = async (id) => {
  await ensureTable();
  const holiday = await getCustomHolidayById(id);
  if (!holiday) return null;

  const [result] = await masterPool.query('DELETE FROM custom_holidays WHERE id = ?', [id]);
  return result.affectedRows > 0 ? holiday : null;
};

const deleteCustomHoliday = async (dateOrId) => {
  await ensureTable();

  if (Number.isInteger(Number(dateOrId)) && String(dateOrId).match(/^\d+$/)) {
    const deleted = await deleteCustomHolidayById(Number(dateOrId));
    return Boolean(deleted);
  }

  const normalizedDate = normalizeDate(dateOrId);
  if (!normalizedDate) {
    throw new Error('Invalid holiday date');
  }

  const [result] = await masterPool.query(
    'DELETE FROM custom_holidays WHERE holiday_date = ?',
    [normalizedDate]
  );

  return result.affectedRows > 0;
};

module.exports = {
  listCustomHolidays,
  getCustomHolidayById,
  saveCustomHoliday,
  upsertCustomHoliday,
  deleteCustomHoliday,
  deleteCustomHolidayById,
  normalizeDate
};
