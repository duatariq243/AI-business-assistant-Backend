const pool = require("../db");
const supabase = require('../supabase.js'); // adjust path
const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");



exports.signup = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([{ name, email, password: hashedPassword }])
      .select()
      .single();

    if (error) throw error;

    res.json({ id: data.id, name: data.name, email: data.email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


//login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.json({ token });
  } catch (err) {
    console.error("LOGIN ERROR:", err); // ← log the real error
    res.status(500).json({ message: "Server error", error: err.message });
  }
};