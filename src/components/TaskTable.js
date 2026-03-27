import { STATUS_META } from "../data/mockData.js";
import { escapeHtml, formatDate } from "../lib/helpers.js";

export function TaskTable({ tasks, filters, cities, technicians }) {
  const technicianMap = new Map(technicians.map((technician) => [technician.id, technician.name]));

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
          <input type="search" placeholder="Διεύθυνση, έργο, SR, partner..." value="${escapeHtml(filters.search)}" data-filter="search" />
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
          <span>Πόλη</span>
          <select data-filter="city">
            <option value="all"${filters.city === "all" ? " selected" : ""}>Όλες</option>
            ${cities.map((city) => `<option value="${escapeHtml(city)}"${filters.city === city ? " selected" : ""}>${escapeHtml(city)}</option>`).join("")}
          </select>
        </label>

        <label class="field">
          <span>Partner</span>
          <select data-filter="technician">
            <option value="all"${filters.technician === "all" ? " selected" : ""}>Όλοι</option>
            ${technicians
              .map(
                (technician) =>
                  `<option value="${escapeHtml(technician.id)}"${filters.technician === technician.id ? " selected" : ""}>${escapeHtml(technician.name)}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Τοποθεσία</th>
              <th>Πόλη</th>
              <th>Project ID</th>
              <th>Ανατέθηκε σε</th>
              <th>Κατάσταση</th>
              <th>Προγραμματισμός</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .map((task) => {
                const meta = STATUS_META[task.status];
                return `
                  <tr class="task-row" data-open-task="${escapeHtml(task.id)}">
                    <td>
                      <div class="table-primary">${escapeHtml(task.address)}</div>
                      <div class="table-secondary">${escapeHtml(task.projectName)}</div>
                    </td>
                    <td>${escapeHtml(task.city)}</td>
                    <td>
                      <div class="table-primary">${escapeHtml(task.projectId)}</div>
                      <div class="table-secondary">${escapeHtml(task.serviceRequestId)}</div>
                    </td>
                    <td>
                      <div class="table-primary">${escapeHtml(task.assignedUserName || "Διαθέσιμη για ανάληψη")}</div>
                      <div class="table-secondary">${escapeHtml(
                        task.assignedUserName
                          ? task.resourceTeam
                          : `Επιτρέπεται σε partners: ${task.allowedTechnicianIds.map((id) => technicianMap.get(id)).filter(Boolean).join(", ")}`
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
