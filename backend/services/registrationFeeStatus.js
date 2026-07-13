const FEE_COMPLETE_STATUSES = ['no due', 'no_due', 'permitted', 'completed', 'nodue'];

const normalizeFeeStatusKey = (status) => (
  String(status || '').trim().toLowerCase().replace(/\s+/g, '_')
);

const isProtectedFeeStatus = (status) => {
  const normalized = normalizeFeeStatusKey(status);
  return normalized === 'permitted' || normalized === 'no_due' || normalized === 'nodue';
};

const deriveFeeStatusForStage = (fallbackFeeStatus, feeRowsForStage = []) => {
  if (isProtectedFeeStatus(fallbackFeeStatus)) {
    return fallbackFeeStatus;
  }

  if (!Array.isArray(feeRowsForStage) || feeRowsForStage.length === 0) {
    return fallbackFeeStatus || null;
  }

  let allPaid = true;
  let anyPaidOrPartial = false;

  for (const row of feeRowsForStage) {
    const amountVal = parseFloat(row.amount) || 0;
    const paidVal = parseFloat(row.paid_amount) || 0;
    const status = String(row.payment_status || '').toLowerCase();
    const isPaid = status === 'paid' || paidVal >= amountVal;
    const isPartial = status === 'partial' || (paidVal > 0 && paidVal < amountVal);

    if (isPaid) {
      anyPaidOrPartial = true;
    } else if (isPartial) {
      anyPaidOrPartial = true;
      allPaid = false;
    } else {
      allPaid = false;
    }
  }

  if (allPaid) return 'completed';
  if (anyPaidOrPartial) return 'partially_completed';
  return 'pending';
};

const isFeeStatusComplete = (status) => {
  const normalized = String(status || '').toLowerCase();
  return FEE_COMPLETE_STATUSES.some((entry) => normalized.includes(entry));
};

const buildFeeStatusMapForStudents = async (pool, students) => {
  const map = new Map();
  if (!students?.length) return map;

  const studentIds = students.map((student) => student.id);
  const [rows] = await pool.query(
    `SELECT student_id, year, semester, amount, paid_amount, payment_status
     FROM student_fees
     WHERE student_id IN (?)`,
    [studentIds]
  );

  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.student_id}:${row.year}:${row.semester}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  for (const student of students) {
    const year = Math.max(1, Number(student.current_year) || 1);
    const semester = Math.max(1, Number(student.current_semester) || 1);
    const key = `${student.id}:${year}:${semester}`;
    const fallback = student.fee_status || '';
    map.set(
      student.id,
      deriveFeeStatusForStage(fallback, grouped.get(key) || [])
    );
  }

  return map;
};

module.exports = {
  FEE_COMPLETE_STATUSES,
  deriveFeeStatusForStage,
  isFeeStatusComplete,
  buildFeeStatusMapForStudents
};
