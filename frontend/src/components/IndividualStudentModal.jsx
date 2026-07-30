import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, User } from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from './LoadingAnimation';
import useStudentQuotas from '../hooks/useStudentQuotas';
import useCasteCategories from '../hooks/useCasteCategories';
import { buildCasteSelectOptions } from '../config/casteConfig';

// Dropdown options for student fields
const STUDENT_STATUS_OPTIONS = [
  'Regular',
  'Admission Cancelled',
  'Detained',
  'Discontinued',
  'Long Absent',
  'Rejoined'
];
const SCHOLAR_STATUS_OPTIONS = ['Eligible', 'Not Eligible'];
const CERTIFICATES_STATUS_OPTIONS = ['Submitted', 'Pending', 'Partial', 'Originals Returned', 'Not Required'];

const IndividualStudentModal = ({ isOpen, onClose, forms, isLoadingForms = false, onSubmitComplete }) => {
  const { quotas: studentQuotas, loading: studentQuotasLoading } = useStudentQuotas({ publicOnly: true });
  const {
    categories: casteCategories,
    casteOptions: dynamicCasteOptions,
    getCastesForCategory
  } = useCasteCategories({ publicOnly: true });
  const [selectedCasteCategoryId, setSelectedCasteCategoryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [colleges, setColleges] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(true);
  const [selectedCollegeId, setSelectedCollegeId] = useState(null);
  const [courseOptions, setCourseOptions] = useState([]);
  const [courseOptionsLoading, setCourseOptionsLoading] = useState(true);
  const [selectedCourseName, setSelectedCourseName] = useState('');
  const [selectedBranchName, setSelectedBranchName] = useState('');
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYearsLoading, setAcademicYearsLoading] = useState(true);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [admissionNumberLoading, setAdmissionNumberLoading] = useState(false);
  const [isAdmissionNumberManual, setIsAdmissionNumberManual] = useState(false);
  const [studentData, setStudentData] = useState({
    pin_no: '',
    current_year: '1',
    current_semester: '1',
    batch: '',
    college: '',
    course: '',
    branch: '',
    stud_type: '',
    student_name: '',
    student_status: '',
    scholar_status: '',
    student_mobile: '',
    parent_mobile1: '',
    parent_mobile2: '',
    caste: '',
    gender: '',
    father_name: '',
    dob: '',
    adhar_no: '',
    admission_no: '',
    student_address: '',
    city_village: '',
    mandal_name: '',
    district: '',
    previous_college: '',
    certificates_status: '',
    student_photo: '',
    remarks: ''
  });

  // Auto-select first form if available
  useEffect(() => {
    if (forms && forms.length > 0 && !selectedFormId) {
      setSelectedFormId(forms[0].form_id);
    }
  }, [forms, selectedFormId]);

  // Load all initial data in parallel for faster loading
  useEffect(() => {
    if (!isOpen) return;

    const loadInitialData = async () => {
      try {
        const [collegesRes, yearsRes] = await Promise.allSettled([
          api.get('/colleges'),
          api.get('/academic-years/active')
        ]);

        if (collegesRes.status === 'fulfilled') {
          setColleges(collegesRes.value.data.data || []);
        } else {
          toast.error('Failed to load colleges');
        }

        if (yearsRes.status === 'fulfilled') {
          setAcademicYears(yearsRes.value.data.data || []);
        }
      } finally {
        setCollegesLoading(false);
        setAcademicYearsLoading(false);
      }
    };

    loadInitialData();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const loadCourseConfig = async () => {
      try {
        setCourseOptionsLoading(true);
        // Always use the scoped /courses endpoint to respect user's assigned scope
        const url = selectedCollegeId
          ? `/courses?collegeId=${selectedCollegeId}&includeInactive=false`
          : '/courses?includeInactive=false';
        const response = await api.get(url);
        setCourseOptions(response.data.data || []);
      } catch (error) {
        console.error('Failed to load program configuration', error);
        toast.error(error.response?.data?.message || 'Failed to load program configuration');
      } finally {
        setCourseOptionsLoading(false);
      }
    };

    loadCourseConfig();
  }, [selectedCollegeId, isOpen]);

  const availableCourses = useMemo(
    () => courseOptions.filter((course) => course?.isActive !== false),
    [courseOptions]
  );

  const selectedCourse = useMemo(() => {
    if (!selectedCourseName) return null;
    return (
      availableCourses.find(
        (course) => course.name?.toLowerCase() === selectedCourseName.toLowerCase()
      ) || null
    );
  }, [availableCourses, selectedCourseName]);

  const branchOptions = useMemo(() => {
    if (!selectedCourse) return [];
    let branches = (selectedCourse.branches || []).filter(
      (branch) => branch?.isActive !== false
    );

    // Always deduplicate branches by name to avoid showing duplicates
    const branchMap = new Map();

    if (studentData.batch) {
      // If batch is selected, filter and prefer batch-specific branches
      const matchingBranches = branches.filter(
        (branch) => branch.academicYearLabel === studentData.batch || !branch.academicYearLabel
      );

      matchingBranches.forEach(branch => {
        const existing = branchMap.get(branch.name);
        // Prefer batch-specific branch over generic one
        if (!existing || branch.academicYearLabel === studentData.batch) {
          branchMap.set(branch.name, branch);
        }
      });
    } else {
      // If no batch selected, just deduplicate by name (show unique branch names)
      branches.forEach(branch => {
        if (!branchMap.has(branch.name)) {
          branchMap.set(branch.name, branch);
        }
      });
    }

    return Array.from(branchMap.values());
  }, [selectedCourse, studentData.batch]);

  const selectedBranch = useMemo(
    () =>
      branchOptions.find(
        (branch) =>
          branch.name?.toLowerCase() === selectedBranchName.toLowerCase()
      ) || null,
    [branchOptions, selectedBranchName]
  );

  const activeStructure = useMemo(() => {
    if (selectedBranch?.structure) return selectedBranch.structure;
    if (selectedCourse?.structure) return selectedCourse.structure;
    return null;
  }, [selectedBranch, selectedCourse]);

  const yearOptions = useMemo(() => {
    if (!activeStructure?.totalYears) {
      return ['1', '2', '3', '4'];
    }
    return Array.from(
      { length: activeStructure.totalYears },
      (_value, index) => String(index + 1)
    );
  }, [activeStructure]);

  const semesterOptions = useMemo(() => {
    // Get selected year
    const selectedYear = Number(studentData.current_year) || 0;

    // Check if structure has per-year semester configuration
    if (activeStructure?.years && Array.isArray(activeStructure.years) && selectedYear > 0) {
      const yearConfig = activeStructure.years.find(y => y.yearNumber === selectedYear);
      if (yearConfig && yearConfig.semesters && Array.isArray(yearConfig.semesters)) {
        return yearConfig.semesters.map(sem => String(sem.semesterNumber));
      }
    }

    // Fallback to default semestersPerYear
    if (!activeStructure?.semestersPerYear) {
      return ['1', '2'];
    }
    return Array.from(
      { length: activeStructure.semestersPerYear },
      (_value, index) => String(index + 1)
    );
  }, [activeStructure, studentData.current_year]);

  // Reset branch selection when batch changes
  useEffect(() => {
    if (selectedBranchName && branchOptions.length > 0) {
      const branchStillValid = branchOptions.some(
        (branch) => branch.name?.toLowerCase() === selectedBranchName.toLowerCase()
      );
      if (!branchStillValid) {
        setSelectedBranchName('');
        setStudentData((prev) => ({ ...prev, branch: '' }));
      }
    }

    if (!selectedBranchName && branchOptions.length === 1) {
      setSelectedBranchName(branchOptions[0].name);
    }
  }, [studentData.batch, branchOptions, selectedBranchName]);

  useEffect(() => {
    if (!selectedCourse) {
      if (selectedCourseName) {
        setSelectedCourseName('');
      }
      if (studentData.course !== '') {
        setStudentData((prev) => ({ ...prev, course: '' }));
      }
      if (selectedBranchName) {
        setSelectedBranchName('');
      }
      return;
    }

    setStudentData((prev) =>
      prev.course === selectedCourse.name
        ? prev
        : { ...prev, course: selectedCourse.name }
    );

    if (
      selectedBranchName &&
      !branchOptions.some(
        (branch) =>
          branch.name?.toLowerCase() === selectedBranchName.toLowerCase()
      )
    ) {
      setSelectedBranchName('');
    }

    if (!selectedBranchName && branchOptions.length === 1) {
      setSelectedBranchName(branchOptions[0].name);
    }
  }, [selectedCourse, branchOptions, selectedCourseName, selectedBranchName, studentData.course]);

  useEffect(() => {
    if (selectedBranch) {
      setStudentData((prev) =>
        prev.branch === selectedBranch.name
          ? prev
          : { ...prev, branch: selectedBranch.name }
      );
    } else if (studentData.branch) {
      setStudentData((prev) =>
        prev.branch === ''
          ? prev
          : { ...prev, branch: '' }
      );
    }
  }, [selectedBranch, studentData.branch]);

  // Auto-generate admission number when batch changes
  useEffect(() => {
    const generateAdmissionNumber = async () => {
      // Don't generate if no batch selected or if user manually entered an admission number
      if (!studentData.batch || isAdmissionNumberManual) {
        return;
      }

      try {
        setAdmissionNumberLoading(true);
        const response = await api.post('/submissions/generate-admission-series', {
          academicYear: studentData.batch
        });

        if (response.data.success && response.data.data.admissionNumbers?.[0]) {
          const generatedNumber = response.data.data.admissionNumbers[0];
          setStudentData((prev) => ({
            ...prev,
            admission_no: generatedNumber
          }));
        }
      } catch (error) {
        console.error('Failed to generate admission number:', error);
        // Don't show error toast - just let user enter manually if API fails
      } finally {
        setAdmissionNumberLoading(false);
      }
    };

    generateAdmissionNumber();
  }, [studentData.batch, isAdmissionNumberManual]);

  // Auto-calculate current year based on batch year
  useEffect(() => {
    if (!studentData.batch || !activeStructure) {
      return;
    }

    const batchYear = parseInt(studentData.batch, 10);
    const currentCalendarYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    let calculatedYear = currentCalendarYear - batchYear + 1;
    if (currentMonth < 6) {
      calculatedYear = calculatedYear - 1;
    }

    const totalYears = Number(activeStructure.totalYears) || 4;
    const semestersPerYear = Number(activeStructure.semestersPerYear) || 2;

    calculatedYear = Math.max(1, Math.min(calculatedYear, totalYears));

    let calculatedSemester = 1;
    if (currentMonth >= 6 && currentMonth <= 11) {
      calculatedSemester = 1;
    } else {
      calculatedSemester = Math.min(2, semestersPerYear);
    }

    setStudentData((prev) => {
      const shouldUpdate =
        prev.current_year !== String(calculatedYear) ||
        prev.current_semester !== String(calculatedSemester);

      if (shouldUpdate) {
        return {
          ...prev,
          current_year: String(calculatedYear),
          current_semester: String(calculatedSemester)
        };
      }
      return prev;
    });
  }, [studentData.batch, activeStructure]);

  const handleCollegeSelect = (event) => {
    const value = event.target.value;
    const collegeId = value ? parseInt(value, 10) : null;
    setSelectedCollegeId(collegeId);
    const selectedCollege = colleges.find(c => c.id === collegeId);
    setStudentData((prev) => ({
      ...prev,
      college: selectedCollege ? selectedCollege.name : '',
      course: '',
      branch: ''
    }));
    setSelectedCourseName('');
    setSelectedBranchName('');
  };

  const handleCourseSelect = (event) => {
    const value = event.target.value;
    setSelectedCourseName(value);
    setSelectedBranchName('');
    setStudentData((prev) => ({
      ...prev,
      course: value || '',
      branch: ''
    }));
  };

  const handleBranchSelect = (event) => {
    const value = event.target.value;
    setSelectedBranchName(value);
    setStudentData((prev) => ({
      ...prev,
      branch: value || ''
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Track if user manually changes admission number
    if (name === 'admission_no' && value) {
      setIsAdmissionNumberManual(true);
    }

    // If batch changes, reset the manual flag to allow auto-generation
    if (name === 'batch') {
      setIsAdmissionNumberManual(false);
    }

    setStudentData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    const requiredFields = [
      { field: 'student_name', label: 'Student Name' },
      { field: 'father_name', label: 'Father Name' },
      { field: 'gender', label: 'Gender' },
      { field: 'college', label: 'College' },
      { field: 'course', label: 'Course' },
      { field: 'branch', label: 'Branch' },
      { field: 'batch', label: 'Batch' },
      { field: 'student_mobile', label: 'Student Mobile' },
    ];

    const missingFields = requiredFields.filter(({ field }) => !studentData[field] || !studentData[field].toString().trim());

    if (missingFields.length > 0) {
      const fieldNames = missingFields.slice(0, 3).map(f => f.label).join(', ');
      const moreCount = missingFields.length > 3 ? ` and ${missingFields.length - 3} more` : '';
      toast.error(`Please fill in required fields: ${fieldNames}${moreCount}`);
      return;
    }

    if (!selectedFormId) {
      toast.error('Please select a form');
      return;
    }

    try {
      setLoading(true);

      // Create the submission data matching the form submission format
      const submissionData = {
        ...studentData,
        current_year: Number(studentData.current_year),
        current_semester: Number(studentData.current_semester)
      };

      // Submit to the submissions endpoint as a pending submission
      const response = await api.post(`/submissions/${selectedFormId}`, submissionData);

      if (response.data.success) {
        toast.success('Student submitted for approval successfully!');

        // Reset form
        setStudentData({
          pin_no: '',
          current_year: '1',
          current_semester: '1',
          batch: '',
          college: '',
          course: '',
          branch: '',
          stud_type: '',
          student_name: '',
          student_status: '',
          scholar_status: '',
          student_mobile: '',
          parent_mobile1: '',
          parent_mobile2: '',
          caste: '',
          gender: '',
          father_name: '',
          dob: '',
          adhar_no: '',
          admission_no: '',
          student_address: '',
          city_village: '',
          mandal_name: '',
          district: '',
          previous_college: '',
          certificates_status: '',
          student_photo: '',
          remarks: ''
        });
        setSelectedCollegeId(null);
        setSelectedCourseName('');
        setSelectedBranchName('');

        if (onSubmitComplete) {
          onSubmitComplete();
        }
        onClose();
      } else {
        toast.error(response.data.message || 'Failed to submit student');
      }
    } catch (error) {
      console.error('Error submitting student:', error);
      toast.error(error.response?.data?.message || 'Failed to submit student for approval');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStudentData({
      pin_no: '',
      current_year: '1',
      current_semester: '1',
      batch: '',
      college: '',
      course: '',
      branch: '',
      stud_type: '',
      student_name: '',
      student_status: '',
      scholar_status: '',
      student_mobile: '',
      parent_mobile1: '',
      parent_mobile2: '',
      caste: '',
      gender: '',
      father_name: '',
      dob: '',
      adhar_no: '',
      admission_no: '',
      student_address: '',
      city_village: '',
      mandal_name: '',
      district: '',
      previous_college: '',
      certificates_status: '',
      student_photo: '',
      remarks: ''
    });
    setSelectedCollegeId(null);
    setSelectedCourseName('');
    setSelectedBranchName('');
    setIsAdmissionNumberManual(false);
    onClose();
  };

  if (!isOpen) return null;

  // Show loading or error state for forms
  const formsNotReady = isLoadingForms || !forms || forms.length === 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <User size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold">Add Individual Student</h3>
                <p className="text-purple-100 text-sm mt-1">Submit student for admin approval • Student will be added to pending queue</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Forms Loading/Error State */}
        {formsNotReady && (
          <div className="p-8 text-center">
            {isLoadingForms ? (
              <div className="flex flex-col items-center gap-4">
                <LoadingAnimation width={48} height={48} showMessage={false} />
                <p className="text-gray-600">Loading registration form...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <X size={32} className="text-red-500" />
                </div>
                <p className="text-gray-600">No registration forms available.</p>
                <p className="text-sm text-gray-500">Please create a form first in the Forms section.</p>
                <button
                  onClick={handleClose}
                  className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}

        {/* Form Content - Only show when forms are loaded */}
        {!formsNotReady && (
          <>
            <div className="p-6 overflow-y-auto max-h-[calc(95vh-180px)]">
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Basic Information */}
                <div className="border-b border-gray-200 pb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    Basic Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Admission Number
                        {admissionNumberLoading && (
                          <span className="ml-2 text-xs text-primary-600">(Auto-generating...)</span>
                        )}
                        {!admissionNumberLoading && studentData.admission_no && !isAdmissionNumberManual && (
                          <span className="ml-2 text-xs text-green-600">(Auto-generated)</span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          name="admission_no"
                          value={studentData.admission_no}
                          onChange={handleChange}
                          disabled={admissionNumberLoading}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none ${admissionNumberLoading ? 'bg-gray-100' : ''}`}
                          placeholder={admissionNumberLoading ? 'Generating...' : 'Select batch to auto-generate'}
                        />
                        {admissionNumberLoading && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                          </div>
                        )}
                      </div>
                      {!isAdmissionNumberManual && studentData.batch && (
                        <p className="mt-1 text-xs text-gray-500">
                          Format: {studentData.batch.match(/\d{4}/)?.[0] || studentData.batch}XXXX
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        PIN Number
                      </label>
                      <input
                        type="text"
                        name="pin_no"
                        value={studentData.pin_no}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Student Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="student_name"
                        value={studentData.student_name}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Father Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="father_name"
                        value={studentData.father_name}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Gender <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="gender"
                        value={studentData.gender}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Gender</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Academic Information */}
                <div className="border-b border-gray-200 pb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    Academic Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* College */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        College <span className="text-red-500">*</span>
                      </label>
                      {collegesLoading ? (
                        <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2">
                          <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                          Loading colleges...
                        </div>
                      ) : (
                        <select
                          value={selectedCollegeId || ''}
                          onChange={handleCollegeSelect}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        >
                          <option value="">Select College</option>
                          {colleges.filter(c => c.isActive !== false).map((college) => (
                            <option key={college.id} value={college.id}>
                              {college.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Batch */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Batch (Academic Year) <span className="text-red-500">*</span>
                      </label>
                      {academicYearsLoading ? (
                        <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2">
                          <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                          Loading batches...
                        </div>
                      ) : academicYears.length > 0 ? (
                        <select
                          name="batch"
                          value={studentData.batch}
                          onChange={handleChange}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        >
                          <option value="">Select Batch</option>
                          {academicYears.map((year) => (
                            <option key={year.id} value={year.yearLabel}>
                              {year.yearLabel}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          name="batch"
                          value={studentData.batch}
                          onChange={handleChange}
                          placeholder="Enter batch year"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        />
                      )}
                    </div>

                    {/* Program */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Program <span className="text-red-500">*</span>
                      </label>
                      {courseOptionsLoading ? (
                        <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2">
                          <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                          Loading programs...
                        </div>
                      ) : availableCourses.length > 0 ? (
                        <select
                          value={selectedCourseName}
                          onChange={handleCourseSelect}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        >
                          <option value="">Select Program</option>
                          {availableCourses.map((course) => (
                            <option key={course.name} value={course.name}>
                              {course.name} {course.level ? `(${course.level.toUpperCase()})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          name="course"
                          value={studentData.course}
                          onChange={handleChange}
                          placeholder="Enter program"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        />
                      )}
                    </div>

                    {/* Branch */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Branch <span className="text-red-500">*</span>
                      </label>
                      {availableCourses.length > 0 && branchOptions.length > 0 ? (
                        <select
                          value={selectedBranchName}
                          onChange={handleBranchSelect}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        >
                          <option value="">Select Branch</option>
                          {branchOptions.map((branch) => (
                            <option key={branch.name} value={branch.name}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          name="branch"
                          value={studentData.branch}
                          onChange={handleChange}
                          required
                          placeholder={availableCourses.length > 0 ? 'No branches configured' : 'Enter branch'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        />
                      )}
                    </div>

                    {/* Current Year */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Academic Year
                      </label>
                      <select
                        name="current_year"
                        value={studentData.current_year}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Year</option>
                        {yearOptions.map((year) => (
                          <option key={year} value={year}>
                            Year {year}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Current Semester */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Semester
                      </label>
                      <select
                        name="current_semester"
                        value={studentData.current_semester}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Semester</option>
                        {semesterOptions.map((semester) => (
                          <option key={semester} value={semester}>
                            Semester {semester}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quota */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quota
                      </label>
                      <select
                        name="stud_type"
                        value={studentData.stud_type}
                        onChange={handleChange}
                        disabled={studentQuotasLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Quota</option>
                        {studentQuotas.map((quota) => (
                          <option key={quota.id} value={quota.code}>
                            {quota.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Student Status */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Student Status
                      </label>
                      <select
                        name="student_status"
                        value={studentData.student_status}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Status</option>
                        {STUDENT_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Scholar Status */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Scholar Status
                      </label>
                      <select
                        name="scholar_status"
                        value={studentData.scholar_status}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Scholar Status</option>
                        {SCHOLAR_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Previous College */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Previous College Name
                      </label>
                      <input
                        type="text"
                        name="previous_college"
                        value={studentData.previous_college}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="border-b border-gray-200 pb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    Contact Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Student Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        name="student_mobile"
                        value={studentData.student_mobile}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Parent Mobile Number 1
                      </label>
                      <input
                        type="tel"
                        name="parent_mobile1"
                        value={studentData.parent_mobile1}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Parent Mobile Number 2
                      </label>
                      <input
                        type="tel"
                        name="parent_mobile2"
                        value={studentData.parent_mobile2}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="border-b border-gray-200 pb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    Personal Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        name="dob"
                        value={studentData.dob}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Adhar Number
                      </label>
                      <input
                        type="text"
                        name="adhar_no"
                        value={studentData.adhar_no}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Caste
                      </label>
                      <select
                        value={selectedCasteCategoryId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setSelectedCasteCategoryId(nextId);
                          const allowed = getCastesForCategory(nextId);
                          if (studentData.caste && !allowed.includes(studentData.caste)) {
                            setStudentData((prev) => ({ ...prev, caste: '' }));
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Caste</option>
                        {casteCategories
                          .filter((cat) => cat.isActive !== false)
                          .map((cat) => (
                            <option key={cat.id} value={String(cat.id)}>
                              {cat.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subcaste
                      </label>
                      <select
                        name="caste"
                        value={studentData.caste}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select Subcaste</option>
                        {buildCasteSelectOptions(
                          selectedCasteCategoryId
                            ? getCastesForCategory(selectedCasteCategoryId)
                            : dynamicCasteOptions,
                          studentData.caste
                        ).map((caste) => (
                          <option key={caste} value={caste}>
                            {caste}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Address Information */}
                <div className="border-b border-gray-200 pb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    Address Information
                  </h2>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Student Address
                      </label>
                      <textarea
                        name="student_address"
                        value={studentData.student_address}
                        onChange={handleChange}
                        rows="2"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      ></textarea>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City/Village Name
                      </label>
                      <input
                        type="text"
                        name="city_village"
                        value={studentData.city_village}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mandal Name
                      </label>
                      <input
                        type="text"
                        name="mandal_name"
                        value={studentData.mandal_name}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        District
                      </label>
                      <input
                        type="text"
                        name="district"
                        value={studentData.district}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div className="pb-4">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    Additional Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Certificates Status is auto-calculated - no dropdown needed */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Remarks
                      </label>
                      <textarea
                        name="remarks"
                        value={studentData.remarks}
                        onChange={handleChange}
                        rows="2"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      ></textarea>
                    </div>

                    {/* Student Photo Upload */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Student Photo
                      </label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary-400 transition-colors bg-gray-50">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              // Validate file type
                              if (!file.type.startsWith('image/')) {
                                toast.error('Please select a valid image file');
                                return;
                              }

                              // Validate file size (5MB limit)
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error('File size should be less than 5MB');
                                return;
                              }

                              // Convert to base64 and store locally
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                const base64Data = reader.result;
                                setStudentData(prev => ({
                                  ...prev,
                                  student_photo: base64Data
                                }));
                                toast.success('Photo selected successfully');
                              };
                              reader.onerror = () => {
                                toast.error('Failed to read photo file');
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                          id="individual-photo-upload"
                        />
                        <label
                          htmlFor="individual-photo-upload"
                          className="cursor-pointer flex flex-col items-center gap-2"
                        >
                          {studentData.student_photo && studentData.student_photo.startsWith('data:') ? (
                            <img
                              src={studentData.student_photo}
                              alt="Student preview"
                              className="w-20 h-20 object-cover rounded-lg border-2 border-primary-300"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700">
                              {studentData.student_photo ? 'Change Photo' : 'Upload Photo'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              PNG, JPG up to 5MB
                            </p>
                          </div>
                        </label>
                        {studentData.student_photo && (
                          <div className="mt-3 p-2 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center gap-2 text-green-700 text-sm">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="font-medium">Photo selected</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                <span className="text-red-500">*</span> Required fields
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-700 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-indigo-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {loading ? (
                    <>
                      <LoadingAnimation width={16} height={16} variant="inline" showMessage={false} />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Submit for Approval
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default IndividualStudentModal;

