import { TaskCard } from "./components/TaskCard.js";
import { TaskDetail } from "./components/TaskDetail.js";
import { TaskTable } from "./components/TaskTable.js";
import { MATERIAL_CATALOG_SEED } from "./data/materialCatalog.js";
import { WORK_CATALOG_SEED } from "./data/workCatalog.js";
import {
  ASSIGNEE_OPTIONS,
  createInitialState,
  getDefaultLeitourgiesInwnStage,
  getLeitourgiesInwnStageFlow,
  LEITOURGIES_INWN_STAGE_META,
  OPERATOR_OPTIONS,
  PIPELINE_META,
  PIPELINE_ORDER,
  ROLE_LABELS,
  STATUS_META,
  STATUS_ORDER,
  USER_DIRECTORY
} from "./data/mockData.js";
import { countByStatus, createId, createUuid, deepClone, escapeHtml, formatDateTime, formatElapsedDays, icon } from "./lib/helpers.js";
import { hasSupabaseRuntimeConfig, loadRuntimeConfig } from "./lib/runtimeConfig.js";
import {
  createSupabaseBrowserClient,
  fetchSupabaseBootstrapData,
  fetchSupabaseCatalogs,
  fetchSupabaseTaskSummaries,
  fetchSupabaseTaskDetail,
  persistTaskToSupabase,
  signInWithPassword,
  signOutSession,
  uploadTaskFiles,
  uploadTaskPhotos
} from "./lib/supabaseBackend.js";

const STORAGE_KEY = "birol-field-ops-prototype-v11";
const COMPANY_LOGO_SRC = "/src/assets/tercom.jpg";
const app = document.querySelector("#app");

const runtime = {
  mode: "local",
  config: null,
  supabase: null,
  loading: true,
  authPending: false,
  session: null,
  profile: null,
  profiles: [],
  dashboardSummary: null,
  tasksLoaded: false,
  catalogsLoaded: false,
  workCatalog: [...WORK_CATALOG_SEED],
  authError: "",
  syncError: "",
  syncQueue: Promise.resolve(),
  activeBootstrapLoad: null,
  activeBootstrapToken: "",
  lastLoadedSessionToken: "",
  activeTaskDetailLoads: new Map(),
  activeTaskListLoad: null,
  activeCatalogLoad: null
};

let state = loadState();

if (!window.location.hash) {
  window.location.hash = "#/dashboard";
}

window.addEventListener("hashchange", render);
document.addEventListener("click", handleClick);
document.addEventListener("change", handleChange);
document.addEventListener("input", handleInput);
document.addEventListener("submit", handleSubmit);

bootstrap();

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
      sidebarCollapsed: false,
      expandedAdminAssignee: "partner-1",
      validationComment: "",
      cancellationComment: "",
      materialSearch: "",
      selectedMaterialId: "",
      workSearch: "",
      selectedWorkId: "",
      exportReturnRoute: "#/dashboard",
      reportAutoPrint: false,
      ...parsed.ui
    };
    parsed.filters ||= { search: "", status: "all", pipeline: "all", city: "all", technician: "all" };
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

