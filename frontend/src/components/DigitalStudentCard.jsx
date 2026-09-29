import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getStaticFileUrlDirect } from '../config/api';
import api from '../config/api';
import { DEFAULT_COLLEGE, resolveCollegeDetails } from '../config/collegeConfig';
import StudentPhotoFrame from './StudentPhotoFrame';

/* =========================================================
   MODULE-LEVEL CACHES
========================================================= */

const _qrTokenCache = {};
const _photoCache = {};


/* =========================================================
   PHOTO URL HELPER
========================================================= */

const resolvePhotoUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return '';

  const trimmed = raw.trim();

  if (
    !trimmed ||
    trimmed === '{}' ||
    trimmed === 'null'
  ) {
    return '';
  }

  if (
    trimmed.startsWith('http') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  return getStaticFileUrlDirect(trimmed);
};


/* =========================================================
   COLLEGE NAME FORMATTER
========================================================= */

const formatCollegeName = (str) => {
  if (!str) return DEFAULT_COLLEGE.name;

  const trimmed = String(str).trim();

  if (trimmed === trimmed.toUpperCase()) {
    return trimmed
      .toLowerCase()
      .split(/\s+/)
      .map((word) => {
        if (
          word === 'of' ||
          word === 'and' ||
          word === '&'
        ) {
          return word;
        }

        return (
          word.charAt(0).toUpperCase() +
          word.slice(1)
        );
      })
      .join(' ');
  }

  return trimmed;
};


/* =========================================================
   DYNAMIC FONT SIZES
========================================================= */

/*
 * Split college name into 2 balanced lines
 */
const splitCollegeNameToTwoLines = (nameStr) => {
  if (!nameStr) return ['Pydah College of', 'Pharmacy'];
  const words = String(nameStr).trim().split(/\s+/);
  if (words.length <= 1) return [words[0] || '', ''];
  if (words.length === 2) return [words[0], words[1]];

  // Look for preposition 'of' or '&' to break naturally
  const ofIdx = words.findIndex((w) => w.toLowerCase() === 'of' || w.toLowerCase() === '&');
  if (ofIdx !== -1 && ofIdx < words.length - 1) {
    return [
      words.slice(0, ofIdx + 1).join(' '),
      words.slice(ofIdx + 1).join(' '),
    ];
  }

  // Find split point that minimizes max line length
  let bestSplit = 1;
  let minMaxLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    const maxLen = Math.max(l1.length, l2.length);
    if (maxLen < minMaxLen) {
      minMaxLen = maxLen;
      bestSplit = i;
    }
  }

  return [
    words.slice(0, bestSplit).join(' '),
    words.slice(bestSplit).join(' '),
  ];
};

const getTwoLineCollegeNameFontSize = (l1, l2) => {
  const maxLineLen = Math.max(String(l1 || '').trim().length, String(l2 || '').trim().length);
  if (maxLineLen <= 12) return '8.2pt';
  if (maxLineLen <= 15) return '7.4pt';
  if (maxLineLen <= 18) return '6.6pt';
  if (maxLineLen <= 22) return '5.8pt';
  if (maxLineLen <= 26) return '5.1pt';
  if (maxLineLen <= 30) return '4.5pt';
  return '4.1pt';
};

const getCollegeNameFontSize = (nameStr) => {
  const len = String(nameStr || '').trim().length;
  if (len <= 18) return '8.5pt';
  if (len <= 24) return '7.6pt';
  if (len <= 30) return '6.6pt';
  if (len <= 36) return '5.8pt';
  return '5.0pt';
};

const getDetailValueFontSize = (valStr, baseSize = '6.2pt') => {
  const len = String(valStr || '').trim().length;
  if (len <= 14) return baseSize;
  if (len <= 18) return '5.8pt';
  if (len <= 24) return '5.4pt';
  if (len <= 30) return '4.9pt';
  return '4.5pt';
};

const getWebsiteFontSize = (webStr) => {
  const len = String(webStr || '').trim().length;
  if (len <= 22) return '6.0pt';
  if (len <= 28) return '5.5pt';
  if (len <= 34) return '5.0pt';
  return '4.6pt';
};

