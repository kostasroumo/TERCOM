import { escapeHtml, formatDateTime, formatFileSize } from "../lib/helpers.js";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "partner", label: "Partner" }
];

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

  return `
    <form class="admin-user-row${mode === "inactive" ? " admin-user-row--inactive" : ""}" data-admin-user-form>
      <input type="hidden" name="id" value="${escapeHtml(user.id)}" />
      ${mode === "inactive" ? `<input type="hidden" name="isActive" value="true" />` : ""}
      <div class="admin-user-row__identity">
        <strong>${escapeHtml(user.displayName || user.email)}</strong>
        <span>${escapeHtml(user.email)}</span>
      </div>
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
            <div class="admin-user-row__status-note">
              <span class="pill pill--cancelled">${escapeHtml(statusLabel)}</span>
              <p>Ο λογαριασμός έχει αποκλειστεί από login και μένει διαθέσιμος μόνο για ιστορικό, audit και επανενεργοποίηση.</p>
            </div>
          `
      }
      <div class="field field--wide">
        <span>Ορατές εργασίες / modules</span>
        ${renderModuleCheckboxes(modules, user.moduleKeys || [], pending || isCurrentUser && user.role === "admin", user.role)}
        <small class="field-help">Ο admin βλέπει πάντα όλα τα ενεργά modules. Για partner εδώ κλειδώνουμε ποιες κάρτες θα εμφανίζονται στην είσοδο.</small>
      </div>
      <div class="field field--wide admin-contract-field">
        <span>Σύμβαση συνεργασίας</span>
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
      <div class="admin-user-row__meta">
        <span class="pill ${isInactive ? "pill--cancelled" : "pill--completed"}">${escapeHtml(statusLabel)}</span>
        <span>Δημιουργήθηκε: ${escapeHtml(formatDateTime(user.createdAt))}</span>
        <span>Τελευταία ενημέρωση: ${escapeHtml(formatDateTime(user.updatedAt))}</span>
        ${isCurrentUser ? `<span>Τρέχων λογαριασμός admin</span>` : ""}
      </div>
      <div class="admin-user-row__actions">
        <button class="button ${mode === "inactive" ? "" : "button--secondary"}" type="submit" ${pending ? "disabled" : ""}>${actionLabel}</button>
      </div>
    </form>
  `;
}

export function AdminUsers({ users, modules, currentUserId, pending, error, message }) {
  const activeUsers = (users || []).filter((user) => user.isActive !== false);
  const inactiveUsers = (users || []).filter((user) => user.isActive === false);
  const activeRows = activeUsers.map((user) => renderUserRow(user, modules, currentUserId, pending, "active")).join("");
  const inactiveRows = inactiveUsers.map((user) => renderUserRow(user, modules, currentUserId, pending, "inactive")).join("");

  return `
    <section class="admin-users-page">
      <section class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Admin Access</p>
            <h2>Διαχείριση χρηστών</h2>
          </div>
          <p class="section-copy">Προσθήκη νέων χρηστών, αλλαγή ρόλων και απενεργοποίηση λογαριασμών χωρίς να πειράξουμε την υπόλοιπη λογική του app.</p>
        </div>

        <div class="note">
          Η αφαίρεση χρήστη γίνεται ως <strong>απενεργοποίηση</strong>. Έτσι ο χρήστης βγαίνει από το ενεργό σύστημα και από τις <strong>νέες</strong> αναθέσεις, χωρίς να σβήνεται βίαια το ιστορικό του.
        </div>

        <div class="note">
          Τα <strong>modules εργασιών</strong> καθορίζουν ποιες κάρτες θα βλέπει κάθε χρήστης μόλις συνδέεται. Μέσα σε κάθε module ο partner συνεχίζει να βλέπει μόνο τα tasks που του έχουν ανατεθεί.
        </div>

        ${error ? `<div class="alert-banner alert-banner--warning"><p>${escapeHtml(error)}</p></div>` : ""}
        ${message ? `<div class="alert-banner"><p>${escapeHtml(message)}</p></div>` : ""}

        <form class="form-grid admin-user-create" data-admin-user-create-form>
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
          <div class="field field--wide">
            <span>Αρχικά modules</span>
            ${renderModuleCheckboxes(modules, ["ftth"], pending)}
            <small class="field-help">Αν δεν επιλεγεί τίποτα για partner, το σύστημα θα τον βάλει αρχικά μόνο στο FTTH.</small>
          </div>
          <div class="form-actions">
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
            ${activeRows || `<div class="empty-state"><p>Δεν βρέθηκαν ενεργοί χρήστες.</p></div>`}
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
            ${inactiveRows || `<div class="empty-state"><p>Δεν υπάρχουν ανενεργοί χρήστες.</p></div>`}
          </div>
        </details>
      </section>
    </section>
  `;
}
