import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, Loader2, AlertTriangle, GraduationCap } from 'lucide-react';
import api from '../../config/api';
import LoadingAnimation from '../LoadingAnimation';
import toast from 'react-hot-toast';

import { SCHOLARSHIP_ELIGIBLE_OPTIONS } from '../../config/scholarshipConfig';

const ELIGIBLE_OPTIONS = ['', ...SCHOLARSHIP_ELIGIBLE_OPTIONS];

const emptyRelease = () => ({
  id: null,
  from_date: '',
  to_date: '',
  proceeding: '',
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

const mapReleasesFromApi = (releases = []) => (
  (releases.length ? releases : [emptyRelease()]).map((release) => ({
    ...release,
    from_date: normalizeDateForInput(release.from_date),
    to_date: normalizeDateForInput(release.to_date),
    released_amount: release.released_amount === 0 ? '' : String(release.released_amount)
  }))
);

const StudentScholarshipHistoryTab = ({ student, readOnly = false, onUpdated }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [years, setYears] = useState([]);
  const [meta, setMeta] = useState(null);

  const admissionNumber = student?.admission_number || student?.admissionNumber;

  const fetchScholarship = useCallback(async () => {
    if (!admissionNumber) return;

    setLoading(true);
    try {
      const response = await api.get(`/student-scholarship/${encodeURIComponent(admissionNumber)}`);
      if (response.data.success) {
        const payload = response.data.data;
        setMeta(payload);
        setYears(
          (payload.years || []).map((year) => ({
            ...year,
            releases: mapReleasesFromApi(year.releases)
          }))
        );
      } else {
        toast.error(response.data.message || 'Failed to load scholarship history');
      }
    } catch (error) {
      console.error('Scholarship fetch error:', error);
      toast.error('Failed to load scholarship history');
    } finally {
      setLoading(false);
    }
  }, [admissionNumber]);

  useEffect(() => {
    fetchScholarship();
  }, [fetchScholarship]);

  const summaryYears = useMemo(
    () => years.map((year) => ({
      ...year,
      released_amount: sumReleased(year.releases)
    })),
    [years]
  );

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
        ? { ...year, releases: [...year.releases, emptyRelease()] }
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
      const payload = years.map((year) => ({
        student_year: year.student_year,
        application_id: year.application_id || '',
        eligible: year.eligible || '',
        sanctioned_amount: parseAmount(year.sanctioned_amount),
        releases: year.releases
          .filter((release) => (
            parseAmount(release.released_amount) > 0
            || release.from_date
            || release.to_date
            || (release.proceeding && release.proceeding.trim())
          ))
          .map((release) => ({
            from_date: normalizeDateForInput(release.from_date) || null,
            to_date: normalizeDateForInput(release.to_date) || null,
            proceeding: release.proceeding || '',
            released_amount: parseAmount(release.released_amount)
          }))
      }));

      const response = await api.put(`/student-scholarship/${encodeURIComponent(admissionNumber)}`, { years: payload });
      if (response.data.success) {
        toast.success('Scholarship history saved');
        const payloadData = response.data.data;
        setMeta(payloadData);
        setYears(
          (payloadData.years || []).map((year) => ({
            ...year,
            releases: mapReleasesFromApi(year.releases)
          }))
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-50 text-pink-600">
            <GraduationCap size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Student Scholarship</h3>
            <p className="text-xs text-gray-500">
              {meta?.student?.student_name || student?.student_name || admissionNumber}
              {meta?.totalYears ? ` · ${meta.totalYears} year(s)` : ''}
            </p>
          </div>
        </div>
        {!readOnly && (
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
                <th className="px-4 py-3 font-bold whitespace-nowrap">Year</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Application ID</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">Eligible</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap text-right">Sanctioned Amount</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap text-right">Released Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaryYears.map((year, yearIndex) => (
                <tr key={year.student_year} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">Year {year.student_year}</td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      <span className="text-gray-700">{year.application_id || '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={year.application_id || ''}
                        onChange={(e) => updateYearField(yearIndex, 'application_id', e.target.value)}
                        className="w-full min-w-[120px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                        placeholder="Application ID"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      <span className="text-gray-700 capitalize">{year.eligible || '—'}</span>
                    ) : (
                      <select
                        value={year.eligible || ''}
                        onChange={(e) => updateYearField(yearIndex, 'eligible', e.target.value)}
                        className="w-full min-w-[140px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs capitalize"
                      >
                        {ELIGIBLE_OPTIONS.map((option) => (
                          <option key={option || 'blank'} value={option}>
                            {option ? option : 'Select status'}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {readOnly ? (
                      <span className="font-medium text-gray-800">{formatCurrency(year.sanctioned_amount)}</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={year.sanctioned_amount ?? ''}
                        onChange={(e) => updateYearField(yearIndex, 'sanctioned_amount', e.target.value)}
                        className="w-full min-w-[110px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right"
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                    {formatCurrency(year.released_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Release Transactions</h4>
          <p className="text-[11px] text-gray-400 mt-1">
            Add multiple release entries per year. Released amounts are summed into the summary table above.
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {years.map((year, yearIndex) => (
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
                      <th className="px-2 py-2 font-bold whitespace-nowrap">From Date</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap">To Date</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap">Proceeding No.</th>
                      <th className="px-2 py-2 font-bold whitespace-nowrap text-right">Released Amount</th>
                      {!readOnly && <th className="px-2 py-2 font-bold whitespace-nowrap text-center w-20">Add</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {year.releases.map((release, releaseIndex) => (
                      <tr key={`${year.student_year}-${releaseIndex}`}>
                        <td className="px-2 py-2">
                          {readOnly ? (
                            <span className="text-gray-700">{formatCalendarDate(release.from_date) || '—'}</span>
                          ) : (
                            <input
                              type="date"
                              value={release.from_date || ''}
                              onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'from_date', e.target.value)}
                              className="w-full min-w-[130px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {readOnly ? (
                            <span className="text-gray-700">{formatCalendarDate(release.to_date) || '—'}</span>
                          ) : (
                            <input
                              type="date"
                              value={release.to_date || ''}
                              onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'to_date', e.target.value)}
                              className="w-full min-w-[130px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {readOnly ? (
                            <span className="text-gray-700">{release.proceeding || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={release.proceeding || ''}
                              onChange={(e) => updateReleaseField(yearIndex, releaseIndex, 'proceeding', e.target.value)}
                              className="w-full min-w-[140px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                              placeholder="Proceeding no."
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {readOnly ? (
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
                        {!readOnly && (
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
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudentScholarshipHistoryTab;
