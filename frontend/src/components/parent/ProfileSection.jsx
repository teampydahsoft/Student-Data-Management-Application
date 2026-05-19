import React from 'react';

const ProfileSection = ({ title, icon: Icon, iconClassName = 'text-primary', children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
      {Icon && <Icon size={16} className={iconClassName} />}
      {title}
    </h4>
    <div className="space-y-3">{children}</div>
  </div>
);

export const ProfileField = ({ label, value }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
      {label}
    </label>
    <p className="text-sm text-gray-900 font-medium break-words">{value ?? '—'}</p>
  </div>
);

export default ProfileSection;
