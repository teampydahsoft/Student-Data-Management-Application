import React, { useEffect, useMemo, useState } from 'react';
import { X, TrendingUp, Wand2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../config/api';
import LoadingAnimation from '../LoadingAnimation';
import UpdateSemesterEndDateModal from './UpdateSemesterEndDateModal';
import PromotionValidationModal from './PromotionValidationModal';

const ACADEMIC_STAGES = [
  { year: 1, semester: 1 },
  { year: 1, semester: 2 },
  { year: 2, semester: 1 },
  { year: 2, semester: 2 },
  { year: 3, semester: 1 },
  { year: 3, semester: 2 },
  { year: 4, semester: 1 },
  { year: 4, semester: 2 }
];

const getNextStage = (year, semester) => {
  const index = ACADEMIC_STAGES.findIndex(
    (stage) => stage.year === Number(year) && stage.semester === Number(semester)
  );
  if (index === -1 || index === ACADEMIC_STAGES.length - 1) {
    return null;
  }
  return ACADEMIC_STAGES[index + 1];
};

const PromoteStudentModal = ({ isOpen, student, onClose, onPromoted }) => {
  const [mode, setMode] = useState('auto');
  const [targetYear, setTargetYear] = useState(1);
  const [targetSemester, setTargetSemester] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [courseConfig, setCourseConfig] = useState(null);
  const [currentSemesterData, setCurrentSemesterData] = useState(null);
  const [nextSemesterData, setNextSemesterData] = useState(null);
  const [isUpdateSemesterModalOpen, setIsUpdateSemesterModalOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);

  const currentStage = useMemo(() => {
    if (!student) return { year: 1, semester: 1 };
    return {
      year: Number(student.current_year || 1),
      semester: Number(student.current_semester || 1)
    };
  }, [student]);

  // Fetch course configuration when student changes
  useEffect(() => {
    if (!isOpen || !student || !student.course) {
      setCourseConfig(null);
      return;
    }

    const fetchCourseConfig = async () => {
      try {
        const response = await api.get('/courses?includeInactive=false');
        const courses = response.data?.data || [];
        const course = courses.find(c => c.name === student.course);
        if (course) {
          setCourseConfig({
            totalYears: course.totalYears || course.total_years || course.defaultYears,
            semestersPerYear: course.semestersPerYear || course.semesters_per_year,
            yearSemesterConfig: course.yearSemesterConfig || course.year_semester_config
          });
        }
      } catch (error) {
        console.warn('Failed to fetch course configuration:', error);
        setCourseConfig(null);
      }
    };

    fetchCourseConfig();
  }, [isOpen, student]);

  const getNextStageWithConfig = (year, semester, config) => {
    const normalizedYear = Number(year);
    const normalizedSemester = Number(semester);

    if (!Number.isInteger(normalizedYear) || !Number.isInteger(normalizedSemester) || normalizedYear < 1 || normalizedSemester < 1) {
      return null;
    }

    // Get semester count for current year from course configuration
    let semestersForCurrentYear = 2; // Default
    const configuredTotalYears =
      config && Number.isInteger(Number(config.totalYears)) && Number(config.totalYears) > 0
        ? Number(config.totalYears)
        : null;
    
    if (config) {
      if (config.yearSemesterConfig && Array.isArray(config.yearSemesterConfig)) {
        const yearConfig = config.yearSemesterConfig.find(y => y.year === normalizedYear);
        if (yearConfig && yearConfig.semesters) {
          semestersForCurrentYear = yearConfig.semesters;
        } else if (config.semestersPerYear) {
          semestersForCurrentYear = config.semestersPerYear;
        }
      } else if (config.semestersPerYear) {
        semestersForCurrentYear = config.semestersPerYear;
      }
    }

    // If current semester is less than the semester count for this year, move to next semester
    if (normalizedSemester < semestersForCurrentYear) {
      return {
        year: normalizedYear,
        semester: normalizedSemester + 1
      };
    }

    // If we've completed all semesters for this year, move to next year
    const maxYears = configuredTotalYears || 10;
    if (normalizedYear >= maxYears) {
      return null;
    }

    return {
      year: normalizedYear + 1,
      semester: 1
    };
  };

  const automaticNextStage = useMemo(() => {
    return getNextStageWithConfig(currentStage.year, currentStage.semester, courseConfig);
  }, [currentStage, courseConfig]);

  const targetStage = useMemo(() => {
    return mode === 'auto'
      ? automaticNextStage
      : { year: Number(targetYear), semester: Number(targetSemester) };
  }, [mode, automaticNextStage, targetYear, targetSemester]);

  // Fetch semester data from academic calendar
  useEffect(() => {
    if (!isOpen || !student || !student.course_id || !currentStage) {
      setCurrentSemesterData(null);
      setNextSemesterData(null);
      return;
    }

    const fetchSemesterData = async () => {
      try {
        const response = await api.get('/semesters', {
          params: {
            courseId: student.course_id,
            batch: student.batch || student.academic_year
          }
        });
        const semesters = response.data?.data || [];
        
        const matchingCurrent = semesters.find(
          s => Number(s.yearOfStudy) === currentStage.year && Number(s.semesterNumber) === currentStage.semester
        );
        setCurrentSemesterData(matchingCurrent);

        if (targetStage) {
          const matchingNext = semesters.find(
            s => Number(s.yearOfStudy) === targetStage.year && Number(s.semesterNumber) === targetStage.semester
          );
          setNextSemesterData(matchingNext);
        } else {
          setNextSemesterData(null);
        }
      } catch (error) {
        console.warn('Failed to fetch semester data:', error);
        setCurrentSemesterData(null);
        setNextSemesterData(null);
      }
    };

    fetchSemesterData();
  }, [isOpen, student, currentStage, targetStage]);

  useEffect(() => {
    if (!student) {
      setTargetYear(1);
      setTargetSemester(1);
      setMode('auto');
      return;
    }

    setTargetYear(currentStage.year);
    setTargetSemester(currentStage.semester);
    setMode('auto');
  }, [student, currentStage]);

  if (!isOpen || !student) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    if (mode === 'auto' && !automaticNextStage) {
      toast.error('Student is already at the final academic stage');
      return;
    }

    setIsValidationModalOpen(true);
  };

  const executePromotion = async () => {
    try {
      setSubmitting(true);
      setIsValidationModalOpen(false);
      
      const payload =
        mode === 'manual'
          ? {
              targetYear: Number(targetYear),
              targetSemester: Number(targetSemester)
            }
          : {};

      const response = await api.post(
        `/students/${student.admission_number || student.admission_no}/promote`,
        payload
      );

      if (response.data?.success) {
        toast.success('Student promoted successfully');
        onPromoted?.(response.data.data);
        onClose();
      } else {
        toast.error(response.data?.message || 'Failed to promote student');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to promote student');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStageBadge = (stage) => (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-semibold border border-indigo-100">
      <TrendingUp size={16} />
      Year {stage.year} • Semester {stage.semester}
    </span>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 text-white">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp size={20} />
              Promote Student
            </h2>
            <p className="text-sm opacity-80">
              {student.student_name || student.student_data?.['Student Name'] || 'Student'} •{' '}
              {student.admission_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Current Stage
                </h3>
                {renderStageBadge(currentStage)}
                <p className="text-xs text-gray-500 mt-2">
                  Review the student&apos;s current academic year and semester.
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-2">
                  Automatic Next Stage
                </h3>
                {automaticNextStage ? (
                  <>
                    {renderStageBadge(automaticNextStage)}
                    <p className="text-xs text-indigo-600 mt-2">
                      The system promotes the student sequentially through each semester and year.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-indigo-700 font-medium">
                    ✨ Student has already completed all semesters (Year 4 • Semester 2)
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Wand2 size={18} className="text-indigo-500" />
                  Promotion Mode
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg border transition-colors ${
                      mode === 'auto'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                    }`}
                    onClick={() => setMode('auto')}
                  >
                    Automatic
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg border transition-colors ${
                      mode === 'manual'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                    }`}
                    onClick={() => setMode('manual')}
                  >
                    Manual
                  </button>
                </div>
              </div>

              {mode === 'manual' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Target Academic Year
                    </label>
                    <select
                      value={targetYear}
                      onChange={(event) => setTargetYear(Number(event.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          Year {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Target Semester
                    </label>
                    <select
                      value={targetSemester}
                      onChange={(event) => setTargetSemester(Number(event.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      {[1, 2].map((value) => (
                        <option key={value} value={value}>
                          Semester {value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed">
                  Let the system automatically calculate the next semester and academic year for this
                  student. This ensures that promotions follow the standard academic ladder from Year
                  1 Semester 1 up to Year 4 Semester 2.
                </p>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (mode === 'auto' && !automaticNextStage)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-transform hover:-translate-y-0.5"
            >
              {submitting ? (
                <>
                  <LoadingAnimation width={16} height={16} variant="inline" showMessage={false} />
                  Promoting...
                </>
              ) : (
                <>
                  <TrendingUp size={18} />
                  {mode === 'manual' ? 'Promote to Selection' : 'Promote to Next Stage'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <UpdateSemesterEndDateModal
        isOpen={isUpdateSemesterModalOpen}
        onClose={() => setIsUpdateSemesterModalOpen(false)}
        semesterData={currentSemesterData}
        onUpdated={(updatedSemester) => {
          setCurrentSemesterData(updatedSemester);
          setIsUpdateSemesterModalOpen(false);
          // Optional: re-trigger submit or let the user click submit again
        }}
      />

      <PromotionValidationModal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        currentSemesterData={currentSemesterData}
        nextSemesterData={nextSemesterData}
        onProceed={executePromotion}
        onUpdateEndDate={() => {
          setIsValidationModalOpen(false);
          setIsUpdateSemesterModalOpen(true);
        }}
      />
    </div>
  );
};

export default PromoteStudentModal;
