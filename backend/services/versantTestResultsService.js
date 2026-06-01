const { ObjectId } = require('mongodb');
const { getVersantDb } = require('../config/versantDb');
const { normalizeDocument, normalizeNumber } = require('../utils/mongoNormalize');
const {
  resolveVersantSubmittedAt,
  resolveVersantScheduleStart,
  resolveVersantScheduleEnd,
  formatSubmittedAtDisplay,
} = require('../utils/versantDateUtils');
const { masterPool } = require('../config/database');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function resolveScore(doc) {
  const raw =
    doc.average_score ?? doc.score ?? doc.percentage ?? doc.score_percentage;
  if (raw === null || raw === undefined) return null;
  const normalized = normalizeNumber(raw);
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function buildDateRange(fromDate, toDate) {
  const range = {};
  if (fromDate) {
    const from = new Date(fromDate);
    if (!Number.isNaN(from.getTime())) range.$gte = from;
  }
  if (toDate) {
    const to = new Date(toDate);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      range.$lte = to;
    }
  }
  return Object.keys(range).length ? range : null;
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    const s = String(v || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function submittedAtAggregationExpr() {
  return {
    $let: {
      vars: {
        raw: {
          $ifNull: [
            '$submitted_at',
            {
              $ifNull: [
                '$end_time',
                {
                  $ifNull: [
                    '$completed_at',
                    { $ifNull: ['$updated_at', { $ifNull: ['$created_at', '$start_time'] }] },
                  ],
                },
              ],
            },
          ],
        },
      },
      in: {
        $switch: {
          branches: [
            { case: { $eq: [{ $type: '$$raw' }, 'date'] }, then: '$$raw' },
            {
              case: {
                $in: [
                  { $type: '$$raw' },
                  ['string', 'long', 'double', 'int', 'timestamp', 'decimal'],
                ],
              },
              then: {
                $convert: { input: '$$raw', to: 'date', onError: null, onNull: null },
              },
            },
          ],
          default: null,
        },
      },
    },
  };
}

function formatResultRow(doc, source = 'test_results') {
  const normalized = normalizeDocument(doc);
  const submittedIso = resolveVersantSubmittedAt(normalized);
  const submittedDisplay = formatSubmittedAtDisplay(submittedIso);

  return {
    id: normalized._id,
    student_id: normalized.student_id || null,
    source,
    roll_number: normalized.roll_number || null,
    pin_no: normalized.pin_no || null,
    admission_number: normalized.admission_number || null,
    student_name: normalized.student_name || null,
    student_email: normalized.student_email || null,
    test_id: normalized.test_id || null,
    test_name: normalized.test_name || null,
    module_id: normalized.module_id || null,
    subcategory: normalized.subcategory || null,
    level_id: normalized.level_id || null,
    test_type: normalized.test_type || null,
    score: resolveScore(normalized),
    average_score: normalized.average_score ?? null,
    percentage: normalized.percentage ?? null,
    correct_answers: normalizeNumber(normalized.correct_answers) ?? null,
    total_questions: normalizeNumber(normalized.total_questions) ?? null,
    submitted_at: submittedIso,
    submitted_at_display: submittedDisplay.formatted,
    submitted_date: submittedDisplay.date,
    submitted_time: submittedDisplay.time,
    time_taken: normalized.time_taken ?? null,
    results_count:
      normalized.results_count ??
      (Array.isArray(normalized.results)
        ? normalized.results.length
        : Array.isArray(normalized.answers)
          ? normalized.answers.length
          : Array.isArray(normalized.detailed_results)
            ? normalized.detailed_results.length
            : 0),
  };
}

function getLookupStages() {
  return [
    {
      $lookup: {
        from: 'users',
        localField: 'student_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'students',
        localField: 'student_id',
        foreignField: 'user_id',
        as: 'student',
      },
    },
    { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'tests',
        localField: 'test_id',
        foreignField: '_id',
        as: 'test',
      },
    },
    { $unwind: { path: '$test', preserveNullAndEmptyArrays: true } },
  ];
}

function getProjectStage({ includeResults = true } = {}) {
  const project = {
    _id: 1,
    student_id: 1,
    test_id: 1,
    roll_number: '$student.roll_number',
    pin_no: '$student.pin_no',
    admission_number: '$student.admission_number',
    student_name: { $ifNull: ['$student.name', '$user.name'] },
    student_email: { $ifNull: ['$student.email', '$user.email'] },
    test_name: '$test.name',
    module_id: 1,
    subcategory: 1,
    level_id: 1,
    test_type: 1,
    average_score: 1,
    score: 1,
    percentage: 1,
    correct_answers: 1,
    total_questions: 1,
    submitted_at: 1,
    end_time: 1,
    completed_at: 1,
    created_at: 1,
    start_time: 1,
    updated_at: 1,
    time_taken: 1,
    results_count: 1,
  };
  if (includeResults) {
    project.results = 1;
  }
  return { $project: project };
}

function buildVersantStudentMatchConditions(identifiers) {
  const conditions = [];
  for (const id of identifiers) {
    conditions.push(
      { roll_number: id },
      { pin_no: id },
      { admission_number: id },
      { admission_no: id },
    );
    const regex = new RegExp(`^${escapeRegex(id)}$`, 'i');
    conditions.push(
      { roll_number: regex },
      { pin_no: regex },
      { admission_number: regex },
      { admission_no: regex },
    );
  }
  return conditions;
}

function detectVersantMatchField(versantStudent, identifiers) {
  const lower = new Set(identifiers.map((i) => i.toLowerCase()));
  const fields = [
    ['roll_number', versantStudent.roll_number],
    ['pin_no', versantStudent.pin_no],
    ['admission_number', versantStudent.admission_number],
    ['admission_no', versantStudent.admission_no],
  ];
  for (const [name, val] of fields) {
    if (val && lower.has(String(val).trim().toLowerCase())) return name;
  }
  return 'students';
}

/**
 * Match SDMS PIN / admission / login username to AI-VERSANT students or users.
 */
async function findVersantStudentUserId(db, identifiers) {
  const ids = uniqueStrings(identifiers);
  if (!ids.length) return null;

  const studentOr = buildVersantStudentMatchConditions(ids);
  const student = await db.collection('students').findOne({ $or: studentOr });
  if (student?.user_id) {
    const normalized = normalizeDocument(student);
    return {
      userId: student.user_id,
      matchField: detectVersantMatchField(normalized, ids),
      versantRoll: normalized.roll_number || normalized.pin_no,
      versantPin: normalized.pin_no || normalized.roll_number,
      versantAdmission: normalized.admission_number || normalized.admission_no,
    };
  }

  const userOr = [];
  for (const id of ids) {
    userOr.push({ username: id }, { email: id });
    const regex = new RegExp(`^${escapeRegex(id)}$`, 'i');
    userOr.push({ username: regex }, { email: regex });
  }
  const user = await db.collection('users').findOne({ $or: userOr });
  if (user?._id) {
    return {
      userId: user._id,
      matchField: 'users.username',
      versantRoll: user.username,
      versantPin: user.username,
      versantAdmission: null,
    };
  }

  return null;
}

/**
 * Load PIN / admission / login username from SDMS (MySQL) for Versant lookup.
 */
function mapSdmsStudentRow(row, username) {
  const searchKeys = uniqueStrings([
    row.pin_no,
    row.admission_number,
    row.admission_no,
    row.login_username,
    username,
  ]);

  return {
    studentId: row.id,
    studentName: row.student_name,
    admissionNumber: row.admission_number,
    admissionNo: row.admission_no,
    pinNo: row.pin_no,
    batch: row.batch ?? null,
    course: row.course ?? null,
    branch: row.branch ?? null,
    loginUsername: row.login_username,
    searchKeys,
  };
}

async function resolveSdmsStudentIdentifiers({ studentId, admissionNumber, username }) {
  const params = [studentId, admissionNumber, username || admissionNumber];
  const baseSql = `
     SELECT s.id, s.admission_number, s.admission_no, s.pin_no, s.student_name,
            sc.username AS login_username
     FROM students s
     LEFT JOIN student_credentials sc ON sc.student_id = s.id
     WHERE s.id = ? OR s.admission_number = ? OR sc.username = ?
     LIMIT 1`;

  try {
    const [rows] = await masterPool.query(
      `SELECT s.id, s.admission_number, s.admission_no, s.pin_no, s.student_name,
              s.batch, s.course, s.branch,
              sc.username AS login_username
       FROM students s
       LEFT JOIN student_credentials sc ON sc.student_id = s.id
       WHERE s.id = ? OR s.admission_number = ? OR sc.username = ?
       LIMIT 1`,
      params,
    );
    if (!rows.length) return null;
    return mapSdmsStudentRow(rows[0], username);
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    const [rows] = await masterPool.query(baseSql, params);
    if (!rows.length) return null;
    return mapSdmsStudentRow(rows[0], username);
  }
}

async function enrichFiltersFromSdms(filters) {
  const admission = filters.admissionNumber?.trim();
  if (!admission) return filters;

  const [rows] = await masterPool.query(
    'SELECT pin_no, admission_no FROM students WHERE admission_number = ? LIMIT 1',
    [admission],
  );
  if (!rows.length) return filters;

  return {
    ...filters,
    pinNo: filters.pinNo || rows[0].pin_no || '',
    rollNumber: filters.rollNumber || rows[0].pin_no || '',
    admissionNo: rows[0].admission_no || '',
  };
}

async function resolveStudentUserIdFromFilters(db, filters) {
  if (filters.studentUserId) {
    return { userId: filters.studentUserId, matchField: 'direct' };
  }

  const enriched = await enrichFiltersFromSdms(filters);
  const searchKeys = uniqueStrings([
    enriched.rollNumber,
    enriched.pinNo,
    enriched.admissionNumber,
    enriched.admissionNo,
  ]);

  if (!searchKeys.length) return null;
  return findVersantStudentUserId(db, searchKeys);
}

async function findTestIdsByName(db, testName) {
  if (!testName || !String(testName).trim()) return null;
  const regex = new RegExp(String(testName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const tests = await db
    .collection('tests')
    .find({ name: regex }, { projection: { _id: 1 } })
    .limit(100)
    .toArray();
  return tests.map((t) => t._id);
}

function buildStudentIdMatch(studentUserId) {
  const oid = toObjectIdSafe(studentUserId);
  const sid = String(studentUserId);
  if (oid) return { $in: [oid, sid] };
  return sid;
}

function buildMatchStage({ studentUserId, testType, moduleId, fromDate, toDate, testIds }) {
  const match = {};
  if (studentUserId) match.student_id = buildStudentIdMatch(studentUserId);
  if (testType) match.test_type = testType;
  if (moduleId) match.module_id = moduleId;
  if (testIds?.length) match.test_id = { $in: testIds };
  const dateRange = buildDateRange(fromDate, toDate);
  if (dateRange) match.submitted_at = dateRange;
  return match;
}

const AGGREGATE_OPTS = { allowDiskUse: true };

async function aggregateTestResults(db, match, { page, limit, includeResults, testName }) {
  const skip = (page - 1) * limit;
  const pipeline = [];

  if (Object.keys(match).length) pipeline.push({ $match: match });

  pipeline.push({
    $addFields: {
      results_count: { $size: { $ifNull: ['$results', []] } },
      _sort_at: submittedAtAggregationExpr(),
    },
  });

  // Strip large results[] before sorting ~32k docs (avoids 32MB sort limit)
  if (!includeResults) {
    pipeline.push({ $unset: 'results' });
  }

  const dataStages = [
    { $sort: { _sort_at: -1, _id: -1 } },
    { $skip: skip },
    { $limit: limit },
    ...getLookupStages(),
  ];

  if (testName && !match.test_id) {
    dataStages.push({
      $match: {
        'test.name': new RegExp(
          String(testName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        ),
      },
    });
  }

  dataStages.push(getProjectStage({ includeResults }));

  pipeline.push({
    $facet: {
      data: dataStages,
      total: [{ $count: 'count' }],
    },
  });

  const [facet] = await db
    .collection('test_results')
    .aggregate(pipeline, AGGREGATE_OPTS)
    .toArray();
  const rows = facet?.data || [];
  const total = facet?.total?.[0]?.count || 0;
  return { rows, total };
}

function mapAttemptToResultShape(doc, testMap, studentMap, userMap) {
  const test = testMap.get(doc.test_id?.toString()) || {};
  const student = studentMap.get(doc.student_id?.toString()) || {};
  const user = userMap.get(doc.student_id?.toString()) || {};
  const questionDetails =
    doc.detailed_results?.length > 0
      ? doc.detailed_results
      : doc.answers || [];

  return normalizeDocument({
    _id: doc._id,
    student_id: doc.student_id,
    test_id: doc.test_id,
    roll_number: student.roll_number,
    pin_no: student.pin_no,
    admission_number: student.admission_number,
    student_name: student.name || user.name,
    student_email: student.email || user.email,
    test_name: test.name,
    module_id: test.module_id || doc.module_id,
    subcategory: doc.subcategory,
    level_id: doc.level_id,
    test_type: doc.test_type,
    average_score: doc.score,
    score: doc.score,
    percentage: doc.score_percentage,
    correct_answers: doc.correct_answers,
    total_questions: doc.total_questions,
    submitted_at: doc.submitted_at,
    end_time: doc.end_time,
    completed_at: doc.completed_at,
    created_at: doc.created_at,
    start_time: doc.start_time,
    updated_at: doc.updated_at,
    time_taken: doc.time_taken,
    results: questionDetails,
  });
}

async function fetchCompletedAttempts(db, match, { page, limit, testName }) {
  const attemptMatch = { status: 'completed', ...match };
  const skip = (page - 1) * limit;

  const [attempts, total] = await Promise.all([
    db
      .collection('student_test_attempts')
      .aggregate([
        { $match: attemptMatch },
        { $addFields: { _sort_at: submittedAtAggregationExpr() } },
        { $sort: { _sort_at: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
      ])
      .toArray(),
    db.collection('student_test_attempts').countDocuments(attemptMatch),
  ]);

  if (!attempts.length) return { rows: [], total };

  const studentIds = [...new Set(attempts.map((a) => a.student_id?.toString()).filter(Boolean))];
  const testIds = [...new Set(attempts.map((a) => a.test_id?.toString()).filter(Boolean))];

  const objectStudentIds = studentIds.map((id) => new ObjectId(id));
  const objectTestIds = testIds.map((id) => new ObjectId(id));

  const [students, users, tests] = await Promise.all([
    db
      .collection('students')
      .find({ user_id: { $in: objectStudentIds } })
      .toArray(),
    db
      .collection('users')
      .find({ _id: { $in: objectStudentIds } })
      .toArray(),
    db
      .collection('tests')
      .find({ _id: { $in: objectTestIds } })
      .toArray(),
  ]);

  const studentMap = new Map(students.map((s) => [s.user_id?.toString(), s]));
  const userMap = new Map(users.map((u) => [u._id?.toString(), u]));
  const testMap = new Map(tests.map((t) => [t._id?.toString(), t]));

  let rows = attempts.map((a) => mapAttemptToResultShape(a, testMap, studentMap, userMap));

  if (testName) {
    const re = new RegExp(
      String(testName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    rows = rows.filter((r) => re.test(r.test_name || ''));
  }

  return { rows, total };
}

const COMPLETED_ATTEMPT_STATUSES = ['completed', 'complete', 'submitted', 'finished', 'done'];
const INACTIVE_TEST_STATUSES = ['inactive', 'disabled', 'draft', 'archived', 'deleted', 'cancelled'];
const ASSIGNMENT_COLLECTIONS = [
  'student_test_assignments',
  'test_assignments',
  'online_test_assignments',
  'assigned_tests',
];

function toObjectIdSafe(value) {
  if (!value) return null;
  try {
    return value instanceof ObjectId ? value : new ObjectId(String(value));
  } catch {
    return null;
  }
}

function uniqueObjectIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (!id) continue;
    const str = id.toString();
    if (seen.has(str)) continue;
    seen.add(str);
    const oid = toObjectIdSafe(str);
    if (oid) out.push(oid);
  }
  return out;
}

function buildCoreStudentIdOr(userOid) {
  const uidStr = userOid.toString();
  return [
    { student_id: userOid },
    { user_id: userOid },
    { student_id: uidStr },
    { user_id: uidStr },
    { assigned_student_ids: { $in: [userOid, uidStr] } },
    { student_ids: { $in: [userOid, uidStr] } },
    { assigned_users: { $in: [userOid, uidStr] } },
    { user_ids: { $in: [userOid, uidStr] } },
    { 'assigned_to.user_id': userOid },
    { 'assigned_to.student_id': userOid },
  ];
}

function buildScopeTestQueries(userOid, profile) {
  const uidStr = userOid.toString();
  const queries = [{ $or: buildCoreStudentIdOr(userOid) }];

  const addScope = (field, value) => {
    if (value === null || value === undefined || value === '') return;
    const s = String(value).trim();
    if (!s) return;
    queries.push({ [field]: s });
    if (field.endsWith('_id')) {
      const base = field.replace(/_id$/, '');
      if (base && base !== field) queries.push({ [base]: s });
    } else {
      queries.push({ [`${field}_id`]: s });
    }
  };

  if (profile) {
    addScope('batch_id', profile.batch_id || profile.batch);
    addScope('campus_id', profile.campus_id);
    addScope('course_id', profile.course_id || profile.course);
    addScope('branch', profile.branch);
    addScope('roll_number', profile.roll_number || profile.pin_no);
    addScope('pin_no', profile.pin_no || profile.roll_number);
  }

  queries.push(
    { assigned_student_ids: { $in: [userOid, uidStr] } },
    { student_ids: { $in: [userOid, uidStr] } },
  );

  return queries;
}

function activeTestFilter() {
  return {
    status: { $nin: INACTIVE_TEST_STATUSES },
    is_deleted: { $ne: true },
    deleted: { $ne: true },
  };
}

function isInactiveTestDoc(doc) {
  const status = String(doc.status || doc.test_status || '').toLowerCase();
  if (status && INACTIVE_TEST_STATUSES.includes(status)) return true;
  if (doc.is_deleted === true || doc.deleted === true) return true;
  if (doc.is_active === false) return true;
  if (doc.is_published === false) return true;
  return false;
}

function isPracticeOnlyTest(doc) {
  const type = String(doc.test_type || doc.type || '').toLowerCase();
  return type === 'practice';
}

function getTestScheduleBounds(doc) {
  try {
    const nested = doc.schedule || doc.scheduling || doc.time_window;
    const merged =
      nested && typeof nested === 'object' && !Array.isArray(nested)
        ? {
            ...doc,
            start_date: doc.start_date || nested.start_date || nested.start,
            start_time: doc.start_time || nested.start_time || nested.start,
            end_date: doc.end_date || nested.end_date || nested.end,
            end_time: doc.end_time || nested.end_time || nested.end,
            scheduled_at: doc.scheduled_at || nested.scheduled_at,
            due_date: doc.due_date || nested.due_date,
            deadline: doc.deadline || nested.deadline,
          }
        : doc;
    return {
      startIso: resolveVersantScheduleStart(merged),
      endIso: resolveVersantScheduleEnd(merged),
    };
  } catch {
    return {
      startIso: resolveVersantScheduleStart(doc),
      endIso: resolveVersantScheduleEnd(doc),
    };
  }
}

function classifyTestAvailability(doc, now = new Date()) {
  const { startIso, endIso } = getTestScheduleBounds(doc);
  const start = startIso ? new Date(startIso) : null;
  const end = endIso ? new Date(endIso) : null;

  if (end && !Number.isNaN(end.getTime()) && end < now) {
    return { availability: 'expired', status: 'expired', status_label: 'Expired' };
  }
  if (start && !Number.isNaN(start.getTime()) && start > now) {
    return { availability: 'scheduled', status: 'scheduled', status_label: 'Scheduled' };
  }
  return { availability: 'available', status: 'available', status_label: 'Available now' };
}

function isTestStillPending(doc, now = new Date()) {
  const { availability } = classifyTestAvailability(doc, now);
  return availability !== 'expired';
}

function formatPendingStatusLabel(status) {
  const raw = String(status || 'pending').toLowerCase().replace(/_/g, ' ');
  if (raw === 'in progress') return 'In progress';
  if (raw === 'not started') return 'Not started';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatPendingRow(doc, source, overrides = {}) {
  const normalized = normalizeDocument(doc);
  const now = new Date();
  const { startIso: scheduleStart, endIso: scheduleEnd } = getTestScheduleBounds(normalized);
  const startIso =
    overrides.start_time ||
    scheduleStart ||
    resolveVersantSubmittedAt({
      start_time: normalized.start_time,
      created_at: normalized.created_at,
      assigned_at: normalized.assigned_at,
      updated_at: normalized.updated_at,
    });
  const startDisplay = formatSubmittedAtDisplay(startIso);
  const dueIso =
    overrides.due_at ||
    scheduleEnd ||
    resolveVersantSubmittedAt({
      due_date: normalized.due_date,
      due_at: normalized.due_at,
      deadline: normalized.deadline,
      end_date: normalized.end_date,
      end_time: normalized.end_time,
    });
  const dueDisplay = formatSubmittedAtDisplay(dueIso);
  const availabilityInfo =
    overrides.availability && overrides.status
      ? {
          availability: overrides.availability,
          status: overrides.status,
          status_label: overrides.status_label || formatPendingStatusLabel(overrides.status),
        }
      : classifyTestAvailability(normalized, now);
  const status = overrides.status || availabilityInfo.status || normalized.status || 'pending';

  return {
    id: normalized._id != null ? String(normalized._id) : null,
    source,
    test_id: normalized.test_id || normalized._id || null,
    test_name: normalized.test_name || normalized.name || null,
    module_id: normalized.module_id || null,
    subcategory: normalized.subcategory || null,
    test_type: normalized.test_type || normalized.type || null,
    status,
    status_label: overrides.status_label || availabilityInfo.status_label || formatPendingStatusLabel(status),
    availability: availabilityInfo.availability,
    scheduled_at: scheduleStart,
    scheduled_at_display:
      availabilityInfo.availability === 'scheduled' && startDisplay.formatted !== '—'
        ? startDisplay.formatted
        : null,
    start_time: startIso,
    start_at_display:
      availabilityInfo.availability === 'in_progress' && startDisplay.formatted !== '—'
        ? startDisplay.formatted
        : null,
    due_at: dueIso,
    due_at_display: dueDisplay.formatted !== '—' ? dueDisplay.formatted : null,
    can_resume:
      source === 'student_test_attempts' &&
      String(status).toLowerCase().replace(/\s/g, '_') === 'in_progress',
  };
}

function pendingSortKey(row) {
  const order = { scheduled: 0, available: 1, assigned: 2, pending: 3, in_progress: 4 };
  const bucket = order[row.availability] ?? order[row.status] ?? 5;
  const time = row.scheduled_at || row.start_time || row.due_at || '';
  return `${bucket}-${time}`;
}

async function loadVersantStudentProfile(db, userOid) {
  return db.collection('students').findOne({ user_id: userOid });
}

async function fetchAssignmentRecords(db, userOid) {
  const matchOr = buildCoreStudentIdOr(userOid);
  const results = [];

  for (const collName of ASSIGNMENT_COLLECTIONS) {
    try {
      const coll = db.collection(collName);
      const count = await coll.estimatedDocumentCount();
      if (!count) continue;
      const docs = await coll
        .find({ $or: matchOr })
        .sort({ assigned_at: -1, created_at: -1 })
        .limit(50)
        .toArray();
      for (const doc of docs) {
        results.push({ ...doc, _assignmentCollection: collName });
      }
    } catch (err) {
      console.warn(`Versant: skip assignment collection ${collName}:`, err.message);
    }
  }

  return results;
}

async function fetchAssignedOnlineTests(db, userOid, profile, doneTestIds) {
  const scopeQueries = buildScopeTestQueries(userOid, profile);
  const now = new Date();
  const merged = [];
  const seenIds = new Set();

  for (const collName of ['tests', 'online_tests']) {
    try {
      const coll = db.collection(collName);
      if ((await coll.estimatedDocumentCount()) === 0) continue;

      for (const scopeQuery of scopeQueries) {
        let docs = [];
        try {
          docs = await coll
            .find({ $and: [scopeQuery, activeTestFilter()] })
            .sort({ created_at: -1, _id: -1 })
            .limit(40)
            .toArray();
        } catch (err) {
          console.warn(`Versant: tests query failed (${collName}):`, err.message);
          continue;
        }

        for (const doc of docs) {
          const tid = doc._id?.toString();
          if (!tid || seenIds.has(tid)) continue;
          seenIds.add(tid);
          merged.push(doc);
        }
        if (merged.length >= 80) break;
      }
      if (merged.length >= 80) break;
    } catch (err) {
      console.warn(`Versant: skip tests collection ${collName}:`, err.message);
    }
  }

  return merged.filter((raw) => {
    const test = normalizeDocument(raw);
    const tid = test._id?.toString();
    if (!tid || doneTestIds.has(tid)) return false;
    if (isInactiveTestDoc(test)) return false;
    if (isPracticeOnlyTest(test)) return false;
    return isTestStillPending(test, now);
  });
}

/**
 * Tests not yet completed: in-progress attempts, assignments, and scheduled/available online tests.
 */
async function fetchPendingTestsForStudent(db, studentUserId, sdms = null) {
  try {
    const oid = toObjectIdSafe(studentUserId);
    if (!oid) return [];

    const versantProfile = normalizeDocument(await loadVersantStudentProfile(db, oid)) || {};
    const profile = {
      ...versantProfile,
      roll_number: versantProfile.roll_number || sdms?.pinNo,
      pin_no: versantProfile.pin_no || sdms?.pinNo,
      admission_number: versantProfile.admission_number || sdms?.admissionNumber,
      admission_no: versantProfile.admission_no || sdms?.admissionNo,
      batch_id: versantProfile.batch_id || sdms?.batch,
      batch: versantProfile.batch || sdms?.batch,
      course_id: versantProfile.course_id || sdms?.course,
      course: versantProfile.course || sdms?.course,
      branch: versantProfile.branch || sdms?.branch,
    };

    const studentIdMatch = buildStudentIdMatch(oid);

    const [attempts, completedTestIds, completedAttemptTestIds, assignments, assignedOnlineTests] =
      await Promise.all([
        db
          .collection('student_test_attempts')
          .find({
            student_id: studentIdMatch,
            status: { $nin: COMPLETED_ATTEMPT_STATUSES },
          })
          .sort({ updated_at: -1, _id: -1 })
          .limit(50)
          .toArray(),
        db.collection('test_results').distinct('test_id', { student_id: studentIdMatch }),
        db
          .collection('student_test_attempts')
          .find({
            student_id: studentIdMatch,
            status: { $in: ['completed', 'complete'] },
          })
          .project({ test_id: 1 })
          .limit(500)
          .toArray(),
        fetchAssignmentRecords(db, oid),
        fetchAssignedOnlineTests(db, oid, profile, new Set()),
      ]);

  const doneTestIds = new Set([
    ...completedTestIds.map((id) => id.toString()),
    ...completedAttemptTestIds.map((a) => a.test_id?.toString()).filter(Boolean),
  ]);

  const filteredAssignments = assignments.filter((a) => {
    const tid = a.test_id?.toString();
    if (!tid || doneTestIds.has(tid)) return false;
    const st = String(a.status || 'pending').toLowerCase();
    return !COMPLETED_ATTEMPT_STATUSES.includes(st);
  });

  const filteredOnlineTests = assignedOnlineTests.filter((t) => !doneTestIds.has(t._id.toString()));

  const testIds = uniqueObjectIds([
    ...attempts.map((a) => a.test_id),
    ...filteredAssignments.map((a) => a.test_id),
    ...filteredOnlineTests.map((t) => t._id),
  ]);

  const tests =
    testIds.length > 0
      ? await db
          .collection('tests')
          .find({ _id: { $in: testIds } })
          .toArray()
      : [];
  const testMap = new Map(tests.map((t) => [t._id.toString(), normalizeDocument(t)]));

  const seen = new Set();
  const pending = [];

  for (const attempt of attempts) {
    const tid = attempt.test_id?.toString();
    if (!tid || seen.has(tid)) continue;
    seen.add(tid);
    const test = testMap.get(tid) || {};
    const attemptStatus = String(attempt.status || 'in_progress').toLowerCase().replace(/\s/g, '_');
    pending.push(
      formatPendingRow(
        {
          ...normalizeDocument(attempt),
          test_name: test.name || attempt.test_name,
          module_id: attempt.module_id || test.module_id,
          test_type: attempt.test_type || test.test_type,
          subcategory: attempt.subcategory || test.subcategory,
        },
        'student_test_attempts',
        {
          availability: 'in_progress',
          status: attemptStatus,
          status_label: formatPendingStatusLabel(attemptStatus),
        },
      ),
    );
  }

  for (const assign of filteredAssignments) {
    const tid = assign.test_id?.toString();
    if (!tid || seen.has(tid)) continue;
    seen.add(tid);
    const test = testMap.get(tid) || {};
    const source = assign._assignmentCollection || 'student_test_assignments';
    pending.push(
      formatPendingRow(
        {
          ...normalizeDocument(assign),
          test_name: test.name || assign.test_name,
          module_id: assign.module_id || test.module_id,
          test_type: assign.test_type || test.test_type,
          subcategory: assign.subcategory || test.subcategory,
          status: assign.status || 'assigned',
        },
        source,
        {
          availability: 'assigned',
          status: assign.status || 'assigned',
          status_label: formatPendingStatusLabel(assign.status || 'assigned'),
        },
      ),
    );
  }

  for (const testDoc of filteredOnlineTests) {
    const tid = testDoc._id?.toString();
    if (!tid || seen.has(tid)) continue;
    seen.add(tid);
    const normalized = normalizeDocument(testDoc);
    const availabilityInfo = classifyTestAvailability(normalized);
    pending.push(formatPendingRow(normalized, 'tests', availabilityInfo));
  }

    pending.sort((a, b) => pendingSortKey(a).localeCompare(pendingSortKey(b)));
    return pending;
  } catch (err) {
    console.error('Versant fetchPendingTestsForStudent error:', err);
    return [];
  }
}

/**
 * List student test results from AI-VERSANT MongoDB.
 */
async function getStudentTestResults(filters = {}) {
  const db = await getVersantDb();
  const page = Math.max(1, parseInt(filters.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(filters.limit, 10) || DEFAULT_LIMIT),
  );

  const hasStudentFilter =
    filters.studentUserId ||
    filters.rollNumber ||
    filters.pinNo ||
    filters.admissionNumber;

  const versantMatch = hasStudentFilter
    ? await resolveStudentUserIdFromFilters(db, filters)
    : null;
  const studentUserId = versantMatch?.userId || null;

  if (hasStudentFilter && !studentUserId) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      source: 'none',
      linked: false,
      message:
        'No AI-VERSANT profile found for this roll / PIN / admission number. Ensure the student PIN in SDMS matches their VERSANT roll number.',
    };
  }

  const testIds = await findTestIdsByName(db, filters.testName);
  if (filters.testName && testIds?.length === 0) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      source: 'test_results',
    };
  }

  const match = buildMatchStage({
    studentUserId,
    testType: filters.testType,
    moduleId: filters.moduleId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    testIds,
  });

  let { rows, total } = await aggregateTestResults(db, match, {
    page,
    limit,
    includeResults: false,
    testName: filters.testName,
  });
  let source = 'test_results';

  if (total === 0 && studentUserId) {
    const fallback = await fetchCompletedAttempts(db, match, {
      page,
      limit,
      testName: filters.testName,
    });
    rows = fallback.rows;
    total = fallback.total;
    source = 'student_test_attempts';
  }

  const data = rows.map((r) => formatResultRow(r, source));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    },
    source,
    linked: Boolean(studentUserId),
    versantMatch: versantMatch
      ? {
          matchField: versantMatch.matchField,
          roll: versantMatch.versantRoll,
          pin: versantMatch.versantPin,
          admission: versantMatch.versantAdmission,
        }
      : null,
  };
}

/**
 * Logged-in SDMS student: resolve PIN/admission → AI-VERSANT user → test results.
 */
async function getMyStudentTestResults(sdmsContext, filters = {}) {
  const sdms = await resolveSdmsStudentIdentifiers(sdmsContext);
  if (!sdms) {
    return {
      data: [],
      pending: [],
      pending_count: 0,
      pagination: { page: 1, limit: DEFAULT_LIMIT, total: 0, totalPages: 0 },
      source: 'none',
      linked: false,
      message: 'Student record not found in SDMS',
      sdms: null,
    };
  }

  const db = await getVersantDb();
  const versantMatch = await findVersantStudentUserId(db, sdms.searchKeys);

  if (!versantMatch) {
    return {
      data: [],
      pending: [],
      pending_count: 0,
      pagination: { page: 1, limit: DEFAULT_LIMIT, total: 0, totalPages: 0 },
      source: 'none',
      linked: false,
      message:
        'No CRT training profile found for your PIN or admission number. Your portal PIN/roll should match your CRT login (e.g. 246T1A0301).',
      sdms: {
        admission_number: sdms.admissionNumber,
        pin_no: sdms.pinNo,
        login_username: sdms.loginUsername,
        tried_keys: sdms.searchKeys,
      },
    };
  }

  const versantUserId = toObjectIdSafe(versantMatch.userId) || versantMatch.userId;

  const [result, pending] = await Promise.all([
    getStudentTestResults({
      ...filters,
      studentUserId: versantUserId,
      rollNumber: '',
      pinNo: '',
      admissionNumber: '',
    }),
    fetchPendingTestsForStudent(db, versantUserId, sdms),
  ]);

  return {
    ...result,
    pending,
    pending_count: pending.length,
    linked: true,
    sdms: {
      admission_number: sdms.admissionNumber,
      pin_no: sdms.pinNo,
      login_username: sdms.loginUsername,
      student_name: sdms.studentName,
    },
    versantMatch: {
      matchField: versantMatch.matchField,
      roll: versantMatch.versantRoll,
      pin: versantMatch.versantPin,
      admission: versantMatch.versantAdmission,
    },
  };
}

/**
 * Single result with question-level details.
 */
function belongsToStudent(record, studentUserId) {
  if (!studentUserId || !record?.student_id) return true;
  return String(record.student_id) === String(studentUserId);
}

async function getTestResultById(id, { source, studentUserId } = {}) {
  const db = await getVersantDb();
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const oid = new ObjectId(id);

  if (source === 'student_test_attempts') {
    const doc = await db.collection('student_test_attempts').findOne({ _id: oid });
    if (!doc) return null;
    if (studentUserId && String(doc.student_id) !== String(studentUserId)) return null;
    const { rows } = await enrichAttempts(db, [doc]);
    const row = rows[0];
    const formatted = {
      ...formatResultRow(row, 'student_test_attempts'),
      results: normalizeDocument(row.results) || [],
    };
    return belongsToStudent(formatted, studentUserId) ? formatted : null;
  }

  const pipeline = [
    { $match: { _id: oid } },
    ...getLookupStages(),
    getProjectStage(),
  ];
  const [doc] = await db
    .collection('test_results')
    .aggregate(pipeline, AGGREGATE_OPTS)
    .toArray();
  if (doc) {
    const normalized = normalizeDocument(doc);
    const formatted = {
      ...formatResultRow(normalized, 'test_results'),
      results: normalized.results || [],
    };
    return belongsToStudent(formatted, studentUserId) ? formatted : null;
  }

  const attempt = await db.collection('student_test_attempts').findOne({
    _id: oid,
    status: 'completed',
  });
  if (!attempt) return null;
  if (studentUserId && String(attempt.student_id) !== String(studentUserId)) return null;
  const { rows } = await enrichAttempts(db, [attempt]);
  const row = rows[0];
  const formatted = {
    ...formatResultRow(row, 'student_test_attempts'),
    results: normalizeDocument(row.results) || [],
  };
  return belongsToStudent(formatted, studentUserId) ? formatted : null;
}

async function resolveVersantUserIdForSdmsStudent(sdmsContext) {
  const sdms = await resolveSdmsStudentIdentifiers(sdmsContext);
  if (!sdms) return { sdms: null, versantMatch: null };
  const db = await getVersantDb();
  const versantMatch = await findVersantStudentUserId(db, sdms.searchKeys);
  return { sdms, versantMatch };
}

async function enrichAttempts(db, attempts) {
  const studentIds = [...new Set(attempts.map((a) => a.student_id?.toString()).filter(Boolean))];
  const testIds = [...new Set(attempts.map((a) => a.test_id?.toString()).filter(Boolean))];

  const [students, users, tests] = await Promise.all([
    db
      .collection('students')
      .find({ user_id: { $in: studentIds.map((id) => new ObjectId(id)) } })
      .toArray(),
    db
      .collection('users')
      .find({ _id: { $in: studentIds.map((id) => new ObjectId(id)) } })
      .toArray(),
    db
      .collection('tests')
      .find({ _id: { $in: testIds.map((id) => new ObjectId(id)) } })
      .toArray(),
  ]);

  const studentMap = new Map(students.map((s) => [s.user_id?.toString(), s]));
  const userMap = new Map(users.map((u) => [u._id?.toString(), u]));
  const testMap = new Map(tests.map((t) => [t._id?.toString(), t]));

  return {
    rows: attempts.map((a) => mapAttemptToResultShape(a, testMap, studentMap, userMap)),
  };
}

async function getFilterOptions() {
  const db = await getVersantDb();
  const [modules, testTypes, testNames] = await Promise.all([
    db.collection('test_results').distinct('module_id'),
    db.collection('test_results').distinct('test_type'),
    db
      .collection('tests')
      .find({}, { projection: { name: 1 } })
      .sort({ name: 1 })
      .limit(300)
      .toArray(),
  ]);

  return {
    modules: modules.filter(Boolean).sort(),
    testTypes: testTypes.filter(Boolean).sort(),
    tests: testNames.map((t) => ({ id: t._id.toString(), name: t.name })),
  };
}

async function exportStudentTestResults(filters = {}) {
  const all = await getStudentTestResults({
    ...filters,
    page: 1,
    limit: MAX_LIMIT,
  });

  let data = all.data;
  if (all.pagination.total > MAX_LIMIT) {
    const db = await getVersantDb();
    const matchResult = await resolveStudentUserIdFromFilters(db, filters);
    const studentUserId = matchResult?.userId || null;
    const testIds = await findTestIdsByName(db, filters.testName);
    const match = buildMatchStage({
      studentUserId,
      testType: filters.testType,
      moduleId: filters.moduleId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      testIds,
    });
    const pipeline = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });
    pipeline.push(
      { $unset: 'results' },
      { $sort: { submitted_at: -1 } },
      { $limit: MAX_LIMIT },
      ...getLookupStages(),
      getProjectStage({ includeResults: false }),
    );
    const rows = await db
      .collection('test_results')
      .aggregate(pipeline, AGGREGATE_OPTS)
      .toArray();
    data = rows.map((r) => formatResultRow(r, 'test_results'));
  }

  return data;
}

module.exports = {
  getStudentTestResults,
  getMyStudentTestResults,
  getTestResultById,
  getFilterOptions,
  exportStudentTestResults,
  resolveSdmsStudentIdentifiers,
  findVersantStudentUserId,
  resolveVersantUserIdForSdmsStudent,
};
