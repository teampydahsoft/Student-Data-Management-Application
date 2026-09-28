/**
 * DLT SMS templates for OTP flows (BulkSMSApps).
 * Registered text must match the message sent at runtime exactly.
 */

const OTP_PE_ID = process.env.OTP_PE_ID || process.env.SMS_PE_ID;

/** Semester registration OTP — 3 variables */
const SEMESTER_OTP_SMS_TEMPLATE_ID =
  process.env.OTP_SMS_TEMPLATE_ID || '1707176605569953063';

/**
 * DLT: Your {#var#} OTP for {#var#} Semester Registration is {#var#}. Valid for 5 minutes -Pydah College
 * var1 = type (Student/Parent), var2 = year-semester, var3 = OTP
 */
const buildSemesterRegistrationOtpMessage = (otp, { type = 'Student', year, semester, templateContent } = {}) => {
  const typeVal = type || 'Student';
  const yearSemVal = (year && semester) ? `${year}-${semester}` : (year || semester || 'Current');

  if (templateContent && templateContent.includes('{#var#}')) {
    const vars = [typeVal, yearSemVal, otp];
    let varIdx = 0;
    return templateContent.replace(/\{#var#\}/g, () => vars[varIdx++] || '');
  }

  return `Your ${typeVal} OTP for ${yearSemVal} Semester Registration is ${otp}. Valid for 5 minutes -Pydah College`;
};

/**
 * Fetch dynamic Semester Registration OTP template from DB (sms_templates table)
 */
const getSemesterRegistrationOtpTemplateFromDb = async () => {
  try {
    const { masterPool } = require('../config/database');
    const [rows] = await masterPool.query(
      `SELECT template_id, content FROM sms_templates 
       WHERE template_id = ? OR LOWER(name) LIKE '%semester%registration%otp%' 
       ORDER BY id DESC LIMIT 1`,
      [SEMESTER_OTP_SMS_TEMPLATE_ID]
    );
    if (rows && rows.length > 0 && rows[0].template_id && rows[0].content) {
      return {
        templateId: rows[0].template_id,
        content: rows[0].content
      };
    }
  } catch (err) {
    console.warn('Failed to fetch semester registration OTP template from DB:', err.message);
  }
  return null;
};

/**
 * Parent portal login OTP — 1 variable (OTP only).
 * DLT: Dear parent , Your Pydah College Parent Portal OTP is {#var#}. -Pydah College
 */
const PARENT_OTP_SMS_TEMPLATE_ID = '1707178073641929328';

const buildParentPortalOtpMessage = (otp) =>
  `Dear parent , Your Pydah College Parent Portal OTP is ${otp}. -Pydah College`;

const sendOtpSms = (smsService, { to, message, templateId, peId = OTP_PE_ID, meta = {} }) =>
  smsService.sendSms({
    to,
    message,
    templateId,
    peId,
    meta: { category: 'otp', ...meta }
  });

module.exports = {
  OTP_PE_ID,
  SEMESTER_OTP_SMS_TEMPLATE_ID,
  PARENT_OTP_SMS_TEMPLATE_ID,
  buildSemesterRegistrationOtpMessage,
  getSemesterRegistrationOtpTemplateFromDb,
  buildParentPortalOtpMessage,
  sendOtpSms
};

