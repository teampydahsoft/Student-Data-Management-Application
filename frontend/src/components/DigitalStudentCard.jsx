import React from 'react';
import { User, CreditCard } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
  const studentMobile = get('student_mobile', '') || getStudentData('Student Mobile number', '—') || getStudentData('student_mobile', '—');
  const parentMobile = get('parent_mobile1', '') || getStudentData('Parent Mobile Number 1', '—') || getStudentData('parent_mobile1', '—');
  const studType = get('stud_type', 'Student');
  const address = get('student_address', '') || getStudentData('student_address', '') || get('address', '') || getStudentData('Address', '');
  const city = get('city', '') || getStudentData('City', '');
  const state = get('state', '') || getStudentData('State', '');

  const buildAddressString = () => {
    const parts = [address, city, state].filter(p => p !== '');
    return parts.length > 0 ? parts.join(', ') : '—';
  };
  const fullAddress = buildAddressString();

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
      className={`rounded-[2rem] border border-gray-200 bg-[#f8f9fa] shadow-2xl overflow-hidden relative flex flex-col ${className}`}
      style={{ maxWidth: '380px', minHeight: '520px', fontFamily: "'Inter', sans-serif" }}
    >
      {/* Top Graphic Shapes (Red Theme) */}
      <div className="absolute top-0 left-0 right-0 h-44 overflow-hidden pointer-events-none z-0">
        <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,0 L400,0 L400,20 L180,120 L0,40 Z" fill="#b91c1c" /> {/* Dark Red */}
          <path d="M400,20 L400,80 L220,160 Z" fill="#ef4444" opacity="0.8" /> {/* Lighter Red */}
          <path d="M0,40 L180,120 L220,160 L0,200 Z" fill="#dc2626" opacity="0.9" /> {/* Mid Red */}
        </svg>
      </div>

      <div className="flex-1 flex flex-col relative z-10 w-full pt-5 pb-10">
        {/* Logo at Top Center */}
        <div className="w-full flex justify-center mb-5">
          <div className="bg-white/90 backdrop-blur-md p-2 rounded-xl shadow-sm h-[76px] inline-flex items-center justify-center border border-white/50 relative z-20">
            <img src="/logo.png" alt="College Logo" className="h-full w-auto object-contain" />
          </div>
        </div>

        <div className="px-6 flex flex-col flex-1">
          {/* Top Split Area: Photo on Left, Details on Right */}
          <div className="flex flex-row items-center w-full gap-5">
            {/* Left: Photo */}
            <div className="flex flex-col items-center">
              <div className="w-28 h-28 rounded-xl border-4 border-white shadow-lg bg-gray-50 overflow-hidden flex-shrink-0 flex items-center justify-center relative z-10 mb-2">
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
                <div className={`w-full h-full flex flex-col items-center justify-center ${photoUrl ? 'hidden' : ''}`}>
                  <User className="w-12 h-12 text-gray-300" />
                </div>
              </div>
              <span className="inline-block px-3 py-1 rounded-md bg-[#b91c1c] text-white text-[10px] sm:text-[11px] font-bold tracking-wide shadow-sm text-center min-w-[100px] truncate">
                {program} {branch && branch !== '—' ? `- ${branch}` : ''}
              </span>
            </div>

            {/* Right: Primary Info */}
            <div className="flex flex-col space-y-2.5 flex-1 min-w-0">
              <div className="flex items-center text-[11px] sm:text-xs">
                <span className="font-bold text-gray-500 w-[56px] tracking-wide uppercase shrink-0">PIN</span>
                <span className="font-bold text-gray-300 mx-0.5 shrink-0">:</span>
                <span className="font-bold text-gray-800 flex-1 truncate">{pinNumber}</span>
              </div>
              <div className="flex items-center text-[11px] sm:text-xs">
                <span className="font-bold text-gray-500 w-[56px] tracking-wide uppercase shrink-0">BATCH</span>
                <span className="font-bold text-gray-300 mx-0.5 shrink-0">:</span>
                <span className="font-bold text-gray-800 flex-1 truncate">{batch}</span>
              </div>
              <div className="flex items-center text-[11px] sm:text-xs">
                <span className="font-bold text-gray-500 w-[56px] tracking-wide uppercase shrink-0">STUDENT</span>
                <span className="font-bold text-gray-300 mx-0.5 shrink-0">:</span>
                <span className="font-bold text-gray-800 flex-1 truncate">{studentMobile}</span>
              </div>
              <div className="flex items-center text-[11px] sm:text-xs">
                <span className="font-bold text-gray-500 w-[56px] tracking-wide uppercase shrink-0">PARENT</span>
                <span className="font-bold text-gray-300 mx-0.5 shrink-0">:</span>
                <span className="font-bold text-gray-800 flex-1 truncate">{parentMobile}</span>
              </div>
            </div>
          </div>

          {/* Student Name */}
          <div className="w-full text-left mt-5 mb-1 pl-1">
            <h1 className="text-xl sm:text-[22px] font-bold text-[#1e293b] leading-tight capitalize" title={name}>
              {name.toLowerCase()}
            </h1>
          </div>

          {/* Bottom Section: Address & QR Code */}
          <div className="w-full flex items-start justify-between mt-auto pt-3 border-t border-gray-200 border-dashed gap-3">
            {/* Left: Address */}
            <div className="flex flex-col text-[10px] sm:text-[11px] flex-1 min-w-0 pr-1 pl-1">
              <span className="font-bold text-gray-400 tracking-wider uppercase mb-0.5">ADDRESS</span>
              <span className="font-semibold text-gray-700 leading-snug break-words">
                {fullAddress}
              </span>
            </div>

            {/* Right: QR Code */}
            <div className="bg-white p-1 rounded-xl border border-gray-100 shadow-sm flex-shrink-0 mr-1">
              <QRCodeSVG
                value={`Name: ${name} | PIN: ${pinNumber} | College: ${college} | Program: ${program}-${branch} | Batch: ${batch}`}
                size={96}
                level="M"
                includeMargin={false}
                fgColor="#1f2937"
              />
            </div>
          </div>
        </div>
      </div>

      {/* College Footer */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#b91c1c] py-3 px-4 flex items-center justify-center rounded-b-[2rem] z-20 shadow-lg border-t border-red-800">
        <span className="text-white text-[10px] sm:text-xs font-bold tracking-widest uppercase text-center truncate">{college}</span>
      </div>
    </div>
  );
};
export default DigitalStudentCard;
