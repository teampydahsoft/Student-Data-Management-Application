import React from 'react';
import { User, CreditCard } from 'lucide-react';
import { getStaticFileUrlDirect } from '../config/api';

/**
 * Reusable Digital Student ID Card.
 * Accepts a student object (e.g. displayData, editData) and optional getStudentData helper for nested student_data.
 * compact=true renders a smaller inline version for the profile header.
 */
const DigitalStudentCard = ({ student, getStudentData, className = '', compact = false }) => {
  if (!student) return null;

  const get = (key, fallback = '') => {
    const v = student[key];
    if (v !== undefined && v !== null && v !== '') return String(v);
    if (typeof getStudentData === 'function') {
      const mapped = {
        student_name: 'Student Name',
        admission_number: 'Admission Number',
        pin_no: 'PIN Number',
        college: 'College',
        course: 'Program',
        branch: 'Branch',
        current_year: 'Year',
        current_semester: 'Semister',
        batch: 'Batch',
        stud_type: 'StudType'
      };
      const label = mapped[key];
      if (label) return getStudentData(label, fallback) || fallback;
    }
    return fallback;
  };

  const photoUrl = student.student_photo
    ? (student.student_photo.startsWith('http') || student.student_photo.startsWith('data:'))
      ? student.student_photo
      : getStaticFileUrlDirect(student.student_photo)
    : '';

  const name = get('student_name', '—');
  const pinNumber = get('pin_no', '') || get('admission_number', '—');
  const college = get('college', '—');
  const program = get('course', '—');
  const branch = get('branch', '—');
  const year = get('current_year', '—');
  const semester = get('current_semester', '—');
  const batch = get('batch', '—');
  const studType = get('stud_type', 'Student');

  if (compact) {
    return (
      <div
        className={`rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden flex items-center gap-2 p-2 ${className}`}
        style={{ maxWidth: '200px' }}
      >
        <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; const n = e.target.nextElementSibling; if (n) n.classList.remove('hidden'); }} />
          ) : null}
          <div className={`w-full h-full flex items-center justify-center ${photoUrl ? 'hidden' : ''}`}>
            <User className="w-6 h-6 text-slate-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-900 truncate" title={name}>{name}</p>
          <p className="text-[10px] font-mono text-indigo-600">{pinNumber}</p>
          <p className="text-[10px] text-slate-500 truncate">{college}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-lg overflow-hidden pb-2 mb-3 ${className}`}
      style={{ maxWidth: '340px' }}
    >
      {/* Card header strip */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-4 py-2 flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-white/90" />
        <span className="text-sm font-bold text-white uppercase tracking-wide">Digital Student ID</span>
      </div>

      <div className="p-4 flex gap-4">
        {/* Photo */}
        <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-2 border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
                const next = e.target.nextElementSibling;
                if (next) next.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-full h-full flex items-center justify-center ${photoUrl ? 'hidden' : ''}`}>
            <User className="w-10 h-10 text-slate-400" />
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-base font-bold text-slate-900 truncate" title={name}>{name}</p>
          <p className="text-xs font-mono font-semibold text-indigo-600">PIN: {pinNumber}</p>
          <p className="text-xs text-slate-600 font-medium truncate" title={college}>{college}</p>
          <p className="text-xs text-slate-500">
            {program} · {branch}
          </p>
          <p className="text-xs text-slate-500">
            Yr {year} · Sem {semester} {batch ? `· ${batch}` : ''}
          </p>
          <span className="inline-block mt-2 mb-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase">
            {studType}
          </span>
        </div>
      </div>
      {/* Extra bottom padding to prevent overlap with content below (e.g. CONV/MANG section) */}
      <div className="h-2" aria-hidden="true" />
    </div>
  );
};

export default DigitalStudentCard;
