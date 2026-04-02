export const certificateConfig = {
  diploma: [
    { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
    { id: '10th_study', name: '10th Study Certificate', required: true },
    { id: '10th_cert', name: '10th Certificate', required: true }
  ],
  ug: [
    { id: 'inter_diploma_study', name: '10th/Inter/ Diploma Study Certificate', required: true },
    { id: 'inter_diploma_tc', name: 'Inter/Diploma TC (Transfer Certificate)', required: true },
    { id: 'inter_diploma_cert', name: 'Inter/Diploma certificate', required: true },
    { id: '10th_original', name: '10 Original Certificate', required: true }
  ],
  pg: [
    { id: 'ug_study', name: 'UG Study Certificate', required: false },
    { id: 'ug_tc', name: 'UG TC (Transfer Certificate)', required: true },
    { id: 'ug_cert', name: 'UG (Certificate)', required: true },
    { id: 'ug_cmm', name: 'UG CMM (Consolidated Marks Memo)', required: true },
    { id: '10th_original', name: '10 original Certificate', required: true },
    { id: 'inter_diploma_original', name: 'Inter/Diploma Original Certificate', required: true }
  ]
};

export const getCourseType = (course) => {
  // If passed an object with a level property, use that (new reliable method)
  if (typeof course === 'object' && course !== null && course.level) {
    const levelStr = String(course.level).toLowerCase();
    if (levelStr === 'diploma') return 'Diploma';
    if (levelStr === 'pg') return 'PG';
    return 'UG';
  }

  // If passed a string that is exactly a level, use it
  if (typeof course === 'string') {
    const s = course.toLowerCase();
    if (s === 'diploma') return 'Diploma';
    if (s === 'pg') return 'PG';
    if (s === 'ug') return 'UG';
  }

  // Fallback to legacy string matching
  const courseStr = typeof course === 'string' ? course : (course?.name || '');
  if (!courseStr) return null;

  const courseName = courseStr.toLowerCase();
  if (courseName.includes('diploma')) {
    return 'Diploma';
  }

  if (
    courseName.includes('pg') ||
    courseName.includes('post graduate') ||
    courseName.includes('m.tech') ||
    courseName.includes('mtech') ||
    courseName.includes('mba') ||
    courseName.includes('mca') ||
    courseName.includes('msc') ||
    courseName.includes('m sc') ||
    courseName.includes('aqua') ||
    courseName.includes('m.pharma') ||
    courseName.includes('m pharma') ||
    (courseName.includes('pharma') && (courseName.includes('m') || courseName.startsWith('pharma')))
  ) {
    return 'PG';
  }

  return 'UG';
};

export const getCertificatesForCourse = (courseType) => {
  const type = courseType?.toLowerCase();
  if (type === 'diploma') {
    return certificateConfig.diploma.map(c => ({ key: c.id, label: c.name }));
  } else if (type === 'ug') {
    return certificateConfig.ug.map(c => ({ key: c.id, label: c.name }));
  } else if (type === 'pg') {
    return certificateConfig.pg.map(c => ({ key: c.id, label: c.name }));
  }
  return [];
};
