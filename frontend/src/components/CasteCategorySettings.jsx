import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Tags,
  X,
  AlertTriangle,
  Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';
import { SkeletonList } from './SkeletonLoader';

/**
 * Compact two-panel caste manager: pick a category, manage its castes.
 */
export default function CasteCategorySettings({ readOnly = false }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCasteName, setNewCasteName] = useState('');
  const [creatingCaste, setCreatingCaste] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [editingCasteId, setEditingCasteId] = useState(null);
  const [casteDraft, setCasteDraft] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [blockedDeleteModal, setBlockedDeleteModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    students: [],
    totalCount: 0,
    hasMore: false
  });

  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const openBlockedDeleteModal = (payload = {}) => {
    setBlockedDeleteModal({
      isOpen: true,
      title: payload.title || 'Cannot Delete',
      message: payload.message || 'This item is assigned to students.',
      students: payload.students || [],
      totalCount: payload.totalCount || 0,
      hasMore: Boolean(payload.hasMore)
    });
  };

  const closeBlockedDeleteModal = () => {
    setBlockedDeleteModal({
      isOpen: false,
      title: '',
      message: '',
      students: [],
      totalCount: 0,
      hasMore: false
    });
  };

  const handleDeleteBlockedError = (error, fallbackTitle) => {
    const data = error.response?.data || {};
    if (error.response?.status === 409 && Array.isArray(data.students) && data.students.length > 0) {
      openBlockedDeleteModal({
        title: fallbackTitle,
        message: data.message,
        students: data.students,
        totalCount: data.totalCount || data.students.length,
        hasMore: data.hasMore
      });
      return;
    }
    toast.error(data.message || 'Failed to delete');
  };

  const fetchCategories = async ({ silent = false, preferCategoryId = null } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await api.get('/caste-categories?includeInactive=true');
      const data = response.data.data || [];
      setCategories(data);

      setSelectedCategoryId((prev) => {
        const preferred = preferCategoryId ?? prev;
        if (preferred && data.some((cat) => cat.id === preferred)) return preferred;
        return data[0]?.id ?? null;
      });

      return data;
    } catch (error) {
      console.error('Failed to fetch caste categories', error);
      if (!silent) {
        toast.error(error.response?.data?.message || 'Failed to fetch caste categories');
      }
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) {
      toast.error('Category name is required');
      return;
    }
    try {
      setCreatingCategory(true);
      const response = await api.post('/caste-categories', { name, isActive: true });
      toast.success('Category created');
      setNewCategoryName('');
      const createdId = response.data?.data?.id;
      await fetchCategories({ silent: true, preferCategoryId: createdId });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create category');
    } finally {
      setCreatingCategory(false);
    }
  };

  const startEditCategory = (category) => {
    setEditingCategoryId(category.id);
    setCategoryDraft(category.name);
  };

  const saveCategory = async (categoryId) => {
    const name = categoryDraft.trim();
    if (!name) {
      toast.error('Category name is required');
      return;
    }
    try {
      setSavingKey(`cat-${categoryId}`);
      await api.put(`/caste-categories/${categoryId}`, { name });
      toast.success('Category updated');
      setEditingCategoryId(null);
      await fetchCategories({ silent: true, preferCategoryId: categoryId });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update category');
    } finally {
      setSavingKey(null);
    }
  };

  const toggleCategoryActive = async (category) => {
    try {
      setSavingKey(`cat-${category.id}`);
      await api.put(`/caste-categories/${category.id}`, { isActive: !category.isActive });
      toast.success(`Category ${!category.isActive ? 'activated' : 'deactivated'}`);
      await fetchCategories({ silent: true, preferCategoryId: category.id });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update category');
    } finally {
      setSavingKey(null);
    }
  };

  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}" and all its castes?`)) return;
    try {
      setSavingKey(`cat-${category.id}`);
      await api.delete(`/caste-categories/${category.id}`);
      toast.success('Category deleted');
      setEditingCategoryId(null);
      await fetchCategories({ silent: true });
    } catch (error) {
      handleDeleteBlockedError(error, `Cannot delete category "${category.name}"`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleCreateCaste = async (event) => {
    event?.preventDefault?.();
    if (!selectedCategory) return;
    const name = newCasteName.trim();
    if (!name) {
      toast.error('Caste name is required');
      return;
    }
    try {
      setCreatingCaste(true);
      await api.post(`/caste-categories/${selectedCategory.id}/castes`, { name, isActive: true });
      toast.success('Caste created');
      setNewCasteName('');
      await fetchCategories({ silent: true, preferCategoryId: selectedCategory.id });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create caste');
    } finally {
      setCreatingCaste(false);
    }
  };

  const startEditCaste = (caste) => {
    setEditingCasteId(caste.id);
    setCasteDraft(caste.name);
  };

  const saveCaste = async (casteId) => {
    if (!selectedCategory) return;
    const name = casteDraft.trim();
    if (!name) {
      toast.error('Caste name is required');
      return;
    }
    try {
      setSavingKey(`caste-${casteId}`);
      await api.put(`/caste-categories/${selectedCategory.id}/castes/${casteId}`, { name });
      toast.success('Caste updated');
      setEditingCasteId(null);
      await fetchCategories({ silent: true, preferCategoryId: selectedCategory.id });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update caste');
    } finally {
      setSavingKey(null);
    }
  };

  const toggleCasteActive = async (caste) => {
    if (!selectedCategory) return;
    try {
      setSavingKey(`caste-${caste.id}`);
      await api.put(`/caste-categories/${selectedCategory.id}/castes/${caste.id}`, {
        isActive: !caste.isActive
      });
      toast.success(`Caste ${!caste.isActive ? 'activated' : 'deactivated'}`);
      await fetchCategories({ silent: true, preferCategoryId: selectedCategory.id });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update caste');
    } finally {
      setSavingKey(null);
    }
  };

  const deleteCaste = async (caste) => {
    if (!selectedCategory) return;
    if (!window.confirm(`Delete caste "${caste.name}"?`)) return;
    try {
      setSavingKey(`caste-${caste.id}`);
      await api.delete(`/caste-categories/${selectedCategory.id}/castes/${caste.id}`);
      toast.success('Caste deleted');
      setEditingCasteId(null);
      await fetchCategories({ silent: true, preferCategoryId: selectedCategory.id });
    } catch (error) {
      handleDeleteBlockedError(error, `Cannot delete caste "${caste.name}"`);
    } finally {
      setSavingKey(null);
    }
  };

  const totalCastes = categories.reduce((sum, cat) => sum + (cat.castes?.length || 0), 0);
  const selectedCastes = selectedCategory?.castes || [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3 bg-slate-50 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Tags size={18} className="text-amber-600" />
            Caste Categories
          </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Empty by default — create categories and castes here. Students link via caste_id on create/update only.
            </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
          {categories.length} · {totalCastes}
        </span>
      </div>

      {loading ? (
        <div className="p-4">
          <SkeletonList count={4} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[240px,1fr] min-h-[360px]">
          {/* Categories panel */}
          <div className="border-b md:border-b-0 md:border-r border-gray-100 flex flex-col">
            {!readOnly && (
              <form onSubmit={handleCreateCategory} className="p-3 border-b border-gray-100 space-y-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <Plus size={14} />
                  Add Category
                </button>
              </form>
            )}

            <div className="flex-1 overflow-y-auto max-h-[280px] md:max-h-[420px] p-2 space-y-1">
              {categories.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm font-medium text-gray-600">No categories yet</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {readOnly
                      ? 'Ask an admin to add categories in Settings.'
                      : 'Add a category above, then add castes under it.'}
                  </p>
                </div>
              ) : (
                categories.map((category) => {
                  const isSelected = category.id === selectedCategoryId;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(category.id);
                        setEditingCategoryId(null);
                        setEditingCasteId(null);
                      }}
                      className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                        isSelected
                          ? 'bg-amber-50 border border-amber-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold truncate ${isSelected ? 'text-amber-900' : 'text-gray-800'}`}>
                          {category.name}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {(category.castes || []).length}
                        </span>
                      </div>
                      <span
                        className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          category.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {category.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Castes panel */}
          <div className="flex flex-col min-w-0">
            {!selectedCategory ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-1">
                <p className="text-sm font-medium text-gray-600">
                  {categories.length === 0 ? 'Start by adding a category' : 'Select a category'}
                </p>
                <p className="text-xs text-gray-400">
                  {categories.length === 0
                    ? 'Then add castes under that category — nothing is preloaded.'
                    : 'Manage castes for the selected category.'}
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {editingCategoryId === selectedCategory.id && !readOnly ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={categoryDraft}
                          onChange={(e) => setCategoryDraft(e.target.value)}
                          className="rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => saveCategory(selectedCategory.id)}
                          disabled={savingKey === `cat-${selectedCategory.id}`}
                          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(null)}
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          {selectedCategory.name}
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            {selectedCastes.length} caste{selectedCastes.length === 1 ? '' : 's'}
                          </span>
                        </h3>
                      </div>
                    )}
                  </div>

                  {!readOnly && editingCategoryId !== selectedCategory.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditCategory(selectedCategory)}
                        className="p-1.5 text-gray-400 hover:text-amber-600"
                        title="Edit category"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCategoryActive(selectedCategory)}
                        disabled={savingKey === `cat-${selectedCategory.id}`}
                        className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        title={selectedCategory.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {selectedCategory.isActive ? (
                          <ToggleRight size={15} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={15} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(selectedCategory)}
                        disabled={savingKey === `cat-${selectedCategory.id}`}
                        className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-50"
                        title="Delete category"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {!readOnly && (
                  <form onSubmit={handleCreateCaste} className="px-4 py-3 border-b border-gray-100 flex gap-2">
                    <input
                      type="text"
                      value={newCasteName}
                      onChange={(e) => setNewCasteName(e.target.value)}
                      placeholder={`Add caste under ${selectedCategory.name}`}
                      className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={creatingCaste || !newCasteName.trim()}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </form>
                )}

                <div className="flex-1 overflow-y-auto max-h-[280px] md:max-h-[340px]">
                  {selectedCastes.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-gray-400">
                      No castes in this category yet
                    </p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          <th className="px-4 py-2">Caste</th>
                          <th className="px-4 py-2">Status</th>
                          {!readOnly && <th className="px-4 py-2 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedCastes.map((caste) => {
                          const isEditing = editingCasteId === caste.id;
                          return (
                            <tr key={caste.id} className="hover:bg-gray-50/80">
                              <td className="px-4 py-2">
                                {isEditing && !readOnly ? (
                                  <input
                                    type="text"
                                    value={casteDraft}
                                    onChange={(e) => setCasteDraft(e.target.value)}
                                    className="w-full max-w-xs rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                ) : (
                                  <span className="font-medium text-gray-900">{caste.name}</span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    caste.isActive
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {caste.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              {!readOnly && (
                                <td className="px-4 py-2">
                                  <div className="flex items-center justify-end gap-1">
                                    {isEditing ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => saveCaste(caste.id)}
                                          disabled={savingKey === `caste-${caste.id}`}
                                          className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingCasteId(null)}
                                          className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => startEditCaste(caste)}
                                          className="p-1 text-gray-400 hover:text-amber-600"
                                          title="Edit caste"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleCasteActive(caste)}
                                          disabled={savingKey === `caste-${caste.id}`}
                                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                                          title={caste.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                          {caste.isActive ? (
                                            <ToggleRight size={14} className="text-green-500" />
                                          ) : (
                                            <ToggleLeft size={14} />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteCaste(caste)}
                                          disabled={savingKey === `caste-${caste.id}`}
                                          className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50"
                                          title="Delete caste"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {blockedDeleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeBlockedDeleteModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle size={18} className="text-red-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 truncate">
                    {blockedDeleteModal.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5">{blockedDeleteModal.message}</p>
                  <p className="text-xs text-amber-700 mt-1 inline-flex items-center gap-1">
                    <Users size={12} />
                    {blockedDeleteModal.totalCount} student
                    {blockedDeleteModal.totalCount === 1 ? '' : 's'} using this
                    {blockedDeleteModal.hasMore
                      ? ` (showing first ${blockedDeleteModal.students.length})`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeBlockedDeleteModal}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-auto flex-1 px-4 py-3">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Admission No</th>
                    <th className="px-3 py-2">PIN</th>
                    <th className="px-3 py-2">College</th>
                    <th className="px-3 py-2">Course</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Caste</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {blockedDeleteModal.students.map((student, index) => (
                    <tr
                      key={`${student.admission_number || student.pin_no || index}`}
                      className="hover:bg-gray-50/80"
                    >
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                        {student.student_name || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {student.admission_number || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {student.pin_no || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {student.college || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {student.course || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {student.branch || '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {student.caste || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-100 px-4 py-3 flex justify-end">
              <button
                type="button"
                onClick={closeBlockedDeleteModal}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
