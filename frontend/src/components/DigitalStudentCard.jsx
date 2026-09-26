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

  // Otherwise split near middle
  const mid = Math.ceil(words.length / 2);
  return [
    words.slice(0, mid).join(' '),
    words.slice(mid).join(' '),
  ];
};

const getTwoLineCollegeNameFontSize = (l1, l2) => {
  const maxLineLen = Math.max(String(l1 || '').trim().length, String(l2 || '').trim().length);
  if (maxLineLen <= 14) return '7.6pt';
  if (maxLineLen <= 17) return '7.1pt';
  if (maxLineLen <= 21) return '6.4pt';
  if (maxLineLen <= 25) return '5.7pt';
  if (maxLineLen <= 30) return '5.1pt';
  return '4.5pt';
};

const getCollegeNameFontSize = (nameStr) => {
  const len = String(nameStr || '').trim().length;
  if (len <= 26) return '7.5pt';
  if (len <= 34) return '7.0pt';
  if (len <= 42) return '6.5pt';
  return '6.0pt';
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
     BATCH
========================================================= */

  const rawBatch =
    studObj.batch ||
    get(
      'batch',
      '2026 – 30'
    );


  const batch =
    String(rawBatch).includes('–') ||
    String(rawBatch).includes('-')
      ? rawBatch
      : `${rawBatch} – ${
          Number(rawBatch) + 4
        }`;


  /* =======================================================
     VALIDITY
========================================================= */

  const validity =
    studObj.validity ||
    get(
      'validity',
      'Upto May 2030'
    );


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
        fontFamily: "'Inter', Arial, sans-serif",
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
      data-qr-admission={admissionNo}
    >

      {/* ===================================================
          1. HEADER
          Shifted right to center, logo + grey line + 2-line college name
      =================================================== */}
      <div
        className="absolute z-30 flex items-center"
        style={{
          left: '3.2mm',
          right: '2.0mm',
          top: '2.5mm',
          height: '9.2mm',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* COLLEGE LOGO */}
        <div
          style={{
            width: '17.0mm',
            height: '9.2mm',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translate(0.6mm, 0.6mm)',
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
            height: '7.2mm',
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
            height: '100%',
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
                    color: '#C01823',
                    fontWeight: 800,
                    fontSize: dynamicCollegeFontSize,
                    lineHeight: '1.14',
                    letterSpacing: '-0.015em',
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
                      color: '#C01823',
                      fontWeight: 800,
                      fontSize: dynamicCollegeFontSize,
                      lineHeight: '1.14',
                      letterSpacing: '-0.015em',
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
          2. STUDENT PHOTO + DECORATIVE RING (INCREASED SIZE)
      =================================================== */}
      <div
        className="absolute z-20 flex items-center justify-center"
        style={{
          left: '50%',
          top: '11.5mm',
          transform: 'translateX(-50%)',
          width: '32.5mm',
          height: '32.5mm',
        }}
      >
        <StudentPhotoFrame
          src={photoUrl || ''}
          photoUrl={photoUrl || ''}
          alt={name || 'Student Photo'}
          name={name}
          size={123}
        />
      </div>

      {/* ===================================================
          3. STUDENT NAME (AUTO-FITTING WIDTH)
      =================================================== */}
      <div
        className="absolute z-30 text-center"
        style={{
          left: '2mm',
          top: '43.2mm',
          width: '50mm',
          height: '4.6mm',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: studentNameFontSize,
            fontWeight: 800,
            color: '#111111',
            lineHeight: '1.1',
            letterSpacing: '0.02em',
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
          4. STUDENT DETAILS (CENTERED & REFINED SIZE)
      =================================================== */}
      <div
        className="absolute z-30"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          top: '48.5mm',
          width: '33.5mm',
          color: '#4B5563',
          fontSize: '5.8pt',
          lineHeight: '1.3',
        }}
      >
        {/* PIN */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '11.2mm 1.8mm 1fr',
            height: '2.65mm',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 500, fontSize: '5.8pt' }}>PIN No</span>
          <span style={{ textAlign: 'center', fontWeight: 500, fontSize: '5.8pt' }}>:</span>
          <span
            style={{
              color: '#111111',
              fontWeight: 700,
              fontSize: '6.0pt',
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
            gridTemplateColumns: '11.2mm 1.8mm 1fr',
            height: '2.65mm',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 500, fontSize: '5.8pt' }}>Program</span>
          <span style={{ textAlign: 'center', fontWeight: 500, fontSize: '5.8pt' }}>:</span>
          <span
            style={{
              color: '#111111',
              fontWeight: 700,
              fontSize: '6.0pt',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
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
            gridTemplateColumns: '11.2mm 1.8mm 1fr',
            height: '2.65mm',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 500, fontSize: '5.8pt' }}>Branch</span>
          <span style={{ textAlign: 'center', fontWeight: 500, fontSize: '5.8pt' }}>:</span>
          <span
            style={{
              color: '#111111',
              fontWeight: 700,
              fontSize: '6.0pt',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
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
            gridTemplateColumns: '11.2mm 1.8mm 1fr',
            height: '2.65mm',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 500, fontSize: '5.8pt' }}>Batch</span>
          <span style={{ textAlign: 'center', fontWeight: 500, fontSize: '5.8pt' }}>:</span>
          <span
            style={{
              color: '#111111',
              fontWeight: 700,
              fontSize: '6.0pt',
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
            gridTemplateColumns: '11.2mm 1.8mm 1fr',
            height: '2.65mm',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 500, fontSize: '5.8pt' }}>Validity</span>
          <span style={{ textAlign: 'center', fontWeight: 500, fontSize: '5.8pt' }}>:</span>
          <span
            style={{
              color: '#111111',
              fontWeight: 700,
              fontSize: '6.0pt',
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
          • Anchored from BOTTOM so it never overlaps the details above
          • QR: 13mm × 13mm container (high-res size=300 SVG scales down)
          • With sig: QR left | Sig right, both bottom-aligned
          • Without sig: QR centered
      =================================================== */}
      {principalSignatureUrl ? (
        /* ── WITH SIGNATURE: QR left, Sig right, bottom-pinned ── */
        <div
          className="absolute z-30"
          style={{
            left: '12mm',
            right: '9mm',
            bottom:'10mm',       /* sits just above the wave (13.5mm tall) */
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end', /* flush baseline for QR & "Principal" label */
            justifyContent: 'space-between',
          }}
        >
          {/* QR in a fixed 13mm × 13mm box */}
          <div
            style={{
              width: '11mm',
              height: '11mm',
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
              width: '10mm',
              height: '10mm',       /* same height as QR box */
            }}
          >
            {/* Signature image — fills width, up to 8mm tall */}
            <img
              src={principalSignatureUrl}
              alt="Principal Signature"
              style={{
                width: '21mm',
                height: '8mm',
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
                marginTop: '1mm',
                paddingTop: '0.6mm',
                textAlign: 'center',
                fontSize: '3.9pt',
                fontWeight: 700,
                color: '#1F2937',
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
        /* ── WITHOUT SIGNATURE: QR centered, 13mm × 13mm, bottom-pinned ── */
        <div
          className="absolute z-30"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '14.5mm',
            width: '13mm',
            height: '13mm',
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