const { Pool } = require("pg");

let pool;

if (process.env.DATABASE_URL) {
  // Production (Render)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Required for Render Postgres
    },
  });
} else {
  // Local development
  pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "ai_assistant",
    password: "Duaali@123",
    port: 5432,
    ssl: false, // MUST be false locally
  });
}

pool.on("connect", () => {
  console.log(` Connected to PostgreSQL (${process.env.DATABASE_URL ? "Production" : "Local"})`);
});

pool.on("error", (err) => {
  console.error(" PostgreSQL connection error:", err);
});

module.exports = pool;
