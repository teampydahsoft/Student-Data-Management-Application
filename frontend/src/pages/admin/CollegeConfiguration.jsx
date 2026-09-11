import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Upload, Save, ArrowLeft, Image as ImageIcon, X, Building2 } from 'lucide-react';
import api from '../../config/api';

const CollegeConfiguration = () => {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [colleges, setColleges] = useState([]);
    const [selectedCollege, setSelectedCollege] = useState(null);
    const [headerImage, setHeaderImage] = useState(null);
    const [footerImage, setFooterImage] = useState(null);
    const [signatureImage, setSignatureImage] = useState(null);
    const [headerPreview, setHeaderPreview] = useState(null);
    const [footerPreview, setFooterPreview] = useState(null);
    const [signaturePreview, setSignaturePreview] = useState(null);
    const [removeSignature, setRemoveSignature] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchColleges();
    }, []);

    const fetchColleges = async () => {
        try {
            setLoading(true);
            const response = await api.get('/colleges');
            setColleges(response.data.data || []);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load colleges');
        } finally {
            setLoading(false);
        }
    };

    const handleCollegeSelect = async (collegeId) => {
        const college = colleges.find(c => c.id == collegeId);
        setSelectedCollege(college);

        // Reset images
        setHeaderImage(null);
        setFooterImage(null);
        setSignatureImage(null);
        setRemoveSignature(false);

        // Load existing images if available
        const baseURL = (api.defaults.baseURL || 'http://localhost:5000/api').replace('/api', '');

        if (college.header_image_url) {
            setHeaderPreview(`${baseURL}${college.header_image_url}`);
        } else {
            setHeaderPreview(null);
        }

        if (college.footer_image_url) {
            setFooterPreview(`${baseURL}${college.footer_image_url}`);
        } else {
            setFooterPreview(null);
        }

        if (college.principal_signature_url) {
            setSignaturePreview(`${baseURL}${college.principal_signature_url}`);
        } else {
            setSignaturePreview(null);
        }
    };

    const handleImageUpload = (file, type) => {
        if (type === 'header') {
            setHeaderImage(file);
            setHeaderPreview(URL.createObjectURL(file));
        } else if (type === 'footer') {
            setFooterImage(file);
            setFooterPreview(URL.createObjectURL(file));
        } else if (type === 'signature') {
            setSignatureImage(file);
            setSignaturePreview(URL.createObjectURL(file));
            setRemoveSignature(false);
        }
    };

    const handleSave = async () => {
        if (!selectedCollege) {
            toast.error('Please select a college');
            return;
        }

        try {
            setUploading(true);
            const toastId = toast.loading('Uploading images...');

            // Upload header if changed
            if (headerImage) {
                const formData = new FormData();
                formData.append('header', headerImage);
                await api.post(`/colleges/${selectedCollege.id}/upload-header`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            // Upload footer if changed
            if (footerImage) {
                const formData = new FormData();
                formData.append('footer', footerImage);
                await api.post(`/colleges/${selectedCollege.id}/upload-footer`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            // Upload signature if changed or remove if deleted
            if (signatureImage) {
                const formData = new FormData();
                formData.append('signature', signatureImage);
                await api.post(`/colleges/${selectedCollege.id}/upload-principal-signature`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else if (removeSignature) {
                await api.delete(`/colleges/${selectedCollege.id}/principal-signature`);
            }

            toast.dismiss(toastId);
            toast.success('College configuration saved successfully');

            // Refresh colleges to get updated URLs
            await fetchColleges();

            // Reset file inputs
            setHeaderImage(null);
            setFooterImage(null);
            setSignatureImage(null);
            setRemoveSignature(false);
        } catch (error) {
            console.error(error);
            toast.error('Failed to save configuration');
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading colleges...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/services/config')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Building2 size={28} className="text-blue-600" />
                            College Configuration
                        </h1>
                        <p className="text-gray-500">Configure header and footer images for certificates</p>
                    </div>
                </div>
            </div>

            {/* College Selection */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select College
                </label>
                <select
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-lg"
                    value={selectedCollege?.id || ''}
                    onChange={e => handleCollegeSelect(e.target.value)}
                >
                    <option value="">-- Choose a college --</option>
                    {colleges.map(college => (
                        <option key={college.id} value={college.id}>
                            {college.name}
                        </option>
                    ))}
                </select>
            </div>

            {selectedCollege && (
                <>
                    {/* Header Image */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Header Image</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            This image will appear at the top of all certificates for {selectedCollege.name}
                        </p>
                        {headerPreview ? (
                            <div className="relative">
                                <img
                                    src={headerPreview}
                                    alt="Header"
                                    className="w-full rounded-lg border max-h-40 object-contain bg-gray-50"
                                />
                                <button
                                    onClick={() => {
                                        setHeaderImage(null);
                                        setHeaderPreview(null);
                                    }}
                                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition bg-gray-50">
                                <ImageIcon className="text-gray-400 mb-2" size={40} />
                                <span className="text-sm text-gray-500 font-medium">Click to upload header image</span>
                                <span className="text-xs text-gray-400 mt-1">PNG, JPG, GIF up to 5MB</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => handleImageUpload(e.target.files[0], 'header')}
                                />
                            </label>
                        )}
                    </div>

                    {/* Footer Image */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Footer Image</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            This image will appear at the bottom of all certificates for {selectedCollege.name}
                        </p>
                        {footerPreview ? (
                            <div className="relative">
                                <img
                                    src={footerPreview}
                                    alt="Footer"
                                    className="w-full rounded-lg border max-h-40 object-contain bg-gray-50"
                                />
                                <button
                                    onClick={() => {
                                        setFooterImage(null);
                                        setFooterPreview(null);
                                    }}
                                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition bg-gray-50">
                                <ImageIcon className="text-gray-400 mb-2" size={40} />
                                <span className="text-sm text-gray-500 font-medium">Click to upload footer image</span>
                                <span className="text-xs text-gray-400 mt-1">PNG, JPG, GIF up to 5MB</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => handleImageUpload(e.target.files[0], 'footer')}
                                />
                            </label>
                        )}
                    </div>

                    {/* Principal Signature Section */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Principal Signature</h3>
                                <p className="text-sm text-gray-500">Official signature of the college principal for certificates</p>
                            </div>
                        </div>

                        {signaturePreview ? (
                            <div className="relative flex items-center justify-center p-4 bg-gray-50 rounded-lg border">
                                <img
                                    src={signaturePreview}
                                    alt="Principal Signature"
                                    className="max-h-24 max-w-xs object-contain"
                                />
                                <button
                                    onClick={() => {
                                        setSignatureImage(null);
                                        setSignaturePreview(null);
                                        setRemoveSignature(true);
                                    }}
                                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                                    title="Remove signature"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition bg-gray-50">
                                <Upload className="text-gray-400 mb-2" size={32} />
                                <span className="text-sm text-gray-500 font-medium">Click to upload principal signature</span>
                                <span className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP with transparent or white background</span>
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'signature')}
                                />
                            </label>
                        )}
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => navigate('/services/config')}
                            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={uploading || (!headerImage && !footerImage && !signatureImage && !removeSignature)}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} />
                            {uploading ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>

                    {/* Info Box */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <p className="text-sm text-blue-800">
                            <strong>Note:</strong> These images will be automatically used for all certificates created for {selectedCollege.name}.
                            You can change them anytime by uploading new images here.
                        </p>
                    </div>
                </>
            )}

            {!selectedCollege && (
                <div className="bg-gray-50 p-12 rounded-xl border-2 border-dashed border-gray-300 text-center">
                    <Building2 size={48} className="text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">Select a college to configure its certificate images</p>
                </div>
            )}
        </div>
    );
};

export default CollegeConfiguration;
