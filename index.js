require("dotenv").config(); 
console.log("DATABASE_URL:", process.env.DATABASE_URL);
const express = require("express");
const cors = require("cors");


const pool = require("./db");


const PORT = process.env.PORT || 5000;

const app = express();
app.use(express.json()); 
app.use(cors());

const authRoutes = require("./routes/auth");
app.use("/api/auth",authRoutes); // for login and signup routes

const chatRoutes = require("./routes/chat");
app.use("/api/chat" ,chatRoutes);


app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ ok: true, time: result.rows[0] });
  } catch (err) {
    console.error("DB ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.listen(PORT ,()=>{
    console.log(`server running on port ${PORT}`);
});