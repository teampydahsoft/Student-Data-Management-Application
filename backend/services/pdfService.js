const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { masterPool } = require('../config/database');

const { downloadLogo } = require('./pdf/utils');
const {
  generateStudyCertificate,
  generateRefundApplication,
  generateDynamicCertificate,
  generateCustodianCertificate,
  generateTemplatedCertificate
} = require('./pdf/certificateGenerators');



/**
 * Generate Attendance Report PDF with comprehensive sections:
 * 1. Overall Summary Report
 * 2. Tabular format by Batch/Course/Semester/Year
 * 3. Detailed Student List (optional, excluded when statsOnly is true)
 */
const generateAttendanceReportPDF = async ({
  collegeName,
  batch,
  courseName,
  branchName,
  year,
  semester,
  attendanceDate,
  students,
  attendanceRecords,
  allBatchesData = null, // Optional: all batches data for comprehensive report
  excludeCourse = false, // Optional: exclude course column from tables (for email reports)
  statsOnly = false, // Optional: if true, only include stats (exclude detailed student list)
  summaryStats = null, // Optional: pre-calculated stats
  ...args // Catch-all for any other props
}) => {
  // Filter out cancelled/discontinued/course completed students (already filtered in query, but double-check)
  const validStudents = students.filter(s => {
    const status = s.student_status || (s.student_data && s.student_data['Student Status']);
    // Exclude Course Completed, Discontinued, Admission Cancelled, etc.
    // Only include Regular students
    return status === 'Regular';
  });

  // Separate marked and unmarked students
  const markedStudents = validStudents.filter(s => {
    return attendanceRecords.some(r => r.studentId === s.id);
  });

  const unmarkedStudents = validStudents.filter(s => {
    return !attendanceRecords.some(r => r.studentId === s.id);
  });

  // Create a temporary file path
  const tempDir = os.tmpdir();
  const fileName = `attendance_report_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
  const filePath = path.join(tempDir, fileName);

  // Create PDF document with reduced margins for better space utilization
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40
  });

  // Pipe to file
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Helper function to add a new page if needed
  const checkPageBreak = (requiredSpace = 20) => {
    if (doc.y + requiredSpace > doc.page.height - 50) {
      doc.addPage();
      return true;
    }
    return false;
  };

  // ============================================
  // HEADER SECTION: COLLEGE HEADER (Report Style)
  // ============================================
  // Check if we have data from multiple colleges
  // Extract unique colleges from allBatchesData if available
  const uniqueColleges = allBatchesData
    ? [...new Set(allBatchesData.map(b => b.college))].filter(Boolean)
    : (collegeName ? [collegeName] : []);

  const hasMultipleColleges = uniqueColleges.length > 1;
  const isGlobalReport = hasMultipleColleges; // Alias for clarity

  // ============================================
  // HEADER SECTION: COLLEGE HEADER (Report Style)
  // ============================================
  // Fetch college details from database
  let collegeDetails = {
    name: collegeName || (isGlobalReport ? 'Pydah Group of Educational Institutions' : 'College Name'),
    affiliation: isGlobalReport ? 'All Campuses' : 'An Autonomous Institution',
    location: 'Kakinada | Andhra Pradesh | INDIA'
  };

  if (!isGlobalReport && collegeName) {
    try {
      const [collegeRows] = await masterPool.query(
        'SELECT name, metadata FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
        [collegeName]
      );
      if (collegeRows && collegeRows.length > 0) {
        const college = collegeRows[0];
        collegeDetails.name = college.name;
        if (college.metadata) {
          const metadata = typeof college.metadata === 'string'
            ? JSON.parse(college.metadata)
            : college.metadata;
          if (metadata.affiliation) collegeDetails.affiliation = metadata.affiliation;
          if (metadata.location) collegeDetails.location = metadata.location;
        }
      }
    } catch (error) {
      console.warn('Could not fetch college details:', error.message);
    }
  }

  const headerTop = 40;
  const pageWidth = doc.page.width;
  const leftMargin = 40;
  const rightMargin = 40;
  const contentWidth = pageWidth - leftMargin - rightMargin; // 515 points

  // Header height - enough for logo + college info + report title
  const headerHeight = 90; // Reduced from 120 for tighter header

  // Logo section (left side) - 80 points wide
  const logoWidth = 80;
  const logoHeight = 80;
  const logoLeft = leftMargin + 10;
  const logoTop = headerTop + 10;

  let logoLoaded = false;
  let tempLogoPath = null;

  // Try to download logo from URL
  try {
    tempLogoPath = await downloadLogo();
    if (fs.existsSync(tempLogoPath)) {
      doc.image(tempLogoPath, logoLeft, logoTop, {
        width: logoWidth,
        height: logoHeight,
        fit: [logoWidth, logoHeight],
        align: 'left'
      });
      logoLoaded = true;
      // Clean up temp file after a short delay
      setTimeout(() => {
        try {
          if (fs.existsSync(tempLogoPath)) {
            fs.unlinkSync(tempLogoPath);
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 5000);
    }
  } catch (error) {
    console.warn('Could not download logo from URL:', error.message);
  }

  // Fallback: Try to load logo from public folder
  if (!logoLoaded) {
    const localLogoPath = path.join(process.cwd(), 'frontend', 'public', 'logo.png');
    if (fs.existsSync(localLogoPath)) {
      try {
        doc.image(localLogoPath, logoLeft, logoTop, {
          width: logoWidth,
          height: logoHeight,
          fit: [logoWidth, logoHeight],
          align: 'left'
        });
        logoLoaded = true;
      } catch (error) {
        console.warn('Could not load local logo image:', error.message);
      }
    }
  }

  // If logo still not loaded, create text-based logo placeholder
  if (!logoLoaded) {
    // Draw logo box with rounded corners effect
    doc.rect(logoLeft, logoTop, logoWidth, logoHeight)
      .fillColor('#FF6B35') // Orange
      .fill()
      .strokeColor('#FF6B35')
      .stroke();

    // Add "PYDAH" text in logo box
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('PYDAH', logoLeft + 5, logoTop + 20, {
      width: logoWidth - 10,
      align: 'center'
    });

    doc.fontSize(8).font('Helvetica').fillColor('#FFFFFF');
    doc.text('GROUP', logoLeft + 5, logoTop + 45, {
      width: logoWidth - 10,
      align: 'right'
    });

    // Use Helvetica-Oblique for italic text (PDFKit standard font)
    doc.fontSize(7).font('Helvetica-Oblique').fillColor('#FFFFFF');
    doc.text('Education & Beyond', logoLeft + 5, logoTop + 60, {
      width: logoWidth - 10,
      align: 'center'
    });
  }

  // College info section (right side)
  const collegeInfoLeft = logoLeft + logoWidth + 20;
  const collegeInfoWidth = contentWidth - logoWidth - 30;

  // College Name (Large, Bold, Dark Gray)
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#1F2937'); // Gray-800
  // Adjust font size for long college names or global report title
  if (collegeDetails.name.length > 30) {
    doc.fontSize(18);
  }
  doc.text(collegeDetails.name, collegeInfoLeft, headerTop + 10, {
    width: collegeInfoWidth,
    align: 'left'
  });

  // Affiliation/Location (Small, Light Gray)
  doc.fontSize(9).font('Helvetica').fillColor('#6B7280'); // Gray-500
  const affiliationText = `${collegeDetails.affiliation} ${collegeDetails.location}`;
  doc.text(affiliationText, collegeInfoLeft, headerTop + 35, {
    width: collegeInfoWidth,
    align: 'left'
  });

  // Report Title (Medium, Bold, Orange)
  const reportMonth = new Date(attendanceDate).toLocaleDateString('en-IN', { month: 'long' });
  const reportYear = new Date(attendanceDate).getFullYear();
  const reportTitle = isGlobalReport
    ? `Global Attendance Summary Report - ${reportMonth} - ${reportYear}`
    : `Attendance Summary Report - ${reportMonth} - ${reportYear}`;

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#FF6B35'); // Orange
  doc.text(reportTitle, collegeInfoLeft, headerTop + 55, {
    width: collegeInfoWidth,
    align: 'left'
  });

  // Date (centered in the middle of the entire page, replacing the subtitle)
  const formattedDate = new Date(attendanceDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  doc.fontSize(11).font('Helvetica').fillColor('#374151'); // Gray-700
  doc.text(`Date: ${formattedDate}`, leftMargin, headerTop + 75, {
    width: contentWidth, // Use full content width for centering
    align: 'center' // Center the date across the entire page
  });

  // Orange border line at bottom of header
  const borderY = headerTop + headerHeight - 2;
  doc.rect(leftMargin, borderY, contentWidth, 2)
    .fillColor('#FF6B35') // Orange
    .fill();

  // Reset color
  doc.fillColor('#000000');
  doc.y = headerTop + headerHeight + 5; // Reduced gap from 15 to 5

  // ============================================
  // SECTION 1: ATTENDANCE SUMMARY REPORT
  // ============================================
  doc.moveDown(0.2); // Reduced from 0.5

  // Summary Information Box with better styling
  const summaryBoxTop = doc.y;
  const summaryBoxHeight = 100; // Reduced height since we removed fields

  // Box background (light gray)
  doc.rect(leftMargin, summaryBoxTop, contentWidth, summaryBoxHeight)
    .fillColor('#F8FAFC') // Slate-50
    .fill()
    .stroke('#CBD5E1'); // Slate-300 border

  // Section title with background
  doc.rect(leftMargin, summaryBoxTop, contentWidth, 30)
    .fillColor('#1E40AF') // Blue-800
    .fill();

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text('Summary Information', 60, summaryBoxTop + 8);
  doc.fillColor('#000000');

  doc.fontSize(10).font('Helvetica');
  let yPos = summaryBoxTop + 40;
  const leftCol = 60;
  const rightCol = 320;
  const lineHeight = 18;

  // Left column labels (bold)
  doc.font('Helvetica-Bold');
  doc.text('College:', leftCol, yPos);
  if (!excludeCourse && !isGlobalReport) {
    doc.text('Course:', leftCol, yPos + lineHeight);
  } else if (isGlobalReport) {
    doc.text('Scope:', leftCol, yPos + lineHeight);
  }

  // Adjust line positions based on fields displayed
  let currentYOffset = lineHeight * (isGlobalReport ? 2 : (excludeCourse ? 1 : 2));

  if (!isGlobalReport) {
    doc.text('Branch:', leftCol, yPos + currentYOffset);
  }

  // Left column values
  doc.font('Helvetica');
  const collegeDisplay = isGlobalReport ? 'All Colleges' : (collegeName || 'N/A');
  doc.text(collegeDisplay, leftCol + 60, yPos, { width: 200, ellipsis: true });

  if (!excludeCourse && !isGlobalReport) {
    doc.text(courseName || 'N/A', leftCol + 60, yPos + lineHeight, { width: 200, ellipsis: true });
  } else if (isGlobalReport) {
    doc.text('All Courses & Branches', leftCol + 60, yPos + lineHeight, { width: 200, ellipsis: true });
  }

  currentYOffset = lineHeight * (isGlobalReport ? 2 : (excludeCourse ? 1 : 2));

  if (!isGlobalReport) {
    // Branch name with proper truncation for long text to prevent alignment issues
    const branchText = branchName || 'N/A';
    const branchY = yPos + currentYOffset;
    // Truncate branch name if too long to prevent overflow
    const maxBranchLength = 50; // Characters before truncation
    const truncatedBranchText = branchText.length > maxBranchLength
      ? branchText.substring(0, maxBranchLength) + '...'
      : branchText;
    doc.text(truncatedBranchText, leftCol + 60, branchY, {
      width: 200,
      ellipsis: false // Already truncated manually
    });
  }

  // Right column labels (bold)
  doc.font('Helvetica-Bold');
  doc.text('Total Students:', rightCol, yPos);
  doc.text('Present:', rightCol, yPos + lineHeight);
  doc.text('Absent:', rightCol, yPos + (lineHeight * 2));

  // Calculate statistics (only for valid students, excluding course completed)
  let totalStudents, presentCount, absentCount;

  if (summaryStats) {
    ({ totalStudents, presentCount, absentCount } = summaryStats);
  } else {
    totalStudents = validStudents.length;
    presentCount = attendanceRecords.filter(r => {
      const student = validStudents.find(s => s.id === r.studentId);
      return student && r.status === 'present';
    }).length;
    absentCount = attendanceRecords.filter(r => {
      const student = validStudents.find(s => s.id === r.studentId);
      return student && r.status === 'absent';
    }).length;
  }

  // Right column values
  doc.font('Helvetica');
  doc.text(totalStudents.toString(), rightCol + 85, yPos);
  doc.fillColor('#10B981'); // Green for present
  doc.text(presentCount.toString(), rightCol + 85, yPos + lineHeight);
  doc.fillColor('#EF4444'); // Red for absent
  doc.text(absentCount.toString(), rightCol + 85, yPos + (lineHeight * 2));
  doc.fillColor('#000000'); // Reset to black
  doc.font('Helvetica');

  doc.y = summaryBoxTop + summaryBoxHeight + 5;
  doc.moveDown(0.2);

  // ============================================
  // SECTION 2: TABULAR FORMAT BY BATCH/COURSE/SEMESTER/YEAR
  // ============================================
  if (allBatchesData && allBatchesData.length > 0) {
    checkPageBreak(60);

    // Section title with background
    const tabularSectionTop = doc.y;
    doc.rect(leftMargin, tabularSectionTop, contentWidth, 30)
      .fillColor('#1E40AF') // Blue-800
      .fill();

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF');
    const tableTitle = isGlobalReport
      ? 'Global Attendance Summary by College/Course'
      : 'Attendance Summary by Batch/Course/Branch/Year/Semester';

    doc.text(tableTitle, leftMargin, tabularSectionTop + 8, {
      width: contentWidth,
      align: 'center'
    });
    doc.fillColor('#000000');

    doc.y = tabularSectionTop + 35;
    doc.moveDown(0.3);

    // Table for batch-wise summary
    const summaryTableTop = doc.y;
    const summaryTableLeft = leftMargin;
    const summaryTableWidth = contentWidth;

    // Adjust column widths based on whether course is excluded AND if we have multiple colleges
    let summaryColWidths;
    let summaryHeaders;

    if (isGlobalReport) {
      // Global Report: Added College, Batch, Year, Sem Columns
      // College, Course, Branch, Batch, Year, Sem, Tot, Abs
      summaryColWidths = [120, 80, 80, 60, 40, 40, 45, 50]; // Total: 515
      summaryHeaders = ['College', 'Course', 'Branch', 'Batch', 'Year', 'Sem', 'Tot', 'Abs'];
    } else if (excludeCourse) {
      // Branch, Batch, Year, Sem, Total, Absent
      summaryColWidths = [170, 85, 65, 65, 65, 65];
      summaryHeaders = ['Branch', 'Batch', 'Year', 'Sem', 'Total', 'Absent'];
    } else {
      // Course, Branch, Batch, Year, Sem, Total, Absent
      summaryColWidths = [110, 110, 65, 50, 50, 60, 70];
      summaryHeaders = ['Course', 'Branch', 'Batch', 'Year', 'Sem', 'Total', 'Absent'];
    }

    const summaryHeaderHeight = 25;
    const summaryRowHeight = 20;

    // Header background
    doc.rect(summaryTableLeft, summaryTableTop, summaryTableWidth, summaryHeaderHeight)
      .fillColor('#1E40AF') // Blue-800
      .fill()
      .stroke('#1E3A8A'); // Blue-900 border

    // Header text
    doc.fontSize(isGlobalReport ? 7 : 8).font('Helvetica-Bold').fillColor('#FFFFFF');
    let summaryXPos = summaryTableLeft + 3;
    summaryHeaders.forEach((header, idx) => {
      doc.text(header, summaryXPos, summaryTableTop + 7);
      summaryXPos += summaryColWidths[idx];
    });
    doc.fillColor('#000000');

    // Table rows for each batch/course/branch/year/semester combination
    let summaryCurrentY = summaryTableTop + summaryHeaderHeight;
    let summaryRowIdx = 0;

    // Sort allBatchesData for consistent display
    const sortedBatches = [...allBatchesData].sort((a, b) => {
      if (a.college !== b.college) return a.college.localeCompare(b.college);
      if (a.course !== b.course) return a.course.localeCompare(b.course);
      if (a.batch !== b.batch) return String(a.batch).localeCompare(String(b.batch));
      if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
      if (a.year !== b.year) return String(a.year).localeCompare(String(b.year));
      return String(a.semester).localeCompare(String(b.semester));
    });

    for (const group of sortedBatches) {
      // Check page break
      if (summaryCurrentY + summaryRowHeight > doc.page.height - 40) {
        doc.addPage();
        summaryCurrentY = 40;
        // Redraw header
        doc.rect(summaryTableLeft, summaryCurrentY, summaryTableWidth, summaryHeaderHeight)
          .fillColor('#1E40AF')
          .fill()
          .stroke('#1E3A8A');
        summaryXPos = summaryTableLeft + 3;
        doc.fontSize(isGlobalReport ? 7 : 8).font('Helvetica-Bold').fillColor('#FFFFFF');
        summaryHeaders.forEach((header, idx) => {
          doc.text(header, summaryXPos, summaryCurrentY + 7);
          summaryXPos += summaryColWidths[idx];
        });
        doc.fillColor('#000000');
        summaryCurrentY += summaryHeaderHeight;
        summaryRowIdx = 0;
      }

      // Alternate row background
      if (summaryRowIdx % 2 === 1) {
        doc.rect(summaryTableLeft, summaryCurrentY, summaryTableWidth, summaryRowHeight)
          .fillColor('#F8FAFC')
          .fill();
      }

      // Row border
      doc.rect(summaryTableLeft, summaryCurrentY, summaryTableWidth, summaryRowHeight)
        .strokeColor('#E2E8F0')
        .stroke();

      // Row data
      doc.fontSize(7).font('Helvetica').fillColor('#000000');
      summaryXPos = summaryTableLeft + 3;

      if (isGlobalReport) {
        // Global Report Columns: College, Course, Branch, Batch, Year, Sem, Tot, Abs

        // College
        let collegeVal = group.college || 'N/A';
        if (collegeVal.includes('College of Engineering')) collegeVal = collegeVal.replace('College of Engineering', 'COE');
        if (collegeVal.includes('College of Engineering & Technology')) collegeVal = collegeVal.replace('College of Engineering & Technology', 'CET');
        if (collegeVal.includes('Degree College')) collegeVal = collegeVal.replace('Degree College', 'Degree');
        doc.text(collegeVal.substring(0, 30), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[0] - 3, ellipsis: true });
        summaryXPos += summaryColWidths[0];

        // Course
        doc.text(String(group.course || 'N/A').substring(0, 20), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[1] - 3, ellipsis: true });
        summaryXPos += summaryColWidths[1];

        // Branch
        doc.text(String(group.branch || 'N/A').substring(0, 20), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[2] - 3, ellipsis: true });
        summaryXPos += summaryColWidths[2];

        // Batch
        doc.text(String(group.batch || 'N/A'), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[3] - 2, ellipsis: true });
        summaryXPos += summaryColWidths[3];

        // Year
        doc.text(String(group.year || 'N/A'), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[4] - 2, ellipsis: true });
        summaryXPos += summaryColWidths[4];

        // Sem
        doc.text(String(group.semester || 'N/A'), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[5] - 2, ellipsis: true });
        summaryXPos += summaryColWidths[5];

        // Total
        const totalVal = group.total || group.statistics?.totalStudents || 0;
        doc.text(String(totalVal), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[6] - 2, ellipsis: true });
        summaryXPos += summaryColWidths[6];

        // Absent
        doc.fillColor('#EF4444');
        const absVal = group.absent || group.statistics?.absentCount || 0;
        doc.text(String(absVal), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[7] - 2, ellipsis: true });
      } else {
        // Standard Report Logic

        // Course (only if not excluded)
        if (!excludeCourse) {
          doc.text(String(group.course || 'N/A').substring(0, 20), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[0] - 3, ellipsis: true });
          summaryXPos += summaryColWidths[0];
        }

        // Branch
        const branchColIdx = excludeCourse ? 0 : 1;
        doc.text(String(group.branch || 'N/A').substring(0, 20), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[branchColIdx] - 3, ellipsis: true });
        summaryXPos += summaryColWidths[branchColIdx];

        // Batch
        const batchColIdx = excludeCourse ? 1 : 2;
        doc.text(String(group.batch || 'N/A'), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[batchColIdx] - 2, ellipsis: true });
        summaryXPos += summaryColWidths[batchColIdx];

        // Year
        const yearColIdx = excludeCourse ? 2 : 3;
        doc.text(String(group.year || 'N/A'), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[yearColIdx] - 2, ellipsis: true });
        summaryXPos += summaryColWidths[yearColIdx];

        // Sem
        const semColIdx = excludeCourse ? 3 : 4;
        doc.text(String(group.semester || 'N/A'), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[semColIdx] - 2, ellipsis: true });
        summaryXPos += summaryColWidths[semColIdx];

        // Total
        const totalColIdx = excludeCourse ? 4 : 5;
        const totalVal = group.total || group.statistics?.totalStudents || 0;
        doc.text(String(totalVal), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[totalColIdx] - 3, ellipsis: true });
        summaryXPos += summaryColWidths[totalColIdx];

        // Absent
        const absentColIdx = excludeCourse ? 5 : 6;
        doc.fillColor('#EF4444'); // Red
        const absVal = group.absent || group.statistics?.absentCount || 0;
        doc.text(String(absVal), summaryXPos, summaryCurrentY + 5, { width: summaryColWidths[absentColIdx] - 3, ellipsis: true });
      }

      doc.font('Helvetica');
      doc.fillColor('#000000'); // Reset to black
      doc.fillColor('#000000');

      summaryCurrentY += summaryRowHeight;
      summaryRowIdx++;
    }

    doc.y = summaryCurrentY + 15;
    doc.moveDown(0.5);
  }

  // ============================================
  // SECTION 3: DETAILED STUDENT LIST (only if statsOnly is false)
  // ============================================
  if (!statsOnly) {
    // Helper function to render student table
    const renderStudentTable = (studentList, sectionTitle, tableTop) => {
      if (studentList.length === 0) return tableTop;

      checkPageBreak(40);

      // Section title with background
      const sectionTitleTop = tableTop;
      doc.rect(leftMargin, sectionTitleTop, contentWidth, 30)
        .fillColor('#1E40AF') // Blue-800
        .fill();

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text(sectionTitle, leftMargin, sectionTitleTop + 8, {
        width: contentWidth,
        align: 'center'
      });
      doc.fillColor('#000000');

      doc.y = sectionTitleTop + 35;
      doc.moveDown(0.3);

      // Table Header - Adjusted column widths to prevent mobile number merging
      const tableHeaderTop = doc.y;
      const tableLeft = leftMargin;
      const tableWidth = contentWidth; // Use full content width (515 points)
      // Column widths: PIN, Name, Branch, Year+Sem, Student Mobile, Parent Mobile, Status
      // Increased mobile number columns to prevent merging (Total: 45+125+65+50+90+90+50 = 515)
      const colWidths = [45, 125, 65, 50, 90, 90, 50];
      const tableHeaderHeight = 28;
      const rowHeight = 22;

      // Header background with blue color
      doc.rect(tableLeft, tableHeaderTop, tableWidth, tableHeaderHeight)
        .fillColor('#1E40AF') // Blue-800
        .fill()
        .stroke('#1E3A8A'); // Blue-900 border

      // Header text (white on blue background)
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      const headers = ['PIN', 'Student Name', 'Branch', 'Year+Sem', 'Student Mobile', 'Parent Mobile', 'Status'];
      let xPos = tableLeft + 5;
      headers.forEach((header, index) => {
        doc.text(header, xPos, tableHeaderTop + 8);
        xPos += colWidths[index];
      });
      doc.fillColor('#000000'); // Reset to black

      // Table rows
      let currentY = tableHeaderTop + tableHeaderHeight;
      let rowIndex = 0;

      studentList.forEach((student, index) => {
        // Check if we need a new page
        if (currentY + rowHeight > doc.page.height - 40) {
          doc.addPage();
          // Redraw header on new page
          currentY = 40;
          doc.rect(tableLeft, currentY, tableWidth, tableHeaderHeight)
            .fillColor('#1E40AF') // Blue-800
            .fill()
            .stroke('#1E3A8A'); // Blue-900 border
          xPos = tableLeft + 5;
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
          headers.forEach((header, idx) => {
            doc.text(header, xPos, currentY + 8);
            xPos += colWidths[idx];
          });
          doc.fillColor('#000000'); // Reset to black
          currentY += tableHeaderHeight;
          rowIndex = 0;
        }

        // Alternate row background (subtle gray for better readability)
        if (rowIndex % 2 === 1) {
          doc.rect(tableLeft, currentY, tableWidth, rowHeight)
            .fillColor('#F8FAFC') // Slate-50
            .fill();
        }

        // Row border (light gray)
        doc.rect(tableLeft, currentY, tableWidth, rowHeight)
          .strokeColor('#E2E8F0') // Slate-200
          .stroke();

        // Get attendance record for this student
        // For unmarked students table, status is always 'unmarked'
        // For marked students table, get the actual status
        const attendanceRecord = attendanceRecords.find(r => r.studentId === student.id);
        const status = attendanceRecord?.status || 'unmarked';
        const statusText = status.charAt(0).toUpperCase() + status.slice(1);

        // Student data
        const pinNo = student.pin_no ||
          (student.student_data && (student.student_data['PIN Number'] || student.student_data['Pin Number'])) ||
          'N/A';
        const studentName = student.student_name ||
          (student.student_data && (student.student_data['Student Name'] || student.student_data['student_name'])) ||
          'N/A';
        const studentMobile = student.student_mobile ||
          (student.student_data && (student.student_data['Student Mobile Number'] || student.student_data['Student Mobile'] || student.student_data['Student Mobile Number 1'])) ||
          'N/A';
        const parentMobile = student.parent_mobile1 ||
          student.parent_mobile2 ||
          (student.student_data && (student.student_data['Parent Mobile Number 1'] || student.student_data['Parent Phone Number 1'])) ||
          'N/A';
        const yearSem = `${student.current_year || 'N/A'}/${student.current_semester || 'N/A'}`;

        // Cell data
        doc.fontSize(8).font('Helvetica').fillColor('#000000');
        xPos = tableLeft + 5;

        // PIN
        doc.text(pinNo.substring(0, 10), xPos, currentY + 6, { width: colWidths[0] - 5, ellipsis: true });
        xPos += colWidths[0];

        // Student Name
        doc.text(studentName.substring(0, 20), xPos, currentY + 6, { width: colWidths[1] - 5, ellipsis: true });
        xPos += colWidths[1];

        // Branch
        doc.text(branchName?.substring(0, 12) || 'N/A', xPos, currentY + 6, { width: colWidths[2] - 5, ellipsis: true });
        xPos += colWidths[2];

        // Year+Sem
        doc.text(yearSem, xPos, currentY + 6, { width: colWidths[3] - 5, ellipsis: true });
        xPos += colWidths[3];

        // Student Mobile (increased width to prevent merging)
        doc.text(studentMobile.toString().substring(0, 15) || 'N/A', xPos, currentY + 6, { width: colWidths[4] - 8, ellipsis: true });
        xPos += colWidths[4];

        // Parent Mobile (increased width to prevent merging)
        doc.text(parentMobile.toString().substring(0, 15) || 'N/A', xPos, currentY + 6, { width: colWidths[5] - 8, ellipsis: true });
        xPos += colWidths[5];

        // Status (with color and background)
        const statusX = xPos;
        const statusY = currentY + 2;
        const statusWidth = colWidths[6] - 8;
        const statusHeight = rowHeight - 4;

        if (status === 'present') {
          doc.rect(statusX, statusY, statusWidth, statusHeight)
            .fillColor('#D1FAE5') // Green-100 background
            .fill()
            .strokeColor('#10B981'); // Green-500 border
          doc.fillColor('#059669'); // Green-600 text
        } else if (status === 'absent') {
          doc.rect(statusX, statusY, statusWidth, statusHeight)
            .fillColor('#FEE2E2') // Red-100 background
            .fill()
            .strokeColor('#EF4444'); // Red-500 border
          doc.fillColor('#DC2626'); // Red-600 text
        } else {
          doc.rect(statusX, statusY, statusWidth, statusHeight)
            .fillColor('#F3F4F6') // Gray-100 background
            .fill()
            .strokeColor('#6B7280'); // Gray-500 border
          doc.fillColor('#6B7280'); // Gray-600 text
        }
        doc.font('Helvetica-Bold');
        doc.text(statusText, statusX + 2, statusY + 4, { width: statusWidth - 4, ellipsis: true });
        doc.font('Helvetica'); // Reset font
        doc.fillColor('#000000'); // Reset to black

        currentY += rowHeight;
        rowIndex++;
      });

      return currentY + 20; // Return Y position after table with spacing
    };

    // Render marked students table first
    let currentY = doc.y;
    currentY = renderStudentTable(markedStudents, 'Marked Students', currentY);
    doc.y = currentY;
    doc.moveDown(0.5);

    // Render unmarked students table separately
    if (unmarkedStudents.length > 0) {
      checkPageBreak(40);
      currentY = doc.y;
      currentY = renderStudentTable(unmarkedStudents, 'Unmarked Students (Pending)', currentY);
      doc.y = currentY;
    }
  } // End of statsOnly check

  // Footer removed as per request

  // Finalize PDF
  doc.end();

  // Wait for the PDF to be written
  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      resolve(filePath);
    });
    stream.on('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Generate Study Certificate PDF
 */

// Duplicate certificate functions removed (refactored to ./pdf/certificateGenerators.js)


/**
 * Generate Registration Report PDF with comprehensive sections:
 * 1. Overall Summary Report (Abstract)
 * 2. Detailed Student List
 */
/**
 * Generate Registration Report PDF with Abstract Table
 */
const generateRegistrationReportPDF = async ({
  collegeName,
  batch,
  courseName,
  branchName,
  year,
  semester,
  reportDate,
  students, // Detailed student list with status
  statistics, // Overall statistics
  filters // Filter context
}) => {
  // Create a temporary file path
  const tempDir = os.tmpdir();
  const fileName = `registration_report_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
  const filePath = path.join(tempDir, fileName);

  // Create PDF document - LANDSCAPE for wider table
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 30
  });

  // Pipe to file
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Helper function to add a new page if needed
  const checkPageBreak = (requiredSpace = 20) => {
    if (doc.y + requiredSpace > doc.page.height - 30) {
      doc.addPage();
      return true;
    }
    return false;
  };

  // ============================================
  // AGGREGATE DATA FOR ABSTRACT TABLE
  // ============================================
  // Group students by Batch > Course > Branch > Year > Sem
  const groupedData = {};

  students.forEach(student => {
    // Extract keys
    const batchKey = (student['Batch'] || student.student_data?.Batch || student.student_data?.batch || 'Unknown').toString();
    const courseKey = (student['Course'] || 'Unknown').toString();
    const branchKey = (student['Branch'] || 'Unknown').toString();
    const yearKey = (student['Year'] || '0').toString();
    const semKey = (student['Semester'] || '0').toString();

    const uniqueKey = `${batchKey}|${courseKey}|${branchKey}|${yearKey}|${semKey}`;

    if (!groupedData[uniqueKey]) {
      groupedData[uniqueKey] = {
        batch: batchKey,
        course: courseKey,
        branch: branchKey,
        year: yearKey,
        sem: semKey,
        total: 0,
        overall_completed: 0,
        pending: 0,
        verification_completed: 0,
        certificates_verified: 0,
        fee_cleared: 0,
        promotion_completed: 0,
        scholarship_assigned: 0,
        scholarship_pending: 0
      };
    }

    const group = groupedData[uniqueKey];
    group.total++;

    // Check statuses
    // Frontend logic for overall completed: Verification + Certs + Fees + Promotion + Scholarship (all 5 steps mandatory)
    // From controller processing: 'overall_status' is mapped to 'Completed' or 'Pending'
    const isOverallCompleted = student['overall_status'] === 'Completed';
    if (isOverallCompleted) group.overall_completed++;
    else group.pending++;

    // 5 Stages Breakdown
    if (student['Verification'] === 'Completed') group.verification_completed++;
    if (student['Certificates'] === 'Verified') group.certificates_verified++;
    if (student['Fees'] === 'No Due' || student['Fees'] === 'Permitted') group.fee_cleared++;
    if (student['Promotion'] === 'Completed') group.promotion_completed++;
    if (student['Scholarship'] !== 'Pending') group.scholarship_assigned++;
    if (student['Scholarship'] === 'Pending') group.scholarship_pending++;
  });

  // Convert to array and sort
  const abstractRows = Object.values(groupedData).sort((a, b) => {
    if (a.batch !== b.batch) return a.batch.localeCompare(b.batch);
    if (a.course !== b.course) return a.course.localeCompare(b.course);
    if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
    if (a.year !== b.year) return a.year.localeCompare(b.year);
    return a.sem.localeCompare(b.sem);
  });

  // Calculate Totals for Footer
  const totals = abstractRows.reduce((acc, row) => {
    acc.total += row.total;
    acc.overall_completed += row.overall_completed;
    acc.pending += row.pending;
    acc.verification_completed += row.verification_completed;
    acc.certificates_verified += row.certificates_verified;
    acc.fee_cleared += row.fee_cleared;
    acc.promotion_completed += row.promotion_completed;
    acc.scholarship_assigned += row.scholarship_assigned;
    acc.scholarship_pending += row.scholarship_pending;
    return acc;
  }, {
    total: 0, overall_completed: 0, pending: 0,
    verification_completed: 0, certificates_verified: 0, fee_cleared: 0,
    promotion_completed: 0, scholarship_assigned: 0, scholarship_pending: 0
  });


  // ============================================
  // HEADER SECTION
  // ============================================
  const headerTop = 30;
  const pageWidth = doc.page.width; // Landscape width (~842)
  const leftMargin = 30;
  const rightMargin = 30;
  const contentWidth = pageWidth - leftMargin - rightMargin;
  const headerHeight = 80;

  // Render Logo
  const logoWidth = 70;
  const logoHeight = 70;
  const logoLeft = leftMargin + 10;
  const logoTop = headerTop;

  // Try to load logo
  let logoLoaded = false;
  try {
    const localLogoPath = path.join(process.cwd(), 'frontend', 'public', 'logo.png');
    if (fs.existsSync(localLogoPath)) {
      doc.image(localLogoPath, logoLeft, logoTop, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight], align: 'left' });
      logoLoaded = true;
    } else {
      const tempLogoPath = await downloadLogo();
      if (fs.existsSync(tempLogoPath)) {
        doc.image(tempLogoPath, logoLeft, logoTop, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight], align: 'left' });
        logoLoaded = true;
        setTimeout(() => { try { fs.unlinkSync(tempLogoPath); } catch (e) { } }, 5000);
      }
    }
  } catch (error) { }

  if (!logoLoaded) {
    doc.rect(logoLeft, logoTop, logoWidth, logoHeight).fillColor('#FF6B35').fill().strokeColor('#FF6B35').stroke();
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF').text('PYDAH', logoLeft + 5, logoTop + 20, { width: logoWidth - 10, align: 'center' });
  }

  // Header Details
  const infoLeft = logoLeft + logoWidth + 20;
  const infoWidth = contentWidth - logoWidth - 30;

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1F2937');
  doc.text(collegeName || 'Pydah Group of Educational Institutions', infoLeft, headerTop + 10, { width: infoWidth, align: 'left' });

  doc.fontSize(10).font('Helvetica').fillColor('#6B7280');
  doc.text('An Autonomous Institution Kakinada | Andhra Pradesh | INDIA', infoLeft, headerTop + 35);

  const formattedDate = new Date(reportDate || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#FF6B35');
  doc.text('Registration Summary Report (Abstract)', infoLeft, headerTop + 50);

  doc.fontSize(10).font('Helvetica').fillColor('#374151');
  // Align date with title line but on the right
  doc.text(`Generated On: ${formattedDate}`, leftMargin, headerTop + 54, { width: contentWidth, align: 'right' });

  // Divider
  doc.rect(leftMargin, headerTop + headerHeight + 5, contentWidth, 2).fillColor('#FF6B35').fill();
  doc.fillColor('#000000');
  doc.y = headerTop + headerHeight + 20;

  // ============================================
  // ABSTRACT TABLE
  // ============================================

  // Table Configuration
  const tableHeaderHeight = 30;
  const rowHeight = 25;

  // Columns: Batch(50), Course(90), Branch(90), Yr(30), Sem(30), Total(45), Comp(45), Pend(45), Ver(55), Cert(55), Fee(55), Pro(55), Schol(55)
  // Total Width ~ 700. Landscape A4 width is 842. Margins 30+30=60. Content ~782.
  // We have space.
  const cols = [
    { name: 'Batch', width: 60, align: 'left' },
    { name: 'Course', width: 100, align: 'left' },
    { name: 'Branch', width: 100, align: 'left' },
    { name: 'Yr', width: 40, align: 'center' },
    { name: 'Sem', width: 40, align: 'center' },
    { name: 'Total', width: 50, align: 'center' },
    { name: 'Done', width: 50, align: 'center' },
    { name: 'Left', width: 50, align: 'center' },
    // 5 Stages
    { name: 'Verify', width: 55, align: 'center' },
    { name: 'Certs', width: 55, align: 'center' },
    { name: 'Fees', width: 55, align: 'center' },
    { name: 'Promo', width: 55, align: 'center' },
    { name: 'Schol', width: 55, align: 'center' },
  ];

  const drawTableHeader = (y) => {
    doc.rect(leftMargin, y, contentWidth, tableHeaderHeight).fillColor('#1E40AF').fill();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');

    let x = leftMargin + 5;
    cols.forEach(col => {
      doc.text(col.name, x, y + 10, { width: col.width - 5, align: col.align });
      x += col.width;
    });
    doc.fillColor('#000000');
  };

  drawTableHeader(doc.y);
  let currentY = doc.y + tableHeaderHeight;

  doc.font('Helvetica').fontSize(9);

  abstractRows.forEach((row, idx) => {
    if (currentY + rowHeight > doc.page.height - 40) {
      doc.addPage();
      currentY = 40;
      drawTableHeader(currentY);
      currentY += tableHeaderHeight;
    }

    // Row Background
    if (idx % 2 === 1) doc.rect(leftMargin, currentY, contentWidth, rowHeight).fillColor('#F8FAFC').fill();
    doc.rect(leftMargin, currentY, contentWidth, rowHeight).strokeColor('#E2E8F0').stroke();

    let x = leftMargin + 5;

    // Cell Data
    const cells = [
      row.batch,
      row.course,
      row.branch.substring(0, 18) + (row.branch.length > 18 ? '...' : ''), // Truncate branch
      row.year,
      row.sem,
      row.total,
      row.overall_completed,
      row.pending,
      `${row.verification_completed}/${row.total - row.verification_completed}`,
      `${row.certificates_verified}/${row.total - row.certificates_verified}`,
      `${row.fee_cleared}/${row.total - row.fee_cleared}`,
      `${row.promotion_completed}/${row.total - row.promotion_completed}`,
      `${row.scholarship_assigned}/${row.scholarship_pending}`,
    ];

    cells.forEach((val, i) => {
      let color = '#000000';
      if (i === 6) color = '#10B981'; // Completed (Green)
      if (i === 7) color = '#EF4444'; // Pending (Red)
      // Stages colors (Blue/Red pair usually handled by text, here we just use black or dark gray)
      if (i >= 8) color = '#4B5563'; // Gray-600

      doc.fillColor(color).text(val.toString(), x, currentY + 8, { width: cols[i].width - 5, align: cols[i].align });
      x += cols[i].width;
    });

    currentY += rowHeight;
  });

  // GRAND TOTAL ROW
  if (currentY + rowHeight > doc.page.height - 40) {
    doc.addPage();
    currentY = 40;
  }

  doc.rect(leftMargin, currentY, contentWidth, rowHeight).fillColor('#F3F4F6').fill();
  doc.rect(leftMargin, currentY, contentWidth, rowHeight).strokeColor('#94A3B8').stroke();

  doc.font('Helvetica-Bold').fillColor('#000000');

  let x = leftMargin + 5;
  // Span first 5 columns for "Total" label
  const labelWidth = cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width;
  doc.text('TOTAL', x, currentY + 8, { width: labelWidth, align: 'center' });
  x += labelWidth;

  // Totals
  const totalCells = [
    totals.total,
    totals.overall_completed,
    totals.pending,
    totals.verification_completed,
    totals.certificates_verified,
    totals.fee_cleared,
    totals.promotion_completed,
    `${totals.scholarship_assigned}/${totals.scholarship_pending}`
  ];

  totalCells.forEach((val, i) => {
    let color = '#000000';
    if (i === 1) color = '#10B981';
    if (i === 2) color = '#EF4444';

    doc.fillColor(color).text(val.toString(), x, currentY + 8, { width: cols[5 + i].width - 5, align: 'center' });
    x += cols[5 + i].width;
  });


  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
};

