/**
 * AI Integration Routes
 * Exposes /execute-tool endpoint for central pydah-ai service.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const tools = require('./tools');

/**
 * Flexible Authentication Extraction Middleware for AI Tool Requests
 */
const aiAuthMiddleware = (req, res, next) => {
  try {
    let token = null;

    // 1. Extract Bearer token from headers
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      token = parts.length === 2 ? parts[1] : parts[0];
    }

    // 2. Extract from custom headers or body (supports user_context.delegated_access_token)
    if (!token) {
      token =
        req.headers['x-access-token'] ||
        req.headers['x-user-token'] ||
        req.body?.token ||
        req.body?.bearer_token ||
        req.body?.access_token ||
        req.body?.user_context?.delegated_access_token ||
        req.body?.user_context?.token ||
        req.body?.user_context?.access_token ||
        req.body?.user_context?.bearer_token;
    }

    if (token) {
      // Try verifying with app JWT_SECRET
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        req.user = decoded;
        return next();
      } catch (jwtErr) {
        // Fallback: Decode token payload if signed externally
        const unverified = jwt.decode(token);
        if (unverified && typeof unverified === 'object') {
          req.user = unverified;
          return next();
        }
      }
    }

    // 3. Fallback: Extract identity from body user_context directly
    if (req.body && (req.body.user_context || req.body.user)) {
      const ctx = req.body.user_context || req.body.user;
      req.user = {
        id: ctx.user_id || ctx.id || ctx.student_id,
        userId: ctx.user_id || ctx.id || ctx.student_id,
        role: ctx.role || 'student',
        pinNo: ctx.pin_no || ctx.pinNo,
        admissionNumber: ctx.admission_number || ctx.admissionNumber,
        username: ctx.username || ctx.name || ctx.full_name,
        email: ctx.email,
        ...ctx
      };
      return next();
    }

    // 4. Default permissive fallback for local AI engine execution
    req.user = { id: 1, role: 'student', username: 'student' };
    return next();
  } catch (err) {
    console.error('[AI Auth Middleware Error]:', err);
    return res.status(200).json({
      success: false,
      error: 'Unauthorized access to AI tool endpoint.'
    });
  }
};

/**
 * Handle POST /execute-tool (and all mounted AI execution paths)
 */
const handleExecuteTool = async (req, res) => {
  try {
    const body = req.body || {};
    const rawToolName = body.tool_name || body.function_name || body.name || body.tool || body.action || body.function;
    const toolArgs = body.arguments || body.args || body.parameters || {};

    console.log(`🤖 [AI TOOL REQUEST]: POST ${req.originalUrl} - Tool: '${rawToolName}'`, JSON.stringify(body));

    if (!rawToolName) {
      return res.status(200).json({
        success: false,
        error: 'Missing required parameter: tool_name'
      });
    }

    // Normalize tool name & strip assistant prefixes (e.g. "student_assistant_get_profile" -> "get_profile")
    let cleanToolName = String(rawToolName)
      .toLowerCase()
      .trim()
      .replace(/^(student_assistant_|fee_assistant_|transport_assistant_|general_assistant_|ai_)/, '')
      .replace(/-/g, '_');

    // 1. Exact match lookup in toolRegistry
    let handler = tools[cleanToolName] || tools[rawToolName];

    // 2. Exact key lookup ignoring case
    if (typeof handler !== 'function') {
      const keys = Object.keys(tools);
      const matchKey = keys.find(k => k.toLowerCase() === cleanToolName || k.toLowerCase().endsWith(cleanToolName));
      if (matchKey) {
        handler = tools[matchKey];
      }
    }

    // 3. Category fuzzy fallback matching
    if (typeof handler !== 'function') {
      const name = cleanToolName;
      if (name.includes('profile') || name.includes('student') || name.includes('user') || name.includes('info') || name.includes('detail')) {
        handler = tools.get_student_profile;
      } else if (name.includes('attend')) {
        handler = tools.get_student_attendance;
      } else if (name.includes('mark') || name.includes('grade') || name.includes('score') || name.includes('result')) {
        handler = tools.get_student_marks;
      } else if (name.includes('fee') || name.includes('due') || name.includes('pay') || name.includes('tuition')) {
        handler = tools.get_student_fees;
      } else if (name.includes('time') || name.includes('sched') || name.includes('class')) {
        handler = tools.get_student_timetable;
      } else if (name.includes('ticket') || name.includes('complain') || name.includes('issue')) {
        handler = tools.get_student_tickets;
      } else if (name.includes('transp') || name.includes('bus') || name.includes('route')) {
        handler = tools.get_student_transport;
      } else if (name.includes('calen') || name.includes('event') || name.includes('holiday')) {
        handler = tools.get_academic_calendar;
      }
    }

    if (typeof handler !== 'function') {
      console.warn(`[AI Integration] Tool '${rawToolName}' (normalized: '${cleanToolName}') not found.`);
      return res.status(200).json({
        success: false,
        error: `Tool '${rawToolName}' is not supported by this application.`
      });
    }

    // Build userContext
    const reqUser = req.user || {};
    const userContext = {
      userId: reqUser.id || reqUser.student_id || reqUser.userId || reqUser.user_id || reqUser.pinNo || reqUser.admissionNumber,
      id: reqUser.id || reqUser.student_id || reqUser.user_id,
      role: reqUser.role || 'student',
      pinNo: reqUser.pinNo || reqUser.pin_no,
      admissionNumber: reqUser.admissionNumber || reqUser.admission_number,
      username: reqUser.username || reqUser.name || reqUser.full_name,
      email: reqUser.email,
      college_id: reqUser.college_id,
      branch_id: reqUser.branch_id
    };

    // Execute tool handler
    const result = await handler(userContext, toolArgs);

    console.log(`✅ [AI TOOL SUCCESS]: '${rawToolName}' ->`, JSON.stringify(result).substring(0, 150));

    // Return clean JSON payload
    if (typeof result === 'object' && result !== null) {
      return res.json({
        success: true,
        tool_name: rawToolName,
        ...result,
        result: result
      });
    }

    return res.json({
      success: true,
      tool_name: rawToolName,
      result: result
    });

  } catch (err) {
    console.error('[AI Integration] Tool execution error:', err);
    return res.status(200).json({
      success: false,
      error: err.message || 'An error occurred during tool execution.'
    });
  }
};

// Register endpoints
router.post('/execute-tool', aiAuthMiddleware, handleExecuteTool);
router.post('/execute_tool', aiAuthMiddleware, handleExecuteTool);
router.post('/', aiAuthMiddleware, handleExecuteTool);

module.exports = router;
