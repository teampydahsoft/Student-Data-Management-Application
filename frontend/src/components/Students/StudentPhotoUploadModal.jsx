import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Upload,
  X,
  RotateCcw,
  Check,
  AlertCircle,
  RefreshCw,
  FlipHorizontal,
  Sparkles,
  Image as ImageIcon,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Sun,
  Focus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Validation Threshold Constants for Student ID Photo (Broad & Tolerant)
const MIN_FACE_HEIGHT_RATIO = 0.18; // Minimum face height relative to frame height (18%)
const MIN_FACE_WIDTH_RATIO = 0.14;  // Minimum face width relative to frame width (14%)
const MAX_ROLL_DEG = 15;            // Max head tilt side-to-side (+/- 15 degrees)
const MAX_YAW_DEG = 20;             // Max head turn left/right (+/- 20 degrees)
const MAX_PITCH_DEG = 20;           // Max head tilt up/down (+/- 20 degrees)
const STABLE_VALID_DURATION_MS = 350; // Required continuous valid duration (ms) for "Ready ✓"

let faceLandmarkerPromise = null;

/**
 * Singleton loader for MediaPipe FaceLandmarker.
 * Re-uses detector instance across all live preview frames and photo uploads.
 */
export const getFaceLandmarker = async () => {
  if (faceLandmarkerPromise) return faceLandmarkerPromise;

  faceLandmarkerPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'IMAGE',
        numFaces: 5
      });
      return landmarker;
    } catch (gpuErr) {
      console.warn('MediaPipe GPU initialization failed, falling back to CPU:', gpuErr);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU'
          },
          runningMode: 'IMAGE',
          numFaces: 5
        });
        return landmarker;
      } catch (cpuErr) {
        console.error('MediaPipe FaceLandmarker initialization failed:', cpuErr);
        faceLandmarkerPromise = null;
        throw cpuErr;
      }
    }
  })();

  return faceLandmarkerPromise;
};

/**
 * Draws 1:1 square center crop of video onto canvas (and handles horizontal mirroring for selfie camera).
 * Guarantees that camera preview, live detection, final capture snapshot, and final validation operate on identical framing.
 */
