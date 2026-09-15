import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, X, RotateCcw, Check, AlertCircle, RefreshCw, FlipHorizontal, Sparkles, Image as ImageIcon } from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export default function StudentPhotoUploadModal({
  isOpen,
  onClose,
  student,
  onSuccess,
  onSelectPhoto
}) {
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'file'
  const [cameraStream, setCameraStream] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [cameraError, setCameraError] = useState(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Stop active camera stream
  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [cameraStream]);

  // Start camera stream
  const startCamera = useCallback(async (facing = facingMode) => {
    stopCamera();
    setCameraError(null);
    setIsCameraStarting(true);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by your browser or connection.');
      }

      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // auto-play catch
        }
      }
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in browser settings or switch to File Upload.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera device was detected on your device.');
      } else {
        setCameraError(err.message || 'Unable to access camera. Please check your camera connection.');
      }
    } finally {
      setIsCameraStarting(false);
    }
  }, [facingMode, stopCamera]);

  // Handle modal visibility and active tab changes
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'camera' && !previewUrl) {
        startCamera(facingMode);
      } else {
        stopCamera();
      }
    } else {
      stopCamera();
      // Reset state on close
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setCameraError(null);
      setActiveTab('camera');
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, previewUrl, startCamera, stopCamera]);

  // Flip camera (front / back)
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    if (!previewUrl && activeTab === 'camera') {
      startCamera(nextMode);
    }
  };

  // Capture snapshot from video stream
  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') {
      // Mirror horizontal for natural selfie feel
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('Failed to capture photo frame');
          return;
        }
        const fileName = `student_${student?.admission_number || 'photo'}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        stopCamera();
        setSelectedFile(file);
        setPreviewUrl(url);
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

    if (activeTab === 'camera') {
      startCamera(facingMode);
    }
  };

  // File selection via input
  const handleFileSelect = (file) => {
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

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
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

    // If onSelectPhoto callback is provided (e.g., in Add Student wizard without existing admission number)
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
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
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
                <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1">
                  <Check size={10} className="text-emerald-400" />
                  Ready
                </div>
              </div>

              <div className="mt-3 text-center">
                <p className="text-xs font-bold text-gray-800">
                  {selectedFile?.name || 'Captured Photo'}
                </p>
                {selectedFile?.size && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 mt-5 w-full max-w-xs">
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={isUploading}
                  className="flex-1 py-2 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex-1 py-2 px-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                  {/* Viewfinder Frame */}
                  <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden bg-slate-900 shadow-2xl border-4 border-slate-800 flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                    />

                    {/* Framing guide overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      {/* Face positioning oval */}
                      <div className="w-44 h-52 sm:w-48 sm:h-56 rounded-[50%] border-2 border-dashed border-white/60 shadow-inner" />
                      {/* Corner marks */}
                      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white/80 rounded-tl-lg" />
                      <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white/80 rounded-tr-lg" />
                      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white/80 rounded-bl-lg" />
                      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white/80 rounded-br-lg" />
                    </div>

                    {isCameraStarting && (
                      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center text-white text-xs gap-2">
                        <RefreshCw size={20} className="animate-spin text-indigo-400" />
                        <span>Starting camera...</span>
                      </div>
                    )}

                    {/* Flip camera button */}
                    <button
                      type="button"
                      onClick={toggleFacingMode}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-xs transition-colors"
                      title="Switch camera"
                    >
                      <FlipHorizontal size={16} />
                    </button>
                  </div>

                  <p className="text-[11px] font-semibold text-slate-500 mt-2 text-center">
                    Align student face within the framing guide and snap
                  </p>

                  {/* Trigger Button */}
                  <div className="mt-4 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={isCameraStarting || !cameraStream}
                      className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-white border-4 border-indigo-600 shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Capture Photo"
                    >
                      <span className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 group-hover:from-indigo-700 group-hover:to-blue-600 transition-colors" />
                    </button>
                  </div>
                </>
              )}
              {/* Hidden canvas for snapshot rendering */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          ) : (
            /* File Upload Mode */
            <div className="w-full max-w-sm">
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
            Square or portrait photo recommended
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
    </div>
  );
}
