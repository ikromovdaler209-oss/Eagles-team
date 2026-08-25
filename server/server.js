const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const TOKEN = process.env.BOT_TOKEN;

const CHAT_IDS = (process.env.CHAT_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

    if (!TOKEN) {
    console.error("BOT_TOKEN is missing in .env");
    process.exit(1);
}

if (CHAT_IDS.length === 0) {
    console.error("CHAT_IDS is missing in .env");
    process.exit(1);
}

const invalidChatIds = CHAT_IDS.filter(
    id => !/^-?\d+$/.test(id)
);

if (invalidChatIds.length > 0) {
    console.error("Invalid CHAT_IDS in .env");
    process.exit(1);
}
// DUPLICATE REQUEST PROTECTION

const recentRequests = new Map();

const DUPLICATE_WINDOW = 10 * 60 * 1000; // 10 minutes

    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

    setInterval(() => {
    const now = Date.now();

    for (const [fingerprint, timestamp] of recentRequests) {
        if (now - timestamp > DUPLICATE_WINDOW) {
            recentRequests.delete(fingerprint);
        }
    }
}, 60 * 1000);

// SECURITY

app.disable("x-powered-by");

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],

                baseUri: ["'self'"],

                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "data:"
                ],

                styleSrc: [
                    "'self'",
                    "https://fonts.googleapis.com"
                ],

                scriptSrc: [
                    "'self'"
                ],

                scriptSrcAttr: [
                    "'none'"
                ],

                imgSrc: [
                    "'self'",
                    "data:"
                ],

                connectSrc: [
                    "'self'"
                ],

                formAction: [
                    "'self'"
                ],

                frameAncestors: [
                    "'self'"
                ],

                objectSrc: [
                    "'none'"
                ],

                upgradeInsecureRequests: []
            }
        }
    })
);

app.use(express.json({
    limit: "10kb"
}));

// RATE LIMIT

const sendMessageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,

    message: {
        ok: false,
        error: "Too many requests. Please try again later."
    },

    standardHeaders: true,
    legacyHeaders: false
});


// STATIC FILES

app.use(
    express.static(
        path.join(__dirname, "..", "public")
    )
);

// MAIN PAGE

function checkOrigin(req, res, next) {
    const origin = req.get("Origin");

    // Allow requests without an Origin header
    // (for example, some server-side or local requests)
    if (!origin) {
        return next();
    }

    if (!ALLOWED_ORIGINS.includes(origin)) {
        return res.status(403).json({
            ok: false,
            error: "Forbidden"
        });
    }

    next();
}

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "..",
            "public",
            "Eagles-homepage.html"
        )
    );
});

// TELEGRAM

function requireJson(req, res, next) {
    if (
        req.method === "POST" &&
        req.path === "/send-message" &&
        !req.is("application/json")
    ) {
        return res.status(415).json({
            ok: false,
            error: "Content-Type must be application/json"
        });
    }

    next();
}

app.use(requireJson);
app.post(
    "/send-message",
    checkOrigin,
    sendMessageLimiter,
    async (req, res) => {

        const {
            name,
            lastname,
            age,
            subject,
            number,
            website
        } = req.body;

if (website) {
    return res.status(400).json({
        ok: false,
        error: "Invalid request"
    });
}


        // SERVER-SIDE VALIDATION

        if (
            typeof name !== "string" ||
            typeof lastname !== "string" ||
            typeof age !== "string" ||
            typeof subject !== "string" ||
            typeof number !== "string"
        ) {
            return res.status(400).json({
                ok: false,
                error: "Invalid data"
            });
        }


        const cleanName = name.trim();
        const cleanLastname = lastname.trim();
        const cleanAge = age.trim();
        const cleanSubject = subject.trim();
        const cleanNumber = number.trim();


        if (
            !cleanName ||
            !cleanLastname ||
            !cleanAge ||
            !cleanSubject ||
            !cleanNumber
        ) {
            return res.status(400).json({
                ok: false,
                error: "All fields are required"
            });
        }


        // LENGTH LIMITS

        if (
            cleanName.length > 50 ||
            cleanLastname.length > 50 ||
            cleanAge.length > 3 ||
            cleanSubject.length > 30 ||
            cleanNumber.length > 20
        ) {
            return res.status(400).json({
                ok: false,
                error: "Invalid input length"
            });
        }

        // PHONE VALIDATION

        const phoneRegex = /^\+9989\d{8}$/;

        if (!phoneRegex.test(cleanNumber)) {
            return res.status(400).json({
                ok: false,
                error: "Invalid phone number"
            });
        }

        // AGE VALIDATION

        const ageNumber = Number(cleanAge);

        if (
            !Number.isInteger(ageNumber) ||
            ageNumber < 1 ||
            ageNumber > 120
        ) {
            return res.status(400).json({
                ok: false,
                error: "Invalid age"
            });
        }

        // COURSE VALIDATION

        const allowedCourses = [
            "IELTS",
            "CEFR",
            "pre IELTS",
            "Grammar"
        ];

        const validCourse = allowedCourses.some(
            course =>
                course.toLowerCase() ===
                cleanSubject.toLowerCase()
        );

        if (!validCourse) {
            return res.status(400).json({
                ok: false,
                error: "Invalid course"
            });
        }
        // DUPLICATE REQUEST CHECK

    const requestFingerprint = crypto
        .createHash("sha256")
        .update(
            `${cleanName.toLowerCase()}|${cleanLastname.toLowerCase()}|${cleanNumber}|${cleanSubject.toLowerCase()}`
        )
        .digest("hex");

    const previousRequest = recentRequests.get(requestFingerprint);

    if (
        previousRequest &&
        Date.now() - previousRequest < DUPLICATE_WINDOW
    ) {
        return res.status(429).json({
            ok: false,
            error: "This request was already submitted recently"
        });
    }

        // TELEGRAM MESSAGE

        const message = `📥 Request

👤 Name: ${cleanName}
👤 LastName: ${cleanLastname}
👤 Age: ${ageNumber}
📱 Phone number: ${cleanNumber}
📧 Course: ${cleanSubject}

🕒 Time: ${new Date().toLocaleString("en-US", {
    timeZone: "Asia/Tashkent"
})}
`;

        // SEND TO TELEGRAM

try {

    let allSent = true;

    for (const chatId of CHAT_IDS) {

        const response = await fetch(
            `https://api.telegram.org/bot${TOKEN}/sendMessage`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    chat_id: chatId,
                    text: message
                }),

                signal: AbortSignal.timeout(10000)
            }
        );

        const data = await response.json();

        console.log(
            `Telegram response for ${chatId}:`,
            data.ok
        );

        if (!data.ok) {
            allSent = false;
        }
    }

    if (allSent) {

    recentRequests.set(requestFingerprint, Date.now());

        return res.json({
            ok: true
        });

    }

    return res.status(500).json({
        ok: false,
        error: "Failed to send message"
    });

} catch (error) {

    console.error(
        "Telegram request failed:",
        error.message
    );

    return res.status(500).json({
        ok: false,
        error: "Server error"
    });
}
    }
);


// GLOBAL ERROR HANDLER

app.use((err, req, res, next) => {

    console.error("Server error:", err.message);

    if (res.headersSent) {
        return next(err);
    }

    if (err.type === "entity.too.large") {
        return res.status(413).json({
            ok: false,
            error: "Request is too large"
        });
    }

    res.status(500).json({
        ok: false,
        error: "Internal server error"
    });
});


// START SERVER

app.listen(PORT, () => {

    console.log(
        `Server started on port ${PORT}`
    );

});