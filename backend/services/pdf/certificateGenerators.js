const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { downloadLogo } = require("./utils");

// Helper to draw a centered line composed of multiple segments (Used in Study Cert)
const drawCenteredLine = (doc, y, segments, pageWidth) => {
  let totalWidth = 0;

  // 1. Calculate Total Width
  segments.forEach((seg) => {
    // Ensure text is a string
    const text =
      seg.text !== undefined && seg.text !== null ? String(seg.text) : "";
    seg.safeText = text;

    if (text.length > 0) {
      // Set font to measure width correctly
      doc.font(seg.font || "Helvetica").fontSize(seg.fontSize || 12);
      const w = doc.widthOfString(text);
      seg.measuredWidth = w; // Store measured width
      totalWidth += w;
    } else {
      seg.measuredWidth = 0;
    }
  });

  // Safety check for NaN
  if (isNaN(totalWidth)) totalWidth = 0;

  // 2. Determine Start X to center the line
  let currentX = (pageWidth - totalWidth) / 2;
  if (isNaN(currentX)) currentX = 0;

  // 3. Draw Segments
  segments.forEach((seg) => {
    const text = seg.safeText;
    const width = seg.measuredWidth;

    if (text.length > 0) {
      // Set styling
      doc
        .font(seg.font || "Helvetica")
        .fontSize(seg.fontSize || 12)
        .fillColor(seg.color || "#1E40AF"); // Default Blue

      // Draw Text
      doc.text(text, currentX, y, {
        lineBreak: false,
        underline: false, // Disable built-in underline to avoid potential internal calc errors
      });

      // Manually Draw Underline if requested
      if (seg.underline) {
        const underlineY = y + (seg.fontSize || 12) + 2; // Approximate baseline offset
        doc.save();
        doc
          .strokeColor(seg.color || "#000000") // Underline matches text color usually, or black for form fill?
          .lineWidth(1)
          .moveTo(currentX, underlineY)
          .lineTo(currentX + width, underlineY)
          .stroke();
        doc.restore();
      }

      // Advance X
      currentX += width;
    }
  });
};

/**
 * Generate Study Certificate PDF
 */
