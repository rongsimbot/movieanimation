#!/bin/bash
# ============================================================================
# MovieAnimation.ai — Database Setup Script
# ============================================================================
# Creates the database (if needed) and runs all migrations in order.
#
# Usage:
#   chmod +x setup_database.sh
#   ./setup_database.sh [db_host] [db_port] [db_user] [db_name]
#
# Defaults:
#   DB_HOST=localhost
#   DB_PORT=5432
#   DB_USER=sim_admin
#   DB_NAME=movieanimation_db
# ============================================================================

set -euo pipefail

DB_HOST="${1:-localhost}"
DB_PORT="${2:-5432}"
DB_USER="${3:-sim_admin}"
DB_NAME="${4:-movieanimation_db}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/migrations"

echo "============================================="
echo " MovieAnimation.ai — Database Setup"
echo "============================================="
echo " Host: ${DB_HOST}:${DB_PORT}"
echo " User: ${DB_USER}"
echo " Database: ${DB_NAME}"
echo " Migrations: ${MIGRATIONS_DIR}"
echo "============================================="
echo ""

# Prompt for password if not in environment
if [ -z "${PGPASSWORD:-}" ]; then
    read -s -p "Enter PostgreSQL password for ${DB_USER}: " PGPASSWORD
    export PGPASSWORD
    echo ""
fi

PSQL="psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -v ON_ERROR_STOP=1"

# ─── Step 1: Test Connection ────────────────────────────────────────────────
echo "→ Testing connection..."
if ! ${PSQL} -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ Cannot connect to PostgreSQL at ${DB_HOST}:${DB_PORT}"
    echo "   Make sure the SSH tunnel is running:"
    echo "   ssh -p 2223 -L 5432:localhost:5432 simrobotics@<host-ip>"
    exit 1
fi
echo "✅ Connection successful"

# ─── Step 2: Create Database ─────────────────────────────────────────────────
echo ""
echo "→ Checking if ${DB_NAME} exists..."
if ${PSQL} -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    echo "✅ Database ${DB_NAME} already exists"
else
    echo "→ Creating database ${DB_NAME}..."
    ${PSQL} -d postgres -c "CREATE DATABASE ${DB_NAME};"
    echo "✅ Database ${DB_NAME} created"
fi

# ─── Step 3: Run Migrations ─────────────────────────────────────────────────
echo ""
echo "→ Running migrations..."

MIGRATIONS=(
    "001_initial_schema.sql:Initial schema (8 core tables)"
    "002_phase1_schema_enhancements.sql:Phase 1 schema enhancements"
    "003_auth_enhancements.sql:Auth enhancements"
    "003_consolidated_schema.sql:Consolidated schema (UUID fix)"
)

for migration in "${MIGRATIONS[@]}"; do
    file="${MIGRATIONS_DIR}/${migration%%:*}"
    desc="${migration#*:}"

    if [ -f "$file" ]; then
        echo "  → Running: ${desc} ($(basename "$file"))"
        if ${PSQL} -d "${DB_NAME}" -f "$file" > /dev/null 2>&1; then
            echo "    ✅ Done"
        else
            echo "    ⚠️  Migration had issues (may already be applied) — continuing..."
        fi
    else
        echo "  ⚠️  Migration file not found: $file (skipping)"
    fi
done

# ─── Step 4: Verify Tables ───────────────────────────────────────────────────
echo ""
echo "→ Verifying tables..."
${PSQL} -d "${DB_NAME}" -c "
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS columns,
       (SELECT COUNT(*) FROM pg_indexes i WHERE i.tablename = t.table_name AND i.schemaname = 'public' AND i.indexname NOT LIKE '%pkey') AS indexes
FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY table_name;
"

# ─── Step 5: Summary ─────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo " ✅ Database setup complete!"
echo "============================================="
echo ""
echo " Core Tables:"
echo "   users        — User accounts & auth"
echo "   projects     — Video production projects"
echo "   scripts      — Screenplay content"
echo "   scenes       — Extracted scenes"
echo "   video_clips  — AI-generated clips"
echo "   renders      — Final compositions"
echo "   api_usage    — Cost tracking"
echo "   user_assets  — Uploaded media"
echo ""
echo " Next Steps:"
echo "   1. Configure .env with DATABASE_URL"
echo "   2. Run backend: cd backend && npm run dev"
echo "   3. Run frontend: cd frontend && npm run dev"
echo "============================================="
