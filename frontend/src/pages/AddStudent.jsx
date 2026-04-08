import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileText } from 'lucide-react';
import api from '../config/api';
import toast from 'react-hot-toast';
import LoadingAnimation from '../components/LoadingAnimation';
import SearchableSelect from '../components/SearchableSelect';
import ManagePreviousCollegesModal from '../components/ManagePreviousCollegesModal';
import { addressData } from '../data/addressData';
import { getCourseType, getCertificatesForCourse as getCertificatesForCourseShared } from '../config/certificateConfig';

// Dropdown options for student fields
const STUDENT_TYPE_OPTIONS = ['CONV', 'LATER', 'LSPOT', 'MANG', 'SPOT'];
const STUDENT_STATUS_OPTIONS = [
  'Regular',
  'Discontinued from the second year',
  'Discontinued from the third year',
  'Discontinued from the fourth year',
  'Admission Cancelled',
  'Long Absent',
  'Detained',
  'Course Completed'
];
const SCHOLAR_STATUS_OPTIONS = ['Eligible', 'Not Eligible'];
const FEE_STATUS_OPTIONS = ['no due', 'due', 'permitted'];
const REGISTRATION_STATUS_OPTIONS = ['Pending', 'Completed'];
const CASTE_OPTIONS = ['OC', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'EWS', 'Other'];
const CERTIFICATES_STATUS_OPTIONS = ['Verified', 'Unverified', 'Submitted', 'Pending', 'Partial', 'Originals Returned', 'Not Required'];

