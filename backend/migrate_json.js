require('dotenv').config();
const { masterPool } = require('./config/database');

// Helper to normalize JSON keys to valid SQL column names
const normalizeColumnName = (key) => {
    return String(key)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_') // Replace non-alphanumeric with underscore
        .replace(/_+/g, '_') // Collapse multiple underscores
        .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
};

const migrate = async () => {
    try {
        console.log("Starting JSON to Columns Migration...");

        // 1. Get existing columns from students table
        const [columnsData] = await masterPool.query("SHOW COLUMNS FROM students");
        const existingColumns = new Map();
        for (const col of columnsData) {
            let maxLen = 65535; // default max
            const match = col.Type.match(/varchar\((\d+)\)/i);
            if (match) maxLen = parseInt(match[1]);
            else if (col.Type.toLowerCase() === 'text') maxLen = 65535;

            existingColumns.set(col.Field.toLowerCase(), maxLen);
        }

        // 2. Fetch all student_data JSONs
        console.log("Fetching student_data from DB...");
        const [rows] = await masterPool.query("SELECT id, admission_number, student_data FROM students WHERE student_data IS NOT NULL AND student_data != ''");

        console.log(`Found ${rows.length} records with JSON data.`);

        const customKeys = new Set();
        const parsedRows = [];

        // 3. Parse JSON and collect all unique keys
        for (const row of rows) {
            let data = {};
            if (typeof row.student_data === 'string') {
                try {
                    data = JSON.parse(row.student_data);
                } catch (e) {
                    continue; // Skip invalid JSON
                }
            } else {
                data = row.student_data;
            }

            parsedRows.push({ id: row.id, admission_number: row.admission_number, data });

            for (const key of Object.keys(data)) {
                // Ignore standard structural keys or flags
                if (!key || key === 'profile_verified' || key === 'profile_verified_at') continue;
                customKeys.add(key);
            }
        }

        console.log(`Found ${customKeys.size} unique keys in JSON data.`);

        // 4. Map JSON keys to new column names
        const newColumnsToCreate = new Map(); // jsonKey -> sqlColumnName

        for (const key of customKeys) {
            const normalized = normalizeColumnName(key);

            // If the column doesn't exist yet, we mark it for creation
            if (!existingColumns.has(normalized)) {
                newColumnsToCreate.set(key, normalized);
            }
        }

        // 5. Create new columns
        const uniqueNewSQLColumns = new Set(Array.from(newColumnsToCreate.values()));

        if (uniqueNewSQLColumns.size > 0) {
            console.log(`Creating ${uniqueNewSQLColumns.size} new columns in students table...`);
            for (const colName of uniqueNewSQLColumns) {
                // If it wasn't already created in a previous crashed run
                if (!existingColumns.has(colName)) {
                    try {
                        const alterQuery = `ALTER TABLE students ADD COLUMN ${colName} VARCHAR(255) NULL`;
                        console.log(`Executing: ${alterQuery}`);
                        await masterPool.query(alterQuery);
                        existingColumns.set(colName, 255); // Update our local map
                    } catch (e) {
                        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
                        existingColumns.set(colName, 255);
                    }
                }
            }
            console.log("Columns created successfully.");
        } else {
            console.log("No new columns needed. All json keys already map to existing columns.");
        }

        // 6. Migrate data from JSON to columns
        console.log("Migrating data to columns...");
        let migratedCount = 0;

        for (const row of parsedRows) {
            const updates = [];
            const values = [];

            for (const [key, value] of Object.entries(row.data)) {
                if (key === 'profile_verified' || key === 'profile_verified_at') continue;

                // If it wasn't mapped identically but normalizes cleanly, use the normalized name
                // Also check if the raw key exactly maps to an existing column (e.g. adhar_no)
                let targetCol = existingColumns.has(key.toLowerCase()) ? key.toLowerCase() : normalizeColumnName(key);

                // We only update if the column exists and value is valid
                if (existingColumns.has(targetCol) && value !== null && value !== undefined && value !== '') {
                    // Prevent duplicate sets in the same query 
                    if (!updates.includes(`${targetCol} = ?`)) {
                        updates.push(`${targetCol} = ?`);

                        // Format dates if they look like ISO strings, otherwise use string
                        let formattedValue = String(value);
                        if (formattedValue.length > 10 && formattedValue.includes('T')) {
                            const dateCheck = new Date(formattedValue);
                            if (!isNaN(dateCheck.getTime())) {
                                formattedValue = formattedValue.split('T')[0];
                            }
                        }

                        // Truncate based on max length
                        const maxLen = existingColumns.get(targetCol);
                        if (formattedValue.length > maxLen) {
                            formattedValue = formattedValue.substring(0, maxLen);
                        }

                        values.push(formattedValue);
                    }
                }
            }

            if (updates.length > 0) {
                values.push(row.id);
                const updateQuery = `UPDATE students SET ${updates.join(', ')} WHERE id = ?`;
                await masterPool.query(updateQuery, values);
                migratedCount++;
            }
        }

        console.log(`Successfully migrated data for ${migratedCount} students into dedicated columns.`);
        console.log("Migration Script Completed. You can safely keep the old student_data column as a backup for now.");

    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        process.exit(0);
    }
};

migrate();
