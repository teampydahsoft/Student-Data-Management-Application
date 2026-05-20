// DLT Template: "Dear Parent, {#var#} is absent today i.e., on {#var#}Principal, PYDAH."
// Variable 1: "your ward", Variable 2: date (DD-MM-YYYY)
const DEFAULT_TEMPLATE =
  'Dear Parent, {#var#} is absent today i.e., on {#var#}Principal, PYDAH.';

const { masterPool } = require('../config/database');

// DLT Template ID and PE ID for absent SMS
const SMS_TEMPLATE_ID = process.env.SMS_TEMPLATE_ID || '1607100000000150000';
const SMS_PE_ID = process.env.SMS_PE_ID || '1102395590000010000';
// Birthday SMS: optional separate DLT template ID (falls back to SMS_TEMPLATE_ID if not set)
const SMS_BIRTHDAY_TEMPLATE_ID = process.env.SMS_BIRTHDAY_TEMPLATE_ID || SMS_TEMPLATE_ID;

// Support both SMS_* and BULKSMS_* env variable names
const SMS_API_URL = process.env.SMS_API_URL || process.env.BULKSMS_API_URL || process.env.BULKSMS_ENGLISH_API_URL || 'http://www.bulksmsapps.com/api/apismsv2.aspx';
const SMS_API_KEY = process.env.SMS_API_KEY || process.env.BULKSMS_API_KEY || '7c9c967a-4ce9-4748-9dc7-d2aaef847275';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || process.env.BULKSMS_SENDER_ID || 'PYDAHK';
const SMS_TEST_MODE = String(process.env.SMS_TEST_MODE || '').toLowerCase() === 'true';

