const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendOTPEmail = require("../utils/sendEmail");

// signup 


exports.signup = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    //0. Strong password validation (ONLY for local signup)
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
      });
    }

    // 1. check existing user
    const existing = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 2. hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
           console.log({
  name,
  email,
  hashedPassword,
  otp,
  otpExpires
});
    // 4. insert user WITH OTP
   const result = await pool.query(
  `INSERT INTO users 
  (name, email, password, otp_code, otp_expires, is_verified, provider)
  VALUES ($1, $2, $3, $4, $5, false, 'local')
  RETURNING *`,
  [name, email, hashedPassword, otp, otpExpires]
);


console.log("DB INSERT RESULT:", result.rows[0]);
    // 5. send email (CRITICAL)
    try {
  await sendOTPEmail(email, otp);
  console.log("EMAIL SENT SUCCESS");
} catch (err) {
  console.log("EMAIL FAILED:", err.response?.body || err.message);
}

    console.log("SIGNUP HIT");
console.log("OTP GENERATED:", otp);

    res.json({
      message: "OTP sent to email",
    });

  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

//login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const dbUser = user.rows[0];

    // DEBUG (VERY IMPORTANT)
    console.log("DB USER:", dbUser);

    if (!dbUser.password || typeof dbUser.password !== "string") {
      return res.status(500).json({
        message: "Password format error in DB"
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      dbUser.password
    );

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!dbUser.is_verified) {
      return res.status(403).json({
  message: "Please verify your email first",
  email: dbUser.email
});
    }

    const token = jwt.sign(
      { id: dbUser.id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};


// Google login success handler
exports.googleLoginSuccess = async (req, res) => {
  try {
    const user = req.user;

    // create token FIRST
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ALWAYS redirect directly (no OTP for Google users)
 return res.redirect(
  `${process.env.FRONTEND_URL}/auth-success?token=${token}`
);
    

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "OAuth error" });
  }
};
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const dbUser = user.rows[0];

    if (dbUser.is_verified) {
      return res.status(400).json({ message: "Already verified" });
    }

   if (String(dbUser.otp_code) !== String(otp)) {
  return res.status(400).json({ message: "Invalid OTP" });
}

    if (new Date() > dbUser.otp_expires) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // mark verified
    await pool.query(
      "UPDATE users SET is_verified = true, otp_code = null WHERE email = $1",
      [email]
    );
    console.log("ENTERED OTP:", otp);
console.log("DB OTP:", dbUser.otp_code);
    const token = jwt.sign(
      { id: dbUser.id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Email verified successfully",
      token,
    });

  } catch (err) {
    console.error("OTP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};