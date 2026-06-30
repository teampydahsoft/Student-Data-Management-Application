import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  getScholarshipStatusDropdownLabel
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

const parseAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sumReleased = (releases = []) => releases.reduce((sum, row) => sum + parseAmount(row.released_amount), 0);

const normalizeDateForInput = (value) => {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const formatCalendarDate = (value) => {
  const normalized = normalizeDateForInput(value);
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
    rtf_released_date: normalizeDateForInput(
      release.rtf_released_date || release.rtf_date || release.from_date
    ),
    released_amount: release.released_amount === 0 ? '' : String(release.released_amount)
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
                              <th className="px-2 py-1">RTF Released</th>
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
    setYears((prev) => prev.map((year, index) => (
      index === yearIndex ? { ...year, [field]: value } : year
    )));
  };

  const updateReleaseField = (yearIndex, releaseIndex, field, value) => {
    setYears((prev) => prev.map((year, yIndex) => {
      if (yIndex !== yearIndex) return year;
      const releases = year.releases.map((release, rIndex) => (
        rIndex === releaseIndex ? { ...release, [field]: value } : release
      ));
      return { ...year, releases };
    }));
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

    setSaving(true);
    try {
      const payload = years.map((year) => {
        const releasesEligible = isYearScholarshipEligible(year);
        return {
          student_year: year.student_year,
          application_id: year.application_id || '',
          sanctioned_amount: releasesEligible ? parseAmount(year.sanctioned_amount) : 0,
          semesters: (year.semesters || buildDefaultSemesters(meta?.semestersPerYear || 2)).map((semester) => ({
            student_semester: semester.student_semester,
            eligible: normalizeScholarshipStatusValue(semester.eligible) || ''
          })),
          releases: releasesEligible
            ? year.releases
              .filter((release) => (
                parseAmount(release.released_amount) > 0
                || release.rtf_released_date
              ))
              .map((release) => ({
                academic_year: release.academic_year || getAcademicYearLabel(meta, year.student_year, student),
                rtf_released_date: normalizeDateForInput(release.rtf_released_date) || null,
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
      toast.error(error.response?.data?.message || 'Failed to save scholarship history');
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
            disabled={saving}
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
                          <input
                            type="text"
                            value={year.application_id || ''}
                            onChange={(e) => updateYearField(yearIndex, 'application_id', e.target.value)}
                            className="w-full min-w-[100px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center"
                            placeholder="Application ID"
                          />
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
                              type="number"
                              min="0"
                              step="0.01"
                              value={year.sanctioned_amount ?? ''}
                              onChange={(e) => updateYearField(yearIndex, 'sanctioned_amount', e.target.value)}
                              className="w-full min-w-[100px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center"
                              placeholder="0"
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
                      <th className="px-2 py-2 font-bold whitespace-nowrap">RTF Released Date</th>
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
                              value={release.rtf_released_date || ''}
                              onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'rtf_released_date', e.target.value)}
                              className="w-full min-w-[130px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isEditingDisabled ? (
                            <span className="font-medium text-gray-800">{formatCurrency(release.released_amount)}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={release.released_amount}
                              onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'released_amount', e.target.value)}
                              className="w-full min-w-[110px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right"
                              placeholder="0"
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
    </div>
  );
};

export default StudentScholarshipHistoryTab;