// Log SMS configuration on module load (helps debug configuration issues)
console.log('📱 SMS Service Configuration:');
console.log(`   API URL: ${SMS_API_URL}`);
console.log(`   Sender ID: ${SMS_SENDER_ID}`);
console.log(`   Template ID: ${SMS_TEMPLATE_ID}`);
console.log(`   PE ID: ${SMS_PE_ID}`);
console.log(`   Test Mode: ${SMS_TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
console.log(`   API Key: ${SMS_API_KEY ? SMS_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);

const ensureFetchAvailable = () => {
  if (typeof fetch === 'function') {
    return true;
  }

  console.warn('⚠️  Global fetch API is not available. SMS requests are skipped.');
  return false;
};

const formatDateForMessage = (dateString = '') => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const logSmsToDb = async ({ studentId, mobileNumber, message, category, currentYear, currentSemester, status, messageId, errorDetails }) => {
  if (!studentId) return;

  try {
    const query = `
      INSERT INTO sms_logs 
      (student_id, mobile_number, message, category, current_year, current_semester, status, message_id, error_details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      studentId,
      mobileNumber,
      message,
      category || 'General',
      currentYear || null,
      currentSemester || null,
      status,
      messageId || null,
      errorDetails || null
    ];

    await masterPool.query(query, params);
  } catch (error) {
    console.error('Failed to log SMS to DB:', error);
  }
};

const dispatchSms = async ({ to, message, templateId, peId, meta = {} }) => {
  const logPrefix = `[SMS] ${meta?.student?.admissionNumber || 'unknown'}`;
  const student = meta?.student || {};

  if (!to) {
    console.log(`${logPrefix} ⚠️ SKIPPED - No destination number provided`);
    return {
      success: false,
      skipped: true,
      reason: 'missing_destination'
    };
  }

  if (SMS_TEST_MODE) {
    console.log(`${logPrefix} 🧪 TEST MODE - SMS simulated to ${to}`);
    console.log(`${logPrefix}    Message: ${message}`);

    // Log success in DB for test mode
    await logSmsToDb({
      studentId: student.id,
      mobileNumber: to,
      message,
      category: meta.category || 'General',
      currentYear: student.currentYear,
      currentSemester: student.currentSemester,
      status: 'Sent',
      messageId: 'TEST-MODE-' + Date.now(),
      errorDetails: 'Test Mode Simulation'
    });

    return {
      success: true,
      mocked: true,
      testMode: true,
      sentTo: to
    };
  }

  if (!SMS_API_URL) {
    console.warn(`${logPrefix} ⚠️ SKIPPED - SMS_API_URL not configured`);
    return {
      success: false,
      skipped: true,
      reason: 'config_missing'
    };
  }

  if (!ensureFetchAvailable()) {
    console.warn(`${logPrefix} ⚠️ SKIPPED - fetch API not available`);
    return {
      success: false,
      skipped: true,
      reason: 'fetch_unavailable'
    };
  }

  let result = { success: false };

  try {
    console.log(`${logPrefix} 📤 SENDING SMS to ${to}...`);

    // BulkSMSApps.com API parameters
    // Using the exact parameter names that work with their API
    const params = new URLSearchParams();

    // API Key - try 'apikey' (most common for bulksmsapps)
    params.append('apikey', SMS_API_KEY);

    // Sender ID 
    params.append('sender', SMS_SENDER_ID);

    // Mobile number - singular 'number' 
    params.append('number', to);

    // Message content
    params.append('message', message);

    // DLT Template ID (lowercase)
    params.append('templateid', templateId || SMS_TEMPLATE_ID);

    // Principal Entity ID (lowercase)
    params.append('peid', peId || SMS_PE_ID);

    // Ensure we use HTTP (not HTTPS) as per the user's working config
    let apiUrl = SMS_API_URL;
    if (apiUrl.startsWith('https://')) {
      apiUrl = apiUrl.replace('https://', 'http://');
    }

    // Build URL with query parameters (GET method)
    const fullUrl = `${apiUrl}?${params.toString()}`;

    // Log request details
    console.log(`${logPrefix}    API URL: ${apiUrl}`);
    console.log(`${logPrefix}    Full Request: ${apiUrl}?apikey=***&sender=${SMS_SENDER_ID}&number=${to}&templateid=${templateId || SMS_TEMPLATE_ID}&peid=${peId || SMS_PE_ID}`);
    console.log(`${logPrefix}    Message: "${message}"`);

    // Send GET request
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain, application/json, */*',
        'User-Agent': 'NodeJS-SMS-Client/1.0'
      }
    });

    const text = await response.text();
    console.log(`${logPrefix}    HTTP Status: ${response.status}`);
    console.log(`${logPrefix}    API Response: ${text}`);

    if (!response.ok) {
      console.error(`${logPrefix} ❌ FAILED - HTTP ${response.status}`);
      result = {
        success: false,
        skipped: false,
        reason: `http_${response.status}`,
        details: text,
        sentTo: to
      };

      // Log failure
      await logSmsToDb({
        studentId: student.id,
        mobileNumber: to,
        message,
        category: meta.category || 'General',
        currentYear: student.currentYear,
        currentSemester: student.currentSemester,
        status: 'Failed',
        errorDetails: `HTTP ${response.status}: ${text}`
      });

      return result;
    }

    // Check for success patterns FIRST (message IDs are definitive success)
    // BulkSMSApps returns "MessageId-XXXXXXX" on success
    const successPatterns = [
      /MessageId[-:]\s*\d+/i,  // MessageId-123456 or MessageId: 123456
      /^[0-9]+$/,              // Just a number (message ID)
      /success/i,
      /sent/i,
      /submitted/i,
      /accepted/i
    ];

    // Extract just the first line or first part before HTML
    const firstLine = text.split('\n')[0].trim();
    const beforeHtml = text.split('<!DOCTYPE')[0].trim();
    const relevantText = beforeHtml || firstLine || text;

    console.log(`${logPrefix}    Checking response: "${relevantText.substring(0, 100)}"`);

    // Check if we have a MessageId (definitive success)
    const messageIdMatch = text.match(/MessageId[-:]\s*(\d+)/i);
    if (messageIdMatch) {
      console.log(`${logPrefix} ✅ SUCCESS - SMS sent to ${to} (MessageId: ${messageIdMatch[1]})`);

      await logSmsToDb({
        studentId: student.id,
        mobileNumber: to,
        message,
        category: meta.category || 'General',
        currentYear: student.currentYear,
        currentSemester: student.currentSemester,
        status: 'Sent',
        messageId: messageIdMatch[1]
      });

      return {
        success: true,
        data: relevantText,
        messageId: messageIdMatch[1],
        sentTo: to
      };
    }

    // Check other success patterns
    const hasSuccess = successPatterns.some(pattern =>
      pattern instanceof RegExp ? pattern.test(relevantText) : relevantText.toLowerCase().includes(pattern.toLowerCase())
    );

    if (hasSuccess) {
      console.log(`${logPrefix} ✅ SUCCESS - SMS sent to ${to}`);

      await logSmsToDb({
        studentId: student.id,
        mobileNumber: to,
        message,
        category: meta.category || 'General',
        currentYear: student.currentYear,
        currentSemester: student.currentSemester,
        status: 'Sent',
        messageId: null
      });

      return {
        success: true,
        data: relevantText,
        sentTo: to
      };
    }

    // Check for error patterns only if no success pattern found
    const errorPatterns = [
      'Object reference not set',
      'invalid',
      'Invalid',
      'failed',
      'Failed',
      'ERROR',
      'Error:',
      'Authentication',
      'Unauthorized',
      'insufficient',
      'balance',
      'expired'
    ];

    const hasError = errorPatterns.some(pattern =>
      relevantText.includes(pattern) || relevantText.toLowerCase().includes(pattern.toLowerCase())
    );

    if (hasError) {
      console.error(`${logPrefix} ❌ API ERROR - SMS to ${to} failed`);
      console.error(`${logPrefix}    Error details: ${relevantText}`);

      await logSmsToDb({
        studentId: student.id,
        mobileNumber: to,
        message,
        category: meta.category || 'General',
        currentYear: student.currentYear,
        currentSemester: student.currentSemester,
        status: 'Failed',
        errorDetails: relevantText
      });

      return {
        success: false,
        skipped: false,
        reason: 'api_error',
        details: relevantText,
        sentTo: to
      };
    }

    // If response is short and doesn't look like an error, assume success
    if (relevantText.length > 0 && relevantText.length < 200) {
      console.log(`${logPrefix} ✅ SUCCESS (assumed) - SMS sent to ${to}`);

      await logSmsToDb({
        studentId: student.id,
        mobileNumber: to,
        message,
        category: meta.category || 'General',
        currentYear: student.currentYear,
        currentSemester: student.currentSemester,
        status: 'Sent',
        messageId: null
      });

      return {
        success: true,
        data: relevantText,
        sentTo: to
      };
    }

    // Unknown response format - log it and mark as potentially failed
    console.warn(`${logPrefix} ⚠️ UNKNOWN RESPONSE - Unable to determine SMS status`);
    console.warn(`${logPrefix}    Response: ${relevantText.substring(0, 200)}`);

    await logSmsToDb({
      studentId: student.id,
      mobileNumber: to,
      message,
      category: meta.category || 'General',
      currentYear: student.currentYear,
      currentSemester: student.currentSemester,
      status: 'Failed',
      errorDetails: 'Unknown Response: ' + relevantText.substring(0, 200)
    });

    return {
      success: false,
      skipped: false,
      reason: 'unknown_response',
      details: relevantText.substring(0, 500),
      sentTo: to
    };
  } catch (error) {
    console.error(`${logPrefix} ❌ EXCEPTION - ${error.message || error}`);

    await logSmsToDb({
      studentId: student.id,
      mobileNumber: to,
      message,
      category: meta.category || 'General',
      currentYear: student.currentYear,
      currentSemester: student.currentSemester,
      status: 'Failed',
      errorDetails: error.message || String(error)
    });

    return {
      success: false,
      skipped: false,
      reason: 'exception',
      details: error.message || String(error),
      sentTo: to
    };
  }
};

const resolveParentContact = (student) => {
  if (!student) return '';

  if (student.parent_mobile1) {
    return student.parent_mobile1;
  }

  if (student.parent_mobile2) {
    return student.parent_mobile2;
  }

  const data = student.student_data;
  if (!data || typeof data !== 'object') {
    return '';
  }

  return (
    data['Parent Mobile Number 1'] ||
    data['Parent Phone Number 1'] ||
    data['Parent Mobile Number'] ||
    data['Parent 1 Mobile'] ||
    ''
  );
};

/** Resolve student's full name for SMS (e.g. birthday wishes). */
const resolveStudentFullName = (student) => {
  if (!student) return 'Student';

  let data = student.student_data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data || '{}');
    } catch {
      data = {};
    }
  }

  const name =
    (student.student_name && String(student.student_name).trim()) ||
    (data &&
      String(data['Student Name'] || data['student_name'] || '').trim()) ||
    '';

  return name || 'Student';
};

/** Resolve student's own mobile for SMS (e.g. birthday wishes to student). */
const resolveStudentMobile = (student) => {
  if (!student) return '';
  if (student.student_mobile) return student.student_mobile;
  let data = student.student_data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data || '{}');
    } catch {
      return '';
    }
  }
  if (!data || typeof data !== 'object') return '';
  return (
    data['Student Mobile Number'] ||
    data['Student Mobile number'] ||
    data['Student Mobile'] ||
    data['student_mobile'] ||
    ''
  );
};

// Birthday SMS template: "Dear {#var#} Happy Birthday! ..." — {#var#} = student name
const BIRTHDAY_SMS_TEMPLATE =
  process.env.SMS_BIRTHDAY_TEMPLATE ||
  'Dear {#var#} Happy Birthday! May this year bring success, happiness, and good health. Keep learning and growing. Best wishes from Pydah Group.';

/**
 * Build message by replacing {#var#} placeholders with actual values
 * DLT Template: "Dear Parent, {#var#} is absent today i.e., on {#var#}Principal, PYDAH."
 * Variables: [0] = "your ward", [1] = date (DD-MM-YYYY)
 */
const buildAbsenceMessage = (template, variables) => {
  let message = template;
  let varIndex = 0;

  // Replace each {#var#} placeholder with the corresponding variable value
  message = message.replace(/\{#var#\}/g, () => {
    const value = variables[varIndex] || '';
    varIndex++;
    return value;
  });

  return message;
};

/**
 * Convert template with {{variable}} format to DLT format with {#var#}
 * Handles the conversion from UI template format to DLT SMS format
 */
const convertTemplateToDLT = (template, variables) => {
  // If template already uses {#var#} format, use it as-is
  if (template.includes('{#var#}')) {
    return template;
  }

  // Convert {{variable}} format to {#var#} format
  // For attendance, we need to map:
  // {{studentName}} -> "your ward" (first variable)
  // {{admissionNumber}} -> can be included in the message
  // {{date}} -> formatted date (second variable)

  let dltTemplate = template;
  const dltVariables = [];

  // Replace {{studentName}} with first {#var#} and add "your ward" to variables
  if (dltTemplate.includes('{{studentName}}')) {
    dltTemplate = dltTemplate.replace(/\{\{studentName\}\}/g, '{#var#}');
    dltVariables.push('your ward');
  }

  // Replace {{admissionNumber}} - include it in the message if present
  if (dltTemplate.includes('{{admissionNumber}}')) {
    const admissionNumber = variables.studentName || variables.admissionNumber || '';
    dltTemplate = dltTemplate.replace(/\{\{admissionNumber\}\}/g, admissionNumber);
  }

  // Replace {{date}} with second {#var#} and add formatted date to variables
  if (dltTemplate.includes('{{date}}')) {
    dltTemplate = dltTemplate.replace(/\{\{date\}\}/g, '{#var#}');
    dltVariables.push(variables.date || formatDateForMessage(variables.attendanceDate));
  }

  return { template: dltTemplate, variables: dltVariables };
};

exports.sendAbsenceNotification = async ({
  student,
  attendanceDate,
  notificationSettings = null
}) => {
  const logPrefix = `[SMS] ${student.admission_number || 'unknown'}`;
  const parentMobile = resolveParentContact(student);

  if (!parentMobile) {
    console.log(`${logPrefix} ⚠️ SKIPPED - No parent mobile number found`);
    return {
      success: false,
      skipped: true,
      reason: 'missing_parent_mobile'
    };
  }

  // Use notification settings if provided, otherwise fall back to env/default
  let template;
  if (notificationSettings && notificationSettings.smsTemplate) {
    template = notificationSettings.smsTemplate;
  } else {
    template = process.env.SMS_ABSENCE_TEMPLATE || DEFAULT_TEMPLATE;
  }

  const formattedDate = formatDateForMessage(attendanceDate);
  const studentName = student.student_name ||
    (student.student_data && (student.student_data['Student Name'] || student.student_data['student_name'])) ||
    'your ward';
  const admissionNumber = student.admission_number || '';

  // Convert template format if needed
  let message;
  if (template.includes('{#var#}')) {
    // DLT format - use as-is
    message = buildAbsenceMessage(template, [
      'your ward',
      formattedDate
    ]);
  } else {
    // UI format with {{variables}} - convert to DLT
    const converted = convertTemplateToDLT(template, {
      studentName,
      admissionNumber,
      date: formattedDate,
      attendanceDate
    });
    message = buildAbsenceMessage(converted.template, converted.variables);
  }

  // Log the message being sent
  console.log(`${logPrefix} 📱 Preparing SMS for parent: ${parentMobile}`);
  console.log(`${logPrefix} 📝 Message: "${message}"`);

  return dispatchSms({
    to: parentMobile,
    message,
    templateId: SMS_TEMPLATE_ID,
    peId: SMS_PE_ID,
    meta: {
      category: 'Attendance',
      template: 'attendance_absent',
      student: {
        id: student.id,
        admissionNumber: student.admission_number,
        currentYear: student.current_year,
        currentSemester: student.current_semester
      },
      attendanceDate
    }
  });
};

/**
 * Send birthday SMS to student using template:
 * "Dear {#var#} Happy Birthday! May this year bring success, happiness, and good health. Keep learning and growing. Best wishes from Pydah Group."
 * {#var#} is replaced with the student's full name.
 */
exports.sendBirthdaySms = async ({ student }) => {
  const logPrefix = `[SMS Birthday] ${student.admission_number || 'unknown'}`;
  const to = resolveStudentMobile(student);

  if (!to) {
    console.log(`${logPrefix} ⚠️ SKIPPED - No student mobile number found`);
    return {
      success: false,
      skipped: true,
      reason: 'missing_student_mobile'
    };
  }

  const nameForMessage = resolveStudentFullName(student);

  const message = buildAbsenceMessage(BIRTHDAY_SMS_TEMPLATE, [nameForMessage]);

  console.log(`${logPrefix} 📱 Sending birthday SMS to ${to}`);
  console.log(`${logPrefix} 📝 Message: "${message}"`);
  return dispatchSms({
    to,
    message,
    templateId: SMS_BIRTHDAY_TEMPLATE_ID,
    peId: SMS_PE_ID,
    meta: {
      category: 'Birthday',
      template: 'birthday',
      student: {
        id: student.id,
        admissionNumber: student.admission_number,
        currentYear: student.current_year,
        currentSemester: student.current_semester
      }
    }
  });
};

// Generic SMS sending function
exports.sendSms = dispatchSms;

const SMS_BALANCE_API_URL =
  process.env.SMS_BALANCE_API_URL ||
  'http://www.bulksmsapps.com/api/apicheckbalancev2.aspx';

const parseBalanceFromResponse = (text) => {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.split('<!DOCTYPE')[0].split('\n')[0].trim();

  try {
    const json = JSON.parse(cleaned);
    const candidates = [
      json.credits,
      json.Credits,
      json.balance,
      json.Balance,
      json.credit,
      json.Credit,
      json?.Data?.[0]?.Credits,
      json?.data?.credits
    ];
    for (const val of candidates) {
      if (val !== undefined && val !== null && val !== '') {
        const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
        if (!Number.isNaN(num)) return num;
      }
    }
  } catch {
    // not JSON
  }

  // BulkSMSApps: "69409 credit balance"
  const leadingCredit = cleaned.match(/^([\d,.]+)\s+credit\s+balance/i);
  if (leadingCredit) {
    const num = parseFloat(leadingCredit[1].replace(/,/g, ''));
    if (!Number.isNaN(num)) return num;
  }

  const labeled = cleaned.match(/(?:balance|credit|available)[\s:=-]+([\d,.]+)/i);
  if (labeled) {
    const num = parseFloat(labeled[1].replace(/,/g, ''));
    if (!Number.isNaN(num)) return num;
  }

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned);
  }

  const numMatch = cleaned.match(/([\d,]+\.?\d*)/);
  if (numMatch) {
    const num = parseFloat(numMatch[1].replace(/,/g, ''));
    if (!Number.isNaN(num)) return num;
  }

  return null;
};

/**
 * Fetch remaining SMS credits from the BulkSMSApps account.
 */
exports.getAccountBalance = async () => {
  if (SMS_TEST_MODE) {
    return {
      success: true,
      credits: null,
      testMode: true,
      message: 'Test mode — balance not fetched from provider'
    };
  }

  if (!SMS_API_KEY) {
    return {
      success: false,
      credits: null,
      error: 'SMS API key is not configured'
    };
  }

  if (!ensureFetchAvailable()) {
    return {
      success: false,
      credits: null,
      error: 'Fetch API unavailable'
    };
  }

  const balanceUrls = [
    SMS_BALANCE_API_URL,
    'http://www.bulksmsapps.com/api/apicheckbalancev2.aspx'
  ].filter((url, i, arr) => url && arr.indexOf(url) === i);

  let lastError = null;

  for (const baseUrl of balanceUrls) {
    try {
      let apiUrl = baseUrl;
      if (apiUrl.startsWith('https://')) {
        apiUrl = apiUrl.replace('https://', 'http://');
      }

      const params = new URLSearchParams();
      params.append('apikey', SMS_API_KEY);

      const fullUrl = `${apiUrl}?${params.toString()}`;
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/plain, application/json, */*',
          'User-Agent': 'NodeJS-SMS-Client/1.0'
        }
      });

      const text = await response.text();
      const credits = parseBalanceFromResponse(text);

      if (credits !== null) {
        return {
          success: true,
          credits,
          rawResponse: text.substring(0, 200),
          fetchedAt: new Date().toISOString()
        };
      }

      const lower = text.toLowerCase();
      if (
        lower.includes('invalid') ||
        lower.includes('unauthorized') ||
        lower.includes('authentication')
      ) {
        lastError = text.substring(0, 200);
        break;
      }

      lastError = text.substring(0, 200) || `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message || String(error);
    }
  }

  return {
    success: false,
    credits: null,
    error: lastError || 'Unable to parse balance from provider response'
  };
};

module.exports = {
  sendAbsenceNotification: exports.sendAbsenceNotification,
  sendBirthdaySms: exports.sendBirthdaySms,
  sendSms: dispatchSms,
  getAccountBalance: exports.getAccountBalance
};
