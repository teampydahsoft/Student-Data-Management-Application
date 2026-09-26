import React, { useState, useEffect, useRef } from 'react';
import { Users, ChevronDown, Check, X, Loader2 } from 'lucide-react';
import api from '../config/api';

const MultiSelect = ({ label, options, selected, onChange, placeholder, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (value) => {
        const safeSelected = Array.isArray(selected) ? selected : [];
        const newSelected = safeSelected.includes(value)
            ? safeSelected.filter(item => item !== value)
            : [...safeSelected, value];
        onChange(newSelected);
    };

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
            <button
                type="button"
                className={`w-full p-2 text-left border rounded-lg flex justify-between items-center text-sm ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-400'}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                <span className={`truncate ${Array.isArray(selected) && selected.length === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
                    {Array.isArray(selected) && selected.length === 0 ? placeholder : `${Array.isArray(selected) ? selected.length : 0} selected`}
                </span>
                <ChevronDown size={14} className="text-gray-400" />
            </button>

            {isOpen && !disabled && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {options.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500 text-center">No options available</div>
                    ) : (
                        options.map(option => (
                            <div
                                key={option.value}
                                className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer text-sm"
                                onClick={() => toggleOption(option.value)}
                            >
                                <div className={`w-4 h-4 border rounded flex items-center justify-center ${selected.includes(option.value) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                    {selected.includes(option.value) && <Check size={10} className="text-white" />}
                                </div>
                                <span className="text-gray-700">{option.label}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {Array.isArray(selected) && selected.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                    {selected.slice(0, 5).map(val => (
                        <span key={val} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100 flex items-center gap-1">
                            {options.find(o => o.value === val)?.label || val}
                            <button type="button" onClick={() => toggleOption(val)} className="hover:text-blue-900"><X size={10} /></button>
                        </span>
                    ))}
                    {selected.length > 5 && <span className="text-xs text-gray-500 py-0.5">+{selected.length - 5} more</span>}
                </div>
            )}
        </div>
    );
};

const TargetSelector = ({ formData, setFormData, layout = 'column', hideTitle = false }) => {
    const [colleges, setColleges] = useState([]);
    const [batches, setBatches] = useState([]);
    const [courses, setCourses] = useState([]);
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [semesters, setSemesters] = useState([]);

    const [availableCourses, setAvailableCourses] = useState([]);
    const [availableBranches, setAvailableBranches] = useState([]);
    const [availableYears, setAvailableYears] = useState([]);
    const [availableSemesters, setAvailableSemesters] = useState([]);
    const [recipientCount, setRecipientCount] = useState(0);

    const [studentSearch, setStudentSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const targetType = formData.target_type || 'filters';
    const selectedStudents = formData.selected_students || [];

    useEffect(() => {
        if (!studentSearch || studentSearch.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.get(`/students?search=${encodeURIComponent(studentSearch.trim())}&limit=10&lite=true`);
                if (res.data?.success) {
                    setSearchResults(res.data.data || []);
                }
            } catch (err) {
                console.error('Student search failed:', err);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [studentSearch]);

    const handleTargetTypeChange = (type) => {
        setFormData(prev => ({ ...prev, target_type: type }));
    };

    const handleAddStudent = (student) => {
        const exists = selectedStudents.some(s => s.id === student.id);
        if (!exists) {
            const newSelected = [...selectedStudents, student];
            setFormData(prev => ({
                ...prev,
                selected_students: newSelected,
                selected_student_ids: newSelected.map(s => s.id)
            }));
        }
    };

    const handleRemoveStudent = (studentId) => {
        const newSelected = selectedStudents.filter(s => s.id !== studentId);
        setFormData(prev => ({
            ...prev,
            selected_students: newSelected,
            selected_student_ids: newSelected.map(s => s.id)
        }));
    };

    useEffect(() => {
        fetchMetadata();
    }, []);

    const fetchMetadata = async () => {
        try {
            const [colRes, batchRes, courRes, branchRes, yearRes, semRes] = await Promise.all([
                api.get('/colleges'),
                api.get('/announcements/batches').catch(() => ({ data: { success: false, data: [] } })),
                api.get('/courses'),
                api.get('/announcements/branches').catch(() => ({ data: { success: false, data: [] } })),
                api.get('/announcements/years').catch(() => ({ data: { success: false, data: [] } })),
                api.get('/announcements/semesters').catch(() => ({ data: { success: false, data: [] } }))
            ]);

            if (colRes.data.success) setColleges(colRes.data.data.map(c => ({ value: c.name, label: c.name, id: c.id })));
            if (batchRes.data.success) setBatches(batchRes.data.data.map(b => ({ value: b.name, label: b.name, id: b.id })));
            if (courRes.data.success) setCourses(courRes.data.data.map(c => ({ 
              value: c.name, 
              label: c.name + (c.level ? ` (${c.level.toUpperCase()})` : ''), 
              collegeId: c.collegeId,
              id: c.id,
              level: c.level
            })));
            if (branchRes.data.success) setBranches(branchRes.data.data.map(b => ({ value: b.name, label: b.name, courseId: b.course_id })));
            if (yearRes.data.success) setYears(yearRes.data.data.map(y => ({ value: y.name, label: `${y.name} Year`, batchId: y.batch_id })));
            if (semRes.data.success) setSemesters(semRes.data.data.map(s => ({ value: s.name, label: `Semester ${s.name}`, batchId: s.batch_id })));
        } catch (error) {
            console.error('Metadata fetch failed', error);
        }
    };

    useEffect(() => {
        if (formData.target_college.length === 0) {
            setAvailableCourses(courses);
        } else {
            const selectedCollegeIds = colleges
                .filter(c => formData.target_college.includes(c.value))
                .map(c => c.id);
            const filtered = courses.filter(c => selectedCollegeIds.includes(c.collegeId));
            setAvailableCourses(filtered);
            const filteredValues = filtered.map(c => c.value);
            const validSelectedCourses = (formData.target_course || []).filter(v => filteredValues.includes(v));
            if (validSelectedCourses.length !== (formData.target_course || []).length) {
                setFormData(prev => ({ ...prev, target_course: validSelectedCourses, target_branch: [] }));
            }
        }
    }, [formData.target_college, courses, colleges]);

    useEffect(() => {
        if (formData.target_course.length === 0) {
            setAvailableBranches(branches);
        } else {
            const selectedCourseNames = formData.target_course;
            const filtered = branches.filter(b => selectedCourseNames.includes(b.courseId));
            setAvailableBranches(filtered);
        }
    }, [formData.target_course, courses, branches]);

    useEffect(() => {
        if (formData.target_batch.length === 0) {
            const distinctYears = [...new Map(years.map(item => [item.value, item])).values()];
            const distinctSems = [...new Map(semesters.map(item => [item.value, item])).values()];
            setAvailableYears(distinctYears);
            setAvailableSemesters(distinctSems);
        } else {
            const selectedBatches = formData.target_batch;
            const filteredYears = years.filter(y => selectedBatches.includes(y.batchId));
            setAvailableYears([...new Map(filteredYears.map(item => [item.value, item])).values()]);
            const filteredSems = semesters.filter(s => selectedBatches.includes(s.batchId));
            setAvailableSemesters([...new Map(filteredSems.map(item => [item.value, item])).values()]);
        }
    }, [formData.target_batch, years, semesters]);

    useEffect(() => {
        const calculateCount = async () => {
            try {
                if (layout === 'row') return;

                if (formData.target_type === 'individual') {
                    setRecipientCount((formData.selected_students || []).length);
                    return;
                }

                const response = await api.post('/announcements/count', {
                    target_type: formData.target_type,
                    selected_student_ids: (formData.selected_students || []).map(s => s.id),
                    target_college: formData.target_college,
                    target_batch: formData.target_batch,
                    target_course: formData.target_course,
                    target_branch: formData.target_branch,
                    target_year: formData.target_year,
                    target_semester: formData.target_semester
                });
                if (response.data.success) setRecipientCount(response.data.count);
            } catch (error) { console.error("Failed to calculate count", error); }
        };
        const timer = setTimeout(calculateCount, 500);
        return () => clearTimeout(timer);
    }, [formData, layout]);

    if (layout === 'row') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <MultiSelect
                    label="College"
                    placeholder="All"
                    options={colleges}
                    selected={formData.target_college}
                    onChange={vals => setFormData({ ...formData, target_college: vals })}
                />
                <MultiSelect
                    label="Batch"
                    placeholder="All"
                    options={batches}
                    selected={formData.target_batch}
                    onChange={vals => setFormData({ ...formData, target_batch: vals })}
                />
                <MultiSelect
                    label="Program"
                    placeholder="All"
                    options={availableCourses}
                    selected={formData.target_course}
                    onChange={vals => setFormData({ ...formData, target_course: vals })}
                />
                <MultiSelect
                    label="Branch"
                    placeholder="All"
                    options={availableBranches}
                    selected={formData.target_branch}
                    onChange={vals => setFormData({ ...formData, target_branch: vals })}
                />
                <MultiSelect
                    label="Year"
                    placeholder="All"
                    options={availableYears}
                    selected={formData.target_year}
                    onChange={vals => setFormData({ ...formData, target_year: vals })}
                />
                <MultiSelect
                    label="Semester"
                    placeholder="All"
                    options={availableSemesters}
                    selected={formData.target_semester}
                    onChange={vals => setFormData({ ...formData, target_semester: vals })}
                />
            </div>
        );
    }

    // Default vertical layout
    return (
        <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 h-full flex flex-col min-h-0 space-y-2.5">
            <div className="flex justify-between items-center shrink-0">
                {!hideTitle && (
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Users size={14} /> Target Audience
                    </h3>
                )}
                <div className="text-[11px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-auto">
                    Est. Recipients: {recipientCount}
                </div>
            </div>

            {/* Mode Selector Toggle */}
            <div className="flex rounded-lg border border-gray-200 p-0.5 bg-white shadow-2xs shrink-0">
                <button
                    type="button"
                    onClick={() => handleTargetTypeChange('filters')}
                    className={`flex-1 py-1 px-2 rounded-md text-[11px] font-semibold transition-all ${
                        targetType !== 'individual'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                    Target By Filters
                </button>
                <button
                    type="button"
                    onClick={() => handleTargetTypeChange('individual')}
                    className={`flex-1 py-1 px-2 rounded-md text-[11px] font-semibold transition-all ${
                        targetType === 'individual'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                    Individual Students {selectedStudents.length > 0 && `(${selectedStudents.length})`}
                </button>
            </div>

            {targetType === 'individual' ? (
                <div className="flex-1 min-h-0 flex flex-col space-y-2">
                    {/* Search Field */}
                    <div className="relative shrink-0">
                        <div className="flex justify-between items-center mb-0.5">
                            <label className="block text-[11px] font-semibold text-gray-700">Search Student</label>
                            <span className="text-[10px] text-gray-400">Search by name or admission no.</span>
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full py-1.5 px-2.5 pr-7 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-2xs font-medium"
                                placeholder="Type student name or adm no..."
                                value={studentSearch}
                                onChange={(e) => setStudentSearch(e.target.value)}
                            />
                            {studentSearch ? (
                                <button
                                    type="button"
                                    onClick={() => { setStudentSearch(''); setSearchResults([]); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                                >
                                    <X size={13} />
                                </button>
                            ) : (
                                searching && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                        <Loader2 size={14} className="animate-spin text-blue-500" />
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* Selected Students Chips Container */}
                    {selectedStudents.length > 0 && (
                        <div className="shrink-0 bg-white border border-gray-200 rounded-lg p-2">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                                    Selected ({selectedStudents.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, selected_students: [], selected_student_ids: [] }))}
                                    className="text-[10px] text-red-600 hover:underline font-semibold"
                                >
                                    Remove All
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-0.5">
                                {selectedStudents.map((s) => (
                                    <span
                                        key={s.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-800 text-[11px] rounded-md border border-blue-100 font-medium"
                                    >
                                        <span className="truncate max-w-[130px]">{s.student_name || s.admission_number}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveStudent(s.id)}
                                            className="hover:text-red-600 p-0.5 rounded-full hover:bg-blue-100 transition-colors"
                                        >
                                            <X size={11} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Inline Search Results Container — Compact row height & Select All */}
                    <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden shadow-2xs">
                        <div className="px-2.5 py-1.5 bg-gray-50 border-b text-[11px] font-semibold text-gray-600 flex justify-between items-center shrink-0">
                            <span>Results {searchResults.length > 0 && `(${searchResults.length})`}</span>
                            {searchResults.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const currentIds = new Set(selectedStudents.map(s => s.id));
                                        const allAdded = searchResults.every(s => currentIds.has(s.id));
                                        if (allAdded) {
                                            // Remove search results from selected
                                            const searchResultIds = new Set(searchResults.map(s => s.id));
                                            const newSelected = selectedStudents.filter(s => !searchResultIds.has(s.id));
                                            setFormData(prev => ({
                                                ...prev,
                                                selected_students: newSelected,
                                                selected_student_ids: newSelected.map(s => s.id)
                                            }));
                                        } else {
                                            // Add all search results
                                            const toAdd = searchResults.filter(s => !currentIds.has(s.id));
                                            const newSelected = [...selectedStudents, ...toAdd];
                                            setFormData(prev => ({
                                                ...prev,
                                                selected_students: newSelected,
                                                selected_student_ids: newSelected.map(s => s.id)
                                            }));
                                        }
                                    }}
                                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                >
                                    {searchResults.every(s => selectedStudents.some(sel => sel.id === s.id))
                                        ? 'Deselect All'
                                        : '+ Select All'}
                                </button>
                            )}
                            {searching && searchResults.length === 0 && (
                                <span className="text-[10px] text-blue-600 font-normal">Searching…</span>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                            {searching && searchResults.length === 0 ? (
                                <div className="flex items-center justify-center py-6 text-[11px] text-gray-400 gap-2">
                                    <Loader2 size={14} className="animate-spin text-blue-500" /> Searching students...
                                </div>
                            ) : searchResults.length === 0 ? (
                                <div className="p-4 text-center text-[11px] text-gray-400">
                                    {studentSearch.trim().length >= 2
                                        ? 'No matching students found.'
                                        : 'Type at least 2 characters above to search students.'}
                                </div>
                            ) : (
                                searchResults.map((s) => {
                                    const isAdded = selectedStudents.some(sel => sel.id === s.id);
                                    return (
                                        <div
                                            key={s.id}
                                            className={`py-1.5 px-2.5 flex items-center justify-between hover:bg-blue-50/50 transition-colors ${
                                                isAdded ? 'bg-gray-50/80' : ''
                                            }`}
                                        >
                                            <div className="min-w-0 flex-1 pr-2">
                                                <div className="font-bold text-xs text-gray-900 truncate">
                                                    {s.student_name || 'No Name'}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                                    <span>Adm: <strong className="font-mono text-blue-600">{s.admission_number}</strong></span>
                                                    <span>•</span>
                                                    <span className="truncate">{s.course} ({s.branch || '-'})</span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleAddStudent(s)}
                                                disabled={isAdded}
                                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all shrink-0 ${
                                                    isAdded
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-2xs active:scale-95'
                                                }`}
                                            >
                                                {isAdded ? 'Added ✓' : '+ Add'}
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    <p className="text-xs text-slate-500">Leave fields empty to target everyone.</p>

                    <div className="space-y-4">
                        <MultiSelect
                            label="Colleges"
                            placeholder="All Colleges"
                            options={colleges}
                            selected={formData.target_college}
                            onChange={vals => setFormData({ ...formData, target_college: vals })}
                        />
                        <MultiSelect
                            label="Batches"
                            placeholder="All Batches"
                            options={batches}
                            selected={formData.target_batch}
                            onChange={vals => setFormData({ ...formData, target_batch: vals })}
                        />
                    </div>
                    <MultiSelect
                        label="Programs"
                        placeholder="All Programs"
                        options={availableCourses}
                        selected={formData.target_course}
                        onChange={vals => setFormData({ ...formData, target_course: vals })}
                    />
                    <MultiSelect
                        label="Branches"
                        placeholder="All Branches"
                        options={availableBranches}
                        selected={formData.target_branch}
                        onChange={vals => setFormData({ ...formData, target_branch: vals })}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <MultiSelect
                            label="Years"
                            placeholder="All Years"
                            options={availableYears}
                            selected={formData.target_year}
                            onChange={vals => setFormData({ ...formData, target_year: vals })}
                        />
                        <MultiSelect
                            label="Semesters"
                            placeholder="All Semesters"
                            options={availableSemesters}
                            selected={formData.target_semester}
                            onChange={vals => setFormData({ ...formData, target_semester: vals })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TargetSelector;