function resetUiStateForLiveSession() {
  state.ui.showCreateModal = false;
  state.ui.activeTab = "main";
  state.ui.validationComment = "";
  state.ui.cancellationComment = "";
  state.ui.materialSearch = "";
  state.ui.selectedMaterialId = "";
  state.ui.workSearch = "";
  state.ui.selectedWorkId = "";
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} καθυστέρησε υπερβολικά. Κάνε refresh ή ξανασύνδεση.`));
      }, ms);
    })
  ]);
}

async function bootstrap() {
  try {
    const config = await withTimeout(loadRuntimeConfig(), 10000, "Η φόρτωση του runtime config");

    if (hasSupabaseRuntimeConfig(config)) {
      runtime.mode = "supabase";
      runtime.config = config;
      runtime.supabase = createSupabaseBrowserClient(config);

      runtime.supabase.auth.onAuthStateChange(async (event, session) => {
        runtime.session = session;
        runtime.authError = "";

        if (
          event === "TOKEN_REFRESHED" &&
          session?.user?.id &&
          runtime.profile?.id === session.user.id
        ) {
          runtime.loading = false;
          render();
          return;
        }

        if (session) {
          if (window.location.hash !== "#/dashboard") {
            window.location.hash = "#/dashboard";
          }
          try {
            await withTimeout(loadSupabaseState(), 15000, "Η φόρτωση των δεδομένων από Supabase");
          } catch (error) {
            runtime.syncError = error.message;
          }
        } else {
          runtime.profile = null;
          runtime.profiles = [];
          runtime.lastLoadedSessionToken = "";
          state.currentRole = "admin";
          state.currentUserId = USER_DIRECTORY.admin[0]?.id || "";
          resetUiStateForLiveSession();
          saveState();
        }

        runtime.authPending = false;
        runtime.loading = false;
        render();
      });

      runtime.loading = false;
      render();

      runtime.supabase.auth
        .getSession()
        .then(async ({ data }) => {
          const restoredSession = data.session;
          if (!restoredSession) {
            return;
          }

          const sessionAlreadyLoaded =
            runtime.session?.access_token === restoredSession.access_token &&
            runtime.profile?.id === restoredSession.user?.id;

          runtime.session = restoredSession;

          if (!sessionAlreadyLoaded) {
            try {
              await withTimeout(loadSupabaseState(), 15000, "Η αρχική φόρτωση των δεδομένων από Supabase");
            } catch (error) {
              runtime.syncError = error.message;
            }
          }
        })
        .catch((error) => {
          console.warn("Supabase session restore skipped:", error);
        })
        .finally(() => {
          runtime.loading = false;
          render();
        });
    }
  } catch (error) {
    runtime.syncError = error.message;
  } finally {
    runtime.loading = false;
    render();
  }
}

async function loadSupabaseState() {
  const currentToken = runtime.session?.access_token || "";

  if (
    runtime.activeBootstrapLoad &&
    (!runtime.activeBootstrapToken || !currentToken || runtime.activeBootstrapToken === currentToken)
  ) {
    return runtime.activeBootstrapLoad;
  }

  if (
    currentToken &&
    runtime.lastLoadedSessionToken === currentToken &&
    runtime.profile?.id === runtime.session?.user?.id
  ) {
    return;
  }

  runtime.activeBootstrapToken = currentToken;
  runtime.activeBootstrapLoad = (async () => {
    const payload = await fetchSupabaseBootstrapData(runtime.supabase, runtime.session);

    runtime.session = payload.session;
    runtime.profile = payload.profile;
    runtime.profiles = payload.profiles;
    runtime.dashboardSummary =
      payload.dashboardSummary || buildDashboardSummaryFromTasks(payload.tasks || [], payload.profiles || [], payload.profile || null);
    runtime.tasksLoaded = !!payload.tasksLoaded;
    runtime.catalogsLoaded = !!((payload.workCatalog && payload.workCatalog.length) || (payload.inventory && payload.inventory.length));
    runtime.workCatalog = payload.workCatalog?.length ? payload.workCatalog : [...WORK_CATALOG_SEED];
    state.tasks = (payload.tasks || []).map(normalizeTask);
    state.inventory = payload.inventory?.length ? payload.inventory : MATERIAL_CATALOG_SEED.map(normalizeInventoryItem);
    state.currentRole = payload.profile?.role || "partner";
    state.currentUserId = payload.profile?.id || "";
    state.ui.showCreateModal = false;
    state.ui.validationComment = "";
    state.ui.cancellationComment = "";
    if (
      state.currentRole === "admin" &&
      state.ui.expandedAdminAssignee !== "unassigned" &&
      !payload.profiles.some((profile) => profile.id === state.ui.expandedAdminAssignee)
    ) {
      state.ui.expandedAdminAssignee = payload.profiles[0]?.id || "unassigned";
    }
    runtime.lastLoadedSessionToken = payload.session?.access_token || "";
    saveState();
  })();

  try {
    await runtime.activeBootstrapLoad;
  } finally {
    runtime.activeBootstrapLoad = null;
    runtime.activeBootstrapToken = "";
  }
}

async function ensureSupabaseTasksLoaded() {
  if (!isSupabaseMode() || !isAuthenticated() || runtime.tasksLoaded) {
    return;
  }

  if (runtime.activeTaskListLoad) {
    return runtime.activeTaskListLoad;
  }

  runtime.activeTaskListLoad = (async () => {
    const tasks = await fetchSupabaseTaskSummaries(runtime.supabase, runtime.profiles);
    state.tasks = tasks.map(normalizeTask);
    runtime.tasksLoaded = true;
    saveState();
  })();

  try {
    await runtime.activeTaskListLoad;
  } finally {
    runtime.activeTaskListLoad = null;
  }
}

async function ensureSupabaseCatalogsLoaded() {
  if (!isSupabaseMode() || !isAuthenticated() || runtime.catalogsLoaded) {
    return;
  }

  if (runtime.activeCatalogLoad) {
    return runtime.activeCatalogLoad;
  }

  runtime.activeCatalogLoad = (async () => {
    const payload = await fetchSupabaseCatalogs(runtime.supabase);
    state.inventory = payload.inventory?.length ? payload.inventory : MATERIAL_CATALOG_SEED.map(normalizeInventoryItem);
    runtime.workCatalog = payload.workCatalog?.length ? payload.workCatalog : [...WORK_CATALOG_SEED];
    runtime.catalogsLoaded = true;
    saveState();
  })();

  try {
    await runtime.activeCatalogLoad;
  } finally {
    runtime.activeCatalogLoad = null;
  }
}

async function refreshSupabaseDashboardSummary() {
  if (!isSupabaseMode() || !isAuthenticated()) {
    return;
  }

  const payload = await fetchSupabaseBootstrapData(runtime.supabase);
  if (payload.profile) {
    runtime.profile = payload.profile;
  }
  if (payload.profiles?.length) {
    runtime.profiles = payload.profiles;
  }
  runtime.dashboardSummary =
    payload.dashboardSummary || buildDashboardSummaryFromTasks(state.tasks, runtime.profiles, runtime.profile);
}

function isSupabaseMode() {
  return runtime.mode === "supabase";
}

function isAuthenticated() {
  return !!runtime.session && !!runtime.profile;
}

function getRuntimeAssignableProfiles() {
  return (runtime.profiles || []).filter((profile) => profile.isActive !== false);
}

function createEmptyDashboardSummary() {
  return {
    sectionTotals: [],
    currentPipelineTotals: [],
    statusCounts: [],
    queues: {
      cancellationRequested: [],
      cancelled: []
    }
  };
}

function buildDashboardSummaryFromTasks(tasks, profiles = [], currentProfile = null) {
  const visibleTasks =
    currentProfile?.role === "admin"
      ? tasks
      : tasks.filter((task) => task.assignedUserId === currentProfile?.id && task.status !== "cancelled");

  const sectionTotalsMap = new Map();
  const currentPipelineTotalsMap = new Map();
  const statusCountsMap = new Map();

  const putCount = (map, key, increment = 1) => {
    map.set(key, (map.get(key) || 0) + increment);
  };

  visibleTasks.forEach((task) => {
    const assigneeId = task.assignedUserId || "unassigned";
    const shouldCountInUnassigned = !!task.assignedUserId || task.status !== "cancelled";

    if (shouldCountInUnassigned) {
      putCount(sectionTotalsMap, assigneeId);
      putCount(currentPipelineTotalsMap, `${assigneeId}::${task.pipeline}`);

      if (task.status === "completed") {
        putCount(statusCountsMap, `${assigneeId}::${task.pipeline}::completed`);
      } else {
        putCount(statusCountsMap, `${assigneeId}::${task.pipeline}::${task.status}`);
      }

      (task.pipelineHistory || []).forEach((entry) => {
        putCount(statusCountsMap, `${assigneeId}::${entry.pipeline}::completed`);
      });
    }
  });

  return {
    profiles,
    sectionTotals: [...sectionTotalsMap.entries()].map(([assigneeId, total]) => ({ assigneeId, total })),
    currentPipelineTotals: [...currentPipelineTotalsMap.entries()].map(([key, total]) => {
      const [assigneeId, pipeline] = key.split("::");
      return { assigneeId, pipeline, total };
    }),
    statusCounts: [...statusCountsMap.entries()].map(([key, count]) => {
      const [assigneeId, pipeline, status] = key.split("::");
      return { assigneeId, pipeline, status, count };
    }),
    queues: {
      cancellationRequested: visibleTasks
        .filter((task) => task.flags?.cancellationRequested)
        .map((task) => ({
          id: task.id,
          title: task.title,
          address: task.address,
          city: task.city,
          pipeline: task.pipeline,
          status: task.status,
          assignedUserName: task.assignedUserName || ""
        })),
      cancelled: visibleTasks
        .filter((task) => task.status === "cancelled")
        .map((task) => ({
          id: task.id,
          title: task.title,
          address: task.address,
          city: task.city,
          pipeline: task.pipeline,
          status: task.status,
          assignedUserName: task.assignedUserName || ""
        }))
    }
  };
}

function getDashboardSummary() {
  if (runtime.dashboardSummary) {
    return runtime.dashboardSummary;
  }

  return buildDashboardSummaryFromTasks(state.tasks, runtime.profiles, runtime.profile);
}

function getSummarySectionTotal(summary, assigneeId) {
  return summary.sectionTotals.find((entry) => entry.assigneeId === assigneeId)?.total || 0;
}

function getSummaryCurrentPipelineTotal(summary, assigneeId, pipelineKey) {
  return summary.currentPipelineTotals.find((entry) => entry.assigneeId === assigneeId && entry.pipeline === pipelineKey)?.total || 0;
}

function getSummaryStatusCount(summary, assigneeId, pipelineKey, statusKey) {
  return summary.statusCounts.find((entry) => entry.assigneeId === assigneeId && entry.pipeline === pipelineKey && entry.status === statusKey)?.count || 0;
}

function renderAuthGate() {
  if (runtime.loading) {
    app.innerHTML = `
      <section class="auth-screen auth-screen--loading">
        <div class="auth-layout auth-layout--compact">
          <div class="surface auth-brand auth-brand--loading">
            <div class="auth-brand__hero">
              <div class="auth-brand__mark">
                <img src="${escapeHtml(COMPANY_LOGO_SRC)}" alt="TERCOM" />
              </div>
              <div>
                <p class="eyebrow">TERCOM Live Workspace</p>
                <h1>Σύνδεση στο περιβάλλον</h1>
                <p>Ετοιμάζουμε το workspace και ελέγχουμε το session με τη βάση δεδομένων.</p>
              </div>
            </div>
            <div class="auth-progress" aria-hidden="true"><span></span></div>
          </div>
        </div>
      </section>
    `;
    return true;
  }

  if (isSupabaseMode() && !isAuthenticated()) {
    app.innerHTML = `
      <section class="auth-screen">
        <div class="auth-layout">
          <aside class="surface auth-brand">
            <div class="auth-brand__hero">
              <div class="auth-brand__mark">
                <img src="${escapeHtml(COMPANY_LOGO_SRC)}" alt="TERCOM" />
              </div>
              <div>
                <p class="eyebrow">TERCOM Access</p>
                <h1>Field Ops Control</h1>
                <p>Ενιαίο περιβάλλον για ανάθεση, εκτέλεση, παρακολούθηση και επικύρωση εργασιών πεδίου.</p>
              </div>
            </div>
          </aside>

          <form class="surface auth-panel" data-login-form>
            <p class="eyebrow">Σύνδεση χρηστών</p>
            <h1>Σύνδεση στο σύστημα</h1>
            <p>Χρησιμοποίησε τον λογαριασμό Supabase για να μπεις στο live περιβάλλον της TERCOM.</p>
            <label class="field">
              <span>Email</span>
              <input type="email" name="email" autocomplete="username" required ${runtime.authPending ? "disabled" : ""} />
            </label>
            <label class="field">
              <span>Κωδικός</span>
              <input type="password" name="password" autocomplete="current-password" required ${runtime.authPending ? "disabled" : ""} />
            </label>
            ${runtime.authError ? `<div class="alert-banner alert-banner--warning"><p>${escapeHtml(runtime.authError)}</p></div>` : ""}
            ${runtime.syncError ? `<div class="alert-banner alert-banner--warning"><p>${escapeHtml(runtime.syncError)}</p></div>` : ""}
            <div class="form-actions auth-form-actions">
              <button class="button" type="submit" ${runtime.authPending ? "disabled" : ""}>${runtime.authPending ? "Σύνδεση..." : "Σύνδεση"}</button>
              ${runtime.syncError ? `<button class="button button--ghost" type="button" data-retry-bootstrap">Ξανά προσπάθεια</button>` : ""}
            </div>
          </form>
        </div>
      </section>
    `;
    return true;
  }

  return false;
}

async function queueSupabaseTaskSync(nextTask, previousTask, newHistoryEntry = null) {
  if (!isSupabaseMode() || !isAuthenticated()) {
    return;
  }

  state.tasks = state.tasks.map((task) =>
    task.id === nextTask.id
      ? {
          ...task,
          flags: {
            ...task.flags,
            apiStatus: "PENDING-SYNC"
          }
        }
      : task
  );
  saveState();
  render();

  runtime.syncQueue = runtime.syncQueue
    .then(async () => {
      await persistTaskToSupabase(runtime.supabase, nextTask, previousTask, {
        currentUserId: runtime.profile?.id || "",
        newHistoryEntry
      });
      await refreshSupabaseDashboardSummary();
      runtime.syncError = "";
      state.tasks = state.tasks.map((task) =>
        task.id === nextTask.id
          ? {
              ...task,
              flags: {
                ...task.flags,
                apiStatus: "SYNCED"
              }
            }
          : task
      );
      saveState();
      render();
    })
    .catch((error) => {
      runtime.syncError = error.message;
      state.tasks = state.tasks.map((task) =>
        task.id === nextTask.id
          ? {
              ...task,
              flags: {
                ...task.flags,
                apiStatus: "SYNC-FAILED"
              }
            }
          : task
      );
      saveState();
      console.error("Supabase task sync failed:", error);
      window.alert(`Η αποθήκευση στη βάση απέτυχε: ${error.message}`);
      render();
    });

  await runtime.syncQueue;
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
  if (isSupabaseMode() && isAuthenticated()) {
    return getRuntimeAssignableProfiles().filter((profile) => profile.role === state.currentRole);
  }

  return USER_DIRECTORY[state.currentRole];
}

function getCurrentUser() {
  if (isSupabaseMode() && isAuthenticated()) {
    return runtime.profile;
  }

  return getCurrentRoleUsers().find((user) => user.id === state.currentUserId) || getCurrentRoleUsers()[0];
}

function inferTaskTypeFromPipeline(pipelineKey) {
  if (pipelineKey === "leitourgies_inwn") {
    return "installation";
  }

  if (pipelineKey === "syntirisi_loipes") {
    return "repair";
  }

  return "survey";
}

function getAssignableUsers() {
  if (isSupabaseMode() && isAuthenticated()) {
    return getRuntimeAssignableProfiles();
  }

  return ASSIGNEE_OPTIONS;
}

function getAssignableUserById(userId) {
  return getAssignableUsers().find((user) => user.id === userId) || null;
}

function normalizeLegacyUserName(name) {
  const legacyMap = {
    "Admin 1": "TERCOM",
    "Συνεργάτης 1": "ΜΠΙΜΠΕΡ ΝΕΤΖΜΗ",
    "Συνεργάτης 2": "Δ. ΝΕΟΓΛΟΥ - Κ. ΧΑΤΖΗΑΝΔΡΕΟΥ Ο.Ε"
  };

  return legacyMap[name] || name || "";
}

function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

async function ensureSupabaseTaskDetail(taskId) {
  if (!isSupabaseMode() || !isAuthenticated() || !taskId) {
    return;
  }

  const existingTask = getTaskById(taskId);
  if (existingTask?.detailLoaded) {
    return;
  }

  if (runtime.activeTaskDetailLoads.has(taskId)) {
    return runtime.activeTaskDetailLoads.get(taskId);
  }

  const loadPromise = (async () => {
    const fullTask = await fetchSupabaseTaskDetail(runtime.supabase, taskId, runtime.session);
    const normalizedTask = normalizeTask(fullTask);
    const exists = state.tasks.some((task) => task.id === taskId);
    state.tasks = exists
      ? state.tasks.map((task) => (task.id === taskId ? normalizedTask : task))
      : [normalizedTask, ...state.tasks];
    runtime.tasksLoaded = true;
    saveState();
  })();

  runtime.activeTaskDetailLoads.set(taskId, loadPromise);

  try {
    await loadPromise;
  } finally {
    runtime.activeTaskDetailLoads.delete(taskId);
  }
}

function normalizeTask(task) {
  const serviceProvider = task.serviceProvider || "other";
  const isLeitourgiesTask = (task.pipeline || "autopsia") === "leitourgies_inwn";
  const assignedUser = getAssignableUserById(task.assignedUserId);
  const assignableNames = new Set(getAssignableUsers().map((user) => user.name));
  const normalizedLegacyTeam = normalizeLegacyUserName(task.resourceTeam);
  const normalizedResourceTeam = assignableNames.has(task.resourceTeam)
    ? task.resourceTeam
    : assignableNames.has(normalizedLegacyTeam)
      ? normalizedLegacyTeam
      : assignedUser?.name || "";

  return {
    ...task,
    taskCode: task.taskCode || task.id,
    pipeline: task.pipeline || "autopsia",
    serviceProvider,
    adminNotes: task.adminNotes ?? task.notes ?? "",
    partnerNotes: task.partnerNotes ?? "",
    customerName: task.customerName || "",
    mobilePhone: task.mobilePhone || "",
    landlinePhone: task.landlinePhone || "",
    detailLoaded: task.detailLoaded !== false,
    resourceTeam: normalizedResourceTeam,
    srId: task.srId || task.projectId || "",
    bid: task.bid || task.serviceRequestId || "",
    assignedAt: task.assignedAt || (task.assignedUserId ? task.startDate || task.createdAt || "" : ""),
    completedAt: task.completedAt || (task.status === "completed" ? task.endDate || task.updatedAt || "" : ""),
    createdBy: normalizeLegacyUserName(task.createdBy),
    createdById: task.createdById || "",
    updatedBy: normalizeLegacyUserName(task.updatedBy),
    updatedById: task.updatedById || "",
    flags: {
      apiStatus: task.flags?.apiStatus || "LOCAL-ONLY",
      validationLock: !!task.flags?.validationLock,
      openIssues: !!task.flags?.openIssues,
      smartReadiness: task.flags?.smartReadiness || "Σε αναμονή",
      pendingDocumentReason: task.flags?.pendingDocumentReason || "",
      cancellationRequested: !!task.flags?.cancellationRequested,
      cancellationRequestedAt: task.flags?.cancellationRequestedAt || "",
      cancellationRequestedBy: task.flags?.cancellationRequestedBy || "",
      cancellationRequestedById: task.flags?.cancellationRequestedById || "",
      cancellationReason: task.flags?.cancellationReason || ""
    },
    assignedUserId: task.assignedUserId || "",
    assignedUserName: assignedUser?.name || normalizeLegacyUserName(task.assignedUserName),
    pipelineHistory: Array.isArray(task.pipelineHistory) ? task.pipelineHistory : [],
    fiberStageKey: isLeitourgiesTask ? task.fiberStageKey || getDefaultLeitourgiesInwnStage(serviceProvider) : task.fiberStageKey || "",
    fiberStageHistory: Array.isArray(task.fiberStageHistory) ? task.fiberStageHistory : [],
    photos: Array.isArray(task.photos)
      ? task.photos.map((photo) => ({
          ...photo,
          uploadedById: photo.uploadedById || "",
          uploadedBy: normalizeLegacyUserName(photo.uploadedBy)
        }))
      : [],
    files: Array.isArray(task.files)
      ? task.files.map((file) => ({
          ...file,
          uploadedById: file.uploadedById || "",
          uploadedBy: normalizeLegacyUserName(file.uploadedBy)
        }))
      : [],
    materials: Array.isArray(task.materials)
      ? task.materials.map((material) => ({
          ...material,
          createdById: material.createdById || ""
        }))
      : [],
    workItems: Array.isArray(task.workItems)
      ? task.workItems.map((workItem) => ({
          ...workItem,
          createdById: workItem.createdById || ""
        }))
      : [],
    safety: Array.isArray(task.safety)
      ? task.safety.map((item, index) => ({
          ...item,
          position: Number(item.position ?? index) || index,
          createdById: item.createdById || "",
          updatedById: item.updatedById || ""
        }))
      : [],
    history: Array.isArray(task.history)
      ? task.history.map((entry) => ({
          ...entry,
          authorId: entry.authorId || "",
          author: normalizeLegacyUserName(entry.author)
        }))
      : []
  };
}

function normalizeInventoryItem(item) {
  return {
    id: item.id,
    code: item.code || "",
    description: item.description || "",
    unit: item.unit || "τεμ.",
    stock: Number(item.stock) || 0,
    minStock: Number(item.minStock) || 0
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
    filters: {
      search: "",
      status: "all",
      pipeline: "all",
      city: "all",
      technician: "all",
      ...sourceState.filters
    },
    tasks: (sourceState.tasks || []).map(normalizeTask),
    inventory: (sourceState.inventory?.length ? sourceState.inventory : MATERIAL_CATALOG_SEED).map(normalizeInventoryItem),
    ui: {
      materialSearch: "",
      selectedMaterialId: "",
      workSearch: "",
      selectedWorkId: "",
      ...sourceState.ui
    }
  };
}

function normalizeMaterialSearchText(value) {
  return String(value ?? "")
    .replaceAll("\u00a0", " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function restoreMaterialSearchFocus(selectionStart, selectionEnd) {
  window.requestAnimationFrame(() => {
    const nextInput = document.querySelector("[data-material-search]");
    if (!nextInput) {
      return;
    }

    nextInput.focus();

    if (typeof selectionStart === "number" && typeof selectionEnd === "number") {
      nextInput.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

function restoreWorkSearchFocus(selectionStart, selectionEnd) {
  window.requestAnimationFrame(() => {
    const nextInput = document.querySelector("[data-work-search]");
    if (!nextInput) {
      return;
    }

    nextInput.focus();

    if (typeof selectionStart === "number" && typeof selectionEnd === "number") {
      nextInput.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

function getVisibleTasks() {
  if (state.currentRole !== "partner") {
    return state.tasks;
  }

  const currentUser = getCurrentUser();
  return state.tasks.filter((task) => task.assignedUserId === currentUser.id && task.status !== "cancelled");
}

function hasRequiredAutopsiaCertificate(task) {
  if (task.pipeline !== "autopsia") {
    return true;
  }

  return task.files.some((file) => {
    const name = String(file.name || "").toLowerCase();
    return ["πιστοποι", "certificate", "certif", "pistopoi"].some((keyword) => name.includes(keyword));
  });
}

function getMissingRequiredDocumentsReason(task) {
  if (task.pipeline === "autopsia" && !hasRequiredAutopsiaCertificate(task)) {
    return "Η αυτοψία ολοκληρώθηκε, αλλά λείπει το απαιτούμενο πιστοποιητικό για να προχωρήσει σε επικύρωση.";
  }

  if (task.pipeline === "leitourgies_inwn" && isLeitourgiesFinalStage(task) && !task.files.length) {
    return `Το στάδιο ${getCurrentLeitourgiesStageMeta(task)?.label || "Επιμέτρηση με email"} ολοκληρώθηκε, αλλά λείπουν τα απαιτούμενα έγγραφα για να προχωρήσει σε επικύρωση.`;
  }

  if (task.pipeline === "syntirisi_loipes" && !task.files.length) {
    return "Η εργασία ολοκληρώθηκε, αλλά λείπουν τα απαιτούμενα έγγραφα για να προχωρήσει σε επικύρωση.";
  }

  return "";
}

function getLeitourgiesStageFlow(task) {
  return getLeitourgiesInwnStageFlow(task.serviceProvider);
}

function getCurrentLeitourgiesStageKey(task) {
  return task.fiberStageKey || getDefaultLeitourgiesInwnStage(task.serviceProvider);
}

function getCurrentLeitourgiesStageMeta(task) {
  const stageKey = getCurrentLeitourgiesStageKey(task);
  return LEITOURGIES_INWN_STAGE_META[stageKey];
}

function getNextLeitourgiesStageKey(task) {
  const flow = getLeitourgiesStageFlow(task);
  const currentIndex = flow.indexOf(getCurrentLeitourgiesStageKey(task));
  return currentIndex >= 0 ? flow[currentIndex + 1] || "" : "";
}

function isLeitourgiesFinalStage(task) {
  const flow = getLeitourgiesStageFlow(task);
  return flow[flow.length - 1] === getCurrentLeitourgiesStageKey(task);
}

function hasFiberStageEntry(task, stageKey) {
  return (task.fiberStageHistory || []).some((entry) => entry.stage === stageKey);
}

function hasCompletedPipeline(task, pipelineKey) {
  return (
    (task.pipeline === pipelineKey && task.status === "completed") ||
    (task.pipelineHistory || []).some((entry) => entry.pipeline === pipelineKey)
  );
}

function countTasksForPipelineStatus(tasks, pipelineKey, statusKey) {
  if (statusKey === "completed") {
    return tasks.filter((task) => hasCompletedPipeline(task, pipelineKey)).length;
  }

  return tasks.filter((task) => task.pipeline === pipelineKey && task.status === statusKey).length;
}

function getPermissions(task) {
  const currentUser = getCurrentUser();
  const isAdmin = state.currentRole === "admin";
  const isAssignedExecutor = currentUser.id === task.assignedUserId;

  return {
    canEditCore: isAdmin,
    canManageAssignment: isAdmin,
    canEditStatusDirectly: isAdmin,
    canEditAdminNotes: isAdmin,
    canEditPartnerNotes: isAssignedExecutor,
    canUploadPhotos: isAdmin || isAssignedExecutor,
    canUploadFiles: isAdmin || isAssignedExecutor,
    canAddMaterials: isAdmin || isAssignedExecutor,
    canAddWorkItems: isAdmin || isAssignedExecutor,
    canEditSafety: isAdmin || isAssignedExecutor,
    canScheduleVisit: isAssignedExecutor && ["assigned", "scheduled"].includes(task.status),
    canStart: (isAdmin || isAssignedExecutor) && task.status === "scheduled",
    canSubmitValidation: (isAdmin || isAssignedExecutor) && ["in_progress", "completed_with_pending"].includes(task.status),
    canApprove: isAdmin && task.status === "pending_validation",
    canReject: isAdmin && task.status === "pending_validation",
    canRequestCancellation: isAssignedExecutor && task.status === "in_progress" && !task.flags.cancellationRequested,
    canApproveCancellation: isAdmin && !!task.flags.cancellationRequested,
    canRejectCancellation: isAdmin && !!task.flags.cancellationRequested
  };
}

function getMaterialCatalogRows() {
  const search = normalizeMaterialSearchText(state.ui.materialSearch || "");

  return state.inventory
    .filter((item) => {
      if (!search) {
        return true;
      }

      const haystack = normalizeMaterialSearchText([item.code, item.description, item.unit].join(" "));
      return haystack.includes(search);
    });
}

function getWorkCatalogRows() {
  const search = normalizeMaterialSearchText(state.ui.workSearch || "");
  const sourceCatalog = runtime.workCatalog?.length ? runtime.workCatalog : WORK_CATALOG_SEED;

  return sourceCatalog.filter((item) => {
    if (!search) {
      return true;
    }

    const haystack = normalizeMaterialSearchText([item.article, item.description].join(" "));
    return haystack.includes(search);
  });
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
        task.projectName,
        task.adminNotes,
        task.partnerNotes
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);

    const historicalCompletedFilter = state.filters.status === "completed" && state.filters.pipeline !== "all";
    const matchesStatus =
      state.filters.status === "all" ||
      (historicalCompletedFilter ? hasCompletedPipeline(task, state.filters.pipeline) : task.status === state.filters.status);
    const matchesPipeline =
      state.filters.pipeline === "all" ||
      (historicalCompletedFilter ? true : task.pipeline === state.filters.pipeline);
    const matchesCity = state.filters.city === "all" || task.city === state.filters.city;
    const matchesTechnician =
      state.filters.technician === "all" ||
      (state.filters.technician === "unassigned" ? !task.assignedUserId : task.assignedUserId === state.filters.technician);

    return matchesSearch && matchesStatus && matchesPipeline && matchesCity && matchesTechnician;
  });
}

function renderPipelineStatusSections(tasks, technicianFilter = "") {
  return PIPELINE_ORDER.map((pipelineKey) => {
    const pipelineTasks = tasks.filter((task) => task.pipeline === pipelineKey);
    const counts = STATUS_ORDER.map((status) => [status, countTasksForPipelineStatus(tasks, pipelineKey, status)]);

    return `
      <section class="pipeline-section pipeline-section--nested">
        <div class="pipeline-section__head">
          <div>
            <p class="eyebrow">Pipeline</p>
            <h2>${escapeHtml(PIPELINE_META[pipelineKey].label)}</h2>
            <p class="section-copy">${escapeHtml(PIPELINE_META[pipelineKey].hint)}</p>
          </div>
          <span class="pill pill--${escapeHtml(PIPELINE_META[pipelineKey].tone)}">${pipelineTasks.length} τρέχουσες</span>
        </div>
        <div class="status-grid">
          ${counts.map(([status, count]) => TaskCard(status, count, pipelineKey, technicianFilter)).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderPipelineStatusSectionsFromSummary(summary, assigneeId = "") {
  return PIPELINE_ORDER.map((pipelineKey) => {
    const counts = STATUS_ORDER.map((status) => [status, getSummaryStatusCount(summary, assigneeId || "unassigned", pipelineKey, status)]);
    const currentPipelineTotal = getSummaryCurrentPipelineTotal(summary, assigneeId || "unassigned", pipelineKey);

    return `
      <section class="pipeline-section pipeline-section--nested">
        <div class="pipeline-section__head">
          <div>
            <p class="eyebrow">Pipeline</p>
            <h2>${escapeHtml(PIPELINE_META[pipelineKey].label)}</h2>
            <p class="section-copy">${escapeHtml(PIPELINE_META[pipelineKey].hint)}</p>
          </div>
          <span class="pill pill--${escapeHtml(PIPELINE_META[pipelineKey].tone)}">${currentPipelineTotal} τρέχουσες</span>
        </div>
        <div class="status-grid">
          ${counts.map(([status, count]) => TaskCard(status, count, pipelineKey, assigneeId)).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderAdminDashboard(visibleTasks) {
  const assigneeSections = [
    ...getAssignableUsers().map((assignee) => ({
      id: assignee.id,
      label: assignee.name,
      copy: "Επισκόπηση pipelines και queues για τον συγκεκριμένο υπεύθυνο ανάθεσης.",
      tasks: visibleTasks.filter((task) => task.assignedUserId === assignee.id)
    })),
    {
      id: "unassigned",
      label: "Χωρίς ανάθεση",
      copy: "Εργασίες που δεν έχουν δοθεί ακόμη σε συνεργάτη.",
      tasks: visibleTasks.filter((task) => !task.assignedUserId && task.status !== "cancelled")
    }
  ];

  return `
    <section class="assignee-dashboard">
      ${assigneeSections
        .map(
          (section) => `
            <section class="surface assignee-section${state.ui.expandedAdminAssignee === section.id ? " is-expanded" : ""}">
              <button class="assignee-toggle" type="button" data-toggle-admin-assignee="${escapeHtml(section.id)}">
                <div class="assignee-toggle__copy">
                  <p class="eyebrow">Admin View</p>
                  <h2>${escapeHtml(section.label)}</h2>
                  <p class="section-copy">${escapeHtml(section.copy)}</p>
                </div>
                <div class="assignee-toggle__meta">
                  <span class="assignee-toggle__count">${section.tasks.length}</span>
                  <span class="assignee-toggle__label">εργασίες</span>
                  <span class="assignee-toggle__chevron">${state.ui.expandedAdminAssignee === section.id ? "−" : "+"}</span>
                </div>
              </button>

              ${
                state.ui.expandedAdminAssignee === section.id
                  ? `<div class="assignee-section__body">${renderPipelineStatusSections(section.tasks, section.id)}</div>`
                  : ""
              }
            </section>
          `
        )
        .join("")}

      <section class="overview-grid">
        ${renderAdminQueue(
          "Αιτήματα Ακύρωσης",
          "Όλα τα ενεργά αιτήματα ακύρωσης που περιμένουν ενέργεια από admin.",
          visibleTasks.filter((task) => task.flags.cancellationRequested),
          "Δεν υπάρχουν ενεργά αιτήματα ακύρωσης.",
          ""
        )}
        ${renderAdminQueue(
          "Ακυρωμένες Εργασίες",
          "Εργασίες που ακυρώθηκαν και μπορούν να ανοιχτούν ξανά για νέα ανάθεση.",
          visibleTasks.filter((task) => task.status === "cancelled"),
          "Δεν υπάρχουν ακυρωμένες εργασίες.",
          "cancelled"
        )}
      </section>
    </section>
  `;
}

function renderAdminDashboardFromSummary(summary) {
  const assigneeSections = [
    ...getAssignableUsers().map((assignee) => ({
      id: assignee.id,
      label: assignee.name,
      copy: "Επισκόπηση pipelines και queues για τον συγκεκριμένο υπεύθυνο ανάθεσης."
    })),
    {
      id: "unassigned",
      label: "Χωρίς ανάθεση",
      copy: "Εργασίες που δεν έχουν δοθεί ακόμη σε συνεργάτη."
    }
  ];

  return `
    <section class="assignee-dashboard">
      ${assigneeSections
        .map(
          (section) => `
            <section class="surface assignee-section${state.ui.expandedAdminAssignee === section.id ? " is-expanded" : ""}">
              <button class="assignee-toggle" type="button" data-toggle-admin-assignee="${escapeHtml(section.id)}">
                <div class="assignee-toggle__copy">
                  <p class="eyebrow">Admin View</p>
                  <h2>${escapeHtml(section.label)}</h2>
                  <p class="section-copy">${escapeHtml(section.copy)}</p>
                </div>
                <div class="assignee-toggle__meta">
                  <span class="assignee-toggle__count">${getSummarySectionTotal(summary, section.id)}</span>
                  <span class="assignee-toggle__label">εργασίες</span>
                  <span class="assignee-toggle__chevron">${state.ui.expandedAdminAssignee === section.id ? "−" : "+"}</span>
                </div>
              </button>
              ${
                state.ui.expandedAdminAssignee === section.id
                  ? `<div class="assignee-section__body">${renderPipelineStatusSectionsFromSummary(summary, section.id)}</div>`
                  : ""
              }
            </section>
          `
        )
        .join("")}

      <section class="overview-grid">
        ${renderAdminQueue(
          "Αιτήματα Ακύρωσης",
          "Όλα τα ενεργά αιτήματα ακύρωσης που περιμένουν ενέργεια από admin.",
          summary.queues.cancellationRequested || [],
          "Δεν υπάρχουν ενεργά αιτήματα ακύρωσης.",
          ""
        )}
        ${renderAdminQueue(
          "Ακυρωμένες Εργασίες",
          "Εργασίες που ακυρώθηκαν και μπορούν να ανοιχτούν ξανά για νέα ανάθεση.",
          summary.queues.cancelled || [],
          "Δεν υπάρχουν ακυρωμένες εργασίες.",
          "cancelled"
        )}
      </section>
    </section>
  `;
}

function renderAdminQueue(title, copy, tasks, emptyMessage, filterStatus) {
  return `
    <section class="surface">
      <div class="section-head">
        <div>
          <p class="eyebrow">Admin Queue</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div>
          <p class="section-copy">${escapeHtml(copy)}</p>
          ${filterStatus ? `<button class="button button--ghost queue-head-action" data-route="#/tasks" data-filter-status="${escapeHtml(filterStatus)}">${tasks.length} συνολικά</button>` : ""}
        </div>
      </div>

      ${
        tasks.length
          ? `
            <div class="queue-list">
              ${tasks
                .map(
                  (task) => `
                    <button class="queue-item" data-open-task="${escapeHtml(task.id)}">
                      <strong>${escapeHtml(task.title)}</strong>
                      <span>${escapeHtml(task.address)} · ${escapeHtml(task.city)} · ${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</span>
                      <span>${escapeHtml(task.assignedUserName || "Χωρίς ανάθεση")} · ${escapeHtml(STATUS_META[task.status]?.label || task.status)}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          `
          : `<div class="empty-state"><p>${escapeHtml(emptyMessage)}</p></div>`
      }
    </section>
  `;
}

function render() {
  if (renderAuthGate()) {
    return;
  }

  const route = getRoute();
  const visibleTasks = getVisibleTasks();
  const filteredTasks = getFilteredTasks();
  const currentUser = getCurrentUser();
  const showManualSwitches = !isSupabaseMode();
  const roleLabel = currentUser?.role ? ROLE_LABELS[currentUser.role] || currentUser.role : ROLE_LABELS[state.currentRole];

  app.innerHTML = `
    <div class="app-shell${state.ui.sidebarCollapsed ? " is-sidebar-collapsed" : ""}">
      <aside class="sidebar">
        <div class="sidebar__head">
          <div class="brand">
            <div class="brand__mark brand__mark--logo">
              <img src="${COMPANY_LOGO_SRC}" alt="TERCOM logo" />
            </div>
            <div class="brand__copy">
              <strong>TERCOM</strong>
              <span>Field Ops Control</span>
            </div>
          </div>
          <button
            class="sidebar-toggle"
            type="button"
            data-toggle-sidebar
            aria-label="${state.ui.sidebarCollapsed ? "Άνοιγμα πλαϊνού μενού" : "Σύμπτυξη πλαϊνού μενού"}"
            title="${state.ui.sidebarCollapsed ? "Άνοιγμα πλαϊνού μενού" : "Σύμπτυξη πλαϊνού μενού"}"
          >
            <span>${state.ui.sidebarCollapsed ? ">" : "<"}</span>
          </button>
        </div>

        <nav class="nav">
          <button class="nav-link${route.view === "dashboard" ? " is-active" : ""}" data-route="#/dashboard">
            <span class="nav-link__icon">${icon("dashboard")}</span>
            <span class="nav-link__label">Dashboard</span>
          </button>
          <button class="nav-link${route.view === "tasks" || route.view === "detail" ? " is-active" : ""}" data-route="#/tasks">
            <span class="nav-link__icon">${icon("tasks")}</span>
            <span class="nav-link__label">Εργασίες</span>
          </button>
          <button class="nav-link nav-link--action${route.view === "report" ? " is-active" : ""}" data-export-open-pdf>
            <span class="nav-link__icon">${icon("print")}</span>
            <span class="nav-link__label">Export PDF</span>
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
            ${
              showManualSwitches
                ? `
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
                `
                : `
                  <div class="topbar-session">
                    <span class="pill pill--pipeline-leitourgies-inwn">${escapeHtml(roleLabel)}</span>
                    <strong>${escapeHtml(currentUser.name)}</strong>
                  </div>
                `
            }

            ${canCreateTasks() ? `<button class="button button--secondary" data-open-create>Νέα εργασία</button>` : ""}
            <button class="button button--ghost" data-reset-demo>Reset demo</button>
            ${isSupabaseMode() ? `<button class="button button--ghost" data-sign-out>Αποσύνδεση</button>` : ""}
          </div>
        </header>

        ${
          runtime.syncError && isSupabaseMode()
            ? `<div class="alert-banner alert-banner--warning workspace-alert"><p>${escapeHtml(runtime.syncError)}</p></div>`
            : ""
        }

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
  if (isSupabaseMode() && (route.view === "tasks" || route.view === "report") && !runtime.tasksLoaded) {
    ensureSupabaseTasksLoaded().catch((error) => {
      runtime.syncError = error.message;
      render();
    });

    return `
      <section class="surface empty-screen">
        <h2>Φόρτωση λίστας εργασιών</h2>
        <p>Ετοιμάζουμε τις εργασίες από τη βάση δεδομένων μόνο για τη συγκεκριμένη οθόνη.</p>
      </section>
    `;
  }

  if (route.view === "report") {
    return renderOpenTasksReport(visibleTasks.filter((task) => !["completed", "cancelled"].includes(task.status)));
  }

  if (route.view === "tasks") {
    const cities = [...new Set(visibleTasks.map((task) => task.city))].sort((a, b) => a.localeCompare(b, "el"));
    return TaskTable({
      tasks: filteredTasks,
      filters: state.filters,
      cities,
      pipelines: PIPELINE_ORDER,
      technicians: getAssignableUsers(),
      currentRole: state.currentRole
    });
  }

  if (route.view === "detail") {
    const task = getTaskById(route.taskId);
    if (!task) {
      if (isSupabaseMode()) {
        ensureSupabaseCatalogsLoaded().catch(() => {});
        ensureSupabaseTaskDetail(route.taskId).catch((error) => {
          runtime.syncError = error.message;
          render();
        });

        return `
          <section class="surface empty-screen">
            <h2>Φόρτωση εργασίας</h2>
            <p>Ανακτούμε τα στοιχεία της εργασίας από τη βάση δεδομένων.</p>
          </section>
        `;
      }

      return `
        <section class="surface empty-screen">
          <h2>Η εργασία δεν βρέθηκε</h2>
          <button class="button" data-route="#/tasks">Επιστροφή στη λίστα</button>
        </section>
      `;
    }

    if (isSupabaseMode() && !runtime.catalogsLoaded) {
      ensureSupabaseCatalogsLoaded().catch((error) => {
        runtime.syncError = error.message;
        render();
      });
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

    if (isSupabaseMode() && !task.detailLoaded) {
      ensureSupabaseTaskDetail(task.id).catch((error) => {
        runtime.syncError = error.message;
        render();
      });

      return `
        <section class="surface empty-screen">
          <h2>Φόρτωση λεπτομερειών εργασίας</h2>
          <p>Ετοιμάζουμε φωτογραφίες, αρχεία, ιστορικό και λοιπά στοιχεία της εργασίας.</p>
        </section>
      `;
    }

    return TaskDetail({
      task,
      activeTab: state.ui.activeTab,
      permissions: getPermissions(task),
      assignees: getAssignableUsers(),
      inventory: getMaterialCatalogRows(),
      materialSearch: state.ui.materialSearch,
      selectedMaterialId: state.ui.selectedMaterialId,
      selectedMaterial: state.inventory.find((item) => item.id === state.ui.selectedMaterialId) || null,
      workCatalog: getWorkCatalogRows(),
      workSearch: state.ui.workSearch,
      selectedWorkId: state.ui.selectedWorkId,
      selectedWork: (runtime.workCatalog?.length ? runtime.workCatalog : WORK_CATALOG_SEED).find((item) => item.id === state.ui.selectedWorkId) || null,
      currentRoleLabel: ROLE_LABELS[state.currentRole],
      currentUserName: currentUser.name,
      validationComment: state.ui.validationComment,
      cancellationComment: state.ui.cancellationComment
    });
  }

  if (state.currentRole === "admin") {
    if (isSupabaseMode()) {
      return renderAdminDashboardFromSummary(getDashboardSummary());
    }
    return renderAdminDashboard(visibleTasks);
  }

  if (isSupabaseMode()) {
    return `
      <section class="pipeline-dashboard">
        ${renderPipelineStatusSectionsFromSummary(getDashboardSummary(), currentUser.id)}
      </section>
    `;
  }

  return `
    <section class="pipeline-dashboard">
      ${renderPipelineStatusSections(visibleTasks)}
    </section>
  `;
}

function renderOpenTasksReport(openTasks) {
  const showAdminCreationTiming = state.currentRole === "admin";

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
      const fiberStageLabel = task.pipeline === "leitourgies_inwn" ? LEITOURGIES_INWN_STAGE_META[getCurrentLeitourgiesStageKey(task)]?.label || "-" : "-";
      const providerLabel = OPERATOR_OPTIONS.find((option) => option.value === task.serviceProvider)?.label || "Άλλος πάροχος";

      return `
        <article class="report-card">
          <div class="report-card__head">
            <div>
              <span class="report-eyebrow">${escapeHtml(task.taskCode || task.id)}</span>
              <h2>${escapeHtml(task.title)}</h2>
            </div>
            <span class="report-pill">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="report-grid">
            <div><strong>Pipeline</strong><span>${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</span></div>
            <div><strong>Διεύθυνση</strong><span>${escapeHtml(task.address)}</span></div>
            <div><strong>Πόλη</strong><span>${escapeHtml(task.city)}</span></div>
            <div><strong>Πελάτης</strong><span>${escapeHtml(task.customerName || "-")}</span></div>
            <div><strong>Κινητό</strong><span>${escapeHtml(task.mobilePhone || "-")}</span></div>
            <div><strong>Σταθερό</strong><span>${escapeHtml(task.landlinePhone || "-")}</span></div>
            <div><strong>Project</strong><span>${escapeHtml(task.projectName)}</span></div>
            <div><strong>SR ID</strong><span>${escapeHtml(task.srId)}</span></div>
            <div><strong>BID</strong><span>${escapeHtml(task.bid)}</span></div>
            <div><strong>Πάροχος</strong><span>${escapeHtml(providerLabel)}</span></div>
            <div><strong>Τρέχον στάδιο</strong><span>${escapeHtml(fiberStageLabel)}</span></div>
            <div><strong>Team</strong><span>${escapeHtml(task.resourceTeam)}</span></div>
            <div><strong>Ανατέθηκε σε</strong><span>${escapeHtml(task.assignedUserName || "Δεν έχει ανατεθεί")}</span></div>
            <div><strong>Assigned at</strong><span>${task.assignedAt ? escapeHtml(formatDateTime(task.assignedAt)) : "Δεν έχει ανατεθεί"}</span></div>
            <div><strong>Από ανάθεση</strong><span>${escapeHtml(task.assignedAt ? formatElapsedDays(task.assignedAt, task.completedAt) : "Δεν έχει ανατεθεί")}</span></div>
            ${
              showAdminCreationTiming
                ? `
                  <div><strong>Από δημιουργία</strong><span>${escapeHtml(formatElapsedDays(task.createdAt, task.completedAt))}</span></div>
                  <div><strong>Created</strong><span>${escapeHtml(task.createdBy)} · ${escapeHtml(formatDateTime(task.createdAt))}</span></div>
                `
                : ""
            }
            <div><strong>Έναρξη</strong><span>${escapeHtml(formatDateTime(task.startDate))}</span></div>
            <div><strong>Λήξη</strong><span>${escapeHtml(formatDateTime(task.endDate))}</span></div>
            <div><strong>Updated</strong><span>${escapeHtml(task.updatedBy)} · ${escapeHtml(formatDateTime(task.updatedAt))}</span></div>
          </div>
          <div class="report-notes">
            <strong>Σημειώσεις Admin</strong>
            <p>${escapeHtml(task.adminNotes || "Δεν υπάρχουν σημειώσεις admin.")}</p>
            <strong>Σημειώσεις Συνεργάτη</strong>
            <p>${escapeHtml(task.partnerNotes || "Δεν υπάρχουν σημειώσεις συνεργάτη.")}</p>
          </div>
          <div class="report-metrics">
            <span>Φωτογραφίες: ${task.photos.length}</span>
            <span>Αρχεία: ${task.files.length}</span>
            <span>Υλικά: ${task.materials.length}</span>
            <span>Εργασίες: ${task.workItems.length}</span>
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
  const openTasks = getVisibleTasks().filter((task) => !["completed", "cancelled"].includes(task.status));

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
            <span>Pipeline</span>
            <select name="pipeline">
              ${PIPELINE_ORDER.map(
                (pipelineKey) =>
                  `<option value="${pipelineKey}"${pipelineKey === "autopsia" ? " selected" : ""}>${escapeHtml(PIPELINE_META[pipelineKey].label)}</option>`
              ).join("")}
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
            <span>Team / Άμεση ανάθεση</span>
            <select name="resourceTeam">
              <option value="">Χωρίς άμεση ανάθεση</option>
              ${getAssignableUsers()
                .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`)
                .join("")}
            </select>
          </div>
          <div class="field">
            <span>Πάροχος</span>
            <select name="serviceProvider">
              ${OPERATOR_OPTIONS.map(
                (option) => `<option value="${option.value}"${option.value === "other" ? " selected" : ""}>${escapeHtml(option.label)}</option>`
              ).join("")}
            </select>
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
            <span>Σημειώσεις admin</span>
            <textarea name="adminNotes" rows="5"></textarea>
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
    const filterPipeline = routeTarget.getAttribute("data-filter-pipeline");
    const filterTechnician = routeTarget.getAttribute("data-filter-technician");
    const hasDashboardFilters = routeTarget.hasAttribute("data-filter-status") || routeTarget.hasAttribute("data-filter-pipeline") || routeTarget.hasAttribute("data-filter-technician");
    if (hasDashboardFilters) {
      state.filters.status = filterStatus || "all";
      state.filters.pipeline = filterPipeline || "all";
      state.filters.technician = filterTechnician || "all";
    }
    if (hasDashboardFilters) {
      saveState();
    }
    if (nextRoute?.startsWith("#/tasks") || nextRoute?.startsWith("#/dashboard")) {
      state.ui.validationComment = "";
      state.ui.cancellationComment = "";
      state.ui.materialSearch = "";
      state.ui.selectedMaterialId = "";
      state.ui.workSearch = "";
      state.ui.selectedWorkId = "";
      saveState();
    }
    window.location.hash = nextRoute;
    return;
  }

  if (event.target.closest("[data-export-open-pdf]")) {
    openOpenTasksReport();
    return;
  }

  if (event.target.closest("[data-sign-out]")) {
    if (isSupabaseMode() && runtime.supabase) {
      runtime.loading = true;
      render();
      signOutSession(runtime.supabase).catch((error) => {
        runtime.loading = false;
        runtime.authError = error.message;
        render();
      });
    }
    return;
  }

  if (event.target.closest("[data-retry-bootstrap]")) {
    runtime.loading = true;
    runtime.syncError = "";
    render();
    bootstrap();
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
    state.ui.materialSearch = "";
    state.ui.selectedMaterialId = "";
    state.ui.workSearch = "";
    state.ui.selectedWorkId = "";
    saveState();
    window.location.hash = `#/tasks/${encodeURIComponent(taskTarget.getAttribute("data-open-task"))}`;
    return;
  }

  const materialTarget = event.target.closest("[data-select-material]");
  if (materialTarget) {
    state.ui.selectedMaterialId = materialTarget.getAttribute("data-select-material") || "";
    state.ui.materialSearch = "";
    saveState();
    render();
    return;
  }

  const workTarget = event.target.closest("[data-select-work]");
  if (workTarget) {
    state.ui.selectedWorkId = workTarget.getAttribute("data-select-work") || "";
    state.ui.workSearch = "";
    saveState();
    render();
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

  if (event.target.closest("[data-toggle-sidebar]")) {
    state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
    saveState();
    render();
    return;
  }

  const adminAssigneeToggle = event.target.closest("[data-toggle-admin-assignee]");
  if (adminAssigneeToggle) {
    const nextAssignee = adminAssigneeToggle.getAttribute("data-toggle-admin-assignee");
    state.ui.expandedAdminAssignee = state.ui.expandedAdminAssignee === nextAssignee ? "" : nextAssignee;
    saveState();
    render();
    return;
  }

  if (event.target.closest("[data-reset-demo]")) {
    if (isSupabaseMode() && isAuthenticated()) {
      loadSupabaseState()
        .then(() => {
          window.location.hash = "#/dashboard";
          render();
        })
        .catch((error) => {
          runtime.syncError = error.message;
          render();
        });
    } else {
      state = normalizeState(createInitialState());
      saveState();
      window.location.hash = "#/dashboard";
      render();
    }
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
    return;
  }

  if (event.target.matches("[data-material-search]")) {
    const selectionStart = event.target.selectionStart ?? event.target.value.length;
    const selectionEnd = event.target.selectionEnd ?? event.target.value.length;
    state.ui.materialSearch = event.target.value;
    state.ui.selectedMaterialId = "";
    saveState();
    render();
    restoreMaterialSearchFocus(selectionStart, selectionEnd);
    return;
  }

  if (event.target.matches("[data-work-search]")) {
    const selectionStart = event.target.selectionStart ?? event.target.value.length;
    const selectionEnd = event.target.selectionEnd ?? event.target.value.length;
    state.ui.workSearch = event.target.value;
    state.ui.selectedWorkId = "";
    saveState();
    render();
    restoreWorkSearchFocus(selectionStart, selectionEnd);
    return;
  }
}

function handleSubmit(event) {
  const loginForm = event.target.closest("[data-login-form]");
  if (loginForm) {
    event.preventDefault();
    const formData = new FormData(loginForm);
    runtime.authError = "";
    runtime.syncError = "";
    runtime.authPending = true;
    render();

    signInWithPassword(
      runtime.supabase,
      String(formData.get("email") || ""),
      String(formData.get("password") || "")
    )
      .then(() => {
        resetUiStateForLiveSession();
        saveState();
        if (window.location.hash !== "#/dashboard") {
          window.location.hash = "#/dashboard";
        }
      })
      .catch((error) => {
        runtime.authPending = false;
        runtime.authError = error.message;
        render();
      });
    return;
  }

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

  const workForm = event.target.closest("[data-work-form]");
  if (workForm) {
    event.preventDefault();
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να αποθηκεύσετε το νέο άρθρο εργασίας;")) {
      return;
    }
    addWorkItem(workForm.getAttribute("data-work-form"), new FormData(workForm));
    return;
  }

  const safetyForm = event.target.closest("[data-safety-form]");
  if (safetyForm) {
    event.preventDefault();
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να αποθηκεύσετε το Health & Safety survey;")) {
      return;
    }
    updateSafety(safetyForm.getAttribute("data-safety-form"), new FormData(safetyForm));
    return;
  }

}

function commitTaskChange(taskId, mutateTask, summary, details) {
  const currentUser = getCurrentUser();
  const previousTask = getTaskById(taskId) ? deepClone(getTaskById(taskId)) : null;
  let syncedTask = null;
  let newHistoryEntry = null;

  state.tasks = state.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    const nextTask = deepClone(task);
    mutateTask(nextTask);
    nextTask.updatedAt = new Date().toISOString();
    nextTask.updatedBy = currentUser.name;
    nextTask.updatedById = currentUser.id;
    newHistoryEntry = {
      id: createUuid(),
      authorId: currentUser.id,
      author: currentUser.name,
      at: nextTask.updatedAt,
      summary,
      details
    };
    nextTask.history.unshift(newHistoryEntry);
    syncedTask = nextTask;
    return nextTask;
  });

  saveState();
  render();
  if (syncedTask) {
    queueSupabaseTaskSync(syncedTask, previousTask, newHistoryEntry);
  }
}

function createTaskFromForm(formData) {
  const currentUser = getCurrentUser();
  const startDate = formData.get("startDate");
  const createdAt = new Date().toISOString();
  const pipeline = formData.get("pipeline") || "autopsia";
  const selectedTeamId = formData.get("resourceTeam") || "";
  const selectedTeamUser = getAssignableUserById(selectedTeamId);
  const hasDirectAssignment = !!selectedTeamUser;

  const newTask = {
    id: createUuid(),
    taskCode: createId("TASK"),
    title: formData.get("title"),
    type: inferTaskTypeFromPipeline(pipeline),
    pipeline,
    status: hasDirectAssignment ? "assigned" : "unassigned",
    serviceProvider: formData.get("serviceProvider") || "other",
    address: formData.get("address"),
    city: formData.get("city"),
    customerName: formData.get("customerName"),
    mobilePhone: formData.get("mobilePhone"),
    landlinePhone: formData.get("landlinePhone"),
    srId: formData.get("srId"),
    bid: formData.get("bid"),
    projectName: formData.get("projectName"),
    resourceTeam: selectedTeamUser?.name || "",
    assignedAt: hasDirectAssignment ? createdAt : "",
    completedAt: "",
    assignedUserId: selectedTeamUser?.id || "",
    assignedUserName: selectedTeamUser?.name || "",
    startDate,
    endDate: "",
    adminNotes: formData.get("adminNotes"),
    partnerNotes: "",
    createdAt,
    createdBy: currentUser.name,
    createdById: currentUser.id,
    updatedAt: createdAt,
    updatedBy: currentUser.name,
    updatedById: currentUser.id,
    flags: {
      apiStatus: isSupabaseMode() ? "SYNCED" : "LOCAL-ONLY",
      validationLock: false,
      openIssues: false,
      smartReadiness: "Σε αναμονή",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationRequestedById: "",
      cancellationReason: "",
      pendingDocumentReason: ""
    },
    photos: [],
    files: [],
    history: [
      {
        id: createUuid(),
        authorId: currentUser.id,
        author: currentUser.name,
        at: createdAt,
        summary: "Δημιουργία εργασίας",
        details: hasDirectAssignment
          ? `Η εργασία δημιουργήθηκε και ανατέθηκε απευθείας στον ${selectedTeamUser.name}.`
          : "Η εργασία δημιουργήθηκε και περιμένει ανάθεση από τον admin."
      }
    ],
    detailLoaded: true,
    pipelineHistory: [],
    fiberStageKey: pipeline === "leitourgies_inwn" ? getDefaultLeitourgiesInwnStage(formData.get("serviceProvider") || "other") : "",
    fiberStageHistory: [],
    materials: [],
    workItems: [],
    safety: [
      {
        id: createUuid(),
        item: "Γενικός έλεγχος πρόσβασης",
        status: "needs-review",
        note: "Νέα εγγραφή",
        position: 0,
        createdById: currentUser.id,
        updatedById: currentUser.id
      }
    ]
  };

  state.tasks.unshift(newTask);
  state.ui.showCreateModal = false;
  state.ui.activeTab = "main";
  saveState();
  window.location.hash = `#/tasks/${encodeURIComponent(newTask.id)}`;
  render();
  queueSupabaseTaskSync(newTask, null, newTask.history[0]);
}

function updateTaskCore(taskId, formData) {
  const nextValues = Object.fromEntries(formData.entries());
  const assignedUserId = nextValues.assignedUserId || "";
  const assignedUser = getAssignableUserById(assignedUserId);
  const currentUser = getCurrentUser();

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

      if (nextValues.pipeline !== undefined) {
        const previousPipeline = task.pipeline;
        task.pipeline = nextValues.pipeline || "autopsia";
        task.type = inferTaskTypeFromPipeline(task.pipeline);

        if (task.pipeline === "leitourgies_inwn") {
          if (previousPipeline !== "leitourgies_inwn") {
            task.fiberStageKey = getDefaultLeitourgiesInwnStage(task.serviceProvider);
            task.fiberStageHistory = [];
          }
        } else if (previousPipeline === "leitourgies_inwn") {
          task.fiberStageKey = "";
        }
      }

      if (nextValues.projectName !== undefined) {
        task.projectName = nextValues.projectName;
      }

      if (nextValues.serviceProvider !== undefined) {
        task.serviceProvider = nextValues.serviceProvider || "other";
        if (task.pipeline === "leitourgies_inwn") {
          const availableStages = getLeitourgiesInwnStageFlow(task.serviceProvider);
          if (!availableStages.includes(task.fiberStageKey)) {
            task.fiberStageKey = availableStages[availableStages.length - 1] || getDefaultLeitourgiesInwnStage(task.serviceProvider);
          }
        }
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
        const selectedTeamUser = getAssignableUserById(nextValues.resourceTeam);
        task.resourceTeam = selectedTeamUser?.name || nextValues.resourceTeam || "";
      }

      if (nextValues.address !== undefined) {
        task.address = nextValues.address;
      }

      if (nextValues.city !== undefined) {
        task.city = nextValues.city;
      }

      if (nextValues.adminNotes !== undefined) {
        task.adminNotes = nextValues.adminNotes;
      }

      if (nextValues.partnerNotes !== undefined) {
        task.partnerNotes = nextValues.partnerNotes;
      }

      if (nextValues.startDate !== undefined) {
        const previousStartDate = task.startDate || "";
        task.startDate = nextValues.startDate;
        const effectiveAssignedUserId = nextValues.assignedUserId !== undefined ? assignedUserId : task.assignedUserId;
        const isExecutorEditor = currentUser.id === effectiveAssignedUserId;
        if (isExecutorEditor && nextValues.startDate && nextValues.startDate !== previousStartDate) {
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

      if (["unassigned", "assigned", "scheduled", "cancelled"].includes(task.status)) {
        if (!task.assignedUserId) {
          task.status = task.status === "cancelled" ? "cancelled" : "unassigned";
        } else if (assignmentChanged || ["unassigned", "cancelled"].includes(task.status)) {
          const assignedToCurrentUser = currentUser.id === task.assignedUserId;
          if (task.startDate && assignedToCurrentUser) {
            task.status = "scheduled";
          } else {
            task.status = "assigned";
          }
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
  const catalogId = formData.get("catalogId");
  const quantity = Number(formData.get("quantity"));
  const catalogItem = state.inventory.find((item) => item.id === catalogId);

  if (!catalogItem) {
    window.alert("Επίλεξε υλικό από το catalog αποθέματος.");
    return;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    window.alert("Η ποσότητα πρέπει να είναι μεγαλύτερη από το μηδέν.");
    return;
  }

  state.ui.materialSearch = "";
  state.ui.selectedMaterialId = "";

  commitTaskChange(
    taskId,
    (task) => {
      task.materials.unshift({
        id: createUuid(),
        catalogId: catalogItem.id,
        code: catalogItem.code,
        description: catalogItem.description,
        quantity,
        unit: catalogItem.unit,
        createdById: getCurrentUser().id
      });
    },
    "Προσθήκη υλικού",
    `Καταχωρήθηκε νέο υλικό στη λίστα της εργασίας: ${catalogItem.code} · ${catalogItem.description}.`
  );
}

function addWorkItem(taskId, formData) {
  const catalogId = formData.get("catalogId");
  const catalogSource = runtime.workCatalog?.length ? runtime.workCatalog : WORK_CATALOG_SEED;
  const catalogItem = catalogSource.find((item) => item.id === catalogId);

  if (!catalogItem) {
    window.alert("Επίλεξε άρθρο - εργασία από το catalog εργασιών.");
    return;
  }

  state.ui.workSearch = "";
  state.ui.selectedWorkId = "";

  commitTaskChange(
    taskId,
    (task) => {
      task.workItems.unshift({
        id: createUuid(),
        catalogId: catalogItem.id,
        article: catalogItem.article,
        description: catalogItem.description,
        createdById: getCurrentUser().id
      });
    },
    "Προσθήκη άρθρου εργασίας",
    `Καταχωρήθηκε νέο άρθρο εργασίας στη λίστα της εργασίας: ${catalogItem.article} · ${catalogItem.description}.`
  );
}

function updateSafety(taskId, formData) {
  commitTaskChange(
    taskId,
    (task) => {
      task.safety = task.safety.map((item) => ({
        ...item,
        status: formData.get(`status-${item.id}`),
        note: formData.get(`note-${item.id}`),
        updatedById: getCurrentUser().id
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
    const task = getTaskById(taskId);

    if (!task) {
      return;
    }

    const missingDocumentsReason = getMissingRequiredDocumentsReason(task);

    if (missingDocumentsReason) {
      commitTaskChange(
        taskId,
        (nextTask) => {
          nextTask.status = "completed_with_pending";
          nextTask.flags.validationLock = false;
          nextTask.flags.openIssues = true;
          nextTask.flags.pendingDocumentReason = missingDocumentsReason;
          if (!nextTask.endDate) {
            nextTask.endDate = new Date().toISOString().slice(0, 16);
          }
        },
        "Ολοκλήρωση με εκκρεμότητα",
        missingDocumentsReason
      );
      window.alert("Λείπουν τα απαιτούμενα έγγραφα. Η εργασία μεταφέρθηκε σε 'Ολοκληρωμένο με εκκρεμότητα'.");
      return;
    }

    if (task.pipeline === "leitourgies_inwn" && !isLeitourgiesFinalStage(task)) {
      const currentStageKey = getCurrentLeitourgiesStageKey(task);
      const currentStageMeta = LEITOURGIES_INWN_STAGE_META[currentStageKey];
      const nextStageKey = getNextLeitourgiesStageKey(task);
      const nextStageMeta = LEITOURGIES_INWN_STAGE_META[nextStageKey];

      commitTaskChange(
        taskId,
        (nextTask) => {
          const completedAt = new Date().toISOString();
          const stageSummary = {
            id: createUuid(),
            stage: currentStageKey,
            completedAt,
            completedById: getCurrentUser().id,
            completedBy: getCurrentUser().name,
            skipped: false
          };

          nextTask.fiberStageHistory.unshift(stageSummary);
          nextTask.fiberStageKey = nextStageKey;
          nextTask.status = nextTask.assignedUserId ? "assigned" : "unassigned";
          nextTask.startDate = "";
          nextTask.endDate = "";
          nextTask.flags.validationLock = false;
          nextTask.flags.openIssues = false;

          if (task.serviceProvider !== "cosmote" && !hasFiberStageEntry(nextTask, "energopoiisi")) {
            const currentFlow = getLeitourgiesInwnStageFlow(task.serviceProvider);
            const currentIndex = currentFlow.indexOf(nextStageKey);
            if (currentIndex >= 0 && currentIndex > currentFlow.indexOf("entos_ktiriou")) {
              nextTask.fiberStageHistory.unshift({
                id: createUuid(),
                completedById: getCurrentUser().id,
                stage: "energopoiisi",
                completedAt,
                completedBy: getCurrentUser().name,
                skipped: true
              });
            }
          }
        },
        `Ολοκλήρωση σταδίου ${currentStageMeta.label}`,
        nextStageMeta
          ? `Το στάδιο ${currentStageMeta.label} ολοκληρώθηκε και άνοιξε αυτόματα το επόμενο στάδιο ${nextStageMeta.label}.`
          : `Το στάδιο ${currentStageMeta.label} ολοκληρώθηκε.`
      );
      return;
    }

    commitTaskChange(
      taskId,
      (task) => {
        task.status = "pending_validation";
        task.flags.validationLock = true;
        task.flags.openIssues = false;
        task.flags.pendingDocumentReason = "";
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
        nextTask.flags.cancellationRequestedById = getCurrentUser().id;
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
    const task = getTaskById(taskId);

    if (!task) {
      return;
    }

    const nextPipeline = PIPELINE_META[task.pipeline]?.next;

    if (nextPipeline) {
      commitTaskChange(
        taskId,
        (nextTask) => {
          const approvedAt = new Date().toISOString();
          const hasAssignedPartner = !!nextTask.assignedUserId;
          const leavingLeitourgiesInwn = nextTask.pipeline === "leitourgies_inwn";

          if (leavingLeitourgiesInwn) {
            const currentStageKey = getCurrentLeitourgiesStageKey(nextTask);
            if (currentStageKey && !hasFiberStageEntry(nextTask, currentStageKey)) {
              nextTask.fiberStageHistory.unshift({
                id: createUuid(),
                stage: currentStageKey,
                completedAt: approvedAt,
                completedById: getCurrentUser().id,
                completedBy: getCurrentUser().name,
                skipped: false
              });
            }
          }

          nextTask.pipelineHistory.unshift({
            id: createUuid(),
            pipeline: nextTask.pipeline,
            completedAt: approvedAt,
            approvedById: getCurrentUser().id,
            approvedBy: getCurrentUser().name
          });
          nextTask.pipeline = nextPipeline;
          nextTask.status = hasAssignedPartner ? "assigned" : "unassigned";
          nextTask.assignedAt = hasAssignedPartner ? approvedAt : "";
          nextTask.startDate = "";
          nextTask.endDate = "";
          nextTask.completedAt = "";
          if (nextPipeline === "leitourgies_inwn") {
            nextTask.fiberStageKey = getDefaultLeitourgiesInwnStage(nextTask.serviceProvider);
            nextTask.fiberStageHistory = [];
          } else if (leavingLeitourgiesInwn) {
            nextTask.fiberStageKey = "";
          }
          nextTask.flags.validationLock = false;
          nextTask.flags.openIssues = false;
          nextTask.flags.pendingDocumentReason = "";
          nextTask.flags.cancellationRequested = false;
          nextTask.flags.cancellationRequestedAt = "";
          nextTask.flags.cancellationRequestedBy = "";
          nextTask.flags.cancellationRequestedById = "";
          nextTask.flags.cancellationReason = "";
        },
        `Ολοκλήρωση pipeline ${PIPELINE_META[task.pipeline].label}`,
        validationComment ||
          `Η φάση ${PIPELINE_META[task.pipeline].label} εγκρίθηκε και η ίδια εργασία μεταφέρθηκε ως ανατεθειμένη στο pipeline ${PIPELINE_META[nextPipeline].label}.`
      );
      state.ui.validationComment = "";
      saveState();
      render();
      return;
    }

    commitTaskChange(
      taskId,
      (task) => {
        task.status = "completed";
        task.flags.validationLock = false;
        task.flags.openIssues = false;
        task.flags.pendingDocumentReason = "";
        task.flags.cancellationRequested = false;
        task.flags.cancellationRequestedAt = "";
        task.flags.cancellationRequestedBy = "";
        task.flags.cancellationRequestedById = "";
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
        task.status = "cancelled";
        task.assignedUserId = "";
        task.assignedUserName = "";
        task.assignedAt = "";
        task.startDate = "";
        task.endDate = "";
        task.completedAt = "";
        task.flags.validationLock = false;
        task.flags.openIssues = false;
        task.flags.pendingDocumentReason = "";
        task.flags.cancellationRequested = false;
        task.flags.cancellationRequestedAt = "";
        task.flags.cancellationRequestedBy = "";
        task.flags.cancellationRequestedById = "";
        task.flags.cancellationReason = "";
      },
      "Έγκριση αιτήματος ακύρωσης",
      validationComment || "Ο admin ενέκρινε το αίτημα ακύρωσης και η εργασία μεταφέρθηκε σε ακυρωμένη."
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
        task.flags.cancellationRequestedById = "";
        task.flags.cancellationReason = "";
        task.flags.pendingDocumentReason = "";
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
        task.flags.pendingDocumentReason = "";
        task.flags.cancellationRequested = false;
        task.flags.cancellationRequestedAt = "";
        task.flags.cancellationRequestedBy = "";
        task.flags.cancellationRequestedById = "";
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

async function handlePhotoUpload(input) {
  const files = Array.from(input.files || []);
  if (!files.length) {
    return;
  }

  const route = getRoute();
  const taskId = route.taskId;
  const category = input.closest("form")?.querySelector("select[name='category']")?.value || "before";
  const currentUser = getCurrentUser();

  try {
    let photos = [];

    if (isSupabaseMode() && isAuthenticated()) {
      photos = await uploadTaskPhotos(runtime.supabase, taskId, files, category, currentUser);
    } else {
      photos = await Promise.all(
        files.map(
          (file) =>
            new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  id: createUuid(),
                  name: file.name,
                  category,
                  uploadedById: currentUser.id,
                  uploadedBy: currentUser.name,
                  uploadedAt: new Date().toISOString(),
                  preview: reader.result,
                  storagePath: "",
                  metadata: {
                    size: file.size || 0,
                    mimeType: file.type || "image/jpeg"
                  }
                });
              };
              reader.readAsDataURL(file);
            })
        )
      );
    }

    commitTaskChange(
      taskId,
      (task) => {
        task.photos.unshift(...photos);
      },
      "Μεταφόρτωση φωτογραφιών",
      `Ανέβηκαν ${photos.length} νέες φωτογραφίες στην κατηγορία ${category}.`
    );
  } catch (error) {
    runtime.syncError = error.message;
    window.alert(`Η μεταφόρτωση φωτογραφιών απέτυχε: ${error.message}`);
    render();
  } finally {
    input.value = "";
  }
}

async function handleFileUpload(input) {
  const files = Array.from(input.files || []);
  if (!files.length) {
    return;
  }

  const taskId = input.getAttribute("data-task-id");
  const currentUser = getCurrentUser();

  try {
    const nextFiles =
      isSupabaseMode() && isAuthenticated()
        ? await uploadTaskFiles(runtime.supabase, taskId, files, currentUser)
        : files.map((file) => ({
            id: createUuid(),
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            uploadedById: currentUser.id,
            uploadedBy: currentUser.name,
            uploadedAt: new Date().toISOString(),
            storagePath: "",
            downloadUrl: ""
          }));

    commitTaskChange(
      taskId,
      (task) => {
        task.files.unshift(...nextFiles);
      },
      "Μεταφόρτωση αρχείων",
      `Ανέβηκαν ${files.length} νέα συνημμένα αρχεία.`
    );
  } catch (error) {
    runtime.syncError = error.message;
    window.alert(`Η μεταφόρτωση αρχείων απέτυχε: ${error.message}`);
    render();
  } finally {
    input.value = "";
  }
}