const generateStudyCertificate = async (student, request, collegeDetails) => {
  const tempDir = os.tmpdir();
  const fileName = `study_certificate_${student.admission_number}_${Date.now()}.pdf`;
  const filePath = path.join(tempDir, fileName);

  const doc = new PDFDocument({
    size: "A5", // A5 as requested
    layout: "landscape",
    margin: 40, // Reduced margin for A5
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // --- Header ---
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 80;

  // LOGO
  const logoPath = path.join(__dirname, "../../../frontend/public/logo.png");
  const logoWidth = 90;
  const logoX = pageWidth - 130; // Right side

  // Moved logo down to 50 to avoid overlap with College Name
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, logoX, 50, { width: logoWidth });
  }

  // Address logo overlap by adjusting text wrapping or width if needed, but moving logo is safer.

  // College Name
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#1E40AF"); // Royal Blue
  // Center roughly, accounting for logo push if needed, but header is usually centered on page
  doc.text(
    (collegeDetails.name || "PYDAH COLLEGE OF ENGINEERING").toUpperCase(),
    40,
    30,
    { align: "center", width: contentWidth },
  );

  // Subtitle/Address
  doc.font("Helvetica").fontSize(10).fillColor("#1E40AF"); // Keeping it Blue as per photo
  doc.text(
    "(Approved by AICTE & Affiliated to JNT University, Kakinada)",
    40,
    58,
    { align: "center", width: contentWidth },
  );
  doc.text("Yanam Road, Patavala, KAKINADA-533 461, E.G.DT.", 40, 72, {
    align: "center",
    width: contentWidth,
  });

  // Phone/Website
  const contactParts = [];
  if (collegeDetails.phone) contactParts.push(`Ph: ${collegeDetails.phone}`);
  if (collegeDetails.website) contactParts.push(`Website : ${collegeDetails.website}`);
  if (contactParts.length > 0) {
    doc.text(
      contactParts.join('   '),
      40,
      86,
      { align: "center", width: contentWidth },
    );
  }

  // Line separator
  doc
    .moveTo(30, 105)
    .lineTo(pageWidth - 30, 105)
    .strokeColor("#1E40AF")
    .lineWidth(1.5)
    .stroke();

  // Date
  const today = new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#1E40AF");
  doc.text("Date:", pageWidth - 160, 115, { continued: true });
  doc.font("Helvetica").text(` ${today}`, { underline: false });

  // --- Title ---
  doc.moveDown(2); // roughly y=140
  const titleY = 145;
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#1E40AF");
  // Draw text with underline manually to control style better or use option
  const title = "STUDY CERTIFICATE";
  const titleWidth = doc.widthOfString(title);
  doc.text(title, (pageWidth - titleWidth) / 2, titleY, { underline: true });

  // --- Body ---
  // Ensure request_data is parsed
  let requestData = request.request_data;
  if (typeof requestData === "string") {
    try {
      requestData = JSON.parse(requestData);
    } catch (e) {
      requestData = {};
    }
  } else if (!requestData) {
    requestData = {};
  }

  // Data Preparation with padding for "blank line" look
  const pad = (str) => `  ${str}  `;

  // Helper to format name: First Full, Middles Initialized, Last Full.
  // User req: "first word and last word needed to be shown and the remaining words are neede to be shown with the capital letters with the ."
  // Actually commonly: "Surname F. M." or "First M. Last".
  // Interpreting strictly: "Word1" + initials + "WordN"
  const formatName = (fullName) => {
    if (!fullName) return "________________";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;

    // First word full
    let formatted = parts[0];
    // Middle words initials
    for (let i = 1; i < parts.length - 1; i++) {
      formatted += ` ${parts[i].charAt(0).toUpperCase()}.`;
    }
    // Last word full
    formatted += ` ${parts[parts.length - 1]}`;
    return formatted;
  };

  const studentNameInput = student.student_name || "________________";
  const studentName = formatName(studentNameInput).toUpperCase();

  const parentName = (
    student.father_name ||
    student.guardian_name ||
    "________________"
  ).toUpperCase();
  // Ensure admission number is used for PIN
  const pinNo = (student.admission_number || "________________").toUpperCase();
  const year = student.current_year ? student.current_year.toString() : "__";
  const sem = student.current_semester
    ? student.current_semester.toString()
    : "__";

  // Only use data if it exists, otherwise use placeholders
  const course = student.course ? student.course.toUpperCase() : "_________";
  const branch = (student.branch || "").toUpperCase();

  // Calculate Academic Year only if student data exists, otherwise placeholder
  let academicYear = student.academic_year;
  if (!academicYear && student.admission_number) {
    // Only calc if it's a real student record
    const currentMonth = new Date().getMonth(); // 0-11
    const currentYr = new Date().getFullYear();
    if (currentMonth < 5) academicYear = `${currentYr - 1}-${currentYr}`;
    else academicYear = `${currentYr}-${currentYr + 1}`;
  } else if (!academicYear) {
    academicYear = "_________";
  }

  const purpose = requestData.purpose || "__________________________________";

  // Font Config
  const bodyFont = "Helvetica-Bold";
  const bodySize = 13;
  const dataFont = "Helvetica-Bold";
  const dataSize = 13;
  const baseColor = "#1E40AF"; // Blue
  const dataColor = "#000000"; // Black for filled data

  let startY = 190;
  const lineHeight = 30; // Increased spacing

  // Line 1: This is to certify that Mr./Ms. [Name] (PIN No. [Pin])
  drawCenteredLine(
    doc,
    startY,
    [
      {
        text: "This is to certify that Mr./Ms. ",
        font: "Helvetica",
        color: baseColor,
      },
      {
        text: student.student_name
          ? pad(formatName(student.student_name).toUpperCase())
          : "______________",
        font: dataFont,
        color: dataColor,
        underline: !!student.student_name,
      },
      { text: " (PIN No. ", font: "Helvetica", color: baseColor },
      {
        text: student.admission_number
          ? pad(student.admission_number)
          : "__________",
        font: dataFont,
        color: dataColor,
        underline: !!student.admission_number,
      },
      { text: ")", font: "Helvetica", color: baseColor },
    ],
    pageWidth,
  );

  // Line 2: S/o, D/o of Sri [Parent] is studying [Year] year [Sem] sem in [Course]
  drawCenteredLine(
    doc,
    startY + lineHeight,
    [
      { text: "S/o, D/o of Sri ", font: "Helvetica", color: baseColor },
      {
        text: student.father_name
          ? pad(student.father_name.toUpperCase())
          : "______________",
        font: dataFont,
        color: dataColor,
        underline: !!student.father_name,
      },
      { text: " is studying ", font: "Helvetica", color: baseColor },
      {
        text: year !== "__" ? year : "__",
        font: dataFont,
        color: dataColor,
        underline: year !== "__",
      },
      { text: " year ", font: "Helvetica", color: baseColor },
      {
        text: sem !== "__" ? sem : "__",
        font: dataFont,
        color: dataColor,
        underline: sem !== "__",
      },
      { text: " sem in ", font: "Helvetica", color: baseColor },
      {
        text: course !== "_________" ? course : "_________",
        font: dataFont,
        color: dataColor,
        underline: course !== "_________",
      },
    ],
    pageWidth,
  );

  // Line 3: [Branch] Branch during the academic Year [AcadYear] in our college. This is being issued for the
  drawCenteredLine(
    doc,
    startY + lineHeight * 2,
    [
      {
        text: student.branch ? pad(branch) : "________",
        font: dataFont,
        color: dataColor,
        underline: !!student.branch,
      },
      {
        text: "  Branch during the academic Year ",
        font: "Helvetica",
        color: baseColor,
      },
      {
        text: academicYear.includes("_") ? academicYear : academicYear,
        font: dataFont,
        color: dataColor,
        underline: !academicYear.includes("_"),
      },
      {
        text: " in our college. This is being issued for the",
        font: "Helvetica",
        color: baseColor,
      },
    ],
    pageWidth,
  );

  // Line 4: purpose of getting [Purpose] only.
  drawCenteredLine(
    doc,
    startY + lineHeight * 3,
    [
      { text: "purpose of getting  ", font: "Helvetica", color: baseColor },
      {
        text:
          requestData.purpose &&
          requestData.purpose !== "__________________________________"
            ? pad(requestData.purpose)
            : "__________________",
        font: dataFont,
        color: dataColor,
        underline: !!(
          requestData.purpose &&
          requestData.purpose !== "__________________________________"
        ),
      },
      { text: "  only.", font: "Helvetica", color: baseColor },
    ],
    pageWidth,
  );

  // --- Footer ---
  const footerY = doc.page.height - 80;

  doc.font("Helvetica-Bold").fontSize(14).fillColor("#1E40AF");
  doc.text("Seal :", 60, footerY);
  doc.text("PRINCIPAL", pageWidth - 160, footerY);

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};

