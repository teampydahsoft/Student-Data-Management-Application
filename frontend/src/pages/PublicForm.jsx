import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, FileText, Upload } from 'lucide-react';
import api from '../config/api';
import toast, { Toaster } from 'react-hot-toast';
import LoadingAnimation from '../components/LoadingAnimation';

const COURSE_FIELD_IDENTIFIERS = ['course', 'course name'];
const BRANCH_FIELD_IDENTIFIERS = ['branch', 'branch name'];
const YEAR_FIELD_IDENTIFIERS = ['current academic year', 'current year', 'year'];
const SEMESTER_FIELD_IDENTIFIERS = ['current semester', 'semester'];

const normalizeIdentifier = (value) =>
  value ? value.toString().toLowerCase().replace(/[_-]/g, ' ').trim() : '';

const matchesFieldIdentifier = (field, identifiers = []) => {
  const normalizedKey = normalizeIdentifier(field.key);
  const normalizedLabel = normalizeIdentifier(field.label);

  return identifiers.some((identifier) => {
    const normalizedIdentifier = identifier.toLowerCase();
    return (
      normalizedKey === normalizedIdentifier ||
      normalizedLabel === normalizedIdentifier ||
      normalizedLabel.includes(normalizedIdentifier) ||
      normalizedKey.includes(normalizedIdentifier)
    );
  });
};

// Field category mappings - expanded to catch more variations
// All fields from AddStudent form are included here
// IMPORTANT: Order matters - check ACADEMIC_FIELDS before BASIC_FIELDS for fields like "Admission Year"
const BASIC_FIELDS = [
  'student_name', 'student name', 'name', 'studentname',
  'father_name', 'father name', 'father', 'fathername',
  'gender', 'm/f', 'sex', 'mf',
  'dob', 'date of birth', 'birth date', 'birthday', 'date-month-year', 'date month year',
  'adhar_no', 'adhar number', 'aadhar', 'aadhar no', 'aadhar number', 'adhar', 'aadhar_no', 'aadhar no',
  'pin_no', 'pin number', 'pin', 'pinno',
  'apaar', 'apaar id', 'apaar_id', 'apaar number', 'apaar no', 'apaarid',
  'mother_name', 'mother name', 'mother', 'mothername',
  'admission_no', 'admission number', 'admission', 'admissionno'
  // Note: 'admission year' is NOT in BASIC_FIELDS - it should be in ACADEMIC_FIELDS
];
const ACADEMIC_FIELDS = [
  'college', 'college name', 'collegename',
  'batch', 'academic year', 'batch year', 'admission year', 'admission year (ex:', 'admission year ex', 'admission year (ex: 09-sep-2003)',
  'course', 'course name', 'coursename',
  'branch', 'branch name', 'specialization', 'branchname',
  'current_year', 'current academic year', 'current year', 'year', 'currentyear',
  'current_semester', 'current semester', 'semester', 'currentsemester',
  'stud_type', 'student type', 'student_type', 'type', 'studtype',
  'student_status', 'student status', 'status', 'studentstatus',
  'scholar_status', 'scholar status', 'scholarship status', 'scholarstatus',
  'previous_college', 'previous college', 'previous college name', 'previous_college_name', 'previouscollege'
];
const CONTACT_FIELDS = [
  'student_mobile', 'student mobile', 'student mobile number', 'student phone', 'mobile', 'studentmobile',
  'parent_mobile1', 'parent mobile1', 'parent mobile 1', 'parent mobile number 1', 'parent phone 1', 'parentmobile1',
  'parent_mobile2', 'parent mobile2', 'parent mobile 2', 'parent mobile number 2', 'parent phone 2', 'parentmobile2',
  'phone', 'contact', 'telephone', 'mobile number', 'mobilenumber'
];
const ADDRESS_FIELDS = [
  'student_address', 'student address', 'address', 'full address', 'permanent address', 'studentaddress',
  'city_village', 'city village', 'city/village', 'city village name', 'city or village', 'cityvillage', 'city/village name', 'cityvillage name',
  'mandal_name', 'mandal name', 'mandal', 'mandalname',
  'district', 'district name', 'districtname',
  'state', 'state name', 'statename',
  'pincode', 'pin code', 'postal code', 'zip code', 'pincode'
];
const ADDITIONAL_FIELDS = [
  'caste', 'category',
  'certificates_status', 'certificate status', 'certificates status', 'cert status', 'certificatesstatus',
  'remarks', 'remark', 'notes', 'note', 'comments', 'comment',
  'student_photo', 'student photo', 'photo', 'image', 'picture', 'profile picture', 'studentphoto',
  'certificate', 'document'
];

const categorizeField = (field) => {
  const key = field.key?.toLowerCase() || '';
  const label = field.label?.toLowerCase() || '';

  // Normalize: remove special chars, extra spaces, and parentheses content
  const normalize = (str) => {
    return str
      .replace(/[()]/g, ' ') // Remove parentheses
      .replace(/\([^)]*\)/g, '') // Remove content in parentheses
      .replace(/[_-]/g, ' ') // Replace underscores and hyphens with spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim()
      .toLowerCase();
  };

  const normalizedKey = normalize(key);
  const normalizedLabel = normalize(label);

  // Helper to check if pattern matches
  const matches = (pattern) => {
    const normalizedPattern = normalize(pattern);
    return normalizedKey.includes(normalizedPattern) ||
      normalizedLabel.includes(normalizedPattern) ||
      normalizedKey.startsWith(normalizedPattern) ||
      normalizedLabel.startsWith(normalizedPattern) ||
      normalizedKey === normalizedPattern ||
      normalizedLabel === normalizedPattern;
  };

  // IMPORTANT: Check ACADEMIC_FIELDS first to catch "Admission Year" before it matches BASIC_FIELDS
  if (ACADEMIC_FIELDS.some(matches)) return 'academic';

  // Check ADDRESS_FIELDS before BASIC_FIELDS to catch "CityVillage Name", "Mandal Name", "District Name"
  if (ADDRESS_FIELDS.some(matches)) return 'address';

  if (BASIC_FIELDS.some(matches)) return 'basic';

  if (CONTACT_FIELDS.some(matches)) return 'contact';

  if (ADDITIONAL_FIELDS.some(matches)) return 'additional';

  return 'other';
};

