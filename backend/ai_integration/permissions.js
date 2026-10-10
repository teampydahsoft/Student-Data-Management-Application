/**
 * AI Integration Permissions Engine
 * Enforces record-level security so users can access only their authorized data.
 */

function checkStudentAccess(userContext, targetStudentIdentifier) {
  if (!userContext) {
    throw new Error("Access denied: User context missing or unauthenticated.");
  }

  const role = (userContext.role || "").toLowerCase().trim();

  // Administrative, Staff, & Faculty roles have system-wide access
  const privilegedRoles = [
    "super_admin",
    "admin",
    "staff",
    "employee",
    "faculty",
    "branch_faculty",
    "principal",
    "director",
    "hod"
  ];

  if (privilegedRoles.includes(role)) {
    return true;
  }

  // If no target provided, default allowed (tools will scope to userContext itself)
  if (!targetStudentIdentifier) {
    return true;
  }

  // Extract all possible student identity attributes for current user
  const currentUserId = String(userContext.userId || userContext.id || "").toLowerCase().trim();
  const currentPin = String(userContext.pinNo || userContext.pin_no || "").toLowerCase().trim();
  const currentAdmissionNo = String(userContext.admissionNumber || userContext.admission_number || "").toLowerCase().trim();
  const currentUsername = String(userContext.username || "").toLowerCase().trim();

  const targetStr = String(targetStudentIdentifier).toLowerCase().trim();

  if (role === "student" || role === "parent") {
    const isSelf =
      (currentUserId && currentUserId === targetStr) ||
      (currentPin && currentPin === targetStr) ||
      (currentAdmissionNo && currentAdmissionNo === targetStr) ||
      (currentUsername && currentUsername === targetStr);

    if (!isSelf) {
      throw new Error("Access denied: You can only query your own student records.");
    }
  }

  return true;
}

module.exports = {
  checkStudentAccess,
  check_student_access: checkStudentAccess
};
