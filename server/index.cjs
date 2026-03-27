const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, "../dist")));

app.get("*", (req, res, next) => {
  if (!req.url.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  } else {
    next();
  }
});

const pool = new Pool({
  user: "sim_admin",
  host: "localhost",
  database: "movieanimation_db",
  password: "SimData_Vector_2026!",
  port: 5432,
});

const JWT_SECRET = "supersecret_movie_animation_key_2026";

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES (\$1, \$2, \$3) RETURNING id, name, email",
      [name, email, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });
    
    res.json({ user, token });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Email already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = \$1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(8084, "0.0.0.0", () => {
  console.log("Auth API and Frontend running on port 8082");
});
