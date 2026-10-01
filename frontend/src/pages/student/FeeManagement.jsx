import React, { useEffect, useState, useMemo } from 'react';
import { CreditCard, Clock, CheckCircle, AlertCircle, FileText, ArrowDownLeft, ArrowUpRight, Filter, Bus, BookOpen, Zap, X, ChevronDown, ChevronRight } from 'lucide-react';
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

const calculateInvoicePaid = (invoice, transactions = []) => {
    if (isClubFeeInvoice(invoice) && invoice.status === 'cancelled') return 0;

    let paid = 0;
    const isServiceFee = invoice.feeHead?.code === 'SSF' || invoice.feeHead?.name === 'Student Services FEE';
    const isClubFee = isClubFeeInvoice(invoice);
    const clubName = isClubFee ? getClubNameFromRemarks(invoice.remarks) : '';

    transactions.forEach(transaction => {
        if (transaction.status && transaction.status !== 'active') return;
        let isServiceMatch = false;
        if (isServiceFee && invoice.remarks) {
            const refMatch = invoice.remarks.match(/\(Ref: (\d+)\)/);
            if (refMatch && transaction.remarks) {
                isServiceMatch = transaction.remarks.includes(`Ref: ${refMatch[1]}`) || transaction.remarks.includes(`SR-${refMatch[1]}`);
            }
        }

        const invoiceHeadId = invoice.feeHead?._id || invoice.feeHead;
        const transactionHeadId = transaction.feeHead?._id || transaction.feeHead;
        const sameFeeHead = invoiceHeadId && transactionHeadId && String(invoiceHeadId) === String(transactionHeadId);
        const sameYearAndSemester = transaction.studentYear?.toString() === invoice.studentYear?.toString() &&
            (!invoice.semester || transaction.semester?.toString() === invoice.semester?.toString());
        if (!(sameFeeHead && sameYearAndSemester) && !isServiceMatch) return;

        if (isClubFee && clubName && (!transaction.remarks || !transaction.remarks.toLowerCase().includes(clubName.toLowerCase()))) return;

        if (isServiceFee && !isServiceMatch && invoice.remarks) {
            const refMatch = invoice.remarks.match(/\(Ref: (\d+)\)/);
            if (refMatch && !transaction.remarks?.includes(`Ref: ${refMatch[1]}`) && !transaction.remarks?.includes(`SR-${refMatch[1]}`)) return;
        }

        paid += Number(transaction.amount) || 0;
    });

    return paid;
};

