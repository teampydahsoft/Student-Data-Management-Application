import React, { useState, useEffect } from 'react';
import {
  Mail,
  MessageSquare,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings2,
  UserPlus,
  KeyRound,
  CalendarCheck,
  Bell
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../config/api';

const NOTIFICATION_TYPES = {
  USER_CREATION: {
    key: 'user_creation',
    label: 'User Creation',
    icon: UserPlus,
    description: 'Notification sent when a new user account is created',
    channels: ['email', 'sms'],
    defaultEmailSubject: 'Your Account Has Been Created',
    defaultEmailTemplate: `Hello {{name}},

Your account has been created successfully. Below are your login credentials:

Username: {{username}}
Password: {{password}}
Role: {{role}}

Please change your password after your first login.

Login URL: {{loginUrl}}`,
    defaultSmsTemplate: `Hello {{name}}, your account has been created. Username: {{username}}, Password: {{password}}. Login: {{loginUrl}}`
  },
  PASSWORD_UPDATE: {
    key: 'password_update',
    label: 'Password Update',
    icon: KeyRound,
    description: 'Notification sent when a user password is reset or updated',
    channels: ['email', 'sms'],
    defaultEmailSubject: 'Your Password Has Been Updated',
    defaultEmailTemplate: `Hello {{name}},

Your password has been updated successfully.

Username: {{username}}
New Password: {{password}}

Please change your password after your first login.

Login URL: {{loginUrl}}`,
    defaultSmsTemplate: `Hello {{name}}, your password has been updated. Username: {{username}}, New Password: {{password}}. Login: {{loginUrl}}`
  },
  ATTENDANCE_ABSENT: {
    key: 'attendance_absent',
    label: 'Attendance - Absent',
    icon: CalendarCheck,
    description: 'Notification sent to parents when a student is marked absent',
    channels: ['sms'],
    defaultSmsTemplate: `Dear Parent, {#var#} is absent today i.e., on {#var#}Principal, PYDAH.`
  }
};

const NotificationSettings = ({ readOnly = false }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState('user_creation');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/notifications');
      if (response.data?.success) {
        setSettings(response.data.data || {});
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      // Initialize with defaults if API fails
      const defaultSettings = {};
      Object.keys(NOTIFICATION_TYPES).forEach(key => {
        const type = NOTIFICATION_TYPES[key];
        defaultSettings[type.key] = {
          enabled: true,
          emailEnabled: type.channels.includes('email'),
          smsEnabled: type.channels.includes('sms'),
          emailSubject: type.defaultEmailSubject,
          emailTemplate: type.defaultEmailTemplate,
          smsTemplate: type.defaultSmsTemplate
        };
      });
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await api.put('/settings/notifications', { settings });
      if (response.data?.success) {
        toast.success('Notification settings saved successfully!');
      } else {
        toast.error(response.data?.message || 'Failed to save settings');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (typeKey, field, value) => {
    setSettings(prev => ({
      ...prev,
      [typeKey]: {
        ...(prev[typeKey] || {}),
        [field]: value
      }
    }));
  };

  const getSetting = (typeKey, field, defaultValue) => {
    return settings[typeKey]?.[field] ?? defaultValue;
  };

  const resetToDefault = (typeKey) => {
    const type = Object.values(NOTIFICATION_TYPES).find(t => t.key === typeKey);
    if (type) {
      updateSetting(typeKey, 'emailSubject', type.defaultEmailSubject);
      updateSetting(typeKey, 'emailTemplate', type.defaultEmailTemplate);
      updateSetting(typeKey, 'smsTemplate', type.defaultSmsTemplate);
      toast.success(`${type.label} template reset to default`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-600" size={24} />
      </div>
    );
  }

  const activeType = Object.values(NOTIFICATION_TYPES).find(t => t.key === activeTab);
  const Icon = activeType?.icon || Bell;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings2 className="text-blue-600" size={28} />
            Notification Settings
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure SMS and Email templates for various notifications
          </p>
        </div>
        {!readOnly && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} />
              Save All Settings
            </>
          )}
        </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Notification Types */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Notification Types</h3>
            </div>
            <div className="p-2 space-y-1">
              {Object.values(NOTIFICATION_TYPES).map(type => {
                const TypeIcon = type.icon;
                const isActive = activeTab === type.key;
                const isEnabled = getSetting(type.key, 'enabled', true);
                
                return (
                  <button
                    key={type.key}
                    onClick={() => setActiveTab(type.key)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-blue-50 border-2 border-blue-500'
                        : 'hover:bg-gray-50 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <TypeIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium text-sm ${
                            isActive ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {type.label}
                          </span>
                          {isEnabled ? (
                            <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle size={14} className="text-gray-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {type.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {activeType && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Icon className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{activeType.label}</h3>
                    <p className="text-sm text-gray-600 mt-0.5">{activeType.description}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="font-medium text-gray-900">Enable Notifications</label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Turn on/off notifications for this type
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={getSetting(activeType.key, 'enabled', true)}
                      onChange={(e) => updateSetting(activeType.key, 'enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Channel Selection */}
                <div className="grid grid-cols-2 gap-4">
                  {activeType.channels.includes('email') && (
                    <div className="p-4 border-2 border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Mail size={18} className="text-blue-600" />
                          <span className="font-medium text-gray-900">Email</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={getSetting(activeType.key, 'emailEnabled', true)}
                            onChange={(e) => updateSetting(activeType.key, 'emailEnabled', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      {getSetting(activeType.key, 'emailEnabled', true) && (
                        <div className="space-y-3 mt-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Email Subject
                            </label>
                            <input
                              type="text"
                              value={getSetting(activeType.key, 'emailSubject', activeType.defaultEmailSubject)}
                              onChange={(e) => updateSetting(activeType.key, 'emailSubject', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Email subject line"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-sm font-medium text-gray-700">
                                Email Template
                              </label>
                              <button
                                onClick={() => resetToDefault(activeType.key)}
                                className="text-xs text-blue-600 hover:text-blue-700"
                              >
                                Reset to Default
                              </button>
                            </div>
                            <textarea
                              value={getSetting(activeType.key, 'emailTemplate', activeType.defaultEmailTemplate)}
                              onChange={(e) => updateSetting(activeType.key, 'emailTemplate', e.target.value)}
                              rows={8}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                              placeholder="Email template content"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Available variables: {activeType.key === 'user_creation' || activeType.key === 'password_update' 
                                ? '{{name}}, {{username}}, {{password}}, {{role}}, {{loginUrl}}'
                                : '{{studentName}}, {{admissionNumber}}, {{date}}'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeType.channels.includes('sms') && (
                    <div className="p-4 border-2 border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare size={18} className="text-green-600" />
                          <span className="font-medium text-gray-900">SMS</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={getSetting(activeType.key, 'smsEnabled', true)}
                            onChange={(e) => updateSetting(activeType.key, 'smsEnabled', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                      </div>
                      {getSetting(activeType.key, 'smsEnabled', true) && (
                        <div className="space-y-3 mt-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-sm font-medium text-gray-700">
                                SMS Template
                              </label>
                              <button
                                onClick={() => resetToDefault(activeType.key)}
                                className="text-xs text-green-600 hover:text-green-700"
                              >
                                Reset to Default
                              </button>
                            </div>
                            <textarea
                              value={getSetting(activeType.key, 'smsTemplate', activeType.defaultSmsTemplate)}
                              onChange={(e) => updateSetting(activeType.key, 'smsTemplate', e.target.value)}
                              rows={4}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
                              placeholder="SMS template content (max 160 characters recommended)"
                            />
                            <div className="flex items-center justify-between mt-1">
                              <div className="flex-1">
                                <p className="text-xs text-gray-500">
                                  Available variables: {activeType.key === 'user_creation' || activeType.key === 'password_update'
                                    ? '{{name}}, {{username}}, {{password}}, {{role}}, {{loginUrl}}'
                                    : '{{studentName}}, {{admissionNumber}}, {{date}}'}
                                </p>
                                {activeType.key === 'attendance_absent' && (
                                  <p className="text-xs text-amber-600 font-medium mt-1">
                                    Note: SMS uses DLT format with {`{#var#}`} placeholders. Variable 1: "your ward", Variable 2: date.
                                  </p>
                                )}
                              </div>
                              <span className={`text-xs ${
                                (getSetting(activeType.key, 'smsTemplate', activeType.defaultSmsTemplate) || '').length > 160
                                  ? 'text-red-600 font-medium'
                                  : 'text-gray-500'
                              }`}>
                                {(getSetting(activeType.key, 'smsTemplate', activeType.defaultSmsTemplate) || '').length} chars
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;

