import React from "react";
import "./StudentPhotoFrame.css";

const StudentPhotoFrame = ({
  src,
  photoUrl,
  alt = "Student Photo",
  name,
  size = 105,
}) => {
  const resolvedSrc =
    src || photoUrl || "https://placehold.co/400x400/f3f4f6/999999?text=Photo";
  const resolvedAlt =
    alt !== "Student Photo" ? alt : (name || alt || "Student Photo");

  return (
    <div
      className="student-photo-frame"
      style={{
        "--photo-size": typeof size === "number" ? `${size}px` : size,
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
      }}
    >
      {/* Decorative concentric red rings and gradients matching reference */}
      <svg
        className="photo-decorative-svg"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <defs>
          {/* Upper-right radiant gradient: normal red shade to white */}
          <linearGradient id="rightArcGrad" x1="95%" y1="42%" x2="45%" y2="95%">
            <stop offset="0%" stopColor="#E01E2B" />
            <stop offset="50%" stopColor="#F5606B" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>

          {/* Lower-left radiant gradient: normal red shade to white */}
          <linearGradient id="leftArcGrad" x1="95%" y1="42%" x2="45%" y2="95%">
            <stop offset="0%" stopColor="#E01E2B" />
            <stop offset="50%" stopColor="#F5606B" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>
        </defs>

        {/* Inner solid bright red circular ring encircling photo */}
        <circle
          cx="50"
          cy="50"
          r="38.2"
          fill="none"
          stroke="#E01E2B"
          strokeWidth="0.5"
        />

        {/* Outer Upper-Right Radiant Red Arc */}
        <circle
          cx="50"
          cy="50"
          r="44.2"
          fill="none"
          stroke="url(#rightArcGrad)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray="76 200"
          transform="rotate(-52 50 50)"
        />

        {/* Outer Lower-Left Radiant Red Arc */}
        <circle
          cx="50"
          cy="50"
          r="44.2"
          fill="none"
          stroke="url(#leftArcGrad)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray="64 212"
          transform="rotate(125 50 50)"
        />
      </svg>

      {/* Circular photo container with white gap */}
      <div className="photo-ring">
        <img
          src={resolvedSrc}
          alt={resolvedAlt}
          className="student-photo"
          onError={(e) => {
            e.currentTarget.src =
              "https://placehold.co/400x400/f3f4f6/999999?text=Photo";
          }}
        />
      </div>
    </div>
  );
};

export default StudentPhotoFrame;
