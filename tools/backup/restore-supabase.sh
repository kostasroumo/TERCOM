#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$SCRIPT_DIR/.env.backup}"
TEMP_DIR=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    if [[ "$1" == "psql" ]]; then
      echo "Install native PostgreSQL tools on macOS with:" >&2
      echo "  brew install libpq" >&2
      echo "  brew link --force libpq" >&2
    fi
    exit 1
  fi
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

if [[ $# -lt 1 ]]; then
  echo "Usage: bash tools/backup/restore-supabase.sh <backup-archive-or-snapshot-dir>" >&2
  exit 1
fi

BACKUP_SOURCE="$1"
load_env

if [[ -z "${TARGET_DB_URL:-}" ]]; then
  echo "TARGET_DB_URL is required in tools/backup/.env.backup for restore." >&2
  exit 1
fi

RESTORE_DIR="$BACKUP_SOURCE"
if [[ -f "$BACKUP_SOURCE" ]]; then
  TEMP_DIR="$(mktemp -d)"
  tar -xzf "$BACKUP_SOURCE" -C "$TEMP_DIR"
  RESTORE_DIR="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi

DB_DIR="$RESTORE_DIR/database"
STORAGE_DIR="$RESTORE_DIR/storage"

if [[ ! -d "$DB_DIR" ]]; then
  echo "Database backup folder not found in: $RESTORE_DIR" >&2
  exit 1
fi

echo "==> Restoring database into target"
if command -v psql >/dev/null 2>&1; then
  psql "$TARGET_DB_URL" -f "$DB_DIR/roles.sql"
  psql "$TARGET_DB_URL" -f "$DB_DIR/schema.sql"
  psql "$TARGET_DB_URL" -f "$DB_DIR/data.sql"
else
  echo "psql is not installed, so automatic database restore cannot continue." >&2
  echo "Install psql, then run again. Example on macOS:" >&2
  echo "  brew install libpq && brew link --force libpq" >&2
  exit 1
fi

if [[ "${BACKUP_STORAGE:-true}" == "true" && -d "$STORAGE_DIR" ]]; then
  require_cmd supabase

  if [[ ! -f "$PROJECT_ROOT/supabase/config.toml" ]]; then
    echo "Storage restore requires a linked Supabase target project." >&2
    echo "Run: supabase init && supabase login && supabase link --project-ref NEW_PROJECT_REF" >&2
    exit 1
  fi

  echo "==> Restoring storage buckets to linked target project"
  find "$STORAGE_DIR" -mindepth 1 -maxdepth 1 -type d | while IFS= read -r bucket_dir; do
    bucket_name="$(basename "$bucket_dir")"
    source_root="$bucket_dir"

    if [[ -d "$bucket_dir/$bucket_name" ]]; then
      source_root="$bucket_dir/$bucket_name"
    fi

    find "$source_root" -type f | while IFS= read -r local_file; do
      relative_path="${local_file#"$source_root"/}"
      supabase storage cp "$local_file" "ss:///$bucket_name/$relative_path" --linked --experimental
    done
  done
fi

echo
echo "Restore completed from: $RESTORE_DIR"
