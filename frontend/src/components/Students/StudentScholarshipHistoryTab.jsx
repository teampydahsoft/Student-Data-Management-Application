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
  isValidRtfReleasedDate,
  SCHOLARSHIP_RTF_RELEASED_LABEL,
  SCHOLARSHIP_RTF_DUE_LABEL,
  SCHOLARSHIP_FEE_DUE_LABEL,
  SCHOLARSHIP_ADVANCE_LABEL,
  SCHOLARSHIP_RTF_RELEASED_TRANSACTIONS_TITLE,
  SCHOLARSHIP_PAID_TRANSACTIONS_TITLE,
  SCHOLARSHIP_PAID_DATE_LABEL,
  calculateScholarshipRtfDue,
  calculateScholarshipFeeDue,
  calculateScholarshipAdvanceAmount,
  calculateRemainingFeeDueBeforeRow,
  calculateFeeDueAfterRow,
  calculateRemainingRtfDueBeforeRow,
  calculateRtfDueAfterRow
} from '../../config/scholarshipConfig';
import { CASTE_OPTIONS } from '../../config/casteConfig';

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

  const academicYearLabel = year.academic_year_label || getAcademicYearLabel(payload, year.student_year, student);
  const normalizedYear = {
    ...year,
    sanctioned_amount: formatScholarshipAmountForInput(year.sanctioned_amount),
    semesters: normalizedSemesters,
    releases: mapReleasesFromApi(year.releases, academicYearLabel),
    paid_transactions: mapPaidTransactionsFromApi(
      year.paid_transactions,
      academicYearLabel
    )
  };

  // When no semester is eligible, financial fields must be empty (pending/rejected/etc.).
  if (!isYearScholarshipEligible(normalizedYear)) {
    normalizedYear.sanctioned_amount = '';
    normalizedYear.releases = mapReleasesFromApi([], academicYearLabel);
    normalizedYear.paid_transactions = mapPaidTransactionsFromApi([], academicYearLabel);
  }

  return normalizedYear;
};

const emptyRelease = () => ({
  id: null,
  academic_year: '',
  rtf_released_date: '',
  released_amount: ''
});

const emptyPaidTransaction = () => ({
  id: null,
  academic_year: '',
  paid_date: '',
  paid_amount: ''
});

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
}).format(Number(amount) || 0);

const parseAmount = (value) => parseScholarshipAmount(value);

const sumReleased = (releases = []) => releases.reduce((sum, row) => sum + parseAmount(row.released_amount), 0);
const sumPaid = (paidTransactions = []) => paidTransactions.reduce((sum, row) => sum + parseAmount(row.paid_amount), 0);

// Advance must only consider manually entered fee payments. For a College Account the RTF
// released amount is auto-credited into the paid transactions, so it is subtracted here —
// only the real fee money paid to college (beyond the auto-credit) counts toward advance.
const sumManualPaid = (year, isCollege) => {
  const totalPaid = sumPaid(year.paid_transactions || []);
  if (isCollege) {
    const totalReleased = sumReleased(year.releases || []);
    return Math.max(0, totalPaid - totalReleased);
  }
  return totalPaid;
};

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
    id: release.id ?? null,
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

const mapPaidTransactionsFromApi = (transactions = [], academicYearLabel = '') => (
  (transactions.length ? transactions : [emptyPaidTransaction()]).map((transaction) => ({
    id: transaction.id ?? null,
    academic_year: transaction.academic_year || academicYearLabel || '',
    paid_date: normalizeRtfReleasedDateForInput(
      transaction.paid_date || transaction.to_date
    ),
    paid_amount: (() => {
      const normalized = formatScholarshipAmountForInput(transaction.paid_amount);
      return normalized === '' || normalized === '0' ? '' : normalized;
    })()
  }))
);

/** College Account: auto-fill paid rows at RTF indices; preserve manual rows after RTF rows. */
const syncCollegePaidTransactionsFromRtf = (year, isCollege) => {
  if (!isCollege) return year;
  const releases = year.releases || [];
  const manualExtras = (year.paid_transactions || []).slice(releases.length);
  const paid = releases.map((rtf, index) => {
    const existing = (year.paid_transactions || [])[index] || emptyPaidTransaction();
    return {
      ...existing,
      academic_year: rtf.academic_year || existing.academic_year || year.academic_year_label || '',
      paid_amount: rtf.released_amount ?? '',
      paid_date: normalizeRtfReleasedDateForInput(rtf.rtf_released_date) || ''
    };
  });
  const combined = [...paid, ...manualExtras];
  return {
    ...year,
    paid_transactions: combined.length
      ? combined
      : mapPaidTransactionsFromApi([], year.academic_year_label || '')
  };
};

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

