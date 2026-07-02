import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Loader2, AlertTriangle, GraduationCap, History, X } from 'lucide-react';
import api from '../../config/api';
import LoadingAnimation from '../LoadingAnimation';
import toast from 'react-hot-toast';

import {
  SCHOLARSHIP_STATUS_DROPDOWN_OPTIONS,
  isScholarshipQuotaLocked,
  formatScholarshipStatusDisplay,
  normalizeScholarshipStatusValue,
  getAcademicYearLabel,
  getScholarshipStatusDropdownLabel,
  SCHOLARSHIP_APPLICATION_ID_LENGTH,
  SCHOLARSHIP_MAX_AMOUNT,
  normalizeApplicationIdInput,
  normalizeScholarshipAmountInput,
  isValidApplicationId,
  isValidScholarshipAmount,
  parseScholarshipAmount,
  formatScholarshipAmountForInput,
  RTF_RELEASED_DATE_MIN,
  RTF_RELEASED_DATE_MAX,
  normalizeRtfReleasedDateForInput,
  isValidRtfReleasedDate
} from '../../config/scholarshipConfig';

const ELIGIBLE_OPTIONS = SCHOLARSHIP_STATUS_DROPDOWN_OPTIONS;

const buildDefaultSemesters = (semestersPerYear = 2, eligible = '') => (
  Array.from({ length: Math.max(1, semestersPerYear) }, (_, index) => ({
    student_semester: index + 1,
    eligible,
    remark: ''
  }))
);

const normalizeYearFromApi = (year, payload, student, remarkMap = {}) => {
  const semestersPerYear = payload?.semestersPerYear || 2;
  const semesters = Array.isArray(year.semesters) && year.semesters.length
    ? year.semesters
    : buildDefaultSemesters(semestersPerYear, year.eligible || '');

  const normalizedSemesters = buildDefaultSemesters(semestersPerYear).map((semester) => {
    const existing = semesters.find(
      (entry) => Number(entry.student_semester) === semester.student_semester
    );
    const remark = remarkMap[remarkKey(year.student_year, semester.student_semester)]
      || existing?.remark
      || '';
    return {
      ...(existing || semester),
      student_semester: semester.student_semester,
      remark
    };
  });

  return {
    ...year,
    sanctioned_amount: formatScholarshipAmountForInput(year.sanctioned_amount),
    semesters: normalizedSemesters,
    releases: mapReleasesFromApi(
      year.releases,
      year.academic_year_label || getAcademicYearLabel(payload, year.student_year, student)
    )
  };
};

const emptyRelease = () => ({
  id: null,
  academic_year: '',
  rtf_released_date: '',
  released_amount: ''
});

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
}).format(Number(amount) || 0);

const parseAmount = (value) => parseScholarshipAmount(value);

const sumReleased = (releases = []) => releases.reduce((sum, row) => sum + parseAmount(row.released_amount), 0);

const normalizeDateForInput = (value) => normalizeRtfReleasedDateForInput(value);