const PublicForm = () => {
  const { formId } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({});
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [fileData, setFileData] = useState({});

  // Certificate status state - tracks Yes/No for each certificate
  const [certificateStatus, setCertificateStatus] = useState({});
  const [certificateConfig, setCertificateConfig] = useState(null);
  const [fetchingForm, setFetchingForm] = useState(false);
  const [formCache, setFormCache] = useState(new Map());
  const [retryCount, setRetryCount] = useState(0);
  const [courseOptions, setCourseOptions] = useState([]);
  const [courseOptionsLoading, setCourseOptionsLoading] = useState(true);

  // Additional state for structured form
  const [colleges, setColleges] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(true);
  const [academicYears, setAcademicYears] = useState([]);
  const [academicYearsLoading, setAcademicYearsLoading] = useState(true);
  const [studentQuotas, setStudentQuotas] = useState([]);
  const [studentQuotasLoading, setStudentQuotasLoading] = useState(true);
  const [selectedCollegeId, setSelectedCollegeId] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);


  // Mobile browser detection - moved to component level
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  // Mobile detection for optimizations
  useEffect(() => {
    if (isMobile) {
      document.body.classList.add('mobile-optimized');
      // Prevent zoom on input focus for iOS
      if (isIOS) {
        const viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
      }
    }
  }, []);

  // Load all dropdown data in parallel for faster loading (using public endpoints)
  useEffect(() => {
    const loadAllData = async () => {
      try {
        // Fetch all data in parallel using Promise.allSettled - use public endpoints
        const [coursesRes, collegesRes, yearsRes, certRes, quotasRes] = await Promise.allSettled([
          api.get('/courses/options'),
          api.get('/colleges/public'),
          api.get('/academic-years/public'),
          api.get('/settings/certificates'),
          api.get('/quotas/public')
        ]);

        // Process results
        if (coursesRes.status === 'fulfilled') {
          setCourseOptions(coursesRes.value.data.data || []);
        }
        if (collegesRes.status === 'fulfilled') {
          setColleges(collegesRes.value.data.data || []);
        }
        if (yearsRes.status === 'fulfilled') {
          setAcademicYears(yearsRes.value.data.data || []);
        }
        if (quotasRes.status === 'fulfilled') {
          setStudentQuotas(quotasRes.value.data.data || []);
        }
        if (certRes.status === 'fulfilled' && certRes.value.value?.data?.success) {
          setCertificateConfig(certRes.value.value.data.data);
        } else if (certRes.status === 'fulfilled' && certRes.value.data?.success) {
          // Handle both promise settled structures
          setCertificateConfig(certRes.value.data.data);
        }
      } catch (error) {
        // Silent fail - dropdowns will show text inputs as fallback
      } finally {
        setCourseOptionsLoading(false);
        setCollegesLoading(false);
        setAcademicYearsLoading(false);
        setStudentQuotasLoading(false);
      }
    };

    loadAllData();
  }, []);

  // Separate useEffect for form fetching - runs only when formId changes
  useEffect(() => {
    let abortController;

    if (formId) {
      // Create new abort controller for this request
      abortController = new AbortController();
      fetchForm(abortController);
    }

    // Cleanup function to abort request if component unmounts or formId changes
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [formId]); // Only depends on formId

  // Cleanup effect to clear cache on unmount
  useEffect(() => {
    return () => {
      setFormCache(new Map());
    };
  }, []);

  const fetchForm = async (abortController = null) => {
    // Check cache first
    const cachedForm = formCache.get(formId);
    if (cachedForm) {
      setForm(cachedForm);

      // Initialize form data for enabled fields only
      const initialData = {};
      let enabledFields = (cachedForm.form_fields || []).filter(field => field.isEnabled !== false);

      // Add system fields if missing (order: Batch → College → Course → Branch → Year → Semester)
      // IMPORTANT: Use required: false by default - admin must set required status in Settings
      const requiredSystemFields = [
        { key: 'batch', label: 'Batch', type: 'select', required: false },
        { key: 'college', label: 'College', type: 'select', required: false },
        { key: 'course', label: 'Course', type: 'select', required: false },
        { key: 'branch', label: 'Branch', type: 'select', required: false },
        { key: 'current_year', label: 'Current Academic Year', type: 'select', required: false },
        { key: 'current_semester', label: 'Current Semester', type: 'select', required: false },
        { key: 'apaar_id', label: 'APAAR ID', type: 'text', required: false }
      ];

      requiredSystemFields.forEach(systemField => {
        const exists = enabledFields.some(f =>
          f.key?.toLowerCase() === systemField.key.toLowerCase() ||
          f.label?.toLowerCase() === systemField.label.toLowerCase()
        );
        if (!exists) {
          enabledFields.push({ ...systemField, isEnabled: true, isSystemField: true });
        }
      });

      // IMPORTANT: Use required status from form builder settings - do NOT override
      // Only set default to false if not specified
      enabledFields = enabledFields.map(field => {
        return { ...field, required: field.required === true ? true : false };
      });

      enabledFields.forEach((field) => {
        initialData[field.label] = field.type === 'checkbox' ? [] : '';
      });
      setFormData(initialData);
      setLoading(false);
      return;
    }

    // Check if we already have the form data (avoid unnecessary fetch)
    if (form && form.form_id === formId && !loading) {
      setLoading(false);
      return;
    }

    // Prevent multiple simultaneous requests
    if (fetchingForm) {
      return;
    }

    try {
      setFetchingForm(true);
      setError(null); // Clear any previous errors

      const response = await api.get(`/forms/public/${formId}`, {
        signal: abortController?.signal
      });

      // Reset retry count on successful fetch
      setRetryCount(0);

      // Cache the form data
      setFormCache(prev => new Map(prev).set(formId, response.data.data));
      setForm(response.data.data);

      // Initialize form data for enabled fields only
      const initialData = {};
      let enabledFields = (response.data.data.form_fields || []).filter(field => field.isEnabled !== false);

      // Add system fields if missing (order: Batch → College → Course → Branch → Year → Semester)
      // IMPORTANT: Use required: false by default - admin must set required status in Settings
      const requiredSystemFields = [
        { key: 'batch', label: 'Batch', type: 'select', required: false },
        { key: 'college', label: 'College', type: 'select', required: false },
        { key: 'course', label: 'Course', type: 'select', required: false },
        { key: 'branch', label: 'Branch', type: 'select', required: false },
        { key: 'current_year', label: 'Current Academic Year', type: 'select', required: false },
        { key: 'current_semester', label: 'Current Semester', type: 'select', required: false },
        { key: 'apaar_id', label: 'APAAR ID', type: 'text', required: false }
      ];

      requiredSystemFields.forEach(systemField => {
        const exists = enabledFields.some(f =>
          f.key?.toLowerCase() === systemField.key.toLowerCase() ||
          f.label?.toLowerCase() === systemField.label.toLowerCase()
        );
        if (!exists) {
          enabledFields.push({ ...systemField, isEnabled: true, isSystemField: true });
        }
      });

      // IMPORTANT: Use required status from form builder settings - do NOT override
      // Only set default to false if not specified
      enabledFields = enabledFields.map(field => {
        return { ...field, required: field.required === true ? true : false };
      });

      enabledFields.forEach((field) => {
        initialData[field.label] = field.type === 'checkbox' ? [] : '';
      });
      setFormData(initialData);

    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      // Retry logic for network errors
      if (retryCount < 2 && (error.code === 'NETWORK_ERROR' || error.response?.status >= 500)) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          if (!fetchingForm) {
            fetchForm(abortController);
          }
        }, 1000);
        return;
      }

      setError(error.response?.data?.message || 'Form not found or network error occurred');
    } finally {
      setFetchingForm(false);
      setLoading(false);
    }
  };

  const courseFieldLabels = useMemo(() => {
    if (!form?.form_fields) return ['Course']; // Default to system field
    const fields = form.form_fields.filter((field) => matchesFieldIdentifier(field, COURSE_FIELD_IDENTIFIERS));
    if (fields.length === 0) return ['Course']; // Fallback to system field
    return fields.map((field) => field.label);
  }, [form]);

  const branchFieldLabels = useMemo(() => {
    if (!form?.form_fields) return ['Branch']; // Default to system field
    const fields = form.form_fields.filter((field) => matchesFieldIdentifier(field, BRANCH_FIELD_IDENTIFIERS));
    if (fields.length === 0) return ['Branch']; // Fallback to system field
    return fields.map((field) => field.label);
  }, [form]);

  const availableCourses = useMemo(
    () => courseOptions.filter((course) => course?.isActive !== false),
    [courseOptions]
  );

  const yearFieldLabels = useMemo(() => {
    if (!form?.form_fields) return ['Current Academic Year']; // Default to system field
    const fields = form.form_fields.filter((field) => matchesFieldIdentifier(field, YEAR_FIELD_IDENTIFIERS));
    if (fields.length === 0) return ['Current Academic Year']; // Fallback to system field
    return fields.map((field) => field.label);
  }, [form]);

  const semesterFieldLabels = useMemo(() => {
    if (!form?.form_fields) return ['Current Semester']; // Default to system field
    const fields = form.form_fields.filter((field) => matchesFieldIdentifier(field, SEMESTER_FIELD_IDENTIFIERS));
    if (fields.length === 0) return ['Current Semester']; // Fallback to system field
    return fields.map((field) => field.label);
  }, [form]);

  const selectedCourseName = useMemo(() => {
    for (const label of courseFieldLabels) {
      const value = formData[label];
      if (value) {
        return value;
      }
    }
    return '';
  }, [courseFieldLabels, formData]);

  const selectedCourseOption = useMemo(() => {
    if (!selectedCourseName) return null;
    return (
      availableCourses.find(
        (course) => course.name?.toLowerCase() === selectedCourseName.toLowerCase()
      ) || null
    );
  }, [availableCourses, selectedCourseName]);

  // Determine course type (Diploma, UG, or PG) based on course name
  const courseType = useMemo(() => {
    if (!selectedCourseOption) return null;
    return getCourseType(selectedCourseOption);
  }, [selectedCourseOption]);

  // Get certificates based on course type
  const getCertificatesForCourse = () => {
    if (!certificateConfig) return [];
    const type = courseType?.toLowerCase();
    const config = certificateConfig[type] || [];
    return config.map(c => ({
      key: c.id,
      label: c.name,
      required: c.required,
      options: c.options
    }));
  };

  // Update certificates_status based on certificate status
  useEffect(() => {
    if (!courseType) return;
    const certificates = getCertificatesForCourse();
    if (certificates.length === 0) return;

    const allYes = certificates.every(cert => {
      const val = certificateStatus[cert.key];
      if (val === true || val === 'Yes' || val === 'yes') return true;
      if (typeof val === 'string' && val.trim() !== '' && val.toLowerCase() !== 'no') return true;
      return false;
    });
    if (allYes && certificates.length > 0) {
      setFormData(prev => ({ ...prev, certificates_status: 'Verified' }));
    } else {
      setFormData(prev => ({ ...prev, certificates_status: 'Unverified' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificateStatus, courseType]);


  const selectedBranchName = useMemo(() => {
    for (const label of branchFieldLabels) {
      const value = formData[label];
      if (value) {
        return value;
      }
    }
    return '';
  }, [branchFieldLabels, formData]);

  const selectedBranchOption = useMemo(() => {
    if (!selectedCourseOption || !selectedBranchName) return null;
    return (
      (selectedCourseOption.branches || []).find(
        (branch) => branch.name?.toLowerCase() === selectedBranchName.toLowerCase()
      ) || null
    );
  }, [selectedCourseOption, selectedBranchName]);

  const activeStructure = useMemo(() => {
    if (selectedBranchOption?.structure) {
      return selectedBranchOption.structure;
    }
    if (selectedCourseOption?.structure) {
      return selectedCourseOption.structure;
    }
    return null;
  }, [selectedBranchOption, selectedCourseOption]);

  // Helper function to extract start year from batch string
  // Handles formats like "2026-2027", "2026", "2026-27", etc.
  const extractStartYearFromBatch = (batchString) => {
    if (!batchString || typeof batchString !== 'string') {
      return null;
    }

    // Try to extract year from formats like "2026-2027", "2026-27", "2026"
    const yearMatch = batchString.match(/^(\d{4})/);
    if (yearMatch) {
      return parseInt(yearMatch[1], 10);
    }

    // Try 2-digit year format (e.g., "26-27" -> 2026)
    const shortYearMatch = batchString.match(/^(\d{2})/);
    if (shortYearMatch) {
      const shortYear = parseInt(shortYearMatch[1], 10);
      // Assume years 00-50 are 2000-2050, 51-99 are 1951-1999
      return shortYear <= 50 ? 2000 + shortYear : 1900 + shortYear;
    }

    return null;
  };

  // Get selected batch value from formData
  const selectedBatch = useMemo(() => {
    // Find batch field label - could be "Batch" or "Academic Year" or variations
    const batchFieldLabels = (form?.form_fields || [])
      .filter(field => {
        const key = (field.key || '').toLowerCase();
        const label = (field.label || '').toLowerCase();
        return key.includes('batch') || label.includes('batch') ||
          (label.includes('academic year') && !label.includes('current'));
      })
      .map(field => field.label);

    // Also check for system field "Batch"
    if (batchFieldLabels.length === 0) {
      batchFieldLabels.push('Batch');
    }

    for (const label of batchFieldLabels) {
      const value = formData[label];
      if (value) {
        return value;
      }
    }
    return '';
  }, [form, formData]);

  const yearOptions = useMemo(() => {
    if (!activeStructure?.totalYears) {
      // If no batch selected, return default year numbers
      if (!selectedBatch) {
        return ['1', '2', '3', '4'];
      }

      // Try to generate from batch
      const batchYear = extractStartYearFromBatch(selectedBatch);
      if (batchYear) {
        return Array.from(
          { length: 4 },
          (_value, index) => {
            const startYear = batchYear + index;
            const endYear = startYear + 1;
            return `${startYear}-${endYear}`;
          }
        );
      }
      return ['1', '2', '3', '4'];
    }

    // If batch is selected, generate academic year ranges
    if (selectedBatch) {
      const batchYear = extractStartYearFromBatch(selectedBatch);
      if (batchYear) {
        return Array.from(
          { length: activeStructure.totalYears },
          (_value, index) => {
            const startYear = batchYear + index;
            const endYear = startYear + 1;
            return `${startYear}-${endYear}`;
          }
        );
      }
    }

    // Fallback to year numbers if batch parsing fails
    return Array.from(
      { length: activeStructure.totalYears },
      (_value, index) => String(index + 1)
    );
  }, [activeStructure, selectedBatch]);

  const selectedYear = useMemo(() => {
    for (const label of yearFieldLabels) {
      const value = formData[label];
      if (value) {
        // If it's an academic year range like "2026-2027", extract the year number
        if (value.includes('-')) {
          const yearIndex = yearOptions.indexOf(value);
          return yearIndex >= 0 ? yearIndex + 1 : 0;
        }
        // Otherwise, it's a numeric year value
        return Number(value) || 0;
      }
    }
    return 0;
  }, [yearFieldLabels, formData, yearOptions]);

  const semesterOptions = useMemo(() => {
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
  }, [activeStructure, selectedYear, yearFieldLabels]);

  useEffect(() => {
    if (!activeStructure) return;

    const totalYears = Number(activeStructure.totalYears) || 0;
    const semestersPerYear = Number(activeStructure.semestersPerYear) || 0;

    setFormData((prev) => {
      let changed = false;
      const updated = { ...prev };

      yearFieldLabels.forEach((label) => {
        const value = prev[label];
        if (!value) {
          return;
        }
        // Handle both numeric year values (1, 2, 3) and academic year ranges (2026-2027)
        if (typeof value === 'string' && value.includes('-')) {
          // It's an academic year range like "2026-2027"
          // Validate that it's in the yearOptions
          const isValidRange = yearOptions.includes(value);
          if (!isValidRange) {
            updated[label] = '';
            changed = true;
          }
        } else {
          // It's a numeric year value
          const numericValue = Number(value);
          if (
            Number.isNaN(numericValue) ||
            numericValue < 1 ||
            (totalYears > 0 && numericValue > totalYears)
          ) {
            updated[label] = '';
            changed = true;
          }
        }
      });

      semesterFieldLabels.forEach((label) => {
        const value = prev[label];
        if (!value) {
          return;
        }
        const numericValue = Number(value);
        if (
          Number.isNaN(numericValue) ||
          numericValue < 1 ||
          (semestersPerYear > 0 && numericValue > semestersPerYear)
        ) {
          updated[label] = '';
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [activeStructure, yearFieldLabels, semesterFieldLabels, yearOptions]);

  const handleInputChange = (label, value, type) => {
    if (type === 'checkbox') {
      setFormData((prev) => {
        const currentValues = prev[label] || [];
        if (currentValues.includes(value)) {
          return {
            ...prev,
            [label]: currentValues.filter((v) => v !== value),
          };
        }
        return {
          ...prev,
          [label]: [...currentValues, value],
        };
      });
    } else {
      setFormData((prev) => {
        const updated = { ...prev, [label]: value };

        // Check if this is a batch field
        const isBatchField = (form?.form_fields || []).some(field => {
          const fieldKey = (field.key || '').toLowerCase();
          const fieldLabel = (field.label || '').toLowerCase();
          return (field.label === label) && (
            fieldKey.includes('batch') ||
            fieldLabel.includes('batch') ||
            (fieldLabel.includes('academic year') && !fieldLabel.includes('current'))
          );
        }) || label === 'Batch';

        if (isBatchField) {
          // When batch changes, clear year and semester fields
          yearFieldLabels.forEach((yearLabel) => {
            updated[yearLabel] = '';
          });
          semesterFieldLabels.forEach((semesterLabel) => {
            updated[semesterLabel] = '';
          });
        }

        if (courseFieldLabels.includes(label)) {
          branchFieldLabels.forEach((branchLabel) => {
            updated[branchLabel] = '';
          });
          yearFieldLabels.forEach((yearLabel) => {
            updated[yearLabel] = '';
          });
          semesterFieldLabels.forEach((semesterLabel) => {
            updated[semesterLabel] = '';
          });
        }

        if (branchFieldLabels.includes(label)) {
          yearFieldLabels.forEach((yearLabel) => {
            updated[yearLabel] = '';
          });
          semesterFieldLabels.forEach((semesterLabel) => {
            updated[semesterLabel] = '';
          });
        }

        return updated;
      });
    }
  };

  const handleFileChange = (label, file) => {
    setFileData({
      ...fileData,
      [label]: file,
    });
  };


  const validateForm = () => {
    // Only validate enabled fields
    const enabledFields = (form.form_fields || []).filter(field => field.isEnabled !== false);
    for (const field of enabledFields) {
      if (field.required) {
        if (field.key.toLowerCase().includes('photo')) {
          // For photo fields, check if file is selected
          if (!fileData[field.label]) {
            return `${field.label} is required`;
          }
        } else {
          const value = formData[field.label];
          if (!value || (Array.isArray(value) && value.length === 0) || (typeof value === 'string' && value.trim() === '')) {
            return `${field.label} is required`;
          }
        }
      }
    }


    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create FormData for multipart submission
      const submissionData = new FormData();

      // Map form fields to database columns (exclude admission_no for students)
      // Include both enabled fields and system fields
      let enabledFields = (form.form_fields || []).filter(field => field.isEnabled !== false);

      // Add system fields if they don't exist
      const requiredSystemFields = [
        { key: 'college', label: 'College', type: 'select' },
        { key: 'course', label: 'Course', type: 'select' },
        { key: 'branch', label: 'Branch', type: 'select' },
        { key: 'current_year', label: 'Current Academic Year', type: 'select' },
        { key: 'current_semester', label: 'Current Semester', type: 'select' },
        { key: 'apaar_id', label: 'APAAR ID', type: 'text' }
      ];

      requiredSystemFields.forEach(systemField => {
        const exists = enabledFields.some(f =>
          f.key?.toLowerCase() === systemField.key.toLowerCase() ||
          f.label?.toLowerCase() === systemField.label.toLowerCase()
        );
        if (!exists) {
          enabledFields.push({ ...systemField, isEnabled: true, isSystemField: true });
        }
      });

      enabledFields.forEach((field) => {
        if (field.type === 'file' || field.key.toLowerCase().includes('photo')) {
          // Handle file uploads
          const file = fileData[field.label];
          if (file) {
            submissionData.append(field.key, file);
          }
        } else if (formData[field.label] !== undefined && formData[field.label] !== '' && field.key !== 'admission_no') {
          // Use the field key (database column name) as the key in submission data
          submissionData.append(field.key, formData[field.label]);
        }
      });


      // Don't send admission number - admin will assign it during approval
      await api.post(`/submissions/${formId}`, submissionData);
      setSubmitted(true);
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field) => {
    const commonClasses = 'w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]';
    const fieldKey = field.key?.toLowerCase() || '';
    const fieldLabel = field.label?.toLowerCase() || '';

    // Previous College - must be an input field, not dropdown
    if (fieldKey.includes('previous_college') || fieldKey.includes('previouscollege') ||
      fieldLabel.includes('previous college') || fieldLabel.includes('previouscollege')) {
      return (
        <input
          type="text"
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          placeholder={field.placeholder || 'Enter previous college name'}
          required={field.required}
        />
      );
    }

    // College dropdown (not Previous College)
    if ((fieldKey.includes('college') || fieldLabel.includes('college')) &&
      !fieldKey.includes('previous') && !fieldLabel.includes('previous')) {
      if (collegesLoading) {
        return (
          <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2 text-sm">
            <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
            Loading colleges...
          </div>
        );
      }
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => {
            handleInputChange(field.label, e.target.value, field.type);
            // Find college ID for course filtering
            const college = colleges.find(c => c.name === e.target.value);
            setSelectedCollegeId(college?.id || null);
          }}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select College</option>
          {colleges.filter(c => c.isActive !== false).map((college) => (
            <option key={college.id} value={college.name}>
              {college.name}
            </option>
          ))}
        </select>
      );
    }

    // Batch/Academic Year dropdown
    if (fieldKey.includes('batch') || fieldLabel.includes('batch') || fieldLabel.includes('academic year')) {
      if (academicYearsLoading) {
        return (
          <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2 text-sm">
            <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
            Loading batches...
          </div>
        );
      }
      if (academicYears.length > 0) {
        return (
          <select
            value={formData[field.label] || ''}
            onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
            className={commonClasses}
            required={field.required}
          >
            <option value="">Select Batch</option>
            {academicYears.map((year) => (
              <option key={year.id} value={year.yearLabel}>
                {year.yearLabel}
              </option>
            ))}
          </select>
        );
      }
    }

    // Course dropdown
    if (matchesFieldIdentifier(field, COURSE_FIELD_IDENTIFIERS) && availableCourses.length > 0) {
      if (courseOptionsLoading) {
        return (
          <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2 text-sm">
            <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
            Loading courses...
          </div>
        );
      }
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Program</option>
          {availableCourses.map((course) => (
            <option key={course.name} value={course.name}>
              {course.name} {course.level ? `(${course.level.toUpperCase()})` : ''}
            </option>
          ))}
        </select>
      );
    }

    // Branch dropdown
    if (matchesFieldIdentifier(field, BRANCH_FIELD_IDENTIFIERS)) {
      let availableBranches = selectedCourseOption
        ? (selectedCourseOption.branches || []).filter((branch) => branch.isActive)
        : [];

      // Deduplicate branches by name to avoid showing duplicates
      const branchMap = new Map();
      availableBranches.forEach(branch => {
        if (!branchMap.has(branch.name)) {
          branchMap.set(branch.name, branch);
        }
      });
      availableBranches = Array.from(branchMap.values());

      if (availableBranches.length === 0) {
        return (
          <input
            type="text"
            value={formData[field.label] || ''}
            onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
            className={commonClasses}
            placeholder={selectedCourseOption ? "No branches configured" : "Select a course first"}
            required={field.required}
          />
        );
      }

      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Branch</option>
          {availableBranches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
            </option>
          ))}
        </select>
      );
    }

    // Current Academic Year - must check AFTER DOB and Admission Year to avoid conflicts
    // Only match if it's explicitly "Current Academic Year" or "current_year" key
    if (matchesFieldIdentifier(field, YEAR_FIELD_IDENTIFIERS) &&
      !fieldLabel.includes('dob') &&
      !fieldLabel.includes('date of birth') &&
      !fieldLabel.includes('admission') &&
      (fieldKey === 'current_year' || fieldLabel.includes('current academic year') || fieldLabel.includes('current year'))) {
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Academic Year</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year.includes('-') ? year : `Year ${year}`}
            </option>
          ))}
        </select>
      );
    }

    if (matchesFieldIdentifier(field, SEMESTER_FIELD_IDENTIFIERS)) {
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Semester</option>
          {semesterOptions.map((semester) => (
            <option key={semester} value={semester}>
              Semester {semester}
            </option>
          ))}
        </select>
      );
    }

    // Date of Birth - special date field handling (must check BEFORE year field identifiers)
    if (fieldKey.includes('dob') || fieldLabel.includes('date of birth') || fieldLabel.includes('birth date') ||
      (fieldLabel.includes('dob') && field.type === 'date') ||
      (fieldLabel.includes('dob') && fieldLabel.includes('date-month-year'))) {
      return (
        <input
          type="date"
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
          max={new Date().toISOString().split('T')[0]} // Prevent future dates
        />
      );
    }

    // Admission Year/Date - must be a date field, not academic year dropdown
    // Check BEFORE year field identifiers to prevent incorrect categorization
    if (fieldKey.includes('admission_date') || fieldKey.includes('admission_date') ||
      (fieldLabel.includes('admission') && (fieldLabel.includes('date') || fieldLabel.includes('year')) &&
        !fieldLabel.includes('academic year') && !fieldLabel.includes('current'))) {
      // If it's explicitly a date type, render as date
      if (field.type === 'date') {
        return (
          <input
            type="date"
            value={formData[field.label] || ''}
            onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
            className={commonClasses}
            required={field.required}
            max={new Date().toISOString().split('T')[0]} // Prevent future dates
          />
        );
      }
      // Otherwise, render as text input (for formats like "09-Sep-2003")
      return (
        <input
          type="text"
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          placeholder={field.placeholder || 'e.g., 09-Sep-2003'}
          required={field.required}
        />
      );
    }

    // Gender dropdown - also handle M/F field
    if (fieldKey.includes('gender') || fieldLabel.includes('gender') || fieldLabel.includes('m/f') || fieldLabel === 'm/f') {
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Gender</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
          <option value="Other">Other</option>
        </select>
      );
    }

    // Quota / Student Type dropdown
    if (
      fieldKey.includes('stud_type') ||
      fieldKey.includes('studtype') ||
      fieldLabel.includes('student type') ||
      fieldLabel.includes('quota')
    ) {
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
          disabled={studentQuotasLoading}
        >
          <option value="">Select Quota</option>
          {studentQuotas.map((quota) => (
            <option key={quota.id} value={quota.code}>
              {quota.name}
            </option>
          ))}
        </select>
      );
    }

    // Student Status dropdown
    if (fieldKey.includes('student_status') || fieldLabel.includes('student status')) {
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Status</option>
          <option value="Regular">Regular</option>
          <option value="Discontinued from the second year">Discontinued from the second year</option>
          <option value="Discontinued from the third year">Discontinued from the third year</option>
          <option value="Discontinued from the fourth year">Discontinued from the fourth year</option>
          <option value="Admission Cancelled">Admission Cancelled</option>
          <option value="Long Absent">Long Absent</option>
          <option value="Detained">Detained</option>
        </select>
      );
    }

    // Scholar Status dropdown
    if (fieldKey.includes('scholar_status') || fieldLabel.includes('scholar status')) {
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Scholar Status</option>
          <option value="Eligible">Eligible</option>
          <option value="Not Eligible">Not Eligible</option>
        </select>
      );
    }

    // Caste dropdown
    if (fieldKey.includes('caste') || fieldLabel.includes('caste')) {
      return (
        <select
          value={formData[field.label] || ''}
          onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
          className={commonClasses}
          required={field.required}
        >
          <option value="">Select Caste</option>
          <option value="OC">OC</option>
          <option value="BC-A">BC-A</option>
          <option value="BC-B">BC-B</option>
          <option value="BC-C">BC-C</option>
          <option value="BC-D">BC-D</option>
          <option value="BC-E">BC-E</option>
          <option value="SC">SC</option>
          <option value="ST">ST</option>
          <option value="EWS">EWS</option>
          <option value="Other">Other</option>
        </select>
      );
    }

    // Certificates Status is auto-calculated - hide this field completely
    // Certificate Information section is shown separately below
    if (fieldKey.includes('certificate') && (fieldKey.includes('status') || fieldLabel.includes('status'))) {
      return null; // Don't render this field - it's auto-calculated
    }

    // APAAR ID field - special handling with 12-digit limit
    if (fieldKey.includes('apaar') || fieldLabel.includes('apaar')) {
      return (
        <input
          type="text"
          value={formData[field.label] || ''}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, ''); // Only digits
            if (value.length <= 12) { // APAAR ID is 12 digits
              handleInputChange(field.label, value, field.type);
            }
          }}
          className={commonClasses}
          placeholder={field.placeholder || 'Enter 12-digit APAAR ID'}
          required={field.required}
          maxLength={12}
          pattern="[0-9]{12}"
        />
      );
    }

    // Photo upload with preview
    if (fieldKey.includes('photo') || fieldLabel.includes('photo')) {
      return (
        <div className="space-y-2">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-purple-400 transition-colors bg-gray-50">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error('File size should be less than 5MB');
                    return;
                  }
                  handleFileChange(field.label, file);
                  // Create preview
                  const reader = new FileReader();
                  reader.onloadend = () => setPhotoPreview(reader.result);
                  reader.readAsDataURL(file);
                }
              }}
              className="hidden"
              id="photo-upload-public"
            />
            <label htmlFor="photo-upload-public" className="cursor-pointer flex flex-col items-center gap-2">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-20 h-20 object-cover rounded-lg border-2 border-purple-300" />
              ) : (
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Upload className="w-6 h-6 text-purple-600" />
                </div>
              )}
              <p className="text-sm font-medium text-gray-700">
                {photoPreview ? 'Change Photo' : 'Upload Photo'}
              </p>
              <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
            </label>
          </div>
        </div>
      );
    }

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={formData[field.label] || ''}
            onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
            className={commonClasses}
            placeholder={field.placeholder}
            rows="4"
            required={field.required}
          />
        );

      case 'select':
        return (
          <select
            value={formData[field.label] || ''}
            onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
            className={commonClasses}
            required={field.required}
          >
            <option value="">Select an option</option>
            {field.options?.map((option, index) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option, index) => (
              <label key={index} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={field.label}
                  value={option}
                  checked={formData[field.label] === option}
                  onChange={(e) => handleInputChange(field.label, e.target.value, field.type)}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                  required={field.required}
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {field.options?.map((option, index) => (
              <label key={index} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={option}
                  checked={(formData[field.label] || []).includes(option)}
                  onChange={(e) => handleInputChange(field.label, option, field.type)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'file':
        return (
          <div className="space-y-2">
            <input
              type="file"
              name={field.key}
              accept={field.accept || 'image/*'}
              capture={field.accept && field.accept.includes('image') ? 'camera' : undefined}
              onChange={(e) => handleFileChange(field.label, e.target.files[0])}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none file:mr-4 file:py-2 file:px-4 file:rounded-l-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              required={field.required}
            />
            {fileData[field.label] && (
              <p className="text-sm text-green-600">
                Selected: {fileData[field.label].name}
              </p>
            )}
          </div>
        );

      default:
        // Special handling for photo fields that might be misconfigured as text
        if (field.key.toLowerCase().includes('photo')) {
          return (
            <div className="space-y-2">
              <input
                type="file"
                name={field.key}
                accept="image/*"
                capture="camera"
                onChange={(e) => handleFileChange(field.label, e.target.files[0])}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none file:mr-4 file:py-2 file:px-4 file:rounded-l-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                required={field.required}
              />
              {fileData[field.label] && (
                <p className="text-sm text-green-600">
                  Selected: {fileData[field.label].name}
                </p>
              )}
            </div>
          );
        }
        return (
          <input
            type={field.type}
            value={formData[field.label] || ''}
            onChange={(e) => {
              const value = e.target.value;
              // For tel/phone fields, limit to 10 digits
              if (field.type === 'tel') {
                const digitsOnly = value.replace(/\D/g, '');
                if (digitsOnly.length <= 10) {
                  handleInputChange(field.label, digitsOnly, field.type);
                }
              } else {
                handleInputChange(field.label, value, field.type);
              }
            }}
            onKeyPress={(e) => {
              // For tel/phone number fields, only allow numbers
              if (field.type === 'tel' && !/\d/.test(e.key)) {
                e.preventDefault();
              }
            }}
            pattern={field.type === 'tel' ? '[0-9]{10}' : undefined}
            maxLength={field.type === 'tel' ? 10 : undefined}
            className={commonClasses}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
    }
  };

  if (loading || fetchingForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <LoadingAnimation
            width={32}
            height={32}
            message="Loading form..."
            variant="minimal"
          />
        </div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-red-600" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Form Not Found</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="text-sm text-gray-600">
            <p className="mb-2">Please try:</p>
            <ul className="text-left space-y-1">
              <li>• Check your internet connection</li>
              <li>• Refresh the page</li>
              <li>• Contact the administrator</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-green-600" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Submission Successful!</h2>
          <p className="text-gray-600 mb-6">
            Your form has been submitted successfully. It is now pending admin approval.
          </p>
          <p className="text-sm text-gray-500">
            You will be notified once your submission is reviewed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 py-3 sm:py-4 lg:py-6 px-3 sm:px-4 lg:px-6">
      <Toaster position="top-center sm:top-right" />
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg sm:rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="p-2 sm:p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg flex-shrink-0">
                <img
                  src="/logo.png"
                  alt="Pydah DB Logo"
                  className="h-10 sm:h-12 w-auto object-contain drop-shadow-md transition-transform duration-300 hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold break-words">{form.form_name}</h1>
                {form.form_description && (
                  <p className="text-purple-100 text-xs sm:text-sm mt-1">{form.form_description}</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 lg:p-8">
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              {/* Categorize fields */}
              {(() => {
                // Get all enabled fields from form builder - treat undefined/null as enabled (default behavior)
                // Only exclude fields explicitly set to false
                // IMPORTANT: This ensures ALL fields configured in Settings -> Registration Form are displayed
                let enabledFields = (form.form_fields || []).filter(field => {
                  // If isEnabled is undefined, null, or true, show the field
                  // Only hide if explicitly set to false
                  return field.isEnabled !== false;
                }).map(field => {
                  // Ensure field has all required properties for rendering
                  // IMPORTANT: Use required status from form builder - do NOT set default to true
                  return {
                    ...field,
                    key: field.key || field.label?.toLowerCase().replace(/\s+/g, '_') || `field_${Date.now()}`,
                    label: field.label || 'Unnamed Field',
                    type: field.type || 'text',
                    required: field.required === true ? true : false, // Only true if explicitly set to true
                    isEnabled: field.isEnabled !== undefined ? field.isEnabled : true
                  };
                });

                // CRITICAL: Ensure Batch, College, Course, Branch, Year, and Semester fields are always present
                // These are required for form functionality
                // Order: Batch → College → Course → Branch → Year → Semester
                // IMPORTANT: Use required: false by default - admin must set required status in Settings
                const requiredSystemFields = [
                  {
                    key: 'batch',
                    label: 'Batch',
                    type: 'select',
                    required: false,
                    isEnabled: true,
                    isSystemField: true
                  },
                  {
                    key: 'college',
                    label: 'College',
                    type: 'select',
                    required: false,
                    isEnabled: true,
                    isSystemField: true
                  },
                  {
                    key: 'course',
                    label: 'Course',
                    type: 'select',
                    required: false,
                    isEnabled: true,
                    isSystemField: true
                  },
                  {
                    key: 'branch',
                    label: 'Branch',
                    type: 'select',
                    required: false,
                    isEnabled: true,
                    isSystemField: true
                  },
                  {
                    key: 'current_year',
                    label: 'Current Academic Year',
                    type: 'select',
                    required: false,
                    isEnabled: true,
                    isSystemField: true
                  },
                  {
                    key: 'current_semester',
                    label: 'Current Semester',
                    type: 'select',
                    required: false,
                    isEnabled: true,
                    isSystemField: true
                  },
                  {
                    key: 'apaar_id',
                    label: 'APAAR ID',
                    type: 'text',
                    required: false,
                    isEnabled: true,
                    isSystemField: true
                  }
                ];

                // Add system fields if they don't exist in the form
                // IMPORTANT: System fields are only added if missing - they don't override form builder fields
                requiredSystemFields.forEach(systemField => {
                  const exists = enabledFields.some(f => {
                    const fieldKey = (f.key || '').toLowerCase();
                    const fieldLabel = (f.label || '').toLowerCase();
                    const systemKey = systemField.key.toLowerCase();
                    const systemLabel = systemField.label.toLowerCase();

                    return fieldKey === systemKey ||
                      fieldLabel === systemLabel ||
                      fieldKey.includes(systemKey) ||
                      fieldLabel.includes(systemLabel);
                  });
                  if (!exists) {
                    enabledFields.push(systemField);
                  }
                });

                // IMPORTANT: Use required status from form builder settings - do NOT override
                // Only set default to false if not specified
                enabledFields = enabledFields.map(field => {
                  return { ...field, required: field.required === true ? true : false };
                });

                // Categorize all fields - ensure every field gets a category
                // First, separate Personal Information fields (Date of Birth, Aadhar Number) from Basic Information
                const personalFields = enabledFields.filter(f => {
                  const key = f.key?.toLowerCase() || '';
                  const label = f.label?.toLowerCase() || '';
                  return key.includes('dob') || key.includes('date of birth') ||
                    label.includes('dob') || label.includes('date of birth') ||
                    key.includes('adhar') || key.includes('aadhar') ||
                    label.includes('adhar') || label.includes('aadhar');
                });

                // Basic fields exclude Personal Information fields
                const basicFields = enabledFields.filter(f => {
                  const cat = categorizeField(f);
                  if (cat !== 'basic') return false;
                  const key = f.key?.toLowerCase() || '';
                  const label = f.label?.toLowerCase() || '';
                  // Exclude DOB and Aadhar from basic
                  if (key.includes('dob') || key.includes('date of birth') ||
                    label.includes('dob') || label.includes('date of birth') ||
                    key.includes('adhar') || key.includes('aadhar') ||
                    label.includes('adhar') || label.includes('aadhar')) {
                    return false;
                  }
                  return true;
                });

                // Move Caste from Additional to Basic Information
                const casteFields = enabledFields.filter(f => {
                  const key = f.key?.toLowerCase() || '';
                  const label = f.label?.toLowerCase() || '';
                  return key.includes('caste') || label.includes('caste');
                });

                // Add Caste to Basic Information if it exists
                casteFields.forEach(casteField => {
                  if (!basicFields.some(f => f.key === casteField.key || f.label === casteField.label)) {
                    basicFields.push(casteField);
                  }
                });

                let academicFields = enabledFields.filter(f => categorizeField(f) === 'academic');
                const contactFields = enabledFields.filter(f => categorizeField(f) === 'contact');
                const addressFields = enabledFields.filter(f => categorizeField(f) === 'address');
                // Additional fields exclude Caste (moved to Basic) and Certificates Status (auto-calculated)
                const additionalFields = enabledFields.filter(f => {
                  const cat = categorizeField(f);
                  if (cat !== 'additional') return false;
                  const key = f.key?.toLowerCase() || '';
                  const label = f.label?.toLowerCase() || '';
                  // Exclude Caste from additional (moved to Basic)
                  if (key.includes('caste') || label.includes('caste')) {
                    return false;
                  }
                  // Exclude Certificates Status (auto-calculated, not user input)
                  if (key.includes('certificate') && (key.includes('status') || label.includes('status'))) {
                    return false;
                  }
                  return true;
                });
                // Other fields exclude Certificates Status (auto-calculated)
                const otherFields = enabledFields.filter(f => {
                  const cat = categorizeField(f);
                  if (cat !== 'other') return false;
                  const key = f.key?.toLowerCase() || '';
                  const label = f.label?.toLowerCase() || '';
                  // Exclude Certificates Status (auto-calculated, not user input)
                  if (key.includes('certificate') && (key.includes('status') || label.includes('status'))) {
                    return false;
                  }
                  return true;
                });

                // Sort academic fields in the correct order to match AddStudent page: College → Batch → Course → Branch → Current Academic Year → Current Semester → Student Type → Student Status → Scholar Status → Previous College
                const academicFieldOrder = [
                  { key: 'college', label: 'college' },
                  { key: 'batch', label: 'batch' },
                  { key: 'course', label: 'course' },
                  { key: 'branch', label: 'branch' },
                  { key: 'current_year', label: 'current academic year' },
                  { key: 'current_semester', label: 'current semester' },
                  { key: 'stud_type', label: 'student type' },
                  { key: 'student_status', label: 'student status' },
                  { key: 'scholar_status', label: 'scholar status' },
                  { key: 'previous_college', label: 'previous college' }
                ];

                academicFields.sort((a, b) => {
                  const getFieldOrder = (field) => {
                    const key = field.key?.toLowerCase() || '';
                    const label = field.label?.toLowerCase() || '';

                    for (let i = 0; i < academicFieldOrder.length; i++) {
                      const orderItem = academicFieldOrder[i];
                      if (key.includes(orderItem.key) || label.includes(orderItem.label) ||
                        key === orderItem.key || label === orderItem.label) {
                        return i;
                      }
                    }
                    // Other academic fields go after the ordered ones
                    return academicFieldOrder.length;
                  };

                  return getFieldOrder(a) - getFieldOrder(b);
                });

                // Safety check: Ensure we're showing all enabled fields
                const totalCategorized = basicFields.length + academicFields.length + contactFields.length +
                  addressFields.length + additionalFields.length + otherFields.length;

                return (
                  <>
                    {/* Basic Information */}
                    {basicFields.length > 0 && (
                      <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          Basic Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          {basicFields.map((field, index) => (
                            <div key={index}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Academic Information */}
                    {academicFields.length > 0 && (
                      <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          Academic Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {academicFields.map((field, index) => (
                            <div key={index}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contact Information */}
                    {contactFields.length > 0 && (
                      <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                          Contact Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {contactFields.map((field, index) => (
                            <div key={index}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Address Information */}
                    {addressFields.length > 0 && (
                      <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                          Address Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {addressFields.map((field, index) => (
                            <div key={index}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Personal Information */}
                    {personalFields.length > 0 && (
                      <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                          Personal Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {personalFields.map((field, index) => (
                            <div key={index}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Additional Information */}
                    {additionalFields.length > 0 && (
                      <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          Additional Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          {additionalFields.map((field, index) => (
                            <div key={index} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.label}
                                {field.required ? (
                                  <span className="text-red-500 ml-1">*</span>
                                ) : (
                                  <span className="text-gray-400 ml-1">(Optional)</span>
                                )}
                              </label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other/Uncategorized Fields - Always show these */}
                    {otherFields.length > 0 && (
                      <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                          Other Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          {otherFields.map((field, index) => (
                            <div key={index} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </>
                );
              })()}

              {/* Certificate Information Section - Dynamic with Yes/No toggles */}
              {courseType && (
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                    Certificate Information
                  </h3>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <FileText size={16} className="text-gray-600" />
                      Default Certification Fields
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {getCertificatesForCourse().map((cert) => (
                        <div key={cert.key} className="space-y-1">
                          <label className="block text-sm font-medium text-gray-700">
                            {cert.label}
                            {cert.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <select
                            value={certificateStatus[cert.key] || ''}
                            onChange={(e) => {
                              setCertificateStatus(prev => ({
                                ...prev,
                                [cert.key]: e.target.value
                              }));
                            }}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-sm transition-all shadow-sm"
                            required={cert.required}
                          >
                            <option value="">Select status</option>
                            {(cert.options || []).length > 0 ? (
                              cert.options.map((opt, idx) => (
                                <option key={idx} value={opt}>{opt}</option>
                              ))
                            ) : (
                              <>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </>
                            )}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 sm:gap-4 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3.5 sm:py-3 px-6 rounded-lg sm:rounded-xl font-semibold shadow-md hover:from-purple-700 hover:to-indigo-700 active:from-purple-800 active:to-indigo-800 hover:shadow-lg focus:ring-4 focus:ring-purple-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-base sm:text-sm"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      <span>Submit for Approval</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        <p className="text-center text-gray-600 text-sm mt-6">
          © 2025 Pydah Student Database Management System
        </p>
      </div>
    </div>
  );
};

export default PublicForm;
