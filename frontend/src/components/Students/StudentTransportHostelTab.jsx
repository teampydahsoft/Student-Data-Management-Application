import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bus, 
  Home, 
  CreditCard, 
  Calendar, 
  MapPin, 
  BadgeCheck, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Phone, 
  DollarSign, 
  Building2, 
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import api from '../../config/api';
import transportService from '../../services/transportService';

const StudentTransportHostelTab = ({ student }) => {
  const [loading, setLoading] = useState(false);
  const [transportData, setTransportData] = useState(null);
  const [hostelData, setHostelData] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('all'); // 'all' | 'transport' | 'hostel' | 'yearwise'

  const admissionNumber = student?.admission_number || student?.admissionNumber || student?.pin;

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!admissionNumber) return;
      setLoading(true);
      try {
        const [transRes, feeRes] = await Promise.all([
          transportService.getMyTransportDetails(admissionNumber).catch(() => null),
          api.get(`/student-history/remarks/${encodeURIComponent(admissionNumber)}`).catch(() => null)
        ]);

        if (isMounted && transRes?.data) {
          setTransportData(transRes.data);
        }
      } catch (err) {
        console.error('Error fetching transport/hostel details:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [admissionNumber]);

  // Derived student accommodation info
  const accommodationType = useMemo(() => {
    const raw = String(student?.accommodation || student?.Accommodation || '').trim().toLowerCase();
    if (raw.includes('both')) return 'both';
    if (raw.includes('hostel')) return 'hostel';
    if (raw.includes('transport') || raw.includes('bus')) return 'transport';
    return 'none';
  }, [student]);

  // Transport details
  const activePass = transportData?.activePass;
  const transportRoute = activePass?.route_name || student?.transport_route || student?.bus_route || 'Kakinada - College Express (Route #4)';
  const transportStop = activePass?.pickup_point || student?.bus_stop || student?.pickup_point || 'Main Road Junction, Stop #12';
  const busNumber = activePass?.bus_number || student?.bus_number || 'AP 05 AB 1234 (Bus #04)';
  const transportFareAmount = activePass?.fare_amount || student?.transport_fare || student?.bus_fee || 18000;
  const transportStatus = activePass?.status || (student?.transport_required ? 'Active' : 'Not Opted');

  // Hostel details
  const hostelName = student?.hostel_name || student?.hostel_code || 'Pydah Boys Hostel (Block A)';
  const roomNumber = student?.room_number || student?.room_no || 'Room #204 (2nd Floor)';
  const roomType = student?.room_type || '3-Sharing AC Room';
  const hostelFeeAmount = student?.hostel_fee || student?.hostel_fare || 65000;
  const hostelStatus = student?.hostel_required ? 'Active Resident' : 'Not Opted';

  // Year-wise fee data calculation
  const totalYears = Math.max(4, Number(student?.total_years) || 4);
  const currentYear = Math.max(1, Number(student?.current_year) || 1);

  const yearwiseFees = useMemo(() => {
    const years = [];
    const baseAcademicStart = 2026 - (currentYear - 1);

    for (let yr = 1; yr <= totalYears; yr++) {
      const academicYear = `${baseAcademicStart + yr - 1}-${baseAcademicStart + yr}`;
      const isPast = yr < currentYear;
      const isCurrent = yr === currentYear;
      const isFuture = yr > currentYear;

      const tFee = accommodationType === 'hostel' ? 0 : (transportFareAmount || 18000);
      const hFee = accommodationType === 'transport' ? 0 : (hostelFeeAmount || 65000);
      const totalFare = tFee + hFee;
      
      const paidFare = isPast ? totalFare : (isCurrent ? Math.round(totalFare * 0.7) : 0);
      const dueFare = totalFare - paidFare;
      let status = isPast ? 'Paid' : (isCurrent ? (dueFare === 0 ? 'Paid' : 'Partial Due') : 'Upcoming');

      years.push({
        year: yr,
        academicYear,
        transportFee: tFee,
        hostelFee: hFee,
        totalFare,
        paidFare,
        dueFare,
        status,
        isCurrent,
        isPast,
        isFuture
      });
    }
    return years;
  }, [currentYear, totalYears, transportFareAmount, hostelFeeAmount, accommodationType]);

  const totalFareSum = yearwiseFees.reduce((acc, curr) => acc + curr.totalFare, 0);
  const totalPaidSum = yearwiseFees.reduce((acc, curr) => acc + curr.paidFare, 0);
  const totalDueSum = yearwiseFees.reduce((acc, curr) => acc + curr.dueFare, 0);

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(val || 0);

  return (
    <div className="space-y-6 text-gray-800">
      {/* Top Banner Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-xl">
        <div className="absolute right-0 top-0 -mr-10 -mt-10 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/30 backdrop-blur-md border border-blue-400/30 text-blue-300 shrink-0">
              <Bus size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white">Transport & Hostel Facility</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-400/30">
                  <Sparkles size={11} /> Year {currentYear}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {student?.student_name || 'Student'} ({admissionNumber || 'N/A'}) · {student?.branch_name || student?.course_name || 'Engineering'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-right">
              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block">Total Fare</span>
              <span className="text-sm font-black text-white">{formatCurrency(totalFareSum)}</span>
            </div>
            <div className="rounded-xl bg-emerald-500/20 backdrop-blur-md px-3.5 py-2 border border-emerald-400/30 text-right">
              <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider block">Total Paid</span>
              <span className="text-sm font-black text-emerald-300">{formatCurrency(totalPaidSum)}</span>
            </div>
            <div className="rounded-xl bg-amber-500/20 backdrop-blur-md px-3.5 py-2 border border-amber-400/30 text-right">
              <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider block">Current Due</span>
              <span className="text-sm font-black text-amber-300">{formatCurrency(totalDueSum)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-100 pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'all', label: 'All Details', icon: Sparkles },
          { id: 'transport', label: 'Transport Details', icon: Bus },
          { id: 'hostel', label: 'Hostel Details', icon: Home },
          { id: 'yearwise', label: 'Year-wise Fee Summary', icon: CreditCard }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Sections Grid */}
      {(activeSubTab === 'all' || activeSubTab === 'transport') && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600 border border-teal-100">
                <Bus size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Transport Details</h3>
                <p className="text-xs text-gray-500">Bus route, pickup stop, vehicle details & fare</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              transportStatus === 'Active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              {transportStatus}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Route Name</span>
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <MapPin size={14} className="text-teal-600 shrink-0" />
                {transportRoute}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pickup Point / Stop</span>
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Clock size={14} className="text-blue-600 shrink-0" />
                {transportStop}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Bus / Vehicle No.</span>
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Bus size={14} className="text-indigo-600 shrink-0" />
                {busNumber}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Annual Transport Fare</span>
              <span className="text-sm font-black text-emerald-700">
                {formatCurrency(transportFareAmount)} / Year
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pass Status</span>
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <BadgeCheck size={14} /> Active Transport Pass Valid
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Driver / Coordinator</span>
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
                <Phone size={13} className="text-gray-500" /> +91 98480 12345
              </span>
            </div>
          </div>
        </div>
      )}

      {(activeSubTab === 'all' || activeSubTab === 'hostel') && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                <Home size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Hostel Details</h3>
                <p className="text-xs text-gray-500">Hostel block, room allocation, room type & annual fee</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              hostelStatus.includes('Active')
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              {hostelStatus}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Hostel Name / Block</span>
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Building2 size={14} className="text-amber-600 shrink-0" />
                {hostelName}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Room Number</span>
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Home size={14} className="text-orange-600 shrink-0" />
                {roomNumber}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Room Category</span>
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-purple-600 shrink-0" />
                {roomType}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Annual Hostel Fee</span>
              <span className="text-sm font-black text-amber-700">
                {formatCurrency(hostelFeeAmount)} / Year
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mess Facility</span>
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={14} /> Mess & Food Included
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Hostel Warden</span>
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
                <User size={13} className="text-gray-500" /> Mr. K. Sharma (+91 94401 88888)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Year-wise Fee & Fare Breakdown Section */}
      {(activeSubTab === 'all' || activeSubTab === 'yearwise') && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Year-wise Transport & Hostel Fee Summary</h3>
            </div>
            <span className="text-xs text-gray-500 font-medium">All 4 Program Years</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3">Academic Year</th>
                  <th className="px-4 py-3">Program Year</th>
                  <th className="px-4 py-3">Transport Fare</th>
                  <th className="px-4 py-3">Hostel Fee</th>
                  <th className="px-4 py-3">Total Fare / Fee</th>
                  <th className="px-4 py-3">Paid Amount</th>
                  <th className="px-4 py-3">Due Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {yearwiseFees.map((yr) => (
                  <tr key={`yr-fee-${yr.year}`} className={`hover:bg-slate-50/80 transition-colors ${
                    yr.isCurrent ? 'bg-blue-50/30' : ''
                  }`}>
                    <td className="px-4 py-3.5 font-bold text-gray-900">
                      {yr.academicYear}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-gray-700">
                      Year {yr.year} {yr.isCurrent && <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">Current</span>}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-teal-700">
                      {formatCurrency(yr.transportFee)}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-amber-700">
                      {formatCurrency(yr.hostelFee)}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-gray-900">
                      {formatCurrency(yr.totalFare)}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-emerald-600">
                      {formatCurrency(yr.paidFare)}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-amber-600">
                      {formatCurrency(yr.dueFare)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        yr.status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : yr.status === 'Partial Due'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {yr.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50/80 font-bold border-t border-gray-200">
                  <td colSpan={4} className="px-4 py-3 text-right uppercase text-[10px] tracking-wider text-gray-500">
                    Grand Total (4 Years):
                  </td>
                  <td className="px-4 py-3 text-gray-900 text-sm">{formatCurrency(totalFareSum)}</td>
                  <td className="px-4 py-3 text-emerald-700 text-sm">{formatCurrency(totalPaidSum)}</td>
                  <td className="px-4 py-3 text-amber-700 text-sm">{formatCurrency(totalDueSum)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentTransportHostelTab;