/**
 * Generate Refund Application PDF
 */
const generateRefundApplication = async (student, request, collegeDetails) => {
  const tempDir = os.tmpdir();
  const fileName = `refund_application_${student.admission_number}_${Date.now()}.pdf`;
  const filePath = path.join(tempDir, fileName);

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 80;
  const leftMargin = 40;
  const rightMargin = pageWidth - 40;

  // --- Header ---
  // Logo
  const logoPath = path.join(__dirname, "../../../frontend/public/logo.png");
  const logoWidth = 80;
  const logoHeight = 60; // Approx aspect ratio

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, leftMargin, 40, {
      width: logoWidth,
      height: logoHeight,
      fit: [logoWidth, logoHeight],
    });
  }

  // College Name & Address
  const headerTextLeft = leftMargin + logoWidth + 20;
  const headerTextWidth = contentWidth - logoWidth - 20;

  doc.font("Helvetica-Bold").fontSize(24).fillColor("#000000");
  doc.text("Pydah Group of Institutions", headerTextLeft, 45, {
    align: "center",
    width: headerTextWidth,
  });

  // S3 Label (Top Right)
  doc.fontSize(16).text("S3", rightMargin - 40, 45);

  // Gray Title Bar
  const titleBarY = 110;
  const titleBarHeight = 25;
  doc
    .rect(leftMargin, titleBarY, contentWidth, titleBarHeight)
    .fillColor("#808080")
    .fill();

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#FFFFFF");
  doc.text("APPLICATION FOR REFUND OF EXCESS FEES", leftMargin, titleBarY + 7, {
    width: contentWidth,
    align: "center",
  });

  doc.fillColor("#000000");

  // --- Parse Data ---
  let requestData = request.request_data;
  if (typeof requestData === "string") {
    try {
      requestData = JSON.parse(requestData);
    } catch (e) {
      requestData = {};
    }
  } else if (!requestData) {
    requestData = {};
  }

  const today = new Date().toLocaleDateString("en-IN"); // DD/MM/YYYY

  // Student Details
  const studentName = (student.student_name || "").toUpperCase();
  const pinNo = (student.admission_number || "").toUpperCase();
  const course = (student.course || "").toUpperCase();
  const branch = (student.branch || "").toUpperCase();
  const year = student.current_year ? student.current_year.toString() : "";
  const sem = student.current_semester
    ? student.current_semester.toString()
    : "";
  const yearSem = year && sem ? `${year} Year & ${sem} Sem` : "";

  // Form Details
  const reason =
    requestData.reason ||
    requestData.purpose ||
    "___________________________________________________________________";
  const excessAmount = requestData.excess_amount || "_________________";
  const amountInWords =
    requestData.amount_in_words ||
    "_________________________________________________________________";

  // --- Top Block (2 columns) ---
  const topBlockY = titleBarY + titleBarHeight + 20;
  const col1Left = leftMargin;
  const col2Left = leftMargin + contentWidth / 2;
  const colWidth = contentWidth / 2 - 10;

  const boxHeight = 100;

  // Draw Box
  doc.rect(leftMargin, topBlockY, contentWidth, boxHeight).stroke();
  doc
    .moveTo(col2Left, topBlockY)
    .lineTo(col2Left, topBlockY + boxHeight)
    .stroke();

  // Column 1 Content
  let y = topBlockY + 10;
  doc.font("Helvetica").fontSize(10);
  doc.text("To, The Administrative Officer,", col1Left + 5, y);
  y += 20;
  // College name from DB or fallback
  doc.text(
    `${collegeDetails.name || "Pydah College of Engineering"}`,
    col1Left + 5,
    y,
  );
  doc
    .moveTo(col1Left + 5, y + 12)
    .lineTo(col1Left + colWidth - 5, y + 12)
    .stroke(); // Underline

  y += 30;
  doc.text("Date of Application:", col1Left + 5, y);
  doc.text(today, col1Left + 100, y); // Pre-fill date

  // Column 2 Content
  y = topBlockY + 10;
  doc.text("From Student Name:", col2Left + 5, y);
  doc.font("Helvetica-Bold").text(studentName, col2Left + 105, y);
  doc
    .moveTo(col2Left + 105, y + 12)
    .lineTo(col2Left + colWidth - 5, y + 12)
    .stroke(); // Underline

  y += 20;
  doc.font("Helvetica").text("Pin Number:", col2Left + 5, y);
  doc.font("Helvetica-Bold").text(pinNo, col2Left + 65, y);
  doc
    .moveTo(col2Left + 65, y + 12)
    .lineTo(col2Left + colWidth - 5, y + 12)
    .stroke();

  y += 20;
  doc.font("Helvetica").text("Course & Branch:", col2Left + 5, y);
  doc.font("Helvetica-Bold").text(`${course} - ${branch}`, col2Left + 90, y);
  doc
    .moveTo(col2Left + 90, y + 12)
    .lineTo(col2Left + colWidth - 5, y + 12)
    .stroke();

  y += 20;
  doc.font("Helvetica").text("Year & Sem:", col2Left + 5, y);
  doc.font("Helvetica-Bold").text(yearSem, col2Left + 65, y);
  doc
    .moveTo(col2Left + 65, y + 12)
    .lineTo(col2Left + colWidth - 5, y + 12)
    .stroke();

  // --- Body ---
  doc.font("Helvetica").fontSize(10);
  let bodyY = topBlockY + boxHeight + 20;

  doc.text("Sir,", leftMargin, bodyY);
  bodyY += 20;

  const lineHeight = 20;

  // Line 1
  doc.text(
    "I have paid the excess fee through the following Cheques(s) / DD/ Online Transfer/Cash",
    leftMargin,
    bodyY,
  );
  bodyY += lineHeight;

  // Line 2
  /*
     We need to layout: "towards the reason: _____________ ..."
     Instead of simple continued text which can be tricky with exact widths,
     we can manually place text segments to control the "blank" line length.
  */
  const reasonLabel = "towards the reason: ";
  doc.text(reasonLabel, leftMargin, bodyY, { continued: true });

  // Use a fixed width or calculated width for the underline to avoid it being "too long"
  // If reason is empty/blank (preview), use a fixed length that fits neatly.
  const reasonText = requestData.reason || requestData.purpose || "";
  // If text exists, use it with padding. If not, use line.
  const displayReason = reasonText
    ? `  ${reasonText}  `
    : "________________________________________________________";

  doc.font("Helvetica-Bold").text(displayReason, { underline: true });
  doc.font("Helvetica"); // Reset
  bodyY += lineHeight;

  // Line 3
  const excessLabel =
    "to the college. In this regard kindly refund the excess paid amount of Rs. ";
  doc.text(excessLabel, leftMargin, bodyY, { continued: true });

  const excessText = requestData.excess_amount || "";
  const displayExcess = excessText ? `  ${excessText}  ` : "__________________";

  doc.font("Helvetica-Bold").text(displayExcess, { underline: true });
  doc.font("Helvetica"); // Reset
  bodyY += lineHeight;

  // Line 4
  const wordsLabel = "(In words) ";
  doc.text(wordsLabel, leftMargin, bodyY, { continued: true });

  const wordsText = requestData.amount_in_words || "";
  const displayWords = wordsText
    ? `  ${wordsText}  `
    : "________________________________________________________";

  doc.font("Helvetica-Bold").text(displayWords, { underline: true });
  doc.font("Helvetica"); // Reset
  bodyY += lineHeight + 10;

  // --- Table ---
  const tableTop = bodyY;
  const tableHeaders = [
    "Type of Fees",
    "Receipt No.",
    "Amount",
    "Mode of Payment",
  ];
  const tableColWidths = [
    contentWidth * 0.25,
    contentWidth * 0.25,
    contentWidth * 0.25,
    contentWidth * 0.25,
  ];

  // Header
  let x = leftMargin;
  doc.font("Helvetica-Bold").fontSize(10);
  tableHeaders.forEach((header, i) => {
    doc.rect(x, tableTop, tableColWidths[i], 20).stroke();
    doc.text(header, x + 5, tableTop + 5);
    x += tableColWidths[i];
  });

  // Rows (3 empty rows as per image)
  let rowY = tableTop + 20;
  for (let i = 0; i < 3; i++) {
    x = leftMargin;
    tableHeaders.forEach((header, j) => {
      doc.rect(x, rowY, tableColWidths[j], 20).stroke();
      x += tableColWidths[j];
    });
    rowY += 20;
  }

  bodyY = rowY + 10;

  // --- Declaration ---
  doc.font("Helvetica").fontSize(10);
  doc.text(
    "I accept to receive the excess amount in the form of cheque only. I further certify that I have neither received the refund so far nor have claimed it earlier.",
    leftMargin,
    bodyY,
    { width: contentWidth },
  );

  bodyY += 40;
  doc.text("Student Signature", rightMargin - 100, bodyY);

  // --- Office Use Box ---
  const officeBoxTop = bodyY + 40;
  const officeBoxHeight = 150;

  // Check page range
  if (officeBoxTop + officeBoxHeight > doc.page.height - 40) {
    doc.addPage();
    // Reset Y if new page... but let's assume it fits for now or let PDFKit handle flow if we weren't using absolute drawing.
    // Since we are using absolute rects, we REALLY should check.
    // But for simplicity, let's assume single page for now unless content pushes it.
  }

  // Black Header
  doc
    .rect(leftMargin, officeBoxTop, contentWidth, 20)
    .fillColor("black")
    .fill();
  doc
    .fillColor("white")
    .font("Helvetica-Bold")
    .text("OFFICE USE ONLY", leftMargin, officeBoxTop + 5, {
      width: contentWidth,
      align: "center",
    });
  doc.fillColor("black");

  // Grid
  const gridTop = officeBoxTop + 20;
  const gridHeight = officeBoxHeight - 20;
  const midX = leftMargin + contentWidth / 2;
  const midY = gridTop + gridHeight / 2;

  // Outer Box
  doc.rect(leftMargin, gridTop, contentWidth, gridHeight).stroke();
  // Vertical split
  doc
    .moveTo(midX, gridTop)
    .lineTo(midX, gridTop + gridHeight)
    .stroke();
  // Horizontal split
  doc
    .moveTo(leftMargin, midY)
    .lineTo(leftMargin + contentWidth, midY)
    .stroke();

  doc.font("Helvetica-Bold").fontSize(9);

  // Top Left
  doc.text("A.O Remark's", leftMargin + 5, gridTop + 5, { underline: true });

  // Top Right
  doc.text("Principal Remark's", midX + 5, gridTop + 5, { underline: true });

  // Bottom Left
  doc.text("Accountant Remark's:", leftMargin + 5, midY + 5, {
    underline: true,
  });
  doc.font("Helvetica").fontSize(8);
  doc.text("Refund posted in ezschool on:", leftMargin + 5, midY + 45);
  doc.text("Refund Cheque No & dated", leftMargin + 5, midY + 60);

  // Bottom Right
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Authority Approval for release", midX + 5, midY + 5, {
    underline: true,
  });

  doc
    .fontSize(7)
    .text("Form revised on 06/07/2021", leftMargin, doc.page.height - 30);

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};

