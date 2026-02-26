const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// create transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});
// ================= SIGNUP =================
exports.signup = async (req, res) => {
  const name = req.body.name?.trim();
  const email = req.body.email?.trim();
  const password = req.body.password;

  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    const userExists = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (userExists.rows.length > 0)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    await pool.query(
      `INSERT INTO users (name,email,password,verification_token) VALUES($1,$2,$3,$4)`,
      [name,email,hashedPassword,verificationToken]
    );

    const verifyURL = `http://localhost:5000/api/auth/verify/${verificationToken}`;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your account",
      html: `<a href="${verifyURL}">Verify Email</a>`,
    });

    console.log("Email sent:", info.response);
    res.json({ message: "Signup successful. Please verify your email." });

  } catch (err) {
    console.error(err);

    // optional rollback if user created
    await pool.query("DELETE FROM users WHERE email=$1", [email]).catch(() => {});

    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ================= VERIFY EMAIL =================
exports.verifyEmail = async (req, res) => {
  const { token } = req.params;

  try {
    const user = await pool.query(
      "SELECT * FROM users WHERE verification_token = $1",
      [token]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid token" });
    }

    await pool.query(
      "UPDATE users SET is_verified = true, verification_token = NULL WHERE id = $1",
      [user.rows[0].id]
    );

    res.json({ message: "Email verified successfully" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ================= LOGIN =================
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

    if (!user.rows[0].is_verified) {
      return res.status(400).json({ message: "Please verify your email first" });
    }

    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};