/**
 * Generate Category (Caste) Report PDF - abstract format: College, Batch, Program, Branch, Year, Sem, Total, category columns.
 */
const generateCategoryReportPDF = async ({ data = [], categoryColumns = [], filters = {} }) => {
  const tempDir = os.tmpdir();
  const fileName = `category_report_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
  const filePath = path.join(tempDir, fileName);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // ============================================
  // HEADER SECTION: COLLEGE HEADER (Report Style)
  // ============================================
  const collegeName = filters.college && filters.college !== 'All' ? filters.college : 'Pydah Group of Educational Institutions';
  const isGlobalReport = !filters.college || filters.college === 'All';

  // Fetch college details from database
  let collegeDetails = {
    name: collegeName,
    affiliation: isGlobalReport ? 'All Campuses' : 'An Autonomous Institution',
    location: 'Kakinada | Andhra Pradesh | INDIA'
  };

  if (!isGlobalReport) {
    try {
      const [collegeRows] = await masterPool.query(
        'SELECT name, metadata FROM colleges WHERE name = ? AND is_active = 1 LIMIT 1',
        [collegeName]
      );
      if (collegeRows && collegeRows.length > 0) {
        const college = collegeRows[0];
        collegeDetails.name = college.name;
        if (college.metadata) {
          const metadata = typeof college.metadata === 'string'
            ? JSON.parse(college.metadata)
            : college.metadata;
          if (metadata.affiliation) collegeDetails.affiliation = metadata.affiliation;
          if (metadata.location) collegeDetails.location = metadata.location;
        }
      }
    } catch (error) {
      console.warn('Could not fetch college details:', error.message);
    }
  }

  const headerTop = 30;
  const pageWidth = doc.page.width;
  const leftMargin = 30;
  const rightMargin = 30;
  const contentWidth = pageWidth - leftMargin - rightMargin;

  // Logo section
  const logoWidth = 60;
  const logoHeight = 60;
  const logoLeft = leftMargin;
  const logoTop = headerTop;

  let logoLoaded = false;
  try {
    const tempLogoPath = await downloadLogo();
    if (fs.existsSync(tempLogoPath)) {
      doc.image(tempLogoPath, logoLeft, logoTop, {
        width: logoWidth,
        height: logoHeight,
        fit: [logoWidth, logoHeight]
      });
      logoLoaded = true;
      setTimeout(() => {
        try { if (fs.existsSync(tempLogoPath)) fs.unlinkSync(tempLogoPath); } catch (e) { }
      }, 5000);
    }
  } catch (e) { }

  if (!logoLoaded) {
    const localLogoPath = path.join(process.cwd(), 'frontend', 'public', 'logo.png');
    if (fs.existsSync(localLogoPath)) {
      try {
        doc.image(localLogoPath, logoLeft, logoTop, { width: logoWidth, height: logoHeight });
        logoLoaded = true;
      } catch (e) { }
    }
  }

  // College Info
  const infoLeft = logoLeft + logoWidth + 15;
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1F2937');
  doc.text(collegeDetails.name, infoLeft, logoTop);

  doc.fontSize(8).font('Helvetica').fillColor('#6B7280');
  doc.text(`${collegeDetails.affiliation} | ${collegeDetails.location}`, infoLeft, logoTop + 22);

  doc.fontSize(12).font('Helvetica-Bold').fillColor('#FF6B35');
  doc.text('Category Distribution Report (Abstract)', infoLeft, logoTop + 35);

  const formattedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  doc.fontSize(8).font('Helvetica').fillColor('#374151');
  doc.text(`Generated on: ${formattedDate}`, infoLeft, logoTop + 50);

  doc.rect(leftMargin, headerTop + 65, contentWidth, 1.5).fillColor('#FF6B35').fill();

  doc.y = headerTop + 75;

  // Filter Summary
  const filterTerms = [];
  if (filters.college && filters.college !== 'All') filterTerms.push(`College: ${filters.college}`);
  if (filters.batch && filters.batch !== 'All') filterTerms.push(`Batch: ${filters.batch}`);
  if (filters.course && filters.course !== 'All') filterTerms.push(`Course: ${filters.course}`);
  if (filters.branch && filters.branch !== 'All') filterTerms.push(`Branch: ${filters.branch}`);
  if (filters.year && filters.year !== 'All') filterTerms.push(`Year: ${filters.year}`);
  if (filters.semester && filters.semester !== 'All') filterTerms.push(`Sem: ${filters.semester}`);

  if (filterTerms.length > 0) {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#1F2937').text('Filters Applied:', leftMargin, doc.y, { continued: true });
    doc.font('Helvetica').text(` ${filterTerms.join(' | ')}`);
    doc.moveDown(0.5);
  }

  const isAbstract = Array.isArray(categoryColumns) && categoryColumns.length > 0 && data.length > 0 && data[0].category_breakdown != null;
  const rowHeight = 18;
  const headerBg = '#1E40AF';
  const startX = leftMargin;

  if (isAbstract) {
    const fixedHeaders = ['College', 'Batch', 'Program', 'Branch', 'Yr', 'Sem', 'Total'];
    const allHeaders = [...fixedHeaders, ...categoryColumns];

    // Dynamic column calculation - Optimized for A4 Landscape
    // Total content width is ~782
    const fixedColWidths = [140, 40, 115, 100, 22, 22, 35];
    const usedWidth = fixedColWidths.reduce((a, b) => a + b, 0);
    const remainingWidth = contentWidth - usedWidth;
    const catWidth = Math.max(18, remainingWidth / Math.max(1, categoryColumns.length));

    const colWidths = [...fixedColWidths, ...Array(categoryColumns.length).fill(catWidth)];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    const headerRowHeight = 24;
    const drawHeader = (y) => {
      doc.rect(startX, y, tableWidth, headerRowHeight).fill(headerBg);
      doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold');

      let x = startX + 3;

      // First Row: Standard labels (vertically centered in 24 height)
      fixedHeaders.forEach((h, idx) => {
        doc.text(String(h), x, y + 8, {
          width: colWidths[idx] - 4,
          height: 12,
          align: idx === 6 ? 'right' : 'left',
          lineBreak: false
        });
        x += colWidths[idx];
      });

      // Top Row Title for Categories
      const categoriesStartX = x;
      const categoriesWidth = tableWidth - (categoriesStartX - startX);
      doc.fontSize(6).text('CATEGORY DISTRIBUTION BREAKDOWN', categoriesStartX, y + 3, {
        width: categoriesWidth,
        align: 'center',
        lineBreak: false
      });

      // Bottom Row Individual Caste Names
      x = categoriesStartX;
      categoryColumns.forEach((h, idx) => {
        doc.text(String(h), x, y + 13, {
          width: colWidths[fixedHeaders.length + idx] - 4,
          align: 'center',
          ellipsis: true,
          lineBreak: false
        });
        x += colWidths[fixedHeaders.length + idx];
      });
      doc.font('Helvetica');
    };

    let currentY = doc.y;
    drawHeader(currentY);
    currentY += headerRowHeight;

    data.forEach((row, i) => {
      // Check for page break
      if (currentY + rowHeight > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1F2937');
        doc.text(collegeDetails.name, 30, 30);
        doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
        doc.text('Category Distribution Report (Abstract) - Continued', 30, 42);
        doc.rect(30, 52, contentWidth, 1).fillColor('#FF6B35').fill();

        currentY = 65;
        drawHeader(currentY);
        currentY += headerRowHeight;
      }

      // Alternate row bg
      if (i % 2 === 1) {
        doc.rect(startX, currentY, tableWidth, rowHeight).fillColor('#F8FAFC').fill();
      }

      doc.rect(startX, currentY, tableWidth, rowHeight).strokeColor('#E2E8F0').stroke();
      doc.fillColor('#1F2937').fontSize(7);

      let x = startX + 3;
      const vals = [row.college, row.batch, row.course, row.branch, row.current_year, row.current_semester, row.total];

      vals.forEach((v, idx) => {
        const text = String(v ?? '-');
        doc.text(text, x, currentY + 5, {
          width: colWidths[idx] - 4,
          height: 10,
          align: idx === 6 ? 'right' : 'left',
          ellipsis: true,
          lineBreak: false
        });
        x += colWidths[idx];
      });

      categoryColumns.forEach((c, idx) => {
        const n = row.category_breakdown[c] ?? 0;
        doc.text(String(n), x, currentY + 5, {
          width: colWidths[fixedHeaders.length + idx] - 4,
          height: 10,
          align: 'right',
          lineBreak: false
        });
        x += colWidths[fixedHeaders.length + idx];
      });

      currentY += rowHeight;
    });

    const grandTotal = data.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    // Ensure Grand Total doesn't split onto a new page alone
    if (currentY + 30 > doc.page.height - 40) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
      currentY = 30;
    }
    doc.y = currentY + 10;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1E40AF');
    doc.text(`Grand Total: ${grandTotal}`, startX, doc.y, { width: tableWidth, align: 'right' });
  } else {
    // Normal List Format
    const colWidths = [contentWidth - 80, 80];
    const tableWidth = contentWidth;

    const drawSimpleHeader = (y) => {
      doc.rect(startX, y, tableWidth, rowHeight).fill(headerBg);
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
      doc.text('Category', startX + 5, y + 5, { width: colWidths[0] - 10 });
      doc.text('Count', startX + colWidths[0], y + 5, { width: colWidths[1] - 10, align: 'right' });
    };

    let currentY = doc.y;
    drawSimpleHeader(currentY);
    currentY += rowHeight;

    data.forEach((row, i) => {
      if (currentY + rowHeight > doc.page.height - 40) {
        doc.addPage('a4', 'landscape');
        currentY = 30;
        drawSimpleHeader(currentY);
        currentY += rowHeight;
      }

      if (i % 2 === 1) doc.rect(startX, currentY, tableWidth, rowHeight).fillColor('#F8FAFC').fill();
      doc.rect(startX, currentY, tableWidth, rowHeight).strokeColor('#E2E8F0').stroke();
      doc.fillColor('#1F2937').fontSize(8).font('Helvetica');

      doc.text(String(row.category || 'Not Specified'), startX + 5, currentY + 5, { width: colWidths[0] - 10 });
      doc.text(String(row.count || 0), startX + colWidths[0], currentY + 5, { width: colWidths[1] - 10, align: 'right' });
      currentY += rowHeight;
    });

    const totalCount = data.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    doc.y = currentY + 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1E40AF');
    doc.text(`Total Students: ${totalCount}`, startX, doc.y, { width: tableWidth, align: 'right' });
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
};

module.exports = {
  generateAttendanceReportPDF,
  generateRegistrationReportPDF,
  generateCategoryReportPDF,
  generateStudyCertificate,
  generateRefundApplication,
  generateCustodianCertificate,
  generateDynamicCertificate,
  generateTemplatedCertificate
};

