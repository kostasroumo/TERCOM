# Supabase Setup Για Το Field Ops App

Αυτό το app έχει πλέον έτοιμη βάση για Supabase με:

- schema + πίνακες workflow
- RLS policies για `admin` και `partner`
- storage buckets για `photos` και `files`
- seed για `υλικά` και `εργασίες`

## Αρχεία

- Migration schema:
  - [supabase/migrations/202604300001_initial_schema.sql](/Users/konstantinos/Desktop/BIROL/supabase/migrations/202604300001_initial_schema.sql)
- Seed catalogs:
  - [supabase/seed.sql](/Users/konstantinos/Desktop/BIROL/supabase/seed.sql)
- Generator για νέο seed από τα catalogs του app:
  - [scripts/generate-supabase-seed.mjs](/Users/konstantinos/Desktop/BIROL/scripts/generate-supabase-seed.mjs)

## Τι δημιουργεί η βάση

### Κύριοι πίνακες

- `profiles`
- `tasks`
- `task_history`
- `task_pipeline_history`
- `task_fiber_stage_history`
- `task_audit_log`
- `task_photos`
- `task_files`
- `task_materials`
- `task_work_items`
- `task_safety_items`
- `material_catalog`
- `work_catalog`

### Storage buckets

- `task-photos`
- `task-files`

### Roles

- `admin`
- `partner`

## Πώς το περνάς σε νέο Supabase project

### 1. Δημιούργησε project

Στο Supabase φτιάξε νέο project.

### 2. Πέρασε το schema

Άνοιξε `SQL Editor` και εκτέλεσε όλο το αρχείο:

- [supabase/migrations/202604300001_initial_schema.sql](/Users/konstantinos/Desktop/BIROL/supabase/migrations/202604300001_initial_schema.sql)

Αυτό θα δημιουργήσει:

- enums
- πίνακες
- indexes
- triggers
- RLS policies
- storage buckets

Το `task_audit_log` γράφεται αυτόματα από database triggers και κρατά:

- ποιος έκανε την αλλαγή
- σε ποιο table έγινε
- αν ήταν `INSERT`, `UPDATE` ή `DELETE`
- τι πεδία άλλαξαν
- κατάσταση `before / after`

### 3. Πέρασε τα catalogs

Στο ίδιο `SQL Editor` εκτέλεσε:

- [supabase/seed.sql](/Users/konstantinos/Desktop/BIROL/supabase/seed.sql)

Θα περάσει:

- `86` υλικά
- `110` άρθρα εργασιών

## Πώς δημιουργείς χρήστες

Η βάση έχει trigger που συγχρονίζει αυτόματα το `auth.users` με τον πίνακα `profiles`.

Άρα η σωστή σειρά είναι:

1. Δημιουργείς user από `Authentication -> Users`
2. Ο trigger φτιάχνει αυτόματα εγγραφή στο `profiles`
3. Μετά ορίζεις σωστό `role`, `display_name`, `company_name`

### Προτεινόμενοι χρήστες για το app

- `TERCOM` -> `admin`
- `ΜΠΙΜΠΕΡ ΝΕΤΖΜΗ` -> `partner`
- `Δ. ΝΕΟΓΛΟΥ - Κ. ΧΑΤΖΗΑΝΔΡΕΟΥ Ο.Ε` -> `partner`
- `FIBER GO` -> `partner`

### Παράδειγμα update των profiles

Αφού φτιάξεις τους auth users, τρέξε κάτι σαν αυτό:

```sql
update public.profiles
set
  role = 'admin',
  display_name = 'TERCOM',
  company_name = 'TERCOM',
  title = 'Administrator'
where email = 'tercom@example.com';

update public.profiles
set
  role = 'partner',
  display_name = 'ΜΠΙΜΠΕΡ ΝΕΤΖΜΗ',
  company_name = 'ΜΠΙΜΠΕΡ ΝΕΤΖΜΗ',
  title = 'Field Partner'
where email = 'biber@example.com';

update public.profiles
set
  role = 'partner',
  display_name = 'Δ. ΝΕΟΓΛΟΥ - Κ. ΧΑΤΖΗΑΝΔΡΕΟΥ Ο.Ε',
  company_name = 'Δ. ΝΕΟΓΛΟΥ - Κ. ΧΑΤΖΗΑΝΔΡΕΟΥ Ο.Ε',
  title = 'Field Partner'
where email = 'neoglou@example.com';

update public.profiles
set
  role = 'partner',
  display_name = 'FIBER GO',
  company_name = 'FIBER GO',
  title = 'Field Partner'
where email = 'fibergo@example.com';
```

## Τι καλύπτει ήδη το RLS

- Ο `admin` βλέπει όλα τα tasks
- Ο `partner` βλέπει μόνο tasks που είναι ανατεθειμένα σε αυτόν
- Τα catalogs είναι readable από authenticated users
- Τα uploads επιτρέπονται μόνο αν ο χρήστης έχει πρόσβαση στο task
- Το `task_audit_log` είναι readable μόνο από όσους βλέπουν το αντίστοιχο task

## Διαφορά `task_history` και `task_audit_log`

- `task_history`
  - business-friendly ιστορικό
  - π.χ. "Η εργασία στάλθηκε για επικύρωση"
  - καλό για UI timeline

- `task_audit_log`
  - τεχνικό audit trail
  - καταγράφει αυτόματα `insert/update/delete`
  - κρατά και `before/after` state
  - καλό για έλεγχο αλλαγών και accountability

## Τι θα χρειαστεί στο επόμενο βήμα

Η βάση είναι έτοιμη, αλλά το frontend αυτή τη στιγμή ακόμα δουλεύει με `localStorage`.

Το επόμενο βήμα είναι integration:

1. προσθήκη `@supabase/supabase-js`
2. login / auth flow
3. αντικατάσταση του local state με fetch/save από Supabase
4. μεταφορά των uploads σε `Supabase Storage`
5. μεταφορά του history σε πραγματικά inserts στον `task_history`

## Αν αλλάξουν τα catalogs

Αν αλλάξεις τα αρχεία:

- [src/data/materialCatalog.js](/Users/konstantinos/Desktop/BIROL/src/data/materialCatalog.js)
- [src/data/workCatalog.js](/Users/konstantinos/Desktop/BIROL/src/data/workCatalog.js)

τρέξε:

```bash
npm run generate:supabase-seed
```

και μετά ξαναπέρασε το νέο:

- [supabase/seed.sql](/Users/konstantinos/Desktop/BIROL/supabase/seed.sql)

## Σημείωση

Η τωρινή βάση είναι στημένη ώστε να ταιριάζει στη λογική του app όπως είναι σήμερα:

- 3 top-level pipelines
- ειδικό inner flow για `Λειτουργίες Ινών`
- notes admin / partner
- υλικά
- άρθρα εργασιών
- validation / pending documents / cancellations

Αν αλλάξει πολύ η business λογική, θα κάνουμε και αντίστοιχο migration.