const AddStudent = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [colleges, setColleges] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(true);
  const [selectedCollegeId, setSelectedCollegeId] = useState(null);
  const [courseOptions, setCourseOptions] = useState([]);
  const [courseOptionsLoading, setCourseOptionsLoading] = useState(true);
  const [selectedCourseName, setSelectedCourseName] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedBranchName, setSelectedBranchName] = useState('');
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [quickFilterCourses, setQuickFilterCourses] = useState([]);
  const [quickFilterBranches, setQuickFilterBranches] = useState([]);
  const [quickFilterCoursesLoading, setQuickFilterCoursesLoading] = useState(false);
  const [quickFilterBranchesLoading, setQuickFilterBranchesLoading] = useState(false);
  const [admissionNumberLoading, setAdmissionNumberLoading] = useState(false);
  const [isAdmissionNumberManual, setIsAdmissionNumberManual] = useState(false);
  const [frozenBatches, setFrozenBatches] = useState({});
  const [frozenBatchesLoading, setFrozenBatchesLoading] = useState(true);


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
    student_status: 'Regular',
    scholar_status: 'Eligible',
    fee_status: 'due',
    registration_status: 'Pending',
    student_mobile: '',
    parent_mobile1: '',
    parent_mobile2: '',
    caste: '',
    gender: '',
    father_name: '',
    dob: '',
    adhar_no: '',
    admission_no: '',
    pincode: '',
    state: '',
    student_address: '',
    city_village: '',
    mandal_name: '',
    district: '',
    previous_college: '',
    certificates_status: '',
    student_photo: '',
    remarks: ''
  });

  useEffect(() => {
    const loadColleges = async () => {
      try {
        setCollegesLoading(true);
        const response = await api.get('/colleges');
        const collegeData = response.data.data || [];
        setColleges(collegeData);

        // Auto-select college if only one is available (for scoped users)
        if (collegeData.length === 1) {
          const singleCollege = collegeData[0];
          setSelectedCollegeId(singleCollege.id);
          setStudentData((prev) => ({
            ...prev,
            college: singleCollege.name
          }));
        }
      } catch (error) {
        console.error('Failed to load colleges', error);
        toast.error(error.response?.data?.message || 'Failed to load colleges');
      } finally {
        setCollegesLoading(false);
      }
    };

    // Load batches: same source as Students Database page (quick-filters = distinct batches from students)
    // so Add Student shows 2023, 2024, 2026-2027 etc. matching the batch filter on Students page
    const loadBatches = async () => {
      try {
        setBatchesLoading(true);
        const response = await api.get('/students/quick-filters');
        const list = response.data?.data?.batches || [];
        if (list.length > 0) {
          setBatches(list.map((b) => ({ value: b, label: b })));
        } else {
          // No students yet: fall back to active academic years so first student can be added
          const ayResponse = await api.get('/academic-years/active');
          const ayData = ayResponse.data.data || [];
          setBatches(ayData.map((y) => ({ value: y.yearLabel, label: y.yearLabel })));
        }
      } catch (error) {
        console.error('Failed to load batches', error);
        try {
          const ayResponse = await api.get('/academic-years/active');
          const ayData = ayResponse.data.data || [];
          setBatches(ayData.map((y) => ({ value: y.yearLabel, label: y.yearLabel })));
        } catch (fallbackErr) {
          console.error('Fallback academic years failed', fallbackErr);
        }
      } finally {
        setBatchesLoading(false);
      }
    };

    const loadFrozenBatches = async () => {
      try {
        setFrozenBatchesLoading(true);
        const response = await api.get('/settings/frozen-batches');
        setFrozenBatches(response.data?.data || {});
      } catch (error) {
        console.error('Failed to load frozen batches:', error);
      } finally {
        setFrozenBatchesLoading(false);
      }
    };

    loadColleges();
    loadBatches();
    loadFrozenBatches();
  }, []);

  const availableCourses = useMemo(
    () => {
      let courses = courseOptions.filter((course) => course?.isActive !== false);
      // Filter by level if level is selected
      if (selectedLevel) {
        courses = courses.filter(course => course.level === selectedLevel);
      }
      return courses;
    },
    [courseOptions, selectedLevel]
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
    // Strictly ensure we only show branches when a course is selected
    if (!selectedCourse || !selectedCourseName) {
      return [];
    }

    // Get all active branches from the selected course configuration
    // This ensures that ALL configured branches are visible, even if no students are currently enrolled
    const branches = (selectedCourse.branches || [])
      .filter((branch) => branch?.isActive !== false);

    // Deduplicate branches by name to avoid duplicates
    const branchMap = new Map();
    branches.forEach(branch => {
      if (!branchMap.has(branch.name)) {
        branchMap.set(branch.name, branch);
      }
    });

    return Array.from(branchMap.values());
  }, [selectedCourse, selectedCourseName]);

  const selectedBranch = useMemo(
    () =>
      branchOptions.find(
        (branch) =>
          branch.name?.toLowerCase() === selectedBranchName.toLowerCase()
      ) || null,
    [branchOptions, selectedBranchName]
  );

  // Auto-select branch if only one is available (for scoped users)
  useEffect(() => {
    if (branchOptions.length === 1 && !selectedBranchName) {
      const singleBranch = branchOptions[0];
      setSelectedBranchName(singleBranch.name);
      setStudentData((prev) => ({
        ...prev,
        branch: singleBranch.name
      }));
    }
  }, [branchOptions, selectedBranchName]);

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

  // Reset branch selection when batch/course changes (branches filtered by quick-filters or course config)
  useEffect(() => {
    const branchList = quickFilterBranches.length > 0
      ? quickFilterBranches
      : branchOptions.map((b) => b.name);
    if (selectedBranchName && branchList.length > 0) {
      const branchStillValid = branchList.some(
        (name) => name?.toLowerCase() === selectedBranchName.toLowerCase()
      );
      if (!branchStillValid) {
        setSelectedBranchName('');
        setStudentData((prev) => ({ ...prev, branch: '' }));
      }
    }

    // Auto-select first branch if only one option available
    if (!selectedBranchName && branchList.length === 1) {
      const name = quickFilterBranches.length > 0 ? quickFilterBranches[0] : branchOptions[0].name;
      setSelectedBranchName(name);
      setStudentData((prev) => ({ ...prev, branch: name }));
    }
  }, [studentData.batch, quickFilterBranches, branchOptions, selectedBranchName]);

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

  // Determine course type (Diploma, UG, or PG) based on course name
  const courseType = useMemo(() => {
    if (!selectedCourse) return null;
    return getCourseType(selectedCourse);
  }, [selectedCourse]);

  // Certificate status state - tracks Yes/No for each certificate
  const [certificateStatus, setCertificateStatus] = useState({});

  // Get certificates based on course type
  const getCertificatesForCourse = () => {
    if (!courseType) return [];
    return getCertificatesForCourseShared(courseType);
  };

  // Update certificates_status based on certificate status
  useEffect(() => {
    if (!courseType) return;
    const certificates = getCertificatesForCourse();
    if (certificates.length === 0) return;

    const allYes = certificates.every(cert => certificateStatus[cert.key] === true);
    if (allYes && certificates.length > 0) {
      setStudentData(prev => ({ ...prev, certificates_status: 'Verified' }));
    } else {
      setStudentData(prev => ({ ...prev, certificates_status: 'Unverified' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificateStatus, courseType]);


  useEffect(() => {
    const loadCourseConfig = async () => {
      try {
        setCourseOptionsLoading(true);
        // Always use the scoped /courses endpoint to respect user's assigned scope
        const url = selectedCollegeId
          ? `/courses?collegeId=${selectedCollegeId}&includeInactive=false`
          : '/courses?includeInactive=false';
        const response = await api.get(url);
        const courseData = response.data.data || [];
        setCourseOptions(courseData);

        // Auto-select course if only one is available (for scoped users)
        const activeCourses = courseData.filter((course) => course?.isActive !== false);
        if (activeCourses.length === 1) {
          const singleCourse = activeCourses[0];
          setSelectedCourseName(singleCourse.name);
          setStudentData((prev) => ({
            ...prev,
            course: singleCourse.name
          }));

          // Also auto-select branch if only one is available
          const activeBranches = (singleCourse.branches || []).filter((b) => b?.isActive !== false);
          if (activeBranches.length === 1) {
            const singleBranch = activeBranches[0];
            setSelectedBranchName(singleBranch.name);
            setStudentData((prev) => ({
              ...prev,
              branch: singleBranch.name
            }));
          }
        }
      } catch (error) {
        console.error('Failed to load course configuration', error);
        toast.error(error.response?.data?.message || 'Failed to load course configuration');
      } finally {
        setCourseOptionsLoading(false);
      }
    };

    loadCourseConfig();
  }, [selectedCollegeId]);

  // Same endpoint as Students Database page: quick-filters for courses and branches
  useEffect(() => {
    if (!studentData.college) {
      setQuickFilterCourses([]);
      setQuickFilterBranches([]);
      return;
    }
    const fetchQuickFilterCourses = async () => {
      try {
        setQuickFilterCoursesLoading(true);
        const params = new URLSearchParams();
        params.append('college', studentData.college);
        if (studentData.batch) params.append('batch', studentData.batch);
        if (selectedLevel) params.append('level', selectedLevel);
        const response = await api.get(`/students/quick-filters?${params.toString()}`);
        if (response.data?.success) {
          const data = response.data.data || {};
          setQuickFilterCourses(data.courses || []);
          setQuickFilterBranches([]);
        } else {
          setQuickFilterCourses([]);
          setQuickFilterBranches([]);
        }
      } catch (error) {
        console.error('Failed to load courses/branches from quick-filters', error);
        setQuickFilterCourses([]);
        setQuickFilterBranches([]);
      } finally {
        setQuickFilterCoursesLoading(false);
      }
    };
    fetchQuickFilterCourses();
  }, [studentData.college, studentData.batch, selectedLevel]);

  useEffect(() => {
    if (!studentData.college || !selectedCourseName) {
      setQuickFilterBranches((prev) => (prev.length ? [] : prev));
      return;
    }
    const fetchQuickFilterBranches = async () => {
      try {
        setQuickFilterBranchesLoading(true);
        const params = new URLSearchParams();
        params.append('college', studentData.college);
        params.append('course', selectedCourseName);
        if (studentData.batch) params.append('batch', studentData.batch);
        if (selectedLevel) params.append('level', selectedLevel);
        const response = await api.get(`/students/quick-filters?${params.toString()}`);
        if (response.data?.success) {
          const data = response.data.data || {};
          setQuickFilterBranches(data.branches || []);
        } else {
          setQuickFilterBranches([]);
        }
      } catch (error) {
        console.error('Failed to load branches from quick-filters', error);
        setQuickFilterBranches([]);
      } finally {
        setQuickFilterBranchesLoading(false);
      }
    };
    fetchQuickFilterBranches();
  }, [studentData.college, studentData.batch, selectedLevel, selectedCourseName]);



  // Address Data Management
  const [districts, setDistricts] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [villages, setVillages] = useState([]);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [villagesLoading, setVillagesLoading] = useState(false);
  const [isMandalInputVisible, setIsMandalInputVisible] = useState(false);
  const [isVillageInputVisible, setIsVillageInputVisible] = useState(false);

  // Previous College Management
  const [previousColleges, setPreviousColleges] = useState([]);
  const [previousCollegesLoading, setPreviousCollegesLoading] = useState(false);
  const [isPreviousCollegeInputVisible, setIsPreviousCollegeInputVisible] = useState(false);
  const [isManageCollegesModalOpen, setIsManageCollegesModalOpen] = useState(false);

  useEffect(() => {
    const fetchPreviousColleges = async () => {
      try {
        setPreviousCollegesLoading(true);
        const response = await api.get('/previous-colleges');
        if (response.data.success) {
          setPreviousColleges(response.data.data);
        }
      } catch (error) {
        console.error('Failed to load previous colleges', error);
      } finally {
        setPreviousCollegesLoading(false);
      }
    };
    fetchPreviousColleges();
  }, []);

  const handlePreviousCollegeSelectChange = (e) => {
    const value = e.target.value;
    if (value === 'Other') {
      setIsPreviousCollegeInputVisible(true);
      setStudentData(prev => ({ ...prev, previous_college: '' }));
    } else {
      setIsPreviousCollegeInputVisible(false);
      setStudentData(prev => ({ ...prev, previous_college: value }));
    }
  };

  // Reset custom input visibility when district changes
  useEffect(() => {
    setIsMandalInputVisible(false);
    setIsVillageInputVisible(false);
  }, [studentData.district]);

  // Filter districts when state changes
  useEffect(() => {
    if (studentData.state && addressData[studentData.state]) {
      setDistricts(Object.keys(addressData[studentData.state]).sort());
    } else {
      setDistricts([]);
    }
  }, [studentData.state]);

  // Filter mandals when district changes
  useEffect(() => {
    if (studentData.state && studentData.district && addressData[studentData.state] && addressData[studentData.state][studentData.district]) {
      // If mandals are already set (e.g. from Pincode), we merge or keep them
      // But usually, we want the full list from local data + matches
      // For now, let's just reset to the full list from addressData to ensure completeness
      // unless we want to restrict to what the pincode says.
      // Better approach: Use addressData list as base.
      setMandals(addressData[studentData.state][studentData.district].sort());
    } else if (!pincodeLoading) {
      // Only clear if not currently loading from pincode (which might set custom mandals)
      // Actually pincode sets the state values, which triggers this effect.
      // So this effect should just provide the options.
      setMandals([]);
    }
  }, [studentData.state, studentData.district]);

  // Fetch villages when Mandal changes (and matches a valid Mandal)
  useEffect(() => {
    const fetchVillages = async () => {
      const currentMandal = studentData.mandal_name;
      const currentDistrict = studentData.district;
      const currentState = studentData.state;

      // Only fetch if we have a valid Mandal selected (present in the mandals list)
      // and we are NOT currently loading from Pincode (to avoid conflict)
      if (
        currentMandal &&
        mandals.includes(currentMandal) &&
        !pincodeLoading
      ) {
        try {
          setVillagesLoading(true);
          const response = await fetch(`https://api.postalpincode.in/postoffice/${currentMandal}`);
          const data = await response.json();

          if (data && data[0] && data[0].Status === 'Success') {
            const postOffices = data[0].PostOffice;

            // Filter POs that belong to the selected District/State to avoid name collisions
            const relevantVillages = postOffices
              .filter(po => {
                const poDistrict = (po.District || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const poState = (po.Circle || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                const selectedDistrict = (currentDistrict || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const selectedState = (currentState || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                const districtMatch = poDistrict.includes(selectedDistrict) || selectedDistrict.includes(poDistrict);
                const stateMatch = poState.includes(selectedState) || selectedState.includes(poState);

                return districtMatch && stateMatch;
              })
              .map(po => po.Name);

            const uniqueVillages = [...new Set(relevantVillages)].sort();
            setVillages(uniqueVillages.length > 0 ? uniqueVillages : []);
          } else {
            setVillages([]);
          }
        } catch (error) {
          console.error("Failed to fetch villages by mandal:", error);
          setVillages([]);
        } finally {
          setVillagesLoading(false);
        }
      }
    };

    const timer = setTimeout(fetchVillages, 300);
    return () => clearTimeout(timer);
  }, [studentData.mandal_name, mandals, studentData.district, studentData.state, pincodeLoading]);

  const fetchPincodeDetails = async (pincode) => {
    if (!pincode || pincode.length !== 6) return;

    try {
      setPincodeLoading(true);
      const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await response.json();

      if (data && data[0] && data[0].Status === 'Success') {
        const postOffices = data[0].PostOffice;
        if (postOffices && postOffices.length > 0) {
          const details = postOffices[0];

          // Data from API
          const apiState = details.Circle; // e.g., 'Andhra Pradesh'
          const apiDistrict = details.District; // e.g., 'Chittoor'
          const apiBlock = details.Block; // Often corresponds to Mandal

          // 1. Match State
          // We need to match 'Andhra Pradesh' to our keys in addressData
          // our keys: "Andhra Pradesh", "Telangana"
          let matchedState = '';
          const stateKeys = Object.keys(addressData);
          const normalizedApiState = apiState.toLowerCase().replace(/[^a-z0-9]/g, '');

          for (const key of stateKeys) {
            if (key.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedApiState) {
              matchedState = key;
              break;
            }
          }

          // 2. Match District
          let matchedDistrict = '';
          if (matchedState) {
            const districtKeys = Object.keys(addressData[matchedState]);
            const normalizedApiDistrict = apiDistrict.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Try exact or fuzzy match
            for (const key of districtKeys) {
              const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (normalizedKey === normalizedApiDistrict || normalizedKey.includes(normalizedApiDistrict) || normalizedApiDistrict.includes(normalizedKey)) {
                matchedDistrict = key;
                break;
              }
            }
          }

          // Collect all potential villages/cities from the Post Office names
          const villageList = postOffices.map(po => po.Name).sort();
          setVillages(villageList);

          setStudentData(prev => ({
            ...prev,
            pincode: pincode,
            state: matchedState || prev.state || apiState, // Fallback to API value if no match
            district: matchedDistrict || prev.district || apiDistrict,
            mandal_name: apiBlock || prev.mandal_name,
            // If the current city is empty, maybe auto-select the first one? No, let user choose.
          }));

          toast.success(`Address details found for Pincode: ${pincode}`);
        } else {
          toast.error('Invalid Pincode or no data found.');
        }
      } else {
        toast.error('Invalid Pincode');
      }
    } catch (error) {
      console.error('Pincode fetch error:', error);
      toast.error('Failed to fetch address details');
    } finally {
      setPincodeLoading(false);
    }
  };

  const handlePincodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setStudentData(prev => ({ ...prev, pincode: value }));

    if (value.length === 6) {
      fetchPincodeDetails(value);
    }
  };

  const handleStateChange = (e) => {
    const newState = e.target.value;
    setStudentData(prev => ({
      ...prev,
      state: newState,
      district: '',
      mandal_name: '',
      city_village: '',
      pincode: '' // Reset pincode if manually navigating
    }));
    setVillages([]); // Clear village suggestions
  };

  const handleDistrictChange = (e) => {
    const newDistrict = e.target.value;
    setStudentData(prev => ({
      ...prev,
      district: newDistrict,
      mandal_name: '',
      city_village: '',
      pincode: '' // Reset pincode if manually navigating
    }));
    setVillages([]); // Clear village suggestions
    setIsMandalInputVisible(false);
  };

  const handleMandalSelectChange = (e) => {
    const value = e.target.value;
    if (value === 'Other') {
      setIsMandalInputVisible(true);
      setStudentData(prev => ({ ...prev, mandal_name: '' }));
      setVillages([]); // Clear villages since custom mandal likely won't have mapped villages
    } else {
      setIsMandalInputVisible(false);
      setStudentData(prev => ({ ...prev, mandal_name: value, city_village: '' }));
    }
  };

  const handleVillageSelectChange = (e) => {
    const value = e.target.value;
    if (value === 'Other') {
      setIsVillageInputVisible(true);
      setStudentData(prev => ({ ...prev, city_village: '' }));
    } else {
      setIsVillageInputVisible(false);
      setStudentData(prev => ({ ...prev, city_village: value }));
    }
  };

  // Auto-fetch current year/sem from backend based on existing students in the same batch
  useEffect(() => {
    const fetchBatchStatus = async () => {
      // Need all three to be precise
      if (!studentData.batch || !studentData.course || !studentData.branch) {
        return;
      }

      try {
        const response = await api.get('/students/batch-status', {
          params: {
            batch: studentData.batch,
            course: studentData.course,
            branch: studentData.branch
          }
        });

        if (response.data.success && response.data.data) {
          const { current_year, current_semester } = response.data.data;

          setStudentData((prev) => {
            const shouldUpdate =
              prev.current_year !== String(current_year) ||
              prev.current_semester !== String(current_semester);

            if (shouldUpdate) {
              return {
                ...prev,
                current_year: String(current_year),
                current_semester: String(current_semester)
              };
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Failed to fetch batch status:', error);
        // If error or no data, we might default to 1-1 or let user choose.
        // For now, we leave it as is, or let the validation effect clamp it.
      }
    };

    fetchBatchStatus();
  }, [studentData.batch, studentData.course, studentData.branch]);

  useEffect(() => {
    if (!activeStructure) {
      return;
    }

    const totalYears = Number(activeStructure.totalYears) || 0;
    const semestersPerYear = Number(activeStructure.semestersPerYear) || 0;

    setStudentData((prev) => {
      const updated = { ...prev };
      let changed = false;

      if (totalYears > 0) {
        const currentYear = Number(prev.current_year) || 1;
        if (currentYear < 1 || currentYear > totalYears) {
          updated.current_year = String(Math.min(Math.max(1, currentYear), totalYears));
          changed = true;
        }
      }

      if (semestersPerYear > 0) {
        const currentSemester = Number(prev.current_semester) || 1;
        if (currentSemester < 1 || currentSemester > semestersPerYear) {
          updated.current_semester = String(
            Math.min(Math.max(1, currentSemester), semestersPerYear)
          );
          changed = true;
        }
      }

      return changed ? updated : prev;
    });
  }, [activeStructure]);

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
    // Directly update studentData.branch (don't rely only on useEffect)
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

    // Comprehensive validation for all required fields
    const requiredFields = [
      { field: 'admission_no', label: 'Admission Number' },
      { field: 'student_name', label: 'Student Name' },
      { field: 'father_name', label: 'Father Name' },
      { field: 'gender', label: 'Gender' },
      { field: 'college', label: 'College' },
      { field: 'course', label: 'Program' },
      { field: 'branch', label: 'Branch' },
      { field: 'current_year', label: 'Current Year' },
      { field: 'current_semester', label: 'Current Semester' },
      { field: 'batch', label: 'Batch' },
      { field: 'stud_type', label: 'Student Type' },
      { field: 'student_status', label: 'Student Status' },

      { field: 'student_mobile', label: 'Student Mobile' },
      { field: 'parent_mobile1', label: 'Parent Mobile 1' },
      { field: 'caste', label: 'Caste' },
      { field: 'dob', label: 'Date of Birth' },
      { field: 'certificates_status', label: 'Certificates Status' }
    ];

    const missingFields = requiredFields.filter(({ field }) => !studentData[field] || !studentData[field].toString().trim());

    if (missingFields.length > 0) {
      const fieldNames = missingFields.slice(0, 3).map(f => f.label).join(', ');
      const moreCount = missingFields.length > 3 ? ` and ${missingFields.length - 3} more` : '';
      toast.error(`Please fill in required fields: ${fieldNames}${moreCount}`);
      return;
    }

    // Validate batch exists in available batches
    if (batches.length > 0) {
      const batchExists = batches.some(b => b.value === studentData.batch);
      if (!batchExists) {
        toast.error('Selected batch is not available. Please select a valid batch.');
        return;
      }
    }

    try {
      setLoading(true);

      // Create FormData for multipart submission (to handle photo upload)
      const formData = new FormData();

      // Add all student data fields
      Object.entries({
        ...studentData,
        current_year: Number(studentData.current_year),
        current_semester: Number(studentData.current_semester)
      }).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          // Add pincode to address if not empty (since there is no DB column for it yet, we can append it or rely on address text)
          // For now, let's keep it separate in formdata, handled by backend if column exists or ignored
          formData.append(key, value);
        }
      });

      const response = await api.post('/students', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        toast.success('Student added successfully');
        navigate('/students', { state: { newStudent: response.data.data } });
      } else {
        toast.error(response.data.message || 'Failed to add student');
      }
    } catch (error) {
      console.error('Error adding student:', error);
      toast.error(error.response?.data?.message || 'Failed to add student');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-6">
          <LoadingAnimation
            width={32}
            height={32}
            message="Loading add student form..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary heading-font">Add New Student</h1>
          <p className="text-sm sm:text-base text-text-secondary mt-1 sm:mt-2 body-font">Create a new student record</p>
        </div>
        <button
          onClick={() => navigate('/students')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-lg text-white font-medium bg-gradient-to-r from-indigo-600 to-purple-700 border border-transparent shadow-md hover:shadow-lg active:scale-95 transition-all duration-300 touch-manipulation min-h-[44px]"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back to Students</span>
          <span className="sm:hidden">Back</span>
        </button>
      </div>

      <div className="bg-card-bg rounded-lg sm:rounded-xl shadow-sm border border-border-light p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Form sections */}
          <div className="border-b border-border-light pb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              Basic & Academic Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admission Number <span className="text-red-500">*</span>
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
                    required
                    disabled={admissionNumberLoading}
                    className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 text-base sm:text-sm border border-border-light rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-input-bg text-text-primary transition-all duration-200 hover:border-primary-300 touch-manipulation min-h-[44px] ${admissionNumberLoading ? 'bg-gray-100' : ''}`}
                    placeholder={admissionNumberLoading ? 'Generating...' : 'Enter admission number or select batch to auto-generate'}
                  />
                  {admissionNumberLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                    </div>
                  )}
                </div>
                {!isAdmissionNumberManual && studentData.batch && (
                  <p className="mt-1 text-xs text-gray-500">
                    Format: {studentData.batch.match(/\d{4}/)?.[0] || studentData.batch}XXXX (e.g., {studentData.batch.match(/\d{4}/)?.[0] || studentData.batch}0001)
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
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
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
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
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
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
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
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                >
                  <option value="">Select Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-b border-border-light pb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              Academic Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {/* 1. College */}
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
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
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

              {/* 2. Batch */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Batch <span className="text-red-500">*</span>
                </label>
                {batchesLoading ? (
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2">
                    <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                    Loading batches...
                  </div>
                ) : batches.length > 0 ? (
                  <select
                    name="batch"
                    value={studentData.batch}
                    onChange={handleChange}
                    required
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                  >
                    <option value="">Select Batch</option>
                    {batches.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    name="batch"
                    value={studentData.batch}
                    onChange={handleChange}
                    placeholder="Enter batch"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                  />
                )}
                {studentData.batch && frozenBatches[studentData.batch]?.includes("ALL") && (
                  <p className="mt-1 text-xs text-red-500 font-medium">This batch is completely frozen. You cannot add students to it.</p>
                )}
              </div>

              {/* 3. Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Level
                </label>
                <select
                  value={selectedLevel}
                  onChange={(e) => {
                    setSelectedLevel(e.target.value);
                    // Clear course selection when level changes
                    setSelectedCourseName('');
                    setStudentData((prev) => ({ ...prev, course: '' }));
                  }}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                >
                  <option value="">All Levels</option>
                  <option value="diploma">Diploma</option>
                  <option value="ug">UG</option>
                  <option value="pg">PG</option>
                </select>
              </div>

              {/* 4. Program - same source as Students Database (quick-filters) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Program <span className="text-red-500">*</span>
                </label>
                {(courseOptionsLoading || (studentData.college && quickFilterCoursesLoading)) ? (
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2">
                    <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                    Loading programs...
                  </div>
                ) : (quickFilterCourses.length > 0 || availableCourses.length > 0) ? (
                  <select
                    value={selectedCourseName}
                    onChange={handleCourseSelect}
                    required
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                  >
                    <option value="">Select Course</option>
                    {quickFilterCourses.length > 0
                      ? [...new Set(quickFilterCourses)].map((name) => (
                        <option key={`qf-course-${name}`} value={name}>{name}</option>
                      ))
                      : [...new Map(availableCourses.map(c => [c.name, c])).values()].map((course) => (
                        <option key={`course-${course.id || course.name}`} value={course.name}>
                          {course.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    name="course"
                    value={studentData.course}
                    onChange={handleChange}
                    placeholder={studentData.college ? 'No programs in quick-filters for this college/batch' : 'Select college first'}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                  />
                )}
              </div>

              {/* 5. Branch - same source as Students Database (quick-filters) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch <span className="text-red-500">*</span>
                </label>
                {selectedCourseName && quickFilterBranchesLoading ? (
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 flex items-center gap-2">
                    <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                    Loading branches...
                  </div>
                ) : (quickFilterBranches.length > 0 || branchOptions.length > 0) ? (
                  <select
                    value={selectedBranchName}
                    onChange={handleBranchSelect}
                    required
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                  >
                    <option value="">Select Branch</option>
                    {branchOptions.map((branch) => (
                      <option key={`branch-${branch.id || branch.name}`} value={branch.name}>
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
                    placeholder={selectedCourseName ? 'No branches for this program' : 'Select program first'}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                  />
                )}
              </div>

              {/* 5. Current Academic Year */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  current year <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={
                      studentData.batch && studentData.course && studentData.branch
                        ? `Year ${studentData.current_year || '-'}`
                        : '-'
                    }
                    disabled
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed outline-none touch-manipulation min-h-[44px]"
                  />
                  {(!studentData.batch || !studentData.course || !studentData.branch) && (
                    <p className="absolute -bottom-5 left-0 text-xs text-orange-500 whitespace-nowrap">
                      Select batch, course & branch
                    </p>
                  )}
                </div>
              </div>

              {/* 6. Current Semester */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Semester <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={
                      studentData.batch && studentData.course && studentData.branch
                        ? `Semester ${studentData.current_semester || '-'}`
                        : '-'
                    }
                    disabled
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed outline-none touch-manipulation min-h-[44px]"
                  />
                  {(!studentData.batch || !studentData.course || !studentData.branch) && (
                    <p className="absolute -bottom-5 left-0 text-xs text-orange-500 whitespace-nowrap">
                      Select details to calculate
                    </p>
                  )}
                </div>
              </div>

              {/* 7. Student Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="stud_type"
                  value={studentData.stud_type}
                  onChange={handleChange}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                >
                  <option value="">Select Student Type</option>
                  {STUDENT_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* 8. Student Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student Status <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="student_status"
                  value="Regular"
                  disabled
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed outline-none touch-manipulation min-h-[44px]"
                />
              </div>







              {/* 10. Previous College Name */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Previous College Name
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsManageCollegesModalOpen(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Manage List
                  </button>
                </div>
                {(() => {
                  // Determine filter based on selected course and year
                  let targetCategory = 'All';
                  const courseName = selectedCourseName ? selectedCourseName.toLowerCase() : '';
                  const currentYear = parseInt(studentData.current_year) || 1;

                  if (courseName.includes('diploma')) {
                    targetCategory = '10th/School';
                  } else if (courseName.includes('b.tech') || courseName.includes('btech')) {
                    if (currentYear === 1) {
                      targetCategory = 'Inter/Junior College';
                    } else {
                      targetCategory = 'Diploma College';
                    }
                  }

                  // Filter colleges
                  const filteredList = previousColleges.filter(col => {
                    if (targetCategory === 'All') return true;
                    // Strict filtering
                    return col.category === targetCategory;
                  });

                  // If filtering is active but list is empty, show empty list (don't fallback to all)
                  const listToShow = targetCategory === 'All' ? previousColleges : filteredList;
                  const options = listToShow.map(col => col.name);

                  return (
                    <SearchableSelect
                      name="previous_college"
                      value={studentData.previous_college}
                      onChange={handleChange}
                      options={options}
                      placeholder={previousCollegesLoading ? "Loading..." : "Search or enter college name..."}
                      disabled={previousCollegesLoading}
                    />
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="border-b border-border-light pb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              Contact Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parent Mobile Number 1 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="parent_mobile1"
                  value={studentData.parent_mobile1}
                  onChange={handleChange}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
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
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                />
              </div>
            </div>
          </div>

          <div className="border-b border-border-light pb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              Personal Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="dob"
                  value={studentData.dob}
                  onChange={handleChange}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
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
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caste <span className="text-red-500">*</span>
                </label>
                <select
                  name="caste"
                  value={studentData.caste}
                  onChange={handleChange}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                >
                  <option value="">Select Caste</option>
                  {CASTE_OPTIONS.map((caste) => (
                    <option key={caste} value={caste}>
                      {caste}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-b border-border-light pb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
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
                  rows="3"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                ></textarea>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {/* Pincode Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pincode
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="pincode"
                    value={studentData.pincode}
                    onChange={handlePincodeChange}
                    placeholder="Enter 6-digit Pincode"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                  />
                  {pincodeLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <LoadingAnimation width={16} height={16} showMessage={false} variant="inline" />
                    </div>
                  )}
                </div>
              </div>

              {/* State Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <select
                  name="state"
                  value={studentData.state}
                  onChange={handleStateChange}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                >
                  <option value="">Select State</option>
                  {Object.keys(addressData).sort().map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              {/* District Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  District
                </label>
                <select
                  name="district"
                  value={studentData.district}
                  onChange={handleDistrictChange}
                  disabled={!studentData.state}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">Select District</option>
                  {districts.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mandal Hybrid Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mandal Name
                </label>
                {!isMandalInputVisible ? (
                  <select
                    name="mandal_name"
                    value={studentData.mandal_name}
                    onChange={handleMandalSelectChange}
                    disabled={!studentData.district}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">{studentData.district ? "Select Mandal" : "Select District first"}</option>
                    {mandals.map((mandal) => (
                      <option key={mandal} value={mandal}>{mandal}</option>
                    ))}
                    <option value="Other">Other (Enter Manually)</option>
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      name="mandal_name"
                      value={studentData.mandal_name}
                      onChange={handleChange}
                      placeholder="Enter Mandal Name"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setIsMandalInputVisible(false)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
                    >
                      Show List
                    </button>
                  </div>
                )}
              </div>

              {/* City/Village Hybrid Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City/Village Name
                </label>
                {!isVillageInputVisible ? (
                  <select
                    name="city_village"
                    value={studentData.city_village}
                    onChange={handleVillageSelectChange}
                    disabled={(!studentData.mandal_name && !isMandalInputVisible) && villages.length === 0}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px] disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">
                      {villagesLoading
                        ? "Loading villages/POs..."
                        : "Select City/Village"}
                    </option>
                    {villages.map((village, idx) => (
                      <option key={`${village}-${idx}`} value={village}>{village}</option>
                    ))}
                    <option value="Other">Other (Enter Manually)</option>
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      name="city_village"
                      value={studentData.city_village}
                      onChange={handleChange}
                      placeholder="Enter City/Village Name"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setIsVillageInputVisible(false)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
                    >
                      Show List
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-b border-border-light pb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              Additional Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Certificates Status is auto-calculated based on certificate Yes/No toggles */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Student Photo
                </label>
                <div className="border-2 border-dashed border-border-light rounded-lg p-6 text-center hover:border-primary-400 transition-colors bg-input-bg">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        try {
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

                          // Convert to base64 and store locally (will be sent with student creation)
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
                        } catch (error) {
                          console.error('Photo selection error:', error);
                          toast.error('Failed to select photo');
                        }
                      }
                    }}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label
                    htmlFor="photo-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    {studentData.student_photo && studentData.student_photo.startsWith('data:') ? (
                      <img
                        src={studentData.student_photo}
                        alt="Student preview"
                        className="w-24 h-24 object-cover rounded-lg border-2 border-primary-300"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-sm font-medium text-text-primary">
                        {studentData.student_photo ? 'Change Photo' : 'Upload Photo'}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        PNG, JPG up to 5MB
                      </p>
                    </div>
                  </label>
                  {studentData.student_photo && (
                    <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2 text-green-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm font-medium">Photo selected - will be saved with student</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Remarks
                </label>
                <textarea
                  name="remarks"
                  value={studentData.remarks}
                  onChange={handleChange}
                  rows="3"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none touch-manipulation min-h-[44px]"
                ></textarea>
              </div>
            </div>
          </div>

          {/* Certificate Information Section - Dynamic with Yes/No toggles */}
          {courseType && (
            <div className="border-b border-border-light pb-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                Certificate Information
              </h2>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-gray-600" />
                  Default Certification Fields
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {getCertificatesForCourse().map((cert) => (
                    <div key={cert.key} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                      <span className="text-sm text-gray-700">{cert.label}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={certificateStatus[cert.key] || false}
                          onChange={(e) => {
                            setCertificateStatus(prev => ({
                              ...prev,
                              [cert.key]: e.target.checked
                            }));
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                        <span className="ml-2 text-xs text-gray-500">
                          {certificateStatus[cert.key] ? 'Yes' : 'No'}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-6">
            <button
              type="submit"
              disabled={loading || (studentData.batch && frozenBatches[studentData.batch]?.includes("ALL"))}
              className="flex items-center gap-2 bg-gradient-to-r from-gray-800 via-gray-900 to-black text-white px-8 py-4 rounded-xl font-semibold
             hover:from-gray-900 hover:via-black hover:to-gray-800 focus:ring-4 focus:ring-gray-400/40 transition-all duration-300
             disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-2xl transform hover:scale-105 active:scale-95"
            >
              {loading ? (
                <>
                  <LoadingAnimation width={16} height={16} variant="inline" showMessage={false} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Student
                </>
              )}
            </button>

          </div>
        </form>
      </div>
      <ManagePreviousCollegesModal
        isOpen={isManageCollegesModalOpen}
        onClose={() => {
          setIsManageCollegesModalOpen(false);
          // Refetch list when closed in case changes were made
          const fetchPreviousColleges = async () => {
            try {
              setPreviousCollegesLoading(true);
              const response = await api.get('/previous-colleges');
              if (response.data.success) {
                setPreviousColleges(response.data.data);
              }
            } catch (error) {
              console.error('Failed to load previous colleges', error);
            } finally {
              setPreviousCollegesLoading(false);
            }
          };
          fetchPreviousColleges();
        }}
      />
    </div>
  );
};

export default AddStudent;