const FeeManagement = () => {
    const { user } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [feeData, setFeeData] = useState(null);
    const [error, setError] = useState(null);
    const [selectedYear, setSelectedYear] = useState('All');
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [expandedClubFeeGroups, setExpandedClubFeeGroups] = useState({});

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedPaymentFee, setSelectedPaymentFee] = useState(null);
    const [payAmount, setPayAmount] = useState('');

    const loadRazorpayScript = () => new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });

    const fetchFeeDetails = async () => {
        if (!user?.admission_number) return;
        try {
            setLoading(true);
            const response = await api.get(`/fees/students/${user.admission_number}/details`);
            if (response.data.success) setFeeData(response.data);
            else setError('Failed to load fee details');
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

    const handlePayment = (amountToPay, feeItem = null) => {
        setSelectedPaymentFee(feeItem);
        setPayAmount(amountToPay.toString());
        setIsPaymentModalOpen(true);
    };

    const initiateTransaction = async () => {
        const amountToPay = parseFloat(payAmount);
        if (!amountToPay || amountToPay <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        const feeItem = selectedPaymentFee;
        try {
            setPaymentLoading(true);
            const resScript = await loadRazorpayScript();
            if (!resScript) {
                alert('Razorpay SDK failed to load. Are you online?');
                return;
            }

            const orderResponse = await api.post('/payments/create-order', {
                studentId: user?.admission_number,
                amount: amountToPay,
                feeHeadId: feeItem?.feeHead?._id,
                studentYear: feeItem?.studentYear || feeData?.studentDetails?.currentYear,
                semester: feeItem?.semester || feeData?.studentDetails?.currentSemester,
                remarks: feeItem ? (feeItem.remarks || `Payment for ${feeItem.feeHead?.name}`) : 'General Fee Payment'
            });
            if (!orderResponse.data.success) {
                alert(orderResponse.data.message || 'Failed to initialize payment');
                return;
            }

            const { order, key_id, studentDetails: orderStudentDetails } = orderResponse.data;
            const options = {
                key: key_id,
                amount: order.amount,
                currency: order.currency,
                name: 'Pydah Group',
                description: feeItem ? (feeItem.remarks || `Payment for ${feeItem.feeHead?.name}`) : 'Fee Payment',
                order_id: order.id,
                handler: async (response) => {
                    try {
                        setPaymentLoading(true);
                        const verifyRes = await api.post('/payments/verify', {
                            ...response,
                            studentId: user?.admission_number,
                            amount: amountToPay,
                            feeHeadId: feeItem?.feeHead?._id,
                            studentYear: feeItem?.studentYear || feeData?.studentDetails?.currentYear,
                            semester: feeItem?.semester || feeData?.studentDetails?.currentSemester,
                            remarks: feeItem ? (feeItem.remarks || `Online Payment: ${feeItem.feeHead?.name}`) : 'Online Lumpsum Payment'
                        });
                        if (verifyRes.data.success) {
                            alert('Payment successful!');
                            fetchFeeDetails();
                            setIsPaymentModalOpen(false);
                            setPayAmount('');
                        } else {
                            alert(verifyRes.data.message || 'Payment verification failed.');
                        }
                    } catch (err) {
                        console.error('Verification error:', err);
                        alert(err.response?.data?.message || 'Something went wrong during verification.');
                    } finally {
                        setPaymentLoading(false);
                    }
                },
                modal: {
                    ondismiss: () => setPaymentLoading(false)
                },
                prefill: {
                    name: orderStudentDetails?.name || user?.name || '',
                    email: orderStudentDetails?.email || '',
                    contact: orderStudentDetails?.contact || ''
                },
                theme: { color: '#4F46E5' }
            };
            new window.Razorpay(options).open();
        } catch (err) {
            console.error('Payment error:', err);
            alert('Failed to initiate payment. Please try again.');
        } finally {
            setPaymentLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const { summary, fees, transactions, studentDetails } = feeData || {};

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

    const stats = useMemo(() => {
        // Initial values
        let grossFee = 0; // Sum of positive fees
        let totalPaid = 0; // Sum of real payments
        let totalCredit = 0; // Sum of credit/waiver transactions

        // 1. Calculate Gross Fee (Positive Fees Only)
        // We ignore negative fees to avoid double counting as they likely correspond to the credit transactions
        // giving the "2x" issue reported.
        if (fees) {
            fees.forEach(f => {
                if (f.amount > 0) {
                    grossFee += f.amount;
                }
            });
        }

        // 2. Calculate Paid and Credits from Transactions
        const cancelledClubNames = new Set((fees || [])
            .filter(invoice => isClubFeeInvoice(invoice) && invoice.status === 'cancelled')
            .map(getClubNameFromInvoice)
            .filter(Boolean)
            .map(name => name.toLowerCase()));

        if (transactions) {
            transactions.forEach(tx => {
                if (tx.status && tx.status !== 'active') return;
                const amount = Number(tx.amount) || 0;
                const transactionClubName = getClubNameFromRemarks(tx.remarks).toLowerCase();
                if (transactionClubName && cancelledClubNames.has(transactionClubName)) return;

                if (tx.transactionType === 'CREDIT') {
                    // Explicit CREDIT tx -> Credits
                    totalCredit += amount;
                } else if (tx.transactionType === 'DEBIT') {
                    if (isCredit(tx)) {
                        // Waiver/Adjustment DEBIT -> Credits
                        totalCredit += amount;
                    } else {
                        // Real Payment -> Paid
                        totalPaid += amount;
                    }
                }
            });
        }

        // 3. Due
        const dueAmount = grossFee - totalPaid - totalCredit;

        return {
            due: dueAmount,
            paid: totalPaid,
            credit: totalCredit,
            total: grossFee
        };
    }, [fees, transactions]);

    const dueAmount = stats.due;
    const isPaid = dueAmount <= 0;

    // Filter Logic
    const uniqueYears = useMemo(() => {
        if (!fees) return [];
        const years = [...new Set(fees.map(f => f.studentYear))];
        return years.sort((a, b) => a - b);
    }, [fees]);

    const filteredFees = useMemo(() => {
        if (selectedYear === 'All') return fees;
        return fees?.filter(f => f.studentYear.toString() === selectedYear.toString());
    }, [fees, selectedYear]);

    const displayFeeItems = useMemo(() => {
        const displayItems = [];
        const clubGroups = new Map();
        (filteredFees || []).forEach((invoice, index) => {
            if (!isClubFeeInvoice(invoice)) {
                displayItems.push({ type: 'invoice', key: invoice._id || `invoice-${index}`, invoice });
                return;
            }

            const groupKey = 'all-club-fees';
            let group = clubGroups.get(groupKey);
            if (!group) {
                group = { type: 'clubGroup', key: `club-fees-${groupKey}`, invoices: [] };
                clubGroups.set(groupKey, group);
                displayItems.push(group);
            }
            group.invoices.push(invoice);
        });
        return displayItems;
    }, [filteredFees]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <div className="bg-red-50 text-red-600 p-4 rounded-xl inline-block mb-4">
                    <AlertCircle size={32} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Something went wrong</h3>
                <p className="text-gray-500 mt-2">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up pb-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-4">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
                            <CreditCard size={28} />
                        </div>
                        Financial Ledger
                    </h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] items-center flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        Secure Transaction Management & Reconciliation
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">

                <div className="bg-white p-7 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-rose-100/50 transition-all duration-500"></div>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 md:gap-0 relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Outstanding Balance</p>
                            <h3 className="text-3xl font-black text-rose-600 tracking-tighter">
                                {formatCurrency(dueAmount)}
                            </h3>
                            {isPaid ? (
                                <span className="inline-flex items-center gap-2 mt-4 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                                    <CheckCircle size={12} /> Settled
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-2 mt-4 text-[9px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">
                                    <AlertCircle size={12} /> Pending
                                </span>
                            )}
                        </div>
                        <div className="p-3 rounded-[1.2rem] bg-rose-600 text-white shadow-lg shadow-rose-200 group-hover:rotate-12 transition-transform">
                            <AlertCircle size={28} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-7 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-indigo-100/50 transition-all duration-500"></div>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 md:gap-0 relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Total Deposited</p>
                            <h3 className="text-3xl font-black text-indigo-600 tracking-tighter">
                                {formatCurrency(stats.paid)}
                            </h3>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-5 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                Verified Record
                            </p>
                        </div>
                        <div className="p-3 rounded-[1.2rem] bg-indigo-600 text-white shadow-lg shadow-indigo-200 group-hover:-rotate-12 transition-transform">
                            <CheckCircle size={28} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-7 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-amber-100/50 transition-all duration-500"></div>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 md:gap-0 relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Total Concessions</p>
                            <h3 className="text-3xl font-black text-amber-600 tracking-tighter">
                                {formatCurrency(stats.credit)}
                            </h3>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-5">
                                Scholarships Applied
                            </p>
                        </div>
                        <div className="p-3 rounded-[1.2rem] bg-amber-500 text-white shadow-lg shadow-amber-200">
                            <Zap size={28} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-7 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-50 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-cyan-100/50 transition-all duration-500"></div>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 md:gap-0 relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Course Value</p>
                            <h3 className="text-3xl font-black text-cyan-600 tracking-tighter">
                                {formatCurrency(stats.total)}
                            </h3>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-5 italic">
                                Academic Year Net
                            </p>
                        </div>
                        <div className="p-3 rounded-[1.2rem] bg-cyan-500 text-white shadow-lg shadow-cyan-200">
                            <BookOpen size={28} />
                        </div>
                    </div>
                </div>
            </div>



            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Fee Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                    <div className="p-6 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-gray-900">Fee Breakdown</h2>
                            <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                {filterValuesCount(filteredFees)} Items
                            </span>
                        </div>

                        {/* Year Filter */}
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-gray-400" />
                            <select
                                className="text-sm border-none bg-gray-50 rounded-lg px-3 py-1.5 font-medium text-gray-600 focus:ring-0 cursor-pointer hover:bg-gray-100 transition-colors"
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                            >
                                <option value="All">All Years</option>
                                {uniqueYears.map(year => (
                                    <option key={year} value={year}>Year {year}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        {/* Desktop Table View */}
                        <table className="w-full hidden md:table">
                            <thead className="bg-gray-50/50">
                                <tr className="text-left text-xs font-medium text-gray-500">
                                    <th className="px-4 py-3 uppercase tracking-wider">Fee Head</th>
                                    <th className="px-4 py-3 uppercase tracking-wider">Year/Sem</th>
                                    <th className="px-4 py-3 uppercase tracking-wider text-right">Total</th>
                                    <th className="px-4 py-3 uppercase tracking-wider text-right">Paid</th>
                                    <th className="px-4 py-3 uppercase tracking-wider text-right">Due</th>
                                    <th className="px-4 py-3 uppercase tracking-wider text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {displayFeeItems.length > 0 ? (
                                    displayFeeItems.map((displayItem, index) => {
                                        if (displayItem.type === 'clubGroup') {
                                            const clubInvoices = displayItem.invoices.map(invoice => {
                                                const paid = calculateInvoicePaid(invoice, transactions);
                                                return {
                                                    invoice,
                                                    clubName: getClubNameFromRemarks(invoice.remarks) || 'Club',
                                                    paid,
                                                    due: Math.max(0, Number(invoice.amount) - paid)
                                                };
                                            });
                                            const groupTotal = clubInvoices.reduce((sum, item) => sum + (Number(item.invoice.amount) || 0), 0);
                                            const groupPaid = clubInvoices.reduce((sum, item) => sum + item.paid, 0);
                                            const groupDue = clubInvoices.reduce((sum, item) => sum + item.due, 0);
                                            const isExpanded = !!expandedClubFeeGroups[displayItem.key];
                                            const groupPeriods = [...new Set(clubInvoices.map(({ invoice }) => `Year ${invoice.studentYear}${invoice.semester ? ` · Sem ${invoice.semester}` : ''}`))];

                                            return (
                                                <React.Fragment key={displayItem.key}>
                                                    <tr className="bg-slate-50/70 hover:bg-slate-100/70">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={16} /></div>
                                                                <div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedClubFeeGroups(current => ({ ...current, [displayItem.key]: !current[displayItem.key] }))}
                                                                        aria-expanded={isExpanded}
                                                                        className="flex items-center gap-2 text-left font-semibold text-gray-900 hover:text-indigo-700"
                                                                    >
                                                                        <span>Club Fee</span>
                                                                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{clubInvoices.length} {clubInvoices.length === 1 ? 'club' : 'clubs'}</span>
                                                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                    </button>
                                                                    <p className="text-xs text-gray-500">Club membership fees</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-500">{groupPeriods.length === 1 ? groupPeriods[0] : `${groupPeriods.length} academic periods`}</td>
                                                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(groupTotal)}</td>
                                                        <td className="px-4 py-3 text-right font-medium text-green-600">{formatCurrency(groupPaid)}</td>
                                                        <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(groupDue)}</td>
                                                        <td className="px-4 py-3 text-center">
                                                            {groupDue <= 0 ? (
                                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-100">Paid</span>
                                                            ) : (
                                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100">Due</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr className="bg-white">
                                                            <td colSpan={6} className="px-5 py-3">
                                                                <div className="overflow-x-auto rounded-lg border border-gray-200">
                                                                    <table className="w-full text-xs">
                                                                        <thead className="bg-gray-50 text-gray-500">
                                                                            <tr>
                                                                                <th className="px-3 py-2 text-left font-semibold">Club Name</th>
                                                                                <th className="px-3 py-2 text-left font-semibold">Year / Sem</th>
                                                                                <th className="px-3 py-2 text-right font-semibold">Fee</th>
                                                                                <th className="px-3 py-2 text-right font-semibold">Paid</th>
                                                                                <th className="px-3 py-2 text-right font-semibold">Balance</th>
                                                                                <th className="px-3 py-2 text-right font-semibold">Action</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-100">
                                                                            {clubInvoices.map(({ invoice, paid, due }) => {
                                                                                const clubName = getClubNameFromInvoice(invoice);
                                                                                return (
                                                                                <tr key={invoice._id || `${clubName}-${invoice.studentYear}-${invoice.semester}`}>
                                                                                    <td className="px-3 py-2 font-medium text-gray-800">{clubName}</td>
                                                                                    <td className="px-3 py-2 text-gray-500">Year {invoice.studentYear}{invoice.semester ? ` · Sem ${invoice.semester}` : ''}</td>
                                                                                    <td className="px-3 py-2 text-right">{formatCurrency(invoice.amount)}</td>
                                                                                    <td className="px-3 py-2 text-right text-green-700">{formatCurrency(paid)}</td>
                                                                                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(due)}</td>
                                                                                    <td className="px-3 py-2 text-right">
                                                                                        {due > 0 ? <span className="font-semibold text-red-600">Due</span> : <span className="font-semibold text-green-700">Paid</span>}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        }

                                        const inv = displayItem.invoice;
                                        const itemPaid = calculateInvoicePaid(inv, transactions);
                                        const itemDue = Math.max(0, inv.amount - itemPaid);
                                        const isFullyPaid = itemDue <= 0;

                                        // --- DISPLAY NAME LOGIC ---
                                        // If Service Fee, extract real name from remarks
                                        let displayName = inv.feeHead?.name || 'Tuition Fee';
                                        let displaySubtext = inv.remarks || 'Standard Fee';

                                        // Service Fee Display Override
                                        if (inv.feeHead?.code === 'SSF' || inv.feeHead?.name === 'Student Services FEE') {
                                            // Remarks format: "Service Request: Name (Ref: 123)"
                                            const nameMatch = inv.remarks?.match(/Service Request: (.*?) \(Ref:/);
                                            if (nameMatch && nameMatch[1]) {
                                                displayName = nameMatch[1]; // "Bonafide Certificate"
                                                displaySubtext = "Student Service Fee";
                                            }
                                        }
                                        // --------------------------

                                        return (
                                            <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                                            <FileText size={16} />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900">{displayName}</p>
                                                            <p className="text-xs text-gray-500 line-clamp-1">{displaySubtext}</p>
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {inv.isStructure ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                                                                        <BookOpen size={10} /> Academic
                                                                    </span>
                                                                ) : (
                                                                    // Check if it's a Transport fee
                                                                    (inv.feeHead?.name?.toLowerCase().includes('transport') || inv.feeHead?.name?.toLowerCase().includes('bus')) ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">
                                                                            <Bus size={10} /> Transport
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
                                                                            <Zap size={10} /> Individual
                                                                        </span>
                                                                    )
                                                                )}
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                                                    Year {inv.studentYear}
                                                                </span>
                                                                {inv.semester && (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                                                        Sem {inv.semester}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    Year {inv.studentYear} {inv.semester ? `- Sem ${inv.semester}` : ''}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-gray-900">
                                                    {formatCurrency(inv.amount)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-green-600">
                                                    {formatCurrency(itemPaid)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-red-600">
                                                    {formatCurrency(itemDue)}
                                                </td>
                                                <td className="px-4 py-3 text-center space-y-2">
                                                    {isFullyPaid ? (
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-100 block w-fit mx-auto">
                                                            Paid
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100 block w-fit mx-auto">
                                                            Due
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                                            No fee records found for the selected year.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4 p-4">
                            {displayFeeItems.length > 0 ? (
                                displayFeeItems.map((displayItem, index) => {
                                    if (displayItem.type === 'clubGroup') {
                                        const clubInvoices = displayItem.invoices.map(invoice => {
                                            const paid = calculateInvoicePaid(invoice, transactions);
                                            return {
                                                invoice,
                                                clubName: getClubNameFromRemarks(invoice.remarks) || 'Club',
                                                paid,
                                                due: Math.max(0, Number(invoice.amount) - paid)
                                            };
                                        });
                                        const groupTotal = clubInvoices.reduce((sum, item) => sum + (Number(item.invoice.amount) || 0), 0);
                                        const groupPaid = clubInvoices.reduce((sum, item) => sum + item.paid, 0);
                                        const groupDue = clubInvoices.reduce((sum, item) => sum + item.due, 0);
                                        const isExpanded = !!expandedClubFeeGroups[displayItem.key];
                                        const groupPeriods = [...new Set(clubInvoices.map(({ invoice }) => `Year ${invoice.studentYear}${invoice.semester ? ` · Sem ${invoice.semester}` : ''}`))];

                                        return (
                                            <div key={displayItem.key} className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedClubFeeGroups(current => ({ ...current, [displayItem.key]: !current[displayItem.key] }))}
                                                    aria-expanded={isExpanded}
                                                    className="flex w-full items-center justify-between gap-3 text-left"
                                                >
                                                    <span className="min-w-0">
                                                        <span className="flex flex-wrap items-center gap-2">
                                                            <span className="font-bold text-gray-900">Club Fee</span>
                                                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{clubInvoices.length} {clubInvoices.length === 1 ? 'club' : 'clubs'}</span>
                                                        </span>
                                                        <span className="mt-1 block text-xs text-gray-500">{groupPeriods.length === 1 ? groupPeriods[0] : `${groupPeriods.length} academic periods`}</span>
                                                    </span>
                                                    {isExpanded ? <ChevronDown size={18} className="shrink-0 text-gray-500" /> : <ChevronRight size={18} className="shrink-0 text-gray-500" />}
                                                </button>
                                                <div className="mt-3 grid grid-cols-3 gap-2 border-y border-gray-100 py-3 text-center">
                                                    <div><p className="text-[10px] uppercase text-gray-400">Total</p><p className="text-sm font-semibold text-gray-900">{formatCurrency(groupTotal)}</p></div>
                                                    <div><p className="text-[10px] uppercase text-gray-400">Paid</p><p className="text-sm font-semibold text-green-600">{formatCurrency(groupPaid)}</p></div>
                                                    <div><p className="text-[10px] uppercase text-gray-400">Due</p><p className="text-sm font-bold text-red-600">{formatCurrency(groupDue)}</p></div>
                                                </div>
                                                {isExpanded && (
                                                    <div className="mt-3 space-y-2">
                                                        {clubInvoices.map(({ invoice, paid, due }) => {
                                                            const clubName = getClubNameFromInvoice(invoice);
                                                            return (
                                                            <div key={invoice._id || `${clubName}-${invoice.studentYear}-${invoice.semester}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <p className="truncate text-sm font-semibold text-gray-800">{clubName}</p>
                                                                        <p className="mt-1 text-[11px] text-gray-500">Year {invoice.studentYear}{invoice.semester ? ` · Sem ${invoice.semester}` : ''} · Fee {formatCurrency(invoice.amount)} · Paid {formatCurrency(paid)} · Balance {formatCurrency(due)}</p>
                                                                    </div>
                                                                    {due > 0 ? (
                                                                        <span className="shrink-0 text-xs font-semibold text-red-600">Due</span>
                                                                    ) : <span className="shrink-0 text-xs font-semibold text-green-700">Paid</span>}
                                                                </div>
                                                            </div>
                                                        );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    const inv = displayItem.invoice;
                                    const itemPaid = calculateInvoicePaid(inv, transactions);
                                    const itemDue = Math.max(0, inv.amount - itemPaid);
                                    const isFullyPaid = itemDue <= 0;

                                    // --- DISPLAY NAME LOGIC (Mobile) ---
                                    let displayName = inv.feeHead?.name || 'Tuition Fee';
                                    let displaySubtext = inv.remarks || 'Standard Fee';

                                    if (inv.feeHead?.code === 'SSF' || inv.feeHead?.name === 'Student Services FEE') {
                                        const nameMatch = inv.remarks?.match(/Service Request: (.*?) \(Ref:/);
                                        if (nameMatch && nameMatch[1]) {
                                            displayName = nameMatch[1];
                                            displaySubtext = "Student Service Fee";
                                        }
                                    }
                                    // -----------------------------------

                                    return (
                                        <div key={index} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                                        <FileText size={16} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 text-sm">{displayName}</h4>
                                                        <span className="text-xs text-gray-500">{displaySubtext}</span>
                                                    </div>
                                                </div>
                                                {isFullyPaid ? (
                                                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                                        PAID
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                                                        DUE
                                                    </span>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-3 gap-2 text-center py-3 border-t border-b border-gray-200 mb-3">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase">Total</p>
                                                    <p className="font-semibold text-gray-900 text-sm">{formatCurrency(inv.amount)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase">Paid</p>
                                                    <p className="font-semibold text-green-600 text-sm">{formatCurrency(itemPaid)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase">Due</p>
                                                    <p className="font-bold text-red-600 text-sm">{formatCurrency(itemDue)}</p>
                                                </div>
                                            </div>


                                        </div>
                                    )
                                })
                            ) : (
                                <div className="text-center py-8 text-gray-500 text-sm">
                                    No fee records found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Transaction History */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col h-fit">
                    <div className="p-6 border-b border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
                    </div>
                    <div className="p-2 overflow-y-auto max-h-[500px]">
                        {transactions && transactions.length > 0 ? (
                            transactions.map((tx, index) => {
                                const isInactiveTransaction = tx.status && tx.status !== 'active';
                                const isCon = !isInactiveTransaction && isCredit(tx);
                                const isPayment = !isInactiveTransaction && tx.transactionType === 'DEBIT' && !isCon;

                                return (
                                    <div key={index} className="p-4 hover:bg-gray-50 rounded-xl transition-colors border-b border-gray-50 last:border-0 relative group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${isCon ? 'bg-green-100 text-green-600' : (isPayment ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600')}`}>
                                                    {isCon ? <Zap size={16} /> : (isPayment ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />)}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 text-sm">
                                                        {tx.feeHead?.name
                                                            ? `${tx.feeHead.name}`
                                                            : (isCon ? 'Credit / Waiver' : 'Fee Payment')
                                                        }
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded uppercase tracking-wide">
                                                            {tx.paymentMode || 'Unknown'}
                                                        </span>
                                                        {isInactiveTransaction && (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded uppercase tracking-wide">
                                                                {tx.status}
                                                            </span>
                                                        )}
                                                        <span className="text-xs text-gray-400">
                                                            {tx.receiptNumber ? `#${tx.receiptNumber}` : (tx.referenceNo ? `Bank RRN: ${tx.referenceNo}` : 'Ref N/A')}
                                                            {tx.gatewayPaymentId && (
                                                                <span className="block text-[10px] opacity-75 mt-0.5">
                                                                    ID: {tx.gatewayPaymentId}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-bold text-sm ${isInactiveTransaction ? 'text-gray-500 line-through' : isCon ? 'text-green-600' : 'text-red-600'}`}>
                                                    {!isInactiveTransaction && (isCon ? '+' : '-')}{formatCurrency(tx.amount)}
                                                </p>
                                                <p className="text-[10px] text-gray-400">
                                                    {new Date(tx.paymentDate).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        {tx.remarks && (
                                            <p className="text-xs text-gray-500 mt-2 ml-11 bg-gray-50 p-2 rounded border border-gray-100 italic">
                                                "{tx.remarks}"
                                            </p>
                                        )}
                                    </div>
                                )
                            })
                        ) : (
                            <div className="p-8 text-center">
                                <div className="p-3 bg-gray-50 rounded-full inline-block mb-3 text-gray-400">
                                    <Clock size={24} />
                                </div>
                                <p className="text-gray-500 text-sm">No transactions yet</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl transform transition-all scale-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Confirm Payment</h3>
                            <button
                                onClick={() => setIsPaymentModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <ArrowDownLeft size={24} className="rotate-45" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                <p className="text-sm text-indigo-600 font-medium mb-1">Paying for</p>
                                <p className="text-lg font-bold text-indigo-900">
                                    {selectedPaymentFee ? selectedPaymentFee.feeHead?.name : 'Total Due Balance'}
                                </p>
                                {selectedPaymentFee && (
                                    <p className="text-xs text-indigo-500 mt-1">
                                        Amount Due: {formatCurrency(selectedPaymentFee.amount)}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Enter Amount to Pay (INR)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                                    <input
                                        type="number"
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)}
                                        className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-bold text-lg text-gray-900"
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-2">
                                    You can initiate a partial payment if you wish.
                                </p>
                            </div>

                            <button
                                onClick={initiateTransaction}
                                disabled={paymentLoading || !payAmount || Number(payAmount) <= 0}
                                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:shadow-xl hover:translate-y-[-2px] transition-all disabled:opacity-50 disabled:translate-y-0"
                            >
                                {paymentLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Processing...
                                    </span>
                                ) : (
                                    `Pay ${formatCurrency(payAmount || 0)}`
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper for count
const filterValuesCount = (arr) => arr ? arr.length : 0;

export default FeeManagement;
