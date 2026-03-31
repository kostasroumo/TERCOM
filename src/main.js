import { TaskCard } from "./components/TaskCard.js";
import { TaskDetail } from "./components/TaskDetail.js";
import { TaskTable } from "./components/TaskTable.js";
import { createInitialState, ROLE_LABELS, STATUS_META, STATUS_ORDER, TECHNICIANS, USER_DIRECTORY } from "./data/mockData.js";
import { countByStatus, createId, deepClone, escapeHtml, formatDateTime, formatElapsedDays, icon } from "./lib/helpers.js";

const STORAGE_KEY = "birol-field-ops-prototype-v5";
const app = document.querySelector("#app");

let state = loadState();

if (!window.location.hash) {
  window.location.hash = "#/dashboard";
}

window.addEventListener("hashchange", render);
document.addEventListener("click", handleClick);
document.addEventListener("change", handleChange);
document.addEventListener("input", handleInput);
document.addEventListener("submit", handleSubmit);

render();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return normalizeState(createInitialState());
    }

    const parsed = JSON.parse(raw);
    parsed.ui = {
      activeTab: "main",
      showCreateModal: false,
      validationComment: "",
      cancellationComment: "",
      exportReturnRoute: "#/dashboard",
      reportAutoPrint: false,
      ...parsed.ui
    };
    parsed.filters ||= { search: "", status: "all", city: "all", technician: "all" };
    return normalizeState(parsed);
  } catch {
    return normalizeState(createInitialState());
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota failures for the prototype.
  }
}

function confirmAction(message) {
  return window.confirm(message);
}

function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");

  if (!hash || hash === "dashboard") {
    return { view: "dashboard" };
  }

  if (hash === "tasks") {
    return { view: "tasks" };
  }

  if (hash === "reports/open-tasks") {
    return { view: "report", reportType: "open-tasks" };
  }

  if (hash.startsWith("tasks/")) {
    return {
      view: "detail",
      taskId: decodeURIComponent(hash.slice("tasks/".length))
    };
  }

  return { view: "dashboard" };
}

function getCurrentRoleUsers() {
  return USER_DIRECTORY[state.currentRole];
}

function getCurrentUser() {
  return getCurrentRoleUsers().find((user) => user.id === state.currentUserId) || getCurrentRoleUsers()[0];
}

function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function normalizeTask(task) {
  return {
    ...task,
    customerName: task.customerName || "",
    mobilePhone: task.mobilePhone || "",
    landlinePhone: task.landlinePhone || "",
    srId: task.srId || task.projectId || "",
    bid: task.bid || task.serviceRequestId || "",
    assignedAt: task.assignedAt || (task.assignedUserId ? task.startDate || task.createdAt || "" : ""),
    completedAt: task.completedAt || (task.status === "completed" ? task.endDate || task.updatedAt || "" : ""),
    flags: {
      apiStatus: task.flags?.apiStatus || "LOCAL-ONLY",
      validationLock: !!task.flags?.validationLock,
      openIssues: !!task.flags?.openIssues,
      smartReadiness: task.flags?.smartReadiness || "Σε αναμονή",
      cancellationRequested: !!task.flags?.cancellationRequested,
      cancellationRequestedAt: task.flags?.cancellationRequestedAt || "",
      cancellationRequestedBy: task.flags?.cancellationRequestedBy || "",
      cancellationReason: task.flags?.cancellationReason || ""
    },
    assignedUserId: task.assignedUserId || "",
    assignedUserName: task.assignedUserName || ""
  };
}

function normalizeState(sourceState) {
  const normalizedRole = USER_DIRECTORY[sourceState.currentRole]
    ? sourceState.currentRole
    : sourceState.currentRole === "technician"
      ? "partner"
      : "admin";
  const normalizedUserId = USER_DIRECTORY[normalizedRole]?.some((user) => user.id === sourceState.currentUserId)
    ? sourceState.currentUserId
    : USER_DIRECTORY[normalizedRole]?.[0]?.id;

  return {
    ...sourceState,
    currentRole: normalizedRole,
    currentUserId: normalizedUserId,
    tasks: (sourceState.tasks || []).map(normalizeTask)
  };
}

function getVisibleTasks() {
  if (state.currentRole !== "partner") {
    return state.tasks;
  }

  const currentUser = getCurrentUser();
  return state.tasks.filter((task) => task.assignedUserId === currentUser.id);
}