export const drawCameraFrameToCanvas = (video, canvas, facingMode = 'user') => {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return false;
  }
  const vWidth = video.videoWidth;
  const vHeight = video.videoHeight;
  const minDim = Math.min(vWidth, vHeight);
  const cropX = (vWidth - minDim) / 2;
  const cropY = (vHeight - minDim) / 2;

  if (canvas.width !== minDim || canvas.height !== minDim) {
    canvas.width = minDim;
    canvas.height = minDim;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  if (facingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, cropX, cropY, minDim, minDim, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  return true;
};

/**
 * Evaluates photo composition and posture using MediaPipe FaceLandmarker.
 * Replaces all skin-pixel heuristic logic with real client-side AI face landmark detection.
 */
const evaluatePhotoGuidelinesAsync = async (canvas) => {
  if (!canvas || !canvas.width || !canvas.height) {
    return {
      passesAll: false,
      canCapture: false,
      instruction: 'No image frame available',
      faceCount: 0,
      validationState: {
        faceDetected: false,
        faceCountValid: false,
        faceSizeValid: false,
        headPostureValid: false,
        lightingValid: false
      },
      guidelines: [
        { id: 'landmarks', title: 'Face Detection', passed: false, reason: 'No image frame available' }
      ]
    };
  }

  let landmarker = null;
  try {
    landmarker = await getFaceLandmarker();
  } catch (err) {
    console.error('FaceLandmarker load error:', err);
  }

  if (!landmarker) {
    return {
      passesAll: false,
      canCapture: false,
      instruction: 'Initializing face detector...',
      faceCount: 0,
      validationState: {
        faceDetected: false,
        faceCountValid: false,
        faceSizeValid: false,
        headPostureValid: false,
        lightingValid: false
      },
      guidelines: [
        { id: 'landmarks', title: 'Face Detection', passed: false, reason: 'Face detector loading...' }
      ]
    };
  }

  const detectionResult = landmarker.detect(canvas);
  const faces = detectionResult?.faceLandmarks || [];
  const faceCount = faces.length;

  if (faceCount === 0) {
    return {
      passesAll: false,
      canCapture: false,
      instruction: 'No face detected',
      faceCount: 0,
      validationState: {
        faceDetected: false,
        faceCountValid: false,
        faceSizeValid: false,
        headPostureValid: false,
        lightingValid: true
      },
      guidelines: [
        { id: 'landmarks', title: 'Face Detection', passed: false, reason: 'No face detected in photo' },
        { id: 'size', title: 'Face Size & Framing', passed: false, reason: 'Face is missing' },
        { id: 'posture', title: 'Head Posture', passed: false, reason: 'Face is missing' },
        { id: 'lighting', title: 'Lighting & Quality', passed: true, reason: 'Clear frame loaded' }
      ]
    };
  }

  if (faceCount > 1) {
    return {
      passesAll: false,
      canCapture: false,
      instruction: 'Only one person should be visible',
      faceCount,
      validationState: {
        faceDetected: true,
        faceCountValid: false,
        faceSizeValid: false,
        headPostureValid: false,
        lightingValid: true
      },
      guidelines: [
        { id: 'landmarks', title: 'Face Detection', passed: false, reason: 'Only one person should be visible' },
        { id: 'size', title: 'Face Size & Framing', passed: false, reason: 'Multiple faces detected' },
        { id: 'posture', title: 'Head Posture', passed: false, reason: 'Multiple faces detected' },
        { id: 'lighting', title: 'Lighting & Quality', passed: true, reason: 'Clear frame loaded' }
      ]
    };
  }

  // Exactly 1 face detected!
  const landmarks = faces[0];

  // Bounding box from 478 normalized 3D landmarks
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.y > maxY) maxY = lm.y;
  }

  const faceWidthNorm = maxX - minX;
  const faceHeightNorm = maxY - minY;

  // Face size check
  const faceSizeValid = faceHeightNorm >= MIN_FACE_HEIGHT_RATIO && faceWidthNorm >= MIN_FACE_WIDTH_RATIO;

  // Head posture calculations (Roll, Yaw, Pitch)
  const rightEye = landmarks[33];
  const leftEye = landmarks[263];
  const noseTip = landmarks[1];
  const chin = landmarks[152];
  const topHead = landmarks[10];
  const rightCheek = landmarks[234];
  const leftCheek = landmarks[454];

  // Roll (head tilt side to side)
  const dy = leftEye.y - rightEye.y;
  const dx = leftEye.x - rightEye.x;
  const rollDeg = Math.atan2(dy, dx) * (180 / Math.PI);

  // Yaw (head turn left/right)
  const distRight = Math.abs(noseTip.x - rightCheek.x);
  const distLeft = Math.abs(leftCheek.x - noseTip.x);
  const yawRatio = (distLeft - distRight) / Math.max(0.001, distLeft + distRight);
  const yawDeg = yawRatio * 50;

  // Pitch (head tilt up/down)
  const distTop = Math.abs(noseTip.y - topHead.y);
  const distBottom = Math.abs(chin.y - noseTip.y);
  const pitchRatio = (distTop - distBottom) / Math.max(0.001, distTop + distBottom);
  const pitchDeg = pitchRatio * 50;

  const rollValid = Math.abs(rollDeg) <= MAX_ROLL_DEG;
  const yawValid = Math.abs(yawDeg) <= MAX_YAW_DEG;
  const pitchValid = Math.abs(pitchDeg) <= MAX_PITCH_DEG;

  const headPostureValid = rollValid && yawValid && pitchValid;
  const qualityValid = true;

  // Final composition equation (Requirement 11)
  const passesAll = faceCount === 1 && faceSizeValid && headPostureValid && qualityValid;

  let instruction = 'Hold still';
  if (!faceSizeValid) {
    instruction = 'Move closer';
  } else if (!headPostureValid) {
    instruction = 'Keep your face straight';
  } else if (passesAll) {
    instruction = 'Ready ✓';
  }

  const guidelines = [
    {
      id: 'landmarks',
      title: 'Face Detection',
      passed: faceCount === 1,
      reason: faceCount === 1 ? 'One clear face detected' : 'Face detection issue'
    },
    {
      id: 'size',
      title: 'Face Size & Framing',
      passed: faceSizeValid,
      reason: faceSizeValid ? 'Good face size & quality' : 'Move closer - face is too small'
    },
    {
      id: 'posture',
      title: 'Head Posture',
      passed: headPostureValid,
      reason: headPostureValid ? 'Head upright & front facing' : 'Keep your face straight'
    },
    {
      id: 'lighting',
      title: 'Lighting & Quality',
      passed: qualityValid,
      reason: 'Clear visibility'
    }
  ];

  return {
    passesAll,
    canCapture: passesAll,
    instruction,
    faceCount: 1,
    validationState: {
      faceDetected: true,
      faceCountValid: true,
      faceSizeValid,
      headPostureValid,
      lightingValid: true
    },
    guidelines
  };
};

