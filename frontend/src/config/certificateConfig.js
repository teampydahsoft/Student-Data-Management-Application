export const certificateConfig = {
  diploma: [
    { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
    { id: '10th_study', name: '10th Study Certificate', required: true }
  ],
  ug: [
    { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
    { id: '10th_study', name: '10th Study Certificate', required: true },
    { id: 'inter_diploma_tc', name: 'Inter/Diploma TC (Transfer Certificate)', required: true },
    { id: 'inter_diploma_study', name: 'Inter/Diploma Study Certificate', required: true }
  ],
  pg: [
    { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
    { id: '10th_study', name: '10th Study Certificate', required: true },
    { id: 'inter_diploma_tc', name: 'Inter/Diploma TC (Transfer Certificate)', required: true },
    { id: 'inter_diploma_study', name: 'Inter/Diploma Study Certificate', required: true },
    { id: 'ug_study', name: 'UG Study Certificate', required: true },
    { id: 'ug_tc', name: 'UG TC (Transfer Certificate)', required: true },
    { id: 'ug_pc', name: 'UG PC (Provisional Certificate)', required: true },
    { id: 'ug_cmm', name: 'UG CMM (Consolidated Marks Memo)', required: true },
    { id: 'ug_od', name: 'UG OD (Original Degree)', required: true }
  ]
};

export const getCourseType = (courseNameRaw) => {
  const courseName = (courseNameRaw || '').toLowerCase();
  if (!courseName) return null;

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