function getPermissions(task) {
  const currentUser = getCurrentUser();
  const isAdmin = state.currentRole === "admin";
  const isAssignedPartner = state.currentRole === "partner" && currentUser.id === task.assignedUserId;

  return {
    canEditCore: isAdmin,
    canManageAssignment: isAdmin,
    canEditStatusDirectly: isAdmin,
    canEditNotes: isAdmin || isAssignedPartner,
    canUploadPhotos: isAdmin || isAssignedPartner,
    canUploadFiles: isAdmin || isAssignedPartner,
    canAddMaterials: isAdmin || isAssignedPartner,
    canEditSafety: isAdmin || isAssignedPartner,
    canScheduleVisit: isAssignedPartner && ["assigned", "scheduled"].includes(task.status),
    canStart: (isAdmin || isAssignedPartner) && task.status === "scheduled",
    canSubmitValidation: (isAdmin || isAssignedPartner) && task.status === "in_progress",
    canApprove: isAdmin && task.status === "pending_validation",
    canReject: isAdmin && task.status === "pending_validation",
    canRequestCancellation: isAssignedPartner && task.status === "in_progress" && !task.flags.cancellationRequested,
    canApproveCancellation: isAdmin && !!task.flags.cancellationRequested,
    canRejectCancellation: isAdmin && !!task.flags.cancellationRequested
  };
}

function canCreateTasks() {
  return state.currentRole === "admin";
}

function getFilteredTasks() {
  return getVisibleTasks().filter((task) => {
    const searchText = state.filters.search.trim().toLowerCase();
    const matchesSearch =
      !searchText ||
      [
        task.title,
        task.address,
        task.city,
        task.srId,
        task.bid,
        task.customerName,
        task.mobilePhone,
        task.landlinePhone,
        task.assignedUserName,
        task.projectName
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);

    const matchesStatus = state.filters.status === "all" || task.status === state.filters.status;
    const matchesCity = state.filters.city === "all" || task.city === state.filters.city;
    const matchesTechnician = state.filters.technician === "all" || task.assignedUserId === state.filters.technician;

    return matchesSearch && matchesStatus && matchesCity && matchesTechnician;
  });
}

