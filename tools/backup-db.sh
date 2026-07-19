#!/bin/bash
# ═════════════════════════════════════════════════════════
# MovieAnimation.ai — Database Backup Script
# ═════════════════════════════════════════════════════════
# Usage: bash tools/backup-db.sh
# Cron:  0 2 * * * /home/lo/.openclaw/workspace/projects/movieanimation/tools/backup-db.sh
#
# Creates timestamped SQL dumps with rotation (keeps 30 days).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/home/lo/backups/movieanimation"
TIMESTAMP=$(date -u '+%Y-%m-%d_%H-%M-%S')
DB_NAME="movieanimation"
DB_USER="sim_admin"
DB_HOST="localhost"
DB_PORT="5432"
DB_PASSWORD="SimData_Vector_2026!"
RETENTION_DAYS=30

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "=== MovieAnimation Database Backup ==="
echo "Timestamp: $TIMESTAMP UTC"
echo "Database:  $DB_NAME"
echo ""

# Create backup
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
echo "Creating backup: $BACKUP_FILE"

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Create latest symlink
ln -sf "$BACKUP_FILE" "$BACKUP_DIR/latest.sql.gz"
echo "✅ Latest symlink updated"

# Rotate old backups
echo ""
echo "Rotating backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "  Removed $DELETED old backup(s)"

# Summary
CURRENT_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo ""
echo "=== Backup Complete ==="
echo "  Backups retained: $CURRENT_COUNT"
echo "  Total size:       $TOTAL_SIZE"
echo "  Location:         $BACKUP_DIR"
