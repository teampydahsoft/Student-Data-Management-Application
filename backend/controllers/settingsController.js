const { masterPool } = require('../config/database');
const { logAudit } = require('../services/auditLogService');

const auditSettingChange = (req, settingKey, details) => {
  logAudit(req, {
    actionType: 'UPDATE',
    entityType: 'SETTINGS',
    entityId: settingKey,
    details
  });
};

const NOTIFICATION_TYPES = {
  user_creation: {
    key: 'user_creation',
    defaultEmailSubject: 'Your Account Has Been Created',
    defaultEmailTemplate: `Hello {{name}},

Your account has been created successfully. Below are your login credentials:

Username: {{username}}
Password: {{password}}
Role: {{role}}

Please change your password after your first login.

Login URL: {{loginUrl}}`,
    // DLT Template 1: "Hello {#var#} your account has been created. Username: {#var#} Password: {#var#}. Login: {#var#}- Pydah College"
    defaultSmsTemplate: `Hello {{name}} your account has been created. Username: {{username}} Password: {{password}}. Login: {{loginUrl}} - Pydah College`
  },
  password_update: {
    key: 'password_update',
    defaultEmailSubject: 'Your Password Has Been Updated',
    defaultEmailTemplate: `Hello {{name}},

Your password has been updated successfully.

Username: {{username}}
New Password: {{password}}

Please change your password after your first login.

Login URL: {{loginUrl}}`,
    // DLT Template 2: "Hello {#var#} your password has been updated. Username: {#var#} New Password: {#var#} Login: {#var#}- Pydah College"
    defaultSmsTemplate: `Hello {{name}} your password has been updated. Username: {{username}} New Password: {{password}} Login: {{loginUrl}} - Pydah College`
  },
  attendance_absent: {
    key: 'attendance_absent',
    defaultSmsTemplate: `Dear Parent, {#var#} is absent today i.e., on {#var#}Principal, PYDAH.`
  }
};

/**
 * GET /api/settings/notifications
 * Get all notification settings
 */
exports.getNotificationSettings = async (req, res) => {
  try {
    // Fetch from MySQL
    const [settings] = await masterPool.query(
      'SELECT `key`, value FROM settings WHERE `key` LIKE ?',
      ['notification_%']
    );

    // Build settings object from database or use defaults
    const settingsObj = {};

    if (settings && settings.length > 0) {
      settings.forEach(item => {
        const key = item.key.replace('notification_', '');
        try {
          settingsObj[key] = JSON.parse(item.value);
        } catch (e) {
          // If parsing fails, use default
          const type = Object.values(NOTIFICATION_TYPES).find(t => t.key === key);
          if (type) {
            settingsObj[key] = {
              enabled: true,
              emailEnabled: true,
              smsEnabled: true,
              emailSubject: type.defaultEmailSubject,
              emailTemplate: type.defaultEmailTemplate,
              smsTemplate: type.defaultSmsTemplate
            };
          }
        }
      });
    }

    // Ensure all notification types have settings
    Object.values(NOTIFICATION_TYPES).forEach(type => {
      if (!settingsObj[type.key]) {
        settingsObj[type.key] = {
          enabled: true,
          emailEnabled: true,
          smsEnabled: true,
          emailSubject: type.defaultEmailSubject,
          emailTemplate: type.defaultEmailTemplate,
          smsTemplate: type.defaultSmsTemplate
        };
      }
    });

    res.json({
      success: true,
      data: settingsObj
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notification settings'
    });
  }
};

/**
 * PUT /api/settings/notifications
 * Update notification settings
 */
