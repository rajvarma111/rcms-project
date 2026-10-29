
require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise");
const session = require("express-session");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 5000;
const PUBLIC_DIR = path.join(__dirname, "Public");

const mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

if (
    !process.env.ADMIN_PASSWORD ||
    !process.env.SESSION_SECRET ||
    !process.env.DB_PASSWORD ||
    !process.env.EMAIL_USER ||
    !process.env.EMAIL_APP_PASSWORD ||
    !process.env.ADMIN_EMAIL
) {
    console.error("Missing required settings in .env");
    process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: "20kb" }));

app.use(session({
    name: "rcmsAdminSession",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 30 * 60 * 1000
    }
}));
const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "rcms_db",
    waitForConnections: true,
    connectionLimit: 10,
    ssl: process.env.DB_HOST ? {
    rejectUnauthorized: false
} : undefined
});

// Temporary OTP storage: cleared when the server restarts.
const otpStore = new Map();

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin === true) {
        return next();
    }

    if (req.path === "/admin.html") {
        return res.redirect("/admin-login.html");
    }

    return res.status(401).json({
        message: "Admin login required."
    });
}

app.get("/admin.html", requireAdmin, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.use(express.static(PUBLIC_DIR));

// ADMIN LOGIN
app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;

    if (
        typeof password !== "string" ||
        password !== process.env.ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            message: "Incorrect admin password."
        });
    }

    req.session.regenerate((error) => {
        if (error) {
            return res.status(500).json({
                message: "Could not start admin session."
            });
        }

        req.session.isAdmin = true;

        req.session.save((saveError) => {
            if (saveError) {
                return res.status(500).json({
                    message: "Could not save admin session."
                });
            }

            return res.json({
                message: "Admin login successful."
            });
        });
    });
});

app.get("/api/admin/check", requireAdmin, (req, res) => {
    res.json({ authenticated: true });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: "Could not log out."
            });
        }

        res.clearCookie("rcmsAdminSession");
        return res.json({ message: "Logged out successfully." });
    });
});

// SEND CUSTOMER OTP
app.post("/api/send-otp", async (req, res) => {
    try {
        const email =
            typeof req.body.email === "string"
                ? req.body.email.trim().toLowerCase()
                : "";

        if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return res.status(400).json({
                message: "Please enter a valid email address."
            });
        }

        const now = Date.now();
        const previous = otpStore.get(email);

        // Allow one OTP request per email every 60 seconds.
        if (previous && now - previous.sentAt < 60 * 1000) {
            return res.status(429).json({
                message: "Please wait 60 seconds before requesting another OTP."
            });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();

        const otpHash = crypto
            .createHash("sha256")
            .update(email + ":" + otp)
            .digest("hex");

        otpStore.set(email, {
            hash: otpHash,
            expiresAt: now + 5 * 60 * 1000,
            sentAt: now,
            attempts: 0
        });

        try {
            await mailer.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Your RCMS email verification OTP",
                text:
                    `Your Restaurant Complaint Management System OTP is ${otp}.\n\n` +
                    "It expires in 5 minutes. Do not share this code with anyone."
            });
        } catch (mailError) {
            otpStore.delete(email);
            console.error("OTP email error:", mailError.message);

            return res.status(500).json({
                message: "Could not send OTP. Please check the email settings."
            });
        }

        return res.json({
            message: "OTP sent successfully. Please check your email."
        });
    } catch (error) {
        console.error("Send OTP error:", error.message);

        return res.status(500).json({
            message: "Could not send OTP."
        });
    }
});

// VERIFY CUSTOMER OTP
app.post("/api/verify-otp", (req, res) => {
    const email =
        typeof req.body.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";

    const otp =
        typeof req.body.otp === "string"
            ? req.body.otp.trim()
            : "";

    const record = otpStore.get(email);

    if (!/^\d{6}$/.test(otp) || !record) {
        return res.status(400).json({
            message: "Invalid OTP or OTP expired. Please request a new one."
        });
    }

    if (Date.now() > record.expiresAt) {
        otpStore.delete(email);

        return res.status(400).json({
            message: "OTP expired. Please request a new one."
        });
    }

    if (record.attempts >= 5) {
        otpStore.delete(email);

        return res.status(429).json({
            message: "Too many attempts. Please request a new OTP."
        });
    }

    record.attempts++;

    const submittedHash = crypto
        .createHash("sha256")
        .update(email + ":" + otp)
        .digest("hex");

    const matches = crypto.timingSafeEqual(
        Buffer.from(record.hash, "hex"),
        Buffer.from(submittedHash, "hex")
    );

    if (!matches) {
        if (record.attempts >= 5) {
            otpStore.delete(email);
        }

        return res.status(400).json({
            message: "Incorrect OTP. Please try again."
        });
    }

    otpStore.delete(email);

    req.session.verifiedEmail = email;
    req.session.verifiedEmailExpiresAt = Date.now() + 10 * 60 * 1000;

    return req.session.save((error) => {
        if (error) {
            delete req.session.verifiedEmail;
            delete req.session.verifiedEmailExpiresAt;

            return res.status(500).json({
                message: "Could not complete verification. Please try again."
            });
        }

        return res.json({
            message: "Email verified successfully. You can submit your complaint."
        });
    });
});

