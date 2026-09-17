import React, { useState, useEffect } from 'react';
import { X, Download, FileSpreadsheet, FileText, Calendar, Users, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';

const DownloadReportsModal = ({ isOpen, onClose, filters }) => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState(null);

  useEffect(() => {
    if (isOpen) {
      // Set default dates (last 30 days)
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      setFromDate(thirtyDaysAgo.toISOString().split('T')[0]);
      setToDate(today.toISOString().split('T')[0]);
      setPreviewData(null);
      setDownloadFormat(null);
    }
  }, [isOpen]);

  const handlePreview = async () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both from and to dates');
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      toast.error('From date must be before or equal to to date');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        fromDate,
        toDate,
        format: 'json',
        ...(filters.batch && { batch: filters.batch }),
        ...(filters.course && { course: filters.course }),
        ...(filters.branch && { branch: filters.branch }),
        ...(filters.year && { year: filters.year }),
        ...(filters.semester && { semester: filters.semester })
      });

      const response = await api.get(`/attendance/download?${params.toString()}`);
      if (response.data?.success) {
        setPreviewData(response.data.data);
        toast.success('Preview data loaded successfully');
      } else {
        throw new Error(response.data?.message || 'Failed to load preview data');
      }
    } catch (error) {
      console.error('Failed to load preview:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to load preview data');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format) => {
    if (!fromDate || !toDate) {
      toast.error('Please select both from and to dates');
      return;
    }

    if (!previewData) {
      toast.error('Please preview the data first');
      return;
    }

    setDownloading(true);
    setDownloadFormat(format);

    try {
      const params = new URLSearchParams({
        fromDate,
        toDate,
        format,
        ...(filters.batch && { batch: filters.batch }),
        ...(filters.course && { course: filters.course }),
        ...(filters.branch && { branch: filters.branch }),
        ...(filters.year && { year: filters.year }),
        ...(filters.semester && { semester: filters.semester })
      });

      if (format === 'excel') {
        const response = await api.get(`/attendance/download?${params.toString()}`, {
          responseType: 'blob',
          timeout: 120000
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `attendance_report_${fromDate}_to_${toDate}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        toast.success('Excel report downloaded successfully');
      } else if (format === 'pdf') {
        // For PDF, we'll generate it on the frontend using the preview data
        await generatePDF(previewData);
        toast.success('PDF report downloaded successfully');
      }
    } catch (error) {
      console.error('Failed to download report:', error);
      toast.error(error.response?.data?.message || error.message || 'Unable to download report');
    } finally {
      setDownloading(false);
      setDownloadFormat(null);
    }
  };

  const generatePDF = async (data) => {
    // Dynamic import of jsPDF
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Check if this is an aggregated report (all students)
    const isAggregated = data.aggregatedData && Array.isArray(data.aggregatedData);

    // Title
    doc.setFontSize(18);
    doc.text(isAggregated ? 'Attendance Summary Report' : 'Attendance Report', 14, 15);
    doc.setFontSize(12);
    doc.text(`Period: ${data.fromDate} to ${data.toDate}`, 14, 22);

    let yPos = 30;

    if (isAggregated) {
      // Filter out rows with 0 students
      const filteredData = data.aggregatedData.filter((row) => row.studentCount > 0);

      // Aggregated Report Format
      doc.setFontSize(11);
      doc.text(`Total Working Days: ${data.totalWorkingDays || 0}`, 14, yPos);
      yPos += 6;
      doc.text(`Total No Class Work Days: ${data.totalHolidays || 0}`, 14, yPos);
      yPos += 6;
      doc.text(`Total Groups: ${filteredData.length}`, 14, yPos);

      // Calculate totals
      const totals = filteredData.reduce(
        (acc, row) => ({
          studentCount: acc.studentCount + row.studentCount,
          present: acc.present + row.present,
          absent: acc.absent + row.absent,
          unmarked: acc.unmarked + row.unmarked
        }),
        { studentCount: 0, present: 0, absent: 0, unmarked: 0 }
      );

      yPos += 6;
      doc.text(`Total Students: ${totals.studentCount}`, 14, yPos);
      yPos += 6;
      doc.text(`Total Present: ${totals.present}`, 14, yPos);
      yPos += 6;
      doc.text(`Total Absent: ${totals.absent}`, 14, yPos);
      yPos += 6;
      doc.text(`Total Unmarked: ${totals.unmarked}`, 14, yPos);

      // Add spacing before table
      yPos += 10;

      // Aggregated Table
      doc.setFontSize(10);
      doc.text('Attendance Summary by Batch, Program, Branch, Year & Semester', 14, yPos);
      yPos += 8;

      // Table headers with background
      const headers = ['Batch', 'Program', 'Branch', 'Year', 'Sem', 'Students', 'Present', 'Absent', 'Unmarked'];
      const colWidths = [25, 35, 30, 15, 12, 18, 18, 18, 18];
      const headerStartX = 14;
      const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
      const headerYStart = yPos - 5; // Store header top Y position
      let xPos = headerStartX;

      // Draw header background
      doc.setFillColor(240, 240, 240);
      doc.rect(headerStartX, yPos - 5, tableWidth, 7, 'F');

      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      headers.forEach((header, idx) => {
        doc.text(header, xPos + 2, yPos);
        xPos += colWidths[idx];
      });
      doc.setFont(undefined, 'normal');

      // Draw header bottom line immediately after header text
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(headerStartX, yPos + 2, headerStartX + tableWidth, yPos + 2);
      
      // Draw right edge of header
      doc.line(headerStartX + tableWidth, yPos - 5, headerStartX + tableWidth, yPos + 2);
      
      yPos += 7;

      // Table rows with alternating colors and borders
      let rowIndex = 0;
      let currentPageHeaderYStart = headerYStart; // Track header Y for current page
      filteredData.forEach((row) => {
        if (yPos > 180) {
          doc.addPage();
          yPos = 20;
          // Redraw table title on new page
          doc.setFontSize(10);
          doc.text('Attendance Summary by Batch, Course, Branch, Year & Semester', 14, yPos);
          yPos += 8;
          // Redraw headers on new page
          currentPageHeaderYStart = yPos - 5; // Update header Y for new page
          xPos = headerStartX;
          doc.setFillColor(240, 240, 240);
          doc.rect(headerStartX, yPos - 5, tableWidth, 7, 'F');
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          headers.forEach((header, idx) => {
            doc.text(header, xPos + 2, yPos);
            xPos += colWidths[idx];
          });
          doc.setFont(undefined, 'normal');
          // Draw header bottom line immediately after header text
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.5);
          doc.line(headerStartX, yPos + 2, headerStartX + tableWidth, yPos + 2);
          // Draw right edge of header
          doc.line(headerStartX + tableWidth, yPos - 5, headerStartX + tableWidth, yPos + 2);
          yPos += 7;
          rowIndex = 0;
        }

        // Alternating row background - draw before text
        // Odd rows (1, 3, 5...) get light gray background
        if (rowIndex % 2 === 1) {
          doc.setFillColor(248, 248, 248);
          doc.rect(headerStartX, yPos - 4, tableWidth, 6, 'F');
        }
        // Even rows (0, 2, 4...) keep white background (no need to draw)

        // Draw cell borders (lighter gray, thinner lines)
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.05);
        xPos = headerStartX;
        headers.forEach((_, idx) => {
          if (idx > 0) {
            doc.line(xPos, yPos - 4, xPos, yPos + 2);
          }
          xPos += colWidths[idx];
        });
        
        // Draw right edge of table (closing line after Unmarked column) for each row
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.05);
        doc.line(headerStartX + tableWidth, yPos - 4, headerStartX + tableWidth, yPos + 2);

        // Draw row bottom border (lighter)
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.05);
        doc.line(headerStartX, yPos + 2, headerStartX + tableWidth, yPos + 2);

        // Text content
        xPos = headerStartX;
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text((row.batch || 'N/A').substring(0, 10), xPos + 2, yPos);
        xPos += colWidths[0];
        doc.text((row.course || 'N/A').substring(0, 15), xPos + 2, yPos);
        xPos += colWidths[1];
        doc.text((row.branch || 'N/A').substring(0, 12), xPos + 2, yPos);
        xPos += colWidths[2];
        doc.text(String(row.year || 0), xPos + 2, yPos);
        xPos += colWidths[3];
        doc.text(String(row.semester || 0), xPos + 2, yPos);
        xPos += colWidths[4];
        doc.text(String(row.studentCount), xPos + 2, yPos);
        xPos += colWidths[5];
        doc.setTextColor(0, 128, 0);
        doc.text(String(row.present), xPos + 2, yPos);
        xPos += colWidths[6];
        doc.setTextColor(200, 0, 0);
        doc.text(String(row.absent), xPos + 2, yPos);
        xPos += colWidths[7];
        doc.setTextColor(0, 0, 0);
        doc.text(String(row.unmarked), xPos + 2, yPos);

        yPos += 6;
        rowIndex++;
      });

      // Draw closing line after last row (bottom border)
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(headerStartX, yPos - 4, headerStartX + tableWidth, yPos - 4);
      
      // Draw right edge closing line (vertical line at end of Unmarked column)
      // This draws from the first page header to the last row
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(headerStartX + tableWidth, headerYStart, headerStartX + tableWidth, yPos - 4);

      // Holidays Section
      if (yPos > 160) {
        doc.addPage();
        yPos = 20;
      }

      yPos += 10;
      doc.setFontSize(11);
      doc.text('No Class Work Days List', 14, yPos);
      yPos += 6;

      doc.setFontSize(9);
      doc.text(`Total Working Days: ${data.totalWorkingDays || 0}`, 14, yPos);
      yPos += 6;

      // Public Holidays
      if (data.publicHolidays && data.publicHolidays.length > 0) {
        doc.setFontSize(10);
        doc.text('Public No Class Work Days:', 14, yPos);
        yPos += 5;
        doc.setFontSize(8);

        data.publicHolidays.forEach((holiday) => {
          if (yPos > 180) {
            doc.addPage();
            yPos = 20;
          }
          const dateStr = `${holiday.date} (${holiday.month}/${holiday.year})`;
          doc.text(`  • ${dateStr}: ${holiday.name}`, 14, yPos);
          yPos += 5;
        });
      }

      // Institute Holidays
      if (data.instituteHolidays && data.instituteHolidays.length > 0) {
        if (yPos > 175) {
          doc.addPage();
          yPos = 20;
        }
        yPos += 3;
        doc.setFontSize(10);
        doc.text('Institute No Class Work Days:', 14, yPos);
        yPos += 5;
        doc.setFontSize(8);

        data.instituteHolidays.forEach((holiday) => {
          if (yPos > 180) {
            doc.addPage();
            yPos = 20;
          }
          const dateStr = `${holiday.date} (${holiday.month}/${holiday.year})`;
          doc.text(`  • ${dateStr}: ${holiday.name}`, 14, yPos);
          yPos += 5;
        });
      }
    } else {
      // Detailed Report Format (existing logic for filtered reports)
      // Two-column layout: Statistics on left, Filters on right
      const leftColumnX = 14;
      const rightColumnX = 100;
      let leftYPos = yPos;
      let rightYPos = yPos;

      // Left column: Statistics
      doc.setFontSize(11);
      doc.text(`Total Students: ${data.statistics?.totalStudents || 0}`, leftColumnX, leftYPos);
      leftYPos += 6;
      doc.text(`Total Present: ${data.statistics?.totalPresent || 0}`, leftColumnX, leftYPos);
      leftYPos += 6;
      doc.text(`Total Absent: ${data.statistics?.totalAbsent || 0}`, leftColumnX, leftYPos);
      leftYPos += 6;
      doc.text(`Total No Class Work Days: ${data.statistics?.totalHolidays || 0}`, leftColumnX, leftYPos);
      leftYPos += 6;
      doc.text(`Total Unmarked: ${data.statistics?.totalUnmarked || 0}`, leftColumnX, leftYPos);
      leftYPos += 6;
      doc.text(`Working Days: ${data.statistics?.workingDays || 0}`, leftColumnX, leftYPos);

      // Right column: Filters (without "Filters Applied:" label)
      if (data.filters) {
        doc.setFontSize(11);
        doc.text(`Batch: ${data.filters.batch || 'All'}`, rightColumnX, rightYPos);
        rightYPos += 6;
        doc.text(`Course: ${data.filters.course || 'All'}`, rightColumnX, rightYPos);
        rightYPos += 6;
        doc.text(`Branch: ${data.filters.branch || 'All'}`, rightColumnX, rightYPos);
        rightYPos += 6;
        doc.text(`Year: ${data.filters.year || 'All'}`, rightColumnX, rightYPos);
        rightYPos += 6;
        doc.text(`Semester: ${data.filters.semester || 'All'}`, rightColumnX, rightYPos);
      }

      // Use the maximum Y position from both columns
      yPos = Math.max(leftYPos, rightYPos);

      // Student table
      if (data.students && data.students.length > 0) {
        // Add spacing before table
        yPos += 10;
        doc.setFontSize(10);
        doc.text('Student Attendance Details', 14, yPos);
        yPos += 8;

        // Include Year and Course columns when any filter is applied
        const includeYearCourse = data.filters && (
          data.filters.batch || 
          data.filters.course || 
          data.filters.branch || 
          data.filters.year || 
          data.filters.semester
        );
        const headers = includeYearCourse
          ? ['Admission #', 'Name', 'Course', 'Year', 'Present', 'Absent', 'Unmarked']
          : ['Admission #', 'Name', 'Present', 'Absent', 'Unmarked'];
        const colWidths = includeYearCourse
          ? [28, 50, 25, 15, 20, 20, 20]
          : [30, 60, 25, 25, 25];
        const tableStartX = 14;
        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
        const studentTableHeaderYStart = yPos - 5; // Store header top Y position
        let xPos = tableStartX;

        // Draw header background
        doc.setFillColor(240, 240, 240);
        doc.rect(tableStartX, yPos - 5, tableWidth, 7, 'F');

        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        headers.forEach((header, idx) => {
          doc.text(header, xPos + 2, yPos);
          xPos += colWidths[idx];
        });
        doc.setFont(undefined, 'normal');

        // Draw header bottom line immediately after header text
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(tableStartX, yPos + 2, tableStartX + tableWidth, yPos + 2);
        
        yPos += 7;

        const maxRows = Math.min(data.students.length, 15);
        let studentRowIndex = 0;
        let currentPageStudentHeaderYStart = studentTableHeaderYStart; // Track header Y for current page
        data.students.slice(0, maxRows).forEach((student) => {
          if (yPos > 180) {
            doc.addPage();
            yPos = 20;
            // Redraw table title on new page
            doc.setFontSize(10);
            doc.text('Student Attendance Details', 14, yPos);
            yPos += 8;
            // Redraw headers on new page (use same headers and colWidths)
            currentPageStudentHeaderYStart = yPos - 5; // Update header Y for new page
            xPos = tableStartX;
            doc.setFillColor(240, 240, 240);
            doc.rect(tableStartX, yPos - 5, tableWidth, 7, 'F');
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            headers.forEach((header, idx) => {
              doc.text(header, xPos + 2, yPos);
              xPos += colWidths[idx];
            });
            doc.setFont(undefined, 'normal');
            // Draw header bottom line immediately after header text
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.5);
            doc.line(tableStartX, yPos + 2, tableStartX + tableWidth, yPos + 2);
            // Draw right edge of header
            doc.line(tableStartX + tableWidth, yPos - 5, tableStartX + tableWidth, yPos + 2);
            yPos += 7;
            studentRowIndex = 0;
          }

          // Alternating row background
          if (studentRowIndex % 2 === 1) {
            doc.setFillColor(248, 248, 248);
            doc.rect(tableStartX, yPos - 4, tableWidth, 6, 'F');
          }

          // Draw cell borders
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.05);
          xPos = tableStartX;
          headers.forEach((_, idx) => {
            if (idx > 0) {
              doc.line(xPos, yPos - 4, xPos, yPos + 2);
            }
            xPos += colWidths[idx];
          });
          
          // Draw right edge of table (closing line after Unmarked column)
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.05);
          doc.line(tableStartX + tableWidth, yPos - 4, tableStartX + tableWidth, yPos + 2);
          
          doc.line(tableStartX, yPos + 2, tableStartX + tableWidth, yPos + 2);

          let presentCount = 0;
          let absentCount = 0;
          let unmarkedCount = 0;

          if (data.dates) {
            data.dates.forEach((date) => {
              const isHoliday = data.holidayInfo?.dates?.includes(date);
              if (!isHoliday) {
                const status = student.attendance?.[date] || null;
                if (status === 'present') presentCount++;
                else if (status === 'absent') absentCount++;
                else unmarkedCount++;
              }
            });
          }

          xPos = tableStartX;
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text((student.admissionNumber || '-').substring(0, 12), xPos + 2, yPos);
          xPos += colWidths[0];
          doc.text((student.studentName || '').substring(0, includeYearCourse ? 20 : 25), xPos + 2, yPos);
          xPos += colWidths[1];
          
          if (includeYearCourse) {
            // Course column
            doc.text((student.course || '-').substring(0, 12), xPos + 2, yPos);
            xPos += colWidths[2];
            // Year column
            doc.text(String(student.year || student.currentYear || '-'), xPos + 2, yPos);
            xPos += colWidths[3];
          }
          
          doc.setTextColor(0, 128, 0);
          doc.text(String(presentCount), xPos + 2, yPos);
          xPos += colWidths[includeYearCourse ? 4 : 2];
          doc.setTextColor(200, 0, 0);
          doc.text(String(absentCount), xPos + 2, yPos);
          xPos += colWidths[includeYearCourse ? 5 : 3];
          doc.setTextColor(0, 0, 0);
          doc.text(String(unmarkedCount), xPos + 2, yPos);

          yPos += 6;
          studentRowIndex++;
        });

        // Draw closing line after last row (bottom border)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(tableStartX, yPos - 4, tableStartX + tableWidth, yPos - 4);
        
        // Draw right edge closing line (vertical line at end of table)
        // This draws from the first page header to the last row
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(tableStartX + tableWidth, studentTableHeaderYStart, tableStartX + tableWidth, yPos - 4);

        if (data.students.length > maxRows) {
          doc.addPage();
          yPos = 20;
          doc.setFontSize(10);
          doc.text(`... and ${data.students.length - maxRows} more students`, 14, yPos);
        }
      }
    }

    // Save PDF
    doc.save(`attendance_${isAggregated ? 'summary' : 'report'}_${data.fromDate}_to_${data.toDate}.pdf`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2 text-blue-600">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Download Attendance Reports</h2>
              <p className="text-sm text-gray-600">Select date range and download format</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Date Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Calendar size={16} />
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                max={toDate || undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Calendar size={16} />
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={fromDate || undefined}
              />
            </div>
          </div>

          {/* Preview Button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handlePreview}
              disabled={loading || !fromDate || !toDate}
              className={`inline-flex items-center gap-2 px-6 py-2 rounded-lg border transition-colors ${
                loading || !fromDate || !toDate
                  ? 'border-gray-200 text-gray-400 bg-gray-100 cursor-not-allowed'
                  : 'border-blue-500 text-white bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Loading Preview...
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Preview Data
                </>
              )}
            </button>
          </div>

          {/* Preview Statistics */}
          {previewData && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users size={18} />
                {previewData.aggregatedData ? 'Summary Report Preview' : 'Report Preview'}
              </h3>

              {previewData.aggregatedData ? (
                // Aggregated Report Preview
                <>
                  {(() => {
                    const filteredPreviewData = previewData.aggregatedData.filter((row) => row.studentCount > 0);
                    return (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">Total Groups</div>
                            <div className="text-2xl font-bold text-gray-900 mt-1">
                              {filteredPreviewData.length}
                            </div>
                          </div>
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                      <div className="text-xs text-blue-600 uppercase tracking-wide">Working Days</div>
                      <div className="text-2xl font-bold text-blue-700 mt-1">
                        {previewData.totalWorkingDays || 0}
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                      <div className="text-xs text-amber-600 uppercase tracking-wide flex items-center gap-1">
                        <AlertCircle size={12} />
                        No Class Work Days
                      </div>
                      <div className="text-2xl font-bold text-amber-700 mt-1">
                        {previewData.totalHolidays || 0}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
                      <div className="text-xs text-purple-600 uppercase tracking-wide">Public No Class Work Days</div>
                      <div className="text-2xl font-bold text-purple-700 mt-1">
                        {previewData.publicHolidays?.length || 0}
                      </div>
                    </div>
                    <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-3">
                      <div className="text-xs text-indigo-600 uppercase tracking-wide">Institute No Class Work Days</div>
                      <div className="text-2xl font-bold text-indigo-700 mt-1">
                        {previewData.instituteHolidays?.length || 0}
                      </div>
                    </div>
                  </div>

                  {/* Aggregated Table Preview */}
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Summary by Batch, Course, Branch, Year & Semester</h4>
                    <div className="overflow-x-auto max-h-64 border border-gray-200 rounded-lg bg-white">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Batch</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Course</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Branch</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Year</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Sem</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Students</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-green-600">Present</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-red-600">Absent</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Unmarked</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredPreviewData.slice(0, 10).map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-900">{row.batch || 'N/A'}</td>
                              <td className="px-3 py-2 text-gray-900">{row.course || 'N/A'}</td>
                              <td className="px-3 py-2 text-gray-900">{row.branch || 'N/A'}</td>
                              <td className="px-3 py-2 text-gray-900">{row.year || 0}</td>
                              <td className="px-3 py-2 text-gray-900">{row.semester || 0}</td>
                              <td className="px-3 py-2 text-right font-medium">{row.studentCount}</td>
                              <td className="px-3 py-2 text-right text-green-700 font-medium">{row.present}</td>
                              <td className="px-3 py-2 text-right text-red-700 font-medium">{row.absent}</td>
                              <td className="px-3 py-2 text-right text-gray-700 font-medium">{row.unmarked}</td>
                            </tr>
                          ))}
                        </tbody>
                        {filteredPreviewData.length > 10 && (
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={9} className="px-3 py-2 text-xs text-gray-500">
                                Showing first 10 of {filteredPreviewData.length} groups
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                // Detailed Report Preview (existing)
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Total Students</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {previewData.statistics?.totalStudents || 0}
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg border border-green-200 p-3">
                    <div className="text-xs text-green-600 uppercase tracking-wide flex items-center gap-1">
                      <CheckCircle size={12} />
                      Present
                    </div>
                    <div className="text-2xl font-bold text-green-700 mt-1">
                      {previewData.statistics?.totalPresent || 0}
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-lg border border-red-200 p-3">
                    <div className="text-xs text-red-600 uppercase tracking-wide flex items-center gap-1">
                      <XCircle size={12} />
                      Absent
                    </div>
                    <div className="text-2xl font-bold text-red-700 mt-1">
                      {previewData.statistics?.totalAbsent || 0}
                    </div>
                  </div>
                  <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                    <div className="text-xs text-amber-600 uppercase tracking-wide flex items-center gap-1">
                      <AlertCircle size={12} />
                      No Class Work Days
                    </div>
                    <div className="text-2xl font-bold text-amber-700 mt-1">
                      {previewData.statistics?.totalHolidays || 0}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Unmarked</div>
                    <div className="text-2xl font-bold text-gray-700 mt-1">
                      {previewData.statistics?.totalUnmarked || 0}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                    <div className="text-xs text-blue-600 uppercase tracking-wide">Working Days</div>
                    <div className="text-2xl font-bold text-blue-700 mt-1">
                      {previewData.statistics?.workingDays || 0}
                    </div>
                  </div>
                </div>
              )}

              {/* Download Buttons */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => handleDownload('excel')}
                  disabled={downloading}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg border transition-colors ${
                    downloading && downloadFormat === 'excel'
                      ? 'border-gray-200 text-gray-400 bg-gray-100 cursor-not-allowed'
                      : 'border-green-500 text-white bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {downloading && downloadFormat === 'excel' ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet size={18} />
                      Download Excel
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('pdf')}
                  disabled={downloading}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg border transition-colors ${
                    downloading && downloadFormat === 'pdf'
                      ? 'border-gray-200 text-gray-400 bg-gray-100 cursor-not-allowed'
                      : 'border-red-500 text-white bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {downloading && downloadFormat === 'pdf' ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText size={18} />
                      Download PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DownloadReportsModal;

