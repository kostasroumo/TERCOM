import { escapeHtml, formatDateTime } from "../lib/helpers.js";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "partner", label: "Partner" }
];

export function AdminUsers({ users, currentUserId, pending, error, message }) {
  const rows = (users || [])
    .map((user) => {
      const isCurrentUser = user.id === currentUserId;
      const statusLabel = user.isActive === false ? "Ανενεργός" : "Ενεργός";

      return `
        <form class="admin-user-row" data-admin-user-form>
          <input type="hidden" name="id" value="${escapeHtml(user.id)}" />
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
          <label class="field field--compact">
            <span>Κατάσταση</span>
            <select name="isActive" ${pending || isCurrentUser ? "disabled" : ""}>
              <option value="true"${user.isActive !== false ? " selected" : ""}>Ενεργός</option>
              <option value="false"${user.isActive === false ? " selected" : ""}>Ανενεργός</option>
            </select>
          </label>
          <div class="admin-user-row__meta">
            <span class="pill ${user.isActive === false ? "pill--cancelled" : "pill--completed"}">${escapeHtml(statusLabel)}</span>
            <span>Δημιουργήθηκε: ${escapeHtml(formatDateTime(user.createdAt))}</span>
            <span>Τελευταία ενημέρωση: ${escapeHtml(formatDateTime(user.updatedAt))}</span>
            ${isCurrentUser ? `<span>Τρέχων λογαριασμός admin</span>` : ""}
          </div>
          <div class="admin-user-row__actions">
            <button class="button button--secondary" type="submit" ${pending ? "disabled" : ""}>Αποθήκευση</button>
          </div>
        </form>
      `;
    })
    .join("");

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
          <div class="form-actions">
            <button class="button" type="submit" ${pending ? "disabled" : ""}>${pending ? "Αποθήκευση..." : "Προσθήκη χρήστη"}</button>
          </div>
        </form>
      </section>

      <section class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Directory</p>
            <h2>Ενεργοί και ανενεργοί χρήστες</h2>
          </div>
          <p class="section-copy">${users.length} συνολικοί λογαριασμοί</p>
        </div>

        <div class="admin-user-list">
          ${rows || `<div class="empty-state"><p>Δεν βρέθηκαν χρήστες.</p></div>`}
        </div>
      </section>
    </section>
  `;
}