const getStudentNameFontSize = (nameStr) => {
  const len = String(nameStr || '').trim().length;
  if (len <= 14) return '9.8pt';
  if (len <= 18) return '8.6pt';
  if (len <= 22) return '7.6pt';
  if (len <= 26) return '6.8pt';
  if (len <= 30) return '6.0pt';
  return '5.4pt';
};

/* =========================================================
   FRONT BOTTOM WAVE
========================================================= */

const FrontBottomWaveSVG = () => {
  const reactId = React.useId ? React.useId().replace(/:/g, '') : Math.random().toString(36).substring(2, 7);
  const accentGradId = `frontWaveAccentGrad_${reactId}`;
  const brightGradId = `frontWaveBrightGrad_${reactId}`;

  return (
    <svg
      viewBox="0 0 540 140"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      <defs>
        {/* Light red accent ribbon matching back header */}
        <linearGradient id={accentGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCA5A5" />
          <stop offset="50%" stopColor="#F87171" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>

        {/* Primary foreground vibrant red wave matching back header */}
        <linearGradient id={brightGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#D71920" />
          <stop offset="100%" stopColor="#991B1B" />
        </linearGradient>
      </defs>

      {/* Layer 1: Light-red accent ribbon sticking out matching back header */}
      <path
        d="
          M 0 18
          C 130 64, 200 62, 270 65
          C 340 68, 410 52, 540 22
          L 540 140
          L 0 140
          Z
        "
        fill={`url(#${accentGradId})`}
        fillOpacity="0.88"
        style={{ fill: `url(#${accentGradId}) #F87171` }}
      />

      {/* Layer 2: Primary foreground vibrant red wave */}
      <path
        d="
          M 0 32
          C 120 90, 195 82, 270 80
          C 345 78, 420 86, 540 36
          L 540 140
          L 0 140
          Z
        "
        fill={`url(#${brightGradId})`}
        style={{ fill: `url(#${brightGradId}) #D71920` }}
      />
    </svg>
  );
};



/* =========================================================
   STUDENT PHOTO DECORATIVE RING
========================================================= */

const StudentPhotoRing = () => (
  <svg
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 3,
    }}
  >

    {/* Soft/light circular base ring */}
    <circle
      cx="100"
      cy="100"
      r="74"
      fill="none"
      stroke="#f3d3d6"
      strokeWidth="2.5"
    />

    {/* Left + bottom red arc */}
    <circle
      cx="100"
      cy="100"
      r="74"
      fill="none"
      stroke="#d71920"
      strokeWidth="5.5"
      strokeLinecap="round"
      strokeDasharray="205 260"
      strokeDashoffset="0"
    />

    {/* Upper/right red arc */}
    <circle
      cx="100"
      cy="100"
      r="74"
      fill="none"
      stroke="#d71920"
      strokeWidth="5.5"
      strokeLinecap="round"
      strokeDasharray="110 340"
      strokeDashoffset="-260"
    />

  </svg>
);


/**
 * Helper to calculate actual course duration in years based on program/course and level
 */
const getCourseDuration = (courseStr = '', levelStr = '') => {
  const text = `${courseStr} ${levelStr}`.toLowerCase();

  // Pharm.D -> 6 years
  if (
    text.includes('pharm.d') ||
    text.includes('pharm d') ||
    text.includes('pharmd') ||
    text.includes('doctor of pharmacy')
  ) {
    return 6;
  }

  // B.Tech / B.Pharm / B.Pharmacy / B.E. / Engineering -> 4 years
  if (
    text.includes('b.tech') ||
    text.includes('btech') ||
    text.includes('b.pharm') ||
    text.includes('bpharm') ||
    text.includes('b.pharmacy') ||
    text.includes('b.e.') ||
    text.includes('b.e') ||
    text.includes('engineering')
  ) {
    return 4;
  }

  // M.Tech / M.Pharm / MCA / MBA / M.Sc / M.Com / PG / Master -> 2 years
  if (
    text.includes('m.tech') ||
    text.includes('mtech') ||
    text.includes('m.pharm') ||
    text.includes('mpharm') ||
    text.includes('m.pharmacy') ||
    text.includes('mca') ||
    text.includes('mba') ||
    text.includes('m.sc') ||
    text.includes('msc') ||
    text.includes('m.com') ||
    text.includes('mcom') ||
    text.includes('pg') ||
    text.includes('post graduate') ||
    text.includes('master')
  ) {
    return 2;
  }

  // Diploma / Polytechnic / B.Sc / B.Com / B.A / BBA / BCA -> 3 years
  if (
    text.includes('diploma') ||
    text.includes('polytechnic') ||
    text.includes('b.sc') ||
    text.includes('bsc') ||
    text.includes('b.com') ||
    text.includes('bcom') ||
    text.includes('b.a') ||
    text.includes('ba') ||
    text.includes('bba') ||
    text.includes('bca') ||
    text.includes('ug') ||
    text.includes('under graduate')
  ) {
    return 3;
  }

  // Default duration if unrecognized
  return 4;
};