function render() {
  const route = getRoute();
  const visibleTasks = getVisibleTasks();
  const filteredTasks = getFilteredTasks();
  const currentUser = getCurrentUser();

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand__mark">${icon("dashboard")}</div>
          <div>
            <strong>Field Ops Control</strong>
            <span>Enterprise workflow prototype</span>
          </div>
        </div>

        <nav class="nav">
          <button class="nav-link${route.view === "dashboard" ? " is-active" : ""}" data-route="#/dashboard">
            <span>${icon("dashboard")}</span>
            <span>Dashboard</span>
          </button>
          <button class="nav-link${route.view === "tasks" || route.view === "detail" ? " is-active" : ""}" data-route="#/tasks">
            <span>${icon("tasks")}</span>
            <span>Εργασίες</span>
          </button>
          <button class="nav-link nav-link--action${route.view === "report" ? " is-active" : ""}" data-export-open-pdf>
            <span>${icon("print")}</span>
            <span>Export PDF</span>
          </button>
        </nav>
      </aside>

      <main class="workspace">
        <header class="topbar surface">
          <div>
            <p class="eyebrow">Operational View</p>
            <h1>${route.view === "dashboard" ? "Κέντρο ελέγχου εργασιών πεδίου" : route.view === "tasks" ? "Διαχείριση εργασιών" : route.view === "report" ? "Αναφορά ανοιχτών εργασιών" : "Καρτέλα εργασίας"}</h1>
          </div>

          <div class="topbar__controls">
            <label class="field field--compact">
              <span>Ρόλος</span>
              <select data-role-switch>
                ${Object.entries(ROLE_LABELS)
                  .map(([value, label]) => `<option value="${value}"${state.currentRole === value ? " selected" : ""}>${escapeHtml(label)}</option>`)
                  .join("")}
              </select>
            </label>

            <label class="field field--compact">
              <span>Χρήστης</span>
              <select data-user-switch>
                ${getCurrentRoleUsers()
                  .map((user) => `<option value="${user.id}"${state.currentUserId === user.id ? " selected" : ""}>${escapeHtml(user.name)}</option>`)
                  .join("")}
              </select>
            </label>

            ${canCreateTasks() ? `<button class="button button--secondary" data-open-create>Νέα εργασία</button>` : ""}
            <button class="button button--ghost" data-reset-demo>Reset demo</button>
          </div>
        </header>

        ${renderView(route, visibleTasks, filteredTasks, currentUser)}
      </main>
    </div>

    ${state.ui.showCreateModal ? renderCreateModal() : ""}
  `;

  if (route.view === "report" && state.ui.reportAutoPrint) {
    state.ui.reportAutoPrint = false;
    saveState();
    window.setTimeout(() => window.print(), 120);
  }
}

function renderView(route, visibleTasks, filteredTasks, currentUser) {
  if (route.view === "report") {
    return renderOpenTasksReport(visibleTasks.filter((task) => task.status !== "completed"));
  }

  if (route.view === "tasks") {
    const cities = [...new Set(visibleTasks.map((task) => task.city))].sort((a, b) => a.localeCompare(b, "el"));
    return TaskTable({
      tasks: filteredTasks,
      filters: state.filters,
      cities,
      technicians: TECHNICIANS,
      currentRole: state.currentRole
    });
  }

  if (route.view === "detail") {
    const task = getTaskById(route.taskId);
    if (!task) {
      return `
        <section class="surface empty-screen">
          <h2>Η εργασία δεν βρέθηκε</h2>
          <button class="button" data-route="#/tasks">Επιστροφή στη λίστα</button>
        </section>
      `;
    }

    if (state.currentRole === "partner" && !visibleTasks.some((visibleTask) => visibleTask.id === task.id)) {
      return `
        <section class="surface empty-screen">
          <h2>Δεν έχεις πρόσβαση σε αυτή την εργασία</h2>
          <p>Η εργασία δεν σου έχει ανατεθεί από τον admin.</p>
          <button class="button" data-route="#/tasks">Επιστροφή στη λίστα</button>
        </section>
      `;
    }

    return TaskDetail({
      task,
      activeTab: state.ui.activeTab,
      permissions: getPermissions(task),
      currentRoleLabel: ROLE_LABELS[state.currentRole],
      currentUserName: currentUser.name,
      validationComment: state.ui.validationComment,
      cancellationComment: state.ui.cancellationComment
    });
  }

  const counts = STATUS_ORDER.map((status) => [status, countByStatus(visibleTasks, status)]);

  return `
    <section class="status-grid">
      ${counts.map(([status, count]) => TaskCard(status, count)).join("")}
    </section>
  `;
}

function renderOpenTasksReport(openTasks) {
  if (!openTasks.length) {
    return `
      <section class="surface report-screen">
        <div class="report-toolbar">
          <button class="button button--ghost" data-route="${escapeHtml(state.ui.exportReturnRoute || "#/dashboard")}">Επιστροφή</button>
        </div>
        <div class="empty-state">
          <h2>Δεν υπάρχουν ανοιχτές εργασίες</h2>
          <p>Δεν βρέθηκαν εργασίες για εξαγωγή στο τρέχον scope του χρήστη.</p>
        </div>
      </section>
    `;
  }

  const renderedTasks = openTasks
    .map((task) => {
      const statusLabel = STATUS_META[task.status]?.label || task.status;

      return `
        <article class="report-card">
          <div class="report-card__head">
            <div>
              <span class="report-eyebrow">${escapeHtml(task.id)}</span>
              <h2>${escapeHtml(task.title)}</h2>
            </div>
            <span class="report-pill">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="report-grid">
            <div><strong>Διεύθυνση</strong><span>${escapeHtml(task.address)}</span></div>
            <div><strong>Πόλη</strong><span>${escapeHtml(task.city)}</span></div>
            <div><strong>Πελάτης</strong><span>${escapeHtml(task.customerName || "-")}</span></div>
            <div><strong>Κινητό</strong><span>${escapeHtml(task.mobilePhone || "-")}</span></div>
            <div><strong>Σταθερό</strong><span>${escapeHtml(task.landlinePhone || "-")}</span></div>
            <div><strong>Project</strong><span>${escapeHtml(task.projectName)}</span></div>
            <div><strong>SR ID</strong><span>${escapeHtml(task.srId)}</span></div>
            <div><strong>BID</strong><span>${escapeHtml(task.bid)}</span></div>
            <div><strong>Team</strong><span>${escapeHtml(task.resourceTeam)}</span></div>
            <div><strong>Ανατέθηκε σε</strong><span>${escapeHtml(task.assignedUserName || "Δεν έχει ανατεθεί")}</span></div>
            <div><strong>Assigned at</strong><span>${task.assignedAt ? escapeHtml(formatDateTime(task.assignedAt)) : "Δεν έχει ανατεθεί"}</span></div>
            <div><strong>Από δημιουργία</strong><span>${escapeHtml(formatElapsedDays(task.createdAt, task.completedAt))}</span></div>
            <div><strong>Από ανάθεση</strong><span>${escapeHtml(task.assignedAt ? formatElapsedDays(task.assignedAt, task.completedAt) : "Δεν έχει ανατεθεί")}</span></div>
            <div><strong>Έναρξη</strong><span>${escapeHtml(formatDateTime(task.startDate))}</span></div>
            <div><strong>Λήξη</strong><span>${escapeHtml(formatDateTime(task.endDate))}</span></div>
            <div><strong>Created</strong><span>${escapeHtml(task.createdBy)} · ${escapeHtml(formatDateTime(task.createdAt))}</span></div>
            <div><strong>Updated</strong><span>${escapeHtml(task.updatedBy)} · ${escapeHtml(formatDateTime(task.updatedAt))}</span></div>
          </div>
          <div class="report-notes">
            <strong>Σημειώσεις</strong>
            <p>${escapeHtml(task.notes || "Δεν υπάρχουν σημειώσεις.")}</p>
          </div>
          <div class="report-metrics">
            <span>Φωτογραφίες: ${task.photos.length}</span>
            <span>Αρχεία: ${task.files.length}</span>
            <span>Υλικά: ${task.materials.length}</span>
            <span>Safety items: ${task.safety.length}</span>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="surface report-screen">
      <div class="report-toolbar">
        <button class="button button--ghost" data-route="${escapeHtml(state.ui.exportReturnRoute || "#/dashboard")}">Επιστροφή</button>
        <button class="button" data-print-report>Εκτύπωση / Save as PDF</button>
      </div>

      <header class="report-header">
        <div>
          <p class="eyebrow">Export View</p>
          <h2>Αναφορά ανοιχτών εργασιών</h2>
        </div>
        <p>Ημερομηνία εξαγωγής: ${escapeHtml(formatDateTime(new Date().toISOString()))} · Σύνολο: ${openTasks.length}</p>
      </header>

      <section class="report-list">${renderedTasks}</section>
    </section>
  `;
}

function openOpenTasksReport() {
  const openTasks = getVisibleTasks().filter((task) => task.status !== "completed");

  if (!openTasks.length) {
    window.alert("Δεν υπάρχουν ανοιχτές εργασίες για εξαγωγή.");
    return;
  }

  const currentHash = window.location.hash || "#/dashboard";
  state.ui.exportReturnRoute = currentHash.startsWith("#/reports/")
    ? state.ui.exportReturnRoute || "#/dashboard"
    : currentHash;
  state.ui.reportAutoPrint = true;
  saveState();
  window.location.hash = "#/reports/open-tasks";
}

function renderCreateModal() {
  return `
    <div class="modal-backdrop">
      <div class="modal surface">
        <div class="section-head">
          <div>
            <p class="eyebrow">Create Task</p>
            <h2>Νέα εργασία πεδίου</h2>
          </div>
          <button class="icon-button" data-close-modal>×</button>
        </div>

        <form class="form-grid" data-create-task-form>
          <div class="field">
            <span>Τίτλος</span>
            <input name="title" placeholder="π.χ. Αυτοψία readiness" required />
          </div>
          <div class="field">
            <span>Είδος</span>
            <select name="type">
              <option value="survey">Αυτοψία</option>
              <option value="installation">Εγκατάσταση</option>
              <option value="repair">Επισκευή</option>
            </select>
          </div>
          <div class="field">
            <span>Project</span>
            <input name="projectName" required />
          </div>
          <div class="field">
            <span>SR ID</span>
            <input name="srId" required />
          </div>
          <div class="field">
            <span>BID</span>
            <input name="bid" required />
          </div>
          <div class="field">
            <span>Team</span>
            <input name="resourceTeam" placeholder="π.χ. Fiber Survey Crew A" required />
          </div>
          <div class="field">
            <span>Προγραμματισμός</span>
            <input type="datetime-local" name="startDate" />
          </div>
          <div class="field">
            <span>Ονοματεπώνυμο πελάτη</span>
            <input name="customerName" required />
          </div>
          <div class="field">
            <span>Κινητό</span>
            <input name="mobilePhone" required />
          </div>
          <div class="field">
            <span>Σταθερό (προαιρετικό)</span>
            <input name="landlinePhone" />
          </div>
          <div class="field">
            <span>Διεύθυνση</span>
            <input name="address" required />
          </div>
          <div class="field">
            <span>Πόλη</span>
            <input name="city" required />
          </div>
          <div class="field field--wide">
            <span>Σημειώσεις</span>
            <textarea name="notes" rows="5"></textarea>
          </div>
          <div class="form-actions">
            <button class="button" type="submit">Δημιουργία</button>
            <button class="button button--ghost" type="button" data-close-modal>Ακύρωση</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function handleClick(event) {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    const nextRoute = routeTarget.getAttribute("data-route");
    const filterStatus = routeTarget.getAttribute("data-filter-status");
    if (filterStatus) {
      state.filters.status = filterStatus;
      saveState();
    }
    if (nextRoute?.startsWith("#/tasks") || nextRoute?.startsWith("#/dashboard")) {
      state.ui.validationComment = "";
      state.ui.cancellationComment = "";
      saveState();
    }
    window.location.hash = nextRoute;
    return;
  }

  if (event.target.closest("[data-export-open-pdf]")) {
    openOpenTasksReport();
    return;
  }

  if (event.target.closest("[data-print-report]")) {
    window.print();
    return;
  }

  const taskTarget = event.target.closest("[data-open-task]");
  if (taskTarget) {
    state.ui.activeTab = "main";
    state.ui.validationComment = "";
    state.ui.cancellationComment = "";
    saveState();
    window.location.hash = `#/tasks/${encodeURIComponent(taskTarget.getAttribute("data-open-task"))}`;
    return;
  }

  const tabTarget = event.target.closest("[data-tab]");
  if (tabTarget) {
    state.ui.activeTab = tabTarget.getAttribute("data-tab");
    saveState();
    render();
    return;
  }

  if (event.target.closest("[data-open-create]")) {
    if (!canCreateTasks()) {
      return;
    }
    state.ui.showCreateModal = true;
    saveState();
    render();
    return;
  }

  if (event.target.closest("[data-close-modal]")) {
    state.ui.showCreateModal = false;
    saveState();
    render();
    return;
  }

  if (event.target.closest("[data-reset-demo]")) {
    state = createInitialState();
    saveState();
    window.location.hash = "#/dashboard";
    render();
    return;
  }

  const workflowTarget = event.target.closest("[data-workflow-action]");
  if (workflowTarget) {
    handleWorkflow(workflowTarget.getAttribute("data-task-id"), workflowTarget.getAttribute("data-workflow-action"));
  }
}

