import { getDefaultLeitourgiesInwnStage, LEITOURGIES_INWN_STAGE_META, PIPELINE_META, STATUS_META } from "../data/mockData.js";
import { escapeHtml, formatDate } from "../lib/helpers.js";

export function TaskTable({ tasks, filters, cities, pipelines, technicians, currentRole }) {
  return `
    <section class="surface">
      <div class="section-head">
        <div>
          <p class="eyebrow">Task Management</p>
          <h2>Λίστα εργασιών</h2>
        </div>
        <p class="section-copy">Αναζήτηση, φιλτράρισμα και πλοήγηση στην κύρια καρτέλα εργασίας.</p>
      </div>

      <div class="filter-bar">
        <label class="field">
          <span>Αναζήτηση</span>
          <input type="search" placeholder="Διεύθυνση, SR ID, BID, πελάτης..." value="${escapeHtml(filters.search)}" data-filter="search" />
        </label>

        <label class="field">
          <span>Κατάσταση</span>
          <select data-filter="status">
            <option value="all"${filters.status === "all" ? " selected" : ""}>Όλες</option>
            ${Object.entries(STATUS_META)
              .map(([value, meta]) => `<option value="${value}"${filters.status === value ? " selected" : ""}>${escapeHtml(meta.label)}</option>`)
              .join("")}
          </select>
        </label>

        <label class="field">
          <span>Pipeline</span>
          <select data-filter="pipeline">
            <option value="all"${filters.pipeline === "all" ? " selected" : ""}>Όλα</option>
            ${pipelines
              .map((pipeline) => `<option value="${escapeHtml(pipeline)}"${filters.pipeline === pipeline ? " selected" : ""}>${escapeHtml(PIPELINE_META[pipeline].label)}</option>`)
              .join("")}
          </select>
        </label>

        <label class="field">
          <span>Πόλη</span>
          <select data-filter="city">
            <option value="all"${filters.city === "all" ? " selected" : ""}>Όλες</option>
            ${cities.map((city) => `<option value="${escapeHtml(city)}"${filters.city === city ? " selected" : ""}>${escapeHtml(city)}</option>`).join("")}
          </select>
        </label>

        ${
          currentRole === "admin"
            ? `
              <label class="field">
                <span>Ανάθεση</span>
                <select data-filter="technician">
                  <option value="all"${filters.technician === "all" ? " selected" : ""}>Όλοι</option>
                  <option value="unassigned"${filters.technician === "unassigned" ? " selected" : ""}>Χωρίς ανάθεση</option>
                  ${technicians
                    .map(
                      (technician) =>
                        `<option value="${escapeHtml(technician.id)}"${filters.technician === technician.id ? " selected" : ""}>${escapeHtml(technician.name)}</option>`
                    )
                    .join("")}
                </select>
              </label>
            `
            : ""
        }
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Τοποθεσία</th>
              <th>Πόλη</th>
              <th>Pipeline</th>
              <th>SR ID / BID</th>
              <th>Ανατέθηκε σε</th>
              <th>Κατάσταση</th>
              <th>Προγραμματισμός</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .map((task) => {
                const meta = STATUS_META[task.status];
                const fiberStageLabel =
                  task.pipeline === "leitourgies_inwn"
                    ? LEITOURGIES_INWN_STAGE_META[task.fiberStageKey || getDefaultLeitourgiesInwnStage(task.serviceProvider)]?.label || "-"
                    : "";
                return `
                  <tr class="task-row" data-open-task="${escapeHtml(task.id)}">
                    <td>
                      <div class="table-primary">${escapeHtml(task.address)}</div>
                      <div class="table-secondary">${escapeHtml(task.projectName)} · ${escapeHtml(task.customerName || "-")}</div>
                    </td>
                    <td>${escapeHtml(task.city)}</td>
                    <td>
                      <div class="table-primary">
                        <span class="pill pill--${escapeHtml(PIPELINE_META[task.pipeline]?.tone || "pipeline-autopsia")}">${escapeHtml(
                          PIPELINE_META[task.pipeline]?.label || "Αυτοψία"
                        )}</span>
                      </div>
                      <div class="table-secondary">${escapeHtml(fiberStageLabel || "—")}</div>
                    </td>
                    <td>
                      <div class="table-primary">${escapeHtml(task.srId)}</div>
                      <div class="table-secondary">${escapeHtml(task.bid)}</div>
                    </td>
                    <td>
                      <div class="table-primary">${escapeHtml(task.assignedUserName || "Δεν έχει ανατεθεί")}</div>
                      <div class="table-secondary">${escapeHtml(
                        task.flags?.cancellationRequested
                          ? `Αίτημα ακύρωσης σε εκκρεμότητα · ${task.resourceTeam}`
                          : task.assignedUserName
                            ? task.resourceTeam
                            : "Αναμονή ανάθεσης από admin"
                      )}</div>
                    </td>
                    <td><span class="pill pill--${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span></td>
                    <td>${task.startDate ? formatDate(task.startDate) : "Δεν ορίστηκε"}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
