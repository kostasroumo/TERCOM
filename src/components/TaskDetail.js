import { PIPELINE_META, STATUS_META, STATUS_OPTIONS_ORDER, STATUS_ORDER, TASK_TYPES, TECHNICIANS } from "../data/mockData.js";
import { escapeHtml, formatCompactDateTime, formatDateTime, formatElapsedDays, formatFileSize, icon } from "../lib/helpers.js";
import { HistoryTimeline } from "./HistoryTimeline.js";
import { PhotoUploader } from "./PhotoUploader.js";

function renderMainTab(task, permissions) {
  const canEditSchedule = permissions.canManageAssignment || permissions.canScheduleVisit;

  return `
    <form class="tab-panel form-grid" data-task-main-form="${escapeHtml(task.id)}">
      <div class="field">
        <span>Τίτλος</span>
        <input name="title" value="${escapeHtml(task.title)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Είδος</span>
        <select name="type" ${permissions.canEditCore ? "" : "disabled"}>
          ${TASK_TYPES.map((type) => `<option value="${type.value}"${task.type === type.value ? " selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <span>Κατάσταση</span>
        <select name="status" ${permissions.canEditStatusDirectly ? "" : "disabled"}>
          ${STATUS_OPTIONS_ORDER.map((status) => `<option value="${status}"${task.status === status ? " selected" : ""}>${escapeHtml(STATUS_META[status].label)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <span>Project</span>
        <input name="projectName" value="${escapeHtml(task.projectName)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>SR ID</span>
        <input name="srId" value="${escapeHtml(task.srId)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>BID</span>
        <input name="bid" value="${escapeHtml(task.bid)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Πόρος / Team</span>
        <input name="resourceTeam" value="${escapeHtml(task.resourceTeam)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Ανατέθηκε σε συνεργάτη</span>
        <select name="assignedUserId" ${permissions.canManageAssignment ? "" : "disabled"}>
          <option value="">Δεν έχει ανατεθεί</option>
          ${TECHNICIANS.map(
            (technician) => `<option value="${technician.id}"${task.assignedUserId === technician.id ? " selected" : ""}>${escapeHtml(technician.name)}</option>`
          ).join("")}
        </select>
      </div>
      <div class="field">
        <span>Ονοματεπώνυμο πελάτη</span>
        <input name="customerName" value="${escapeHtml(task.customerName)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Κινητό</span>
        <input name="mobilePhone" value="${escapeHtml(task.mobilePhone)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Σταθερό</span>
        <input name="landlinePhone" value="${escapeHtml(task.landlinePhone)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Διεύθυνση</span>
        <input name="address" value="${escapeHtml(task.address)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Πόλη</span>
        <input name="city" value="${escapeHtml(task.city)}" ${permissions.canEditCore ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Ημ/νία έναρξης</span>
        <input type="datetime-local" name="startDate" value="${escapeHtml(task.startDate)}" ${canEditSchedule ? "" : "disabled"} />
      </div>
      <div class="field">
        <span>Ημ/νία λήξης</span>
        <input type="datetime-local" name="endDate" value="${escapeHtml(task.endDate)}" ${permissions.canManageAssignment ? "" : "disabled"} />
      </div>
      <div class="field field--wide">
        <span>Σημειώσεις</span>
        <textarea name="notes" rows="8" ${permissions.canEditNotes ? "" : "disabled"}>${escapeHtml(task.notes)}</textarea>
      </div>
      ${
        permissions.canEditCore || permissions.canEditNotes || permissions.canManageAssignment
          ? `<div class="form-actions"><button class="button" type="submit">Αποθήκευση αλλαγών</button></div>`
          : ""
      }
    </form>
  `;
}

function renderFilesTab(task, permissions) {
  return `
    <section class="tab-panel">
      <div class="tab-panel__head">
        <div>
          <h3>Αρχεία & reports</h3>
          <p>Συγκεντρωτικός φάκελος με reports, PDF και υποστηρικτικά έγγραφα.</p>
        </div>
        ${
          permissions.canUploadFiles
            ? `
              <label class="button button--secondary upload-button">
                ${icon("files")}
                <span>Μεταφόρτωση αρχείων</span>
                <input type="file" multiple data-file-input data-task-id="${escapeHtml(task.id)}" hidden />
              </label>
            `
            : ""
        }
      </div>

      <div class="document-list">
        ${
          task.files.length
            ? task.files
                .map(
                  (file) => `
                    <article class="document-row">
                      <div class="document-row__title">
                        <strong>${escapeHtml(file.name)}</strong>
                        <span>${escapeHtml(file.type || "file")}</span>
                      </div>
                      <div class="document-row__meta">
                        <span>${formatFileSize(file.size)}</span>
                        <span>${escapeHtml(file.uploadedBy)}</span>
                        <span>${formatDateTime(file.uploadedAt)}</span>
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-state"><p>Δεν υπάρχουν συνημμένα αρχεία.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderMaterialsTab(task, permissions) {
  return `
    <section class="tab-panel">
      <div class="tab-panel__head">
        <div>
          <h3>Υλικά</h3>
          <p>Καταγραφή υλικών που χρησιμοποιήθηκαν στην εργασία πεδίου.</p>
        </div>
      </div>

      ${
        permissions.canAddMaterials
          ? `
            <form class="inline-form" data-material-form="${escapeHtml(task.id)}">
              <input name="code" placeholder="Κωδικός" required />
              <input name="description" placeholder="Περιγραφή υλικού" required />
              <input type="number" min="1" step="1" name="quantity" placeholder="Ποσότητα" required />
              <input name="unit" placeholder="Μονάδα" value="τεμ." required />
              <button class="button button--secondary" type="submit">Προσθήκη</button>
            </form>
          `
          : ""
      }

      <div class="table-wrap table-wrap--dense">
        <table class="data-table">
          <thead>
            <tr>
              <th>Κωδικός</th>
              <th>Περιγραφή</th>
              <th>Ποσότητα</th>
              <th>Μονάδα</th>
            </tr>
          </thead>
          <tbody>
            ${
              task.materials.length
                ? task.materials
                    .map(
                      (material) => `
                        <tr>
                          <td>${escapeHtml(material.code)}</td>
                          <td>${escapeHtml(material.description)}</td>
                          <td>${escapeHtml(material.quantity)}</td>
                          <td>${escapeHtml(material.unit)}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="4">Δεν έχουν δηλωθεί υλικά.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFloorsTab(task) {
  return `
    <section class="tab-panel">
      <div class="tab-panel__head">
        <div>
          <h3>Floors / Δομή κτιρίου</h3>
          <p>Δομημένη αποτύπωση ορόφων, μονάδων και σημείων πρόσβασης.</p>
        </div>
      </div>

      <div class="floor-grid">
        ${task.floors
          .map(
            (floor) => `
              <article class="floor-card">
                <div class="floor-card__head">
                  <span class="floor-card__icon">${icon("building")}</span>
                  <strong>${escapeHtml(floor.level)}</strong>
                </div>
                <dl>
                  <div><dt>Μονάδες</dt><dd>${escapeHtml(floor.units)}</dd></div>
                  <div><dt>Πρόσβαση</dt><dd>${escapeHtml(floor.access)}</dd></div>
                  <div><dt>Riser</dt><dd>${escapeHtml(floor.riser)}</dd></div>
                </dl>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSafetyTab(task, permissions) {
  return `
    <form class="tab-panel" data-safety-form="${escapeHtml(task.id)}">
      <div class="tab-panel__head">
        <div>
          <h3>Health & Safety</h3>
          <p>Checklist ασφαλείας πριν και μετά την εκτέλεση.</p>
        </div>
        ${permissions.canEditSafety ? `<button class="button button--secondary" type="submit">Αποθήκευση survey</button>` : ""}
      </div>

      <div class="safety-grid">
        ${task.safety
          .map(
            (item) => `
              <article class="safety-card">
                <div class="field">
                  <span>${escapeHtml(item.item)}</span>
                  <select name="status-${escapeHtml(item.id)}" ${permissions.canEditSafety ? "" : "disabled"}>
                    <option value="ok"${item.status === "ok" ? " selected" : ""}>OK</option>
                    <option value="warning"${item.status === "warning" ? " selected" : ""}>Warning</option>
                    <option value="needs-review"${item.status === "needs-review" ? " selected" : ""}>Needs review</option>
                  </select>
                </div>
                <div class="field">
                  <span>Σχόλιο</span>
                  <textarea rows="3" name="note-${escapeHtml(item.id)}" ${permissions.canEditSafety ? "" : "disabled"}>${escapeHtml(item.note)}</textarea>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </form>
  `;
}

function renderSystemTab(task) {
  const completedPipelines = task.pipelineHistory.length
    ? task.pipelineHistory
        .map((entry) => `${PIPELINE_META[entry.pipeline]?.label || entry.pipeline} · ${formatCompactDateTime(entry.completedAt)}`)
        .join(" | ")
    : "Δεν υπάρχουν ολοκληρωμένα προηγούμενα pipelines";

  return `
    <section class="tab-panel">
      <div class="system-grid">
        <article class="system-card"><span>Current pipeline</span><strong>${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</strong></article>
        <article class="system-card"><span>Pipeline history</span><strong>${escapeHtml(completedPipelines)}</strong></article>
        <article class="system-card"><span>Task ID</span><strong>${escapeHtml(task.id)}</strong></article>
        <article class="system-card"><span>Created at</span><strong>${formatCompactDateTime(task.createdAt)}</strong></article>
        <article class="system-card"><span>Ημέρες ανοιχτό από δημιουργία</span><strong>${formatElapsedDays(task.createdAt, task.completedAt)}</strong></article>
        <article class="system-card"><span>Assigned at</span><strong>${formatCompactDateTime(task.assignedAt)}</strong></article>
        <article class="system-card"><span>Ημέρες από ανάθεση</span><strong>${task.assignedAt ? formatElapsedDays(task.assignedAt, task.completedAt) : "Δεν έχει ανατεθεί"}</strong></article>
        <article class="system-card"><span>Completed at</span><strong>${task.completedAt ? formatCompactDateTime(task.completedAt) : "Δεν έχει ολοκληρωθεί"}</strong></article>
        <article class="system-card"><span>Created by</span><strong>${escapeHtml(task.createdBy)}</strong></article>
        <article class="system-card"><span>Updated at</span><strong>${formatCompactDateTime(task.updatedAt)}</strong></article>
        <article class="system-card"><span>Updated by</span><strong>${escapeHtml(task.updatedBy)}</strong></article>
        <article class="system-card"><span>API status</span><strong>${escapeHtml(task.flags.apiStatus)}</strong></article>
        <article class="system-card"><span>Validation lock</span><strong>${task.flags.validationLock ? "ΝΑΙ" : "ΟΧΙ"}</strong></article>
        <article class="system-card"><span>Open issues</span><strong>${task.flags.openIssues ? "ΝΑΙ" : "ΟΧΙ"}</strong></article>
        <article class="system-card"><span>Cancellation request</span><strong>${task.flags.cancellationRequested ? "ΝΑΙ" : "ΟΧΙ"}</strong></article>
        <article class="system-card"><span>Cancellation by</span><strong>${escapeHtml(task.flags.cancellationRequestedBy || "-")}</strong></article>
        <article class="system-card"><span>Cancellation at</span><strong>${task.flags.cancellationRequestedAt ? formatCompactDateTime(task.flags.cancellationRequestedAt) : "Δεν υπάρχει"}</strong></article>
        <article class="system-card"><span>Cancellation reason</span><strong>${escapeHtml(task.flags.cancellationReason || "-")}</strong></article>
      </div>
    </section>
  `;
}

function renderTabContent(task, activeTab, permissions) {
  switch (activeTab) {
    case "photos":
      return PhotoUploader(task, permissions);
    case "files":
      return renderFilesTab(task, permissions);
    case "materials":
      return renderMaterialsTab(task, permissions);
    case "floors":
      return renderFloorsTab(task);
    case "safety":
      return renderSafetyTab(task, permissions);
    case "history":
      return HistoryTimeline(task.history);
    case "system":
      return renderSystemTab(task);
    case "main":
    default:
      return renderMainTab(task, permissions);
  }
}

function renderWorkflowActions(task, permissions, validationComment, cancellationComment) {
  return `
    <div class="detail-side__section">
      <h3>Workflow actions</h3>
      <p class="muted">Ο admin δημιουργεί και αναθέτει. Ο συνεργάτης εκτελεί και παραδίδει για έλεγχο.</p>

      ${
        task.flags.cancellationRequested
          ? `
            <div class="alert-banner alert-banner--warning">
              <strong>Αίτημα ακύρωσης σε εκκρεμότητα</strong>
              <span>${escapeHtml(task.flags.cancellationRequestedBy || "Συνεργάτης")} · ${task.flags.cancellationRequestedAt ? formatCompactDateTime(task.flags.cancellationRequestedAt) : "Τώρα"}</span>
              <p>${escapeHtml(task.flags.cancellationReason || "Δεν υπάρχει σχόλιο.")}</p>
            </div>
          `
          : ""
      }

      ${
        permissions.canStart
          ? `<button class="button" data-workflow-action="start" data-task-id="${escapeHtml(task.id)}">Έναρξη εργασίας</button>`
          : ""
      }

      ${
        permissions.canSubmitValidation
          ? `<button class="button" data-workflow-action="submit-validation" data-task-id="${escapeHtml(task.id)}">Αποστολή για επικύρωση</button>`
          : ""
      }

      ${
        permissions.canRequestCancellation
          ? `
            <label class="field">
              <span>Αιτιολογία αιτήματος ακύρωσης</span>
              <textarea rows="4" data-cancellation-comment>${escapeHtml(cancellationComment)}</textarea>
            </label>
            <button class="button button--ghost" data-workflow-action="request-cancellation" data-task-id="${escapeHtml(task.id)}">Αίτημα ακύρωσης</button>
          `
          : ""
      }

      ${
        permissions.canApprove || permissions.canReject || permissions.canApproveCancellation || permissions.canRejectCancellation
          ? `
            <label class="field">
              <span>Σχόλιο admin</span>
              <textarea rows="4" data-validation-comment>${escapeHtml(validationComment)}</textarea>
            </label>
          `
          : ""
      }

      ${
        permissions.canApprove
          ? `<button class="button" data-workflow-action="approve" data-task-id="${escapeHtml(task.id)}">Έγκριση ολοκλήρωσης</button>`
          : ""
      }

      ${
        permissions.canReject
          ? `<button class="button button--danger" data-workflow-action="reject" data-task-id="${escapeHtml(task.id)}">Απόρριψη και επιστροφή</button>`
          : ""
      }

      ${
        permissions.canApproveCancellation
          ? `<button class="button button--danger" data-workflow-action="approve-cancellation" data-task-id="${escapeHtml(task.id)}">Έγκριση ακύρωσης</button>`
          : ""
      }

      ${
        permissions.canRejectCancellation
          ? `<button class="button button--secondary" data-workflow-action="reject-cancellation" data-task-id="${escapeHtml(task.id)}">Απόρριψη αιτήματος ακύρωσης</button>`
          : ""
      }
    </div>
  `;
}

export function TaskDetail({ task, activeTab, permissions, currentRoleLabel, currentUserName, validationComment, cancellationComment }) {
  const tabs = [
    ["main", "Κύριος"],
    ["photos", "Φωτογραφίες"],
    ["files", "Αρχεία"],
    ["materials", "Υλικά"],
    ["floors", "Floors"],
    ["safety", "Health & Safety"],
    ["history", "Ιστορία"],
    ["system", "Σύστημα"]
  ];

  return `
    <section class="detail-view">
      <div class="detail-header surface">
        <div class="detail-header__top">
          <button class="link-button" data-route="#/tasks">← Πίσω στη λίστα</button>
          <div class="detail-header__pills">
            <span class="pill pill--${escapeHtml(PIPELINE_META[task.pipeline]?.tone || "pipeline-autopsia")}">${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</span>
            <span class="pill pill--${escapeHtml(STATUS_META[task.status].tone)}">${escapeHtml(STATUS_META[task.status].label)}</span>
          </div>
        </div>

        <div class="detail-header__title">
          <div>
            <p class="eyebrow">Task Workspace</p>
            <h1>${escapeHtml(task.title)}</h1>
            <p>${escapeHtml(task.address)} · ${escapeHtml(task.city)} · ${escapeHtml(task.srId)} · Pipeline: ${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</p>
          </div>
          <div class="detail-summary">
            <article><span>Ρόλος</span><strong>${escapeHtml(currentRoleLabel)}</strong></article>
            <article><span>Χρήστης</span><strong>${escapeHtml(currentUserName)}</strong></article>
            <article><span>Τελευταία ενημέρωση</span><strong>${formatCompactDateTime(task.updatedAt)}</strong></article>
          </div>
        </div>

        <div class="workflow-header">
          <div>
            <p class="eyebrow">Current Pipeline</p>
            <h3>${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</h3>
          </div>
          <p>${escapeHtml(PIPELINE_META[task.pipeline]?.hint || "")}</p>
        </div>

        <div class="workflow-strip">
          ${STATUS_ORDER.map((status, index) => {
            const activeIndex = STATUS_ORDER.indexOf(task.status);
            const state = index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending";
            return `
              <article class="workflow-step workflow-step--${state}">
                <span>${icon(STATUS_META[status].icon)}</span>
                <strong>${escapeHtml(STATUS_META[status].label)}</strong>
              </article>
            `;
          }).join("")}
        </div>
      </div>

      <div class="detail-layout">
        <div class="detail-main">
          <div class="tabs">
            ${tabs
              .map(
                ([value, label]) => `
                  <button class="tab-button${activeTab === value ? " is-active" : ""}" data-tab="${escapeHtml(value)}">
                    ${escapeHtml(label)}
                  </button>
                `
              )
              .join("")}
          </div>

          ${renderTabContent(task, activeTab, permissions)}
        </div>

        <aside class="detail-side surface">
          <div class="detail-side__section">
            <h3>Execution snapshot</h3>
            <dl class="mini-spec">
              <div><dt>Pipeline</dt><dd>${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</dd></div>
              <div><dt>Project</dt><dd>${escapeHtml(task.projectName)}</dd></div>
              <div><dt>SR ID</dt><dd>${escapeHtml(task.srId)}</dd></div>
              <div><dt>BID</dt><dd>${escapeHtml(task.bid)}</dd></div>
              <div><dt>Πελάτης</dt><dd>${escapeHtml(task.customerName || "-")}</dd></div>
              <div><dt>Team</dt><dd>${escapeHtml(task.resourceTeam)}</dd></div>
              <div><dt>Partner</dt><dd>${escapeHtml(task.assignedUserName || "Δεν έχει ανατεθεί")}</dd></div>
              <div><dt>Δημιουργήθηκε</dt><dd>${formatCompactDateTime(task.createdAt)}</dd></div>
              <div><dt>Ημέρες ανοιχτό</dt><dd>${formatElapsedDays(task.createdAt, task.completedAt)}</dd></div>
              <div><dt>Ανάθεση</dt><dd>${task.assignedAt ? formatCompactDateTime(task.assignedAt) : "Δεν έχει ανατεθεί"}</dd></div>
              <div><dt>Από ανάθεση</dt><dd>${task.assignedAt ? formatElapsedDays(task.assignedAt, task.completedAt) : "Δεν έχει ανατεθεί"}</dd></div>
              <div><dt>Window</dt><dd>${task.startDate ? formatCompactDateTime(task.startDate) : "Δεν ορίστηκε"}</dd></div>
              <div><dt>API</dt><dd>${escapeHtml(task.flags.apiStatus)}</dd></div>
              <div><dt>Smart readiness</dt><dd>${escapeHtml(task.flags.smartReadiness)}</dd></div>
            </dl>
          </div>

          ${renderWorkflowActions(task, permissions, validationComment, cancellationComment)}

          <div class="detail-side__section">
            <h3>Uploads</h3>
            <div class="stat-line"><span>Φωτογραφίες</span><strong>${task.photos.length}</strong></div>
            <div class="stat-line"><span>Αρχεία</span><strong>${task.files.length}</strong></div>
            <div class="stat-line"><span>Υλικά</span><strong>${task.materials.length}</strong></div>
          </div>
        </aside>
      </div>
    </section>
  `;
}