function handleChange(event) {
  if (event.target.matches("[data-role-switch]")) {
    state.currentRole = event.target.value;
    state.currentUserId = USER_DIRECTORY[state.currentRole][0].id;
    if (!canCreateTasks()) {
      state.ui.showCreateModal = false;
    }
    state.ui.validationComment = "";
    state.ui.cancellationComment = "";
    saveState();
    render();
    return;
  }

  if (event.target.matches("[data-user-switch]")) {
    state.currentUserId = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.matches("[data-filter]")) {
    state.filters[event.target.getAttribute("data-filter")] = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.matches("[data-photo-input]")) {
    handlePhotoUpload(event.target);
    return;
  }

  if (event.target.matches("[data-file-input]")) {
    handleFileUpload(event.target);
  }
}

function handleInput(event) {
  if (event.target.matches("[data-filter='search']")) {
    state.filters.search = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.matches("[data-validation-comment]")) {
    state.ui.validationComment = event.target.value;
    saveState();
    return;
  }

  if (event.target.matches("[data-cancellation-comment]")) {
    state.ui.cancellationComment = event.target.value;
    saveState();
  }
}

function handleSubmit(event) {
  const createForm = event.target.closest("[data-create-task-form]");
  if (createForm) {
    event.preventDefault();
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να δημιουργήσετε τη νέα εργασία;")) {
      return;
    }
    createTaskFromForm(new FormData(createForm));
    return;
  }

  const mainForm = event.target.closest("[data-task-main-form]");
  if (mainForm) {
    event.preventDefault();
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να αποθηκεύσετε τις αλλαγές της εργασίας;")) {
      return;
    }
    updateTaskCore(mainForm.getAttribute("data-task-main-form"), new FormData(mainForm));
    return;
  }

  const materialForm = event.target.closest("[data-material-form]");
  if (materialForm) {
    event.preventDefault();
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να αποθηκεύσετε το νέο υλικό;")) {
      return;
    }
    addMaterial(materialForm.getAttribute("data-material-form"), new FormData(materialForm));
    return;
  }

  const safetyForm = event.target.closest("[data-safety-form]");
  if (safetyForm) {
    event.preventDefault();
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να αποθηκεύσετε το Health & Safety survey;")) {
      return;
    }
    updateSafety(safetyForm.getAttribute("data-safety-form"), new FormData(safetyForm));
  }
}

