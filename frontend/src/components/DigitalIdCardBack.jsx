import React from 'react';

const DEFAULT_INSTRUCTIONS = [
  'This identity card is the property of the institution and must be carried at all times while on campus.',
  'The card must be produced on demand by any authorized college official.',
  'Loss or damage of this card must be reported immediately to the college office.',
  'A duplicate card may be issued only on payment of the prescribed fee.',
  'Misuse of this card will lead to disciplinary action as per college rules.',
  'On completion of the course or leaving the college, this card must be surrendered to the office.',
];

/**
 * ID Card back side — same footprint as front (max-w 380px, CR80 aspect).
 * Logo + instructions + return note + red college footer (matches front).
 */
const DigitalIdCardBack = ({
  college = 'PYDAH GROUP',
  instructions = DEFAULT_INSTRUCTIONS,
  className = '',
  rotate180 = false,
}) => {
  return (
    <div
      className={`id-card-print-root id-card-back digital-id-card-back w-full max-w-[380px] mx-auto rounded-[1.5rem] sm:rounded-[2rem] border border-gray-300 bg-[#f8f9fa] shadow-2xl overflow-hidden relative flex flex-col transition-transform duration-300 ${rotate180 ? 'rotate-180 rotate-back-180' : ''} ${className}`}
      style={{
        fontFamily: "'Inter', sans-serif",
        aspectRatio: '54 / 85.6',
        minHeight: '520px',
      }}
    >
      <div className="id-card-header-graphic absolute top-0 left-0 right-0 h-28 sm:h-36 overflow-hidden pointer-events-none z-0">
        <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,0 L400,0 L400,20 L180,120 L0,40 Z" fill="#b91c1c" />
          <path d="M400,20 L400,80 L220,160 Z" fill="#ef4444" opacity="0.8" />
          <path d="M0,40 L180,120 L220,160 L0,200 Z" fill="#dc2626" opacity="0.9" />
        </svg>
      </div>

      {/* Body fills space ABOVE footer — footer stays pinned */}
      <div className="id-card-body relative z-10 flex flex-col flex-1 min-h-0 w-full pt-10 sm:pt-12 pb-2 overflow-hidden">
        <div className="id-card-logo-wrap w-full flex justify-center mb-3 sm:mb-4 shrink-0">
          <div className="bg-white/95 backdrop-blur-md p-2 rounded-xl shadow-sm h-[72px] sm:h-[90px] inline-flex items-center justify-center border border-white/50">
            <img src="/logo.png" alt="PYDAH GROUP" className="h-full w-auto object-contain max-w-[140px] sm:max-w-none" />
          </div>
        </div>

        <div className="id-card-content px-4 sm:px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
          <h3 className="id-card-back-title shrink-0 text-center text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#991b1b] mb-2 sm:mb-3">
            Instructions
          </h3>

          <ol className="id-card-back-instructions shrink min-h-0 overflow-hidden space-y-1.5 sm:space-y-2 text-[10px] sm:text-[11px] text-slate-950 font-bold leading-snug list-decimal list-outside pl-4">
            {instructions.map((line, idx) => (
              <li key={idx} className="pl-0.5">
                {line}
              </li>
            ))}
          </ol>

          <div className="id-card-back-note shrink-0 mt-auto pt-3 pb-1 border-t border-dashed border-gray-300 text-center">
            <p className="text-[9px] sm:text-[10px] font-black text-slate-800 uppercase tracking-wide">
              If found, please return to
            </p>
            <p className="text-[10px] sm:text-xs font-black text-black mt-1 uppercase leading-tight">
              {college}
            </p>
          </div>
        </div>
      </div>

      {/* Red footer — same as front, always at card bottom */}
      <div className="id-card-footer shrink-0 bg-[#b91c1c] py-3 px-3 sm:px-4 flex items-center justify-center z-20 shadow-lg border-t border-red-800 rounded-b-[1.5rem] sm:rounded-b-[2rem]">
        <span className="text-white text-[10px] sm:text-xs font-black tracking-wide uppercase text-center leading-snug break-words px-1">
          {college}
        </span>
      </div>
    </div>
  );
};

export default DigitalIdCardBack;
export { DEFAULT_INSTRUCTIONS };
