import React, { useEffect, useState, useMemo } from 'react';
import {
    FileText,
    Clock,
    RotateCw,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Calendar,
    Receipt
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import api from '../../config/api';

const isClubFeeInvoice = (invoice) => {
    const feeHeadName = String(typeof invoice?.feeHead === 'object' ? invoice.feeHead?.name || '' : '').trim().toLowerCase();
    const remarks = String(invoice?.remarks || '').trim().toLowerCase();
    return String(invoice?.feeHead?.code || '').toUpperCase() === 'CF' ||
        feeHeadName.startsWith('club fee') ||
        /^club\s*fee\s*[:\-–]/i.test(remarks);
};

const getClubNameFromRemarks = (remarks) => String(remarks || '')
    .replace(/^\s*(?:club\s*fee\s*[:\-–]\s*)+/i, '')
    .trim();

const getClubNameFromInvoice = (invoice) => getClubNameFromRemarks(invoice?.remarks) ||
    String(invoice?.feeHead?.name || '').replace(/^\s*club\s*fee\s*[:\-–]\s*/i, '').trim() ||
    'Club';

const calculateInvoicePaid = (invoice, transactions = [], allInvoices = []) => {
    if (isClubFeeInvoice(invoice) && invoice.status === 'cancelled') return 0;

    let paid = 0;
    const isServiceFee = invoice.feeHead?.code === 'SSF' || invoice.feeHead?.name === 'Student Services FEE';
    const isClubFee = isClubFeeInvoice(invoice);
    const clubName = isClubFee ? getClubNameFromRemarks(invoice.remarks) : '';

    const invoiceHeadId = invoice.feeHead?._id || invoice.feeHead;
    const invoiceHeadName = invoice.feeHead?.name?.toLowerCase() || '';

    // Check if there are multiple invoices for this exact feeHead in this year
    const sameHeadInvoicesInYear = allInvoices.filter(inv => {
        const invHeadId = inv.feeHead?._id || inv.feeHead;
        const invHeadName = inv.feeHead?.name?.toLowerCase() || '';
        const sameHead = (invoiceHeadId && invHeadId && String(invoiceHeadId) === String(invHeadId)) ||
            (invoiceHeadName && invHeadName && invoiceHeadName === invHeadName);
        return sameHead && inv.studentYear?.toString() === invoice.studentYear?.toString();
    });
    const hasMultipleSemInvoices = sameHeadInvoicesInYear.length > 1;

    transactions.forEach(transaction => {
        if (transaction.status && transaction.status !== 'active') return;
        let isServiceMatch = false;
        if (isServiceFee && invoice.remarks) {
            const refMatch = invoice.remarks.match(/\(Ref: (\d+)\)/);
            if (refMatch && transaction.remarks) {
                isServiceMatch = transaction.remarks.includes(`Ref: ${refMatch[1]}`) || transaction.remarks.includes(`SR-${refMatch[1]}`);
            }
        }

        const transactionHeadId = transaction.feeHead?._id || transaction.feeHead;
        const transactionHeadName = transaction.feeHead?.name?.toLowerCase() || '';

        const sameFeeHead = (invoiceHeadId && transactionHeadId && String(invoiceHeadId) === String(transactionHeadId)) ||
            (invoiceHeadName && transactionHeadName && invoiceHeadName === transactionHeadName) ||
            (invoice.feeHead?.code && transaction.feeHead?.code && invoice.feeHead.code.toUpperCase() === transaction.feeHead.code.toUpperCase());

        const sameYear = !transaction.studentYear || !invoice.studentYear || transaction.studentYear?.toString() === invoice.studentYear?.toString();

        let sameSemester = true;
        if (hasMultipleSemInvoices && transaction.semester && invoice.semester) {
            sameSemester = transaction.semester.toString() === invoice.semester.toString();
        }

        if (!(sameFeeHead && sameYear && sameSemester) && !isServiceMatch) return;

        if (isClubFee && clubName && (!transaction.remarks || !transaction.remarks.toLowerCase().includes(clubName.toLowerCase()))) return;

        if (isServiceFee && !isServiceMatch && invoice.remarks) {
            const refMatch = invoice.remarks.match(/\(Ref: (\d+)\)/);
            if (refMatch && !transaction.remarks?.includes(`Ref: ${refMatch[1]}`) && !transaction.remarks?.includes(`SR-${refMatch[1]}`)) return;
        }

        paid += Number(transaction.amount) || 0;
    });

    return paid;
};

// Helper to check if a transaction is a credit/waiver
const isCredit = (tx) => {
    const mode = tx.paymentMode?.toLowerCase() || '';
    const remark = tx.remarks?.toLowerCase() || '';
    return mode.includes('waiver') ||
        mode.includes('adjustment') ||
        mode.includes('concession') ||
        mode.includes('credit') ||
        remark.includes('concession') ||
        remark.includes('scholarship') ||
        remark.includes('credit');
};

const FeeManagement = () => {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [feeData, setFeeData] = useState(null);
    const [error, setError] = useState(null);

    // Selected year for the top cards & tables
    const [selectedYear, setSelectedYear] = useState(4);

    // Filters
    const [feeStatusFilter, setFeeStatusFilter] = useState('Active Fees'); // 'Active Fees', 'All Fees', 'Cancelled Fees'
    const [txModeFilter, setTxModeFilter] = useState('All');
    const [txHeadFilter, setTxHeadFilter] = useState('All');



    // Expandable years for breakdown accordions
    const [expandedYears, setExpandedYears] = useState({});

    const toggleExpandYear = (yr) => {
        setExpandedYears(prev => ({
            ...prev,
            [yr]: prev[yr] === undefined ? false : !prev[yr]
        }));
    };

    const fetchFeeDetails = async () => {
        if (!user?.admission_number) return;
        try {
            setLoading(true);
            const response = await api.get(`/fees/students/${user.admission_number}/details`);
            if (response.data.success) {
                setFeeData(response.data);
                const currYear = response.data.studentDetails?.currentYear;
                if (currYear) {
                    setSelectedYear(Number(currYear));
                }
            } else {
                setError('Failed to load fee details');
            }
        } catch (err) {
            console.error('Error fetching fee details:', err);
            setError('Unable to fetch fee information. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeeDetails();
    }, [user]);

    const formatNumber = (amount) => {
        const val = Number(amount) || 0;
        return new Intl.NumberFormat('en-IN').format(val);
    };

    const { fees, transactions, studentDetails } = feeData || {};

    // Determine the list of academic years (standard Year 1 to Year 4 or from data)
    const availableYears = useMemo(() => {
        const set = new Set([1, 2, 3, 4]);
        (fees || []).forEach(f => {
            if (f.studentYear) set.add(Number(f.studentYear));
        });
        (transactions || []).forEach(t => {
            if (t.studentYear) set.add(Number(t.studentYear));
        });
        if (studentDetails?.currentYear) {
            set.add(Number(studentDetails.currentYear));
        }
        return Array.from(set).sort((a, b) => a - b);
    }, [fees, transactions, studentDetails]);

    // Calculate Summary Stats for each Year (for the top cards)
    const yearStatsMap = useMemo(() => {
        const map = {};
        availableYears.forEach(yr => {
            const yrFees = (fees || []).filter(f => Number(f.studentYear) === yr);
            const yrTransactions = (transactions || []).filter(tx => {
                if (tx.status && tx.status !== 'active') return false;
                if (tx.studentYear) return Number(tx.studentYear) === yr;
                return false;
            });

            let total = 0;
            yrFees.forEach(f => {
                if (f.amount > 0 && f.status !== 'cancelled') {
                    total += Number(f.amount) || 0;
                }
            });

            let paid = 0;
            let concession = 0;
            yrTransactions.forEach(tx => {
                const amt = Number(tx.amount) || 0;
                if (tx.transactionType === 'CREDIT' || isCredit(tx)) {
                    concession += amt;
                } else {
                    paid += amt;
                }
            });

            const balance = Math.max(0, total - paid - concession);
            map[yr] = {
                total,
                paid,
                concession,
                balance,
                isPaid: balance <= 0
            };
        });
        return map;
    }, [availableYears, fees, transactions]);

    // Filter fees for a specific year and feeStatusFilter
    const getInvoicesForYear = (yr) => {
        let list = (fees || []).filter(f => Number(f.studentYear) === Number(yr));

        if (feeStatusFilter === 'Active Fees') {
            list = list.filter(f => f.status !== 'cancelled');
        } else if (feeStatusFilter === 'Cancelled Fees') {
            list = list.filter(f => f.status === 'cancelled');
        }

        return list.map((inv, index) => {
            const paid = calculateInvoicePaid(inv, transactions, fees || []);
            const concession = 0;
            const totalFee = Number(inv.amount) || 0;
            const balance = Math.max(0, totalFee - paid - concession);

            let status = 'Unpaid';
            if (balance <= 0) {
                status = 'Paid';
            } else if (paid > 0) {
                status = 'Partial';
            }

            const isInstallmentBased = (inv.feeHead?.name || '').toLowerCase().includes('transport') ||
                (inv.feeHead?.name || '').toLowerCase().includes('bus') ||
                totalFee >= 10000;

            let t1Due = '—';
            let t2Due = '- - -';

            if (isInstallmentBased && totalFee > 0) {
                const term1Target = Math.round(totalFee / 2);
                const term2Target = totalFee - term1Target;

                const t1Bal = Math.max(0, term1Target - paid);
                const paidForT2 = Math.max(0, paid - term1Target);
                const t2Bal = Math.max(0, term2Target - paidForT2);

                t1Due = t1Bal > 0 ? formatNumber(t1Bal) : '—';
                t2Due = t2Bal > 0 ? formatNumber(t2Bal) : '—';
            } else {
                if (totalFee === 0) {
                    t1Due = '—';
                    t2Due = '- - -';
                } else {
                    t1Due = balance > 0 ? formatNumber(balance) : '—';
                    t2Due = '- - -';
                }
            }

            let headTitle = inv.feeHead?.name || 'Academic Fee';
            if (isClubFeeInvoice(inv)) {
                const clubName = getClubNameFromInvoice(inv);
                headTitle = `Club Fee - ${clubName}`;
            } else if (inv.feeHead?.code === 'SSF' || inv.feeHead?.name === 'Student Services FEE') {
                if (inv.remarks) {
                    headTitle = `Student Services FEE - ${inv.remarks.replace(/^Service Request:\s*/i, '')}`;
                } else {
                    headTitle = 'Student Services FEE';
                }
            }

            const rowKey = inv._id || `inv-${yr}-${index}`;

            return {
                ...inv,
                rowKey,
                headTitle,
                yearSemLabel: `Year ${inv.studentYear} • Sem ${inv.semester || 1}`,
                totalFee,
                t1Due,
                t2Due,
                t1DueNum: t1Due !== '—' && t1Due !== '- - -' ? Number(String(t1Due).replace(/,/g, '')) : 0,
                t2DueNum: t2Due !== '—' && t2Due !== '- - -' ? Number(String(t2Due).replace(/,/g, '')) : 0,
                paid,
                concession,
                balance,
                status
            };
        });
    };

    const getYearTotals = (invoices) => {
        let totalFee = 0;
        let t1DueTotal = 0;
        let t2DueTotal = 0;
        let paidTotal = 0;
        let concessionTotal = 0;
        let balanceTotal = 0;

        invoices.forEach(item => {
            totalFee += item.totalFee;
            t1DueTotal += item.t1DueNum;
            t2DueTotal += item.t2DueNum;
            paidTotal += item.paid;
            concessionTotal += item.concession;
            balanceTotal += item.balance;
        });

        return {
            totalFee,
            t1Due: t1DueTotal > 0 ? formatNumber(t1DueTotal) : '0',
            t2Due: t2DueTotal > 0 ? formatNumber(t2DueTotal) : '0',
            paid: paidTotal,
            concession: concessionTotal,
            balance: balanceTotal
        };
    };

    const currentYearInvoices = useMemo(() => getInvoicesForYear(selectedYear), [fees, transactions, selectedYear, feeStatusFilter]);
    const tableTotals = useMemo(() => getYearTotals(currentYearInvoices), [currentYearInvoices]);

    // Filter transactions for the selected year
    const currentYearTransactions = useMemo(() => {
        let list = (transactions || []).filter(tx => {
            if (tx.status && tx.status !== 'active') return false;
            if (tx.studentYear) return Number(tx.studentYear) === selectedYear;
            return false;
        });

        if (txModeFilter !== 'All') {
            list = list.filter(tx => (tx.paymentMode || '').toLowerCase() === txModeFilter.toLowerCase());
        }

        if (txHeadFilter !== 'All') {
            list = list.filter(tx => {
                const headName = tx.feeHead?.name || '';
                return headName.toLowerCase() === txHeadFilter.toLowerCase();
            });
        }

        return list;
    }, [transactions, selectedYear, txModeFilter, txHeadFilter]);

    const transactionFeeHeads = useMemo(() => {
        const heads = new Set();
        (transactions || []).forEach(tx => {
            if (tx.feeHead?.name) heads.add(tx.feeHead.name);
        });
        return Array.from(heads);
    }, [transactions]);





    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[420px] gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                <p className="text-xs font-semibold text-slate-400">Loading Fee Ledger...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center bg-white rounded-2xl border border-red-100 max-w-md mx-auto my-12">
                <p className="text-sm font-bold text-red-600 mb-4">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-12 font-sans text-slate-800">
            {/* Fee Dues Breakdown Section with Expandable Year Accordions */}
            <div className="space-y-4">
                {/* Section Header */}
                <div className="flex flex-row items-center justify-between gap-2 pb-1">
                    <h2 className="text-sm sm:text-lg font-extrabold text-[#1e3a8a] heading-font tracking-tight shrink-0">
                        Fee Dues Breakdown
                    </h2>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {/* Active Fees Dropdown */}
                        <select
                            value={feeStatusFilter}
                            onChange={(e) => setFeeStatusFilter(e.target.value)}
                            className="text-[11px] sm:text-xs font-semibold bg-white border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:bg-slate-50 transition shadow-2xs"
                        >
                            <option value="Active Fees">Active Fees</option>
                            <option value="All Fees">All Fees</option>
                            <option value="Cancelled Fees">Cancelled Fees</option>
                        </select>
                    </div>
                </div>

<<<<<<< HEAD
                {/* Single Combined Card Container for all Year Breakdown Accordions */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs divide-y divide-slate-200 mt-2">
                    {[...availableYears].sort((a, b) => b - a).map(yr => {
                        const yrInvoices = getInvoicesForYear(yr);
                        const yrTotals = getYearTotals(yrInvoices);
                        const yrStats = yearStatsMap[yr] || { total: 0, paid: 0, balance: 0, isPaid: true };
                        const isExpanded = expandedYears[yr] === undefined ? true : expandedYears[yr];
                        const isPaid = yrStats.balance <= 0;

                        return (
                            <div key={yr} className="overflow-hidden">
                                {/* Accordion Header */}
                                <div 
                                    onClick={() => toggleExpandYear(yr)}
                                    className="p-3.5 sm:p-4 bg-slate-50/80 hover:bg-slate-100 cursor-pointer flex items-center justify-between transition-colors select-none"
                                >
                                    <div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto no-scrollbar py-0.5 min-w-0">
                                        <span className="font-bold text-[11px] sm:text-xs text-slate-800 shrink-0">Y{yr}</span>
                                        {isPaid ? (
                                            <span className="px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                                                PAID
                                            </span>
                                        ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                                                BAL: {formatNumber(yrStats.balance)}
                                            </span>
                                        )}
                                        <span className="text-[8.5px] sm:text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                            Total: {formatNumber(yrStats.total)} • Paid: {formatNumber(yrStats.paid)}
                                        </span>
=======
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="py-3 px-4 min-w-[240px]">FEE HEAD / YEAR</th>
                                <th className="py-3 px-4 text-right">TOTAL FEE</th>
                                <th className="py-3 px-4 text-center">T1 DUE</th>
                                <th className="py-3 px-4 text-center">T2 DUE</th>
                                <th className="py-3 px-4 text-right">PAID</th>
                                <th className="py-3 px-4 text-right text-purple-600">CONCESSION</th>
                                <th className="py-3 px-4 text-right">BALANCE</th>
                                <th className="py-3 px-4 text-center">STATUS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {currentYearInvoices.length > 0 ? (
                                currentYearInvoices.map((row) => (
                                    <tr
                                        key={row.rowKey}
                                        className="hover:bg-slate-50/60 transition-colors group"
                                    >
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-1 font-bold text-slate-800">
                                                <span>{row.headTitle}</span>
                                                <ChevronRight size={13} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                {row.yearSemLabel}
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                                            {formatNumber(row.totalFee)}
                                        </td>
                                        <td className={`py-3.5 px-4 text-center font-semibold ${row.t1Due !== '—' && row.t1Due !== '- - -' ? 'text-rose-600' : 'text-slate-400'}`}>
                                            {row.t1Due}
                                        </td>
                                        <td className={`py-3.5 px-4 text-center font-semibold ${row.t2Due !== '—' && row.t2Due !== '- - -' ? 'text-rose-600' : 'text-slate-400'}`}>
                                            {row.t2Due}
                                        </td>
                                        <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                                            {formatNumber(row.paid)}
                                        </td>
                                        <td className="py-3.5 px-4 text-right font-bold text-purple-600">
                                            {formatNumber(row.concession)}
                                        </td>
                                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                                            {formatNumber(row.balance)}
                                        </td>
                                        <td className="py-3.5 px-4 text-center">
                                            {row.status === 'Paid' && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">
                                                    Paid
                                                </span>
                                            )}
                                            {row.status === 'Unpaid' && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-600 border border-rose-200">
                                                    Unpaid
                                                </span>
                                            )}
                                            {row.status === 'Partial' && (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-600 border border-amber-200">
                                                    Partial
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                                        No fee records found for Year {selectedYear}.
                                    </td>
                                </tr>
                            )}

                            {/* TOTAL Row */}
                            {currentYearInvoices.length > 0 && (
                                <tr className="bg-slate-50/50 font-black border-t-2 border-slate-200 text-slate-800">
                                    <td className="py-4 px-4">
                                        <div className="uppercase tracking-wider text-xs">TOTAL</div>
                                        <div className="text-[11px] text-slate-400 font-normal">Year {selectedYear}</div>
                                    </td>
                                    <td className="py-4 px-4 text-right font-black">
                                        {formatNumber(tableTotals.totalFee)}
                                    </td>
                                    <td className="py-4 px-4 text-center font-black text-rose-600">
                                        {tableTotals.t1Due}
                                    </td>
                                    <td className="py-4 px-4 text-center font-black text-rose-600">
                                        {tableTotals.t2Due}
                                    </td>
                                    <td className="py-4 px-4 text-right font-black text-emerald-600">
                                        {formatNumber(tableTotals.paid)}
                                    </td>
                                    <td className="py-4 px-4 text-right font-black text-purple-600">
                                        {formatNumber(tableTotals.concession)}
                                    </td>
                                    <td className="py-4 px-4 text-right font-black text-rose-600 text-sm">
                                        {formatNumber(tableTotals.balance)}
                                    </td>
                                    <td className="py-4 px-4"></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card List View for Fee Breakdown */}
                <div className="md:hidden divide-y divide-slate-100 p-3 sm:p-4 space-y-3">
                    {currentYearInvoices.length > 0 ? (
                        currentYearInvoices.map((row) => (
                            <div key={row.rowKey} className="pt-3 first:pt-0">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                        <div className="font-bold text-slate-800 text-xs leading-snug">
                                            {row.headTitle}
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            {row.yearSemLabel}
                                        </div>
>>>>>>> d3d09e53ee99dff005201a9eb27d13238c6c29a7
                                    </div>
                                    <div className="flex items-center gap-1.5 text-slate-500">
                                        <span className="text-[11px] font-semibold hidden sm:inline">
                                            {isExpanded ? 'Collapse' : 'Expand'}
                                        </span>
                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {/* Accordion Body */}
                                {isExpanded && (
                                    <div className="border-t border-slate-200">
                                        {/* Desktop Table View */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                    <tr>
                                                        <th className="py-3 px-4 min-w-[240px]">FEE HEAD / YEAR</th>
                                                        <th className="py-3 px-4 text-right">TOTAL FEE</th>
                                                        <th className="py-3 px-4 text-center">T1 DUE</th>
                                                        <th className="py-3 px-4 text-center">T2 DUE</th>
                                                        <th className="py-3 px-4 text-right">PAID</th>
                                                        <th className="py-3 px-4 text-right text-purple-600">CONCESSION</th>
                                                        <th className="py-3 px-4 text-right">BALANCE</th>
                                                        <th className="py-3 px-4 text-center">STATUS</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {yrInvoices.length > 0 ? (
                                                        yrInvoices.map((row) => (
                                                            <tr key={row.rowKey} className="hover:bg-slate-50/60 transition-colors group">
                                                                <td className="py-3.5 px-4">
                                                                    <div className="flex items-center gap-1 font-bold text-slate-800">
                                                                        <span>{row.headTitle}</span>
                                                                        <ChevronRight size={13} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                                                                    </div>
                                                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                                                        {row.yearSemLabel}
                                                                    </div>
                                                                </td>
                                                                <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                                                                    {formatNumber(row.totalFee)}
                                                                </td>
                                                                <td className={`py-3.5 px-4 text-center font-semibold ${row.t1Due !== '—' && row.t1Due !== '- - -' ? 'text-rose-600' : 'text-slate-400'}`}>
                                                                    {row.t1Due}
                                                                </td>
                                                                <td className={`py-3.5 px-4 text-center font-semibold ${row.t2Due !== '—' && row.t2Due !== '- - -' ? 'text-rose-600' : 'text-slate-400'}`}>
                                                                    {row.t2Due}
                                                                </td>
                                                                <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                                                                    {formatNumber(row.paid)}
                                                                </td>
                                                                <td className="py-3.5 px-4 text-right font-bold text-purple-600">
                                                                    {formatNumber(row.concession)}
                                                                </td>
                                                                <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                                                                    {formatNumber(row.balance)}
                                                                </td>
                                                                <td className="py-3.5 px-4 text-center">
                                                                    {row.status === 'Paid' && (
                                                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">
                                                                            Paid
                                                                        </span>
                                                                    )}
                                                                    {row.status === 'Unpaid' && (
                                                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-600 border border-rose-200">
                                                                            Unpaid
                                                                        </span>
                                                                    )}
                                                                    {row.status === 'Partial' && (
                                                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-600 border border-amber-200">
                                                                            Partial
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                                                                No fee records found for Year {yr}.
                                                            </td>
                                                        </tr>
                                                    )}

                                                    {/* TOTAL Row */}
                                                    {yrInvoices.length > 0 && (
                                                        <tr className="bg-slate-50/50 font-black border-t-2 border-slate-200 text-slate-800">
                                                            <td className="py-3.5 px-4">
                                                                <div className="uppercase tracking-wider text-xs">TOTAL (Y{yr})</div>
                                                            </td>
                                                            <td className="py-3.5 px-4 text-right font-black">
                                                                {formatNumber(yrTotals.totalFee)}
                                                            </td>
                                                            <td className="py-3.5 px-4 text-center font-black text-rose-600">
                                                                {yrTotals.t1Due}
                                                            </td>
                                                            <td className="py-3.5 px-4 text-center font-black text-rose-600">
                                                                {yrTotals.t2Due}
                                                            </td>
                                                            <td className="py-3.5 px-4 text-right font-black text-emerald-600">
                                                                {formatNumber(yrTotals.paid)}
                                                            </td>
                                                            <td className="py-3.5 px-4 text-right font-black text-purple-600">
                                                                {formatNumber(yrTotals.concession)}
                                                            </td>
                                                            <td className="py-3.5 px-4 text-right font-black text-rose-600 text-sm">
                                                                {formatNumber(yrTotals.balance)}
                                                            </td>
                                                            <td className="py-3.5 px-4"></td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Mobile Card List View for Fee Breakdown */}
                                        <div className="md:hidden divide-y divide-slate-100 p-3 sm:p-4 space-y-3">
                                            {yrInvoices.length > 0 ? (
                                                yrInvoices.map((row) => (
                                                    <div key={row.rowKey} className="pt-3 first:pt-0">
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div>
                                                                <div className="font-bold text-slate-800 text-xs leading-snug">
                                                                    {row.headTitle}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 mt-0.5">
                                                                    {row.yearSemLabel}
                                                                </div>
                                                            </div>
                                                            <div className="shrink-0">
                                                                {row.status === 'Paid' && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">
                                                                        Paid
                                                                    </span>
                                                                )}
                                                                {row.status === 'Unpaid' && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-rose-50 text-rose-600 border border-rose-200">
                                                                        Unpaid
                                                                    </span>
                                                                )}
                                                                {row.status === 'Partial' && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-50 text-amber-600 border border-amber-200">
                                                                        Partial
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-[11px]">
                                                            <div>
                                                                <div className="text-[9px] font-bold uppercase text-slate-400">Total Fee</div>
                                                                <div className="font-bold text-slate-800">{formatNumber(row.totalFee)}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] font-bold uppercase text-slate-400">Paid</div>
                                                                <div className="font-bold text-emerald-600">{formatNumber(row.paid)}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] font-bold uppercase text-slate-400">Concession</div>
                                                                <div className="font-bold text-purple-600">{formatNumber(row.concession)}</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] font-bold uppercase text-slate-400">T1 Due</div>
                                                                <div className={`font-semibold ${row.t1Due !== '—' && row.t1Due !== '- - -' ? 'text-rose-600' : 'text-slate-400'}`}>
                                                                    {row.t1Due}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] font-bold uppercase text-slate-400">T2 Due</div>
                                                                <div className={`font-semibold ${row.t2Due !== '—' && row.t2Due !== '- - -' ? 'text-rose-600' : 'text-slate-400'}`}>
                                                                    {row.t2Due}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[9px] font-bold uppercase text-slate-400">Balance</div>
                                                                <div className="font-black text-rose-600">{formatNumber(row.balance)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-center text-slate-400 text-xs py-4">
                                                    No fee records found for Year {yr}.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Section: Transaction History Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Transaction History Header */}
                <div className="p-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                            <Clock size={18} />
                        </div>
                        <h2 className="text-base font-bold text-slate-800 tracking-tight">
                            Transaction History
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                            Year {selectedYear}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {/* All Modes Dropdown */}
                        <select
                            value={txModeFilter}
                            onChange={(e) => setTxModeFilter(e.target.value)}
                            className="flex-1 sm:flex-none text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:bg-slate-100 transition"
                        >
                            <option value="All">All Modes</option>
                            <option value="Cash">Cash</option>
                            <option value="Net Banking">Net Banking</option>
                            <option value="UPI">UPI</option>
                            <option value="Online">Online</option>
                            <option value="Cheque">Cheque</option>
                        </select>

                        {/* All Fee Heads Dropdown */}
                        <select
                            value={txHeadFilter}
                            onChange={(e) => setTxHeadFilter(e.target.value)}
                            className="flex-1 sm:flex-none text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:bg-slate-100 transition"
                        >
                            <option value="All">All Fee Heads</option>
                            {transactionFeeHeads.map(head => (
                                <option key={head} value={head}>{head}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Desktop Transaction Table (Action buttons removed as requested) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="py-3 px-4">DATE</th>
                                <th className="py-3 px-4">DESCRIPTION</th>
                                <th className="py-3 px-4">RECEIPT NO</th>
                                <th className="py-3 px-4 text-center">MODE</th>
                                <th className="py-3 px-4 text-center">YEAR / SEM</th>
                                <th className="py-3 px-4 text-right">AMOUNT</th>
                                <th className="py-3 px-4">REMARKS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {currentYearTransactions.length > 0 ? (
                                currentYearTransactions.map((tx, idx) => {
                                    const txDate = tx.paymentDate ? new Date(tx.paymentDate) : null;
                                    const dateStr = txDate
                                        ? txDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ /g, '-')
                                        : '—';
                                    const timeStr = txDate
                                        ? txDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                                        : '';

                                    const isCon = tx.transactionType === 'CREDIT' || isCredit(tx);

                                    return (
                                        <tr key={tx._id || idx} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                <div className="font-bold text-slate-800">{dateStr}</div>
                                                <div className="text-[11px] text-slate-400">{timeStr}</div>
                                                {tx.referenceDate && (
                                                    <div className="text-[10px] text-blue-500 font-medium">
                                                        Ref: {tx.referenceDate}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 font-bold text-slate-800">
                                                {tx.feeHead?.name || (isCon ? 'Scholarship / Concession' : 'Fee Payment')}
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px]">
                                                {tx.receiptNumber || '—'}
                                            </td>
                                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                <span className="inline-block px-2.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-700">
                                                    {tx.paymentMode || 'Cash'}
                                                </span>
                                                {(tx.referenceNo || tx.gatewayPaymentId) && (
                                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                        {tx.referenceNo || tx.gatewayPaymentId}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center font-medium text-slate-600">
                                                Yr {tx.studentYear || selectedYear}
                                            </td>
                                            <td className={`py-3.5 px-4 text-right font-black text-sm ${isCon ? 'text-purple-600' : 'text-emerald-600'}`}>
                                                +{formatNumber(tx.amount)}
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-500 text-[11px] max-w-xs truncate" title={tx.remarks}>
                                                {tx.remarks || '—'}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                                        No transaction records found for Year {selectedYear}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Transaction Cards */}
                <div className="md:hidden divide-y divide-slate-100 p-3 sm:p-4 space-y-3">
                    {currentYearTransactions.length > 0 ? (
                        currentYearTransactions.map((tx, idx) => {
                            const txDate = tx.paymentDate ? new Date(tx.paymentDate) : null;
                            const dateStr = txDate
                                ? txDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '—';
                            const timeStr = txDate
                                ? txDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                                : '';

                            const isCon = tx.transactionType === 'CREDIT' || isCredit(tx);

                            return (
                                <div key={tx._id || idx} className="pt-3 first:pt-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-bold text-slate-800 text-xs">
                                                {tx.feeHead?.name || (isCon ? 'Scholarship / Concession' : 'Fee Payment')}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                                <span>{dateStr}</span>
                                                <span>•</span>
                                                <span>{timeStr}</span>
                                                <span>•</span>
                                                <span className="font-medium text-slate-600">Yr {tx.studentYear || selectedYear}</span>
                                            </div>
                                        </div>
                                        <div className={`text-right font-black text-sm ${isCon ? 'text-purple-600' : 'text-emerald-600'}`}>
                                            +{formatNumber(tx.amount)}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-700">
                                            {tx.paymentMode || 'Cash'}
                                        </span>
                                        {tx.receiptNumber && (
                                            <span className="text-[10px] font-mono text-slate-500">
                                                #{tx.receiptNumber}
                                            </span>
                                        )}
                                        {(tx.referenceNo || tx.gatewayPaymentId) && (
                                            <span className="text-[10px] font-mono text-slate-400">
                                                {tx.referenceNo || tx.gatewayPaymentId}
                                            </span>
                                        )}
                                    </div>

                                    {tx.remarks && (
                                        <p className="text-[10px] text-slate-500 italic mt-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                            "{tx.remarks}"
                                        </p>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-center text-slate-400 text-xs py-6">
                            No transaction records found for Year {selectedYear}.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FeeManagement;
