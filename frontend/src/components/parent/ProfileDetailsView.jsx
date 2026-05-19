import React from 'react';
import { Users, UserCog, MapPin, GraduationCap, CheckCircle, XCircle } from 'lucide-react';
import ProfileSection, { ProfileField } from './ProfileSection';
import { formatParentDate, formatGender } from '../../utils/parentProfileHelpers';

const ProfileDetailsView = ({ data }) => {
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <div className="space-y-4">
        <ProfileSection title="Admission Details" icon={Users} iconClassName="text-blue-600">
          <ProfileField label="Admission Number" value={data.admission_number} />
          <ProfileField label="PIN Number" value={data.pin_no} />
          <ProfileField label="Admission Date" value={formatParentDate(data.admission_date)} />
        </ProfileSection>

        <ProfileSection title="Parent Information" icon={Users} iconClassName="text-orange-600">
          <ProfileField label="Father Name" value={data.father_name} />
          <ProfileField label="Parent Mobile 1" value={data.parent_mobile1 || data.parent_mobile} />
          <ProfileField label="Parent Mobile 2" value={data.parent_mobile2} />
          <div className="flex flex-wrap gap-3 pt-1">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${data.is_parent_mobile_verified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {data.is_parent_mobile_verified ? <CheckCircle size={12} /> : <XCircle size={12} />}
              Parent mobile {data.is_parent_mobile_verified ? 'verified' : 'not verified'}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${data.is_student_mobile_verified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {data.is_student_mobile_verified ? <CheckCircle size={12} /> : <XCircle size={12} />}
              Student mobile {data.is_student_mobile_verified ? 'verified' : 'not verified'}
            </span>
          </div>
        </ProfileSection>

        <ProfileSection title="Address Details" icon={MapPin} iconClassName="text-green-600">
          <ProfileField label="Full Address" value={data.student_address} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProfileField label="City / Village" value={data.city_village} />
            <ProfileField label="Mandal" value={data.mandal_name} />
            <ProfileField label="District" value={data.district} />
            <ProfileField label="Pincode" value={data.pincode} />
          </div>
        </ProfileSection>
      </div>

      <div className="space-y-4">
        <ProfileSection title="Student Information" icon={Users} iconClassName="text-blue-600">
          <ProfileField label="Student Name" value={data.student_name} />
          <ProfileField label="Mobile Number" value={data.student_mobile} />
          <ProfileField label="Date of Birth" value={formatParentDate(data.dob)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProfileField label="Gender" value={formatGender(data.gender)} />
            <ProfileField label="Caste" value={data.caste} />
            <ProfileField label="Aadhar Number" value={data.adhar_no} />
            <ProfileField label="APAAR ID" value={data.apaar_id} />
          </div>
        </ProfileSection>

        <ProfileSection title="Academic Information" icon={GraduationCap} iconClassName="text-indigo-600">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProfileField label="College" value={data.college} />
            <ProfileField label="Course" value={data.course} />
            <ProfileField label="Branch" value={data.branch} />
            <ProfileField label="Batch" value={data.batch} />
            <ProfileField label="Current Year" value={data.current_year} />
            <ProfileField label="Current Semester" value={data.current_semester} />
            <ProfileField label="Student Type" value={data.stud_type} />
            <ProfileField label="Previous College" value={data.previous_college} />
          </div>
        </ProfileSection>

        <ProfileSection title="Administrative Information" icon={UserCog} iconClassName="text-purple-600">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProfileField label="Student Status" value={data.student_status} />
            <ProfileField label="Scholar Status" value={data.scholar_status} />
            <ProfileField label="Fee Status" value={data.fee_status} />
            <ProfileField label="Certificates Status" value={data.certificates_status} />
            <ProfileField label="Registration Status" value={data.registration_status} />
          </div>
        </ProfileSection>
      </div>
    </div>
  );
};

export default ProfileDetailsView;
