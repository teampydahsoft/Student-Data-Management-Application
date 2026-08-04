import React, { useState, useEffect, useRef } from 'react';
import { Users, ChevronDown, Check, X } from 'lucide-react';
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
    // ... (state vars same as before) ...
    // Note: I need to preserve the state variables in the replacement, but the tool requires me to provide the logic.
    // I will target the Return statement specifically to avoid re-writing the whole state logic if possible.
    // However, I need to update the props in the function definition.
    // So I must replace the definition line and the return block.
    // This tool call suggests replacing a chunk. I'll replace the top definition and the return block separately? No, I can't do multiple chunks easily with "replace_file_content" unless I use "multi_replace".
    // I will use "replace_file_content" for the whole component function body if needed, or just the relevant parts if I can match them.
    // Re-reading usage: "Use multi_replace_file_content... for multiple non-contiguous edits".
    // I will use `multi_replace_file_content`.

    // Wait, the prompt says "Use this tool ONLY when you are making a SINGLE CONTIGUOUS block of edits".
    // I need to update the prop list at top vs the JSX at bottom. They are far apart.
    // I should use `multi_replace_file_content`.

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
              collegeId: c.collegeId,  // API returns camelCase collegeId
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
            // Clear any selected courses that are no longer available
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
                // Skip count calculation if row layout as it is mainly for search filtering
                if (layout === 'row') return;

                const response = await api.post('/announcements/count', {
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
        <div className="space-y-4 bg-gray-50 p-6 rounded-xl border border-gray-100 h-full">
            <div className="flex justify-between items-center">
                {!hideTitle && (
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 mb-2">
                        <Users size={16} /> Target Audience
                    </h3>
                )}
                <div className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full ml-auto">
                    Est. Recipients: {recipientCount}
                </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Leave fields empty to target everyone.</p>

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
    );
};

export default TargetSelector;