/* =========================================================
   DIGITAL STUDENT CARD
========================================================= */

const DigitalStudentCard = ({
  college,
  student,
  getStudentData,
  className = '',
  compact = false,
  principalSignatureUrl = null,
}) => {

  const [qrToken, setQrToken] = useState(null);
  const [fetchedPhoto, setFetchedPhoto] = useState('');

  const studObj = student || {};


  /* =======================================================
     ADMISSION NUMBER
  ======================================================= */

  const admNo =
    studObj.admission_number ||
    studObj.admission_no ||
    studObj.pinNo ||
    studObj.pin_no ||
    '';


  /* =======================================================
     FETCH QR TOKEN
  ======================================================= */

  useEffect(() => {

    if (!admNo) return;

    if (_qrTokenCache[admNo]) {
      setQrToken(_qrTokenCache[admNo]);
      return;
    }

    api
      .get(
        `/qr/token/${encodeURIComponent(admNo)}`
      )
      .then((response) => {

        if (
          response.data?.success &&
          response.data?.data?.token
        ) {

          const token =
            response.data.data.token;

          _qrTokenCache[admNo] = token;

          setQrToken(token);
        }

      })
      .catch(() => {});

  }, [admNo]);


  /* =======================================================
     FETCH STUDENT PHOTO
  ======================================================= */

  useEffect(() => {

    if (
      !studObj ||
      Object.keys(studObj).length === 0
    ) {
      setFetchedPhoto('');
      return;
    }


    /* -----------------------------------------------
       Direct photo from student object
    ------------------------------------------------ */

    const fromField = resolvePhotoUrl(
      studObj.student_photo ||
      studObj.photo
    );

    if (fromField) {
      setFetchedPhoto(fromField);
      return;
    }


    /* -----------------------------------------------
       No admission number
    ------------------------------------------------ */

    if (!admNo) {
      setFetchedPhoto('');
      return;
    }


    /* -----------------------------------------------
       Cached photo
    ------------------------------------------------ */

    if (_photoCache[admNo]) {
      setFetchedPhoto(
        _photoCache[admNo]
      );
      return;
    }


    /* -----------------------------------------------
       API photo
    ------------------------------------------------ */

    let cancelled = false;

    api
      .get(
        `/students/${encodeURIComponent(admNo)}/photo`
      )
      .then((response) => {

        if (cancelled) return;

        const raw =
          response.data?.success
            ? response.data.data
            : null;

        const url = resolvePhotoUrl(
          typeof raw === 'string'
            ? raw
            : ''
        );

        if (url) {

          _photoCache[admNo] = url;

          setFetchedPhoto(url);

        } else {

          setFetchedPhoto('');

        }

      })
      .catch(() => {

        if (!cancelled) {
          setFetchedPhoto('');
        }

      });

    return () => {
      cancelled = true;
    };

  }, [
    admNo,
    studObj,
    studObj.student_photo,
    studObj.photo,
  ]);


  /* =======================================================
     EMPTY STUDENT
  ======================================================= */

  if (
    !studObj ||
    Object.keys(studObj).length === 0
  ) {
    return null;
  }


  /* =======================================================
     STUDENT DATA JSON HELPER
  ======================================================= */

  const fromStudentDataJson = (
    key,
    fallback = ''
  ) => {

    const sd =
      studObj.student_data;

    if (
      !sd ||
      typeof sd !== 'object'
    ) {
      return fallback;
    }


    const directValue =
      sd[key];

    if (
      directValue !== undefined &&
      directValue !== null &&
      String(directValue).trim() !== ''
    ) {
      return String(directValue);
    }


    const foundKey =
      Object.keys(sd).find(
        (k) =>
          k.toLowerCase() ===
          String(key).toLowerCase()
      );


    if (
      foundKey &&
      sd[foundKey] != null &&
      String(sd[foundKey]).trim() !== ''
    ) {
      return String(sd[foundKey]);
    }


    return fallback;
  };


  /* =======================================================
     GENERIC STUDENT DATA GETTER
  ======================================================= */

  const get = (
    key,
    fallback = ''
  ) => {

    const value =
      studObj[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      return String(value);
    }


    if (
      typeof getStudentData === 'function'
    ) {

      const mapped = {

        student_name:
          'Student Name',

        admission_number:
          'Admission Number',

        pin_no:
          'PIN Number',

        college:
          'College',

        course:
          'Program',

        branch:
          'Branch',

        batch:
          'Batch',

        validity:
          'Validity',

        website:
          'Website',

      };


      const label =
        mapped[key] || key;


      const fromHelper =
        getStudentData(
          label,
          fallback
        );


      if (
        fromHelper &&
        fromHelper !== fallback
      ) {
        return fromHelper;
      }
    }


    return fromStudentDataJson(
      key,
      fallback
    );
  };


  /* =======================================================
     COLLEGE OBJECT
========================================================= */

  const collegeObj =
    typeof college === 'object' &&
    college !== null
      ? college
      : {};


  /* =======================================================
     DYNAMIC COLLEGE DETAILS (NAME, WEBSITE, LOGO)
========================================================= */

  const collegeDetails = resolveCollegeDetails(college, studObj);

  const collegeName = collegeDetails.name;
  const website = collegeDetails.website;
  const collegeLogo = collegeDetails.logo;
  const signatureUrl =
    principalSignatureUrl ||
    (collegeDetails.principalSignatureUrl ? resolvePhotoUrl(collegeDetails.principalSignatureUrl) : null) ||
    (typeof college === 'object' && college?.principal_signature_url ? resolvePhotoUrl(college.principal_signature_url) : null) ||
    (studObj.principal_signature_url ? resolvePhotoUrl(studObj.principal_signature_url) : null) ||
    (studObj.principalSignatureUrl ? resolvePhotoUrl(studObj.principalSignatureUrl) : null);



  /* =======================================================
     STUDENT PHOTO
========================================================= */

  const photoUrl =
    fetchedPhoto ||
    resolvePhotoUrl(
      studObj.photo ||
      studObj.student_photo
    );


  /* =======================================================
     STUDENT NAME
========================================================= */

  const name = (
    studObj.name ||
    studObj.student_name ||
    get(
      'student_name',
      'D. SAI SAKETH'
    )
  ).toUpperCase();


  /* =======================================================
     PIN / ADMISSION NUMBER
========================================================= */

  const pinNo =
    studObj.pinNo ||
    studObj.pin_no ||
    studObj.admission_number ||
    studObj.admission_no ||
    get(
      'pin_no',
      'PCP23PH0679'
    );


  /* =======================================================
     PROGRAM
========================================================= */

  const program =
    studObj.program ||
    studObj.course ||
    get(
      'course',
      'B.Pharm'
    );


  /* =======================================================
     BRANCH
========================================================= */

  const branch =
    studObj.branch ||
    get(
      'branch',
      'Pharmacy'
    );


  /* =======================================================
     BATCH & VALIDITY (DYNAMICALLY DURATION BASED)
========================================================= */

  const courseDuration = getCourseDuration(
    program || studObj.course || get('course', ''),
    studObj.level || get('level', '')
  );

  const rawBatch =
    studObj.batch ||
    get(
      'batch',
      ''
    );

  let startYear = 2026;
  let endYear = startYear + courseDuration;

  if (rawBatch) {
    const rawStr = String(rawBatch).trim();
    const fourDigitYears = rawStr.match(/\b(20\d{2})\b/g);

    if (fourDigitYears && fourDigitYears.length >= 2) {
      startYear = Number(fourDigitYears[0]);
      endYear = Number(fourDigitYears[1]);
    } else if (fourDigitYears && fourDigitYears.length === 1) {
      startYear = Number(fourDigitYears[0]);
      endYear = startYear + courseDuration;
    } else {
      const numericVal = parseInt(rawStr, 10);
      if (!isNaN(numericVal) && numericVal > 2000 && numericVal < 2100) {
        startYear = numericVal;
        endYear = startYear + courseDuration;
      }
    }
  }

  const batch =
    rawBatch && (String(rawBatch).includes('–') || String(rawBatch).includes('-'))
      ? String(rawBatch)
      : `${startYear} – ${endYear}`;

  const validity =
    studObj.validity ||
    get('validity', '') ||
    `Upto May ${endYear}`;


  /* =======================================================
     FONT SIZES
========================================================= */

  const collegeNameFontSize =
    getCollegeNameFontSize(
      collegeName
    );


  const websiteFontSize =
    getWebsiteFontSize(
      website
    );


  const studentNameFontSize =
    getStudentNameFontSize(
      name
    );


  /* =======================================================
     COMPACT MODE
========================================================= */

  if (compact) {

    return (
      <div
        className={`
          rounded-xl
          border
          border-slate-200
          bg-white
          shadow-md
          overflow-hidden
          flex
          items-center
          gap-2
          p-2
          ${className}
        `}
        style={{
          maxWidth: '200px',
        }}
      >

        {/* Compact photo */}

        <div
          className="
            flex-shrink-0
            w-10
            h-10
            rounded-full
            border
            border-red-600
            bg-slate-100
            overflow-hidden
            flex
            items-center
            justify-center
            relative
          "
        >

          {photoUrl ? (

            <img
              src={photoUrl}
              alt={name}
              className="
                w-full
                h-full
                object-cover
                rounded-full
              "
              onError={(event) => {

                event.currentTarget.style.display =
                  'none';

                const fallback =
                  event.currentTarget
                    .nextElementSibling;

                if (fallback) {
                  fallback.classList.remove(
                    'hidden'
                  );
                }

              }}
            />

          ) : null}


          <div
            className={`
              w-full
              h-full
              flex
              items-center
              justify-center
              ${photoUrl ? 'hidden' : ''}
            `}
          >

            <User
              className="
                w-5
                h-5
                text-slate-400
              "
            />

          </div>

        </div>


        {/* Compact text */}

        <div
          className="
            flex-1
            min-w-0
          "
        >

          <p
            className="
              text-xs
              font-bold
              text-slate-900
              truncate
            "
            title={name}
          >
            {name}
          </p>


          <p
            className="
              text-[10px]
              font-mono
              text-red-600
            "
          >
            {pinNo}
          </p>


          <p
            className="
              text-[10px]
              text-slate-500
              truncate
            "
          >
            {collegeName}
          </p>

        </div>

      </div>
    );
  }


  /* =======================================================
     FINAL ADMISSION NUMBER
========================================================= */

  const admissionNo =
    studObj.admission_number ||
    studObj.admission_no ||
    pinNo;


  /* =======================================================
     QR VALUE

     Keep QR logic independent from visual positioning.
========================================================= */

  const qrValue =
    studObj.qrCode ||
    (() => {

      const base =
        typeof window !== 'undefined'
          ? window.location.origin
          : '';

      if (qrToken) {
        return `${base}/qr/${qrToken}`;
      }

      if (admissionNo) {
        return `${base}/qr/${encodeURIComponent(
          admissionNo
        )}`;
      }

      return base;

    })();


  /* =======================================================
     FINAL ID CARD
========================================================= */

  return (
    <div
      className={`
        id-card-print-root
        relative
        overflow-hidden
        bg-white
        text-gray-900
        select-none
        ${className}
      `}
      style={{
        width: '54mm',
        height: '85.6mm',
        boxSizing: 'border-box',
        position: 'relative',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        fontFamily: "'Plus Jakarta Sans', 'Inter', Arial, sans-serif",
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
      data-qr-admission={admissionNo}
    >

      {/* ===================================================
          1. HEADER
          Logo, vertical separator line, 2-line college name (NO OVERLAP)
      =================================================== */}
      <div
        className="absolute z-30 flex items-center"
        style={{
          left: '2.5mm',
          right: '2.5mm',
          top: '2.2mm',
          height: '10.0mm',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* COLLEGE LOGO */}
        <div
          style={{
            width: '18.5mm',
            height: '11.8mm',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={collegeLogo}
            alt={collegeName}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>

        {/* GREY SEPARATOR LINE */}
        <div
          style={{
            width: '1px',
            height: '8.0mm',
            backgroundColor: '#CBD5E1',
            margin: '0 2.2mm',
            flexShrink: 0,
          }}
        />

        {/* COLLEGE NAME (2 LINES) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.4mm',
            height: '100%',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {(() => {
            const [l1, l2] = splitCollegeNameToTwoLines(collegeName);
            const dynamicCollegeFontSize = getTwoLineCollegeNameFontSize(l1, l2);
            return (
              <>
                <span
                  style={{
                    display: 'block',
                    fontFamily: "'Inter', sans-serif",
                    color: '#d41723',
                    fontWeight: 900,
                    fontSize: dynamicCollegeFontSize,
                    lineHeight: '1.2',
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {l1}
                </span>
                {l2 && (
                  <span
                    style={{
                      display: 'block',
                      fontFamily: "'Inter', sans-serif",
                      color: '#d41723',
                      fontWeight: 900,
                      fontSize: dynamicCollegeFontSize,
                      lineHeight: '1.2',
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {l2}
                  </span>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* ===================================================
          2. STUDENT PHOTO + DECORATIVE RING
      =================================================== */}
      <div
        className="absolute z-20 flex items-center justify-center"
        style={{
          left: '50%',
          top: '11.0mm',
          transform: 'translateX(-50%)',
          width: '31.5mm',
          height: '31.5mm',
        }}
      >
        <StudentPhotoFrame
          src={photoUrl || ''}
          photoUrl={photoUrl || ''}
          alt={name || 'Student Photo'}
          name={name}
          size={120}
        />
      </div>

      {/* ===================================================
          3. STUDENT NAME (AUTO-FITTING WIDTH)
      =================================================== */}
      <div
        className="absolute z-30 text-center"
        style={{
          left: '2mm',
          top: '40.6mm',
          width: '50mm',
          height: '4.2mm',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: studentNameFontSize,
            fontWeight: 900,
            color: '#000000',
            lineHeight: '1.1',
            letterSpacing: '0.025em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textTransform: 'uppercase',
          }}
        >
          {name}
        </div>
      </div>

      {/* ===================================================
          4. STUDENT DETAILS (PROPORTIONALLY SIZED & BALANCED)
      =================================================== */}
      <div
        className="absolute z-30"
        style={{
          left: '55%',
          transform: 'translateX(-50%)',
          top: '45.0mm',
          width: '45mm',
          fontSize: '5.9pt',
          lineHeight: '1.3',
        }}
      >
        {/* PIN */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '14.5mm 2.0mm 1fr',
            minHeight: '2.55mm',
            alignItems: 'center',
            marginBottom: '0.15mm',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '5.9pt', color: '#000000', letterSpacing: '0.01em' }}>PIN No</span>
          <span style={{ textAlign: 'center', fontWeight: 800, fontSize: '5.9pt', color: '#000000' }}>:</span>
          <span
            style={{
              color: '#000000ff',
              fontWeight: 800,
              fontSize: getDetailValueFontSize(pinNo, '6.2pt'),
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {pinNo}
          </span>
        </div>

        {/* PROGRAM */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '14.5mm 2.0mm 1fr',
            minHeight: '2.55mm',
            alignItems: 'flex-start',
            marginBottom: '0.15mm',
          }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: '5.9pt',
              color: '#000000ff',
              letterSpacing: '0.01em',
              lineHeight: '1.2',
              paddingTop: '0.05mm',
            }}
          >
            Program
          </span>
          <span
            style={{
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '5.9pt',
              color: '#000000',
              lineHeight: '1.2',
              paddingTop: '0.05mm',
            }}
          >
            :
          </span>
          <span
            style={{
              color: '#000000',
              fontWeight: 800,
              fontSize: '6.2pt',
              letterSpacing: '0.01em',
              lineHeight: '1.18',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {program}
          </span>
        </div>

        {/* BRANCH */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '14.5mm 2.0mm 1fr',
            minHeight: '2.55mm',
            alignItems: 'flex-start',
            marginBottom: '0.15mm',
          }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: '5.9pt',
              color: '#000000',
              letterSpacing: '0.01em',
              lineHeight: '1.2',
              paddingTop: '0.05mm',
            }}
          >
            Branch
          </span>
          <span
            style={{
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '5.9pt',
              color: '#000000',
              lineHeight: '1.2',
              paddingTop: '0.05mm',
            }}
          >
            :
          </span>
          <span
            style={{
              color: '#000000',
              fontWeight: 800,
              fontSize: '6.2pt',
              letterSpacing: '0.01em',
              lineHeight: '1.18',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {branch}
          </span>
        </div>

        {/* BATCH */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '14.5mm 2.0mm 1fr',
            minHeight: '2.55mm',
            alignItems: 'center',
            marginBottom: '0.15mm',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '5.9pt', color: '#000000', letterSpacing: '0.01em' }}>Batch</span>
          <span style={{ textAlign: 'center', fontWeight: 800, fontSize: '5.9pt', color: '#000000' }}>:</span>
          <span
            style={{
              color: '#000000',
              fontWeight: 800,
              fontSize: getDetailValueFontSize(batch, '6.2pt'),
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {batch}
          </span>
        </div>

        {/* VALIDITY */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '14.5mm 2.0mm 1fr',
            minHeight: '2.55mm',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '5.9pt', color: '#000000', letterSpacing: '0.01em' }}>Validity</span>
          <span style={{ textAlign: 'center', fontWeight: 800, fontSize: '5.9pt', color: '#000000' }}>:</span>
          <span
            style={{
              color: '#000000',
              fontWeight: 800,
              fontSize: getDetailValueFontSize(validity, '6.2pt'),
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {validity}
          </span>
        </div>
      </div>

      {/* ===================================================
          5. QR CODE + PRINCIPAL SIGNATURE
          • Anchored from BOTTOM so it sits safely above the wave
          • Clean vertical separation from the details above
      =================================================== */}
      {signatureUrl ? (
        /* ── WITH SIGNATURE: QR left, Sig right, bottom-pinned ── */
        <div
          className="absolute z-30"
          style={{
            left: '12mm',
            right: '9mm',
            bottom: '10.5mm',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          {/* QR in a fixed 10.2mm × 10.2mm box */}
          <div
            style={{
              width: '10.2mm',
              height: '10.2mm',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            <QRCodeSVG
              value={qrValue}
              size={300}
              level="M"
              includeMargin={false}
              fgColor="#111111"
              bgColor="#ffffff"
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>

          {/* Principal Signature block (right) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              width: '13mm',
              height: '10.5mm',
            }}
          >
            {/* Signature image — fills width, up to 6.5mm tall */}
            <img
              src={signatureUrl}
              alt="Principal Signature"
              style={{
                width: '18mm',
                height: '6.5mm',
                objectFit: 'contain',
                objectPosition: 'center bottom',
                display: 'block',
                flexShrink: 0,
              }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            {/* Divider line + label */}
            <div
              style={{
                width: '10mm',
                borderTop: '0.5pt solid #374151',
                marginTop: '0.5mm',
                paddingTop: '0.4mm',
                textAlign: 'center',
                fontSize: '4.4pt',
                fontWeight: 1000,
                color: '#000000',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              Principal
            </div>
          </div>
        </div>
      ) : (
        /* ── WITHOUT SIGNATURE: QR centered, 10.5mm × 10.5mm, bottom-pinned ── */
        <div
          className="absolute z-30"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '10.5mm',
            width: '10.5mm',
            height: '10.5mm',
            overflow: 'hidden',
          }}
        >
          <QRCodeSVG
            value={qrValue}
            size={300}
            level="M"
            includeMargin={false}
            fgColor="#000000"
            bgColor="#ffffff"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      )}

      {/* ===================================================
          6. BOTTOM RED WAVE
      =================================================== */}
      <div
        className="absolute left-0 right-0 bottom-0 z-20 overflow-hidden pointer-events-none"
        style={{
          height: '13.5mm',
        }}
      >
        <FrontBottomWaveSVG />

        {/* DYNAMIC WEBSITE */}
        {website ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: '2.2mm',
              zIndex: 30,
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
    </div>
  );
};


/* =========================================================
   EXPORT
========================================================= */

export default DigitalStudentCard;