function commitTaskChange(taskId, mutateTask, summary, details) {
  const currentUser = getCurrentUser();
  state.tasks = state.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    const nextTask = deepClone(task);
    mutateTask(nextTask);
    nextTask.updatedAt = new Date().toISOString();
    nextTask.updatedBy = currentUser.name;
    nextTask.history.unshift({
      id: createId("HIST"),
      author: currentUser.name,
      at: nextTask.updatedAt,
      summary,
      details
    });
    return nextTask;
  });

  saveState();
  render();
}

function createTaskFromForm(formData) {
  const currentUser = getCurrentUser();
  const startDate = formData.get("startDate");
  const createdAt = new Date().toISOString();

  const newTask = {
    id: createId("TASK"),
    title: formData.get("title"),
    type: formData.get("type"),
    status: "unassigned",
    address: formData.get("address"),
    city: formData.get("city"),
    customerName: formData.get("customerName"),
    mobilePhone: formData.get("mobilePhone"),
    landlinePhone: formData.get("landlinePhone"),
    srId: formData.get("srId"),
    bid: formData.get("bid"),
    projectName: formData.get("projectName"),
    resourceTeam: formData.get("resourceTeam"),
    assignedAt: "",
    completedAt: "",
    assignedUserId: "",
    assignedUserName: "",
    startDate,
    endDate: "",
    notes: formData.get("notes"),
    createdAt,
    createdBy: currentUser.name,
    updatedAt: createdAt,
    updatedBy: currentUser.name,
    flags: {
      apiStatus: "LOCAL-ONLY",
      validationLock: false,
      openIssues: false,
      smartReadiness: "Σε αναμονή",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationReason: ""
    },
    photos: [],
    files: [],
    history: [
      {
        id: createId("HIST"),
        author: currentUser.name,
        at: createdAt,
        summary: "Δημιουργία εργασίας",
        details: "Η εργασία δημιουργήθηκε και περιμένει ανάθεση από τον admin."
      }
    ],
    materials: [],
    floors: [{ id: createId("FL"), level: "Ισόγειο", units: 1, access: "Ελεύθερη", riser: "Κύριος" }],
    safety: [{ id: createId("SAFE"), item: "Γενικός έλεγχος πρόσβασης", status: "needs-review", note: "Νέα εγγραφή" }]
  };

  state.tasks.unshift(newTask);
  state.ui.showCreateModal = false;
  state.ui.activeTab = "main";
  saveState();
  window.location.hash = `#/tasks/${encodeURIComponent(newTask.id)}`;
  render();
}