exports.updateNotificationSettings = async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required'
      });
    }

    // Validate and prepare settings for storage
    const settingsToSave = [];

    for (const [key, value] of Object.entries(settings)) {
      // Validate key is a known notification type
      if (!NOTIFICATION_TYPES[key]) {
        continue; // Skip unknown types
      }

      // Validate structure
      if (typeof value !== 'object' || value === null) {
        continue;
      }

      // Ensure required fields exist
      const setting = {
        enabled: value.enabled !== false,
        emailEnabled: value.emailEnabled !== false,
        smsEnabled: value.smsEnabled !== false,
        emailSubject: value.emailSubject || NOTIFICATION_TYPES[key].defaultEmailSubject,
        emailTemplate: value.emailTemplate || NOTIFICATION_TYPES[key].defaultEmailTemplate,
        smsTemplate: value.smsTemplate || NOTIFICATION_TYPES[key].defaultSmsTemplate
      };

      settingsToSave.push({
        key: `notification_${key}`,
        value: JSON.stringify(setting)
      });
    }

    // Save to MySQL using INSERT ... ON DUPLICATE KEY UPDATE
    for (const setting of settingsToSave) {
      try {
        await masterPool.query(
          `INSERT INTO settings (\`key\`, value, updated_at) 
           VALUES (?, ?, ?) 
           ON DUPLICATE KEY UPDATE value = ?, updated_at = ?`,
          [setting.key, setting.value, new Date(), setting.value, new Date()]
        );
      } catch (error) {
        console.error(`Error saving setting ${setting.key}:`, error);
        // Continue with other settings even if one fails
      }
    }

    auditSettingChange(req, 'notification_settings', { keys: settingsToSave.map((s) => s.key) });

    res.json({
      success: true,
      message: 'Notification settings saved successfully'
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating notification settings'
    });
  }
};

/**
 * Get notification setting for a specific type
 * Used internally by other controllers
 */
exports.getNotificationSetting = async (typeKey) => {
  try {
    const [settings] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ? LIMIT 1',
      [`notification_${typeKey}`]
    );

    if (settings && settings.length > 0 && settings[0].value) {
      try {
        return JSON.parse(settings[0].value);
      } catch (e) {
        // Return default if parsing fails
        const type = NOTIFICATION_TYPES[typeKey];
        if (type) {
          return {
            enabled: true,
            emailEnabled: true,
            smsEnabled: true,
            emailSubject: type.defaultEmailSubject,
            emailTemplate: type.defaultEmailTemplate,
            smsTemplate: type.defaultSmsTemplate
          };
        }
      }
    }

    // Return default if not found
    const type = NOTIFICATION_TYPES[typeKey];
    if (type) {
      return {
        enabled: true,
        emailEnabled: true,
        smsEnabled: true,
        emailSubject: type.defaultEmailSubject,
        emailTemplate: type.defaultEmailTemplate,
        smsTemplate: type.defaultSmsTemplate
      };
    }

    return null;
  } catch (error) {
    console.error(`Error getting notification setting for ${typeKey}:`, error);
    // Return default on error
    const type = NOTIFICATION_TYPES[typeKey];
    if (type) {
      return {
        enabled: true,
        emailEnabled: true,
        smsEnabled: true,
        emailSubject: type.defaultEmailSubject,
        emailTemplate: type.defaultEmailTemplate,
        smsTemplate: type.defaultSmsTemplate
      };
    }
    return null;
  }
};

/**
 * GET /api/settings/attendance
 * Get attendance configuration settings
 */
exports.getAttendanceSettings = async (req, res) => {
  try {
    const [settings] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ?',
      ['attendance_config']
    );

    let config = {
      excludedCourses: [],
      excludedStudents: [] // Array of admission numbers
    };

    if (settings && settings.length > 0) {
      try {
        const storedConfig = JSON.parse(settings[0].value);
        config = { ...config, ...storedConfig };

        // Ensure arrays
        if (!Array.isArray(config.excludedCourses)) config.excludedCourses = [];
        if (!Array.isArray(config.excludedStudents)) config.excludedStudents = [];

      } catch (e) {
        console.error('Error parsing attendance settings:', e);
      }
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get attendance settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance settings'
    });
  }
};

/**
 * PUT /api/settings/attendance
 * Update attendance configuration settings
 */
