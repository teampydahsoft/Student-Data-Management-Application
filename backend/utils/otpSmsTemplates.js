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
const buildSemesterRegistrationOtpMessage = (otp, { type = 'Student', year, semester } = {}) =>
  `Your ${type || 'Student'} OTP for ${year}-${semester} Semester Registration is ${otp}. Valid for 5 minutes -Pydah College`;

/**
 * Parent portal login OTP — 1 variable (OTP only).
 * DLT: Dear parent , Your Pydah College Parent Portal OTP is {#var#}.  -Pydah College
 */
const PARENT_OTP_SMS_TEMPLATE_ID =
  process.env.PARENT_OTP_SMS_TEMPLATE_ID || '1707176605569953063';

const buildParentPortalOtpMessage = (otp) => {
  const custom = process.env.PARENT_OTP_SMS_MESSAGE;
  if (custom && custom.includes('{otp}')) {
    return custom.replace(/\{otp\}/g, String(otp));
  }
  return `Dear parent , Your Pydah College Parent Portal OTP is ${otp}.  -Pydah College`;
};

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
  buildParentPortalOtpMessage,
  sendOtpSms
};
