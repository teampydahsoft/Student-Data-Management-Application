import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertCircle, Clock, CheckCircle, User, Users, MapPin, GraduationCap, FileText, ChevronRight, Check, Phone, Lock } from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';

// Field categorization matching Settings.jsx and PublicForm.jsx
const PERSONAL_FIELDS = [
    'student_name', 'student name', 'name', 'studentname',
    'father_name', 'father name', 'father', 'fathername',
    'mother_name', 'mother name', 'mother', 'mothername',
    'gender', 'm/f', 'sex', 'mf',
    'dob', 'date of birth', 'birth date', 'birthday', 'date-month-year', 'date month year',
    'adhar_no', 'adhar number', 'aadhar', 'aadhar no', 'aadhar number', 'adhar', 'aadhar_no', 'aadhar no',
    'pin_no', 'pin number', 'pin', 'pinno',
    'apaar', 'apaar id', 'apaar_id', 'apaar number', 'apaar no', 'apaarid',
    'admission_no', 'admission number', 'admission', 'admissionno',
    'caste', 'category'
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

    const normalize = (str) => {
        return str
            .replace(/[()]/g, ' ')
            .replace(/\([^)]*\)/g, '')
            .replace(/[_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    };

    const normalizedKey = normalize(key);
    const normalizedLabel = normalize(label);

    const matches = (pattern) => {
        const normalizedPattern = normalize(pattern);
        return normalizedKey.includes(normalizedPattern) ||
            normalizedLabel.includes(normalizedPattern) ||
            normalizedKey.startsWith(normalizedPattern) ||
            normalizedLabel.startsWith(normalizedPattern) ||
            normalizedKey === normalizedPattern ||
            normalizedLabel === normalizedPattern;
    };

    if (ACADEMIC_FIELDS.some(matches)) return 'academic';
    if (ADDRESS_FIELDS.some(matches)) return 'address';
    if (PERSONAL_FIELDS.some(matches)) return 'personal';
    if (CONTACT_FIELDS.some(matches)) return 'contact';

    return 'other';
};

// System fields that shouldn't be edited by students directly
const READ_ONLY_KEYS = ['batch', 'course', 'branch', 'admission_number', 'pin_no', 'current_year', 'current_semester', 'stud_type', 'student_status', 'scholar_status', 'certificates_status'];

export const VerifyProfileDialog = ({ isOpen, onClose, studentData }) => {
    const [formData, setFormData] = useState({});
    const [originalData, setOriginalData] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [pendingRequest, setPendingRequest] = useState(null);
    const [activeTab, setActiveTab] = useState('personal');

    // Dynamic Form Fields state
    const [formFields, setFormFields] = useState([]);
    const [loadingConfig, setLoadingConfig] = useState(true);

    // Fetch Registration Form Config
    useEffect(() => {
        const fetchFormConfig = async () => {
            if (!isOpen) return;
            try {
                setLoadingConfig(true);
                const res = await api.get('/forms');
                if (res.data?.success && res.data.data) {
                    const activeForm = res.data.data.find(f => f.is_active);
                    const rawFields = activeForm.form_fields || [];

                    // Enforce and repair core fields
                    const coreFieldRepairs = {
                        gender: { type: 'select', options: ['Male', 'Female', 'Other'] },
                        current_year: { type: 'select', options: ['1', '2', '3', '4'] },
                        current_semester: { type: 'select', options: ['1', '2'] }
                    };

                    let correctedFields = rawFields.map(field => {
                        const k = String(field.key || '').toLowerCase();
                        if (coreFieldRepairs[k]) {
                            return { ...field, ...coreFieldRepairs[k] };
                        }
                        // If it's a system field that's read-only, ensure it's text type for better display
                        if (READ_ONLY_KEYS.includes(k) && field.type === 'select' && (!field.options || field.options.length === 0)) {
                            return { ...field, type: 'text' };
                        }
                        return field;
                    });

                    const coreFields = [
                        { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], required: true },
                        { key: 'course', label: 'Course', type: 'text', required: true },
                        { key: 'branch', label: 'Branch', type: 'text', required: true },
                        { key: 'current_year', label: 'Current Year', type: 'select', options: ['1', '2', '3', '4'], required: true },
                        { key: 'current_semester', label: 'Current Semester', type: 'select', options: ['1', '2'], required: true }
                    ];

                    coreFields.forEach(core => {
                        const exists = correctedFields.some(f => {
                            const k = String(f.key || '').toLowerCase();
                            const l = String(f.label || '').toLowerCase();
                            const ck = core.key.toLowerCase();
                            return k === ck || k.includes(ck) || l.includes(ck);
                        });
                        if (!exists) correctedFields.push(core);
                    });

                    setFormFields(correctedFields);
                }
            } catch (err) {
                console.error("Failed to fetch active form for verification", err);
            } finally {
                setLoadingConfig(false);
            }
        };
        fetchFormConfig();
    }, [isOpen]);

    // Group fields
    const groupedFields = useMemo(() => {
        const groups = { personal: [], academic: [], contact: [], address: [], other: [] };
        formFields.forEach(field => {
            // Skip file uploads in verify profile module
            if (field.type === 'file') return;

            const lowerKey = String(field.key).toLowerCase();
            const lowerLabel = String(field.label).toLowerCase();

            // Skip Remarks
            if (lowerKey === 'remarks' || lowerLabel.includes('remarks')) return;

            let modifiedField = { ...field };

            // Override caste to be a select
            if (lowerKey === 'caste' || lowerLabel.includes('caste')) {
                modifiedField.type = 'select';
                if (!modifiedField.options || modifiedField.options.length < 2) {
                    modifiedField.options = ['OC', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'Minority', 'Other'];
                }
            }

            const category = categorizeField(modifiedField);
            if (groups[category]) {
                groups[category].push(modifiedField);
            } else {
                groups.other.push(modifiedField);
            }
        });
        return groups;
    }, [formFields]);

    // Initial load of student data
    useEffect(() => {
        if (studentData && formFields.length > 0) {
            let parsedData = {};
            if (studentData.student_data) {
                if (typeof studentData.student_data === 'string') {
                    try { parsedData = JSON.parse(studentData.student_data); } catch (e) { }
                } else {
                    parsedData = studentData.student_data;
                }
            }

            const getVal = (field) => {
                if (!field) return '';
                const key = field.key;
                // Priorities for common variations and normalization
                const lowerKey = String(key || '').toLowerCase();
                const lowerLabel = String(field.label || '').toLowerCase();

                // Advanced case-insensitive lookup within student_data
                const getNested = (searchKey) => {
                    if (!parsedData) return null;
                    const sk = String(searchKey).toLowerCase();
                    const skUnderscore = sk.replace(/\s+/g, '_');
                    const skSpace = sk.replace(/_/g, ' ');

                    const foundK = Object.keys(parsedData).find(k => {
                        const lk = String(k).toLowerCase();
                        return lk === sk || lk === skUnderscore || lk === skSpace;
                    });
                    return foundK ? parsedData[foundK] : null;
                };

                const mappings = {
                    name: studentData.student_name || getNested('Student Name') || getNested('Name'),
                    adhar: studentData.adhar_no || studentData.aadhar_no || getNested('Adhar No') || getNested('Aadhar No') || getNested('Aadhar Number') || getNested('ADHAR No'),
                    pin: studentData.pin_no || getNested('PIN NO') || getNested('PIN Number') || getNested('Roll No') || getNested('Hall Ticket No') || getNested('Hallticket'),
                    apaar: (function () {
                        // 1. Direct columns or top-level properties
                        let v = studentData.apaar_id || studentData.apaar || studentData.apaar_no || studentData['APAAR ID'] || studentData['apaar_id'];
                        if (v) return v;

                        // 2. Precise nested lookups (getNested handles space/underscore)
                        v = getNested('APAAR ID') || getNested('apaar_id') || getNested('APAAR NO') || getNested('APAAR Number') || getNested('APAARID');
                        if (v) return v;

                        // 3. Fuzzy search in nested keys (any key containing 'apaar' or 'appar')
                        if (parsedData && typeof parsedData === 'object') {
                            const foundK = Object.keys(parsedData).find(k => {
                                const lk = String(k).toLowerCase();
                                return lk.includes('apaar') || lk.includes('appar');
                            });
                            if (foundK) return parsedData[foundK];
                        }
                        return '';
                    })(),
                    gender: (function () {
                        const raw = studentData.gender || getNested('Gender') || getNested('Sex') || getNested('M/F') || '';
                        const s = String(raw).trim().toUpperCase();
                        if (['M', 'MALE', 'BOY', '1'].includes(s)) return 'Male';
                        if (['F', 'FEMALE', 'GIRL', '2'].includes(s)) return 'Female';
                        if (['OTHER', 'O', 'NON-BINARY'].includes(s)) return 'Other';
                        return '';
                    })(),
                    course: studentData.course || getNested('Program') || getNested('Program Name') || getNested('Course') || getNested('Degree'),
                    year: studentData.current_year || getNested('Year') || getNested('Current Year'),
                    sem: studentData.current_semester || getNested('Semister') || getNested('Semester') || getNested('Current Semester'),
                    branch: studentData.branch || getNested('Branch') || getNested('Branch Name') || getNested('Specialization'),
                    caste: studentData.caste || getNested('Caste') || getNested('Category'),
                    father: studentData.father_name || getNested('Father Name') || getNested('Father'),
                    mother: studentData.mother_name || getNested('Mother Name') || getNested('Mother'),
                    dob: studentData.dob || getNested('DOB') || getNested('Date of Birth'),
                    mobile: studentData.student_mobile || getNested('Student Mobile number') || getNested('Phone') || getNested('Student Mobile'),
                    parent1: studentData.parent_mobile1 || getNested('Parent Mobile Number 1') || getNested('Parent Mobile 1'),
                    parent2: studentData.parent_mobile2 || getNested('Parent Mobile Number 2') || getNested('Parent Mobile 2'),
                    college: studentData.college || getNested('College') || getNested('College Name'),
                    address: studentData.student_address || getNested('Student Address') || getNested('Address'),
                    city: studentData.city_village || getNested('City') || getNested('City/Village'),
                    mandal: studentData.mandal_name || getNested('Mandal'),
                    district: studentData.district || getNested('District'),
                    admission: studentData.admission_date || getNested('Admission Date') || getNested('AdmissionDate'),
                    batch: studentData.batch || getNested('Batch') || getNested('Academic Year')
                };

                // Exact Match Checks (Highest Priority)
                if (lowerKey === 'student_name' || lowerLabel === 'student name' || lowerLabel === 'name') return mappings.name || '';
                if (lowerKey === 'adhar_no' || lowerLabel.includes('adhar') || lowerLabel.includes('aadhar')) return mappings.adhar || '';
                if (lowerKey === 'pin_no' || lowerLabel.includes('pin no') || lowerLabel.includes('roll')) return mappings.pin || '';
                if (lowerKey === 'apaar_id' || lowerKey === 'apaar' || lowerKey === 'appar' || lowerLabel.includes('apaar') || lowerLabel.includes('appar')) return mappings.apaar || '';
                if (lowerKey === 'gender' || lowerLabel.includes('gender') || lowerLabel === 'sex') return mappings.gender || '';
                if (lowerKey === 'course' || lowerLabel.includes('course') || lowerLabel.includes('program')) return mappings.course || '';
                if (lowerKey === 'current_year' || lowerLabel.includes('current year') || lowerKey === 'year') return mappings.year || '';
                if (lowerKey === 'current_semester' || lowerLabel.includes('semester')) return mappings.sem || '';
                if (lowerKey === 'branch' || lowerLabel.includes('branch')) return mappings.branch || '';
                if (lowerKey === 'caste' || lowerLabel.includes('caste') || lowerLabel.includes('category')) return mappings.caste || '';
                if (lowerKey === 'father_name' || lowerLabel.includes('father')) return mappings.father || '';
                if (lowerKey === 'mother_name' || lowerLabel.includes('mother')) return mappings.mother || '';
                if (lowerKey === 'student_mobile' || lowerLabel.includes('student mobile') || lowerLabel === 'mobile') return mappings.mobile || '';
                if (lowerKey === 'parent_mobile1' || lowerLabel.includes('parent mobile 1')) return mappings.parent1 || '';
                if (lowerKey === 'parent_mobile2' || lowerLabel.includes('parent mobile 2')) return mappings.parent2 || '';
                if (lowerKey === 'college') return mappings.college || '';
                if (lowerKey === 'student_address' || lowerLabel.includes('address')) return mappings.address || '';
                if (lowerKey === 'city_village' || lowerLabel === 'city' || lowerLabel === 'village') return mappings.city || '';
                if (lowerKey === 'mandal_name' || lowerLabel === 'mandal') return mappings.mandal || '';
                if (lowerKey === 'district') return mappings.district || '';
                if (lowerKey === 'admission_date' || lowerLabel.includes('admission date')) return mappings.admission || '';
                if (lowerKey === 'batch') return mappings.batch || '';

                if (lowerKey === 'dob' || lowerLabel.includes('date of birth')) {
                    const d = mappings.dob || '';
                    return d ? String(d).substring(0, 10) : '';
                }

                // General Fallback (Check flat studentData then parsedData by key/label)
                if (studentData[key] !== undefined && studentData[key] !== null) return studentData[key];
                if (parsedData[key] !== undefined && parsedData[key] !== null) return parsedData[key];

                const labelValue = getNested(field.label);
                if (labelValue !== null && labelValue !== undefined) return labelValue;

                return '';
            };

            const initialData = {};
            formFields.forEach(field => {
                if (field.type === 'file') return;
                let val = getVal(field);
                if (field.type === 'date' && val) val = String(val).substring(0, 10);

                // APAAR Formatting for initial load (XXXX-XXXX-XXXX)
                const lk = String(field.key || '').toLowerCase();
                const ll = String(field.label || '').toLowerCase();
                if ((lk.includes('apaar') || lk.includes('appar') || ll.includes('apaar') || ll.includes('appar')) && val) {
                    let digits = String(val).replace(/\D/g, '').substring(0, 12);
                    let formatted = '';
                    for (let i = 0; i < digits.length; i++) {
                        if (i > 0 && i % 4 === 0) formatted += '-';
                        formatted += digits[i];
                    }
                    val = formatted;
                }

                initialData[field.key] = val;
            });

            setFormData(initialData);
            setOriginalData(initialData);
        }
    }, [studentData, formFields]);

    // Check if there's an existing pending request
    useEffect(() => {
        const fetchRequests = async () => {
            if (isOpen) {
                try {
                    const res = await api.get('/profile-changes/my-requests');
                    if (res.data?.success && res.data.data) {
                        const pending = res.data.data.find(r => r.status === 'pending');
                        setPendingRequest(pending || null);
                    }
                } catch (err) {
                    console.error('Failed to fetch profile change requests', err);
                }
            }
        };
        fetchRequests();
    }, [isOpen]);

    const handleChange = (e) => {
        let { name, value } = e.target;

        // APAAR ID Formatting (xxxx-xxxx-xxxx)
        const lowerName = String(name).toLowerCase();
        if (lowerName === 'apaar_id' || lowerName.includes('apaar') || lowerName.includes('appar')) {
            let digits = value.replace(/\D/g, '');
            digits = digits.substring(0, 12);
            let formatted = '';
            for (let i = 0; i < digits.length; i++) {
                if (i > 0 && i % 4 === 0) formatted += '-';
                formatted += digits[i];
            }
            value = formatted;
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const hasChanges = () => {
        for (const key in formData) {
            if (formData[key] !== originalData[key]) return true;
        }
        return false;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const changedFields = (function () {
            const changes = {};
            for (const key in formData) {
                if (formData[key] !== originalData[key]) {
                    // Apply gender normalization to changes too
                    if (key === 'gender') {
                        const g = String(formData[key]).toUpperCase();
                        if (g === 'MALE') changes[key] = 'M';
                        else if (g === 'FEMALE') changes[key] = 'F';
                        else changes[key] = 'Other';
                    } else {
                        changes[key] = formData[key];
                    }
                }
            }
            return changes;
        })();

        if (Object.keys(changedFields).length === 0) {
            toast.error('No changes detected');
            return;
        }

        try {
            setIsSubmitting(true);
            const res = await api.post('/profile-changes/request', {
                requested_changes: changedFields
            });

            if (res.data?.success) {
                toast.success('Profile change request submitted successfully. It will be reviewed by admin.');
                setPendingRequest({ status: 'pending', requested_changes: changedFields });
            } else {
                toast.error(res.data?.message || 'Failed to submit request');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit request');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleMarkVerified = async () => {
        try {
            setIsVerifying(true);
            const res = await api.post('/profile-changes/mark-verified', {});
            if (res.data?.success) {
                toast.success('Profile marked as verified!');

                // Need to reload window to update useMemo isVerified instantly in Dashboard
                // Or let the parent handles it. A quick timeout is easiest.
                setTimeout(() => {
                    onClose();
                    window.location.reload();
                }, 1000);
            } else {
                toast.error(res.data?.message || 'Failed to verify profile');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to verify profile');
        } finally {
            setIsVerifying(false);
        }
    };

    if (!isOpen) return null;

    const availableTabs = [
        { id: 'personal', label: 'Personal Data', icon: User, fields: groupedFields.personal },
        { id: 'academic', label: 'Academic Info', icon: GraduationCap, fields: groupedFields.academic },
        { id: 'contact', label: 'Contact Details', icon: Phone, fields: groupedFields.contact },
        { id: 'address', label: 'Address & Location', icon: MapPin, fields: groupedFields.address },
        { id: 'other', label: 'Other', icon: FileText, fields: groupedFields.other },
    ].filter(tab => tab.fields && tab.fields.length > 0);

    // If activeTab is hidden, switch to the first available
    if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
        setActiveTab(availableTabs[0].id);
    }

    const renderField = (field) => {
        if (!field) return null;
        const lowerKey = String(field.key || '').toLowerCase();
        const lowerLabel = String(field.label || '').toLowerCase();

        // Comprehensive check for read only
        const isReadOnly = READ_ONLY_KEYS.includes(lowerKey) ||
            READ_ONLY_KEYS.some(k => lowerLabel.includes(k) && k !== 'student_status');

        const value = formData[field.key] || '';

        return (
            <div className="group mb-5">
                <div className="flex items-center justify-between mb-2 px-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] transition-colors group-focus-within:text-indigo-600">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    {isReadOnly && (
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Lock size={10} /> READ ONLY
                        </span>
                    )}
                </div>

                {field.type === 'textarea' ? (
                    <textarea
                        name={field.key}
                        value={value}
                        onChange={handleChange}
                        disabled={!!pendingRequest || isReadOnly}
                        rows={2}
                        className={`w-full px-4 py-2.5 border rounded-2xl text-[12px] sm:text-[13px] font-bold text-gray-900 transition-all duration-300 outline-none resize-none
                            ${isReadOnly
                                ? 'bg-gray-50/50 border-gray-100 text-gray-400 cursor-not-allowed italic'
                                : !!pendingRequest
                                    ? 'bg-gray-50/50 border-gray-100'
                                    : 'bg-white border-gray-200 hover:border-gray-300 focus:border-indigo-500 focus:ring-[4px] focus:ring-indigo-500/10 shadow-sm'}`}
                    ></textarea>
                ) : field.type === 'select' || field.type === 'radio' ? (
                    <select
                        name={field.key}
                        value={value}
                        onChange={handleChange}
                        disabled={!!pendingRequest || isReadOnly}
                        className={`w-full px-4 py-2.5 border rounded-2xl text-[12px] sm:text-[13px] font-bold text-gray-900 transition-all duration-300 outline-none appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207L10%2012L15%207%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:16px_16px] bg-[right_1rem_center] bg-no-repeat
                            ${isReadOnly
                                ? 'bg-gray-50/50 border-gray-100 text-gray-400 cursor-not-allowed italic'
                                : !!pendingRequest
                                    ? 'bg-gray-50/50 border-gray-100'
                                    : 'bg-white border-gray-200 hover:border-gray-300 focus:border-indigo-500 focus:ring-[4px] focus:ring-indigo-500/10 shadow-sm'}`}
                    >
                        <option value="">Select an option</option>
                        {(field.options || []).map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        type={field.type === 'date' ? 'date' : 'text'}
                        name={field.key}
                        value={value}
                        onChange={handleChange}
                        disabled={!!pendingRequest || isReadOnly}
                        className={`w-full px-4 py-2.5 border rounded-2xl text-[12px] sm:text-[13px] font-bold text-gray-900 transition-all duration-300 outline-none
                            ${isReadOnly
                                ? 'bg-gray-50/50 border-gray-100 text-gray-400 cursor-not-allowed italic'
                                : !!pendingRequest
                                    ? 'bg-gray-50/50 border-gray-100'
                                    : 'bg-white border-gray-200 hover:border-gray-300 focus:border-indigo-500 focus:ring-[4px] focus:ring-indigo-500/10 shadow-sm'}`}
                    />
                )}
            </div>
        );
    };

    const modalContent = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-6 bg-black/40 backdrop-blur-md animate-fade-in custom-scrollbar overflow-y-auto">
            <div className="bg-white sm:rounded-[24px] rounded-none shadow-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[85vh] max-w-5xl flex flex-col relative my-auto sm:border border-white/20 overflow-hidden"
                onClick={(e) => e.stopPropagation()}>

                {/* Header Section */}
                <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 px-4 sm:px-8 py-4 sm:py-6 shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4"></div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 relative z-10 pr-8 sm:pr-0">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="relative group shrink-0">
                                <div className="h-12 w-12 sm:h-20 sm:w-20 rounded-[14px] sm:rounded-2xl border-2 sm:border-[3px] border-white/20 bg-white shadow-xl overflow-hidden flex items-center justify-center relative">
                                    {studentData?.student_photo ? (
                                        <img
                                            src={studentData.student_photo}
                                            alt={studentData.student_name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <User className="text-gray-300 w-6 h-6 sm:w-8 sm:h-8" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight heading-font">Profile Verification</h2>
                                <p className="text-[10px] sm:text-sm font-medium text-indigo-100 mt-0.5 sm:mt-1 flex items-center gap-2 leading-snug">
                                    Compare your official records and request changes if needed.
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="absolute right-0 top-0 sm:relative p-1.5 sm:p-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition-all text-white/70 hover:text-white backdrop-blur group active:scale-95">
                            <X size={18} className="sm:h-5 sm:w-5 group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                </div>

                {/* Status Banners */}
                <div className="px-4 sm:px-8 pt-4 sm:pt-6 pb-2 shrink-0 bg-gray-50/50">
                    {pendingRequest && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-4 shadow-sm items-start">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                <Clock className="text-indigo-600" size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-indigo-900 text-sm">Change Request Pending</h4>
                                <p className="text-sm text-indigo-700/80 mt-1 font-medium leading-relaxed">
                                    A request to update your profile is currently under review by the administration. You will be notified once it is processed.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[250px] sm:min-h-[350px]">
                    {/* Sidebar Tabs */}
                    <div className="w-full md:w-64 shrink-0 border-r border-gray-100 bg-gray-50/50 p-6 overflow-y-auto no-scrollbar hidden md:block">
                        {loadingConfig ? (
                            <div className="animate-pulse space-y-4">
                                {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-gray-200 rounded-xl"></div>)}
                            </div>
                        ) : (
                            <nav className="space-y-2">
                                {availableTabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${activeTab === tab.id
                                            ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/60'
                                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <tab.icon size={18} className={activeTab === tab.id ? 'text-indigo-500' : 'text-gray-400'} />
                                            {tab.label}
                                        </div>
                                        {activeTab === tab.id && <ChevronRight size={16} className="text-indigo-400" />}
                                    </button>
                                ))}
                            </nav>
                        )}

                        <div className="mt-8 pt-8 border-t border-gray-200/60">
                            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-4 rounded-2xl border border-indigo-100/50">
                                <h5 className="font-bold text-indigo-900 text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Users size={12} /> Support
                                </h5>
                                <p className="text-xs text-indigo-800/70 leading-relaxed font-medium">
                                    If you are unable to change a restricted field (like Branch or Course), please contact the administration office directly.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Tabs */}
                    <div className="md:hidden flex flex-col border-b border-gray-100 bg-gray-50/50 shrink-0">
                        {/* Progress Steps Indicator */}
                        <div className="px-4 pt-4 pb-4">
                            <div className="flex items-center justify-between relative">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 rounded-full"></div>
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${(availableTabs.findIndex(t => t.id === activeTab) / (availableTabs.length - 1)) * 100}%` }}></div>
                                {availableTabs.map((tab, idx) => {
                                    const isActive = tab.id === activeTab;
                                    const isPast = availableTabs.findIndex(t => t.id === activeTab) > idx;
                                    return (
                                        <div
                                            key={`step-${tab.id}`}
                                            className="relative z-10 bg-gray-50/50 px-1 cursor-pointer"
                                            onClick={() => setActiveTab(tab.id)}
                                        >
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-110' : isPast ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'bg-white border-gray-300 text-gray-400'}`}>
                                                {isPast ? <Check size={12} /> : (idx + 1)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="text-center mt-3">
                                <span className="text-xs font-bold text-indigo-900">{availableTabs.find(t => t.id === activeTab)?.label}</span>
                                <span className="text-[10px] text-gray-500 ml-1">Step {availableTabs.findIndex(t => t.id === activeTab) + 1} of {availableTabs.length}</span>
                            </div>
                        </div>
                    </div>

                    {/* Form Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 bg-white relative pb-32 sm:pb-8">
                        {loadingConfig ? (
                            <div className="animate-pulse space-y-6">
                                <div className="h-6 w-1/3 bg-gray-200 rounded"></div>
                                <div className="grid grid-cols-2 gap-6">
                                    {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg"></div>)}
                                </div>
                            </div>
                        ) : (
                            <form id="profile-verify-form" onSubmit={handleSubmit}>
                                {availableTabs.map(tab => (
                                    <div key={tab.id} className={`space-y-6 ${activeTab === tab.id ? 'block animate-fade-in' : 'hidden'}`}>
                                        <div className="border-b border-gray-100 pb-4 mb-6">
                                            <h3 className="text-lg font-black text-gray-900 heading-font">{tab.label}</h3>
                                            <p className="text-sm font-medium text-gray-500">Edit or review these fields.</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {tab.fields.map((field, idx) => (
                                                <div key={idx} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                                                    {renderField(field)}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Mobile Navigation Buttons (Next / Prev) */}
                                        <div className="md:hidden flex items-center justify-between pt-6 pb-2 border-t border-gray-100 mt-6 md:mt-0 md:border-t-0 md:pt-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const currentIndex = availableTabs.findIndex(t => t.id === activeTab);
                                                    if (currentIndex > 0) setActiveTab(availableTabs[currentIndex - 1].id);
                                                    document.querySelector('.custom-scrollbar').scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                                className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${availableTabs.findIndex(t => t.id === activeTab) === 0 ? 'invisible' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                Previous
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const currentIndex = availableTabs.findIndex(t => t.id === activeTab);
                                                    if (currentIndex < availableTabs.length - 1) setActiveTab(availableTabs[currentIndex + 1].id);
                                                    document.querySelector('.custom-scrollbar').scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                                className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:shadow-lg flex items-center gap-2 ${availableTabs.findIndex(t => t.id === activeTab) === availableTabs.length - 1 ? 'hidden' : 'flex'}`}
                                            >
                                                Next Step <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </form>
                        )}
                    </div>
                </div>

                {/* Footer - Inline Mobile Buttons */}
                <div className="p-4 sm:p-6 pb-[40px] sm:pb-6 border-t border-gray-100 shrink-0 bg-white flex flex-col sm:flex-row items-center justify-between sm:rounded-b-[24px] gap-4 mb-20 sm:mb-0 mt-auto">
                    <p className="text-xs font-semibold text-gray-400 hidden lg:block">Secure Profile Verification</p>

                    {/* Action Buttons */}
                    <div className="flex flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto shrink-0">
                        {/* Verify Button */}
                        {!pendingRequest && (
                            <button
                                type="button"
                                onClick={handleMarkVerified}
                                disabled={hasChanges() || isVerifying || loadingConfig}
                                className={`flex-1 sm:flex-none px-2 sm:px-8 py-2.5 sm:py-3 text-[11px] sm:text-sm font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-all outline-none focus:ring-4 active:scale-[0.98] shrink-0 ${!hasChanges() && !loadingConfig && !isVerifying
                                    ? 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 hover:shadow-md hover:-translate-y-0.5 focus:ring-emerald-500/30'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                    }`}
                            >
                                <Check className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
                                <span className="whitespace-nowrap truncate">{isVerifying ? 'Verifying...' : 'Verified'}</span>
                            </button>
                        )}

                        {/* Submit Button */}
                        {!pendingRequest ? (
                            <button
                                type="submit"
                                form="profile-verify-form"
                                disabled={!hasChanges() || isSubmitting || loadingConfig}
                                className={`flex-1 sm:flex-none px-2 sm:px-8 py-2.5 sm:py-3 text-[11px] sm:text-sm font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-all outline-none focus:ring-4 active:scale-[0.98] ${hasChanges() && !isSubmitting
                                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:shadow-lg hover:shadow-indigo-500/20 hover:-translate-y-0.5 focus:ring-indigo-500/30'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                    }`}
                            >
                                <Save className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
                                <span className="whitespace-nowrap truncate">{isSubmitting ? 'Sending...' : 'Submit'}</span>
                            </button>
                        ) : (
                            <div className="flex-1 sm:flex-none px-2 sm:px-8 py-2.5 sm:py-3 text-[11px] sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 bg-indigo-50 text-indigo-500 border border-indigo-100 shadow-inner truncate">
                                <CheckCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" /> <span className="whitespace-nowrap">Pending</span>
                            </div>
                        )}

                        {/* Close Button */}
                        <button type="button" onClick={onClose} className="px-5 sm:px-6 py-2.5 sm:py-3 text-[11px] sm:text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all outline-none focus:ring-4 focus:ring-gray-100 text-center active:scale-[0.98] shrink-0">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default VerifyProfileDialog;
