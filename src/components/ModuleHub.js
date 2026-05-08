import { escapeHtml, formatDateTime, formatFileSize, icon } from "../lib/helpers.js";

export function ModuleHub({ modules, counts, countsReady, selectedModuleKey, currentRole, manageUsersRoute = "", profileContract = null }) {
  if (!modules.length) {
    return `
      <section class="surface empty-screen">
        <h2>Δεν υπάρχουν διαθέσιμες εργασίες</h2>
        <p>Ο λογαριασμός δεν έχει ακόμη πρόσβαση σε κάποιο workspace εργασίας.</p>
      </section>
    `;
  }

  const renderedCards = modules
    .map((module) => {
      const total = counts.get(module.key);
      const countLabel = countsReady ? String(total || 0) : "—";

      return `
        <button
          class="module-card module-card--${escapeHtml(module.accent || "module-ftth")}${selectedModuleKey === module.key ? " is-active" : ""}"
          data-route="#/module/${encodeURIComponent(module.key)}"
          type="button"
        >
          <div class="module-card__icon">${icon(module.icon || "tasks")}</div>
          <div class="module-card__body">
            <p class="eyebrow">${currentRole === "admin" ? "Admin Access" : "Assigned Access"}</p>
            <h2>${escapeHtml(module.name)}</h2>
            <p>${escapeHtml(module.description || "Workspace εργασιών πεδίου.")}</p>
          </div>
          <div class="module-card__meta">
            <strong>${escapeHtml(countLabel)}</strong>
            <span>${countsReady ? "ορατές εργασίες" : "φόρτωση εργασιών"}</span>
            <small>Άνοιγμα workspace</small>
          </div>
        </button>
      `;
    })
    .join("");

  return `
    <section class="module-hub">
      <section class="hero surface module-hub__hero">
        <div class="module-hub__hero-copy">
          <p class="eyebrow">Workspace Selector</p>
          <h2>Επίλεξε εργασία / module</h2>
          <p>Κάθε κάρτα ανοίγει το αντίστοιχο operational περιβάλλον. Ο admin βλέπει όλα τα ενεργά modules, ενώ κάθε χρήστης μόνο όσα του έχουν δοθεί.</p>
        </div>
        <div class="hero-stats">
          <article>
            <span>Διαθέσιμα modules</span>
            <strong>${modules.length}</strong>
          </article>
          <article>
            <span>Ρόλος σύνδεσης</span>
            <strong>${escapeHtml(currentRole === "admin" ? "Admin" : "Partner")}</strong>
          </article>
        </div>
      </section>

      ${
        manageUsersRoute
          ? `
            <section class="surface module-hub__admin module-hub__strip">
              <div>
                <p class="eyebrow">Admin Tools</p>
                <h3>Διαχείριση χρηστών</h3>
                <p>Δημιούργησε συνεργάτες, άλλαξε ρόλους και κλείδωσε ποια modules θα βλέπει ο κάθε λογαριασμός πριν μπει στο operational περιβάλλον.</p>
              </div>
              <div class="module-hub__admin-actions">
                <button class="button" type="button" data-route="${escapeHtml(manageUsersRoute)}">Άνοιγμα διαχείρισης</button>
              </div>
            </section>
          `
          : ""
      }

      ${
        currentRole !== "admin" || profileContract
          ? `
            <section class="surface module-hub__contract module-hub__strip">
              <div>
                <p class="eyebrow">Έγγραφα Χρήστη</p>
                <h3>Σύμβαση συνεργασίας</h3>
                <p>${
                  profileContract
                    ? `Η σύμβαση είναι διαθέσιμη για online προβολή και λήψη σε PDF.`
                    : `Ο admin δεν έχει ανεβάσει ακόμη τη σύμβασή σου. Όταν προστεθεί, θα εμφανιστεί εδώ σε μορφή PDF.`
                }</p>
              </div>
              ${
                profileContract
                  ? `
                    <div class="module-contract-card">
                      <div class="module-contract-card__meta">
                        <strong>${escapeHtml(profileContract.fileName || "Σύμβαση")}</strong>
                        <span>${escapeHtml(formatFileSize(profileContract.sizeBytes))} · ενημέρωση ${escapeHtml(formatDateTime(profileContract.uploadedAt))}</span>
                      </div>
                      <div class="module-contract-card__actions">
                        ${
                          profileContract.downloadUrl
                            ? `
                              <a class="button" href="${escapeHtml(profileContract.downloadUrl)}" target="_blank" rel="noreferrer">Προβολή PDF</a>
                              <a class="button button--ghost" href="${escapeHtml(profileContract.downloadUrl)}" download="${escapeHtml(profileContract.fileName || "contract.pdf")}">Λήψη</a>
                            `
                            : `<span class="module-contract-card__hint">Φόρτωση συνδέσμου...</span>`
                        }
                      </div>
                    </div>
                  `
                  : ""
              }
            </section>
          `
          : ""
      }

      <section class="module-grid">
        ${renderedCards}
      </section>
    </section>
  `;
}
