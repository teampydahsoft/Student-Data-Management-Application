const { masterPool } = require('../config/database');
const { getHRMSConnection } = require('../config/mongoConfig');
const { getModel: getHRMSEmployeeModel } = require('../models/HRMSEmployee');
const mongoose = require('mongoose');

function isStaffTicket(ticket) {
    if (ticket.requester_type === 'staff') return true;
    if (ticket.requester_type === 'student') return false;
    return !ticket.student_id && !!(ticket.raised_by_hrms_id || ticket.raised_by_rbac_id);
}

function hasResolvedRequesterName(ticket) {
    return !!(
        ticket.requester_name ||
        ticket.student_name ||
        ticket.staff_requester_name ||
        ticket.requester_display_name ||
        ticket.hrms_linked_name
    );
}

function normalizeRequesterFields(ticket) {
    const requesterName =
        ticket.requester_name ||
        ticket.student_name ||
        ticket.staff_requester_name ||
        ticket.hrms_linked_name ||
        ticket.requester_display_name ||
        null;

    return {
        ...ticket,
        requester_name: requesterName,
        staff_requester_name:
            ticket.staff_requester_name ||
            ticket.hrms_linked_name ||
            ticket.requester_display_name ||
            null
    };
}

async function ensureHrmsReady(connection, timeoutMs = 8000) {
    if (!connection) return false;
    if (connection.readyState === 1) return true;

    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);

        const finish = (ready) => {
            clearTimeout(timer);
            connection.off('connected', onConnected);
            connection.off('error', onError);
            resolve(ready);
        };

        const onConnected = () => finish(true);
        const onError = () => finish(false);

        connection.once('connected', onConnected);
        connection.once('error', onError);

        if (connection.readyState === 1) {
            finish(true);
        }
    });
}

async function lookupRbacNames({ hrmsIds = [], usernames = [] }) {
    const nameByHrmsId = {};
    const nameByUsername = {};

    if (hrmsIds.length > 0) {
        try {
            const [rows] = await masterPool.query(
                'SELECT hrms_id, username, name FROM rbac_users WHERE hrms_id IN (?) AND name IS NOT NULL',
                [hrmsIds]
            );
            rows.forEach((row) => {
                if (row.hrms_id) nameByHrmsId[row.hrms_id] = row.name;
                if (row.username) nameByUsername[row.username] = row.name;
            });
        } catch (error) {
            console.warn('RBAC HRMS name lookup failed:', error.message);
        }
    }

    const unresolvedUsernames = usernames.filter((u) => u && !nameByUsername[u]);
    if (unresolvedUsernames.length > 0) {
        try {
            const [rows] = await masterPool.query(
                'SELECT username, name FROM rbac_users WHERE username IN (?) AND name IS NOT NULL',
                [unresolvedUsernames]
            );
            rows.forEach((row) => {
                nameByUsername[row.username] = row.name;
            });
        } catch (error) {
            console.warn('RBAC username lookup failed:', error.message);
        }
    }

    return { nameByHrmsId, nameByUsername };
}

async function lookupHrmsEmployeeNames({ hrmsIds = [], empNos = [] }) {
    const nameByHrmsId = {};
    const nameByEmpNo = {};

    const hrmsConn = getHRMSConnection();
    const ready = await ensureHrmsReady(hrmsConn);
    if (!ready) return { nameByHrmsId, nameByEmpNo };

    try {
        const HRMSEmployee = getHRMSEmployeeModel(hrmsConn);
        const objectIds = hrmsIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));

        if (objectIds.length > 0) {
            const employees = await HRMSEmployee.find({ _id: { $in: objectIds } })
                .select('employee_name emp_no')
                .lean()
                .exec();

            employees.forEach((emp) => {
                const id = emp._id.toString();
                const label = emp.employee_name || emp.emp_no || null;
                nameByHrmsId[id] = label;
                if (emp.emp_no) nameByEmpNo[String(emp.emp_no)] = label;
            });
        }

        const unresolvedEmpNos = empNos.filter((empNo) => empNo && !nameByEmpNo[String(empNo)]);
        if (unresolvedEmpNos.length > 0) {
            const employees = await HRMSEmployee.find({ emp_no: { $in: unresolvedEmpNos.map(String) } })
                .select('employee_name emp_no')
                .lean()
                .exec();

            employees.forEach((emp) => {
                const label = emp.employee_name || emp.emp_no || null;
                if (emp.emp_no) nameByEmpNo[String(emp.emp_no)] = label;
                nameByHrmsId[emp._id.toString()] = label;
            });
        }
    } catch (error) {
        console.warn('HRMS name lookup failed:', error.message);
    }

    return { nameByHrmsId, nameByEmpNo };
}