// A year qualifies for financial entry (sanctioned amount / releases) ONLY when
// EVERY semester in that year is marked Eligible. If any semester is not eligible
// (or blank / pending / rejected / etc.), the sanctioned amount must stay null.
const isYearScholarshipEligible = (year) => {
  const semesters = year?.semesters || [];
  return semesters.length > 0 && semesters.every(
    (semester) => normalizeScholarshipStatusValue(semester.eligible) === 'eligible'
  );
};

const clearYearFinancialDataIfNotEligible = (year, academicYearLabel = '') => {
  if (isYearScholarshipEligible(year)) return year;
  const label = academicYearLabel || year.academic_year_label || '';
  return {
    ...year,
    sanctioned_amount: '',
    releases: mapReleasesFromApi([], label),
    paid_transactions: mapPaidTransactionsFromApi([], label)
  };
};

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
                        <p className="text-[10px] uppercase text-gray-400 font-bold">{SCHOLARSHIP_RTF_RELEASED_LABEL}</p>
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
  const [casteAccountTypes, setCasteAccountTypes] = useState({}); // caste → 'mother' | 'college'
  const [selectedCaste, setSelectedCaste] = useState('');
  const remoteAppIdTimersRef = useRef({});

  const admissionNumber = student?.admission_number || student?.admissionNumber;
  const quotaLocked = isScholarshipQuotaLocked(student, meta);
  const isEditingDisabled = readOnly || quotaLocked;

  const casteOptions = useMemo(() => {
    const current = String(selectedCaste || student?.caste || meta?.student?.caste || '').trim();
    if (current && !CASTE_OPTIONS.includes(current)) {
      return [current, ...CASTE_OPTIONS];
    }
    return CASTE_OPTIONS;
  }, [selectedCaste, student?.caste, meta?.student?.caste]);

  useEffect(() => {
    const fromStudent = String(student?.caste || meta?.student?.caste || '').trim();
    if (fromStudent) {
      setSelectedCaste(fromStudent);
    }
  }, [student?.caste, meta?.student?.caste]);

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
      const [scholarshipResponse, remarkData, rtfConfigRes] = await Promise.all([
        api.get(`/student-scholarship/${encodeURIComponent(admissionNumber)}`),
        fetchScholarshipRemarks(),
        api.get('/settings/rtf-amount').catch(() => null)
      ]);

      if (rtfConfigRes?.data?.success) {
        setCasteAccountTypes(rtfConfigRes.data.data?.casteAccountTypes || {});
      }

      if (scholarshipResponse.data.success) {
        const payload = scholarshipResponse.data.data;
        const accountTypes = rtfConfigRes?.data?.data?.casteAccountTypes || {};
        const isCollege = accountTypes[payload.student?.caste || student?.caste] === 'college';
        setMeta(payload);
        setScholarshipRemarks(remarkData.list);
        if (payload.student?.caste) {
          setSelectedCaste(payload.student.caste);
        } else if (student?.caste) {
          setSelectedCaste(student.caste);
        }
        setYears(
          (payload.years || []).map((year) => syncCollegePaidTransactionsFromRtf(
            normalizeYearFromApi(year, payload, student, remarkData.map),
            isCollege
          ))
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
    () => years.map((year) => {
      const eligible = isYearScholarshipEligible(year);
      const isCollege = casteAccountTypes[selectedCaste || student?.caste] === 'college';
      const sanctioned = eligible ? parseAmount(year.sanctioned_amount) : 0;
      const released = eligible ? sumReleased(year.releases) : 0;
      const paid = eligible ? sumPaid(year.paid_transactions || []) : 0;
      // Advance mode is driven by manually entered payments only (college auto-credit excluded).
      const manualPaid = eligible ? sumManualPaid(year, isCollege) : 0;
      const rtfDue = eligible ? calculateScholarshipRtfDue(sanctioned, released, manualPaid) : 0;
      const feeDue = eligible ? calculateScholarshipFeeDue(sanctioned, paid) : 0;
      const advance = eligible ? calculateScholarshipAdvanceAmount(sanctioned, released, manualPaid) : 0;
      return {
        ...year,
        released_amount: released,
        paid_amount: paid,
        rtf_due_amount: rtfDue,
        fee_due_amount: feeDue,
        advance_amount: advance,
        releasesEligible: eligible
      };
    }),
    [years, selectedCaste, casteAccountTypes, student?.caste]
  );

  const hasAnyAdvance = useMemo(
    () => summaryYears.some((year) => year.advance_amount > 0),
    [summaryYears]
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
      const nextYear = clearYearFinancialDataIfNotEligible({
        ...year,
        semesters,
        eligible: semesters[0]?.eligible || ''
      }, year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student));
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

  const isCollegeAccount = () => {
    const c = String(selectedCaste || student?.caste || '').trim();
    return c && casteAccountTypes[c] === 'college';
  };

  const handleCasteChange = (value) => {
    setSelectedCaste(value);
    const isCollege = value && casteAccountTypes[value] === 'college';
    setYears((prev) => prev.map((year) => syncCollegePaidTransactionsFromRtf(year, isCollege)));
  };

  const applyCollegePaidSync = (year) => syncCollegePaidTransactionsFromRtf(year, isCollegeAccount());

  const applyYearUpdate = (yearIndex, updater) => {
    setYears((prev) => prev.map((year, index) => {
      if (index !== yearIndex) return year;
      return applyCollegePaidSync(updater(year));
    }));
  };

  const updateReleaseField = (yearIndex, releaseIndex, field, value) => {
    let nextValue = value;
    if (field === 'released_amount') {
      nextValue = normalizeScholarshipAmountInput(value);
    }
    applyYearUpdate(yearIndex, (year) => {
      const releases = year.releases.map((release, rIndex) => (
        rIndex === releaseIndex ? { ...release, [field]: nextValue } : release
      ));
      return { ...year, releases };
    });
  };

  const updatePaidTransactionField = (yearIndex, transactionIndex, field, value) => {
    let nextValue = value;
    if (field === 'paid_amount') {
      nextValue = normalizeScholarshipAmountInput(value);
    }
    setYears((prev) => prev.map((year, yIndex) => {
      if (yIndex !== yearIndex) return year;
      const paid_transactions = (year.paid_transactions || []).map((transaction, tIndex) => (
        tIndex === transactionIndex ? { ...transaction, [field]: nextValue } : transaction
      ));
      return { ...year, paid_transactions };
    }));
  };

  const handlePaidDateBlur = (yearIndex, transactionIndex, value) => {
    if (!value) return;
    if (isValidRtfReleasedDate(value, { allowEmpty: false })) return;
    toast.error(`${SCHOLARSHIP_PAID_DATE_LABEL} must use a valid 4-digit year (${RTF_RELEASED_DATE_MIN} to ${RTF_RELEASED_DATE_MAX})`);
    updatePaidTransactionField(yearIndex, transactionIndex, 'paid_date', '');
  };

  const handleReleaseDateBlur = (yearIndex, releaseIndex, value) => {
    if (!value) return;
    if (isValidRtfReleasedDate(value, { allowEmpty: false })) return;
    toast.error(`RTF Remitted date must use a valid 4-digit year (${RTF_RELEASED_DATE_MIN} to ${RTF_RELEASED_DATE_MAX})`);
    updateReleaseField(yearIndex, releaseIndex, 'rtf_released_date', '');
  };

  const addReleaseRow = (yearIndex) => {
    applyYearUpdate(yearIndex, (year) => ({
      ...year,
      releases: [
        ...year.releases,
        {
          ...emptyRelease(),
          academic_year: year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student)
        }
      ]
    }));
  };

  const removeReleaseRow = (yearIndex, releaseIndex) => {
    applyYearUpdate(yearIndex, (year) => {
      const releases = year.releases.filter((_, rIndex) => rIndex !== releaseIndex);
      return {
        ...year,
        releases: releases.length ? releases : [emptyRelease()]
      };
    });
  };

  const addPaidTransactionRow = (yearIndex) => {
    setYears((prev) => prev.map((year, index) => (
      index === yearIndex
        ? {
          ...year,
          paid_transactions: [
            ...(year.paid_transactions || []),
            {
              ...emptyPaidTransaction(),
              academic_year: year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student)
            }
          ]
        }
        : year
    )));
  };

  const removePaidTransactionRow = (yearIndex, transactionIndex) => {
    setYears((prev) => prev.map((year, yIndex) => {
      if (yIndex !== yearIndex) return year;
      if (isCollegeAccount() && transactionIndex < (year.releases || []).length) {
        return year;
      }
      const paid_transactions = (year.paid_transactions || []).filter((_, tIndex) => tIndex !== transactionIndex);
      return {
        ...year,
        paid_transactions: paid_transactions.length
          ? paid_transactions
          : mapPaidTransactionsFromApi([], year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student))
      };
    }));
  };

  const isCollegePaidRowAuto = (transactionIndex, releaseCount) => (
    isCollegeAccount() && transactionIndex < releaseCount
  );

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
          toast.error(`Year ${year.student_year}, RTF row ${index + 1}: RTF Remitted date must use a valid 4-digit year`);
          return;
        }
        if (!isValidScholarshipAmount(release.released_amount)) {
          toast.error(`Year ${year.student_year}, RTF row ${index + 1}: ${SCHOLARSHIP_RTF_RELEASED_LABEL} amount must be up to 5 digits (max ${SCHOLARSHIP_MAX_AMOUNT})`);
          return;
        }
      }

      const paidRows = applyCollegePaidSync(year).paid_transactions || [];
      const sanctioned = parseAmount(year.sanctioned_amount);
      const isCollege = isCollegeAccount();

      for (let index = 0; index < paidRows.length; index += 1) {
        const transaction = paidRows[index];
        const paidDate = normalizeRtfReleasedDateForInput(transaction.paid_date);
        const hasPaidValue = parseAmount(transaction.paid_amount) > 0 || paidDate;
        if (!hasPaidValue) continue;
        if (String(transaction.paid_date || '').trim() && !paidDate) {
          toast.error(`Year ${year.student_year}, paid row ${index + 1}: ${SCHOLARSHIP_PAID_DATE_LABEL} must use a valid 4-digit year`);
          return;
        }
        if (!isValidScholarshipAmount(transaction.paid_amount)) {
          toast.error(`Year ${year.student_year}, paid row ${index + 1}: Paid amount must be up to 5 digits (max ${SCHOLARSHIP_MAX_AMOUNT})`);
          return;
        }
        // For a College Account the RTF auto-credit is added on top of manual payments and can
        // legitimately push the total beyond the fee (that surplus is the advance). Skip the
        // per-row Fee Due cap there; the manual-paid total is validated below instead.
        if (!isCollege) {
          const rowPaid = parseAmount(transaction.paid_amount);
          const remainingFeeDue = calculateRemainingFeeDueBeforeRow(sanctioned, paidRows, index);
          if (sanctioned > 0 && rowPaid > remainingFeeDue) {
            toast.error(
              `Year ${year.student_year}, paid row ${index + 1}: Paid amount (${rowPaid}) exceeds remaining ${SCHOLARSHIP_FEE_DUE_LABEL} (${remainingFeeDue})`
            );
            return;
          }
        }
      }

      const totalPaid = sumPaid(paidRows);
      // Advance mode considers manually entered payments only (college auto-credit excluded).
      const manualPaid = sumManualPaid(
        { releases: year.releases, paid_transactions: paidRows },
        isCollege
      );
      const advanceMode = sanctioned > 0
        && calculateScholarshipFeeDue(sanctioned, manualPaid) === 0;

      for (let index = 0; index < year.releases.length; index += 1) {
        const release = year.releases[index];
        const releaseDate = normalizeRtfReleasedDateForInput(release.rtf_released_date);
        const hasReleaseValue = parseAmount(release.released_amount) > 0 || releaseDate;
        if (!hasReleaseValue) continue;

        if (!advanceMode && sanctioned > 0) {
          const rowReleased = parseAmount(release.released_amount);
          const remainingRtfDue = calculateRemainingRtfDueBeforeRow(
            sanctioned,
            year.releases,
            manualPaid,
            index
          );
          if (rowReleased > remainingRtfDue) {
            toast.error(
              `Year ${year.student_year}, RTF row ${index + 1}: ${SCHOLARSHIP_RTF_RELEASED_LABEL} amount (${rowReleased}) exceeds remaining ${SCHOLARSHIP_RTF_DUE_LABEL} (${remainingRtfDue})`
            );
            return;
          }
        }
      }

      // Total released must not exceed sanctioned amount
      const totalReleased = sumReleased(year.releases);
      if (sanctioned > 0 && totalReleased > sanctioned) {
        toast.error(
          `Year ${year.student_year}: Total ${SCHOLARSHIP_RTF_RELEASED_LABEL.toLowerCase()} amount (${totalReleased}) cannot exceed sanctioned amount (${sanctioned})`
        );
        return;
      }

      // The fee money paid to college must not exceed the sanctioned amount. For a College
      // Account the RTF auto-credit is excluded (it becomes advance when the fee is fully paid).
      if (sanctioned > 0 && manualPaid > sanctioned) {
        toast.error(
          `Year ${year.student_year}: Total paid amount (${manualPaid}) cannot exceed sanctioned amount (${sanctioned})`
        );
        return;
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
              .map((release) => {
                const rtfDate = normalizeRtfReleasedDateForInput(release.rtf_released_date) || null;
                return {
                  academic_year: release.academic_year || getAcademicYearLabel(meta, year.student_year, student),
                  rtf_released_date: rtfDate,
                  released_amount: parseAmount(release.released_amount)
                };
              })
            : [],
          paid_transactions: releasesEligible
            ? (applyCollegePaidSync(year).paid_transactions || [])
              .filter((transaction) => (
                parseAmount(transaction.paid_amount) > 0
                || normalizeRtfReleasedDateForInput(transaction.paid_date)
              ))
              .map((transaction) => ({
                academic_year: transaction.academic_year || getAcademicYearLabel(meta, year.student_year, student),
                paid_date: normalizeRtfReleasedDateForInput(transaction.paid_date) || null,
                paid_amount: parseAmount(transaction.paid_amount)
              }))
            : []
        };
      });

      const response = await api.put(`/student-scholarship/${encodeURIComponent(admissionNumber)}`, {
        years: payload,
        caste: selectedCaste || null
      });
      if (response.data.success) {
        await saveScholarshipRemarks();
        toast.success('Scholarship history saved');
        const payloadData = response.data.data;
        const remarkData = await fetchScholarshipRemarks();
        setMeta(payloadData);
        setScholarshipRemarks(remarkData.list);
        setYears(
          (payloadData.years || []).map((year) => syncCollegePaidTransactionsFromRtf(
            normalizeYearFromApi(year, payloadData, student, remarkData.map),
            (payloadData.student?.caste || selectedCaste)
              && casteAccountTypes[payloadData.student?.caste || selectedCaste] === 'college'
          ))
        );
        if (payloadData.student?.caste) {
          setSelectedCaste(payloadData.student.caste);
        }
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Caste</label>
          {isEditingDisabled ? (
            <span className="text-sm font-medium text-gray-800">{selectedCaste || student?.caste || '—'}</span>
          ) : (
            <select
              value={selectedCaste}
              onChange={(e) => handleCasteChange(e.target.value)}
              className="w-full min-w-[180px] px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-800 bg-white"
            >
              <option value="">Select caste</option>
              {casteOptions.map((caste) => (
                <option key={caste} value={caste}>{caste}</option>
              ))}
            </select>
          )}
        </div>
        {selectedCaste && casteAccountTypes[selectedCaste] && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
            casteAccountTypes[selectedCaste] === 'college'
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-blue-700 bg-blue-50 border-blue-200'
          }`}>
            {casteAccountTypes[selectedCaste] === 'college' ? 'College Account' : 'Mother Account'}
          </span>
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
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">Year</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">Application ID</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap">Sem</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap">Eligible</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">Sanctioned</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">{SCHOLARSHIP_RTF_RELEASED_LABEL}</th>
                {hasAnyAdvance && (
                  <th className="px-2 py-3 font-bold whitespace-nowrap text-center">{SCHOLARSHIP_ADVANCE_LABEL}</th>
                )}
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">{SCHOLARSHIP_RTF_DUE_LABEL}</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">Paid</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">{SCHOLARSHIP_FEE_DUE_LABEL}</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap">Remarks</th>
                <th className="px-2 py-3 font-bold whitespace-nowrap text-center">History</th>
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
                        className="px-2 py-2 align-middle text-center border-r border-gray-50"
                      >
                        <span className="font-semibold text-gray-900 whitespace-nowrap text-xs">
                          Year {year.student_year}
                        </span>
                      </td>
                    )}
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-2 py-2 align-middle text-center border-r border-gray-50"
                      >
                        {isEditingDisabled ? (
                          <span className="text-gray-700 text-xs">{year.application_id || '—'}</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1 min-w-[120px]">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={SCHOLARSHIP_APPLICATION_ID_LENGTH}
                              value={year.application_id || ''}
                              onChange={(e) => updateYearField(yearIndex, 'application_id', e.target.value)}
                              className={`w-full px-1.5 py-1 border rounded-lg text-xs text-center tracking-wider ${
                                applicationIdFeedbackByYear[year.student_year]?.type === 'error'
                                  ? 'border-red-300 bg-red-50/40'
                                  : applicationIdFeedbackByYear[year.student_year]?.type === 'success'
                                    ? 'border-green-300 bg-green-50/40'
                                    : 'border-gray-200'
                              }`}
                              placeholder={`${SCHOLARSHIP_APPLICATION_ID_LENGTH}-digit`}
                            />
                            {applicationIdFeedbackByYear[year.student_year]?.message && (
                              <p
                                className={`text-[10px] leading-tight text-center max-w-[120px] ${
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
                    <td className="px-2 py-2 whitespace-nowrap text-gray-700 text-xs">
                      Sem {semester.student_semester}
                    </td>
                    <td className="px-2 py-2">
                      {isEditingDisabled ? (
                        <span className="text-gray-700 text-xs">
                          {getScholarshipStatusDropdownLabel(semester.eligible)}
                        </span>
                      ) : (
                        <select
                          value={normalizeScholarshipStatusValue(semester.eligible) || ''}
                          onChange={(e) => updateSemesterField(yearIndex, semesterIndex, e.target.value)}
                          className="w-full min-w-[110px] px-1.5 py-1 border border-gray-200 rounded-lg text-xs"
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
                        className="px-2 py-2 align-middle text-center border-l border-gray-50"
                      >
                        {year.releasesEligible ? (
                          isEditingDisabled ? (
                            <span className="font-medium text-gray-800 text-xs">
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
                              className="w-full min-w-[80px] px-1.5 py-1 border border-gray-200 rounded-lg text-xs text-center"
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
                        className="px-2 py-2 align-middle text-center whitespace-nowrap border-l border-gray-50"
                      >
                        {year.releasesEligible ? (
                          <span className="font-semibold text-emerald-700 text-xs">
                            {formatCurrency(year.released_amount)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    {hasAnyAdvance && semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-2 py-2 align-middle text-center whitespace-nowrap border-l border-gray-50"
                      >
                        {year.releasesEligible && year.advance_amount > 0 ? (
                          <span className="font-semibold text-violet-700 text-xs">
                            {formatCurrency(year.advance_amount)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-2 py-2 align-middle text-center whitespace-nowrap border-l border-gray-50"
                      >
                        {year.releasesEligible ? (
                          hasAnyAdvance && year.advance_amount > 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={`font-semibold text-xs ${year.rtf_due_amount > 0 ? 'text-sky-600' : 'text-gray-400'}`}>
                              {formatCurrency(year.rtf_due_amount)}
                            </span>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-2 py-2 align-middle text-center whitespace-nowrap border-l border-gray-50"
                      >
                        {year.releasesEligible ? (
                          <span className="font-semibold text-blue-700 text-xs">
                            {formatCurrency(year.paid_amount)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-2 py-2 align-middle text-center whitespace-nowrap border-l border-gray-50"
                      >
                        {year.releasesEligible ? (
                          <span className={`font-semibold text-xs ${year.fee_due_amount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {formatCurrency(year.fee_due_amount)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-2 min-w-[120px]">
                      {isEditingDisabled ? (
                        <span className="text-gray-700 text-xs">{semester.remark || '—'}</span>
                      ) : (
                        <input
                          type="text"
                          value={semester.remark || ''}
                          onChange={(e) => updateSemesterRemark(yearIndex, semesterIndex, e.target.value)}
                          className="w-full min-w-[90px] px-1.5 py-1 border border-gray-200 rounded-lg text-xs"
                          placeholder={`Sem ${semester.student_semester} remark`}
                        />
                      )}
                    </td>
                    {semesterIndex === 0 && (
                      <td
                        rowSpan={rowSpan}
                        className="px-2 py-2 align-middle text-center border-l border-gray-50"
                      >
                        <button
                          type="button"
                          onClick={() => setHistoryYear(year.student_year)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800 text-[10px] font-bold hover:bg-amber-100 border border-amber-100"
                          title={`View archived scholarship history for Year ${year.student_year}`}
                        >
                          <History size={11} />
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
      <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">{SCHOLARSHIP_RTF_RELEASED_TRANSACTIONS_TITLE}</h4>
          <p className="text-[11px] text-gray-400 mt-1">
            Shown only for years with every semester marked Eligible.
            {hasAnyAdvance && (
              <span className="ml-1">
                When college fee is fully paid manually, {SCHOLARSHIP_RTF_DUE_LABEL} is not applicable — {SCHOLARSHIP_RTF_RELEASED_LABEL} entries count as {SCHOLARSHIP_ADVANCE_LABEL}.
              </span>
            )}
            {isCollegeAccount() && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                College Account — Paid Transactions auto-filled from {SCHOLARSHIP_RTF_RELEASED_LABEL}
              </span>
            )}
          </p>
        </div>

        {releaseTransactionYears.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            No RTF released transactions — mark all semesters as Eligible to record releases.
          </div>
        ) : (
        <div className="divide-y divide-gray-100">
          {releaseTransactionYears.map((year) => {
            const yearIndex = years.findIndex((entry) => entry.student_year === year.student_year);
            const stateYear = years[yearIndex] || year;
            const academicYearLabel = year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student);
            const sanctionedAmt = parseAmount(stateYear.sanctioned_amount);
            // Advance mode considers manually entered payments only (college auto-credit excluded).
            const manualPaidAmt = sumManualPaid(stateYear, isCollegeAccount());
            const totalReleasedAmt = sumReleased(stateYear.releases);
            const totalRtfDueAmt = calculateScholarshipRtfDue(sanctionedAmt, totalReleasedAmt, manualPaidAmt);
            const totalAdvanceAmt = calculateScholarshipAdvanceAmount(sanctionedAmt, totalReleasedAmt, manualPaidAmt);
            const showAdvanceForYear = totalAdvanceAmt > 0;
            const isReleasedOver = sanctionedAmt > 0 && totalReleasedAmt > sanctionedAmt;

            return (
            <div key={`rtf-releases-${year.student_year}`} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h5 className="text-sm font-bold text-gray-800">Year {year.student_year}</h5>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`text-xs font-semibold ${isReleasedOver ? 'text-red-600' : 'text-emerald-700'}`}>
                    {SCHOLARSHIP_RTF_RELEASED_LABEL}: {formatCurrency(totalReleasedAmt)}
                    {isReleasedOver && (
                      <span className="ml-1 text-red-500">
                        (exceeds sanctioned {formatCurrency(sanctionedAmt)})
                      </span>
                    )}
                  </span>
                  {hasAnyAdvance && showAdvanceForYear && (
                    <span className="text-xs font-semibold text-violet-700">
                      {SCHOLARSHIP_ADVANCE_LABEL}: {formatCurrency(totalAdvanceAmt)}
                    </span>
                  )}
                  {sanctionedAmt > 0 && (!showAdvanceForYear || !hasAnyAdvance) && (
                    <span className={`text-xs font-semibold ${totalRtfDueAmt > 0 ? 'text-sky-600' : 'text-gray-500'}`}>
                      {SCHOLARSHIP_RTF_DUE_LABEL}: {formatCurrency(totalRtfDueAmt)}
                    </span>
                  )}
                  {hasAnyAdvance && sanctionedAmt > 0 && showAdvanceForYear && (
                    <span className="text-xs font-semibold text-gray-500">
                      {SCHOLARSHIP_RTF_DUE_LABEL}: —
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2 font-bold whitespace-nowrap">Academic Year</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap">RTF Remitted Date</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap text-right">{SCHOLARSHIP_RTF_RELEASED_LABEL} Amount</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap text-right">
                        {hasAnyAdvance
                          ? `${SCHOLARSHIP_RTF_DUE_LABEL} / ${SCHOLARSHIP_ADVANCE_LABEL}`
                          : SCHOLARSHIP_RTF_DUE_LABEL}
                      </th>
                      {!isEditingDisabled && <th className="px-2 py-2 font-bold whitespace-nowrap text-center w-20">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stateYear.releases.map((release, releaseIndex) => {
                      const rowReleased = parseAmount(release.released_amount);
                      const isAdvanceRow = hasAnyAdvance && showAdvanceForYear && rowReleased > 0;
                      const remainingRtfDueBefore = calculateRemainingRtfDueBeforeRow(
                        sanctionedAmt,
                        stateYear.releases,
                        manualPaidAmt,
                        releaseIndex
                      );
                      const rtfDueAfterRow = calculateRtfDueAfterRow(
                        sanctionedAmt,
                        stateYear.releases,
                        manualPaidAmt,
                        releaseIndex
                      );
                      const isRowReleasedOver = !showAdvanceForYear && sanctionedAmt > 0 && rowReleased > remainingRtfDueBefore;

                      return (
                      <tr key={`${year.student_year}-rtf-${releaseIndex}`}>
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
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-medium text-gray-800">{formatCurrency(release.released_amount)}</span>
                              {isAdvanceRow && (
                                <span className="text-[9px] text-violet-600 font-semibold bg-violet-50 px-1 rounded">{SCHOLARSHIP_ADVANCE_LABEL}</span>
                              )}
                            </div>
                          ) : (
                            <>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={5}
                                value={release.released_amount}
                                onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'released_amount', e.target.value)}
                                className={`w-full min-w-[100px] px-2 py-1.5 border rounded-lg text-xs text-right ${isRowReleasedOver ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200'}`}
                                placeholder={
                                  isAdvanceRow
                                    ? SCHOLARSHIP_ADVANCE_LABEL
                                    : (remainingRtfDueBefore > 0 ? `Max ${remainingRtfDueBefore}` : `Max ${SCHOLARSHIP_MAX_AMOUNT}`)
                                }
                              />
                              {isRowReleasedOver && (
                                <p className="text-[10px] text-red-500 mt-0.5 text-right">
                                  Exceeds {SCHOLARSHIP_RTF_DUE_LABEL.toLowerCase()} ({formatCurrency(remainingRtfDueBefore)})
                                </p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isAdvanceRow ? (
                            <span className="text-xs font-semibold tabular-nums text-violet-700">
                              {rowReleased > 0 ? formatCurrency(rowReleased) : '—'}
                            </span>
                          ) : sanctionedAmt > 0 && !showAdvanceForYear ? (
                            <span className={`text-xs font-semibold tabular-nums ${rtfDueAfterRow > 0 ? 'text-sky-600' : 'text-gray-400'}`}>
                              {formatCurrency(rtfDueAfterRow)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {!isEditingDisabled && (
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => addReleaseRow(yearIndex)}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                title="Add another RTF released row for this year"
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })}
        </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">{SCHOLARSHIP_PAID_TRANSACTIONS_TITLE}</h4>
          <p className="text-[11px] text-gray-400 mt-1">
            Fee paid to college — add a row for each payment.
            {isCollegeAccount() && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Rows matching {SCHOLARSHIP_RTF_RELEASED_LABEL} are auto-filled; add extra rows for additional payments
              </span>
            )}
            {!isCollegeAccount() && selectedCaste && casteAccountTypes[selectedCaste] !== undefined && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                Mother Account — enter paid amount and date manually
              </span>
            )}
          </p>
        </div>

        {releaseTransactionYears.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            No paid transactions — mark all semesters as Eligible to record fee payments.
          </div>
        ) : (
        <div className="divide-y divide-gray-100">
          {releaseTransactionYears.map((year) => {
            const yearIndex = years.findIndex((entry) => entry.student_year === year.student_year);
            const stateYear = years[yearIndex] || year;
            const syncedYear = applyCollegePaidSync(stateYear);
            const paidTransactions = syncedYear.paid_transactions || [];
            const releaseCount = (stateYear.releases || []).length;
            const academicYearLabel = year.academic_year_label || getAcademicYearLabel(meta, year.student_year, student);
            const sanctionedAmt = parseAmount(stateYear.sanctioned_amount);
            const totalPaidAmt = sumPaid(paidTransactions);
            const totalFeeDueAmt = calculateScholarshipFeeDue(sanctionedAmt, totalPaidAmt);
            const isPaidOver = sanctionedAmt > 0 && totalPaidAmt > sanctionedAmt;

            return (
            <div key={`paid-transactions-${year.student_year}`} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h5 className="text-sm font-bold text-gray-800">Year {year.student_year}</h5>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`text-xs font-semibold ${isPaidOver ? 'text-red-600' : 'text-blue-700'}`}>
                    Paid: {formatCurrency(totalPaidAmt)}
                    {isPaidOver && (
                      <span className="ml-1">(exceeds sanctioned)</span>
                    )}
                  </span>
                  {sanctionedAmt > 0 && (
                    <span className={`text-xs font-semibold ${totalFeeDueAmt > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                      {SCHOLARSHIP_FEE_DUE_LABEL}: {formatCurrency(totalFeeDueAmt)}
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2 font-bold whitespace-nowrap">Academic Year</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap">{SCHOLARSHIP_PAID_DATE_LABEL}</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap text-right">Paid Amount</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap text-right">{SCHOLARSHIP_FEE_DUE_LABEL}</th>
                      {!isEditingDisabled && (
                        <th className="px-2 py-2 font-bold whitespace-nowrap text-center">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paidTransactions.map((transaction, transactionIndex) => {
                      const rowPaid = parseAmount(transaction.paid_amount);
                      const remainingBeforeRow = calculateRemainingFeeDueBeforeRow(
                        sanctionedAmt,
                        paidTransactions,
                        transactionIndex
                      );
                      const feeDueAfterRow = calculateFeeDueAfterRow(
                        sanctionedAmt,
                        paidTransactions,
                        transactionIndex
                      );
                      const isRowPaidOver = sanctionedAmt > 0 && rowPaid > remainingBeforeRow;
                      const isAutoRow = isCollegePaidRowAuto(transactionIndex, releaseCount);

                      return (
                      <tr key={`${year.student_year}-paid-${transactionIndex}`}>
                        <td className="px-2 py-2">
                          <span className="text-gray-700 whitespace-nowrap">
                            {transaction.academic_year || academicYearLabel}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {isEditingDisabled || isAutoRow ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-gray-700">{formatCalendarDate(transaction.paid_date) || '—'}</span>
                              {isAutoRow && !isEditingDisabled && transaction.paid_date && (
                                <span className="text-[9px] text-emerald-600 font-semibold bg-emerald-50 px-1 rounded w-fit">auto</span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="date"
                              min={RTF_RELEASED_DATE_MIN}
                              max={RTF_RELEASED_DATE_MAX}
                              value={transaction.paid_date || ''}
                              onChange={(e) => updatePaidTransactionField(yearIndex, transactionIndex, 'paid_date', e.target.value)}
                              onBlur={(e) => handlePaidDateBlur(yearIndex, transactionIndex, e.target.value)}
                              className="w-full min-w-[130px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isEditingDisabled || isAutoRow ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-medium text-blue-700">{rowPaid > 0 ? formatCurrency(rowPaid) : '—'}</span>
                              {isAutoRow && !isEditingDisabled && (
                                <span className="text-[9px] text-emerald-600 font-semibold bg-emerald-50 px-1 rounded">auto</span>
                              )}
                            </div>
                          ) : (
                            <>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={5}
                                value={transaction.paid_amount}
                                onChange={(e) => updatePaidTransactionField(yearIndex, transactionIndex, 'paid_amount', e.target.value)}
                                className={`w-full min-w-[100px] px-2 py-1.5 border rounded-lg text-xs text-right ${isRowPaidOver ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200'}`}
                                placeholder={remainingBeforeRow > 0 ? `Max ${remainingBeforeRow}` : 'Amount paid'}
                              />
                              {isRowPaidOver && (
                                <p className="text-[10px] text-red-500 mt-0.5 text-right">
                                  Exceeds {SCHOLARSHIP_FEE_DUE_LABEL.toLowerCase()} ({formatCurrency(remainingBeforeRow)})
                                </p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {sanctionedAmt > 0 ? (
                            <span className={`text-xs font-semibold tabular-nums ${feeDueAfterRow > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {formatCurrency(feeDueAfterRow)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {!isEditingDisabled && (
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => addPaidTransactionRow(yearIndex)}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                title="Add another paid transaction row for this year"
                              >
                                <Plus size={14} />
                              </button>
                              {paidTransactions.length > 1 && !isAutoRow && (
                                <button
                                  type="button"
                                  onClick={() => removePaidTransactionRow(yearIndex, transactionIndex)}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })}
        </div>
        )}
      </div>
      </>
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
                  <th className="px-3 py-2 font-bold whitespace-nowrap text-right">{SCHOLARSHIP_RTF_RELEASED_LABEL}</th>
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
