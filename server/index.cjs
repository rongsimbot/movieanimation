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
  database: "movieanimation",
  password: "SimData_Vector_2026!",
  port: 5432,
});

const JWT_SECRET = "supersecret_movie_animation_key_2026";

// ============================================
// ANIMATIONS API ENDPOINTS
// ============================================

app.get("/api/animations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id,
        a.animation_name,
        s.script_title,
        a.status,
        a.duration_seconds,
        a.last_modified,
        a.file_path,
        (SELECT COUNT(*) FROM chapters WHERE animation_id = a.id) as chapter_count,
        (SELECT COUNT(*) FROM animation_characters WHERE animation_id = a.id) as character_count
      FROM animations a
      LEFT JOIN scripts s ON a.script_id = s.id
      ORDER BY a.last_modified DESC
    `);
    
    res.json({ success: true, animations: result.rows });
  } catch (err) {
    console.error("Error fetching animations:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/animations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        a.*,
        s.script_title,
        s.script_content,
        s.version as script_version
      FROM animations a
      LEFT JOIN scripts s ON a.script_id = s.id
      WHERE a.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Animation not found" });
    }
    
    res.json({ success: true, animation: result.rows[0] });
  } catch (err) {
    console.error("Error fetching animation:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// AUTH API ENDPOINTS
// ============================================

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
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
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
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
  console.log("MovieAnimation API running on port 8084");
  console.log("Frontend served via Vite on port 8082");
});