const formatCalendarDate = (value) => {
  const normalized = normalizeRtfReleasedDateForInput(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
};

const mapReleasesFromApi = (releases = [], academicYearLabel = '') => (
  (releases.length ? releases : [emptyRelease()]).map((release) => ({
    ...release,
    academic_year: release.academic_year || academicYearLabel || '',
    rtf_released_date: normalizeRtfReleasedDateForInput(
      release.rtf_released_date || release.rtf_date || release.from_date
    ),
    released_amount: (() => {
      const normalized = formatScholarshipAmountForInput(release.released_amount);
      return normalized === '' || normalized === '0' ? '' : normalized;
    })()
  }))
);

const formatArchivedAt = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const remarkKey = (studentYear, studentSemester) => `${studentYear}-${studentSemester}`;

const buildScholarshipRemarkMap = (remarks = []) => {
  const map = {};
  remarks
    .filter((entry) => String(entry.remark_category || '').trim().toLowerCase() === 'scholarship')
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .forEach((entry) => {
      const studentYear = Number(entry.student_year);
      const studentSemester = Number(entry.student_semester);
      if (!studentYear || !studentSemester) return;
      const key = remarkKey(studentYear, studentSemester);
      if (!map[key]) map[key] = entry.remark;
    });
  return map;
};

const isYearScholarshipEligible = (year) => (
  (year?.semesters || []).some(
    (semester) => normalizeScholarshipStatusValue(semester.eligible) === 'eligible'
  )
);

const YearHistoryModal = ({ year, entries, student, meta, onClose }) => {
  if (!year) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-amber-50/70">
          <div>
            <h4 className="text-sm font-bold text-gray-900">Year {year} Scholarship History</h4>
            <p className="text-[11px] text-gray-500 mt-0.5">Archived records before overwrite</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white text-gray-500"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No archived history for Year {year} yet.</p>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => {
                const snapshot = entry.snapshot || {};
                const releases = Array.isArray(snapshot.releases) ? snapshot.releases : [];
                return (
                  <div key={entry.id} className="rounded-xl border border-gray-100 p-4 bg-gray-50/40">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <p className="text-sm font-bold text-gray-900 text-center w-full sm:w-auto sm:text-left">
                        Year {entry.academic_year}
                        {entry.scholar_status ? (
                          <span className="ml-2 text-indigo-700">
                            {formatScholarshipStatusDisplay(entry.scholar_status)}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-gray-500 w-full text-center sm:w-auto sm:text-right">
                        {formatArchivedAt(entry.archived_at)}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="text-center sm:text-left">
                        <p className="text-[10px] uppercase text-gray-400 font-bold">Application ID</p>
                        <p className="text-gray-800">{snapshot.application_id || '—'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase text-gray-400 font-bold">Sanctioned</p>
                        <p className="text-gray-800">{formatCurrency(snapshot.sanctioned_amount)}</p>
                      </div>
                      <div className="text-center sm:text-right">
                        <p className="text-[10px] uppercase text-gray-400 font-bold">Released</p>
                        <p className="text-gray-800">{formatCurrency(snapshot.released_amount)}</p>
                      </div>
                    </div>
                    {Array.isArray(snapshot.semesters) && snapshot.semesters.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        {snapshot.semesters.map((semester) => (
                          <div key={`${entry.id}-sem-${semester.student_semester}`} className="text-center sm:text-left">
                            <p className="text-[10px] uppercase text-gray-400 font-bold">
                              Sem {semester.student_semester}
                            </p>
                            <p className="text-gray-800">{formatScholarshipStatusDisplay(semester.eligible)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {releases.length > 0 && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                              <th className="px-2 py-1">Academic Year</th>
                              <th className="px-2 py-1">RTF Emitted</th>
                              <th className="px-2 py-1 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {releases.map((release, index) => (
                              <tr key={`${entry.id}-release-${index}`}>
                                <td className="px-2 py-1">
                                  {release.academic_year || getAcademicYearLabel(meta, entry.academic_year, student)}
                                </td>
                                <td className="px-2 py-1">
                                  {formatCalendarDate(release.rtf_released_date || release.rtf_date || release.from_date) || '—'}
                                </td>
                                <td className="px-2 py-1 text-right">{formatCurrency(release.released_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StudentScholarshipHistoryTab = ({ student, readOnly = false, onUpdated }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [years, setYears] = useState([]);
  const [meta, setMeta] = useState(null);
  const [scholarshipRemarks, setScholarshipRemarks] = useState([]);
  const [historyYear, setHistoryYear] = useState(null);
  const [remoteAppIdStatus, setRemoteAppIdStatus] = useState({});
  const remoteAppIdTimersRef = useRef({});

  const admissionNumber = student?.admission_number || student?.admissionNumber;
  const quotaLocked = isScholarshipQuotaLocked(student, meta);
  const isEditingDisabled = readOnly || quotaLocked;

  const fetchScholarshipRemarks = useCallback(async () => {
    if (!admissionNumber) return { map: {}, list: [] };
    try {
      const response = await api.get(`/student-history/remarks/${encodeURIComponent(admissionNumber)}`);
      if (response.data.success) {
        const list = (response.data.data || []).filter(
          (entry) => String(entry.remark_category || '').trim().toLowerCase() === 'scholarship'
        );
        return { map: buildScholarshipRemarkMap(response.data.data || []), list };
      }
    } catch (error) {
      console.error('Scholarship remarks fetch error:', error);
    }
    return { map: {}, list: [] };
  }, [admissionNumber]);

  const fetchScholarship = useCallback(async () => {
    if (!admissionNumber) return;

    setLoading(true);
    try {
      const [scholarshipResponse, remarkData] = await Promise.all([
        api.get(`/student-scholarship/${encodeURIComponent(admissionNumber)}`),
        fetchScholarshipRemarks()
      ]);

      if (scholarshipResponse.data.success) {
        const payload = scholarshipResponse.data.data;
        setMeta(payload);
        setScholarshipRemarks(remarkData.list);
        setYears(
          (payload.years || []).map((year) => normalizeYearFromApi(year, payload, student, remarkData.map))
        );
      } else {
        toast.error(scholarshipResponse.data.message || 'Failed to load scholarship history');
      }
    } catch (error) {
      console.error('Scholarship fetch error:', error);
      toast.error('Failed to load scholarship history');
    } finally {
      setLoading(false);
    }
  }, [admissionNumber, fetchScholarshipRemarks, student]);

  useEffect(() => {
    fetchScholarship();
  }, [fetchScholarship]);

  const summaryYears = useMemo(
    () => years.map((year) => ({
      ...year,
      released_amount: isYearScholarshipEligible(year) ? sumReleased(year.releases) : 0,
      releasesEligible: isYearScholarshipEligible(year)
    })),
    [years]
  );

  const releaseTransactionYears = useMemo(
    () => years.filter((year) => isYearScholarshipEligible(year)),
    [years]
  );

  const scheduleApplicationIdCheck = useCallback((studentYear, appId) => {
    if (remoteAppIdTimersRef.current[studentYear]) {
      clearTimeout(remoteAppIdTimersRef.current[studentYear]);
    }

    if (!appId || appId.length !== SCHOLARSHIP_APPLICATION_ID_LENGTH || !admissionNumber) {
      setRemoteAppIdStatus((prev) => {
        if (!prev[studentYear]) return prev;
        const next = { ...prev };
        delete next[studentYear];
        return next;
      });
      return;
    }

    remoteAppIdTimersRef.current[studentYear] = setTimeout(async () => {
      setRemoteAppIdStatus((prev) => ({ ...prev, [studentYear]: { loading: true } }));
      try {
        const response = await api.get('/student-scholarship/check-application-id', {
          params: {
            application_id: appId,
            admission_number: admissionNumber,
            student_year: studentYear
          }
        });
        if (response.data?.success) {
          setRemoteAppIdStatus((prev) => ({
            ...prev,
            [studentYear]: {
              loading: false,
              available: response.data.available,
              message: response.data.message,
              conflict: response.data.conflict || null
            }
          }));
        }
      } catch (error) {
        console.error('Application ID check error:', error);
        setRemoteAppIdStatus((prev) => ({
          ...prev,
          [studentYear]: {
            loading: false,
            available: false,
            message: 'Could not verify application number'
          }
        }));
      }
    }, 400);
  }, [admissionNumber]);

  const applicationIdFeedbackByYear = useMemo(() => {
    const feedback = {};
    const idToYears = new Map();

    years.forEach((year) => {
      const studentYear = year.student_year;
      const appId = normalizeApplicationIdInput(year.application_id);

      if (!appId) {
        feedback[studentYear] = null;
        return;
      }

      if (appId.length < SCHOLARSHIP_APPLICATION_ID_LENGTH) {
        feedback[studentYear] = {
          type: 'warning',
          message: `${SCHOLARSHIP_APPLICATION_ID_LENGTH - appId.length} more digit(s) required`
        };
        return;
      }

      if (!idToYears.has(appId)) idToYears.set(appId, []);
      idToYears.get(appId).push(studentYear);
    });

    idToYears.forEach((yearList) => {
      if (yearList.length > 1) {
        yearList.forEach((studentYear) => {
          const otherYears = yearList.filter((year) => year !== studentYear);
          feedback[studentYear] = {
            type: 'error',
            message: `Already entered for Year ${otherYears.join(', Year ')}`
          };
        });
      }
    });

    years.forEach((year) => {
      const studentYear = year.student_year;
      const appId = normalizeApplicationIdInput(year.application_id);
      if (!appId || appId.length !== SCHOLARSHIP_APPLICATION_ID_LENGTH) return;
      if (feedback[studentYear]?.type === 'error') return;

      const remote = remoteAppIdStatus[studentYear];
      if (!remote) return;

      if (remote.loading) {
        feedback[studentYear] = { type: 'checking', message: 'Checking availability...' };
        return;
      }

      if (!remote.available) {
        const conflict = remote.conflict;
        const conflictLabel = conflict?.student_name || conflict?.admission_number || 'another student';
        feedback[studentYear] = {
          type: 'error',
          message: conflict
            ? `Already used by ${conflictLabel} (Year ${conflict.student_year})`
            : (remote.message || 'Application number already exists')
        };
        return;
      }

      feedback[studentYear] = {
        type: 'success',
        message: remote.message || 'Application number is available'
      };
    });

    return feedback;
  }, [years, remoteAppIdStatus]);

  const hasApplicationIdErrors = useMemo(
    () => Object.values(applicationIdFeedbackByYear).some(
      (feedback) => ['error', 'checking', 'warning'].includes(feedback?.type)
    ),
    [applicationIdFeedbackByYear]
  );

  useEffect(() => {
    years.forEach((year) => {
      const appId = normalizeApplicationIdInput(year.application_id);
      scheduleApplicationIdCheck(year.student_year, appId);
    });
  }, [years, scheduleApplicationIdCheck]);

  useEffect(() => () => {
    Object.values(remoteAppIdTimersRef.current).forEach((timerId) => clearTimeout(timerId));
  }, []);

  const archivedHistory = useMemo(
    () => (meta?.archivedHistory || []).slice(),
    [meta]
  );

  const archivedHistoryByYear = useMemo(() => {
    const grouped = {};
    archivedHistory.forEach((entry) => {
      const year = Number(entry.academic_year);
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(entry);
    });
    return grouped;
  }, [archivedHistory]);

  const updateSemesterRemark = (yearIndex, semesterIndex, value) => {
    setYears((prev) => prev.map((year, index) => {
      if (index !== yearIndex) return year;
      const semesters = (year.semesters || []).map((semester, sIndex) => (
        sIndex === semesterIndex ? { ...semester, remark: value } : semester
      ));
      return { ...year, semesters };
    }));
  };

  const saveScholarshipRemarks = async () => {
    if (!admissionNumber || isEditingDisabled) return;

    const remarkSaves = [];
    years.forEach((year) => {
      (year.semesters || []).forEach((semester) => {
        const remark = String(semester.remark || '').trim();
        if (!remark) return;
        const key = remarkKey(year.student_year, semester.student_semester);
        const existing = buildScholarshipRemarkMap(scholarshipRemarks)[key];
        if (existing === remark) return;
        remarkSaves.push({
          student_year: year.student_year,
          student_semester: semester.student_semester,
          remark
        });
      });
    });

    for (const entry of remarkSaves) {
      await api.post('/student-history/remarks', {
        admission_number: admissionNumber,
        remark: entry.remark,
        student_year: entry.student_year,
        student_semester: entry.student_semester,
        remark_category: 'Scholarship'
      });
    }

    if (remarkSaves.length > 0) {
      const remarkData = await fetchScholarshipRemarks();
      setScholarshipRemarks(remarkData.list);
      setYears((prev) => prev.map((year) => normalizeYearFromApi(
        year,
        meta,
        student,
        remarkData.map
      )));
    }
  };

  const updateSemesterField = (yearIndex, semesterIndex, value) => {
    setYears((prev) => prev.map((year, index) => {
      if (index !== yearIndex) return year;
      const semesters = (year.semesters || []).map((semester, sIndex) => (
        sIndex === semesterIndex ? { ...semester, eligible: value } : semester
      ));
      const nextYear = {
        ...year,
        semesters,
        eligible: semesters[0]?.eligible || ''
      };
      if (!isYearScholarshipEligible(nextYear)) {
        nextYear.releases = [emptyRelease()];
        nextYear.sanctioned_amount = '';
      }
      return nextYear;
    }));
  };

  const updateYearField = (yearIndex, field, value) => {
    let nextValue = value;
    if (field === 'application_id') {
      nextValue = normalizeApplicationIdInput(value);
    } else if (field === 'sanctioned_amount') {
      nextValue = normalizeScholarshipAmountInput(value);
    }
    setYears((prev) => prev.map((year, index) => (
      index === yearIndex ? { ...year, [field]: nextValue } : year
    )));
    if (field === 'application_id') {
      const studentYear = years[yearIndex]?.student_year;
      if (studentYear) scheduleApplicationIdCheck(studentYear, nextValue);
    }
  };

  const updateReleaseField = (yearIndex, releaseIndex, field, value) => {
    let nextValue = value;
    if (field === 'released_amount') {
      nextValue = normalizeScholarshipAmountInput(value);
    }
    // For rtf_released_date: always store whatever the browser emits (YYYY-MM-DD or empty).
    // Validation happens on blur — never block here or partial date input gets lost.
    setYears((prev) => prev.map((year, yIndex) => {
      if (yIndex !== yearIndex) return year;
      const releases = year.releases.map((release, rIndex) => (
        rIndex === releaseIndex ? { ...release, [field]: nextValue } : release
      ));
      return { ...year, releases };
    }));
  };

  const handleReleaseDateBlur = (yearIndex, releaseIndex, value) => {
    if (!value) return;
    if (isValidRtfReleasedDate(value, { allowEmpty: false })) return;
    toast.error(`RTF emitted date must use a valid 4-digit year (${RTF_RELEASED_DATE_MIN} to ${RTF_RELEASED_DATE_MAX})`);
    updateReleaseField(yearIndex, releaseIndex, 'rtf_released_date', '');
  };

  const addReleaseRow = (yearIndex) => {
    setYears((prev) => prev.map((year, index) => (
      index === yearIndex
        ? {
          ...year,
          releases: [
            ...year.releases,
            {
              ...emptyRelease(),
              academic_year: year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student)
            }
          ]
        }
        : year
    )));
  };

  const removeReleaseRow = (yearIndex, releaseIndex) => {
    setYears((prev) => prev.map((year, yIndex) => {
      if (yIndex !== yearIndex) return year;
      const releases = year.releases.filter((_, rIndex) => rIndex !== releaseIndex);
      return { ...year, releases: releases.length ? releases : [emptyRelease()] };
    }));
  };

  const handleSave = async () => {
    if (!admissionNumber) return;

    for (const year of years) {
      const appId = normalizeApplicationIdInput(year.application_id);
      if (!appId) continue;

      const feedback = applicationIdFeedbackByYear[year.student_year];
      if (feedback?.type === 'error' || feedback?.type === 'checking' || feedback?.type === 'warning') {
        return;
      }

      if (!isValidApplicationId(appId)) {
        return;
      }
    }

    for (const year of years) {
      if (!isYearScholarshipEligible(year)) continue;

      if (!isValidScholarshipAmount(year.sanctioned_amount)) {
        toast.error(`Year ${year.student_year}: Sanctioned amount must be up to 5 digits (max ${SCHOLARSHIP_MAX_AMOUNT})`);
        return;
      }

      for (let index = 0; index < year.releases.length; index += 1) {
        const release = year.releases[index];
        const releaseDate = normalizeRtfReleasedDateForInput(release.rtf_released_date);
        const hasReleaseValue = parseAmount(release.released_amount) > 0 || releaseDate;
        if (!hasReleaseValue) continue;
        if (String(release.rtf_released_date || '').trim() && !releaseDate) {
          toast.error(`Year ${year.student_year}, release row ${index + 1}: RTF emitted date must use a valid 4-digit year`);
          return;
        }
        if (!isValidScholarshipAmount(release.released_amount)) {
          toast.error(`Year ${year.student_year}, release row ${index + 1}: Amount must be up to 5 digits (max ${SCHOLARSHIP_MAX_AMOUNT})`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = years.map((year) => {
        const releasesEligible = isYearScholarshipEligible(year);
        return {
          student_year: year.student_year,
          application_id: normalizeApplicationIdInput(year.application_id) || '',
          sanctioned_amount: releasesEligible ? parseAmount(year.sanctioned_amount) : 0,
          semesters: (year.semesters || buildDefaultSemesters(meta?.semestersPerYear || 2)).map((semester) => ({
            student_semester: semester.student_semester,
            eligible: normalizeScholarshipStatusValue(semester.eligible) || ''
          })),
          releases: releasesEligible
            ? year.releases
              .filter((release) => (
                parseAmount(release.released_amount) > 0
                || normalizeRtfReleasedDateForInput(release.rtf_released_date)
              ))
              .map((release) => ({
                academic_year: release.academic_year || getAcademicYearLabel(meta, year.student_year, student),
                rtf_released_date: normalizeRtfReleasedDateForInput(release.rtf_released_date) || null,
                released_amount: parseAmount(release.released_amount)
              }))
            : []
        };
      });

      const response = await api.put(`/student-scholarship/${encodeURIComponent(admissionNumber)}`, { years: payload });
      if (response.data.success) {
        await saveScholarshipRemarks();
        toast.success('Scholarship history saved');
        const payloadData = response.data.data;
        const remarkData = await fetchScholarshipRemarks();
        setMeta(payloadData);
        setScholarshipRemarks(remarkData.list);
        setYears(
          (payloadData.years || []).map((year) => normalizeYearFromApi(year, payloadData, student, remarkData.map))
        );
        onUpdated?.(payloadData);
      } else {
        toast.error(response.data.message || 'Failed to save scholarship history');
      }
    } catch (error) {
      console.error('Scholarship save error:', error);
      const message = error.response?.data?.message || 'Failed to save scholarship history';
      if (message.toLowerCase().includes('application number')) {
        const appIdMatch = message.match(/\d{12}/);
        if (appIdMatch) {
          years.forEach((year) => {
            if (normalizeApplicationIdInput(year.application_id) === appIdMatch[0]) {
              setRemoteAppIdStatus((prev) => ({
                ...prev,
                [year.student_year]: {
                  loading: false,
                  available: false,
                  message: 'Application number already exists'
                }
              }));
            }
          });
        }
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingAnimation message="Loading scholarship history..." />
      </div>
    );
  }

  if (!admissionNumber) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-gray-500">
        <AlertTriangle size={28} />
        <p>Select a student to view scholarship history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {quotaLocked && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This student is under Management Quota, Spot Admission, or Lateral Spot. Scholarship is automatically
          marked as <span className="font-semibold">Not eligible</span> for all years and cannot be edited.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-50 text-pink-600">
            <GraduationCap size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Student Scholarship</h3>
            <p className="text-xs text-gray-500">
              {meta?.student?.student_name || student?.student_name || admissionNumber}
              {meta?.firstAcademicYear ? ` · First academic year ${meta.firstAcademicYear}` : ''}
              {meta?.totalYears ? ` · ${meta.totalYears} year(s)` : ''}
            </p>
          </div>
        </div>
        {!isEditingDisabled && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || hasApplicationIdErrors}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Scholarship
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Year-wise Scholarship Summary</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-3 font-bold whitespace-nowrap text-center">Year</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap text-center">Application ID</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap">Sem</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap">Eligible</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap text-center">Sanctioned Amount</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap text-center">Released Amount</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap">Remarks</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap text-center">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaryYears.map((year, yearIndex) => {
                const semesters = year.semesters?.length
                  ? year.semesters
                  : buildDefaultSemesters(meta?.semestersPerYear || 2, year.eligible || '');
                const rowSpan = semesters.length;

                return semesters.map((semester, semesterIndex) => (
                  <tr key={`${year.student_year}-sem-${semester.student_semester}`} className="hover:bg-gray-50/60">
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-3 py-3 align-middle text-center border-r border-gray-50"
                      >
                        <span className="font-semibold text-gray-900 whitespace-nowrap">
                          Year {year.student_year}
                        </span>
                      </td>
                    )}
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-3 py-3 align-middle text-center border-r border-gray-50"
                      >
                        {isEditingDisabled ? (
                          <span className="text-gray-700">{year.application_id || '—'}</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1 min-w-[140px]">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={SCHOLARSHIP_APPLICATION_ID_LENGTH}
                              value={year.application_id || ''}
                              onChange={(e) => updateYearField(yearIndex, 'application_id', e.target.value)}
                              className={`w-full px-2 py-1.5 border rounded-lg text-xs text-center tracking-wider ${
                                applicationIdFeedbackByYear[year.student_year]?.type === 'error'
                                  ? 'border-red-300 bg-red-50/40'
                                  : applicationIdFeedbackByYear[year.student_year]?.type === 'success'
                                    ? 'border-green-300 bg-green-50/40'
                                    : 'border-gray-200'
                              }`}
                              placeholder={`${SCHOLARSHIP_APPLICATION_ID_LENGTH}-digit number`}
                            />
                            {applicationIdFeedbackByYear[year.student_year]?.message && (
                              <p
                                className={`text-[10px] leading-tight text-center max-w-[140px] ${
                                  applicationIdFeedbackByYear[year.student_year]?.type === 'error'
                                    ? 'text-red-600'
                                    : applicationIdFeedbackByYear[year.student_year]?.type === 'success'
                                      ? 'text-green-600'
                                      : applicationIdFeedbackByYear[year.student_year]?.type === 'checking'
                                        ? 'text-gray-500'
                                        : 'text-amber-600'
                                }`}
                              >
                                {applicationIdFeedbackByYear[year.student_year].message}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 whitespace-nowrap text-gray-700">
                      Sem {semester.student_semester}
                    </td>
                    <td className="px-3 py-3">
                      {isEditingDisabled ? (
                        <span className="text-gray-700">
                          {getScholarshipStatusDropdownLabel(semester.eligible)}
                        </span>
                      ) : (
                        <select
                          value={normalizeScholarshipStatusValue(semester.eligible) || ''}
                          onChange={(e) => updateSemesterField(yearIndex, semesterIndex, e.target.value)}
                          className="w-full min-w-[130px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                        >
                          {ELIGIBLE_OPTIONS.map((option) => (
                            <option key={option.value || 'blank'} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-3 py-3 align-middle text-center border-l border-gray-50"
                      >
                        {year.releasesEligible ? (
                          isEditingDisabled ? (
                            <span className="font-medium text-gray-800">
                              {formatCurrency(year.sanctioned_amount)}
                            </span>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={5}
                              value={year.sanctioned_amount ?? ''}
                              onChange={(e) => updateYearField(yearIndex, 'sanctioned_amount', e.target.value)}
                              className="w-full min-w-[100px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center"
                              placeholder={`Max ${SCHOLARSHIP_MAX_AMOUNT}`}
                            />
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-3 py-3 align-middle text-center whitespace-nowrap border-l border-gray-50"
                      >
                        {year.releasesEligible ? (
                          <span className="font-semibold text-emerald-700">
                            {formatCurrency(year.released_amount)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 min-w-[160px]">
                      {isEditingDisabled ? (
                        <span className="text-gray-700 text-xs">{semester.remark || '—'}</span>
                      ) : (
                        <input
                          type="text"
                          value={semester.remark || ''}
                          onChange={(e) => updateSemesterRemark(yearIndex, semesterIndex, e.target.value)}
                          className="w-full min-w-[110px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                          placeholder={`Sem ${semester.student_semester} remark`}
                        />
                      )}
                    </td>
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-3 py-3 align-middle text-center border-l border-gray-50"
                      >
                        <button
                          type="button"
                          onClick={() => setHistoryYear(year.student_year)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-[10px] font-bold hover:bg-amber-100 border border-amber-100"
                          title={`View archived scholarship history for Year ${year.student_year}`}
                        >
                          <History size={12} />
                          History
                        </button>
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!quotaLocked && (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Release Transactions</h4>
          <p className="text-[11px] text-gray-400 mt-1">
            Shown only for years with at least one semester marked Eligible.
          </p>
        </div>

        {releaseTransactionYears.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            No release transactions — mark a semester as Eligible to record releases.
          </div>
        ) : (
        <div className="divide-y divide-gray-100">
          {releaseTransactionYears.map((year) => {
            const yearIndex = years.findIndex((entry) => entry.student_year === year.student_year);
            const academicYearLabel = year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student);

            return (
            <div key={`releases-${year.student_year}`} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-sm font-bold text-gray-800">Year {year.student_year}</h5>
                <span className="text-xs font-semibold text-emerald-700">
                  Total Released: {formatCurrency(sumReleased(year.releases))}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2 font-bold whitespace-nowrap">Academic Year</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap">RTF Emitted Date</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap text-right">Released Amount</th>
                      {!isEditingDisabled && <th className="px-2 py-2 font-bold whitespace-nowrap text-center w-20">Add</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {year.releases.map((release, releaseIndex) => (
                      <tr key={`${year.student_year}-${releaseIndex}`}>
                        <td className="px-2 py-2">
                          <span className="text-gray-700 whitespace-nowrap">
                            {release.academic_year || academicYearLabel}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {isEditingDisabled ? (
                            <span className="text-gray-700">{formatCalendarDate(release.rtf_released_date) || '—'}</span>
                          ) : (
                            <input
                              type="date"
                              min={RTF_RELEASED_DATE_MIN}
                              max={RTF_RELEASED_DATE_MAX}
                              value={release.rtf_released_date || ''}
                              onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'rtf_released_date', e.target.value)}
                              onBlur={(e) => handleReleaseDateBlur(yearIndex, releaseIndex, e.target.value)}
                              className="w-full min-w-[130px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isEditingDisabled ? (
                            <span className="font-medium text-gray-800">{formatCurrency(release.released_amount)}</span>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={5}
                              value={release.released_amount}
                              onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'released_amount', e.target.value)}
                              className="w-full min-w-[110px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right"
                              placeholder={`Max ${SCHOLARSHIP_MAX_AMOUNT}`}
                            />
                          )}
                        </td>
                        {!isEditingDisabled && (
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => addReleaseRow(yearIndex)}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                title="Add another release for this year"
                              >
                                <Plus size={14} />
                              </button>
                              {year.releases.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeReleaseRow(yearIndex, releaseIndex)}
                                  className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                                  title="Remove row"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })}
        </div>
        )}
      </div>
      )}

      <YearHistoryModal
        year={historyYear}
        entries={historyYear ? (archivedHistoryByYear[historyYear] || []) : []}
        student={student}
        meta={meta}
        onClose={() => setHistoryYear(null)}
      />

      {/* Scholarship History — all archived records visible in the page */}
      {archivedHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70 flex items-center gap-2">
            <History size={14} className="text-amber-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Scholarship History</h4>
            <span className="ml-auto text-[11px] text-gray-400">{archivedHistory.length} record{archivedHistory.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-bold whitespace-nowrap text-center">Year</th>
                  <th className="px-3 py-2 font-bold whitespace-nowrap text-center">Sem</th>
                  <th className="px-3 py-2 font-bold whitespace-nowrap">Status</th>
                  <th className="px-3 py-2 font-bold whitespace-nowrap">App ID</th>
                  <th className="px-3 py-2 font-bold whitespace-nowrap text-right">Sanctioned</th>
                  <th className="px-3 py-2 font-bold whitespace-nowrap text-right">Released</th>
                  <th className="px-3 py-2 font-bold whitespace-nowrap">Source</th>
                  <th className="px-3 py-2 font-bold whitespace-nowrap">Archived On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {archivedHistory.map((entry) => {
                  const snapshot = entry.snapshot || {};
                  const status = entry.scholar_status || snapshot.eligible || '';
                  const sourceLabel = entry.source === 'scholarship_overwrite'
                    ? 'Overwritten'
                    : entry.source === 'scholarship_status_sync'
                      ? 'Initial sync'
                      : entry.source || '—';
                  const sourceColor = entry.source === 'scholarship_overwrite'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-blue-50 text-blue-700';

                  // Status badge colour
                  let statusColor = 'bg-gray-100 text-gray-600';
                  const normalizedStatus = String(status).trim().toLowerCase();
                  if (normalizedStatus === 'eligible') statusColor = 'bg-green-100 text-green-700';
                  else if (normalizedStatus === 'not_eligible' || normalizedStatus === 'not eligible') statusColor = 'bg-red-100 text-red-700';
                  else if (normalizedStatus === 'rejected') statusColor = 'bg-red-100 text-red-700';
                  else if (normalizedStatus === 'pending') statusColor = 'bg-yellow-100 text-yellow-700';
                  else if (normalizedStatus === 'not_applied') statusColor = 'bg-gray-100 text-gray-500';

                  return (
                    <tr key={entry.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 text-center font-medium text-gray-800">
                        {entry.academic_year ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {entry.academic_semester ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusColor}`}>
                            {formatScholarshipStatusDisplay(status)}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-700 font-mono text-xs">
                        {snapshot.application_id || '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                        {snapshot.sanctioned_amount ? formatCurrency(snapshot.sanctioned_amount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-700 tabular-nums font-medium">
                        {snapshot.released_amount ? formatCurrency(snapshot.released_amount) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceColor}`}>
                          {sourceLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                        {formatArchivedAt(entry.archived_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentScholarshipHistoryTab;