exports.updateAttendanceSettings = async (req, res) => {
  try {
    const { excludedCourses, excludedStudents } = req.body;

    // Validate inputs
    if (excludedCourses && !Array.isArray(excludedCourses)) {
      return res.status(400).json({
        success: false,
        message: 'excludedCourses must be an array'
      });
    }

    if (excludedStudents && !Array.isArray(excludedStudents)) {
      return res.status(400).json({
        success: false,
        message: 'excludedStudents must be an array'
      });
    }

    const config = {
      excludedCourses: excludedCourses || [],
      excludedStudents: excludedStudents || []
    };

    const value = JSON.stringify(config);

    await masterPool.query(
      `INSERT INTO settings (\`key\`, value, updated_at) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE value = ?, updated_at = ?`,
      ['attendance_config', value, new Date(), value, new Date()]
    );

    auditSettingChange(req, 'attendance_config', config);

    res.json({
      success: true,
      message: 'Attendance settings saved successfully',
      data: config
    });
  } catch (error) {
    console.error('Update attendance settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating attendance settings'
    });
  }
};

/**
 * GET /api/settings/student-layout
 * Get student portal layout settings
 */
exports.getStudentLayoutSettings = async (req, res) => {
  try {
    const [settings] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ?',
      ['student_portal_layout']
    );

    let layout = {
      dashboard: true,
      announcements: true,
      clubs: true,
      events: true,
      attendance: true,
      internship: true,
      timetable: true,
      'semester-registration': true,
      services: true,
      'my-tickets': true,
      feedback: true,
      transport: false,
      fees: false
    };

    if (settings && settings.length > 0) {
      try {
        const storedLayout = JSON.parse(settings[0].value);
        layout = { ...layout, ...storedLayout };
      } catch (e) {
        console.error('Error parsing student layout settings:', e);
      }
    }

    res.json({
      success: true,
      data: layout
    });
  } catch (error) {
    console.error('Get student layout settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching student layout settings'
    });
  }
};

/**
 * PUT /api/settings/student-layout
 * Update student portal layout settings
 */
exports.updateStudentLayoutSettings = async (req, res) => {
  try {
    const { layout } = req.body;

    if (!layout || typeof layout !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Layout object is required'
      });
    }

    const value = JSON.stringify(layout);

    await masterPool.query(
      `INSERT INTO settings (\`key\`, value, updated_at) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE value = ?, updated_at = ?`,
      ['student_portal_layout', value, new Date(), value, new Date()]
    );

    auditSettingChange(req, 'student_portal_layout', { layoutKeys: Object.keys(layout) });

    res.json({
      success: true,
      message: 'Student layout settings saved successfully',
      data: layout
    });
  } catch (error) {
    console.error('Update student layout settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating student layout settings'
    });
  }
};
/**
 * GET /api/settings/certificates
 * Get certificate configuration settings
 */
exports.getCertificateSettings = async (req, res) => {
  try {
    const [settings] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ?',
      ['certificate_config']
    );

    let config = {
      diploma: [
        { id: '10th_tc', name: '10th TC (Transfer Certificate)', required: true },
        { id: '10th_study', name: '10th Study Certificate', required: true },
        { id: '10th_cert', name: '10th Certificate', required: true }
      ],
      ug: [
        { id: 'inter_diploma_study', name: '10th/Inter/ Diploma Study Certificate', required: true },
        { id: 'inter_diploma_tc', name: 'Inter/Diploma TC (Transfer Certificate)', required: true },
        { id: 'inter_diploma_cert', name: 'Inter/Diploma certificate', required: true },
        { id: '10th_original', name: '10 Original Certificate', required: true }
      ],
      pg: [
        { id: 'ug_study', name: 'UG Study Certificate', required: false },
        { id: 'ug_tc', name: 'UG TC (Transfer Certificate)', required: true },
        { id: 'ug_cert', name: 'UG (Certificate)', required: true },
        { id: 'ug_cmm', name: 'UG CMM (Consolidated Marks Memo)', required: true },
        { id: '10th_original', name: '10 original Certificate', required: true },
        { id: 'inter_diploma_original', name: 'Inter/Diploma Original Certificate', required: true }
      ]
    };

    if (settings && settings.length > 0) {
      try {
        const storedConfig = JSON.parse(settings[0].value);
        if (storedConfig && typeof storedConfig === 'object') {
          config = storedConfig;
        }
      } catch (e) {
        console.error('Error parsing certificate settings:', e);
      }
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get certificate settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching certificate settings'
    });
  }
};

/**
 * PUT /api/settings/certificates
 * Update certificate configuration settings
 */