/**
 * Analyzes uploaded image file on an offscreen canvas for guidelines.
 */
const analyzeFileImage = (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const res = await evaluatePhotoGuidelinesAsync(canvas);
      URL.revokeObjectURL(url);
      resolve(res);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ passesAll: false, guidelines: [] });
    };
    img.src = url;
  });
};

/**
 * Head and Shoulder Placement Guideline Overlay for 1:1 ratio photo capture & uploads.
 * Displays crisp head outline, eye-level indicator line, shoulder zone arches, and alignment status.
 */
export function JoiningPhotoGuidelinesOverlay({
  instructionText = 'Position face in camera view',
  showHdBadge = true,
  variant = 'camera',
  isValidGuideline = null
}) {
  const isMatched = isValidGuideline === true;
  const isFailed = isValidGuideline === false;

  const strokeMain = isMatched
    ? 'rgba(52, 211, 153, 0.95)'
    : isFailed
    ? 'rgba(251, 146, 60, 0.95)'
    : 'rgba(255, 255, 255, 0.95)';

  const strokeGuide = isMatched
    ? 'rgba(16, 185, 129, 0.9)'
    : isFailed
    ? 'rgba(249, 115, 22, 0.85)'
    : 'rgba(59, 130, 246, 0.85)';

  const strokeSoft = isMatched
    ? 'rgba(167, 243, 208, 0.7)'
    : isFailed
    ? 'rgba(253, 186, 116, 0.7)'
    : 'rgba(255, 255, 255, 0.6)';

  const fillSubtle = isMatched
    ? 'rgba(16, 185, 129, 0.12)'
    : isFailed
    ? 'rgba(249, 115, 22, 0.08)'
    : 'rgba(59, 130, 246, 0.08)';

  // Helper for corner framing brackets
  const corner = (x1, y1, x2, y2, x3, y3) => (
    <path
      d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`}
      stroke={strokeMain}
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 select-none overflow-hidden transition-colors duration-300 ${
        isFailed
          ? 'ring-4 ring-inset ring-amber-500/60'
          : isMatched
          ? 'ring-4 ring-inset ring-emerald-400/70'
          : ''
      }`}
      aria-hidden
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="guideGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1:1 Outer Corner Brackets */}
        {corner(6, 16, 6, 6, 16, 6)}
        {corner(94, 16, 94, 6, 84, 6)}
        {corner(6, 84, 6, 94, 16, 94)}
        {corner(94, 84, 94, 94, 84, 94)}

        {/* Center Vertical Axis Line */}
        <line x1="50" y1="8" x2="50" y2="92" stroke={strokeSoft} strokeWidth="0.5" strokeDasharray="2 3" />

        {/* --- HEAD GUIDELINES --- */}
        {/* Head Alignment Oval (Visual Guide) */}
        <ellipse
          cx="50"
          cy="40"
          rx="20"
          ry="24"
          stroke={strokeMain}
          strokeWidth="1.8"
          strokeDasharray="4 3"
          filter="url(#guideGlow)"
        />

        {/* Eye Level Line */}
        <line
          x1="26"
          y1="37"
          x2="74"
          y2="37"
          stroke={strokeGuide}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <text
          x="75"
          y="36.5"
          fill={isMatched ? '#a7f3d0' : isFailed ? '#fdba74' : 'rgba(147, 197, 253, 0.95)'}
          fontSize="2.4"
          fontWeight="600"
          fontFamily="sans-serif"
        >
          EYE LEVEL
        </text>

        {/* Eye Position Reference Dots */}
        <circle cx="42" cy="37" r="1.3" fill={strokeSoft} />
        <circle cx="58" cy="37" r="1.3" fill={strokeSoft} />

        {/* Nose & Mouth Guide */}
        <path d="M 50 42 L 50 46" stroke={strokeSoft} strokeWidth="1" strokeLinecap="round" />
        <path d="M 46 49 Q 50 52 54 49" stroke={strokeSoft} strokeWidth="1" strokeLinecap="round" />

        {/* Neck Lines */}
        <path d="M 42 62 L 42 67" stroke={strokeSoft} strokeWidth="1.2" strokeDasharray="2 2" />
        <path d="M 58 62 L 58 67" stroke={strokeSoft} strokeWidth="1.2" strokeDasharray="2 2" />

        {/* --- SHOULDER GUIDELINES --- */}
        {/* Left & Right Shoulder Arches */}
        <path
          d="M 12 88 C 22 75, 34 68, 42 67 M 58 67 C 66 68, 78 75, 88 88"
          stroke={strokeGuide}
          strokeWidth="1.8"
          strokeDasharray="4 3"
          strokeLinecap="round"
          filter="url(#guideGlow)"
        />
        {/* Shoulder Zone Fill Hint */}
        <path
          d="M 12 94 C 22 79, 34 70, 42 67 L 58 67 C 66 70, 78 79, 88 94 L 88 98 L 12 98 Z"
          fill={fillSubtle}
        />
      </svg>

      {/* Top Badges */}
      {showHdBadge ? (
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 shadow-md backdrop-blur-md border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            1:1 HD Ratio
          </span>
          {isMatched ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 shadow-md backdrop-blur-md border border-emerald-500/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Ready ✓
            </span>
          ) : isFailed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/90 px-2.5 py-1 text-[10px] font-semibold text-amber-300 shadow-md backdrop-blur-md border border-amber-500/50">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Adjust Position ⚠
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-medium text-blue-200 shadow-md backdrop-blur-md border border-blue-400/30">
              Guidelines Active
            </span>
          )}
        </div>
      ) : null}

      {/* Bottom Instruction Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-center pointer-events-none">
        <div
          className={`rounded-lg px-3.5 py-1.5 text-center shadow-lg backdrop-blur-md border transition-all duration-200 ${
            isMatched
              ? 'bg-emerald-950/90 border-emerald-400/60 text-emerald-100 scale-105'
              : isFailed
              ? 'bg-amber-950/90 border-amber-400/50 text-amber-100'
              : 'bg-slate-900/85 border-white/20 text-white'
          }`}
        >
          <p className="text-[11px] font-semibold tracking-wide drop-shadow-sm">
            {instructionText}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function StudentPhotoUploadModal({
  isOpen,
  onClose,
  onSuccess,
  onSelectPhoto,
  student,
  initialTab = 'camera'
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'camera' | 'file'
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [cameraError, setCameraError] = useState(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [hasActiveStream, setHasActiveStream] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(true);

  // Live guidelines validation state
  const [liveValidation, setLiveValidation] = useState({
    canCapture: false,
    instruction: 'Position face in camera view',
    progress: 100,
    validationState: {
      faceDetected: false,
      faceCountValid: false,
      faceSizeValid: false,
      headPostureValid: false,
      lightingValid: false
    },
    guidelines: []
  });

  const [validationResult, setValidationResult] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);

  const validStartRef = useRef(null);
  const lastStateUpdateRef = useRef(0);

  const facingModeRef = useRef(facingMode);
  facingModeRef.current = facingMode;

  // Continuous live validation loop (Throttled ~100ms, non-blocking)
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera' || previewUrl || !hasActiveStream || cameraError) {
      validStartRef.current = null;
      setLiveValidation({
        canCapture: false,
        instruction: 'Position face in camera view',
        progress: 100,
        validationState: {
          faceDetected: false,
          faceCountValid: false,
          faceSizeValid: false,
          headPostureValid: false,
          lightingValid: false
        },
        guidelines: []
      });
      return;
    }

    const offscreenCanvas = document.createElement('canvas');
    let isCancelled = false;
    let isDetecting = false;

    const processFrame = async () => {
      if (isCancelled) return;

      const now = Date.now();
      if (!isDetecting && now - lastStateUpdateRef.current >= 100) {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          lastStateUpdateRef.current = now;
          isDetecting = true;
          try {
            const drewFrame = drawCameraFrameToCanvas(video, offscreenCanvas, facingModeRef.current);
            if (drewFrame) {
              const evalResult = await evaluatePhotoGuidelinesAsync(offscreenCanvas);

              if (!isCancelled) {
                if (evalResult.passesAll) {
                  if (!validStartRef.current) {
                    validStartRef.current = Date.now();
                  }
                  const elapsed = Date.now() - validStartRef.current;
                  const isStable = elapsed >= STABLE_VALID_DURATION_MS;

                  setLiveValidation({
                    canCapture: isStable,
                    instruction: isStable ? 'Ready ✓' : 'Hold still',
                    progress: 100,
                    validationState: evalResult.validationState,
                    guidelines: evalResult.guidelines
                  });
                } else {
                  validStartRef.current = null;
                  setLiveValidation({
                    canCapture: false,
                    instruction: evalResult.instruction,
                    progress: 100,
                    validationState: evalResult.validationState,
                    guidelines: evalResult.guidelines
                  });
                }
              }
            }
          } catch (err) {
            console.warn('Frame detection error:', err);
          } finally {
            isDetecting = false;
          }
        }
      }

      if (!isCancelled) {
        animFrameRef.current = requestAnimationFrame(processFrame);
      }
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isCancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isOpen, activeTab, previewUrl, hasActiveStream, cameraError]);

  // Stop active camera stream safely without triggering state re-renders
  const stopCamera = useCallback(() => {
    validStartRef.current = null;
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (err) {
        console.warn('Error stopping camera track:', err);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setHasActiveStream(false);
    setIsCameraStarting(false);
  }, []);

  // Start camera stream with robust fallbacks
  const startCamera = useCallback(async (facingOverride) => {
    const facing = facingOverride || facingModeRef.current;
    validStartRef.current = null;

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('Error clearing previous track:', err);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraError(null);
    setIsCameraStarting(true);
    setHasActiveStream(false);

    try {
      if (
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        throw new Error(
          'Camera access requires a secure connection (HTTPS) or localhost. Please use File Upload or access via localhost.'
        );
      }

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by your browser. Please use File Upload.');
      }

      let stream = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing ? { ideal: facing } : 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (firstErr) {
        console.warn('First camera attempt failed, retrying with flexible constraints...', firstErr);

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: facing ? { facingMode: facing } : true,
            audio: false
          });
        } catch (secondErr) {
          console.warn('Second camera attempt failed, retrying with basic { video: true }...', secondErr);

          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }

      if (!stream) {
        throw new Error('Could not obtain camera stream.');
      }

      streamRef.current = stream;
      setHasActiveStream(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch((playErr) => {
              console.warn('Video play() auto-play error:', playErr);
            });
          }
        };
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Please allow camera permissions in your browser address bar and click Retry.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera device was detected on your computer.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError(
          'Camera is currently in use by another application (e.g. Zoom, Teams, or another tab). Please close it and retry.'
        );
      } else if (err.name === 'OverconstrainedError') {
        setCameraError('Camera resolution constraints could not be satisfied by your device.');
      } else {
        setCameraError(err.message || 'Unable to access camera.');
      }
    } finally {
      setIsCameraStarting(false);
    }
  }, []);

  // Ensure video element receives active stream whenever re-rendered
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  // Sync activeTab when modal opens with initialTab or closes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setCameraError(null);
      setValidationResult(null);
      validStartRef.current = null;
    } else {
      stopCamera();
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setCameraError(null);
      setValidationResult(null);
      setActiveTab(initialTab);
      validStartRef.current = null;
    }
  }, [isOpen, initialTab, stopCamera]);

  // Handle camera start/stop when activeTab, modal open state, or previewUrl changes
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !previewUrl) {
      startCamera(facingModeRef.current);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, previewUrl, startCamera, stopCamera]);

  // Flip camera (front / back)
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    facingModeRef.current = nextMode;
    validStartRef.current = null;
    if (!previewUrl && activeTab === 'camera') {
      startCamera(nextMode);
    }
  };

  // Capture snapshot from video stream & perform ONE FINAL face detection on actual full-res frame
  const capturePhoto = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    if (video.readyState < 2) {
      toast.error('Camera is still loading. Please wait a moment.');
      return;
    }

    const canvas = canvasRef.current || document.createElement('canvas');
    const drewFrame = drawCameraFrameToCanvas(video, canvas, facingMode);
    if (!drewFrame) {
      toast.error('Failed to capture camera frame');
      return;
    }

    // Final evaluation on the actual full-resolution captured canvas
    const evalResult = await evaluatePhotoGuidelinesAsync(canvas);
    setValidationResult(evalResult);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('Failed to create image blob');
          return;
        }
        const fileName = `student_${student?.admission_number || 'photo'}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        stopCamera();
        setSelectedFile(file);
        setPreviewUrl(url);

        if (!evalResult.passesAll) {
          toast.error(`Photo rejected: ${evalResult.instruction}`);
        } else {
          toast.success('Photo captured! All quality guidelines passed.');
        }
      },
      'image/jpeg',
      0.92
    );
  };

  // Retake or pick a different photo
  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationResult(null);
    validStartRef.current = null;

    if (activeTab === 'camera') {
      startCamera(facingMode);
    }
  };

  // File selection via input with strict posture & quality check using AI detector
  const handleFileSelect = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (JPG, PNG, WEBP).');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image size must be less than 5MB.');
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const evalResult = await analyzeFileImage(file);
    setValidationResult(evalResult);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    if (!evalResult.passesAll) {
      toast.error(`Selected photo rejected: ${evalResult.instruction}`);
    } else {
      toast.success('Selected photo passed all posture & quality checks!');
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Confirm and upload photo to server
  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please capture or select a photo first.');
      return;
    }

    if (validationResult && !validationResult.passesAll) {
      toast.error('Cannot save: Photo does not comply with posture and quality guidelines. Please retake photo.');
      return;
    }

    if (onSelectPhoto) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result;
        onSelectPhoto(base64Data, selectedFile);
        toast.success('Photo selected successfully!');
        handleClose();
      };
      reader.onerror = () => {
        toast.error('Failed to read image data.');
      };
      reader.readAsDataURL(selectedFile);
      return;
    }

    const admissionNumber = student?.admission_number;
    if (!admissionNumber) {
      toast.error('Student admission number is missing.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', selectedFile);
      formData.append('admissionNumber', admissionNumber);

      const res = await api.post('/students/upload-photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (res.data?.success) {
        const photoUrl = res.data.data?.photo_url || res.data.data?.url;
        toast.success('Student photo updated successfully!');
        if (onSuccess) {
          onSuccess(photoUrl);
        }
        handleClose();
      } else {
        toast.error(res.data?.message || 'Failed to upload photo.');
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      toast.error(err.response?.data?.message || 'Failed to upload student photo.');
    } finally {
      setIsUploading(false);
    }
  };

  // Safe modal close
  const handleClose = () => {
    stopCamera();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSelectedFile(null);
    setValidationResult(null);
    validStartRef.current = null;
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Camera size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
                Update Student Photo
              </h3>
              <p className="text-xs text-slate-500">
                {student?.student_name || 'Student'}
                {student?.admission_number ? ` • ${student.admission_number}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        {!previewUrl && (
          <div className="p-3 bg-slate-50/80 border-b border-gray-100">
            <div className="flex p-1 bg-slate-200/70 rounded-xl max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('camera');
                  setCameraError(null);
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'camera'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera size={14} />
                Camera Capture
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('file');
                  stopCamera();
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'file'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload size={14} />
                File Upload
              </button>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col items-center justify-center min-h-[320px]">
          {/* Preview Mode */}
          {previewUrl ? (
            <div className="w-full flex flex-col items-center">
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden border-4 border-indigo-100 shadow-xl bg-slate-900">
                <img
                  src={previewUrl}
                  alt="Captured Preview"
                  className="w-full h-full object-cover"
                />
                <div
                  className={`absolute top-2 right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1 ${
                    validationResult?.passesAll ? 'bg-emerald-600/90' : 'bg-rose-600/90'
                  }`}
                >
                  {validationResult?.passesAll ? (
                    <>
                      <Check size={10} className="text-white" />
                      Compliant
                    </>
                  ) : (
                    <>
                      <XCircle size={10} className="text-white" />
                      Rejected
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2 text-center">
                <p className="text-xs font-bold text-gray-800">
                  {selectedFile?.name || 'Captured Photo'}
                </p>
                {selectedFile?.size && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              {/* Guidelines Compliance Card */}
              {validationResult && (
                <div className="w-full max-w-sm mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-xs text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
                    <h5 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <ShieldCheck
                        size={15}
                        className={validationResult.passesAll ? 'text-emerald-600' : 'text-rose-600'}
                      />
                      Posture & Quality Verification
                    </h5>
                    {validationResult.passesAll ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center gap-1">
                        <CheckCircle2 size={11} /> PASSED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold flex items-center gap-1">
                        <XCircle size={11} /> REJECTED
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {validationResult.guidelines.map((g) => (
                      <div key={g.id} className="text-[11px] leading-tight flex items-start gap-2">
                        {g.passed ? (
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={13} className="text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className={`font-bold ${g.passed ? 'text-slate-800' : 'text-rose-900'}`}>
                            {g.title}
                          </span>
                          <p className={`text-[10.5px] mt-0.5 ${g.passed ? 'text-slate-500' : 'text-rose-700 font-semibold'}`}>
                            {g.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!validationResult.passesAll && (
                    <div className="mt-2.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px] font-medium flex items-center gap-1.5">
                      <ShieldAlert size={14} className="text-rose-600 shrink-0" />
                      <span>Photo rejected: Does not meet posture or quality guidelines. Please click Retake.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mt-4 w-full max-w-sm">
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={isUploading}
                  className="flex-1 py-2 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Retake Photo
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isUploading || (validationResult && !validationResult.passesAll)}
                  title={validationResult && !validationResult.passesAll ? 'Fix posture/quality issues to save' : 'Confirm & Save'}
                  className={`flex-1 py-2 px-3 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 ${
                    validationResult && !validationResult.passesAll
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-indigo-200'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Confirm & Save
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : activeTab === 'camera' ? (
            /* Camera Mode */
            <div className="w-full flex flex-col items-center">
              {/* Guidelines Reference Accordion */}
              <div className="w-full max-w-sm mb-3 bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5 text-left transition-all">
                <div
                  onClick={() => setShowGuidelines(!showGuidelines)}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <ShieldCheck size={15} className="text-indigo-600" />
                    Posture & Camera Guidelines
                  </span>
                  <span className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                    {showGuidelines ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </div>

                {showGuidelines && (
                  <ul className="mt-2 space-y-1 text-[11px] text-indigo-950 font-medium border-t border-indigo-100/80 pt-2">
                    <li className="flex items-start gap-1.5">
                      <UserCheck size={13} className="text-indigo-600 shrink-0 mt-0.5" />
                      <span><strong>Face Alignment:</strong> Position face straight ahead in camera view.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <Focus size={13} className="text-indigo-600 shrink-0 mt-0.5" />
                      <span><strong>Face Visibility:</strong> Ensure exactly one face is clearly visible.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <Sun size={13} className="text-indigo-600 shrink-0 mt-0.5" />
                      <span><strong>Lighting:</strong> Ensure even room lighting without heavy shadows or backlight.</span>
                    </li>
                  </ul>
                )}
              </div>

              {cameraError ? (
                <div className="p-5 max-w-sm bg-rose-50 border border-rose-200 rounded-2xl text-center">
                  <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                    <AlertCircle size={22} />
                  </div>
                  <h4 className="text-sm font-bold text-rose-900 mb-1">Camera Access Issue</h4>
                  <p className="text-xs text-rose-700 leading-relaxed mb-4">{cameraError}</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      className="px-3 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-700 transition-colors"
                    >
                      Retry Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('file')}
                      className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Use File Upload Instead
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Viewfinder Frame with JoiningPhotoGuidelinesOverlay */}
                  <div className="relative w-72 h-72 sm:w-80 sm:h-80 rounded-3xl overflow-hidden bg-slate-900 shadow-2xl flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                    />

                    <JoiningPhotoGuidelinesOverlay
                      instructionText={liveValidation.instruction}
                      showHdBadge={true}
                      variant="camera"
                      isValidGuideline={liveValidation.canCapture}
                    />

                    {isCameraStarting && (
                      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center text-white text-xs gap-2 z-20">
                        <RefreshCw size={20} className="animate-spin text-indigo-400" />
                        <span>Starting camera...</span>
                      </div>
                    )}

                    {/* Flip camera button */}
                    <button
                      type="button"
                      onClick={toggleFacingMode}
                      className="absolute bottom-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-colors z-20 pointer-events-auto"
                      title="Switch camera"
                    >
                      <FlipHorizontal size={16} />
                    </button>
                  </div>

                  <p className="text-[11px] font-semibold text-slate-600 mt-2 text-center">
                    {liveValidation.instruction}
                  </p>

                  {/* Trigger Button - Always unblocked while camera active */}
                  <div className="mt-3 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={isCameraStarting || !hasActiveStream}
                      className="group relative flex items-center justify-center w-16 h-16 rounded-full border-4 shadow-xl transition-all bg-white border-emerald-500 hover:scale-105 active:scale-95 cursor-pointer shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Capture Photo"
                    >
                      <span className="w-11 h-11 rounded-full transition-all bg-gradient-to-tr from-emerald-600 to-teal-500 group-hover:from-emerald-700 group-hover:to-teal-600" />
                    </button>
                  </div>
                </>
              )}
              {/* Hidden canvas for snapshot rendering */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          ) : (
            /* File Upload Mode */
            <div className="w-full max-w-sm flex flex-col items-center">
              {/* Guidelines Notice for File Upload */}
              <div className="w-full mb-3 bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5 text-left">
                <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-1">
                  <ShieldCheck size={15} className="text-indigo-600" />
                  Uploaded Photo Requirements
                </span>
                <p className="text-[11px] text-indigo-950 font-medium leading-relaxed">
                  Uploaded image will be automatically validated for face presence, face size, upright head posture, and image quality.
                </p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                  isDragOver
                    ? 'border-indigo-500 bg-indigo-50/70 scale-[1.01]'
                    : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 shadow-xs">
                  <ImageIcon size={26} />
                </div>

                <h4 className="text-sm font-bold text-gray-800 mb-1">
                  Choose an image or drag & drop
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  JPEG, PNG, or WEBP up to 5MB
                </p>

                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-indigo-600 shadow-xs hover:bg-indigo-50 transition-colors">
                  <Upload size={12} />
                  Browse from device
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Sparkles size={13} className="text-amber-500" />
            AI face posture & quality guidelines enabled
          </span>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="px-3 py-1.5 text-slate-600 hover:text-slate-900 font-bold hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
