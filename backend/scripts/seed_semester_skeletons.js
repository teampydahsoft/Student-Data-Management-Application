/**
 * Seed semester skeleton rows for all current batches.
 * Creates academic_years (session labels) and semesters with NULL start/end dates
 * so batch → academic-year mappings are available before dates are configured.
 *
 * Usage: node scripts/seed_semester_skeletons.js
 */
require('dotenv').config();
const { masterPool } = require('../config/database');

const isSessionRangeLabel = (label) => /^\d{4}-\d{2,4}$/.test(String(label || '').trim());

const normalizeBatchValue = (value) => {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str || str === '[object Object]') return null;
  return str;
};

const deriveAcademicYearLabel = (batch, yearOfStudy) => {
  const batchYear = parseInt(batch, 10);
  const year = parseInt(yearOfStudy, 10);
  if (!batchYear || !year || year < 1) return null;
  const startYear = batchYear + year - 1;
  return `${startYear}-${startYear + 1}`;
};

const parseYearSemesterConfig = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return Array.isArray(raw) ? raw : null;
};

const getSemestersPerYear = (course, yearOfStudy) => {
  const config = parseYearSemesterConfig(course.year_semester_config);
  if (config) {
    const yearConfig = config.find((y) => Number(y.year) === yearOfStudy);
    if (yearConfig?.semesters) return Number(yearConfig.semesters);
  }
  return Number(course.semesters_per_year) || 2;
};

const findOrCreateAcademicYear = async (yearLabel) => {
  const label = String(yearLabel || '').trim();
  if (!label) return null;

  const [existing] = await masterPool.query(
    'SELECT id FROM academic_years WHERE year_label = ?',
    [label]
  );
  if (existing.length > 0) return existing[0].id;

  const [result] = await masterPool.query(
    `INSERT INTO academic_years (year_label, start_date, end_date, is_active)
     VALUES (?, NULL, NULL, 1)`,
    [label]
  );
  return result.insertId;
};

const semesterExists = async ({ collegeId, courseId, batch, yearOfStudy, semesterNumber }) => {
  const [rows] = await masterPool.query(
    `SELECT id FROM semesters
     WHERE (college_id <=> ?)
       AND course_id = ?
       AND batch = ?
       AND year_of_study = ?
       AND semester_number = ?
     LIMIT 1`,
    [collegeId, courseId, batch, yearOfStudy, semesterNumber]
  );
  return rows.length > 0;
};

const collectBatches = async () => {
  const batchSet = new Set();

  const [studentRows] = await masterPool.query(
    `SELECT DISTINCT batch FROM students
     WHERE batch IS NOT NULL AND TRIM(batch) <> ''
     ORDER BY batch DESC`
  );
  studentRows.forEach((row) => {
    const label = normalizeBatchValue(row.batch);
    if (label && !isSessionRangeLabel(label)) batchSet.add(label);
  });

  const [yearRows] = await masterPool.query(
    `SELECT year_label FROM academic_years
     WHERE is_active = 1 OR is_active IS NULL`
  );
  yearRows.forEach((row) => {
    const label = normalizeBatchValue(row.year_label);
    if (label && !isSessionRangeLabel(label)) batchSet.add(label);
  });

  const [semesterBatchRows] = await masterPool.query(
    `SELECT DISTINCT batch FROM semesters
     WHERE batch IS NOT NULL AND TRIM(batch) <> ''`
  );
  semesterBatchRows.forEach((row) => {
    const label = normalizeBatchValue(row.batch);
    if (label && !isSessionRangeLabel(label)) batchSet.add(label);
  });

  return Array.from(batchSet).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
    return b.localeCompare(a);
  });
};

const seedSemesterSkeletons = async () => {
  console.log('Seeding semester skeletons (NULL start/end dates)...\n');

  const batches = await collectBatches();
  if (batches.length === 0) {
    console.log('No batches found. Nothing to seed.');
    return;
  }

  const [courses] = await masterPool.query(
    `SELECT id, name, total_years, semesters_per_year, year_semester_config
     FROM courses
     ORDER BY name ASC`
  );

  if (courses.length === 0) {
    console.log('No courses found. Nothing to seed.');
    return;
  }

  console.log(`Batches (${batches.length}): ${batches.join(', ')}`);
  console.log(`Courses (${courses.length}): ${courses.map((c) => c.name).join(', ')}\n`);

  let academicYearsCreated = 0;
  let semestersCreated = 0;
  let semestersSkipped = 0;

  for (const batch of batches) {
    for (const course of courses) {
      const totalYears = Number(course.total_years) || 4;

      for (let yearOfStudy = 1; yearOfStudy <= totalYears; yearOfStudy += 1) {
        const semesterCount = getSemestersPerYear(course, yearOfStudy);
        const academicYearLabel = deriveAcademicYearLabel(batch, yearOfStudy);
        if (!academicYearLabel) continue;

        const [existingAy] = await masterPool.query(
          'SELECT id FROM academic_years WHERE year_label = ?',
          [academicYearLabel]
        );
        const academicYearId = await findOrCreateAcademicYear(academicYearLabel);
        if (existingAy.length === 0) academicYearsCreated += 1;

        for (let semesterNumber = 1; semesterNumber <= semesterCount; semesterNumber += 1) {
          const exists = await semesterExists({
            collegeId: null,
            courseId: course.id,
            batch,
            yearOfStudy,
            semesterNumber
          });

          if (exists) {
            semestersSkipped += 1;
            continue;
          }

          await masterPool.query(
            `INSERT INTO semesters
             (college_id, course_id, academic_year_id, year_of_study, batch, semester_number, start_date, end_date)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
            [null, course.id, academicYearId, yearOfStudy, batch, semesterNumber]
          );
          semestersCreated += 1;
        }
      }
    }
  }

  console.log('Done.');
  console.log(`  Academic years created: ${academicYearsCreated}`);
  console.log(`  Semester skeletons created: ${semestersCreated}`);
  console.log(`  Semester rows skipped (already exist): ${semestersSkipped}`);
};

seedSemesterSkeletons()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