// SUBMIT COMPLAINT — EMAIL VERIFICATION REQUIRED
app.post("/api/complaints", async (req, res) => {
    
/* PUBLIC HOMEPAGE STATISTICS — COUNTS ONLY */
app.get("/api/statistics", async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(status = 'Pending'), 0) AS pending,
                COALESCE(SUM(status = 'In Progress'), 0) AS inProgress,
                COALESCE(SUM(status = 'Resolved'), 0) AS resolved
            FROM complaints
        `);

        return res.json({
            total: Number(rows[0].total),
            pending: Number(rows[0].pending),
            inProgress: Number(rows[0].inProgress),
            resolved: Number(rows[0].resolved)
        });
    } catch (error) {
        console.error("Fetch statistics error:", error.message);

        return res.status(500).json({
            message: "Could not fetch statistics."
        });
    }
});

    try {
        const { name, email, category, description } = req.body;

        if (
            typeof name !== "string" || !name.trim() ||
            typeof email !== "string" || !email.trim() ||
            typeof category !== "string" || !category.trim() ||
            typeof description !== "string" || !description.trim()
        ) {
            return res.status(400).json({
                message: "Please fill in all fields correctly."
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        if (
            req.session.verifiedEmail !== cleanEmail ||
            !req.session.verifiedEmailExpiresAt ||
            Date.now() > req.session.verifiedEmailExpiresAt
        ) {
            return res.status(403).json({
                message: "Please verify your email with OTP before submitting."
            });
        }

        // Consume verification so it cannot be reused.
        delete req.session.verifiedEmail;
        delete req.session.verifiedEmailExpiresAt;

        const [result] = await db.execute(
            `INSERT INTO complaints
            (name, email, category, description)
            VALUES (?, ?, ?, ?)`,
            [
                name.trim(),
                cleanEmail,
                category.trim(),
                description.trim()
            ]
        );

        // Notify admin after the complaint has been saved.
        try {
            await mailer.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.ADMIN_EMAIL,
                subject: `New RCMS Complaint #${result.insertId}`,
                text:
                    `A new complaint has been submitted.\n\n` +
                    `Complaint ID: ${result.insertId}\n` +
                    `Name: ${name.trim()}\n` +
                    `Email: ${cleanEmail}\n` +
                    `Category: ${category.trim()}\n` +
                    `Description: ${description.trim()}\n` +
                    `Status: Pending`
            });
        } catch (mailError) {
            // The complaint is already saved; do not report submission failure.
            console.error("Admin notification email error:", mailError.message);
        }

        return res.status(201).json({
            message: "Complaint submitted successfully!",
            complaintId: result.insertId
        });
    } catch (error) {
        console.error("Submit complaint error:", error.message);

        return res.status(500).json({
            message: "Could not save complaint to the database."
        });
    }
});

/* PUBLIC HOMEPAGE STATISTICS */
app.get("/api/statistics", async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(status = 'Pending'), 0) AS pending,
                COALESCE(SUM(status = 'In Progress'), 0) AS inProgress,
                COALESCE(SUM(status = 'Resolved'), 0) AS resolved
            FROM complaints
        `);

        res.json({
            total: Number(rows[0].total),
            pending: Number(rows[0].pending),
            inProgress: Number(rows[0].inProgress),
            resolved: Number(rows[0].resolved)
        });
    } catch (error) {
        console.error("Statistics error:", error.message);

        res.status(500).json({
            message: "Could not fetch statistics."
        });
    }
});

// VIEW ALL COMPLAINTS
app.get("/api/complaints", async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT * FROM complaints ORDER BY id DESC"
        );

        return res.json(rows);
    } catch (error) {
        console.error("Fetch complaints error:", error.message);

        return res.status(500).json({
            message: "Could not fetch complaints."
        });
    }
});

// TRACK COMPLAINT
app.get("/api/complaints/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({
                message: "Invalid complaint ID."
            });
        }

        const [rows] = await db.execute(
            "SELECT * FROM complaints WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Complaint not found."
            });
        }

        return res.json(rows[0]);
    } catch (error) {
        console.error("Track complaint error:", error.message);

        return res.status(500).json({
            message: "Could not track complaint."
        });
    }
});

// UPDATE COMPLAINT STATUS — ADMIN ONLY
app.patch(
    "/api/complaints/:id/status",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { status } = req.body;

            const allowedStatuses = [
                "Pending",
                "In Progress",
                "Resolved"
            ];

            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({
                    message: "Invalid complaint ID."
                });
            }

            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    message: "Invalid complaint status."
                });
            }

            const [result] = await db.execute(
                "UPDATE complaints SET status = ? WHERE id = ?",
                [status, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Complaint not found."
                });
            }

            return res.json({
                message: "Complaint status updated successfully!"
            });
        } catch (error) {
            console.error("Update status error:", error.message);

            return res.status(500).json({
                message: "Could not update complaint status."
            });
        }
    }
);

// UNKNOWN API ROUTES
app.use("/api", (req, res) => {
    return res.status(404).json({
        message: "API endpoint not found."
    });
});

// START SERVER
async function startServer() {
    try {
        const connection = await db.getConnection();
        console.log("MySQL connected successfully!");
        connection.release();

        app.listen(PORT, () => {
            console.log(`RCMS server running at http://localhost:${PORT}`);
        });
    } catch (error) {
       console.error("MySQL connection failed:", error);
        process.exit(1);
    }
}

startServer();