function updateTaskCore(taskId, formData) {
  const nextValues = Object.fromEntries(formData.entries());
  const assignedUserId = nextValues.assignedUserId || "";
  const assignedUser = TECHNICIANS.find((user) => user.id === assignedUserId);
  const isPartnerEditor = state.currentRole === "partner";

  commitTaskChange(
    taskId,
    (task) => {
      let assignmentChanged = false;
      let partnerScheduledVisit = false;

      if (nextValues.title !== undefined) {
        task.title = nextValues.title;
      }

      if (nextValues.type !== undefined) {
        task.type = nextValues.type;
      }

      if (nextValues.projectName !== undefined) {
        task.projectName = nextValues.projectName;
      }

      if (nextValues.srId !== undefined) {
        task.srId = nextValues.srId;
      }

      if (nextValues.bid !== undefined) {
        task.bid = nextValues.bid;
      }

      if (nextValues.customerName !== undefined) {
        task.customerName = nextValues.customerName;
      }

      if (nextValues.mobilePhone !== undefined) {
        task.mobilePhone = nextValues.mobilePhone;
      }

      if (nextValues.landlinePhone !== undefined) {
        task.landlinePhone = nextValues.landlinePhone;
      }

      if (nextValues.resourceTeam !== undefined) {
        task.resourceTeam = nextValues.resourceTeam;
      }

      if (nextValues.address !== undefined) {
        task.address = nextValues.address;
      }

      if (nextValues.city !== undefined) {
        task.city = nextValues.city;
      }

      if (nextValues.notes !== undefined) {
        task.notes = nextValues.notes;
      }

      if (nextValues.startDate !== undefined) {
        const previousStartDate = task.startDate || "";
        task.startDate = nextValues.startDate;
        if (isPartnerEditor && nextValues.startDate && nextValues.startDate !== previousStartDate) {
          partnerScheduledVisit = true;
        }
      }

      if (nextValues.endDate !== undefined) {
        task.endDate = nextValues.endDate;
      }

      if (nextValues.assignedUserId !== undefined && assignedUser) {
        assignmentChanged = task.assignedUserId !== assignedUser.id;
        task.assignedUserId = assignedUser.id;
        task.assignedUserName = assignedUser.name;
        if (assignmentChanged || !task.assignedAt) {
          task.assignedAt = new Date().toISOString();
        }
      } else if (nextValues.assignedUserId !== undefined) {
        task.assignedUserId = "";
        task.assignedUserName = "";
        task.assignedAt = "";
      }

      if (state.currentRole === "admin" && nextValues.status && !["scheduled", "in_progress"].includes(nextValues.status)) {
        task.status = nextValues.status;
      }

      if (["unassigned", "assigned", "scheduled"].includes(task.status)) {
        if (!task.assignedUserId) {
          task.status = "unassigned";
        } else if (assignmentChanged || task.status === "unassigned") {
          task.status = "assigned";
        } else if (task.status === "scheduled" && !task.startDate) {
          task.status = "assigned";
        } else if (partnerScheduledVisit && task.startDate) {
          task.status = "scheduled";
        } else if (task.status !== "scheduled") {
          task.status = "assigned";
        }
      }

      if (task.status === "completed") {
        task.completedAt ||= new Date().toISOString();
      } else if (task.status !== "completed") {
        task.completedAt = "";
      }
    },
    "Ενημέρωση κύριων στοιχείων",
    "Ανανεώθηκαν τα βασικά στοιχεία της εργασίας."
  );
}

