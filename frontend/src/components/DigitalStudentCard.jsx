import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getStaticFileUrlDirect } from '../config/api';
import api from '../config/api';

// Module-level token cache: admissionNumber → qrToken
const _qrTokenCache = {};
// Module-level photo cache: admissionNumber → data URL / path
const _photoCache = {};

const resolvePhotoUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '{}' || trimmed === 'null') return '';
  if (trimmed.startsWith('http') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  return getStaticFileUrlDirect(trimmed);
};

/**
 * Reusable Digital Student ID Card.
 * Accepts a student object (e.g. displayData, editData) and optional getStudentData helper for nested student_data.
 * compact=true renders a smaller inline version for the profile header.
 */
const DigitalStudentCard = ({ student, getStudentData, className = '', compact = false }) => {
  const [qrToken, setQrToken] = useState(null);
  const [fetchedPhoto, setFetchedPhoto] = useState('');

  const admNo = student?.admission_number || student?.admission_no || '';

  useEffect(() => {
    if (!admNo) return;
    if (_qrTokenCache[admNo]) { setQrToken(_qrTokenCache[admNo]); return; }
    api.get(`/qr/token/${encodeURIComponent(admNo)}`)
      .then(r => {
        if (r.data?.success && r.data.data?.token) {
          _qrTokenCache[admNo] = r.data.data.token;
          setQrToken(r.data.data.token);
        }
      })
      .catch(() => { /* not authenticated / network error — QR will use origin URL fallback */ });
  }, [admNo]);

  useEffect(() => {
    if (!student) {
      setFetchedPhoto('');
      return;
    }
    const fromField = resolvePhotoUrl(student.student_photo);
    if (fromField) {
      setFetchedPhoto(fromField);
      return;
    }
    if (!admNo) {
      setFetchedPhoto('');
      return;
    }
    if (_photoCache[admNo]) {
      setFetchedPhoto(_photoCache[admNo]);
      return;
    }
    let cancelled = false;
    api.get(`/students/${encodeURIComponent(admNo)}/photo`)
      .then((r) => {
        if (cancelled) return;
        const raw = r.data?.success ? r.data.data : null;
        const url = resolvePhotoUrl(typeof raw === 'string' ? raw : '');
        if (url) {
          _photoCache[admNo] = url;
          setFetchedPhoto(url);
        } else {
          setFetchedPhoto('');
        }
      })
      .catch(() => {
        if (!cancelled) setFetchedPhoto('');
      });
    return () => { cancelled = true; };
  }, [admNo, student, student?.student_photo]);

  if (!student) return null;

  const fromStudentDataJson = (key, fallback = '') => {
    const sd = student.student_data;
    if (!sd || typeof sd !== 'object') return fallback;
    const val = sd[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') return String(val);
    const foundKey = Object.keys(sd).find((k) => k.toLowerCase() === String(key).toLowerCase());
    if (foundKey && sd[foundKey] != null && String(sd[foundKey]).trim() !== '') {
      return String(sd[foundKey]);
    }
    return fallback;
  };

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
        stud_type: 'StudType',
        student_mobile: 'Student Mobile number',
        parent_mobile1: 'Parent Mobile Number 1',
        student_address: 'Student Address (D.No, Str name, Village, Mandal, Dist)',
        city_village: 'City/Village',
        district: 'District',
      };
      const label = mapped[key] || key;
      const fromHelper = getStudentData(label, fallback);
      if (fromHelper && fromHelper !== fallback) return fromHelper;
    }
    return fromStudentDataJson(key, fallback);
  };

  const photoUrl = fetchedPhoto || resolvePhotoUrl(student.student_photo);

  const name = get('student_name', '—');
  const pinNumber = get('pin_no', '') || get('admission_number', '—');
  const college = get('college', '—');
  const program = get('course', '—');
  const branch = get('branch', '—');
  const year = get('current_year', '—');
  const semester = get('current_semester', '—');
  const batch = get('batch', '—');
  const studentMobile = get('student_mobile', '—');
  const parentMobile = get('parent_mobile1', '') || get('parent_mobile2', '—') || '—';
  const studType = get('stud_type', 'Student');
  const address = get('student_address', '') || get('address', '');
  const city = get('city_village', '') || get('city', '');
  const state = get('district', '') || get('state', '');

  const buildAddressString = () => {
    const parts = [address, city, state].filter(p => p !== '');
    return parts.length > 0 ? parts.join(', ') : '—';
  };
  const fullAddress = buildAddressString();

  const FieldRow = ({ label, value, capitalize = false, mono = false }) => (
    <div className="flex items-start gap-1 text-[11px] font-extrabold text-black w-full">
      <span className="text-slate-800 font-extrabold w-[58px] sm:w-[64px] tracking-wide uppercase shrink-0 pt-0.5 text-[9px] sm:text-[10px]">
        {label}
      </span>
      <span className="text-slate-600 font-extrabold shrink-0 pt-0.5">:</span>
      <span
        className={`flex-1 min-w-0 break-words leading-snug text-black font-extrabold ${capitalize ? 'capitalize' : ''} ${mono ? 'break-all tabular-nums' : ''}`}
        title={String(value)}
      >
        {value}
      </span>
    </div>
  );

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

  const admissionNo = student.admission_number || student.admission_no || pinNumber;

  return (
    <div
      className={`id-card-print-root digital-id-card w-full max-w-[380px] mx-auto rounded-[1.5rem] sm:rounded-[2rem] border border-gray-200 bg-[#f8f9fa] shadow-2xl overflow-hidden relative flex flex-col ${className}`}
      style={{
        fontFamily: "'Inter', sans-serif",
        aspectRatio: '54 / 85.6',
        minHeight: '520px',
      }}
      data-qr-admission={admissionNo}
    >
      {/* Top Graphic Shapes (Red Theme) */}
      <div className="id-card-header-graphic absolute top-0 left-0 right-0 h-36 sm:h-44 overflow-hidden pointer-events-none z-0">
        <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,0 L400,0 L400,20 L180,120 L0,40 Z" fill="#b91c1c" /> {/* Dark Red */}
          <path d="M400,20 L400,80 L220,160 Z" fill="#ef4444" opacity="0.8" /> {/* Lighter Red */}
          <path d="M0,40 L180,120 L220,160 L0,200 Z" fill="#dc2626" opacity="0.9" /> {/* Mid Red */}
        </svg>
      </div>

      <div className="id-card-body flex-1 flex flex-col relative z-10 w-full pt-10 sm:pt-12 pb-4 sm:pb-6 min-h-0">
        <div className="id-card-logo-wrap w-full flex justify-center mb-4 sm:mb-6">
          <div className="bg-white/90 backdrop-blur-md p-2 rounded-xl shadow-sm h-[72px] sm:h-[90px] inline-flex items-center justify-center border border-white/50 relative z-20">
            <img src="/logo.png" alt="College Logo" className="h-full w-auto object-contain max-w-[140px] sm:max-w-none" />
          </div>
        </div>

        <div className="id-card-content px-4 sm:px-6 flex flex-col flex-1 min-h-0">
          <div className="id-card-main-row flex flex-col sm:flex-row items-center sm:items-start w-full gap-4 sm:gap-5">
            <div className="id-card-photo-wrap flex flex-col items-center shrink-0 sm:mt-2">
              <div className="id-card-photo w-[96px] h-[124px] sm:w-[124px] sm:h-[160px] rounded-xl border-4 border-white shadow-lg bg-gray-50 overflow-hidden flex items-center justify-center relative z-10">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={name}
                    className="w-full h-full object-cover object-top"
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
            </div>

            {/* Right: Primary Info */}
            <div className="id-card-fields flex flex-col space-y-2 flex-1 min-w-0 w-full sm:mt-2">
              <div className="flex items-start text-[10px] sm:text-[11px] font-extrabold text-black">
                <span className="text-slate-800 font-extrabold w-[60px] tracking-wide uppercase shrink-0 mt-[1px]">NAME</span>
                <span className="text-slate-600 font-extrabold mx-0.5 shrink-0 mt-[1px]">:</span>
                <span className="flex-1 break-words capitalize leading-snug font-extrabold text-black" title={name}>{name.toLowerCase()}</span>
              </div>
              <div className="flex items-start text-[10px] sm:text-[11px] font-extrabold text-black">
                <span className="text-slate-800 font-extrabold w-[60px] tracking-wide uppercase shrink-0 mt-[1px]">PROGRAM</span>
                <span className="text-slate-600 font-extrabold mx-0.5 shrink-0 mt-[1px]">:</span>
                <span className="flex-1 break-words leading-snug font-extrabold text-black" title={program}>{program}</span>
              </div>
              {branch && branch !== '—' && (
                <div className="flex items-start text-[10px] sm:text-[11px] font-extrabold text-black">
                  <span className="text-slate-800 font-extrabold w-[60px] tracking-wide uppercase shrink-0 mt-[1px]">BRANCH</span>
                  <span className="text-slate-600 font-extrabold mx-0.5 shrink-0 mt-[1px]">:</span>
                  <span className="flex-1 break-words leading-snug font-extrabold text-black" title={branch}>{branch}</span>
                </div>
              )}

              <div className="flex items-start text-[10px] sm:text-[11px] font-extrabold text-black pt-1">
                <span className="text-slate-800 font-extrabold w-[60px] tracking-wide uppercase shrink-0 mt-[1px]">PIN</span>
                <span className="text-slate-600 font-extrabold mx-0.5 shrink-0">:</span>
                <span className="flex-1 break-words font-extrabold text-black">{pinNumber}</span>
              </div>
              <div className="flex items-start text-[10px] sm:text-[11px] font-extrabold text-black">
                <span className="text-slate-800 font-extrabold w-[60px] tracking-wide uppercase shrink-0 mt-[1px]">BATCH</span>
                <span className="text-slate-600 font-extrabold mx-0.5 shrink-0">:</span>
                <span className="flex-1 break-words font-extrabold text-black">{batch}</span>
              </div>
              <div className="flex items-start text-[10px] sm:text-[11px] font-extrabold text-black">
                <span className="text-slate-800 font-extrabold w-[60px] tracking-wide uppercase shrink-0 mt-[1px]">STUDENT</span>
                <span className="text-slate-600 font-extrabold mx-0.5 shrink-0 mt-[1px]">:</span>
                <span className="flex-1 min-w-0 tabular-nums leading-snug whitespace-nowrap overflow-hidden text-ellipsis font-extrabold text-black">{studentMobile}</span>
              </div>
              <div className="flex items-start text-[10px] sm:text-[11px] font-extrabold text-black">
                <span className="text-slate-800 font-extrabold w-[60px] tracking-wide uppercase shrink-0 mt-[1px]">PARENT</span>
                <span className="text-slate-600 font-extrabold mx-0.5 shrink-0 mt-[1px]">:</span>
                <span className="flex-1 min-w-0 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis font-extrabold text-black">{parentMobile}</span>
              </div>
            </div>
          </div>

          <div className="id-card-bottom-row w-full flex flex-col sm:flex-row items-center sm:items-start justify-between mt-5 sm:mt-6 pt-3 border-t border-gray-300 border-dashed gap-4 sm:mt-auto">
            <div className="flex flex-col text-[11px] flex-1 min-w-0 w-full sm:pr-2">
              <span className="font-extrabold text-slate-800 tracking-wider uppercase mb-1 text-[10px]">ADDRESS</span>
              <span className="font-bold text-black leading-relaxed break-words">
                {fullAddress}
              </span>
            </div>

            <div
              className="digital-id-card-qr bg-white p-2 rounded-lg border border-gray-300 shadow-sm flex-shrink-0"
              id={admissionNo ? `student-qr-${admissionNo}` : 'qr-id-card'}
            >
              <QRCodeSVG
                value={(() => {
                  const base = typeof window !== 'undefined' ? window.location.origin : '';
                  if (qrToken) return `${base}/qr/${qrToken}`;
                  const admNo = student.admission_number || student.admission_no || get('admission_number') || get('admission_no');
                  return admNo ? `${base}/qr/${encodeURIComponent(admNo)}` : base;
                })()}
                size={92}
                level="M"
                includeMargin={true}
                fgColor="#000000"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="id-card-footer shrink-0 bg-[#b91c1c] py-3 px-3 sm:px-4 flex items-center justify-center z-20 shadow-lg border-t border-red-800 rounded-b-[1.5rem] sm:rounded-b-[2rem]">
        <span className="text-white text-[10px] sm:text-xs font-bold tracking-wide uppercase text-center leading-snug break-words px-1">
          {college}
        </span>
      </div>
    </div>
  );
};
export default DigitalStudentCard;
