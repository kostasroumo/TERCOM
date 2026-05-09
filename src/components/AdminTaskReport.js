import { escapeHtml, formatDateTime } from "../lib/helpers.js";
import { PIPELINE_META, STATUS_META, STATUS_ORDER } from "../data/mockData.js";

function formatCollectionLine(items = [], type = "materials") {
  if (!items.length) {
    return `<li class="report-collection-empty">Δεν υπάρχουν καταχωρήσεις.</li>`;
  }

  return items
    .map((item) => {
      if (type === "materials") {
        const label = [item.code, item.description].filter(Boolean).join(" · ");
        return `<li>${escapeHtml(label || "Υλικό")} <strong>x${escapeHtml(String(item.quantity || 0))}</strong> ${escapeHtml(item.unit || "")}</li>`;
      }

      const label = [item.article, item.description].filter(Boolean).join(" · ");
      return `<li>${escapeHtml(label || "Άρθρο εργασίας")}</li>`;
    })
    .join("");
}

function renderStatusCheckbox(statusKey, selectedKeys = []) {
  const checked = selectedKeys.includes(statusKey);
  const label = STATUS_META[statusKey]?.label || statusKey;

  return `
    <label class="report-status-option${checked ? " is-selected" : ""}">
      <input type="checkbox" value="${escapeHtml(statusKey)}" data-admin-report-status ${checked ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

export function AdminTaskReport({
  user,
  users,
  modules,
  filters,
  tasks,
  pending,
  error,
  exportPending
}) {
  const moduleOptions = [
    { key: "all", name: "Όλες οι εργασίες / modules" },
    ...(modules || []).map((module) => ({ key: module.key, name: module.name }))
  ];
  const moduleMap = new Map((modules || []).map((module) => [module.key, module]));
  const totalMaterialQuantity = (tasks || []).reduce(
    (sum, task) => sum + (task.materials || []).reduce((innerSum, item) => innerSum + (Number(item.quantity) || 0), 0),
    0
  );
  const totalWorkItems = (tasks || []).reduce((sum, task) => sum + (task.workItems || []).length, 0);

  return `
    <section class="admin-report-page">
      <section class="surface admin-report-hero">
        <div>
          <p class="eyebrow">Admin Export</p>
          <h2>Αναφορά ολοκληρώσεων χρήστη</h2>
          <p class="section-copy">
            Φιλτράρουμε τις εργασίες του συνεργάτη πάνω στην <strong>ημερομηνία ολοκλήρωσης</strong>, ώστε ο admin να βλέπει ακριβώς τι έκλεισε ή τι έμεινε σε εκκρεμότητα μέσα σε κάθε διάστημα.
          </p>
        </div>

        <div class="admin-report-hero__summary">
          <article class="admin-report-stat">
            <span>Χρήστης</span>
            <strong>${escapeHtml(user?.displayName || user?.email || "Άγνωστος χρήστης")}</strong>
            <small>${escapeHtml(user?.companyName || user?.title || user?.email || "")}</small>
          </article>
          <article class="admin-report-stat">
            <span>Εργασίες</span>
            <strong>${escapeHtml(String((tasks || []).length))}</strong>
            <small>με τα τρέχοντα φίλτρα</small>
          </article>
          <article class="admin-report-stat">
            <span>Υλικά</span>
            <strong>${escapeHtml(String(totalMaterialQuantity))}</strong>
            <small>συνολική ποσότητα χρήσης</small>
          </article>
          <article class="admin-report-stat">
            <span>Άρθρα</span>
            <strong>${escapeHtml(String(totalWorkItems))}</strong>
            <small>γραμμές εργασιών</small>
          </article>
        </div>
      </section>

      <section class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Filters</p>
            <h2>Φίλτρα αναφοράς</h2>
          </div>
          <div class="admin-report-actions">
            <button class="button button--ghost" type="button" data-route="#/users">Πίσω στους χρήστες</button>
            <button class="button" type="button" data-export-admin-task-report ${pending || exportPending || !(tasks || []).length ? "disabled" : ""}>
              ${exportPending ? "Ετοιμάζουμε Excel..." : "Export Excel"}
            </button>
          </div>
        </div>

        <div class="form-grid admin-report-filter-grid">
          <label class="field">
            <span>Χρήστης</span>
            <select data-admin-report-user>
              ${(users || [])
                .map(
                  (entry) => `
                    <option value="${escapeHtml(entry.id)}"${entry.id === user?.id ? " selected" : ""}>
                      ${escapeHtml(entry.displayName || entry.email)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>

          <label class="field">
            <span>Module / εργασία</span>
            <select data-admin-report-filter="moduleKey">
              ${moduleOptions
                .map(
                  (module) => `
                    <option value="${escapeHtml(module.key)}"${filters.moduleKey === module.key ? " selected" : ""}>
                      ${escapeHtml(module.name)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>

          <label class="field">
            <span>Από</span>
            <input type="date" value="${escapeHtml(filters.fromDate || "")}" data-admin-report-filter="fromDate" />
          </label>

          <label class="field">
            <span>Έως</span>
            <input type="date" value="${escapeHtml(filters.toDate || "")}" data-admin-report-filter="toDate" />
          </label>
        </div>

        <div class="admin-report-preset-row">
          <button class="button button--ghost${filters.datePreset === "last7" ? " is-active" : ""}" type="button" data-admin-report-preset="last7">7 ημέρες</button>
          <button class="button button--ghost${filters.datePreset === "last30" ? " is-active" : ""}" type="button" data-admin-report-preset="last30">30 ημέρες</button>
          <button class="button button--ghost${filters.datePreset === "month" ? " is-active" : ""}" type="button" data-admin-report-preset="month">Τρέχων μήνας</button>
          <button class="button button--ghost${filters.datePreset === "custom" ? " is-active" : ""}" type="button" data-admin-report-preset="custom">Custom</button>
        </div>

        <div class="admin-report-status-grid">
          ${STATUS_ORDER
            .map((statusKey) => renderStatusCheckbox(statusKey, filters.statusKeys || []))
            .join("")}
        </div>

        <p class="field-help admin-report-help">
          Το report χρησιμοποιεί την πραγματική ημερομηνία ολοκλήρωσης της εργασίας. Για <strong>ολοκληρωμένες με εκκρεμότητα</strong> λαμβάνει υπόψη το κλείσιμο της εκτέλεσης, ώστε να μη χάνεται τίποτα από την αναφορά.
        </p>
      </section>

      <section class="surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Preview</p>
            <h2>Αποτελέσματα αναφοράς</h2>
          </div>
          <p class="section-copy">Προεπισκόπηση πριν το export σε ένα μόνο αρχείο Excel.</p>
        </div>

        ${
          error
            ? `
              <div class="alert-banner alert-banner--warning">
                <p>${escapeHtml(error)}</p>
                <div class="form-actions">
                  <button class="button button--ghost" type="button" data-retry-admin-task-report>Ξανά φόρτωση</button>
                </div>
              </div>
            `
            : ""
        }

        ${
          pending
            ? `
              <section class="empty-state empty-state--report">
                <h3>Φόρτωση αναφοράς</h3>
                <p>Συγκεντρώνουμε εργασίες, υλικά και άρθρα για τον συγκεκριμένο χρήστη.</p>
              </section>
            `
            : !(tasks || []).length
              ? `
                <section class="empty-state empty-state--report">
                  <h3>Δεν βρέθηκαν εργασίες</h3>
                  <p>Δοκίμασε άλλο διάστημα, άλλο module ή πρόσθεσε επιπλέον statuses στο φίλτρο.</p>
                </section>
              `
              : `
                <div class="table-wrap table-wrap--dense">
                  <table class="data-table admin-report-table">
                    <thead>
                      <tr>
                        <th>Ολοκλήρωση</th>
                        <th>Task</th>
                        <th>Pipeline</th>
                        <th>Status</th>
                        <th>Υλικά</th>
                        <th>Άρθρα εργασιών</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(tasks || [])
                        .map((task) => {
                          const moduleName = moduleMap.get(task.moduleKey)?.name || task.moduleKey || "—";
                          const pipelineLabel = PIPELINE_META[task.pipeline]?.label || task.pipeline || "—";
                          const statusLabel = STATUS_META[task.status]?.label || task.status || "—";

                          return `
                            <tr>
                              <td>
                                <div class="table-primary">${escapeHtml(formatDateTime(task.completedAt || task.endDate || task.updatedAt))}</div>
                                <div class="table-secondary">${escapeHtml(moduleName)}</div>
                              </td>
                              <td>
                                <div class="table-primary">${escapeHtml(task.title || task.taskCode || "Εργασία")}</div>
                                <div class="table-secondary">${escapeHtml(task.taskCode || task.id)} · ${escapeHtml(task.address || "-")} · ${escapeHtml(task.city || "-")}</div>
                              </td>
                              <td>${escapeHtml(pipelineLabel)}</td>
                              <td><span class="pill pill--${escapeHtml(task.status.replaceAll("_", "-"))}">${escapeHtml(statusLabel)}</span></td>
                              <td>
                                <ul class="report-collection-list">
                                  ${formatCollectionLine(task.materials || [], "materials")}
                                </ul>
                              </td>
                              <td>
                                <ul class="report-collection-list">
                                  ${formatCollectionLine(task.workItems || [], "work")}
                                </ul>
                              </td>
                              <td class="admin-report-table__actions">
                                <button class="button button--ghost" type="button" data-route="${escapeHtml(task.detailRoute || "#/users")}">Άνοιγμα</button>
                              </td>
                            </tr>
                          `;
                        })
                        .join("")}
                    </tbody>
                  </table>
                </div>
              `
        }
      </section>
    </section>
  `;
}
