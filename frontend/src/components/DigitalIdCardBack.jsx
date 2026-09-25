import React from 'react';
import { DEFAULT_COLLEGE, resolveCollegeDetails } from '../config/collegeConfig';

/**
 * Top Back Layered Red Wave Header SVG matching reference design
 */
const BackTopWaveSVG = () => (
  <svg
    viewBox="0 0 540 140"
    preserveAspectRatio="none"
    className="absolute top-0 left-0 w-full pointer-events-none"
    style={{ height: '13.5mm', zIndex: 1, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
  >
    <defs>
      <linearGradient id="backTopAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FCA5A5" />
        <stop offset="50%" stopColor="#F87171" />
        <stop offset="100%" stopColor="#DC2626" />
      </linearGradient>
      <linearGradient id="backTopMainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D71920" />
        <stop offset="100%" stopColor="#991B1B" />
      </linearGradient>
    </defs>
    {/* Soft light red background wave accent */}
    <path
      d="M 0 0 L 540 0 L 540 120 C 360 40, 180 140, 0 105 Z"
      fill="url(#backTopAccentGrad)"
      opacity="0.85"
    />
    {/* Main primary vibrant red wave */}
    <path
      d="M 0 0 L 540 0 L 540 95 C 380 30, 160 115, 0 88 Z"
      fill="url(#backTopMainGrad)"
    />
  </svg>
);

/**
 * Bottom Back Layered Red Wave SVG matching reference design
 */
const BackBottomWaveSVG = () => (
  <svg
    viewBox="0 0 540 140"
    preserveAspectRatio="none"
    className="absolute bottom-0 left-0 w-full pointer-events-none"
    style={{ height: '12.5mm', zIndex: 2, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
  >
    <defs>
      <linearGradient id="backBottomAccentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FCA5A5" />
        <stop offset="50%" stopColor="#F87171" />
        <stop offset="100%" stopColor="#EF4444" />
      </linearGradient>
      <linearGradient id="backBottomMainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EA2635" />
        <stop offset="50%" stopColor="#D71920" />
        <stop offset="100%" stopColor="#991B1B" />
      </linearGradient>
    </defs>
    {/* Light red accent ribbon above bottom wave */}
    <path
      d="M 0 55 C 160 125, 380 20, 540 60 L 540 140 L 0 140 Z"
      fill="url(#backBottomAccentGrad)"
      opacity="0.85"
    />
    {/* Main vibrant red bottom wave */}
    <path
      d="M 0 70 C 180 135, 360 40, 540 78 L 540 140 L 0 140 Z"
      fill="url(#backBottomMainGrad)"
    />
  </svg>
);

/**
 * Dynamic Website font size calculation based on string length
 */
const getWebsiteFontSize = (webStr) => {
  const len = String(webStr || '').trim().length;
  if (len <= 22) return '6.0pt';
  if (len <= 28) return '5.5pt';
  if (len <= 34) return '5.0pt';
  return '4.6pt';
};

/**
 * Format address into structured lines
 */
const formatAddressLines = (rawAddress) => {
  if (Array.isArray(rawAddress) && rawAddress.length > 0) {
    return rawAddress;
  }
  if (typeof rawAddress === 'string' && rawAddress.trim() !== '') {
    const parts = rawAddress.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      return [`${parts[0]},`, `${parts[1]},`, parts.slice(2).join(', ')];
    } else if (parts.length === 2) {
      return [`${parts[0]},`, parts[1]];
    }
    return [rawAddress];
  }
  return ['D.No. XX-XX,', 'Komaripalem,', 'Kakinada, Andhra Pradesh.'];
};

/**
 * Reusable Digital Student ID Card - Back Side
 * Standard CR80 Dimensions: 54mm × 85.6mm
 */
const DigitalIdCardBack = ({
  college,
  student,
  getStudentData,
  className = '',
  rotate180 = false,
}) => {
  const studObj = student || {};

  const fromStudentDataJson = (key, fallback = '') => {
    if (!studObj.student_data || typeof studObj.student_data !== 'object')
      return fallback;
    const sd = studObj.student_data;
    const val = sd[key];
    if (val !== undefined && val !== null && String(val).trim() !== '')
      return String(val);
    const foundKey = Object.keys(sd).find(
      (k) => k.toLowerCase() === String(key).toLowerCase()
    );
    if (foundKey && sd[foundKey] != null && String(sd[foundKey]).trim() !== '') {
      return String(sd[foundKey]);
    }
    return fallback;
  };

  const get = (key, fallback = '') => {
    if (!studObj) return fallback;
    const v = studObj[key];
    if (v !== undefined && v !== null && v !== '') return String(v);
    if (typeof getStudentData === 'function') {
      const fromHelper = getStudentData(key, fallback);
      if (fromHelper && fromHelper !== fallback) return fromHelper;
    }
    return fromStudentDataJson(key, fallback);
  };

  // Resolve College Object
  const collegeDetails = resolveCollegeDetails(college, studObj);
  const collegeName = collegeDetails.name;
  const collegeAddress = collegeDetails.address;
  const collegeContact = collegeDetails.contact;
  const website = collegeDetails.website;
  const websiteFontSize = getWebsiteFontSize(website);

  // Resolve Student Personal Details
  const dateOfBirth =
    studObj.dateOfBirth ||
    studObj.dob ||
    get('date_of_birth') ||
    get('dob') ||
    '15-08-2008';

  const parentGuardian =
    studObj.parentGuardian ||
    studObj.father_name ||
    studObj.parent_name ||
    get('father_name') ||
    get('parent_name') ||
    'Mr. XXXXX';

  const emergencyContact =
    studObj.emergencyContact ||
    studObj.parent_mobile1 ||
    studObj.student_mobile ||
    get('parent_mobile1') ||
    get('student_mobile') ||
    '9XXXXXXXXX';

  const rawAddress =
    studObj.address ||
    studObj.student_address ||
    get('student_address') ||
    null;

  const addressLines = formatAddressLines(rawAddress);

  return (
    <div
      className={`id-card-print-root id-card-back relative flex flex-col bg-white overflow-hidden text-gray-900 select-none transition-transform duration-300 ${
        rotate180 ? 'rotate-180 rotate-back-180' : ''
      } ${className}`}
      style={{
        width: '54mm',
        height: '85.6mm',
        boxSizing: 'border-box',
        position: 'relative',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        fontFamily: "'Inter', sans-serif",
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      {/* 1. TOP HEADER WAVE WITH DUAL ACCENT RIBBON */}
      <BackTopWaveSVG />

      {/* 2. DETAILS CONTENT — fills full height between waves */}
      <div
        className="absolute z-10 flex flex-col"
        style={{
          left: '4.8mm',
          right: '4.8mm',
          top: '15.5mm',
          bottom: '13.5mm',         /* just above the bottom wave */
          fontSize: '6.1pt',
          lineHeight: '1.42',
          justifyContent: 'space-between',
        }}
      >
        {/* ── Upper block: personal details ── */}
        <div>
          {/* Date of Birth */}
          <div className="grid grid-cols-[22mm_2mm_1fr] items-center mb-[1.2mm]">
            <span className="font-medium text-[#4B5563]">Date of Birth</span>
            <span className="font-medium text-[#4B5563] text-center">:</span>
            <span className="font-semibold text-[#111827]">{dateOfBirth}</span>
          </div>

          {/* Parent/Guardian */}
          <div className="grid grid-cols-[22mm_2mm_1fr] items-start mb-[1.2mm]">
            <span className="font-medium text-[#4B5563]">Parent/Guardian</span>
            <span className="font-medium text-[#4B5563] text-center">:</span>
            <span className="font-semibold text-[#111827] leading-tight">{parentGuardian}</span>
          </div>

          {/* Emergency Contact */}
          <div className="grid grid-cols-[22mm_2mm_1fr] items-center mb-[1.2mm]">
            <span className="font-medium text-[#4B5563]">Emergency Contact</span>
            <span className="font-medium text-[#4B5563] text-center">:</span>
            <span className="font-semibold text-[#111827] font-mono">{emergencyContact}</span>
          </div>

          {/* Student Address — same grid as other rows */}
          <div className="grid grid-cols-[22mm_2mm_1fr] items-start">
            <span className="font-medium text-[#4B5563]">Student Address</span>
            <span className="font-medium text-[#4B5563] text-center">:</span>
            <div className="flex flex-col text-[#111827] font-semibold leading-tight text-[5.8pt]">
              {addressLines.map((line, idx) => (
                <span key={idx}>{line}</span>
              ))}
            </div>
          </div>

        </div>

        {/* ── Lower block: separator + return info ── */}
        <div>
          {/* Separator Line */}
          <div className="w-full h-[0.5px] bg-[#CBD5E1] mb-[2mm]" />

          {/* Return Information */}
          <div className="flex flex-col gap-[0.8mm]">
            <span className="text-[#64748B] font-normal text-[5.5pt]">
              If found, please return to:
            </span>
            <h3 className="text-[#111827] font-bold text-[7.2pt] leading-tight m-0">
              {collegeName}
            </h3>
            <span className="text-[#334155] font-medium text-[5.8pt] leading-tight">
              {collegeAddress}
            </span>
            {collegeContact ? (
              <span className="text-[#334155] font-medium text-[5.8pt]">
                College Contact: {collegeContact}
              </span>
            ) : null}
          </div>
        </div>
      </div>


      {/* 3. BOTTOM RED WAVE WITH ACCENT RIBBON */}
      <BackBottomWaveSVG />

      {/* 4. DYNAMIC WEBSITE IN FOOTER WAVE */}
      {website ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '2.2mm',
            zIndex: 10,
            textAlign: 'center',
            padding: '0 2mm',
          }}
        >
          <span
            style={{
              display: 'block',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: websiteFontSize,
              lineHeight: '1',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'clip',
            }}
          >
            {website}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default DigitalIdCardBack;
