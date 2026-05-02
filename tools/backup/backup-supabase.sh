#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$SCRIPT_DIR/.env.backup}"
DB_HOST=""
DB_PORT=""
DB_NAME=""
DB_USER=""
DB_PASSWORD=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    if [[ "$1" == "pg_dump" || "$1" == "pg_dumpall" ]]; then
      echo "Install native PostgreSQL tools on macOS with:" >&2
      echo "  brew install libpq" >&2
      echo "  brew link --force libpq" >&2
    fi
    exit 1
  fi
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    echo "Copy tools/backup/.env.backup.example to tools/backup/.env.backup and fill in the values." >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

parse_db_url() {
  local uri="${SUPABASE_DB_URL:-}"

  if [[ "$uri" == postgres://* ]]; then
    uri="postgresql://${uri#postgres://}"
  fi

  if [[ "$uri" != postgresql://* ]]; then
    echo "SUPABASE_DB_URL must start with postgresql:// or postgres://" >&2
    exit 1
  fi

  local no_scheme="${uri#postgresql://}"
  local authority="${no_scheme%%/*}"
  local path_and_query="${no_scheme#*/}"
  local credentials="${authority%@*}"
  local host_port="${authority#*@}"

  DB_USER="${credentials%%:*}"
  DB_PASSWORD="${credentials#*:}"
  DB_HOST="${host_port%%:*}"
  DB_PORT="${host_port##*:}"
  DB_NAME="${path_and_query%%\?*}"

  if [[ -z "$DB_USER" || -z "$DB_PASSWORD" || -z "$DB_HOST" || -z "$DB_PORT" || -z "$DB_NAME" ]]; then
    echo "Could not parse SUPABASE_DB_URL correctly." >&2
    exit 1
  fi
}

cleanup_old_backups() {
  local keep="${LOCAL_KEEP_LATEST:-6}"
  if ! [[ "$keep" =~ ^[0-9]+$ ]] || [[ "$keep" -le 0 ]]; then
    return
  fi

  if [[ -d "$ARCHIVES_DIR" ]]; then
    local archive_count
    archive_count="$(find "$ARCHIVES_DIR" -maxdepth 1 -type f -name '*.tar.gz' | wc -l | tr -d ' ')"
    if [[ "$archive_count" -gt "$keep" ]]; then
      find "$ARCHIVES_DIR" -maxdepth 1 -type f -name '*.tar.gz' -print0 \
        | xargs -0 ls -1t \
        | tail -n +"$((keep + 1))" \
        | while IFS= read -r old_file; do
            rm -f "$old_file"
          done
    fi
  fi

  if [[ -d "$SNAPSHOTS_DIR" ]]; then
    local snapshot_count
    snapshot_count="$(find "$SNAPSHOTS_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
    if [[ "$snapshot_count" -gt "$keep" ]]; then
      find "$SNAPSHOTS_DIR" -mindepth 1 -maxdepth 1 -type d -print0 \
        | xargs -0 ls -1dt \
        | tail -n +"$((keep + 1))" \
        | while IFS= read -r old_dir; do
            rm -rf "$old_dir"
          done
    fi
  fi
}

load_env
require_cmd pg_dump
require_cmd pg_dumpall
require_cmd tar

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is required." >&2
  exit 1
fi

parse_db_url

BACKUP_ROOT="${BACKUP_ROOT:-$SCRIPT_DIR/backups}"
SNAPSHOTS_DIR="$BACKUP_ROOT/snapshots"
ARCHIVES_DIR="$BACKUP_ROOT/archives"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
SNAPSHOT_DIR="$SNAPSHOTS_DIR/$TIMESTAMP"
DB_DIR="$SNAPSHOT_DIR/database"
STORAGE_DIR="$SNAPSHOT_DIR/storage"
ARCHIVE_PATH="$ARCHIVES_DIR/${TIMESTAMP}.tar.gz"

mkdir -p "$DB_DIR" "$STORAGE_DIR" "$ARCHIVES_DIR"

echo "==> Creating database dumps"
PGPASSWORD="$DB_PASSWORD" pg_dumpall \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  --roles-only \
  --file="$DB_DIR/roles.sql"

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --exclude-table=storage.buckets_vectors \
  --exclude-table=storage.vector_indexes \
  --file="$DB_DIR/schema.sql"

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --data-only \
  --no-owner \
  --no-privileges \
  --exclude-table=storage.buckets_vectors \
  --exclude-table=storage.vector_indexes \
  --file="$DB_DIR/data.sql"

if [[ "${BACKUP_STORAGE:-true}" == "true" ]]; then
  require_cmd supabase
  if [[ ! -f "$PROJECT_ROOT/supabase/config.toml" ]]; then
    echo "Storage backup requires a linked Supabase project." >&2
    echo "Run: supabase init && supabase login && supabase link --project-ref YOUR_PROJECT_REF" >&2
    exit 1
  fi

  echo "==> Downloading storage buckets from linked project"
  IFS=',' read -r -a buckets <<< "${BACKUP_STORAGE_BUCKETS:-task-files,task-photos}"
  for raw_bucket in "${buckets[@]}"; do
    bucket="$(echo "$raw_bucket" | xargs)"
    [[ -z "$bucket" ]] && continue
    supabase storage cp "ss:///$bucket" "$STORAGE_DIR" -r --linked --experimental
  done
fi

cat > "$SNAPSHOT_DIR/manifest.json" <<EOF
{
  "createdAt": "$TIMESTAMP",
  "database": {
    "roles": "database/roles.sql",
    "schema": "database/schema.sql",
    "data": "database/data.sql"
  },
  "storageBuckets": [$(printf '"%s",' ${BACKUP_STORAGE_BUCKETS:-task-files,task-photos} | sed 's/,$//')],
  "cloudUploadEnabled": $([[ -n "${CLOUD_REMOTE:-}" ]] && echo "true" || echo "false")
}
EOF

echo "==> Packing snapshot"
tar -czf "$ARCHIVE_PATH" -C "$SNAPSHOTS_DIR" "$TIMESTAMP"

if [[ -n "${CLOUD_REMOTE:-}" ]]; then
  require_cmd rclone
  if [[ -z "${CLOUD_REMOTE_PATH:-}" ]]; then
    echo "CLOUD_REMOTE_PATH is required when CLOUD_REMOTE is set." >&2
    exit 1
  fi

  echo "==> Uploading archive to rclone remote"
  rclone copy "$ARCHIVE_PATH" "${CLOUD_REMOTE}:${CLOUD_REMOTE_PATH%/}/"
fi

cleanup_old_backups

echo
echo "Backup completed:"
echo "  Snapshot: $SNAPSHOT_DIR"
echo "  Archive:  $ARCHIVE_PATH"
