# Supabase Backup Tool

Αυτό το setup δίνει πλήρες snapshot για:

- database schema
- database data
- roles
- storage buckets (`task-files`, `task-photos`)
- προαιρετικό upload του τελικού archive σε όποιο cloud remote έχεις στο `rclone`

Το database backup/restore δουλεύει με native PostgreSQL tools (`pg_dump`, `pg_dumpall`, `psql`) και δεν χρειάζεται Docker.

## Τι αρχεία φτιάχνει

Κάθε backup δημιουργεί:

- `tools/backup/backups/snapshots/YYYY-MM-DD_HH-MM-SS/database/roles.sql`
- `tools/backup/backups/snapshots/YYYY-MM-DD_HH-MM-SS/database/schema.sql`
- `tools/backup/backups/snapshots/YYYY-MM-DD_HH-MM-SS/database/data.sql`
- `tools/backup/backups/snapshots/YYYY-MM-DD_HH-MM-SS/storage/...`
- `tools/backup/backups/archives/YYYY-MM-DD_HH-MM-SS.tar.gz`

Το archive είναι full snapshot εκείνης της στιγμής, όχι μόνο τα νέα δεδομένα.

## One-time setup

### 1. Φτιάξε το config αρχείο

```bash
cp tools/backup/.env.backup.example tools/backup/.env.backup
```

Συμπλήρωσε:

- `SUPABASE_DB_URL`
- `TARGET_DB_URL`
- αν θέλεις cloud upload:
  - `CLOUD_REMOTE`
  - `CLOUD_REMOTE_PATH`

### 2. Σύνδεσε το Supabase CLI με το project

Το storage backup/restore χρησιμοποιεί το linked project του Supabase CLI.

```bash
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 2a. Βεβαιώσου ότι υπάρχουν τα PostgreSQL tools

```bash
brew install libpq
brew link --force libpq
```

### 3. Προαιρετικά: στήσε `rclone`

Αν θέλεις να ανεβαίνουν τα backup archives σε Google Drive / Dropbox / OneDrive / S3 / άλλο cloud:

```bash
rclone config
```

Μετά βάζεις στο `tools/backup/.env.backup`:

```bash
CLOUD_REMOTE=gdrive
CLOUD_REMOTE_PATH=TERCOM/supabase-backups
```

## Χειροκίνητο backup

```bash
bash tools/backup/backup-supabase.sh
```

ή:

```bash
npm run backup:supabase
```

Αυτό:

1. τραβάει `roles.sql`
2. τραβάει `schema.sql`
3. τραβάει `data.sql`
4. κατεβάζει τα buckets από το linked Supabase project
5. φτιάχνει `.tar.gz`
6. το ανεβάζει σε cloud αν έχεις `rclone`

## Restore σε άδεια βάση

### 1. Αν είναι νέο Supabase project

Σύνδεσε πρώτα το CLI στο νέο project για να μπορέσει να επαναφέρει storage:

```bash
supabase link --project-ref NEW_PROJECT_REF
```

### 2. Τρέξε restore

Από snapshot folder:

```bash
bash tools/backup/restore-supabase.sh tools/backup/backups/snapshots/YYYY-MM-DD_HH-MM-SS
```

Από archive:

```bash
bash tools/backup/restore-supabase.sh tools/backup/backups/archives/YYYY-MM-DD_HH-MM-SS.tar.gz
```

ή:

```bash
npm run restore:supabase -- tools/backup/backups/archives/TO_BACKUP.tar.gz
```

Το restore script:

1. περνάει `roles.sql`
2. περνάει `schema.sql`
3. περνάει `data.sql`
4. ξανανεβάζει storage objects στο linked target project

## Scheduling

### Κάθε 3 εβδομάδες με `launchd` (macOS)

Χρησιμοποίησε `StartInterval` σε δευτερόλεπτα:

- `1814400` = 3 εβδομάδες
- `2592000` = περίπου 30 μέρες

Παράδειγμα command στο plist:

```xml
<array>
  <string>/bin/zsh</string>
  <string>-lc</string>
  <string>cd /Users/konstantinos/Desktop/BIROL && BACKUP_ENV_FILE=/Users/konstantinos/Desktop/BIROL/tools/backup/.env.backup bash tools/backup/backup-supabase.sh</string>
</array>
```

### Εναλλακτικά με `cron`

Κάθε μήνα:

```cron
0 3 1 * * cd /Users/konstantinos/Desktop/BIROL && BACKUP_ENV_FILE=/Users/konstantinos/Desktop/BIROL/tools/backup/.env.backup bash tools/backup/backup-supabase.sh
```

## Σημαντικές σημειώσεις

- Για automatic restore της database χρειάζεται `psql`.
- Αν δεν το έχεις:

```bash
brew install libpq
brew link --force libpq
```

- Το storage backup/restore θέλει linked project μέσω Supabase CLI.
- Το cloud upload είναι προαιρετικό και γίνεται μόνο αν βάλεις `rclone` remote.
