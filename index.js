require("dotenv").config(); 

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
    const result = await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT ,()=>{
    console.log(`server running on port ${PORT}`);
});