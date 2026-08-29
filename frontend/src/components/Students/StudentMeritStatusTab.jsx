import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Loader2, Save, AlertTriangle } from 'lucide-react';
import api from '../../config/api';
import LoadingAnimation from '../LoadingAnimation';
import toast from 'react-hot-toast';
import {
  MERIT_STATUS_OPTIONS,
  formatMeritStatusDisplay
} from '../../config/studentProgramYears';

const StudentMeritStatusTab = ({
  student,
  readOnly = false,
  onUpdated
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [years, setYears] = useState([]);
  const [meta, setMeta] = useState(null);

  const admissionNumber = student?.admission_number || student?.admissionNumber;
  const isEditingDisabled = readOnly;

  const fetchMeritStatus = useCallback(async () => {
    if (!admissionNumber) return;

    setLoading(true);
    try {
      const response = await api.get(`/student-merit-status/${encodeURIComponent(admissionNumber)}`);
      if (response.data.success) {
        const payload = response.data.data;
        setMeta(payload);
        setYears(payload.years || []);
      } else {
        toast.error(response.data.message || 'Failed to load merit status');
      }
    } catch (error) {
      console.error('Merit status fetch error:', error);
      toast.error('Failed to load merit status');
    } finally {
      setLoading(false);
    }
  }, [admissionNumber]);

  useEffect(() => {
    fetchMeritStatus();
  }, [fetchMeritStatus]);

  const updateYearStatus = (studentYear, meritStatus) => {
    setYears((prev) => prev.map((entry) => (
      entry.student_year === studentYear
        ? { ...entry, merit_status: meritStatus }
        : entry
    )));
  };

  const hasPartialBranch = Boolean(meta?.partialBranch);
  const hasOptionalYear = (meta?.years || years).some((entry) => entry.isOptionalYear);

  const summary = useMemo(() => {
    const yesCount = years.filter((entry) => entry.merit_status === 'yes').length;
    const noCount = years.filter((entry) => entry.merit_status === 'no').length;
    const unsetCount = years.filter((entry) => !entry.merit_status).length;
    return { yesCount, noCount, unsetCount };
  }, [years]);

  const handleSave = async () => {
    if (!admissionNumber || isEditingDisabled) return;

    setSaving(true);
    try {
      const payload = years
        .filter((entry) => entry.editable !== false)
        .map((entry) => ({
          student_year: entry.student_year,
          merit_status: entry.merit_status || ''
        }));

      const response = await api.put(
        `/student-merit-status/${encodeURIComponent(admissionNumber)}`,
        { years: payload }
      );

      if (response.data.success) {
        toast.success('Merit status saved');
        const data = response.data.data;
        setMeta(data);
        setYears(data.years || []);
        onUpdated?.(data);
      } else {
        toast.error(response.data.message || 'Failed to save merit status');
      }
    } catch (error) {
      console.error('Merit status save error:', error);
      toast.error(error.response?.data?.message || 'Failed to save merit status');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <LoadingAnimation message="Loading merit status..." />
      </div>
    );
  }

  if (!years.length) {
    return (
      <div className="py-20 flex flex-col items-center gap-3 text-gray-500">
        <AlertTriangle size={28} />
        <p>No program years configured for this student&apos;s course/branch.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-indigo-50 bg-indigo-50/40 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-indigo-600" />
            <h4 className="text-sm font-bold text-gray-900">Merit Status by Year</h4>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 ml-auto">
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
              Yes: {summary.yesCount}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
              No: {summary.noCount}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
              Unset: {summary.unsetCount}
            </span>
          </div>
        </div>

        {(hasPartialBranch || hasOptionalYear) && (
          <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-100 text-[11px] text-amber-800">
            {hasPartialBranch && (
              <p>
                Branch years are shown for {meta?.student?.branch || student?.branch} (partial-course branch mapping applied).
              </p>
            )}
            {hasOptionalYear && (
              <p>Optional additional year from branch settings is included where configured.</p>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 font-bold whitespace-nowrap">Program Year</th>
                {hasPartialBranch && (
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Course Year</th>
                )}
                <th className="px-4 py-2.5 font-bold whitespace-nowrap">Academic Year</th>
                <th className="px-4 py-2.5 font-bold whitespace-nowrap">Merit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {years.map((entry) => {
                const isEditable = !isEditingDisabled && entry.editable !== false;
                const isCurrent = Number(entry.student_year) === Number(meta?.currentYear || student?.current_year);

                return (
                  <tr
                    key={entry.student_year}
                    className={isCurrent ? 'bg-indigo-50/40' : 'bg-white'}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{entry.label}</span>
                        {entry.isOptionalYear && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            Optional
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    {hasPartialBranch && (
                      <td className="px-4 py-3 text-gray-600">
                        Year {entry.courseYear}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-600">
                      {entry.academic_year_label || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {isEditable ? (
                        <select
                          value={entry.merit_status || ''}
                          onChange={(e) => updateYearStatus(entry.student_year, e.target.value)}
                          className="min-w-[120px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          {MERIT_STATUS_OPTIONS.map((option) => (
                            <option key={option.value || 'unset'} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          entry.merit_status === 'yes'
                            ? 'bg-green-50 text-green-700 border border-green-100'
                            : entry.merit_status === 'no'
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}>
                          {formatMeritStatusDisplay(entry.merit_status)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!isEditingDisabled && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Merit Status'}
          </button>
        </div>
      )}
    </div>
  );
};

export default StudentMeritStatusTab;
