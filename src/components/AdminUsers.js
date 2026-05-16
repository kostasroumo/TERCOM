import { escapeHtml, formatDateTime, formatFileSize } from "../lib/helpers.js";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "partner", label: "Partner" }
];

function buildAdminUserReportRoute(userId) {
  return `#/users/${encodeURIComponent(userId)}/report`;
}

function getUserInitials(user = {}) {
  const source = String(user.displayName || user.email || "User")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!source.length) {
    return "US";
  }

  return source.map((part) => part.charAt(0).toUpperCase()).join("");
}

function getModuleCount(user, modules = []) {
  if (user?.role === "admin") {
    return (modules || []).length;
  }

  return (user?.moduleKeys || []).length;
}

function renderModuleCheckboxes(modules, selectedKeys = [], pending = false, role = "partner", namePrefix = "moduleKeys") {
  const selected = new Set(role === "admin" ? modules.map((module) => module.key) : selectedKeys);

  return `
    <div class="module-access-grid">
      ${(modules || [])
        .map(
          (module) => `
            <label class="module-access-option${selected.has(module.key) ? " is-selected" : ""}">
              <input
                type="checkbox"
                name="${escapeHtml(namePrefix)}"
                value="${escapeHtml(module.key)}"
                ${selected.has(module.key) ? "checked" : ""}
                ${pending ? "disabled" : ""}
              />
              <span class="module-access-option__copy">
                <strong>${escapeHtml(module.name)}</strong>
                <small>${escapeHtml(module.description || "")}</small>
              </span>
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

function renderUserRow(user, modules, currentUserId, pending, mode = "active") {
  const isCurrentUser = user.id === currentUserId;
  const isInactive = user.isActive === false;
  const statusLabel = isInactive ? "Ανενεργός" : "Ενεργός";
  const actionLabel = mode === "inactive" ? "Επανενεργοποίηση" : "Αποθήκευση";
  const roleLabel = user.role === "admin" ? "Admin" : "Partner";
  const moduleCount = getModuleCount(user, modules);
  const hasContract = !!user.contract;
  const avatarLabel = getUserInitials(user);

  return `
    <form class="admin-user-card${mode === "inactive" ? " admin-user-card--inactive" : ""}" data-admin-user-form>
      <input type="hidden" name="id" value="${escapeHtml(user.id)}" />
      ${mode === "inactive" ? `<input type="hidden" name="isActive" value="true" />` : ""}

      <header class="admin-user-card__header">
        <div class="admin-user-card__identity">
          <span class="admin-user-card__avatar">${escapeHtml(avatarLabel)}</span>
          <div class="admin-user-card__identity-copy">
            <div class="admin-user-card__badges">
              <span class="pill ${isInactive ? "pill--cancelled" : "pill--completed"}">${escapeHtml(statusLabel)}</span>
              <span class="pill pill--assigned">${escapeHtml(roleLabel)}</span>
              ${isCurrentUser ? `<span class="pill pill--pending-validation">Τρέχων admin</span>` : ""}
            </div>
            <strong>${escapeHtml(user.displayName || user.email)}</strong>
            <span>${escapeHtml(user.email)}</span>
          </div>
        </div>

        <div class="admin-user-card__actions admin-user-card__actions--top">
          <button class="button button--ghost" type="button" data-route="${escapeHtml(buildAdminUserReportRoute(user.id))}">Αναφορά εργασιών</button>
          <button class="button ${mode === "inactive" ? "" : "button--secondary"}" type="submit" ${pending ? "disabled" : ""}>${actionLabel}</button>
        </div>
      </header>

      <div class="admin-user-card__layout">
        <section class="admin-user-card__panel">
          <div class="admin-user-card__section-head">
            <div>
              <p class="eyebrow">Profile</p>
              <h3>Στοιχεία χρήστη</h3>
            </div>
            <strong>${escapeHtml(roleLabel)}</strong>
          </div>

          <div class="form-grid admin-user-card__fields">
            <label class="field field--compact">
              <span>Όνομα</span>
              <input name="displayName" value="${escapeHtml(user.displayName || "")}" ${pending ? "disabled" : ""} />
            </label>

            <label class="field field--compact">
              <span>Εταιρεία</span>
              <input name="companyName" value="${escapeHtml(user.companyName || "")}" ${pending ? "disabled" : ""} />
            </label>

            <label class="field field--compact">
              <span>Τίτλος</span>
              <input name="title" value="${escapeHtml(user.title || "")}" ${pending ? "disabled" : ""} />
            </label>

            <label class="field field--compact">
              <span>Ρόλος</span>
              <select name="role" ${pending || isCurrentUser ? "disabled" : ""}>
                ${ROLE_OPTIONS.map(
                  (option) => `<option value="${option.value}"${user.role === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`
                ).join("")}
              </select>
            </label>

            ${
              mode === "active"
                ? `
                  <label class="field field--compact">
                    <span>Κατάσταση</span>
                    <select name="isActive" ${pending || isCurrentUser ? "disabled" : ""}>
                      <option value="true"${user.isActive !== false ? " selected" : ""}>Ενεργός</option>
                      <option value="false"${user.isActive === false ? " selected" : ""}>Ανενεργός</option>
                    </select>
                  </label>
                `
                : `
                  <div class="admin-user-card__status-note">
                    <span class="pill pill--cancelled">${escapeHtml(statusLabel)}</span>
                    <p>Ο λογαριασμός είναι εκτός login αλλά διατηρείται για ιστορικό, audit και εύκολη επανενεργοποίηση.</p>
                  </div>
                `
            }
          </div>
        </section>

        <aside class="admin-user-card__sidebar">
          <div class="admin-user-card__stat-grid">
            <article class="admin-user-card__stat">
              <span>Modules</span>
              <strong>${escapeHtml(String(moduleCount))}</strong>
              <small>${user.role === "admin" ? "πλήρης πρόσβαση" : "assigned access"}</small>
            </article>
            <article class="admin-user-card__stat">
              <span>Σύμβαση</span>
              <strong>${hasContract ? "ΝΑΙ" : "ΟΧΙ"}</strong>
              <small>${hasContract ? "ενεργή PDF" : "εκκρεμεί upload"}</small>
            </article>
            <article class="admin-user-card__stat">
              <span>Κατάσταση</span>
              <strong>${escapeHtml(statusLabel)}</strong>
              <small>${escapeHtml(roleLabel)}</small>
            </article>
          </div>

          <div class="admin-user-card__timeline">
            <div class="admin-user-card__timeline-row">
              <span>Δημιουργήθηκε</span>
              <strong>${escapeHtml(formatDateTime(user.createdAt))}</strong>
            </div>
            <div class="admin-user-card__timeline-row">
              <span>Τελευταία ενημέρωση</span>
              <strong>${escapeHtml(formatDateTime(user.updatedAt))}</strong>
            </div>
          </div>

          ${
            isCurrentUser
              ? `
                <div class="admin-user-card__inline-note">
                  Ο τρέχων admin λογαριασμός μένει προστατευμένος από αλλαγή ρόλου ή απενεργοποίηση.
                </div>
              `
              : ""
          }
        </aside>
      </div>

      <div class="field field--wide admin-user-card__section">
        <div class="admin-user-card__section-head">
          <div>
            <p class="eyebrow">Access</p>
            <h3>Ορατές εργασίες / modules</h3>
          </div>
          <strong>${escapeHtml(String(moduleCount))}</strong>
        </div>
        ${renderModuleCheckboxes(modules, user.moduleKeys || [], pending || isCurrentUser && user.role === "admin", user.role)}
        <small class="field-help">Ο admin βλέπει πάντα όλα τα ενεργά modules. Για partner εδώ κλειδώνουμε ποιες κάρτες θα εμφανίζονται στην είσοδο.</small>
      </div>

      <div class="field field--wide admin-contract-field admin-user-card__section">
        <div class="admin-user-card__section-head">
          <div>
            <p class="eyebrow">Documents</p>
            <h3>Σύμβαση συνεργασίας</h3>
          </div>
          <strong>${hasContract ? "PDF ενεργό" : "Δεν υπάρχει"}</strong>
        </div>

        ${
          user.contract
            ? `
              <div class="admin-contract-card">
                <div class="admin-contract-card__copy">
                  <strong>${escapeHtml(user.contract.fileName || "contract.pdf")}</strong>
                  <small>${escapeHtml(formatFileSize(user.contract.sizeBytes))} · ανέβηκε ${escapeHtml(formatDateTime(user.contract.uploadedAt))}</small>
                </div>
                <div class="admin-contract-card__actions">
                  ${
                    user.contract.downloadUrl
                      ? `
                        <a class="button button--ghost" href="${escapeHtml(user.contract.downloadUrl)}" target="_blank" rel="noreferrer">Προβολή PDF</a>
                        <a class="button button--ghost" href="${escapeHtml(user.contract.downloadUrl)}" download="${escapeHtml(user.contract.fileName || "contract.pdf")}">Λήψη</a>
                      `
                      : `<span class="field-help">Φόρτωση συνδέσμου...</span>`
                  }
                  <button class="button button--danger" type="submit" name="contractAction" value="delete" ${pending ? "disabled" : ""}>Αφαίρεση σύμβασης</button>
                </div>
              </div>
            `
            : `<div class="note note--soft">Δεν έχει ανέβει ακόμη σύμβαση για αυτόν τον χρήστη.</div>`
        }

        <label class="field field--compact">
          <span>${user.contract ? "Αντικατάσταση PDF" : "Upload PDF"}</span>
          <input type="file" name="contractFile" accept="application/pdf,.pdf" ${pending ? "disabled" : ""} />
        </label>

        <small class="field-help">Μόνο PDF. Ο χρήστης και ο admin θα βλέπουν πάντα την τελευταία ενεργή σύμβαση.</small>
      </div>
    </form>
  `;
}

export function AdminUsers({ users, modules, currentUserId, pending, error, message }) {
  const activeUsers = (users || []).filter((user) => user.isActive !== false);
  const inactiveUsers = (users || []).filter((user) => user.isActive === false);
  const activeRows = activeUsers.map((user) => renderUserRow(user, modules, currentUserId, pending, "active")).join("");
  const inactiveRows = inactiveUsers.map((user) => renderUserRow(user, modules, currentUserId, pending, "inactive")).join("");
  const totalContracts = (users || []).filter((user) => user.contract).length;
  const partnerCount = (users || []).filter((user) => user.role === "partner").length;

  return `
    <section class="admin-users-page">
      <section class="surface admin-users-hero">
        <div class="admin-users-hero__summary">
          <div class="admin-users-hero__copy">
            <p class="eyebrow">Admin Access</p>
            <h2>Διαχείριση χρηστών</h2>
            <p>Οργάνωσε λογαριασμούς, modules πρόσβασης και συμβάσεις μέσα σε ένα πιο καθαρό control room, χωρίς να αλλάξει τίποτα από τη λογική του app.</p>
          </div>

          <div class="admin-users-stats">
            <article class="admin-users-stat">
              <span>Ενεργοί</span>
              <strong>${activeUsers.length}</strong>
              <small>λογαριασμοί με πρόσβαση</small>
            </article>
            <article class="admin-users-stat">
              <span>Ανενεργοί</span>
              <strong>${inactiveUsers.length}</strong>
              <small>κρατιούνται για ιστορικό</small>
            </article>
            <article class="admin-users-stat">
              <span>Partners</span>
              <strong>${partnerCount}</strong>
              <small>field users</small>
            </article>
            <article class="admin-users-stat">
              <span>Συμβάσεις</span>
              <strong>${totalContracts}</strong>
              <small>ενεργά PDF αρχεία</small>
            </article>
          </div>
        </div>
      </section>

      ${error ? `<div class="alert-banner alert-banner--warning"><p>${escapeHtml(error)}</p></div>` : ""}
      ${message ? `<div class="alert-banner"><p>${escapeHtml(message)}</p></div>` : ""}

      <section class="surface admin-users-create-shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">Provisioning</p>
            <h2>Νέος χρήστης</h2>
          </div>
          <p class="section-copy">Δημιουργία λογαριασμού με αρχικά modules και ασφαλές onboarding, χωρίς να χαθεί η τωρινή λογική αναθέσεων.</p>
        </div>

        <div class="admin-users-note-grid">
          <div class="note">
            Η αφαίρεση χρήστη γίνεται ως <strong>απενεργοποίηση</strong>. Έτσι ο χρήστης βγαίνει από το ενεργό σύστημα και από τις <strong>νέες</strong> αναθέσεις, χωρίς να σβήνεται το ιστορικό του.
          </div>
          <div class="note">
            Τα <strong>modules εργασιών</strong> καθορίζουν ποιες κάρτες θα βλέπει κάθε χρήστης μόλις συνδέεται. Μέσα σε κάθε module ο partner συνεχίζει να βλέπει μόνο τα tasks που του έχουν ανατεθεί.
          </div>
        </div>

        <form class="admin-user-create" data-admin-user-create-form>
          <div class="form-grid admin-user-create__grid">
            <div class="field">
              <span>Email</span>
              <input type="email" name="email" required ${pending ? "disabled" : ""} />
            </div>
            <div class="field">
              <span>Κωδικός</span>
              <input type="password" name="password" required ${pending ? "disabled" : ""} />
            </div>
            <div class="field">
              <span>Όνομα</span>
              <input name="displayName" required ${pending ? "disabled" : ""} />
            </div>
            <div class="field">
              <span>Εταιρεία</span>
              <input name="companyName" required ${pending ? "disabled" : ""} />
            </div>
            <div class="field">
              <span>Τίτλος</span>
              <input name="title" placeholder="π.χ. Field Partner" ${pending ? "disabled" : ""} />
            </div>
            <div class="field">
              <span>Ρόλος</span>
              <select name="role" ${pending ? "disabled" : ""}>
                ${ROLE_OPTIONS.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="field field--wide admin-user-create__modules">
            <div class="admin-user-card__section-head">
              <div>
                <p class="eyebrow">Access</p>
                <h3>Αρχικά modules</h3>
              </div>
              <strong>FTTH default</strong>
            </div>
            ${renderModuleCheckboxes(modules, ["ftth"], pending)}
            <small class="field-help">Αν δεν επιλεγεί τίποτα για partner, το σύστημα θα τον βάλει αρχικά μόνο στο FTTH.</small>
          </div>

          <div class="form-actions admin-user-create__actions">
            <button class="button" type="submit" ${pending ? "disabled" : ""}>${pending ? "Αποθήκευση..." : "Προσθήκη χρήστη"}</button>
          </div>
        </form>
      </section>

      <section class="surface">
        <details class="directory-panel" open>
          <summary>
            <div>
              <p class="eyebrow">Directory</p>
              <h2>Ενεργοί χρήστες</h2>
            </div>
            <span class="directory-panel__count">${activeUsers.length}</span>
          </summary>
          <p class="directory-panel__copy">Οι ενεργοί λογαριασμοί μπορούν να συνδεθούν κανονικά και να βλέπουν μόνο τα modules που τους έχουν δοθεί.</p>
          <div class="admin-user-list">
            ${activeRows || `<div class="empty-state empty-state--directory"><p>Δεν βρέθηκαν ενεργοί χρήστες.</p></div>`}
          </div>
        </details>
      </section>

      <section class="surface">
        <details class="directory-panel">
          <summary>
            <div>
              <p class="eyebrow">Inactive Directory</p>
              <h2>Ανενεργοποιημένοι χρήστες</h2>
            </div>
            <span class="directory-panel__count">${inactiveUsers.length}</span>
          </summary>
          <p class="directory-panel__copy">Οι λογαριασμοί αυτοί δεν μπορούν να συνδεθούν, αλλά κρατιούνται για ιστορικό, αναθέσεις και εύκολη επανενεργοποίηση όταν χρειαστεί.</p>
          <div class="admin-user-list">
            ${inactiveRows || `<div class="empty-state empty-state--directory"><p>Δεν υπάρχουν ανενεργοί χρήστες.</p></div>`}
          </div>
        </details>
      </section>
    </section>
  `;
}
