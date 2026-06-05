/**
 * Run: INITIAL_ADMIN_PASSWORD=your_password node create-admin.js
 * Or set ADMIN_USERNAME, ADMIN_FULL_NAME, and ADMIN_ROLE in env vars
 */

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

dotenv.config();

// Configuration from environment variables (no hardcoded secrets)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "asella_admin";
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD;
const ADMIN_FULL_NAME = process.env.ADMIN_FULL_NAME || "System Admin";
const ADMIN_ROLE = process.env.ADMIN_ROLE || "admin";

// Configuration Validation
const VALID_ROLES = ['admin', 'manager', 'employee', 'affiliate', 'delivery', 'vendor'];

const validateInput = () => {
    if (!ADMIN_PASSWORD) {
        console.error("ERROR: INITIAL_ADMIN_PASSWORD environment variable is required");
        console.error("Usage: INITIAL_ADMIN_PASSWORD=your_password node create-admin.js");
        return false;
    }

    if (!VALID_ROLES.includes(ADMIN_ROLE)) {
        console.error(`ERROR: Invalid role "${ADMIN_ROLE}"`);
        console.error(`Must be one of: ${VALID_ROLES.join(', ')}`);
        return false;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(ADMIN_PASSWORD)) {
        console.error("ERROR: Password must be at least 8 characters long and include uppercase, lowercase, and a number.");
        return false;
    }

    if (!process.env.DATABASE_URL) {
        console.error("ERROR: DATABASE_URL is not defined in the environment variables.");
        return false;
    }

    return true;
};

async function main() {
    if (!validateInput()) {
        process.exit(1);
    }

    // Safety check for production environments
    if (process.env.NODE_ENV === 'production') {
        console.warn("WARNING: Running administrative script in PRODUCTION mode.");
    }

    // Create a MySQL connection pool from the standard DATABASE_URL connection string
    const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0,
        connectTimeout: 5000 
    });

    console.log("Connecting to database...");

    try {
        const saltRounds = 12;
        const hash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);
        const usernameTrimmed = ADMIN_USERNAME.trim();

        // Check if user already exists (Replaces ON CONFLICT DO NOTHING)
        const checkQuery = `SELECT id FROM staff_users WHERE email = ?`;
        const [existingUsers] = await pool.query(checkQuery, [usernameTrimmed]);

        if (existingUsers.length > 0) {
            console.log(`NOTICE: User '${usernameTrimmed}' already exists. No changes were made.`);
        } else {
            // Generate a random UUID string for MySQL compatibility
            const userId = randomUUID();

            // MySQL parameterized query using '?'
            const insertQuery = `
                INSERT INTO staff_users (id, email, password_hash, name, role)
                VALUES (?, ?, ?, ?, ?)
            `;

            const values = [
                userId,
                usernameTrimmed, 
                hash, 
                ADMIN_FULL_NAME.trim(), 
                ADMIN_ROLE
            ];

            await pool.query(insertQuery, values);

            console.log("SUCCESS: Admin user created successfully.");
            console.log(`Username : ${usernameTrimmed}`);
            console.log(`Role     : ${ADMIN_ROLE}`);
            console.log(`ID       : ${userId}`);
            console.log("\nLogin available at the application login endpoint.");
        }
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            console.error("DATABASE ERROR: Duplicate entry restriction hit.");
            console.error("The username/email provided is already registered in the system.");
        } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
            console.error("DATABASE ERROR: Could not connect to the database. Is the MySQL server active and running?");
        } else {
            console.error("FATAL ERROR:", err.message);
        }
        process.exitCode = 1;
    } finally {
        await pool.end();
        console.log("Database connection closed.");
    }
}

main();