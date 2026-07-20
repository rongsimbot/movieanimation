const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs").promises;

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, "../dist")));

// Configure multer for file uploads
const upload = multer({ 
  dest: "/tmp/",
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

const pool = new Pool({
  user: "sim_admin",
  host: "localhost",
  database: "movieanimation_db",
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

// Upload Story endpoint
app.post("/api/animation/:id/upload-story", upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    let scriptText = "";
    let filename = null;

    // Check if file was uploaded first (has priority)
    if (req.file) {
      filename = req.file.originalname;
      const fileBuffer = await fs.readFile(req.file.path);
      
      // Parse based on file type
      if (req.file.mimetype === "application/pdf") {
        const pdfData = await PDFParse(fileBuffer);
        scriptText = pdfData.text;
      } else if (req.file.mimetype.includes("word") || req.file.originalname.endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        scriptText = result.value;
      } else if (req.file.mimetype === "text/plain") {
        scriptText = fileBuffer.toString("utf8");
      } else {
        // Try as plain text
        scriptText = fileBuffer.toString("utf8");
      }
      
      // Clean up temp file
      await fs.unlink(req.file.path);
    }
    // Check if text was provided directly
    else if (req.body.script_text && req.body.script_text.trim()) {
      scriptText = req.body.script_text;
    } else {
      return res.status(400).json({ success: false, error: "No script text or file provided" });
    }

    // Check if scripts table has the needed columns
    await pool.query(`
      ALTER TABLE scripts ADD COLUMN IF NOT EXISTS animation_id INTEGER;
      ALTER TABLE scripts ADD COLUMN IF NOT EXISTS original_text TEXT;
      ALTER TABLE scripts ADD COLUMN IF NOT EXISTS source_filename VARCHAR(255);
      ALTER TABLE scripts ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP DEFAULT NOW();
    `);

    // Update or insert script and link to animation
    const existingScript = await pool.query(
      "SELECT id FROM scripts WHERE animation_id = $1",
      [id]
    );

    let scriptId;
    if (existingScript.rows.length > 0) {
      const updateResult = await pool.query(
        "UPDATE scripts SET original_text = $1, script_content = $1, source_filename = $2, uploaded_at = NOW() WHERE animation_id = $3 RETURNING id",
        [scriptText, filename, id]
      );
      scriptId = updateResult.rows[0].id;
    } else {
      const insertResult = await pool.query(
        "INSERT INTO scripts (animation_id, original_text, script_content, source_filename, uploaded_at, script_title) VALUES ($1, $2, $2, $3, NOW(), $4) RETURNING id",
        [id, scriptText, filename, filename || 'Untitled Script']
      );
      scriptId = insertResult.rows[0].id;
    }

    // Update animation to link to this script
    await pool.query(
      "UPDATE animations SET script_id = $1, last_modified = NOW() WHERE id = $2",
      [scriptId, id]
    );

    res.json({ 
      success: true, 
      message: "Script uploaded successfully",
      characterCount: scriptText.length,
      scriptId: scriptId
    });
  } catch (err) {
    console.error("Error uploading script:", err);
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

// Catch-all for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

app.listen(8084, "0.0.0.0", () => {
  console.log("MovieAnimation API running on port 8084");
  console.log("Frontend served via Vite on port 8082");
});

// ============================================
// PHASE 6: VIDEO GENERATION ENDPOINTS
// ============================================

// Generate video for a scene
app.post("/api/generate/scene", async (req, res) => {
  try {
    const { scene_id, api_choice } = req.body;
    if (!scene_id) return res.status(400).json({ success: false, error: "scene_id is required" });

    // Get scene with project info
    const sceneResult = await pool.query(
      `SELECT s.*, p.id as project_id, p.title, p.genre
       FROM scenes s
       JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1`,
      [scene_id]
    );

    if (sceneResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Scene not found" });
    }

    const scene = sceneResult.rows[0];

    // Fetch character assets for this project
    const charResult = await pool.query(
      `SELECT name, description, file_url, metadata 
       FROM user_assets 
       WHERE project_id = $1 AND asset_type = 'character'
       LIMIT 20`,
      [scene.project_id]
    );

    const characters = charResult.rows.map(c => ({
      name: c.name,
      description: c.description || c.name,
      image_url: c.file_url,
      visual_description: c.metadata?.visual_description || c.description,
    }));

    // Analyze scene and determine best API
    const fullText = `${scene.description || ""} ${scene.action || ""}`.toLowerCase();
    let sceneType = "dialogue";
    if (fullText.match(/establishing|wide.*shot|exterior|landscape/)) sceneType = "establishing";
    else if (fullText.match(/action|fight|chase|explos|running|battle/)) sceneType = "action";
    else if (fullText.match(/close[- ]?up|face|expression|emotion|intimate/)) sceneType = "closeup";

    // Smart routing
    let apiToUse = api_choice || "sora";
    if (!api_choice) {
      if (sceneType === "action") apiToUse = "runway";
      else if (sceneType === "establishing") apiToUse = "luma";
      else if (sceneType === "closeup" && characters.length > 0) apiToUse = "sora";
    }

    // Build enhanced prompt
    const charDesc = characters
      .map(c => c.visual_description || c.description || c.name)
      .join(". ");

    let enhancedPrompt = "";
    switch (sceneType) {
      case "establishing":
        enhancedPrompt = `Wide establishing shot of ${scene.description || scene.setting || "a cinematic location"}. ${scene.action || ""}. 4K, cinematic composition, natural lighting, sweeping camera movement`;
        break;
      case "action":
        enhancedPrompt = `Dynamic action sequence. ${scene.action || scene.description}. ${charDesc ? "Featuring " + charDesc + ". " : ""}Fast camera movement, motion blur, dramatic angles, Hollywood style`;
        break;
      case "closeup":
        enhancedPrompt = `Cinematic close-up shot. ${charDesc || scene.description}. ${scene.action || ""}. ${scene.mood || "Dramatic"} lighting, 85mm lens, shallow depth of field, professional color grading`;
        break;
      default:
        enhancedPrompt = `Cinematic medium shot. ${charDesc || scene.description}. ${scene.action || ""}. ${scene.setting ? "in " + scene.setting + ". " : ""}4K quality, cinematic composition, ${scene.mood || "natural"} lighting`;
    }

    // Estimate cost
    const duration = scene.duration_sec || 5;
    const costRates = { sora: 0.20, runway: 0.12, luma: 0.08, seedance: 0.05 };
    const estimatedCost = Math.round(duration * (costRates[apiToUse] || 0.10) * 10000) / 10000;

    // Create generation job
    const jobResult = await pool.query(
      `INSERT INTO generation_jobs
       (project_id, scene_id, user_id, job_type, api_name, priority,
        raw_prompt, enhanced_prompt, prompt_style, character_refs, params,
        status, estimated_cost)
       VALUES ($1, $2, $3, 'text_to_video', $4, 0,
               $5, $6, $7, $8, $9,
               'queued', $10)
       RETURNING id`,
      [
        scene.project_id, scene_id, 
        (await pool.query("SELECT user_id FROM projects WHERE id = $1", [scene.project_id])).rows[0]?.user_id || '00000000-0000-0000-0000-000000000000',
        apiToUse,
        scene.description || scene.action,
        enhancedPrompt.slice(0, 500),
        scene.mood || "cinematic",
        JSON.stringify(characters),
        JSON.stringify({ duration, quality: "high", aspect_ratio: "16:9" }),
        estimatedCost
      ]
    );

    const jobId = jobResult.rows[0].id;

    // Update scene
    await pool.query(
      `UPDATE scenes SET
         enhanced_prompt = $1,
         prompt_style = $2,
         preferred_api = $3,
         estimated_cost = $4,
         generation_status = 'generating',
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [enhancedPrompt.slice(0, 500), scene.mood || "cinematic", apiToUse, estimatedCost, scene_id]
    );

    // If Sora key is available, start actual generation
    let apiRequestId = null;
    if (apiToUse === 'sora' && process.env.OPENAI_API_KEY) {
      try {
        const { execSync } = require('child_process');
        const scriptPath = require('path').join(
          process.env.HOME || '/home/lo',
          '.openclaw/workspace/skills/sora-video-manager/scripts/generate_text_to_video.sh'
        );
        const quoteSafe = enhancedPrompt.replace(/"/g, '\\"').slice(0, 400);
        const cmd = `bash "${scriptPath}" "${quoteSafe}" ${duration} high 16:9`;
        const output = execSync(cmd, { timeout: 30000, encoding: 'utf8' });
        const idMatch = output.match(/Video ID:\s*(\S+)/);
        if (idMatch) apiRequestId = idMatch[1];
      } catch (e) {
        console.warn("[Generate] Sora script failed, will use placeholder:", e.message);
      }
    }

    // Update job with API request ID
    if (apiRequestId) {
      await pool.query(
        `UPDATE generation_jobs SET
           api_request_id = $1,
           status = 'processing',
           started_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [apiRequestId, jobId]
      );
    } else {
      // Mark as completed for now (placeholder - will be polled externally)
      await pool.query(
        `UPDATE generation_jobs SET
           status = 'processing',
           started_at = CURRENT_TIMESTAMP,
           status_message = 'Generation queued'
         WHERE id = $2`,
        [apiRequestId, jobId]
      );
    }

    // Log API usage
    await pool.query(
      `INSERT INTO api_usage
       (user_id, project_id, api_name, provider, credits_used, cost_usd, tokens_or_seconds, success, metadata)
       VALUES ($1, $2, $3, 'video_generation', 1, $4, $5, true, $6)`,
      [
        (await pool.query("SELECT user_id FROM projects WHERE id = $1", [scene.project_id])).rows[0]?.user_id,
        scene.project_id,
        apiToUse,
        estimatedCost,
        duration,
        JSON.stringify({ job_id: jobId, scene_id, enhanced: true }),
      ]
    );

    return res.json({
      success: true,
      data: {
        job_id: jobId,
        api_request_id: apiRequestId,
        status: apiRequestId ? 'processing' : 'queued',
        enhanced_prompt: enhancedPrompt.slice(0, 200),
        api_used: apiToUse,
        estimated_cost: estimatedCost,
        duration_sec: duration,
      },
      message: 'Video generation started',
    });
  } catch (err) {
    console.error("[Generate] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get generation job status
app.get("/api/generation/:jobId/status", async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await pool.query(
      `SELECT gj.*, s.description as scene_description
       FROM generation_jobs gj
       LEFT JOIN scenes s ON gj.scene_id = s.id
       WHERE gj.id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    const job = result.rows[0];
    return res.json({
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        progress_pct: job.progress_pct || 0,
        video_url: job.video_url,
        thumbnail_url: job.thumbnail_url,
        cost: parseFloat(job.actual_cost || job.estimated_cost || 0),
        api_used: job.api_name,
        duration_sec: parseFloat(job.duration_sec || 0) || 5,
        error: job.last_error,
        created_at: job.created_at,
        completed_at: job.completed_at,
      },
    });
  } catch (err) {
    console.error("[Status] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel generation job
app.post("/api/generation/:jobId/cancel", async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await pool.query(
      `UPDATE generation_jobs SET
         status = 'cancelled',
         completed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('queued', 'processing')
       RETURNING id`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: "Job cannot be cancelled" });
    }

    return res.json({ success: true, message: "Job cancelled" });
  } catch (err) {
    console.error("[Cancel] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Batch generate scenes
app.post("/api/generate/batch", async (req, res) => {
  try {
    const { scene_ids, project_id } = req.body;

    if (!scene_ids || !Array.isArray(scene_ids) || scene_ids.length === 0) {
      return res.status(400).json({ success: false, error: "scene_ids array is required" });
    }

    // Create jobs for each scene
    const results = [];
    for (const sceneId of scene_ids) {
      try {
        const sceneResult = await pool.query(
          `SELECT s.*, p.title, p.genre
           FROM scenes s JOIN projects p ON s.project_id = p.id
           WHERE s.id = $1`,
          [sceneId]
        );
        if (sceneResult.rows.length === 0) {
          results.push({ scene_id: sceneId, status: 'error', error: 'Scene not found' });
          continue;
        }

        const scene = sceneResult.rows[0];
        const fullText = `${scene.description || ""} ${scene.action || ""}`.toLowerCase();
        let apiToUse = 'luma';
        if (fullText.match(/action|fight|chase/)) apiToUse = 'runway';
        else if (fullText.match(/close[- ]?up|face|emotion/)) apiToUse = 'sora';

        const duration = scene.duration_sec || 5;
        const costRates = { sora: 0.20, runway: 0.12, luma: 0.08, seedance: 0.05 };
        const estimatedCost = Math.round(duration * (costRates[apiToUse] || 0.10) * 10000) / 10000;

        const jobResult = await pool.query(
          `INSERT INTO generation_jobs
           (project_id, scene_id, user_id, job_type, api_name, priority,
            raw_prompt, enhanced_prompt, params, status, estimated_cost)
           VALUES ($1, $2, $3, 'text_to_video', $4, 0, $5, $6, $7, 'queued', $8)
           RETURNING id`,
          [
            project_id, sceneId,
            (await pool.query("SELECT user_id FROM projects WHERE id = $1", [project_id])).rows[0]?.user_id,
            apiToUse,
            scene.description || scene.action,
            `Cinematic ${fullText.slice(0, 400)}`,
            JSON.stringify({ duration, quality: 'high' }),
            estimatedCost,
          ]
        );

        await pool.query(
          `UPDATE scenes SET generation_status = 'generating' WHERE id = $1`,
          [sceneId]
        );

        results.push({ scene_id: sceneId, job_id: jobResult.rows[0].id, status: 'queued', api: apiToUse });
      } catch (err) {
        results.push({ scene_id: sceneId, status: 'error', error: err.message });
      }
    }

    return res.json({
      success: true,
      data: {
        total: scene_ids.length,
        queued: results.filter(r => r.status === 'queued').length,
        failed: results.filter(r => r.status === 'error').length,
        results,
      },
    });
  } catch (err) {
    console.error("[Batch] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get project generation jobs
app.get("/api/projects/:projectId/jobs", async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(
      `SELECT gj.*, s.description as scene_description, s.scene_number
       FROM generation_jobs gj
       LEFT JOIN scenes s ON gj.scene_id = s.id
       WHERE gj.project_id = $1
       ORDER BY gj.created_at DESC`,
      [projectId]
    );

    const jobs = result.rows.map(job => ({
      id: job.id,
      scene_id: job.scene_id,
      scene_description: job.scene_description,
      scene_number: job.scene_number,
      status: job.status,
      progress_pct: job.progress_pct || 0,
      api_used: job.api_name,
      video_url: job.video_url,
      thumbnail_url: job.thumbnail_url,
      cost: parseFloat(job.actual_cost || job.estimated_cost || 0),
      duration_sec: parseFloat(job.duration_sec || 0),
      error: job.last_error,
      created_at: job.created_at,
      completed_at: job.completed_at,
    }));

    return res.json({ success: true, data: { jobs, total: jobs.length } });
  } catch (err) {
    console.error("[Jobs] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Cost summary endpoint
app.get("/api/costs/summary", async (req, res) => {
  try {
    const { project_id } = req.query;

    let query = `
      SELECT
        api_name,
        COUNT(*) as job_count,
        COALESCE(SUM(actual_cost), SUM(estimated_cost), 0) as total_cost,
        COALESCE(SUM(duration_sec), 0) as total_duration_sec
      FROM generation_jobs
      WHERE status = 'completed'
    `;
    const params = [];

    if (project_id) {
      params.push(project_id);
      query += ` AND project_id = $${params.length}`;
    }

    query += ` GROUP BY api_name ORDER BY total_cost DESC`;

    const result = await pool.query(query, params);

    let totalCost = 0;
    let totalJobs = 0;
    let totalDuration = 0;
    const breakdown = {};

    result.rows.forEach(row => {
      const cost = parseFloat(row.total_cost || 0);
      breakdown[row.api_name] = {
        cost: Math.round(cost * 100) / 100,
        jobs: parseInt(row.job_count),
        duration_sec: parseFloat(row.total_duration_sec),
      };
      totalCost += cost;
      totalJobs += parseInt(row.job_count);
      totalDuration += parseFloat(row.total_duration_sec);
    });

    return res.json({
      success: true,
      data: {
        total_cost: Math.round(totalCost * 100) / 100,
        total_jobs: totalJobs,
        total_duration_sec: totalDuration,
        currency: 'USD',
        breakdown,
      },
    });
  } catch (err) {
    console.error("[Costs] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook endpoint for external API callbacks
app.post("/api/generation/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const eventType = payload.event_type || payload.type || 'unknown';
    const jobId = payload.job_id || payload.id;

    console.log(`[Webhook] ${eventType} for job ${jobId}`);

    // Log webhook
    if (jobId) {
      await pool.query(
        `INSERT INTO webhook_logs (job_id, event_type, payload, source_ip)
         VALUES ($1, $2, $3, $4)`,
        [jobId, eventType, JSON.stringify(payload), req.ip]
      );

      if (eventType === 'generation.completed') {
        await pool.query(
          `UPDATE generation_jobs SET
             status = 'completed',
             video_url = $1,
             thumbnail_url = $2,
             progress_pct = 100,
             completed_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [payload.video_url || payload.output_url, payload.thumbnail_url, jobId]
        );

        // Update scene
        const job = await pool.query("SELECT scene_id FROM generation_jobs WHERE id = $1", [jobId]);
        if (job.rows.length > 0 && job.rows[0].scene_id) {
          await pool.query(
            `UPDATE scenes SET video_url = $1, generation_status = 'completed' WHERE id = $2`,
            [payload.video_url, job.rows[0].scene_id]
          );
        }
      } else if (eventType === 'generation.failed') {
        await pool.query(
          `UPDATE generation_jobs SET
             status = 'failed',
             last_error = $1,
             completed_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [payload.error || 'Generation failed', jobId]
        );
      } else if (eventType === 'generation.progress') {
        await pool.query(
          `UPDATE generation_jobs SET
             progress_pct = $1,
             status_message = $2
           WHERE id = $3`,
          [payload.progress || 0, payload.message || `Processing: ${payload.progress || 0}%`, jobId]
        );
      }
    }

    return res.json({ success: true, received: true });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return res.json({ success: false, error: err.message, received: true });
  }
});

// Prompt analysis endpoint (preview without generating)
app.post("/api/generate/analyze", async (req, res) => {
  try {
    const { scene_description, scene_action, characters, setting, mood, style, genre } = req.body;

    const fullText = `${scene_description || ""} ${scene_action || ""}`.toLowerCase();
    let sceneType = "dialogue";
    if (fullText.match(/establishing|wide.*shot|exterior/)) sceneType = "establishing";
    else if (fullText.match(/action|fight|chase/)) sceneType = "action";
    else if (fullText.match(/close[- ]?up|face|emotion/)) sceneType = "closeup";

    let suggestedApi = "sora";
    if (sceneType === "action") suggestedApi = "runway";
    else if (sceneType === "establishing") suggestedApi = "luma";
    else if (sceneType === "closeup" && characters && characters.length > 0) suggestedApi = "sora";
    else if (sceneType === "dialogue") suggestedApi = "luma";

    const charDesc = (characters || [])
      .map(c => c.description || c.name || "")
      .filter(Boolean)
      .join(". ");

    let enhancedPrompt = "";
    switch (sceneType) {
      case "establishing":
        enhancedPrompt = `Wide establishing shot of ${setting || scene_description || "a cinematic location"}. 4K, cinematic composition, natural lighting, sweeping camera movement. ${mood || "Neutral"} atmosphere.`;
        break;
      case "action":
        enhancedPrompt = `Dynamic action sequence. ${scene_action || scene_description}. ${charDesc ? "Featuring " + charDesc + ". " : ""}Fast camera movement, motion blur, dramatic angles.`;
        break;
      case "closeup":
        enhancedPrompt = `Cinematic close-up shot. ${charDesc || scene_description}. ${scene_action || ""}. ${mood || "Dramatic"} lighting, 85mm lens, shallow depth of field.`;
        break;
      default:
        enhancedPrompt = `Cinematic medium shot. ${charDesc || scene_description}. ${setting ? "in " + setting + ". " : ""}${mood || "Natural"} lighting, professional composition.`;
    }

    const costRates = { sora: 0.20, runway: 0.12, luma: 0.08, seedance: 0.05 };
    const estimatedCost = Math.round(5 * (costRates[suggestedApi] || 0.10) * 10000) / 10000;

    return res.json({
      success: true,
      data: {
        scene_type: sceneType,
        suggested_api: suggestedApi,
        confidence: 0.8,
        enhanced_prompt: enhancedPrompt.slice(0, 500),
        estimated_cost: estimatedCost,
        estimated_duration: 5,
      },
    });
  } catch (err) {
    console.error("[Analyze] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get prompt templates
app.get("/api/prompt-templates", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM prompt_templates WHERE is_active = TRUE ORDER BY name`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("[Templates] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// END PHASE 6 ENDPOINTS
// ============================================

// Save animation details endpoint
app.put("/api/animation/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, duration_seconds } = req.body;

    const result = await pool.query(
      "UPDATE animations SET status = $1, duration_seconds = $2, last_modified = NOW() WHERE id = $3 RETURNING *",
      [status, duration_seconds, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Animation not found" });
    }

    res.json({ 
      success: true, 
      message: "Animation updated successfully",
      animation: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating animation:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