function addMaterial(taskId, formData) {
  commitTaskChange(
    taskId,
    (task) => {
      task.materials.unshift({
        id: createId("MAT"),
        code: formData.get("code"),
        description: formData.get("description"),
        quantity: Number(formData.get("quantity")),
        unit: formData.get("unit")
      });
    },
    "Προσθήκη υλικού",
    "Καταχωρήθηκε νέο υλικό στη λίστα της εργασίας."
  );
}

function updateSafety(taskId, formData) {
  commitTaskChange(
    taskId,
    (task) => {
      task.safety = task.safety.map((item) => ({
        ...item,
        status: formData.get(`status-${item.id}`),
        note: formData.get(`note-${item.id}`)
      }));
    },
    "Ενημέρωση Health & Safety",
    "Αποθηκεύτηκαν οι επιλογές του safety survey."
  );
}

function handleWorkflow(taskId, action) {
  const validationComment = state.ui.validationComment.trim();
  const cancellationComment = state.ui.cancellationComment.trim();

  if (action === "start") {
    commitTaskChange(
      taskId,
      (task) => {
        task.status = "in_progress";
      },
      "Έναρξη εργασίας",
      "Η εργασία μεταφέρθηκε στο στάδιο εκτέλεσης."
    );
    return;
  }

  if (action === "submit-validation") {
    commitTaskChange(
      taskId,
      (task) => {
        task.status = "pending_validation";
        task.flags.validationLock = true;
        if (!task.endDate) {
          task.endDate = new Date().toISOString().slice(0, 16);
        }
      },
      "Παράδοση για επικύρωση",
      "Ο partner ολοκλήρωσε την εκτέλεση και παρέδωσε την εργασία για έλεγχο."
    );
    return;
  }

  if (action === "request-cancellation") {
    const task = getTaskById(taskId);

    if (!task) {
      return;
    }

    if (!cancellationComment) {
      window.alert("Γράψε πρώτα αιτιολογία για το αίτημα ακύρωσης.");
      return;
    }

    if (!task.photos.length && !task.files.length) {
      window.alert("Πριν το αίτημα ακύρωσης πρέπει να υπάρχουν φωτογραφίες ή αρχεία τεκμηρίωσης.");
      return;
    }

    commitTaskChange(
      taskId,
      (nextTask) => {
        nextTask.flags.cancellationRequested = true;
        nextTask.flags.cancellationRequestedAt = new Date().toISOString();
        nextTask.flags.cancellationRequestedBy = getCurrentUser().name;
        nextTask.flags.cancellationReason = cancellationComment;
      },
      "Αίτημα ακύρωσης",
      `Ο συνεργάτης υπέβαλε αίτημα ακύρωσης: ${cancellationComment}`
    );
    state.ui.cancellationComment = "";
    saveState();
    render();
    return;
  }

  if (action === "approve") {
    commitTaskChange(
      taskId,
      (task) => {
        task.status = "completed";
        task.flags.validationLock = false;
        task.flags.openIssues = false;
        task.flags.cancellationRequested = false;
        task.flags.cancellationRequestedAt = "";
        task.flags.cancellationRequestedBy = "";
        task.flags.cancellationReason = "";
        task.completedAt = new Date().toISOString();
      },
      "Έγκριση admin",
      validationComment || "Η εργασία εγκρίθηκε και μεταφέρθηκε σε completed."
    );
    state.ui.validationComment = "";
    saveState();
    render();
      return;
  }

  if (action === "approve-cancellation") {
    commitTaskChange(
      taskId,
      (task) => {
        task.status = "unassigned";
        task.assignedUserId = "";
        task.assignedUserName = "";
        task.assignedAt = "";
        task.startDate = "";
        task.endDate = "";
        task.completedAt = "";
        task.flags.validationLock = false;
        task.flags.openIssues = true;
        task.flags.cancellationRequested = false;
        task.flags.cancellationRequestedAt = "";
        task.flags.cancellationRequestedBy = "";
        task.flags.cancellationReason = "";
      },
      "Έγκριση αιτήματος ακύρωσης",
      validationComment || "Ο admin ενέκρινε το αίτημα ακύρωσης και η εργασία επέστρεψε σε αναμονή ανάθεσης."
    );
    state.ui.validationComment = "";
    state.ui.cancellationComment = "";
    saveState();
    render();
    return;
  }

  if (action === "reject-cancellation") {
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να απορρίψετε το αίτημα ακύρωσης;")) {
      return;
    }

    commitTaskChange(
      taskId,
      (task) => {
        task.flags.cancellationRequested = false;
        task.flags.cancellationRequestedAt = "";
        task.flags.cancellationRequestedBy = "";
        task.flags.cancellationReason = "";
      },
      "Απόρριψη αιτήματος ακύρωσης",
      validationComment || "Ο admin απέρριψε το αίτημα ακύρωσης και η εργασία συνεχίζεται."
    );
    state.ui.validationComment = "";
    state.ui.cancellationComment = "";
    saveState();
    render();
    return;
  }

  if (action === "reject") {
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να απορρίψετε την εργασία και να την επιστρέψετε στον συνεργάτη;")) {
      return;
    }

    commitTaskChange(
      taskId,
      (task) => {
        task.status = "in_progress";
        task.flags.validationLock = false;
        task.flags.openIssues = true;
        task.flags.cancellationRequested = false;
        task.flags.cancellationRequestedAt = "";
        task.flags.cancellationRequestedBy = "";
        task.flags.cancellationReason = "";
        task.completedAt = "";
      },
      "Απόρριψη admin",
      validationComment || "Η εργασία επιστράφηκε στον partner για διορθώσεις."
    );
    state.ui.validationComment = "";
    saveState();
    render();
  }
}

