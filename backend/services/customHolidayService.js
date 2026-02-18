const { masterPool } = require('../config/database');

const ensureTable = async () => {
  await masterPool.query(`
    CREATE TABLE IF NOT EXISTS custom_holidays (
      id INT AUTO_INCREMENT PRIMARY KEY,
      holiday_date DATE NOT NULL UNIQUE,
      title VARCHAR(120) NOT NULL,
      description TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
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
    `
      SELECT
        id,
        DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date,
        title,
        description,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM custom_holidays
      ${whereClause}
      ORDER BY holiday_date ASC
    `,
    params
  );

  return rows;
};

const upsertCustomHoliday = async ({ date, title, description, createdBy }) => {
  await ensureTable();

  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) {
    throw new Error('Invalid holiday date');
  }

  const holidayTitle = title && title.trim().length > 0 ? title.trim() : 'Holiday';
  const holidayDescription =
    description && description.trim().length > 0 ? description.trim() : null;

  await masterPool.query(
    `
      INSERT INTO custom_holidays (holiday_date, title, description, created_by)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        updated_at = CURRENT_TIMESTAMP
    `,
    [normalizedDate, holidayTitle, holidayDescription, createdBy || null]
  );

  const [rows] = await masterPool.query(
    `
      SELECT
        id,
        DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date,
        title,
        description,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM custom_holidays
      WHERE holiday_date = ?
      LIMIT 1
    `,
    [normalizedDate]
  );

  return rows[0] || null;
};

const deleteCustomHoliday = async (date) => {
  await ensureTable();

  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) {
    throw new Error('Invalid holiday date');
  }

  const [result] = await masterPool.query(
    `
      DELETE FROM custom_holidays
      WHERE holiday_date = ?
    `,
    [normalizedDate]
  );

  return result.affectedRows > 0;
};

module.exports = {
  listCustomHolidays,
  upsertCustomHoliday,
  deleteCustomHoliday,
  normalizeDate
};