/**
 * Generate Dynamic Certificate based on JSON Config
 */
const generateDynamicCertificate = async (
  student,
  request,
  collegeDetails,
  config,
) => {
  const tempDir = os.tmpdir();
  const fileName = `dynamic_cert_${Date.now()}.pdf`;
  const filePath = path.join(tempDir, fileName);

  const doc = new PDFDocument({
    size: config.size || "A4",
    layout: config.layout || "portrait",
    margin: 0, // We control positioning manually
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Prepare Data for Replacement
  let requestData = request.request_data;
  if (typeof requestData === "string") {
    try {
      requestData = JSON.parse(requestData);
    } catch (e) {
      requestData = {};
    }
  } else {
    requestData = requestData || {};
  }

  const data = {
    // Basic Fields
    student_name: (student.student_name || "").toUpperCase(),
    admission_number: (student.admission_number || "").toUpperCase(),
    pin_no: (student.pin_no || "").toUpperCase(),
    course: (student.course || "").toUpperCase(),
    branch: (student.branch || "").toUpperCase(),
    current_year: student.current_year ? student.current_year.toString() : "",
    current_semester: student.current_semester
      ? student.current_semester.toString()
      : "",
    dob: student.dob ? new Date(student.dob).toLocaleDateString("en-IN") : "",
    email: student.email || "",
    phone_number: student.phone_number || "",

    // College Details
    college_name: collegeDetails.name || "Pydah Group of Institutions",
    college_address: collegeDetails.address || "",
    college_phone: collegeDetails.phone || "",
    college_email: collegeDetails.email || "",

    // Dates
    date: new Date().toLocaleDateString("en-IN"),
    current_date: new Date().toLocaleDateString("en-IN"),

    // Request Specific
    ...requestData,
    ...student, // Fallback
  };

  // Helper to resolve variables
  const replaceVariables = (text) => {
    if (!text) return "";
    return text.replace(/{{(.*?)}}/g, (match, p1) => {
      const key = p1.trim();
      return data[key] !== undefined ? data[key] : match;
    });
  };

  // Render Elements
  if (config.elements && Array.isArray(config.elements)) {
    for (const el of config.elements) {
      if (el.type === "text") {
        let fontName = el.font || "Helvetica";
        if (fontName === "Bold" || fontName === "Helvetica-Bold")
          fontName = "Helvetica-Bold"; // Normalized

        doc
          .font(fontName)
          .fontSize(el.fontSize || 12)
          .fillColor(el.color || "#000000");

        const content = replaceVariables(el.content);

        const options = {
          width: el.width,
          align: el.align || "left",
        };

        if (el.x !== undefined && el.y !== undefined) {
          doc.text(content, el.x, el.y, options);
        } else {
          doc.text(content, options);
        }
      } else if (el.type === "image") {
        try {
          if (el.content && el.content.startsWith("data:image")) {
            doc.image(el.content, el.x, el.y, {
              width: el.width,
              height: el.height,
            });
          } else if (el.content === "logo") {
            const logoPath = path.join(
              __dirname,
              "../../../frontend/public/logo.png",
            );
            if (fs.existsSync(logoPath)) {
              doc.image(logoPath, el.x, el.y, {
                width: el.width,
                height: el.height,
              });
            }
          }
        } catch (e) {
          console.error("Image Render Error:", e);
        }
      } else if (el.type === "line") {
        // Improve line handling to support both legacy x/y and explicit x1/y1
        let x1 = el.x1 !== undefined ? el.x1 : el.x;
        let y1 = el.y1 !== undefined ? el.y1 : el.y;
        let x2 = el.x2 !== undefined ? el.x2 : el.x + el.width;
        let y2 = el.y2 !== undefined ? el.y2 : el.y; // Default horizontal if no y2

        doc
          .moveTo(x1, y1)
          .lineTo(x2, y2)
          .strokeColor(el.color || "#000000")
          .lineWidth(el.lineWidth || 1)
          .stroke();
      } else if (el.type === "rect") {
        doc.rect(el.x, el.y, el.width, el.height);
        if (el.fill && el.stroke) {
          doc
            .lineWidth(el.lineWidth || 1)
            .fillAndStroke(el.fill, el.color || "#000000");
        } else if (el.fill) {
          doc.fillColor(el.fill).fill();
        } else {
          doc
            .strokeColor(el.color || "#000000")
            .lineWidth(el.lineWidth || 1)
            .stroke();
        }
      } else if (el.type === "circle") {
        // pdfkit circle takes center x, y and radius
        doc.circle(el.x + el.radius, el.y + el.radius, el.radius);
        if (el.fill && el.stroke) {
          doc
            .lineWidth(el.lineWidth || 1)
            .fillAndStroke(el.fill, el.color || "#000000");
        } else if (el.fill) {
          doc.fillColor(el.fill).fill();
        } else {
          doc
            .strokeColor(el.color || "#000000")
            .lineWidth(el.lineWidth || 1)
            .stroke();
        }
      }
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};

/**
 * Generate Custodian Certificate PDF
 */
const generateCustodianCertificate = async (
  student,
  request,
  collegeDetails,
) => {
  const tempDir = os.tmpdir();
  const fileName = `custodian_certificate_${student.admission_number}_${Date.now()}.pdf`;
  const filePath = path.join(tempDir, fileName);

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 80;
  const centerX = pageWidth / 2;

  // --- Header ---
  // LOGO
  const logoPath = path.join(__dirname, "../../../frontend/public/logo.png");
  const logoWidth = 90;
  const logoX = pageWidth - 130;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, logoX, 40, { width: logoWidth });
  }

  // College Name
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#000000"); // Black as per image
  doc.text(
    (collegeDetails.name || "PYDAH COLLEGE OF ENGINEERING").toUpperCase(),
    40,
    45,
    { align: "center", width: contentWidth },
  );

  // Subtitle/Address
  doc.font("Helvetica").fontSize(10);
  doc.text(
    "(Approved by AICTE and Affiliated to JNT University, Kakinada)",
    40,
    75,
    { align: "center", width: contentWidth },
  );
  // Need to bold specific parts of address like "PATAVALA" as per image
  // Doing simple text for now to match layout roughly
  doc.text("Yanam Road, PATAVALA, KAKINADA-533461, E.G.Dt.", 40, 90, {
    align: "center",
    width: contentWidth,
  });

  // Line separator
  doc
    .moveTo(40, 110)
    .lineTo(pageWidth - 40, 110)
    .strokeColor("#000000")
    .lineWidth(1)
    .stroke();

  // Date
  // Date: 28-06-2025 (Right aligned)
  const today = new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY
  doc
    .font("Helvetica")
    .fontSize(11)
    .text(`Date: ${today}`, pageWidth - 160, 140);

  // --- Title ---
  doc.moveDown(4); // spacing
  const titleY = 200;
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("TO WHOM SO EVER IT MAY CONCERN", 40, titleY, {
      align: "center",
      underline: true,
    });

  // --- Body ---
  doc.moveDown(3);
  const bodyY = doc.y + 20;

  // Ensure request_data is parsed
  let requestData = request.request_data;
  if (typeof requestData === "string") {
    try {
      requestData = JSON.parse(requestData);
    } catch (e) {
      requestData = {};
    }
  } else if (!requestData) {
    requestData = {};
  }

  const studentName = (
    student.student_name || "________________"
  ).toUpperCase();
  const parentName = (
    student.father_name ||
    student.guardian_name ||
    "________________"
  ).toUpperCase();
  const rollNo = (student.admission_number || "________________").toUpperCase();
  const course = student.course || "________"; // e.g. B.Tech
  const branch = student.branch || "________"; // e.g. Computer Science & Engineering

  doc.font("Helvetica").fontSize(12).lineGap(6);

  // "This is to certify that Mr. [NAME] S/o [PARENT] bearing Roll No: [ROLL] is studying [COURSE] ([BRANCH]) in our College."
  // Using continuous text with embedded bold fonts is tricky in PDFKit without multiple text calls or rich text plugins.
  // We will construct it carefully or use standard text for now, bolding is hard inline without exact positioning or a plugin.
  // We will try to simulate bolding by changing font for the whole line if acceptable, or just splitting logic.
  // Given the image, specific variables are bold.

  const textX = 60;
  const textWidth = pageWidth - 120;
  let currentY = bodyY;

  // Helper to draw varied text
  const drawText = (text, isBold = false) => {
    doc
      .font(isBold ? "Helvetica-Bold" : "Helvetica")
      .text(text, { continued: true });
  };

  doc.text("This is to certify that ", textX, currentY, {
    continued: true,
    align: "justify",
    width: textWidth,
  });
  doc
    .font("Helvetica-Bold")
    .text(`Mr./Ms. ${studentName}`, { continued: true });
  doc.font("Helvetica").text(" S/o, D/o ", { continued: true });
  doc.font("Helvetica-Bold").text(`${parentName}`, { continued: true });
  doc.font("Helvetica").text(" bearing Roll No: ", { continued: true });
  doc.font("Helvetica-Bold").text(`${rollNo}`, { continued: true });
  doc.font("Helvetica").text(" is studying ", { continued: true });
  doc.font("Helvetica-Bold").text(`${course} (${branch})`, { continued: true });
  doc.font("Helvetica").text(" in our College.", { continued: false });

  doc.moveDown(2);
  doc.text("The following Certificate is in our Custody.", { align: "center" });
  doc.moveDown(1.5);

  // List of Certificates
  // Expecting 'custody_list' in requestData, comma separated
  // e.g. "S.S.C Certificate, Diploma Certificate"
  const certsRaw =
    requestData.custody_list ||
    requestData.certificates ||
    "_______________________";
  const certList = certsRaw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c);

  let listY = doc.y;
  const listX = centerX - 60; // Approximate center alignment for list

  if (certList.length > 0) {
    certList.forEach((cert, idx) => {
      doc.font("Helvetica-Bold").text(`${idx + 1}. ${cert}`, listX, listY);
      listY += 25;
    });
  } else {
    doc.font("Helvetica-Bold").text(`1. ${certsRaw}`, listX, listY);
    listY += 25;
  }

  doc.y = listY + 20;

  // Purpose
  const purpose = requestData.purpose || "Passport Verification";
  doc.moveDown(2);
  doc
    .font("Helvetica")
    .text(
      `This Certificate is issued on his request for ${purpose}.`,
      textX,
      doc.y,
      { align: "center" },
    );

  // --- Footer ---
  const footerY = doc.page.height - 150;

  doc.font("Helvetica-Bold").text("Principal", 60, footerY);
  doc.font("Helvetica").text("(Dr.P.V.Surya Prakash)", 40, footerY + 20);

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};

/**
 * Generate certificate from three-section template
 * @param {Object} template - Template configuration with top/middle/bottom content
 * @param {Object} processedContent - Pre-processed content with variables replaced
 * @param {Object} student - Student data
 * @param {Object} collegeDetails - College information
 * @returns {Promise<string>} - Path to generated PDF
 */
const generateTemplatedCertificate = async (
  template,
  processedContent,
  student,
  collegeDetails,
) => {
  const tempDir = os.tmpdir();
  const fileName = `certificate_${Date.now()}.pdf`;
  const filePath = path.join(tempDir, fileName);

  // Determine page size
  let pageSize = "A4";
  let pageLayout = "portrait";

  if (template.page_size) pageSize = template.page_size;
  if (template.page_orientation) pageLayout = template.page_orientation;

  const doc = new PDFDocument({
    size: pageSize,
    layout: pageLayout,
    margin: 0,
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Get page dimensions
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  // Get padding values with validation (max 100px to prevent excessive margins)
  const paddingLeft = Math.min(
    Math.max(parseInt(template.padding_left) || 40, 20),
    100,
  );
  const paddingRight = Math.min(
    Math.max(parseInt(template.padding_right) || 40, 20),
    100,
  );
  const paddingTop = Math.min(
    Math.max(parseInt(template.padding_top) || 40, 10),
    80,
  );
  const paddingBottom = Math.min(
    Math.max(parseInt(template.padding_bottom) || 40, 10),
    80,
  );

  const contentWidth = pageWidth - paddingLeft - paddingRight;

  // Calculate header and footer heights with validation
  const headerHeight = Math.min(
    Math.max(parseInt(template.header_height) || 80, 50),
    150,
  );
  const footerHeight = Math.min(
    Math.max(parseInt(template.footer_height) || 60, 40),
    120,
  );

  // Set initial Y position (will be adjusted after header is rendered)
  let currentY = paddingTop;
  let headerRendered = false;
  if (collegeDetails.header_image) {
    try {
      doc.image(collegeDetails.header_image, 0, 0, {
        width: pageWidth,
        height: headerHeight,
      });
      currentY = headerHeight + 15; // Small spacing after header
      headerRendered = true;
    } catch (error) {
      console.error("Error rendering header image from buffer:", error);
    }
  } else if (template.header_image_url) {
    try {
      const headerPath = path.join(
        process.cwd(),
        template.header_image_url.startsWith("/")
          ? template.header_image_url.substring(1)
          : template.header_image_url,
      );
      if (fs.existsSync(headerPath)) {
        doc.image(headerPath, 0, 0, { width: pageWidth, height: headerHeight });
        currentY = headerHeight + 15; // Small spacing after header
        headerRendered = true;
      }
    } catch (error) {
      console.error("Error loading header image from path:", error);
    }
  }

  // Calculate maximum Y position (content should not overlap footer)
  const maxContentY = pageHeight - footerHeight - 15;

  // Helper function to render text section with justify alignment
  const renderSection = (content, yPosition, additionalSpacing = 15) => {
    if (!content || content.trim() === "") return yPosition;

    const lines = content.split("\n");
    let y = yPosition;

    lines.forEach((line, index) => {
      if (line.trim() === "") {
        y += 10; // Add spacing for empty lines
        return;
      }

      // Validate font size
      const fontSize = Math.min(
        Math.max(parseInt(template.font_size) || 12, 8),
        24,
      );
      const lineGap = Math.min(
        Math.max(parseInt(template.line_spacing) || 2, 0),
        10,
      );

      // Check if we have space for the line (prevent footer overlap)
      const lineHeight =
        doc.heightOfString(line, {
          width: contentWidth,
          align: "justify",
          lineGap: lineGap,
        }) + 5;

      if (y + lineHeight > maxContentY) {
        // Skip rendering if it would overlap with footer
        return;
      }

      // Render text with proper positioning
      doc
        .font("Helvetica")
        .fontSize(fontSize)
        .fillColor("#000000")
        .text(line, paddingLeft, y, {
          width: contentWidth,
          align: "justify",
          lineGap: lineGap,
        });

      y += lineHeight;
    });

    return y + additionalSpacing; // Use dynamic section spacing
  };

  // Validate spacing values
  const topSpacing = Math.min(
    Math.max(parseInt(template.top_spacing) || 15, 5),
    50,
  );
  const middleSpacing = Math.min(
    Math.max(parseInt(template.middle_spacing) || 15, 5),
    50,
  );
  const bottomSpacing = Math.min(
    Math.max(parseInt(template.bottom_spacing) || 15, 5),
    50,
  );

  // Render top section
  if (processedContent.topContent) {
    currentY = renderSection(processedContent.topContent, currentY, topSpacing);
  }

  // Render middle section (required)
  currentY = renderSection(
    processedContent.middleContent,
    currentY,
    middleSpacing,
  );

  // Render bottom section
  if (processedContent.bottomContent) {
    currentY = renderSection(
      processedContent.bottomContent,
      currentY,
      bottomSpacing,
    );
  }

  // Render footer image if exists (at the bottom of the page)
  if (collegeDetails.footer_image) {
    try {
      const footerY = pageHeight - footerHeight;
      doc.image(collegeDetails.footer_image, 0, footerY, {
        width: pageWidth,
        height: footerHeight,
      });
    } catch (error) {
      console.error("Error rendering footer image from buffer:", error);
    }
  } else if (template.footer_image_url) {
    try {
      const footerPath = path.join(
        process.cwd(),
        template.footer_image_url.startsWith("/")
          ? template.footer_image_url.substring(1)
          : template.footer_image_url,
      );
      if (fs.existsSync(footerPath)) {
        const footerY = pageHeight - footerHeight;
        doc.image(footerPath, 0, footerY, {
          width: pageWidth,
          height: footerHeight,
        });
      }
    } catch (error) {
      console.error("Error loading footer image from path:", error);
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};

module.exports = {
  generateStudyCertificate,
  generateRefundApplication,
  generateCustodianCertificate,
  generateDynamicCertificate,
  generateTemplatedCertificate,
};
