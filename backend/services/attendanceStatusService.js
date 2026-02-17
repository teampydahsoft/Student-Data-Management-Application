const { masterPool } = require('../config/database');
const { normalizeDate } = require('./customHolidayService');

/**
 * Get count of attendance records for each date in range
 * Returns Map<dateString, count> where count > 0 means attendance was marked
 */
const getAttendanceStatusForRange = async (startDate, endDate) => {
  const normalizedStart = normalizeDate(startDate);
  const normalizedEnd = normalizeDate(endDate);

  if (!normalizedStart || !normalizedEnd) {
    throw new Error('Invalid date range supplied');
  }

  const [rows] = await masterPool.query(
    `
      SELECT 
        attendance_date,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
      FROM attendance_records
      WHERE attendance_date BETWEEN ? AND ?
      GROUP BY attendance_date
    `,
    [normalizedStart, normalizedEnd]
  );

  console.log(`[AttendanceStatus] Query range: ${normalizedStart} to ${normalizedEnd}`);
  console.log(`[AttendanceStatus] Found ${rows.length} dates with attendance records:`,
    rows.map(r => `${r.attendance_date}: ${r.count} records`).join(', '));

  const map = new Map();
  rows.forEach((row) => {
    // Convert Date object to YYYY-MM-DD string format in IST
    const dateStr = row.attendance_date instanceof Date
      ? row.attendance_date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      : String(row.attendance_date).split('T')[0];

    // Store object with present/absent counts instead of just total
    map.set(dateStr, {
      total: Number(row.total) || 0,
      present: Number(row.present) || 0,
      absent: Number(row.absent) || 0
    });
  });

  console.log(`[AttendanceStatus] Map keys:`, Array.from(map.keys()).join(', '));


  return map;
};

module.exports = {
  getAttendanceStatusForRange
};
