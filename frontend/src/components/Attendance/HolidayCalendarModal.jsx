import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, CheckCircle } from 'lucide-react';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_META = {
  submitted: {
    label: 'Submitted',
    badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200'
  },
  not_marked: {
    label: 'Not marked',
    badgeClass: 'bg-rose-100 text-rose-700 border border-rose-200'
  },
  pending: {
    label: 'Pending',
    badgeClass: 'bg-amber-100 text-amber-700 border border-amber-200'
  },
  upcoming: {
    label: 'Upcoming',
    badgeClass: 'bg-blue-100 text-blue-700 border border-blue-200'
  }
};

const normalizeDateToIST = (dateStr) => {
  if (!dateStr) return '';
  // If it's already YYYY-MM-DD, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // If it's an ISO string, convert to IST date (YYYY-MM-DD)
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    return dateStr;
  }
};

const formatIsoDate = (isoDate, formatOptions = {}) => {
  if (!isoDate) return '';

  // First normalize to YYYY-MM-DD in IST to ensure we mean the correct day
  const normalizedDate = normalizeDateToIST(isoDate);

  // Then create a local date at midnight for formatting
  const date = new Date(`${normalizedDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, formatOptions);
};

const parseMonthKey = (monthKey) => {
  if (!monthKey) return null;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (Number.isNaN(year) || Number.isNaN(month)) return null;
  return { year, month };
};

const buildCalendarMatrix = (monthKey) => {
  const parts = parseMonthKey(monthKey);
  if (!parts) return [];

  const { year, month } = parts;
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = firstDay.getUTCDay(); // 0 (Sun) - 6 (Sat)

  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cells = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayOffset = index - startWeekday + 1;
    const cellDate = new Date(Date.UTC(year, month - 1, dayOffset));
    const isCurrentMonth = dayOffset >= 1 && dayOffset <= daysInMonth;
    const isoDate = `${cellDate.getUTCFullYear()}-${String(cellDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
      cellDate.getUTCDate()
    ).padStart(2, '0')}`;
    cells.push({
      index,
      isCurrentMonth,
      isoDate,
      day: cellDate.getUTCDate(),
      weekday: cellDate.getUTCDay()
    });
  }

  return cells;
};

const formatFriendlyDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
};

const HolidayCalendarModal = ({
  isOpen,
  onClose,
  monthKey,
  onMonthChange,
  selectedDate,
  onSelectDate,
  calendarData,
  loading = false,
  error = null,
  onRetry,
  onCreateHoliday,
  onRemoveHoliday,
  mutationLoading = false,
  isAdmin = false,
  upcomingHolidays = [],
  nonWorkingDayDetails = null,
  selectedDateStatus = null,
  statusSummaryMeta = {},
  presentCount = 0,
  absentCount = 0,
  unmarkedCount = 0,
  lastUpdatedAt = null,
  editingLockReason = null,
  calendarError = null,
  onRetryCalendarFetch = null
}) => {
  const [localTitle, setLocalTitle] = useState('');
  const [localDescription, setLocalDescription] = useState('');

  const data = calendarData || {
    sundays: [],
    publicHolidays: [],
    customHolidays: [],
    attendanceStatus: {},
    attendanceCounts: {}
  };

  const calendarCells = useMemo(() => buildCalendarMatrix(monthKey), [monthKey]);

  const publicHolidayMap = useMemo(() => {
    const map = new Map();
    (data.publicHolidays || []).forEach((holiday) => {
      // Normalize date to YYYY-MM-DD format for consistent matching
      const normalizedDate = normalizeDateToIST(holiday.date);
      if (normalizedDate) {
        map.set(normalizedDate, holiday);
      }
    });
    return map;
  }, [data.publicHolidays]);

  const customHolidayMap = useMemo(() => {
    const map = new Map();
    (data.customHolidays || []).forEach((holiday) => {
      // Normalize date to YYYY-MM-DD format for consistent matching
      const normalizedDate = normalizeDateToIST(holiday.date);
      if (normalizedDate) {
        map.set(normalizedDate, holiday);
      }
    });
    return map;
  }, [data.customHolidays]);

  const attendanceStatusMap = useMemo(() => {
    const entries = data.attendanceStatus && typeof data.attendanceStatus === 'object'
      ? data.attendanceStatus
      : {};
    return new Map(Object.entries(entries));
  }, [data.attendanceStatus]);

  const sundaySet = useMemo(() => new Set(data.sundays || []), [data.sundays]);

  const selectedHolidayDetails = useMemo(() => {
    if (!selectedDate) return null;
    // Normalize selected date to YYYY-MM-DD format for consistent matching
    const normalizedSelectedDate = selectedDate.split('T')[0];
    const publicHoliday = publicHolidayMap.get(normalizedSelectedDate);
    const customHoliday = customHolidayMap.get(normalizedSelectedDate);
    const isSunday = sundaySet.has(normalizedSelectedDate);
    const status = attendanceStatusMap.get(normalizedSelectedDate) || null;

    return {
      publicHoliday,
      customHoliday,
      isSunday,
      status
    };
  }, [selectedDate, publicHolidayMap, customHolidayMap, sundaySet, attendanceStatusMap]);

  const monthLabel = useMemo(() => {
    const parts = parseMonthKey(monthKey);
    if (!parts) return '';
    return `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
  }, [monthKey]);

  const handlePrevMonth = () => {
    if (!monthKey || !onMonthChange) return;
    const parts = parseMonthKey(monthKey);
    if (!parts) return;
    const prev = new Date(Date.UTC(parts.year, parts.month - 2, 1));
    onMonthChange(`${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    if (!monthKey || !onMonthChange) return;
    const parts = parseMonthKey(monthKey);
    if (!parts) return;
    const next = new Date(Date.UTC(parts.year, parts.month, 1));
    onMonthChange(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const handleDayClick = (cell) => {
    if (!cell.isCurrentMonth) return;
    if (!onSelectDate) return;
    onSelectDate(cell.isoDate);

    const customHoliday = customHolidayMap.get(cell.isoDate);
    if (customHoliday) {
      setLocalTitle(customHoliday.title || '');
      setLocalDescription(customHoliday.description || '');
    } else {
      setLocalTitle('');
      setLocalDescription('');
    }
  };

  useEffect(() => {
    if (!selectedDate) {
      setLocalTitle('');
      setLocalDescription('');
      return;
    }

    const customHoliday = customHolidayMap.get(selectedDate);
    if (customHoliday) {
      setLocalTitle(customHoliday.title || '');
      setLocalDescription(customHoliday.description || '');
    } else {
      setLocalTitle('');
      setLocalDescription('');
    }
  }, [selectedDate, customHolidayMap]);

  const handleCreateHoliday = () => {
    if (!selectedDate || !onCreateHoliday) return;
    const payload = {
      date: selectedDate,
      title: localTitle || 'Holiday',
      description: localDescription
    };
    onCreateHoliday(payload);
  };

  const handleRemoveHoliday = () => {
    if (!selectedDate || !onRemoveHoliday) return;
    onRemoveHoliday(selectedDate);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-6 overflow-y-auto">
      <div className="relative w-full max-w-7xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-3 text-blue-600">
              <CalendarDays size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Attendance Calendar</h2>
              <p className="text-sm text-gray-500">
                Review public holidays, institute breaks, and mark custom holidays.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close calendar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 border-b border-gray-200 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-6 py-4">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">{monthLabel}</div>
                <div className="text-xs text-gray-500">
                  {loading ? 'Loading calendar…' : 'Tap a date to view details'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 px-4 pb-3 text-center text-xs font-semibold uppercase text-gray-500">
              {WEEKDAY_NAMES.map((name) => (
                <div key={name} className="py-2">
                  {name}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 px-4 pb-6">
              {calendarCells.map((cell) => {
                const status = attendanceStatusMap.get(cell.isoDate) || null;
                const isSelected = selectedDate === cell.isoDate;
                const isSunday = sundaySet.has(cell.isoDate);
                const publicHoliday = publicHolidayMap.get(cell.isoDate);
                const customHoliday = customHolidayMap.get(cell.isoDate);
                const isHoliday = Boolean(publicHoliday || customHoliday || isSunday);
                const statusInfo = status && STATUS_META[status];

                // Determine cell background color based on day type
                // Use distinct colors to differentiate holidays from "Not marked" status (which uses red)
                let cellBgColor = 'bg-white';
                if (isHoliday) {
                  if (publicHoliday) {
                    cellBgColor = 'bg-orange-50'; // Changed from red to orange to differentiate from "Not marked"
                  } else if (customHoliday) {
                    cellBgColor = 'bg-purple-50';
                  } else if (isSunday) {
                    cellBgColor = 'bg-amber-50';
                  }
                } else {
                  cellBgColor = 'bg-blue-50';
                }

                const badgeColor = isHoliday
                  ? publicHoliday
                    ? 'bg-orange-100 text-orange-700 border border-orange-300' // Changed from red to orange
                    : customHoliday
                      ? 'bg-purple-100 text-purple-700 border border-purple-300'
                      : 'bg-amber-100 text-amber-700 border border-amber-300'
                  : 'bg-blue-100 text-blue-700 border border-blue-300';

                const baseClasses = cell.isCurrentMonth
                  ? 'cursor-pointer hover:border-blue-500 hover:text-blue-600'
                  : 'cursor-not-allowed text-gray-300';

                return (
                  <button
                    key={cell.index}
                    type="button"
                    onClick={() => handleDayClick(cell)}
                    disabled={!cell.isCurrentMonth}
                    className={`flex h-28 flex-col justify-between rounded-lg border py-2 px-1 text-sm transition-colors ${isSelected
                      ? 'border-blue-500 bg-blue-100 text-blue-800 shadow-md ring-2 ring-blue-300'
                      : `${cellBgColor} text-gray-700 ${baseClasses}`
                      }`}
                  >
                    <span className="font-semibold text-base">{cell.day}</span>

                    {/* Show present/absent counts for non-holiday dates */}
                    {!isHoliday && data.attendanceCounts && data.attendanceCounts[cell.isoDate] && (
                      <div className="flex flex-col gap-0.5 text-[10px] font-semibold leading-tight">
                        <span className="text-green-700">P: {data.attendanceCounts[cell.isoDate].present}</span>
                        <span className="text-red-700">A: {data.attendanceCounts[cell.isoDate].absent}</span>
                      </div>
                    )}

                    {isHoliday && (
                      <span className={`mx-2 rounded-md px-2 py-1 text-[10px] font-semibold ${badgeColor}`}>
                        {publicHoliday
                          ? 'Public Holiday'
                          : customHoliday
                            ? 'Institute Holiday'
                            : 'Sunday'}
                      </span>
                    )}
                    {!isHoliday && !data.attendanceCounts?.[cell.isoDate] && <span className="h-2" />}
                    {/* Only show attendance status if it's not a holiday */}
                    {!isHoliday && statusInfo && (
                      <span
                        className={`mx-2 rounded-md px-2 py-1 text-[10px] font-semibold ${statusInfo.badgeClass}`}
                      >
                        {statusInfo.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold uppercase tracking-wide text-red-800">
                    Calendar data unavailable
                  </div>
                  <div>{error}</div>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:text-red-800"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="w-full max-w-full px-6 py-5 lg:w-[420px] space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
            {/* Selected Date Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Selected Date</h3>
                {selectedDate && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                    {formatIsoDate(selectedDate, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                )}
              </div>

              {/* Non-working Day Warning */}
              {nonWorkingDayDetails?.isNonWorkingDay && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <div className="font-semibold uppercase tracking-wide text-amber-800">
                      Non-working day
                    </div>
                    <div>{nonWorkingDayDetails.reasons?.join('. ') || 'Holiday'}</div>
                  </div>
                </div>
              )}

              {/* Calendar Error */}
              {calendarError && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <div className="font-semibold uppercase tracking-wide text-red-800">
                      Calendar sync unavailable
                    </div>
                    <div>{calendarError}</div>
                    {onRetryCalendarFetch && (
                      <button
                        type="button"
                        onClick={onRetryCalendarFetch}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800 underline decoration-dotted"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upcoming Holidays */}
              {!calendarError && upcomingHolidays.length > 0 && (
                <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
                  <div className="font-semibold uppercase tracking-wide text-blue-800 mb-2">Upcoming holidays</div>
                  <div className="space-y-2">
                    {upcomingHolidays.map((holiday) => (
                      <div key={`${holiday.type}-${holiday.date}`} className="flex items-center justify-between gap-2">
                        <span className="font-medium">{formatFriendlyDate(holiday.date)}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs">{holiday.label}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${holiday.type === 'public'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-purple-100 text-purple-700'
                              }`}
                          >
                            {holiday.type === 'public' ? 'Public' : 'Institute'}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Editing Lock Reason */}
              {!nonWorkingDayDetails?.isNonWorkingDay && editingLockReason && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                  {editingLockReason}
                </div>
              )}

              {/* Status Summary */}
              {selectedDateStatus &&
                selectedDateStatus !== 'holiday' &&
                statusSummaryMeta[selectedDateStatus] && (
                  <div
                    className={`rounded-md border px-3 py-2 text-xs font-semibold ${statusSummaryMeta[selectedDateStatus].className || 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                  >
                    {statusSummaryMeta[selectedDateStatus].message || selectedDateStatus}
                  </div>
                )}

              {/* Attendance Summary */}
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
                  Attendance Summary
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Present:</span>
                    <span className="font-semibold text-green-600">{presentCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Absent:</span>
                    <span className="font-semibold text-red-600">{absentCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Pending:</span>
                    <span className="font-semibold text-gray-600">{unmarkedCount}</span>
                  </div>
                </div>
                {lastUpdatedAt && (
                  <div className="mt-2 text-xs text-gray-500 border-t border-gray-200 pt-2">
                    Last updated: {new Date(lastUpdatedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>

            {!selectedDate && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                Choose a date on the calendar to view holiday details or mark an institute break.
              </div>
            )}

            {selectedDate && (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
                  <div className="font-semibold text-blue-900">
                    {selectedHolidayDetails?.publicHoliday
                      ? selectedHolidayDetails.publicHoliday.localName ||
                      selectedHolidayDetails.publicHoliday.name
                      : selectedHolidayDetails?.customHoliday
                        ? selectedHolidayDetails.customHoliday.title || 'Institute Holiday'
                        : selectedHolidayDetails?.isSunday
                          ? 'Sunday'
                          : 'Instructional Day'}
                  </div>
                  <div className="mt-1 text-xs text-blue-600">
                    {selectedHolidayDetails?.publicHoliday
                      ? selectedHolidayDetails.publicHoliday.name
                      : selectedHolidayDetails?.customHoliday?.description
                        ? selectedHolidayDetails.customHoliday.description
                        : selectedHolidayDetails?.isSunday
                          ? 'Weekly holiday'
                          : 'Classes are expected to be held on this date.'}
                  </div>
                </div>
                {/* Only show attendance status if it's not a holiday */}
                {selectedHolidayDetails?.status &&
                  selectedHolidayDetails.status !== 'holiday' &&
                  !selectedHolidayDetails?.customHoliday &&
                  !selectedHolidayDetails?.publicHoliday &&
                  !selectedHolidayDetails?.isSunday && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${STATUS_META[selectedHolidayDetails.status]?.badgeClass ||
                        'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                    >
                      {STATUS_META[selectedHolidayDetails.status]?.label ||
                        selectedHolidayDetails.status}
                    </div>
                  )}

                {isAdmin && (
                  <div className="space-y-3">
                    {/* Only show holiday form if the date is NOT already an institute holiday */}
                    {!selectedHolidayDetails?.customHoliday ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                            Holiday title
                          </label>
                          <input
                            type="text"
                            value={localTitle}
                            onChange={(event) => setLocalTitle(event.target.value)}
                            placeholder="e.g. Founders\' Day"
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={mutationLoading}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                            Notes (visible to staff)
                          </label>
                          <textarea
                            value={localDescription}
                            onChange={(event) => setLocalDescription(event.target.value)}
                            placeholder="Optional: add a note for this holiday"
                            rows={3}
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={mutationLoading}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleCreateHoliday}
                            disabled={mutationLoading}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                          >
                            {mutationLoading ? (
                              <>
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Saving…
                              </>
                            ) : (
                              'Save Institute Holiday'
                            )}
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Show remove button if already an institute holiday */
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleRemoveHoliday}
                          disabled={mutationLoading}
                          className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {mutationLoading ? (
                            <>
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                              Removing…
                            </>
                          ) : (
                            'Remove Institute Holiday'
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 space-y-3 border-t border-gray-200 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Calendar Legend
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 rounded border-2 border-orange-300 bg-orange-50" />
                  <span className="font-medium">Public Holiday</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 rounded border-2 border-purple-300 bg-purple-50" />
                  <span className="font-medium">Institute Holiday</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 rounded border-2 border-amber-300 bg-amber-50" />
                  <span className="font-medium">Sunday</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 rounded border-2 border-blue-300 bg-blue-50" />
                  <span className="font-medium">Working Day</span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Attendance Status
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 rounded-full border border-emerald-200 bg-emerald-100" />
                    <span>Submitted</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 rounded-full border border-rose-200 bg-rose-100" />
                    <span>Not marked</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 rounded-full border border-amber-200 bg-amber-100" />
                    <span>Pending</span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  This month&apos;s holidays
                </div>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-2 text-sm text-gray-600">
                  {data.publicHolidays?.length === 0 &&
                    data.customHolidays?.length === 0 &&
                    data.sundays?.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                      No holidays recorded for this month yet.
                    </div>
                  ) : (
                    <>
                      {(data.publicHolidays || []).map((holiday) => (
                        <div
                          key={`public-${holiday.date}`}
                          className="flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-2 text-orange-700"
                        >
                          <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-orange-400" />
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-orange-800">
                              {formatIsoDate(holiday.date, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </div>
                            <div className="text-sm font-semibold">
                              {holiday.localName || holiday.name}
                            </div>
                            {holiday.name && holiday.localName && holiday.localName !== holiday.name && (
                              <div className="text-xs text-orange-600">{holiday.name}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      {(data.customHolidays || []).map((holiday) => (
                        <div
                          key={`custom-${holiday.date}`}
                          className="flex items-start gap-2 rounded-lg border border-purple-100 bg-purple-50 p-2 text-purple-700"
                        >
                          <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-purple-400" />
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-purple-800">
                              {formatIsoDate(holiday.date, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </div>
                            <div className="text-sm font-semibold">{holiday.title || 'Institute Holiday'}</div>
                            {holiday.description && (
                              <div className="text-xs text-purple-600">{holiday.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      {(data.sundays || []).map((iso) => (
                        <div
                          key={`sunday-${iso}`}
                          className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-2 text-amber-700"
                        >
                          <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                              {formatIsoDate(iso, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </div>
                            <div className="text-sm font-semibold">Sunday</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default HolidayCalendarModal;