function resolveNameForTicket(ticket, maps) {
    const { nameByHrmsId, nameByEmpNo, nameByUsername } = maps;

    if (ticket.student_name) return ticket.student_name;

    return (
        ticket.staff_requester_name ||
        ticket.hrms_linked_name ||
        ticket.requester_display_name ||
        (ticket.raised_by_hrms_id && nameByHrmsId[ticket.raised_by_hrms_id]) ||
        (ticket.admission_number && nameByEmpNo[String(ticket.admission_number)]) ||
        (ticket.admission_number && nameByUsername[String(ticket.admission_number)]) ||
        (ticket.raised_by_rbac_id && nameByUsername[String(ticket.admission_number)]) ||
        null
    );
}

async function persistRequesterDisplayName(ticketId, name) {
    if (!ticketId || !name) return;
    try {
        await masterPool.query(
            `UPDATE tickets
             SET requester_display_name = ?
             WHERE id = ?
               AND (requester_display_name IS NULL OR requester_display_name = '')`,
            [name, ticketId]
        );
    } catch (error) {
        if (error.code !== 'ER_BAD_FIELD_ERROR') {
            console.warn(`Failed to persist requester name for ticket ${ticketId}:`, error.message);
        }
    }
}

/**
 * Resolve HRMS / RBAC employee names for staff tickets missing a display name.
 */
async function enrichTicketsRequesterNames(tickets, { persist = true } = {}) {
    if (!Array.isArray(tickets) || tickets.length === 0) {
        return tickets;
    }

    const pending = tickets.filter((ticket) => isStaffTicket(ticket) && !hasResolvedRequesterName(ticket));
    if (pending.length === 0) {
        return tickets.map(normalizeRequesterFields);
    }

    const hrmsIds = [...new Set(pending.map((t) => t.raised_by_hrms_id).filter(Boolean))];
    const empNos = [
        ...new Set(
            pending
                .map((t) => t.admission_number)
                .filter((value) => value && !String(value).startsWith('HRMS-') && !String(value).startsWith('STAFF-'))
        )
    ];
    const usernames = [...new Set(empNos)];

    const rbacMaps = await lookupRbacNames({ hrmsIds, usernames });
    const hrmsMaps = await lookupHrmsEmployeeNames({ hrmsIds, empNos });

    const maps = {
        nameByHrmsId: { ...rbacMaps.nameByHrmsId, ...hrmsMaps.nameByHrmsId },
        nameByEmpNo: hrmsMaps.nameByEmpNo,
        nameByUsername: rbacMaps.nameByUsername
    };

    const persistJobs = [];

    const enriched = tickets.map((ticket) => {
        if (!isStaffTicket(ticket) || hasResolvedRequesterName(ticket)) {
            return normalizeRequesterFields(ticket);
        }

        const resolvedName = resolveNameForTicket(ticket, maps);
        if (!resolvedName) {
            return normalizeRequesterFields(ticket);
        }

        if (persist) {
            persistJobs.push(persistRequesterDisplayName(ticket.id, resolvedName));
        }

        return normalizeRequesterFields({
            ...ticket,
            requester_display_name: resolvedName,
            staff_requester_name: resolvedName,
            requester_name: resolvedName
        });
    });

    if (persistJobs.length > 0) {
        await Promise.all(persistJobs);
    }

    return enriched;
}

/**
 * One-time / startup backfill for existing staff tickets.
 */
async function backfillStaffRequesterNames() {
    try {
        const [tickets] = await masterPool.query(`
            SELECT id, admission_number, requester_type, student_id,
                   raised_by_rbac_id, raised_by_hrms_id, requester_display_name
            FROM tickets
            WHERE requester_type = 'staff'
               OR (student_id IS NULL AND (raised_by_hrms_id IS NOT NULL OR raised_by_rbac_id IS NOT NULL))
        `);

        const needsBackfill = tickets.filter((ticket) => !ticket.requester_display_name);
        if (needsBackfill.length === 0) {
            console.log('✓ Staff requester names already backfilled');
            return { updated: 0 };
        }

        await enrichTicketsRequesterNames(needsBackfill, { persist: true });
        console.log(`✓ Backfilled requester names for up to ${needsBackfill.length} staff ticket(s)`);
        return { updated: needsBackfill.length };
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            console.log('ℹ Skipping requester name backfill (column not ready yet)');
            return { updated: 0 };
        }
        console.warn('Staff requester name backfill failed:', error.message);
        return { updated: 0, error: error.message };
    }
}

module.exports = {
    enrichTicketsRequesterNames,
    normalizeRequesterFields,
    backfillStaffRequesterNames,
    isStaffTicket
};