exports.updateCertificateSettings = async (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Config object is required'
      });
    }

    const value = JSON.stringify(config);

    await masterPool.query(
      `INSERT INTO settings (\`key\`, value, updated_at) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE value = ?, updated_at = ?`,
      ['certificate_config', value, new Date(), value, new Date()]
    );

    auditSettingChange(req, 'certificate_config', { configKeys: Object.keys(config) });

    res.json({
      success: true,
      message: 'Certificate settings saved successfully',
      data: config
    });
  } catch (error) {
    console.error('Update certificate settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating certificate settings'
    });
  }
};

/**
 * GET /api/settings/frozen-batches
 * Get frozen batches configuration
 */
exports.getFrozenBatches = async (req, res) => {
  try {
    const [settings] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ?',
      ['frozen_batches']
    );

    let frozenBatches = {};

    if (settings && settings.length > 0) {
      try {
        const storedConfig = JSON.parse(settings[0].value);
        if (Array.isArray(storedConfig)) {
          // Legacy format: ["2024", "2025"] -> { "2024": ["ALL"], "2025": ["ALL"] }
          storedConfig.forEach(batch => {
            frozenBatches[batch] = ["ALL"];
          });
        } else if (typeof storedConfig === 'object' && storedConfig !== null) {
          // New format: { "2024": ["student_name", "student_mobile"] }
          frozenBatches = storedConfig;
        }
      } catch (e) {
        console.error('Error parsing frozen batches settings:', e);
      }
    }

    res.json({
      success: true,
      data: frozenBatches
    });
  } catch (error) {
    console.error('Get frozen batches settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching frozen batches settings'
    });
  }
};

/**
 * PUT /api/settings/frozen-batches
 * Update frozen batches configuration
 */
exports.updateFrozenBatches = async (req, res) => {
  try {
    const { batches } = req.body;

    if (!batches || typeof batches !== 'object' || Array.isArray(batches)) {
      return res.status(400).json({
        success: false,
        message: 'Batches must be an object mapping batch names to array of frozen fields'
      });
    }

    const value = JSON.stringify(batches);

    await masterPool.query(
      `INSERT INTO settings (\`key\`, value, updated_at) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE value = ?, updated_at = ?`,
      ['frozen_batches', value, new Date(), value, new Date()]
    );

    auditSettingChange(req, 'frozen_batches', { batchKeys: Object.keys(batches) });

    res.json({
      success: true,
      message: 'Frozen batches settings saved successfully',
      data: batches
    });
  } catch (error) {
    console.error('Update frozen batches settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating frozen batches settings'
    });
  }
};

/**
 * GET /api/settings/profile-update-fields
 * Get enabled fields for student profile update requests during verification
 */
exports.getProfileUpdateFields = async (req, res) => {
  try {
    const [settings] = await masterPool.query(
      'SELECT value FROM settings WHERE `key` = ?',
      ['profile_update_config']
    );

    let config = {
      enabledFields: []
    };

    if (settings && settings.length > 0) {
      try {
        const storedConfig = JSON.parse(settings[0].value);
        config = { ...config, ...storedConfig };
      } catch (e) {
        console.error('Error parsing profile update settings:', e);
      }
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get profile update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile update settings'
    });
  }
};

/**
 * PUT /api/settings/profile-update-fields
 * Update enabled fields for student profile update requests during verification
 */
exports.updateProfileUpdateFields = async (req, res) => {
  try {
    const { enabledFields } = req.body;

    if (!enabledFields || !Array.isArray(enabledFields)) {
      return res.status(400).json({
        success: false,
        message: 'enabledFields must be an array'
      });
    }

    const config = { enabledFields };
    const value = JSON.stringify(config);

    await masterPool.query(
      `INSERT INTO settings (\`key\`, value, updated_at) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE value = ?, updated_at = ?`,
      ['profile_update_config', value, new Date(), value, new Date()]
    );

    auditSettingChange(req, 'profile_update_config', config);

    res.json({
      success: true,
      message: 'Profile update settings saved successfully',
      data: config
    });
  } catch (error) {
    console.error('Update profile update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile update settings'
    });
  }
};