function handlePhotoUpload(input) {
  const files = Array.from(input.files || []);
  if (!files.length) {
    return;
  }

  const route = getRoute();
  const taskId = route.taskId;
  const category = input.closest("form")?.querySelector("select[name='category']")?.value || "before";
  const currentUser = getCurrentUser();

  Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id: createId("PHOTO"),
              name: file.name,
              category,
              uploadedBy: currentUser.name,
              uploadedAt: new Date().toISOString(),
              preview: reader.result
            });
          };
          reader.readAsDataURL(file);
        })
    )
  ).then((photos) => {
    commitTaskChange(
      taskId,
      (task) => {
        task.photos.unshift(...photos);
      },
      "Μεταφόρτωση φωτογραφιών",
      `Ανέβηκαν ${photos.length} νέες φωτογραφίες στην κατηγορία ${category}.`
    );
  });
}

function handleFileUpload(input) {
  const files = Array.from(input.files || []);
  if (!files.length) {
    return;
  }

  const taskId = input.getAttribute("data-task-id");
  const currentUser = getCurrentUser();

  commitTaskChange(
    taskId,
    (task) => {
      task.files.unshift(
        ...files.map((file) => ({
          id: createId("FILE"),
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          uploadedBy: currentUser.name,
          uploadedAt: new Date().toISOString()
        }))
      );
    },
    "Μεταφόρτωση αρχείων",
    `Ανέβηκαν ${files.length} νέα συνημμένα αρχεία.`
  );
}
