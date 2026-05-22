const { masterPool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { sendSms } = require('../services/smsService');

// DLT SMS Template IDs for student credentials
const STUDENT_CREATION_SMS_TEMPLATE_ID =
  process.env.STUDENT_CREATION_SMS_TEMPLATE_ID || '1707176525577028276';
const STUDENT_PASSWORD_RESET_SMS_TEMPLATE_ID =
  process.env.STUDENT_PASSWORD_RESET_SMS_TEMPLATE_ID || '1707176526611076697';

/**
 * Resolve login username for a student.
 * - Default: admission number (used in SMS and student_credentials.username).
 * - If a distinct PIN is assigned (not equal to admission), use PIN instead.
 */
function resolveStudentLoginUsername({ pinNo, admissionNumber, admissionNo }) {
  const pin = String(pinNo || '').trim();
  const admission = String(admissionNumber || '').trim();
  const admissionAlt = String(admissionNo || '').trim();
  const loginAdmission = admission || admissionAlt;

  if (!loginAdmission) {
    return null;
  }

  const pinMatchesAdmission =
    pin &&
    (pin === admission ||
      pin === admissionAlt ||
      (admission && pin.toLowerCase() === admission.toLowerCase()) ||
      (admissionAlt && pin.toLowerCase() === admissionAlt.toLowerCase()));

  if (pin && !pinMatchesAdmission) {
    return pin;
  }

  return loginAdmission;
}

/**
 * Generate and store student login credentials
 * Username: admission number (default) OR distinct PIN when assigned
 * Password: random 8-character alphanumeric
 * 
 * @param {number} studentId - Student ID from students table
 * @param {string} admissionNumber - Student admission number
 * @param {string} pinNo - Student PIN number (optional)
 * @param {string} studentName - Student name
 * @param {string} studentMobile - Student mobile number
 * @param {boolean} isPasswordReset - Whether this is a password reset (default: false for account creation)
 * @returns {Promise<{success: boolean, username?: string, error?: string}>}
 */
async function generateStudentCredentials(
  studentId,
  admissionNumber,
  pinNo,
  studentName,
  studentMobile,
  isPasswordReset = false,
  admissionNo = null
) {
  try {
    // Validate required fields
    if (!studentMobile || studentMobile.trim() === '') {
      return { success: false, error: 'Mobile number is required' };
    }

    if (!studentName || studentName.trim() === '') {
      return { success: false, error: 'Student name is required' };
    }

    const username = resolveStudentLoginUsername({
      pinNo,
      admissionNumber,
      admissionNo
    });

    if (!username) {
      return { success: false, error: 'Admission number is required for username' };
    }

    // Generate random alphanumeric password (8 characters)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let plainPassword = '';
    for (let i = 0; i < 8; i++) {
      plainPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Hash password
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    // Insert or update credentials
    await masterPool.query(`
      INSERT INTO student_credentials (student_id, admission_number, username, password_hash)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        username = VALUES(username),
        updated_at = CURRENT_TIMESTAMP
    `, [studentId, admissionNumber, username, passwordHash]);

    // Send SMS notification with login credentials
    try {
      // Remove trailing slash from URL to match DLT template format exactly
      let loginUrl = (process.env.LOGIN_LINK || process.env.STUDENT_PORTAL_URL || 'pydahgroup.com').trim();
      loginUrl = loginUrl.replace(/\/+$/, ''); // Remove trailing slashes

      let smsMessage;
      let templateId;

      if (isPasswordReset) {
        // DLT Template 2: "Hello {#var#} your password has been updated. Username: {#var#} New Password: {#var#} Login: {#var#} - Pydah College"
        // Format: Login: {URL}- Pydah College (removed space to match DLT template)
        smsMessage = `Hello ${studentName || 'Student'} your password has been updated. Username: ${username} New Password: ${plainPassword} Login: ${loginUrl} - Pydah College`;
        templateId = STUDENT_PASSWORD_RESET_SMS_TEMPLATE_ID;
      } else {
        // DLT Template 1: "Hello {#var#} your account has been created. Username: {#var#} Password: {#var#}. Login: {#var#}- Pydah College"
        // Format: Login: {URL}- Pydah College (removed space to match DLT template)
        smsMessage = `Hello ${studentName || 'Student'} your account has been created. Username: ${username} Password: ${plainPassword}. Login: ${loginUrl} - Pydah College`;
        templateId = STUDENT_CREATION_SMS_TEMPLATE_ID;
      }

      // Log the exact message being sent for debugging
      console.log(`[SMS Template] Sending ${isPasswordReset ? 'password reset' : 'account creation'} SMS to ${studentMobile.replace(/\D/g, '')}`);
      console.log(`[SMS Template] Template ID: ${templateId}`);
      console.log(`[SMS Template] Message: "${smsMessage}"`);
      console.log(`[SMS Template] Message length: ${smsMessage.length} characters`);

      const smsResult = await sendSms({
        to: studentMobile.replace(/\D/g, ''), // Ensure only digits
        message: smsMessage,
        templateId: templateId,
        meta: {
          student: { admissionNumber },
          type: isPasswordReset ? 'password_reset' : 'account_creation'
        }
      });

      if (smsResult.success) {
        console.log(`✅ SMS sent successfully to ${studentMobile.replace(/\D/g, '')} for student ${admissionNumber} (${isPasswordReset ? 'password reset' : 'account creation'})`);
      } else {
        console.error(`❌ SMS failed to send: ${smsResult.reason || 'Unknown error'}`, smsResult);
      }
    } catch (smsError) {
      console.error('Error sending SMS with credentials (non-fatal):', smsError);
      // Don't fail credential generation if SMS fails
    }

    return { success: true, username, password: plainPassword };
  } catch (error) {
    console.error('Error generating student credentials:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate credentials for a student by admission number
 * Fetches student data and generates credentials
 * 
 * @param {string} admissionNumber - Student admission number
 * @returns {Promise<{success: boolean, username?: string, error?: string}>}
 */
async function generateCredentialsByAdmissionNumber(admissionNumber, isPasswordReset = false) {
  try {
    const [students] = await masterPool.query(`
      SELECT id, admission_number, admission_no, pin_no, student_name, student_mobile
      FROM students
      WHERE admission_number = ? OR admission_no = ?
      LIMIT 1
    `, [admissionNumber, admissionNumber]);

    if (students.length === 0) {
      return { success: false, error: 'Student not found' };
    }

    const student = students[0];
    return await generateStudentCredentials(
      student.id,
      student.admission_number,
      student.pin_no,
      student.student_name,
      student.student_mobile,
      isPasswordReset,
      student.admission_no
    );
  } catch (error) {
    console.error('Error generating credentials by admission number:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  resolveStudentLoginUsername,
  generateStudentCredentials,
  generateCredentialsByAdmissionNumber
};

