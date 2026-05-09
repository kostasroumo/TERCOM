import { TaskCard } from "./components/TaskCard.js";
import { TaskDetail } from "./components/TaskDetail.js";
import { TaskTable } from "./components/TaskTable.js";
import { AdminUsers } from "./components/AdminUsers.js";
import { AdminTaskReport } from "./components/AdminTaskReport.js";
import { ModuleHub } from "./components/ModuleHub.js";
import { MATERIAL_CATALOG_SEED } from "./data/materialCatalog.js";
import { TASK_MODULES_SEED, getLocalVisibleModuleKeys } from "./data/taskModules.js";
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
import { createManagedUser, fetchAdminUsers, updateManagedUser } from "./lib/adminUsersApi.js";
import {
  createSupabaseBrowserClient,
  deleteProfileContract,
  fetchActiveProfileContract,
  fetchActiveProfileContracts,
  fetchSupabaseAdminTaskReport,
  fetchSupabaseBootstrapData,
  fetchSupabaseCatalogs,
  fetchSupabaseTaskSummaries,
  fetchSupabaseTaskDetail,
  persistTaskToSupabase,
  signInWithPassword,
  signOutSession,
  uploadProfileContract,
  uploadTaskFiles,
  uploadTaskPhotos
} from "./lib/supabaseBackend.js";
import { exportAdminTaskReportWorkbook } from "./lib/adminTaskReportExport.js";

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
  profileContract: null,
  profiles: [],
  taskModules: [],
  dashboardSummary: null,
  tasksLoaded: false,
  catalogsLoaded: false,
  workCatalog: [...WORK_CATALOG_SEED],
  authError: "",
  syncError: "",
  syncQueue: Promise.resolve(),
  authSubscription: null,
  activeBootstrapLoad: null,
  activeBootstrapToken: "",
  lastLoadedSessionToken: "",
  bootstrapDiagnostics: {
    lastSource: "",
    lastReason: "",
    lastDurationMs: 0,
    lastLoadedAt: "",
    lastFallbackError: "",
    rpcCount: 0,
    fallbackCount: 0
  },
  adminUsers: [],
  adminUsersLoaded: false,
  adminUsersPending: false,
  adminUsersError: "",
  adminUsersMessage: "",
  activeAdminUsersLoad: null,
  adminTaskReportRows: [],
  adminTaskReportError: "",
  adminTaskReportPending: false,
  adminTaskReportExportPending: false,
  adminTaskReportSignature: "",
  activeAdminTaskReportLoad: null,
  activeAdminTaskReportSignature: "",
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
      activeModuleKey: "ftth",
      adminTaskReport: createDefaultAdminTaskReportState(),
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
  state.ui.adminTaskReport = createDefaultAdminTaskReportState();
  state.ui.validationComment = "";
  state.ui.cancellationComment = "";
  state.ui.materialSearch = "";
  state.ui.selectedMaterialId = "";
  state.ui.workSearch = "";
  state.ui.selectedWorkId = "";
}

function formatDateInputValue(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftCalendarDays(baseValue, amount) {
  const date = baseValue instanceof Date ? new Date(baseValue.getTime()) : new Date(baseValue);
  date.setDate(date.getDate() + amount);
  return date;
}

function createDefaultAdminTaskReportState(userId = "") {
  const today = new Date();
  return {
    userId,
    moduleKey: "all",
    datePreset: "last30",
    fromDate: formatDateInputValue(shiftCalendarDays(today, -29)),
    toDate: formatDateInputValue(today),
    statusKeys: ["completed", "completed_with_pending"]
  };
}

function normalizeAdminTaskReportState(source = {}, fallbackUserId = "") {
  const defaults = createDefaultAdminTaskReportState(fallbackUserId || source.userId || "");
  const allowedStatuses = new Set(Object.keys(STATUS_META));
  const hasExplicitStatusKeys = Array.isArray(source.statusKeys);
  const normalizedStatusKeys = [...new Set(Array.isArray(source.statusKeys) ? source.statusKeys.filter((statusKey) => allowedStatuses.has(statusKey)) : [])];
  const nextState = {
    ...defaults,
    ...source,
    userId: source.userId || fallbackUserId || defaults.userId,
    moduleKey: source.moduleKey || defaults.moduleKey,
    datePreset: source.datePreset || defaults.datePreset,
    fromDate: source.fromDate || defaults.fromDate,
    toDate: source.toDate || defaults.toDate,
    statusKeys: hasExplicitStatusKeys ? normalizedStatusKeys : defaults.statusKeys
  };

  if (nextState.fromDate && nextState.toDate && nextState.fromDate > nextState.toDate) {
    const originalFromDate = nextState.fromDate;
    nextState.fromDate = nextState.toDate;
    nextState.toDate = originalFromDate;
  }

  return nextState;
}

function getAdminTaskReportState(userId = "") {
  const normalizedState = normalizeAdminTaskReportState(state.ui.adminTaskReport || {}, userId);
  state.ui.adminTaskReport = normalizedState;
  return normalizedState;
}

function setAdminTaskReportState(patch = {}, userId = "") {
  state.ui.adminTaskReport = normalizeAdminTaskReportState(
    {
      ...getAdminTaskReportState(userId),
      ...patch,
      userId: patch.userId || userId || state.ui.adminTaskReport?.userId || ""
    },
    userId
  );
}

function applyAdminTaskReportPreset(preset, userId = "") {
  const currentState = getAdminTaskReportState(userId);
  const today = new Date();
  let nextFromDate = currentState.fromDate;
  let nextToDate = currentState.toDate;

  if (preset === "last7") {
    nextFromDate = formatDateInputValue(shiftCalendarDays(today, -6));
    nextToDate = formatDateInputValue(today);
  } else if (preset === "last30") {
    nextFromDate = formatDateInputValue(shiftCalendarDays(today, -29));
    nextToDate = formatDateInputValue(today);
  } else if (preset === "month") {
    nextFromDate = formatDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
    nextToDate = formatDateInputValue(today);
  }

  setAdminTaskReportState(
    {
      datePreset: preset,
      fromDate: nextFromDate,
      toDate: nextToDate
    },
    userId
  );
}

function resetTaskFilters() {
  state.filters.search = "";
  state.filters.status = "all";
  state.filters.pipeline = "all";
  state.filters.city = "all";
  state.filters.technician = "all";
}

function formatClockTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
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

      runtime.authSubscription?.unsubscribe?.();
      const { data } = runtime.supabase.auth.onAuthStateChange((event, session) => {
        runtime.session = session;
        runtime.authError = "";

        if (!session) {
          clearSupabaseLiveState();
          runtime.authPending = false;
          runtime.loading = false;
          render();
          return;
        }

        if (
          runtime.lastLoadedSessionToken === session.access_token &&
          runtime.profile?.id === session.user?.id
        ) {
          runtime.authPending = false;
          runtime.loading = false;
          render();
          return;
        }

        if (window.location.hash !== "#/dashboard") {
          window.location.hash = "#/dashboard";
        }

        runtime.authPending = false;
        runtime.loading = false;
        render();

        window.setTimeout(() => {
          scheduleSupabaseHydration(`auth:${event}`, session);
        }, 0);
      });
      runtime.authSubscription = data.subscription;

      runtime.loading = false;
      render();

      runtime.supabase.auth
        .getSession()
        .then(({ data }) => {
          const restoredSession = data.session;
          if (!restoredSession) {
            return;
          }

          runtime.session = restoredSession;
          runtime.loading = false;
          render();

          window.setTimeout(() => {
            scheduleSupabaseHydration("session-restore", restoredSession);
          }, 0);
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

function updateBootstrapDiagnostics(meta = {}, reason = "") {
  if (!meta?.source || meta.source === "none") {
    return;
  }

  runtime.bootstrapDiagnostics.lastSource = meta.source;
  runtime.bootstrapDiagnostics.lastReason = reason || "";
  runtime.bootstrapDiagnostics.lastDurationMs = Number(meta.durationMs) || 0;
  runtime.bootstrapDiagnostics.lastLoadedAt = new Date().toISOString();
  runtime.bootstrapDiagnostics.lastFallbackError = meta.fallbackError || "";

  if (meta.source === "rpc") {
    runtime.bootstrapDiagnostics.rpcCount += 1;
  }

  if (meta.source === "fallback") {
    runtime.bootstrapDiagnostics.fallbackCount += 1;
  }
}

async function loadSupabaseState(reason = "") {
  const payload = await fetchSupabaseBootstrapData(runtime.supabase, runtime.session);

  runtime.session = payload.session;
  runtime.profile = payload.profile;
  runtime.profiles = payload.profiles;
  runtime.taskModules = (payload.taskModules || []).map(normalizeTaskModule);
  runtime.dashboardSummary =
    payload.dashboardSummary || buildDashboardSummaryFromTasks(payload.tasks || [], payload.profiles || [], payload.profile || null);
  runtime.tasksLoaded = !!payload.tasksLoaded;
  runtime.catalogsLoaded = !!((payload.workCatalog && payload.workCatalog.length) || (payload.inventory && payload.inventory.length));
  runtime.workCatalog = payload.workCatalog?.length ? payload.workCatalog : [...WORK_CATALOG_SEED];
  runtime.adminUsersLoaded = false;
  runtime.adminUsers = [];
  runtime.adminUsersError = "";
  runtime.adminUsersMessage = "";
  state.tasks = (payload.tasks || []).map(normalizeTask);
  state.inventory = payload.inventory?.length ? payload.inventory : MATERIAL_CATALOG_SEED.map(normalizeInventoryItem);
  state.currentRole = payload.profile?.role || "partner";
  state.currentUserId = payload.profile?.id || "";
  ensureActiveModuleKey(state.ui.activeModuleKey);
  updateBootstrapDiagnostics(payload.bootstrapMeta, reason);
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
  await hydrateCurrentProfileContract(payload.profile?.id || "");
  saveState();

  if (payload.profile && payload.profile.isActive === false) {
    await signOutSession(runtime.supabase).catch(() => {});
    clearSupabaseLiveState();
    runtime.authError = "Ο λογαριασμός έχει απενεργοποιηθεί. Επικοινώνησε με τον admin.";
    runtime.loading = false;
  }
}

function clearSupabaseLiveState() {
  runtime.profile = null;
  runtime.profileContract = null;
  runtime.profiles = [];
  runtime.taskModules = [];
  runtime.dashboardSummary = null;
  runtime.tasksLoaded = false;
  runtime.catalogsLoaded = false;
  runtime.lastLoadedSessionToken = "";
  runtime.activeBootstrapLoad = null;
  runtime.activeBootstrapToken = "";
  runtime.bootstrapDiagnostics = {
    lastSource: "",
    lastReason: "",
    lastDurationMs: 0,
    lastLoadedAt: "",
    lastFallbackError: "",
    rpcCount: 0,
    fallbackCount: 0
  };
  runtime.adminUsers = [];
  runtime.adminUsersLoaded = false;
  runtime.adminUsersPending = false;
  runtime.adminUsersError = "";
  runtime.adminUsersMessage = "";
  runtime.activeAdminUsersLoad = null;
  runtime.adminTaskReportRows = [];
  runtime.adminTaskReportError = "";
  runtime.adminTaskReportPending = false;
  runtime.adminTaskReportExportPending = false;
  runtime.adminTaskReportSignature = "";
  runtime.activeAdminTaskReportLoad = null;
  runtime.activeAdminTaskReportSignature = "";
  state.currentRole = "admin";
  state.currentUserId = USER_DIRECTORY.admin[0]?.id || "";
  state.ui.activeModuleKey = "ftth";
  state.ui.adminTaskReport = createDefaultAdminTaskReportState();
  resetUiStateForLiveSession();
  saveState();
}

function scheduleSupabaseHydration(reason, session = runtime.session) {
  const token = session?.access_token || "";

  if (!token) {
    return Promise.resolve();
  }

  if (
    runtime.lastLoadedSessionToken === token &&
    runtime.profile?.id === session?.user?.id
  ) {
    console.info("[bootstrap] skip already loaded", reason);
    return Promise.resolve();
  }

  if (runtime.activeBootstrapLoad && runtime.activeBootstrapToken === token) {
    console.info("[bootstrap] join active load", reason);
    return runtime.activeBootstrapLoad;
  }

  runtime.session = session;
  runtime.activeBootstrapToken = token;
  console.info("[bootstrap] start", reason);

  runtime.activeBootstrapLoad = withTimeout(
    loadSupabaseState(reason),
    15000,
    "Η φόρτωση των δεδομένων από Supabase"
  )
    .then(() => {
      runtime.syncError = "";
      console.info("[bootstrap] done", reason);
    })
    .catch((error) => {
      runtime.syncError = error.message;
      console.error("[bootstrap] failed", reason, error);
    })
    .finally(() => {
      runtime.activeBootstrapLoad = null;
      runtime.activeBootstrapToken = "";
      render();
    });

  render();
  return runtime.activeBootstrapLoad;
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
    render();
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
    render();
  })();

  try {
    await runtime.activeCatalogLoad;
  } finally {
    runtime.activeCatalogLoad = null;
  }
}

function normalizeManagedUser(user) {
  return {
    id: user.id || "",
    email: user.email || "",
    role: user.role || "partner",
    displayName: user.displayName || user.display_name || "",
    companyName: user.companyName || user.company_name || "",
    title: user.title || "",
    isActive: user.isActive !== false && user.is_active !== false,
    contract: normalizeProfileContract(user.contract || user.activeContract || null),
    moduleKeys: Array.isArray(user.moduleKeys) ? user.moduleKeys : Array.isArray(user.module_keys) ? user.module_keys : [],
    createdAt: user.createdAt || user.created_at || "",
    updatedAt: user.updatedAt || user.updated_at || ""
  };
}

function normalizeProfileContract(contract) {
  if (!contract) {
    return null;
  }

  return {
    id: contract.id || "",
    profileId: contract.profileId || contract.profile_id || "",
    fileName: contract.fileName || contract.file_name || "",
    storagePath: contract.storagePath || contract.storage_path || "",
    mimeType: contract.mimeType || contract.mime_type || "application/pdf",
    sizeBytes: Number(contract.sizeBytes ?? contract.size_bytes) || 0,
    uploadedById: contract.uploadedById || contract.uploaded_by || "",
    uploadedAt: contract.uploadedAt || contract.uploaded_at || "",
    isActive: contract.isActive !== false && contract.is_active !== false,
    downloadUrl: contract.downloadUrl || contract.download_url || ""
  };
}

function normalizeTaskModule(module, index = 0) {
  return {
    id: module.id || `module-${module.key || index}`,
    key: module.key || module.moduleKey || module.module_key || "ftth",
    name: module.name || "Workspace",
    description: module.description || "",
    icon: module.icon || module.icon_name || "tasks",
    accent: module.accent || `module-${module.key || module.module_key || "ftth"}`,
    sortOrder: Number(module.sortOrder ?? module.sort_order ?? (index + 1) * 10) || (index + 1) * 10,
    isActive: module.isActive !== false && module.is_active !== false
  };
}

function getAllTaskModules() {
  const source = isSupabaseMode() && runtime.taskModules.length ? runtime.taskModules : TASK_MODULES_SEED;

  return source
    .map(normalizeTaskModule)
    .filter((module) => module.isActive !== false)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name, "el");
    });
}

function getVisibleTaskModules() {
  const modules = getAllTaskModules();

  if (state.currentRole === "admin") {
    return modules;
  }

  if (isSupabaseMode() && isAuthenticated()) {
    return modules;
  }

  const allowedKeys = new Set(getLocalVisibleModuleKeys(state.currentUserId, state.currentRole));
  return modules.filter((module) => allowedKeys.has(module.key));
}

function getTaskModuleByKey(moduleKey) {
  if (!moduleKey) {
    return null;
  }

  return getAllTaskModules().find((module) => module.key === moduleKey) || null;
}

function getFallbackModuleKey() {
  return getVisibleTaskModules()[0]?.key || "";
}

async function hydrateCurrentProfileContract(profileId) {
  if (!isSupabaseMode() || !isAuthenticated() || !profileId) {
    runtime.profileContract = null;
    return;
  }

  try {
    runtime.profileContract = await fetchActiveProfileContract(runtime.supabase, profileId);
  } catch (error) {
    console.warn("Profile contract bootstrap skipped:", error?.message || error);
    runtime.profileContract = null;
  }
}

async function hydrateManagedUserContracts(users) {
  const normalizedUsers = (users || []).map(normalizeManagedUser);

  if (!isSupabaseMode() || !isAuthenticated() || !normalizedUsers.length) {
    return normalizedUsers;
  }

  try {
    const contractMap = await fetchActiveProfileContracts(runtime.supabase, normalizedUsers.map((user) => user.id));
    return normalizedUsers.map((user) => ({
      ...user,
      contract: contractMap.get(user.id) || user.contract || null
    }));
  } catch (error) {
    console.warn("Managed user contracts skipped:", error?.message || error);
    return normalizedUsers;
  }
}

function ensureActiveModuleKey(candidateKey = "") {
  const nextKey = getTaskModuleByKey(candidateKey) && getVisibleTaskModules().some((module) => module.key === candidateKey)
    ? candidateKey
    : getFallbackModuleKey();

  state.ui.activeModuleKey = nextKey;
  return nextKey;
}

function buildModuleDashboardRoute(moduleKey) {
  return `#/module/${encodeURIComponent(moduleKey)}`;
}

function buildModuleTasksRoute(moduleKey) {
  return `#/module/${encodeURIComponent(moduleKey)}/tasks`;
}

function buildModuleTaskDetailRoute(moduleKey, taskId) {
  return `#/module/${encodeURIComponent(moduleKey)}/tasks/${encodeURIComponent(taskId)}`;
}

function buildModuleReportRoute(moduleKey) {
  return `#/module/${encodeURIComponent(moduleKey)}/reports/open-tasks`;
}

function buildAdminUserReportRoute(userId) {
  return `#/users/${encodeURIComponent(userId)}/report`;
}

async function ensureAdminUsersLoaded() {
  if (!canManageUsers()) {
    return;
  }

  if (runtime.adminUsersLoaded) {
    return;
  }

  if (runtime.activeAdminUsersLoad) {
    return runtime.activeAdminUsersLoad;
  }

  runtime.adminUsersError = "";
  runtime.activeAdminUsersLoad = (async () => {
    const payload = await fetchAdminUsers(runtime.session);
    runtime.adminUsers = await hydrateManagedUserContracts(payload.users || []);
    if (payload.modules?.length) {
      runtime.taskModules = payload.modules.map(normalizeTaskModule);
      ensureActiveModuleKey(state.ui.activeModuleKey);
    }
    runtime.adminUsersLoaded = true;
    runtime.adminUsersError = "";
    saveState();
    render();
  })();

  try {
    await runtime.activeAdminUsersLoad;
  } catch (error) {
    runtime.adminUsersError = error.message;
    render();
  } finally {
    runtime.activeAdminUsersLoad = null;
  }
}

function upsertManagedUserInRuntime(user) {
  const existingUser = runtime.adminUsers.find((entry) => entry.id === (user?.id || ""));
  const normalized = normalizeManagedUser({
    ...existingUser,
    ...user,
    contract: user?.contract || existingUser?.contract || null
  });
  const existingIndex = runtime.adminUsers.findIndex((entry) => entry.id === normalized.id);

  if (existingIndex >= 0) {
    runtime.adminUsers.splice(existingIndex, 1, normalized);
  } else {
    runtime.adminUsers.unshift(normalized);
  }

  runtime.adminUsers.sort((left, right) => (left.displayName || left.email).localeCompare(right.displayName || right.email, "el"));
}

function upsertManagedProfileInRuntime(user) {
  const normalizedProfile = {
    id: user.id || "",
    email: user.email || "",
    role: user.role || "partner",
    name: user.displayName || user.display_name || user.email || "",
    companyName: user.companyName || user.company_name || "",
    title: user.title || "",
    phone: user.phone || "",
    isActive: user.isActive !== false && user.is_active !== false
  };

  const existingIndex = runtime.profiles.findIndex((entry) => entry.id === normalizedProfile.id);

  if (existingIndex >= 0) {
    runtime.profiles.splice(existingIndex, 1, normalizedProfile);
  } else {
    runtime.profiles.push(normalizedProfile);
  }

  runtime.profiles.sort((left, right) => (left.name || left.email).localeCompare(right.name || right.email, "el"));
}

function getManagedUserById(userId) {
  if (!userId) {
    return null;
  }

  return runtime.adminUsers.find((user) => user.id === userId) || null;
}

function buildAdminTaskReportSignature(userId, filters = {}) {
  return JSON.stringify({
    userId,
    moduleKey: filters.moduleKey || "all",
    fromDate: filters.fromDate || "",
    toDate: filters.toDate || "",
    statusKeys: [...new Set(filters.statusKeys || [])].sort()
  });
}

function dateInputToBoundaryIso(value, boundary = "start") {
  if (!value) {
    return "";
  }

  const [year, month, day] = String(value)
    .split("-")
    .map((segment) => Number(segment));
  if (!year || !month || !day) {
    return "";
  }

  const date =
    boundary === "end"
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

async function ensureAdminTaskReportLoaded(userId, forceReload = false) {
  if (!canManageUsers() || !userId) {
    return;
  }

  const filters = getAdminTaskReportState(userId);
  const signature = buildAdminTaskReportSignature(userId, filters);

  if (!forceReload && runtime.adminTaskReportSignature === signature && !runtime.adminTaskReportError) {
    return;
  }

  if (!forceReload && runtime.activeAdminTaskReportLoad && runtime.activeAdminTaskReportSignature === signature) {
    return runtime.activeAdminTaskReportLoad;
  }

  if (!(filters.statusKeys || []).length) {
    runtime.adminTaskReportSignature = signature;
    runtime.adminTaskReportRows = [];
    runtime.adminTaskReportError = "";
    runtime.adminTaskReportPending = false;
    return;
  }

  runtime.adminTaskReportPending = true;
  runtime.adminTaskReportError = "";
  runtime.adminTaskReportSignature = signature;
  runtime.activeAdminTaskReportSignature = signature;
  runtime.adminTaskReportRows = [];

  runtime.activeAdminTaskReportLoad = (async () => {
    const payload = await fetchSupabaseAdminTaskReport(
      runtime.supabase,
      {
        assignedUserId: userId,
        moduleKey: filters.moduleKey,
        statusKeys: filters.statusKeys,
        completedFrom: dateInputToBoundaryIso(filters.fromDate, "start"),
        completedTo: dateInputToBoundaryIso(filters.toDate, "end")
      },
      runtime.session
    );

    runtime.adminTaskReportRows = (payload.tasks || []).map(normalizeTask);
    runtime.adminTaskReportError = "";
    saveState();
    render();
  })();

  try {
    await runtime.activeAdminTaskReportLoad;
  } catch (error) {
    runtime.adminTaskReportError = error.message;
    render();
  } finally {
    runtime.adminTaskReportPending = false;
    runtime.activeAdminTaskReportLoad = null;
    runtime.activeAdminTaskReportSignature = "";
    render();
  }
}

async function handleAdminUserCreate(formData) {
  if (!canManageUsers()) {
    return;
  }

  runtime.adminUsersPending = true;
  runtime.adminUsersError = "";
  runtime.adminUsersMessage = "";
  render();

  try {
    const user = await createManagedUser(runtime.session, {
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      displayName: String(formData.get("displayName") || ""),
      companyName: String(formData.get("companyName") || ""),
      title: String(formData.get("title") || ""),
      role: String(formData.get("role") || "partner"),
      moduleKeys: formData.getAll("moduleKeys").map((value) => String(value || ""))
    });

    upsertManagedUserInRuntime(user);
    upsertManagedProfileInRuntime(user);
    runtime.adminUsersLoaded = true;
    runtime.adminUsersMessage = "Ο χρήστης δημιουργήθηκε και είναι πλέον διαθέσιμος στο σύστημα.";
  } catch (error) {
    runtime.adminUsersError = error.message;
  } finally {
    runtime.adminUsersPending = false;
    render();
  }
}

async function handleAdminUserUpdate(formData) {
  if (!canManageUsers()) {
    return;
  }

  const userId = String(formData.get("id") || "");
  if (!userId) {
    return;
  }

  const existingUser = runtime.adminUsers.find((entry) => entry.id === userId);
  const contractFile = formData.get("contractFile");
  const contractAction = String(formData.get("contractAction") || "");

  runtime.adminUsersPending = true;
  runtime.adminUsersError = "";
  runtime.adminUsersMessage = "";
  render();

  try {
    const user = await updateManagedUser(runtime.session, {
      id: userId,
      displayName: String(formData.get("displayName") || ""),
      companyName: String(formData.get("companyName") || ""),
      title: String(formData.get("title") || ""),
      role: String(formData.get("role") || existingUser?.role || "partner"),
      moduleKeys: formData.getAll("moduleKeys").map((value) => String(value || "")),
      isActive: formData.get("isActive") == null
        ? existingUser?.isActive !== false
        : String(formData.get("isActive") || "true") === "true"
    });

    let nextContract = existingUser?.contract || null;
    let contractUploadError = "";
    if (contractAction === "delete") {
      if (existingUser?.contract) {
        await deleteProfileContract(runtime.supabase, existingUser.contract);
      }
      nextContract = null;
    } else if (contractFile instanceof File && contractFile.size) {
      try {
        nextContract = await uploadProfileContract(runtime.supabase, userId, contractFile, getCurrentUser());
      } catch (error) {
        contractUploadError = error.message;
      }
    }

    const enrichedUser = {
      ...user,
      contract: nextContract
    };

    upsertManagedUserInRuntime(enrichedUser);
    upsertManagedProfileInRuntime(enrichedUser);
    if (runtime.profile?.id === userId) {
      runtime.profileContract = normalizeProfileContract(nextContract);
    }
    runtime.adminUsersLoaded = true;
    runtime.adminUsersMessage = contractUploadError
      ? ""
      : enrichedUser.isActive === false
        ? "Ο χρήστης απενεργοποιήθηκε και δεν εμφανίζεται πλέον σε νέες αναθέσεις."
        : contractAction === "delete"
          ? "Η σύμβαση αφαιρέθηκε από το app για αυτόν τον χρήστη."
        : contractFile instanceof File && contractFile.size
          ? existingUser?.isActive === false
            ? "Ο χρήστης επανενεργοποιήθηκε και η σύμβαση αντικαταστάθηκε."
            : "Τα στοιχεία του χρήστη ενημερώθηκαν και η σύμβαση αποθηκεύτηκε."
          : existingUser?.isActive === false
            ? "Ο χρήστης επανενεργοποιήθηκε και μπορεί ξανά να συνδεθεί στο app."
            : "Τα στοιχεία του χρήστη ενημερώθηκαν.";
    runtime.adminUsersError = contractUploadError
      ? `Τα στοιχεία του χρήστη αποθηκεύτηκαν, αλλά η σύμβαση δεν ανέβηκε: ${contractUploadError}`
      : "";
  } catch (error) {
    runtime.adminUsersError = error.message;
  } finally {
    runtime.adminUsersPending = false;
    render();
  }
}

async function refreshSupabaseDashboardSummary() {
  if (!isSupabaseMode() || !isAuthenticated()) {
    return;
  }

  const payload = await fetchSupabaseBootstrapData(runtime.supabase, runtime.session);
  updateBootstrapDiagnostics(payload.bootstrapMeta, "dashboard-refresh");
  if (payload.profile) {
    runtime.profile = payload.profile;
  }
  if (payload.profiles?.length) {
    runtime.profiles = payload.profiles;
  }
  if (payload.taskModules?.length) {
    runtime.taskModules = payload.taskModules.map(normalizeTaskModule);
  }
  runtime.dashboardSummary =
    payload.dashboardSummary || buildDashboardSummaryFromTasks(state.tasks, runtime.profiles, runtime.profile);
}

function isSupabaseMode() {
  return runtime.mode === "supabase";
}

function hasAuthSession() {
  return !!runtime.session;
}

function hasLiveProfile() {
  return !!runtime.session && !!runtime.profile;
}

function isAuthenticated() {
  return hasLiveProfile();
}

function canManageUsers() {
  return isSupabaseMode() && runtime.profile?.role === "admin";
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
      cancelled: [],
      archived: []
    }
  };
}

function buildDashboardSummaryFromTasks(tasks, profiles = [], currentProfile = null) {
  const visibleTasks =
    currentProfile?.role === "admin"
      ? tasks.filter((task) => !isTaskArchived(task))
      : tasks.filter((task) => !isTaskArchived(task) && task.assignedUserId === currentProfile?.id && task.status !== "cancelled");
  const archivedTasks =
    currentProfile?.role === "admin"
      ? tasks.filter((task) => isTaskArchived(task))
      : [];

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
          moduleKey: task.moduleKey,
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
          moduleKey: task.moduleKey,
          pipeline: task.pipeline,
          status: task.status,
          assignedUserName: task.assignedUserName || ""
        })),
      archived: archivedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        address: task.address,
        city: task.city,
        moduleKey: task.moduleKey,
        pipeline: task.pipeline,
        status: task.status,
        assignedUserName: task.assignedUserName || "",
        archivedAt: task.archivedAt || "",
        archivedBy: task.archivedBy || ""
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

function getVisibleModuleTaskCounts() {
  const modules = getVisibleTaskModules();
  const counts = new Map(modules.map((module) => [module.key, 0]));
  const currentUser = getCurrentUser();

  state.tasks.forEach((task) => {
    if (!counts.has(task.moduleKey) || isTaskArchived(task)) {
      return;
    }

    if (state.currentRole === "admin") {
      counts.set(task.moduleKey, (counts.get(task.moduleKey) || 0) + 1);
      return;
    }

    if (task.assignedUserId === currentUser.id && task.status !== "cancelled") {
      counts.set(task.moduleKey, (counts.get(task.moduleKey) || 0) + 1);
    }
  });

  return counts;
}

function canSwitchBetweenModules() {
  return getVisibleTaskModules().length > 1 || state.currentRole === "admin" || !!runtime.profileContract;
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

  if (isSupabaseMode() && !hasAuthSession()) {
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
    return { view: "module-hub" };
  }

  if (hash === "tasks") {
    return { view: "tasks", moduleKey: state.ui.activeModuleKey || "ftth" };
  }

  if (hash === "users") {
    return { view: "users" };
  }

  if (hash.startsWith("users/")) {
    const segments = hash.split("/");
    if (segments[2] === "report") {
      return {
        view: "admin-user-report",
        userId: decodeURIComponent(segments[1] || "")
      };
    }
  }

  if (hash === "reports/open-tasks") {
    return { view: "report", moduleKey: state.ui.activeModuleKey || "ftth", reportType: "open-tasks" };
  }

  if (hash.startsWith("tasks/")) {
    return {
      view: "detail",
      moduleKey: state.ui.activeModuleKey || "ftth",
      taskId: decodeURIComponent(hash.slice("tasks/".length))
    };
  }

  if (hash.startsWith("module/")) {
    const segments = hash.split("/");
    const moduleKey = decodeURIComponent(segments[1] || "");

    if (segments.length === 2) {
      return { view: "dashboard", moduleKey };
    }

    if (segments[2] === "tasks") {
      if (segments.length === 3) {
        return { view: "tasks", moduleKey };
      }

      return {
        view: "detail",
        moduleKey,
        taskId: decodeURIComponent(segments.slice(3).join("/"))
      };
    }

    if (segments[2] === "reports" && segments[3] === "open-tasks") {
      return { view: "report", moduleKey, reportType: "open-tasks" };
    }
  }

  return { view: "module-hub" };
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

  if (isSupabaseMode() && runtime.session?.user) {
    return {
      id: runtime.session.user.id,
      email: runtime.session.user.email || "",
      name: runtime.profile?.name || runtime.session.user.email || "Συνδεδεμένος χρήστης",
      role: runtime.profile?.role || null,
      isActive: true
    };
  }

  return getCurrentRoleUsers().find((user) => user.id === state.currentUserId) || getCurrentRoleUsers()[0];
}

function getSelectedModuleKey(route = getRoute()) {
  if (route?.moduleKey && getVisibleTaskModules().some((module) => module.key === route.moduleKey)) {
    state.ui.activeModuleKey = route.moduleKey;
    return route.moduleKey;
  }

  return ensureActiveModuleKey(state.ui.activeModuleKey);
}

function renderBootstrapIndicator(currentUser) {
  if (!isSupabaseMode() || currentUser?.role !== "admin") {
    return "";
  }

  const diagnostics = runtime.bootstrapDiagnostics;
  if (!diagnostics.lastSource) {
    return "";
  }

  const isFallback = diagnostics.lastSource === "fallback";
  const label = isFallback ? "Fallback" : "RPC";
  const duration = diagnostics.lastDurationMs ? `${diagnostics.lastDurationMs}ms` : "-";
  const lastLoaded = formatClockTime(diagnostics.lastLoadedAt);
  const reason = diagnostics.lastReason || "bootstrap";
  const extraNote = isFallback && diagnostics.lastFallbackError ? `<span>${escapeHtml(diagnostics.lastFallbackError)}</span>` : "";

  return `
    <div class="bootstrap-indicator${isFallback ? " bootstrap-indicator--warning" : ""}">
      <strong>Bootstrap ${escapeHtml(label)}</strong>
      <span>${escapeHtml(duration)} · ${escapeHtml(lastLoaded)} · ${escapeHtml(reason)}</span>
      ${extraNote}
    </div>
  `;
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
    render();
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
    moduleKey: task.moduleKey || task.module_key || "ftth",
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
    archivedAt: task.archivedAt || "",
    archivedById: task.archivedById || "",
    archivedBy: normalizeLegacyUserName(task.archivedBy),
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

function isTaskArchived(task) {
  return !!task?.archivedAt;
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
      activeModuleKey: "ftth",
      adminTaskReport: createDefaultAdminTaskReportState(),
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

function getVisibleTasks(moduleKey = getSelectedModuleKey()) {
  const scopedTasks = state.tasks.filter((task) => (moduleKey ? task.moduleKey === moduleKey : true));

  if (state.currentRole !== "partner") {
    return scopedTasks.filter((task) => !isTaskArchived(task));
  }

  const currentUser = getCurrentUser();
  return scopedTasks.filter((task) => !isTaskArchived(task) && task.assignedUserId === currentUser.id && task.status !== "cancelled");
}

function hasRequiredAutopsiaCertificate(task) {
  if (task.pipeline !== "autopsia") {
    return true;
  }

  return task.files.length > 0;
}

function getMissingRequiredDocumentsReason(task) {
  if (task.pipeline === "autopsia" && !hasRequiredAutopsiaCertificate(task)) {
    return "Η αυτοψία ολοκληρώθηκε, αλλά λείπει το απαιτούμενο έγγραφο για να προχωρήσει σε επικύρωση.";
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
  const isArchived = isTaskArchived(task);

  return {
    canEditCore: isAdmin && !isArchived,
    canManageAssignment: isAdmin && !isArchived,
    canEditStatusDirectly: isAdmin && !isArchived,
    canEditAdminNotes: isAdmin && !isArchived,
    canEditPartnerNotes: isAssignedExecutor && !isArchived,
    canUploadPhotos: (isAdmin || isAssignedExecutor) && !isArchived,
    canUploadFiles: (isAdmin || isAssignedExecutor) && !isArchived,
    canAddMaterials: (isAdmin || isAssignedExecutor) && !isArchived,
    canAddWorkItems: (isAdmin || isAssignedExecutor) && !isArchived,
    canEditSafety: (isAdmin || isAssignedExecutor) && !isArchived,
    canScheduleVisit: isAssignedExecutor && !isArchived && ["assigned", "scheduled"].includes(task.status),
    canStart: (isAdmin || isAssignedExecutor) && !isArchived && task.status === "scheduled",
    canSubmitValidation: (isAdmin || isAssignedExecutor) && !isArchived && ["in_progress", "completed_with_pending"].includes(task.status),
    canApprove: isAdmin && !isArchived && task.status === "pending_validation",
    canReject: isAdmin && !isArchived && task.status === "pending_validation",
    canRequestCancellation: isAssignedExecutor && !isArchived && task.status === "in_progress" && !task.flags.cancellationRequested,
    canApproveCancellation: isAdmin && !isArchived && !!task.flags.cancellationRequested,
    canRejectCancellation: isAdmin && !isArchived && !!task.flags.cancellationRequested,
    canArchive: isAdmin && !isArchived
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
  if (isSupabaseMode()) {
    return runtime.profile?.role === "admin";
  }

  return state.currentRole === "admin";
}

function getFilteredTasks(moduleKey = getSelectedModuleKey()) {
  return getVisibleTasks(moduleKey).filter((task) => {
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

function renderPipelineStatusSections(tasks, technicianFilter = "", moduleKey = getSelectedModuleKey()) {
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
          ${counts.map(([status, count]) => TaskCard(status, count, pipelineKey, technicianFilter, moduleKey)).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderPipelineStatusSectionsFromSummary(summary, assigneeId = "", moduleKey = getSelectedModuleKey()) {
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
          ${counts.map(([status, count]) => TaskCard(status, count, pipelineKey, assigneeId, moduleKey)).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderAdminDashboard(visibleTasks, moduleKey = getSelectedModuleKey()) {
  const archivedTasks = state.tasks.filter((task) => isTaskArchived(task) && task.moduleKey === moduleKey);
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
                  ? `<div class="assignee-section__body">${renderPipelineStatusSections(section.tasks, section.id, moduleKey)}</div>`
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
        ${renderAdminQueue(
          "Αρχειοθετημένες Εργασίες",
          "Εργασίες που βγήκαν από το ενεργό flow και κρατούνται μόνο για ιστορικό ή έλεγχο από admin.",
          archivedTasks,
          "Δεν υπάρχουν αρχειοθετημένες εργασίες."
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
        ${renderAdminQueue(
          "Αρχειοθετημένες Εργασίες",
          "Εργασίες που βγήκαν από το ενεργό flow και κρατούνται μόνο για ιστορικό ή έλεγχο από admin.",
          summary.queues.archived || [],
          "Δεν υπάρχουν αρχειοθετημένες εργασίες."
        )}
      </section>
    </section>
  `;
}

function renderAdminQueue(title, copy, tasks, emptyMessage, filterStatus) {
  const hasRouteFilter = !!filterStatus;
  const moduleKey = getSelectedModuleKey();
  const queueVisual = filterStatus === "cancelled"
    ? { tone: "cancelled", iconName: "files" }
    : title.includes("Ακύρωσης")
      ? { tone: "requests", iconName: "pending_validation" }
      : { tone: "archived", iconName: "history" };

  return `
    <section class="surface queue-panel queue-panel--${escapeHtml(queueVisual.tone)}">
      <div class="queue-panel__head">
        <div class="queue-panel__title">
          <span class="queue-panel__icon">${icon(queueVisual.iconName)}</span>
          <div>
            <p class="eyebrow">Admin Queue</p>
            <h2>${escapeHtml(title)}</h2>
          </div>
        </div>
        <div class="queue-panel__meta">
          ${
            hasRouteFilter
              ? `<button class="button button--ghost queue-head-action" data-route="${escapeHtml(buildModuleTasksRoute(moduleKey))}" data-filter-status="${escapeHtml(filterStatus)}">${tasks.length} συνολικά</button>`
              : `<span class="pill pill--pipeline-autopsia">${tasks.length} συνολικά</span>`
          }
        </div>
      </div>

      <div class="queue-panel__body">
        <p class="queue-panel__copy">${escapeHtml(copy)}</p>
        ${
          tasks.length
            ? `
              <div class="queue-list queue-list--panel">
                ${tasks
                  .map(
                    (task) => `
                      <button class="queue-item" data-open-task="${escapeHtml(task.id)}">
                        <strong>${escapeHtml(task.title)}</strong>
                        <span>${escapeHtml(task.address)} · ${escapeHtml(task.city)} · ${escapeHtml(PIPELINE_META[task.pipeline]?.label || "Αυτοψία")}</span>
                        <span>${escapeHtml(task.assignedUserName || "Χωρίς ανάθεση")} · ${escapeHtml(task.archivedAt ? "Αρχειοθετημένη" : STATUS_META[task.status]?.label || task.status)}</span>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            `
            : `<div class="empty-state empty-state--queue"><p>${escapeHtml(emptyMessage)}</p></div>`
        }
      </div>
    </section>
  `;
}

function render() {
  if (renderAuthGate()) {
    return;
  }

  const route = getRoute();
  const visibleModules = getVisibleTaskModules();
  if (route.view === "module-hub" && visibleModules.length === 1 && !canManageUsers() && !runtime.profileContract) {
    const onlyModuleRoute = buildModuleDashboardRoute(visibleModules[0].key);
    if (window.location.hash !== onlyModuleRoute) {
      window.location.hash = onlyModuleRoute;
      return;
    }
  }

  const selectedModuleKey = getSelectedModuleKey(route);
  const selectedModule = getTaskModuleByKey(selectedModuleKey);
  const visibleTasks = selectedModule ? getVisibleTasks(selectedModuleKey) : [];
  const filteredTasks = selectedModule ? getFilteredTasks(selectedModuleKey) : [];
  const currentUser = getCurrentUser();
  const selectedManagedUser = route.view === "admin-user-report" ? getManagedUserById(route.userId) : null;
  const showManualSwitches = !isSupabaseMode();
  const isSessionHydrating = isSupabaseMode() && hasAuthSession() && !hasLiveProfile();
  const roleLabel = isSessionHydrating
    ? "Σύνδεση"
    : currentUser?.role
      ? ROLE_LABELS[currentUser.role] || currentUser.role
      : ROLE_LABELS[state.currentRole];
  const topbarTitle =
    route.view === "module-hub"
      ? "Επιλογή εργασίας"
      : route.view === "users"
        ? "Διαχείριση χρηστών"
        : route.view === "admin-user-report"
          ? `${selectedManagedUser?.displayName || selectedManagedUser?.email || "Χρήστης"} · Αναφορά εργασιών`
        : route.view === "report"
          ? `${selectedModule?.name || "Workspace"} · Αναφορά ανοιχτών εργασιών`
          : route.view === "tasks"
            ? `${selectedModule?.name || "Workspace"} · Εργασίες`
            : route.view === "detail"
              ? `${selectedModule?.name || "Workspace"} · Καρτέλα εργασίας`
              : `${selectedModule?.name || "Workspace"} · Dashboard`;
  const canOpenModuleViews = !!selectedModule;
  const useStandaloneShell = route.view === "module-hub" || route.view === "users" || route.view === "admin-user-report";
  const moduleHubButtonLabel = visibleModules.length > 1 || state.currentRole === "admin" ? "Αλλαγή εργασίας" : "Αρχική";

  if (useStandaloneShell) {
    app.innerHTML = `
      <section class="module-shell">
        <header class="topbar surface module-shell__topbar">
          <div>
            <p class="eyebrow">${route.view === "users" ? "Admin Access" : "Workspace Selector"}</p>
            <h1>${escapeHtml(topbarTitle)}</h1>
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
                    <div class="topbar-session__meta">
                      <strong>${escapeHtml(currentUser.name)}</strong>
                      ${renderBootstrapIndicator(currentUser)}
                    </div>
                  </div>
                `
            }

            ${
              route.view === "users"
                ? `<button class="button button--ghost" data-route="#/dashboard">Πίσω στις εργασίες</button>`
                : route.view === "admin-user-report"
                  ? `<button class="button button--ghost" data-route="#/users">Πίσω στους χρήστες</button>`
                : ""
            }
            ${isSupabaseMode() ? `<button class="button button--ghost" data-sign-out>Αποσύνδεση</button>` : ""}
          </div>
        </header>

        ${
          runtime.syncError && isSupabaseMode()
            ? `<div class="alert-banner alert-banner--warning workspace-alert"><p>${escapeHtml(runtime.syncError)}</p></div>`
            : ""
        }

        ${renderView(route, visibleTasks, filteredTasks, currentUser, selectedModule)}
      </section>
    `;

    return;
  }

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
          ${
            canOpenModuleViews
              ? `
                <button class="nav-link${route.view === "dashboard" ? " is-active" : ""}" data-route="${escapeHtml(buildModuleDashboardRoute(selectedModuleKey))}">
                  <span class="nav-link__icon">${icon("network")}</span>
                  <span class="nav-link__label">Dashboard</span>
                </button>
                <button class="nav-link${route.view === "tasks" || route.view === "detail" ? " is-active" : ""}" data-route="${escapeHtml(buildModuleTasksRoute(selectedModuleKey))}">
                  <span class="nav-link__icon">${icon("tasks")}</span>
                  <span class="nav-link__label">Tasks</span>
                </button>
                `
              : ""
          }
          ${
            canOpenModuleViews
              ? `
                <button class="nav-link nav-link--action${route.view === "report" ? " is-active" : ""}" data-export-open-pdf>
                  <span class="nav-link__icon">${icon("print")}</span>
                  <span class="nav-link__label">Export PDF</span>
                </button>
              `
              : ""
          }
        </nav>
      </aside>

      <main class="workspace">
        <header class="topbar surface">
          <div>
            <p class="eyebrow">${route.view === "module-hub" ? "Workspace Selector" : "Operational View"}</p>
            <h1>${escapeHtml(topbarTitle)}</h1>
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
                    <div class="topbar-session__meta">
                      <strong>${escapeHtml(currentUser.name)}</strong>
                      ${renderBootstrapIndicator(currentUser)}
                    </div>
                  </div>
                `
            }

            ${
              canSwitchBetweenModules()
                ? `<button class="button button--ghost" data-route="#/dashboard">${moduleHubButtonLabel}</button>`
                : ""
            }
            ${canCreateTasks() && canOpenModuleViews && route.view !== "module-hub" && route.view !== "users" ? `<button class="button button--secondary" data-open-create>Νέα εργασία</button>` : ""}
            ${isSupabaseMode() ? `<button class="button button--ghost" data-sign-out>Αποσύνδεση</button>` : ""}
          </div>
        </header>

        ${
          runtime.syncError && isSupabaseMode()
            ? `<div class="alert-banner alert-banner--warning workspace-alert"><p>${escapeHtml(runtime.syncError)}</p></div>`
            : ""
        }

        ${renderView(route, visibleTasks, filteredTasks, currentUser, selectedModule)}
      </main>
    </div>

    ${state.ui.showCreateModal && canOpenModuleViews ? renderCreateModal(selectedModule) : ""}
  `;

  if (route.view === "report" && state.ui.reportAutoPrint) {
    state.ui.reportAutoPrint = false;
    saveState();
    window.setTimeout(() => window.print(), 120);
  }
}

function renderView(route, visibleTasks, filteredTasks, currentUser, selectedModule) {
  if (isSupabaseMode() && hasAuthSession() && !hasLiveProfile()) {
    return `
      <section class="surface empty-screen">
        <h2>Φόρτωση dashboard</h2>
        <p>Η σύνδεση ολοκληρώθηκε. Φορτώνουμε τα στοιχεία του λογαριασμού και την περίληψη εργασιών.</p>
        ${runtime.syncError ? `<button class="button button--ghost" data-retry-bootstrap>Ξανά προσπάθεια</button>` : ""}
      </section>
    `;
  }

  if (route.view === "module-hub") {
    if (isSupabaseMode() && isAuthenticated() && !runtime.tasksLoaded) {
      ensureSupabaseTasksLoaded().catch(() => {});
    }

    return ModuleHub({
      modules: getVisibleTaskModules(),
      counts: getVisibleModuleTaskCounts(),
      countsReady: !isSupabaseMode() || runtime.tasksLoaded,
      selectedModuleKey: state.ui.activeModuleKey,
      currentRole: state.currentRole,
      manageUsersRoute: canManageUsers() ? "#/users" : "",
      profileContract: runtime.profileContract
    });
  }

  if (route.view === "users") {
    if (!canManageUsers()) {
      return `
        <section class="surface empty-screen">
          <h2>Δεν έχεις πρόσβαση</h2>
          <p>Η διαχείριση χρηστών είναι διαθέσιμη μόνο στον admin.</p>
        </section>
      `;
    }

    if (runtime.adminUsersError && !runtime.adminUsersLoaded) {
      return `
        <section class="surface empty-screen">
          <h2>Η φόρτωση χρηστών απέτυχε</h2>
          <p>${escapeHtml(runtime.adminUsersError)}</p>
          <button class="button button--ghost" data-retry-admin-users>Ξανά προσπάθεια</button>
        </section>
      `;
    }

    if (!runtime.adminUsersLoaded) {
      ensureAdminUsersLoaded().catch((error) => {
        runtime.adminUsersError = error.message;
        render();
      });

      return `
        <section class="surface empty-screen">
          <h2>Φόρτωση χρηστών</h2>
          <p>Ανακτούμε τη λίστα λογαριασμών από τη βάση δεδομένων.</p>
        </section>
      `;
    }

    return AdminUsers({
      users: runtime.adminUsers,
      modules: getAllTaskModules(),
      currentUserId: currentUser.id,
      pending: runtime.adminUsersPending,
      error: runtime.adminUsersError,
      message: runtime.adminUsersMessage
    });
  }

  if (route.view === "admin-user-report") {
    if (!canManageUsers()) {
      return `
        <section class="surface empty-screen">
          <h2>Δεν έχεις πρόσβαση</h2>
          <p>Η αναφορά εργασιών χρήστη είναι διαθέσιμη μόνο στον admin.</p>
        </section>
      `;
    }

    if (!runtime.adminUsersLoaded) {
      ensureAdminUsersLoaded().catch((error) => {
        runtime.adminUsersError = error.message;
        render();
      });

      return `
        <section class="surface empty-screen">
          <h2>Φόρτωση στοιχείων χρήστη</h2>
          <p>Ανακτούμε τη λίστα χρηστών πριν ανοίξουμε την εξατομικευμένη αναφορά.</p>
        </section>
      `;
    }

    const reportUser = getManagedUserById(route.userId);
    if (!reportUser) {
      return `
        <section class="surface empty-screen">
          <h2>Ο χρήστης δεν βρέθηκε</h2>
          <p>Η αναφορά δεν μπορεί να ανοίξει γιατί ο λογαριασμός δεν είναι διαθέσιμος στη διαχείριση χρηστών.</p>
          <button class="button button--ghost" data-route="#/users">Πίσω στους χρήστες</button>
        </section>
      `;
    }

    const reportFilters = getAdminTaskReportState(reportUser.id);
    const reportSignature = buildAdminTaskReportSignature(reportUser.id, reportFilters);

    if (!runtime.adminTaskReportPending && runtime.adminTaskReportSignature !== reportSignature) {
      ensureAdminTaskReportLoaded(reportUser.id).catch((error) => {
        runtime.adminTaskReportError = error.message;
        runtime.adminTaskReportPending = false;
        render();
      });
    }

    return AdminTaskReport({
      user: reportUser,
      users: runtime.adminUsers,
      modules: getAllTaskModules(),
      filters: reportFilters,
      tasks: runtime.adminTaskReportRows.map((task) => ({
        ...task,
        detailRoute: buildModuleTaskDetailRoute(task.moduleKey || reportFilters.moduleKey || "ftth", task.id)
      })),
      pending: runtime.adminTaskReportPending,
      error: runtime.adminTaskReportError,
      exportPending: runtime.adminTaskReportExportPending
    });
  }

  if (!selectedModule) {
    return `
      <section class="surface empty-screen">
        <h2>Δεν υπάρχει διαθέσιμο workspace</h2>
        <p>Ο λογαριασμός δεν έχει πρόσβαση σε κάποια εργασία για να ανοίξει dashboard ή λίστα.</p>
        <button class="button button--ghost" data-route="#/dashboard">Επιστροφή στις κάρτες</button>
      </section>
    `;
  }

  if (isSupabaseMode() && (route.view === "dashboard" || route.view === "tasks" || route.view === "report") && !runtime.tasksLoaded) {
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

  if (route.view === "dashboard") {
    if (state.currentRole === "admin") {
      return renderAdminDashboard(visibleTasks, selectedModule.key);
    }

    return `
      <section class="pipeline-dashboard">
        ${renderPipelineStatusSections(visibleTasks, "", selectedModule.key)}
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
          <button class="button" data-route="${escapeHtml(buildModuleTasksRoute(selectedModule.key))}">Επιστροφή στη λίστα</button>
        </section>
      `;
    }

    if (isSupabaseMode() && !runtime.catalogsLoaded) {
      ensureSupabaseCatalogsLoaded().catch((error) => {
        runtime.syncError = error.message;
        render();
      });
    }

    if (task.moduleKey !== selectedModule.key) {
      return `
        <section class="surface empty-screen">
          <h2>Η εργασία ανήκει σε άλλο module</h2>
          <p>Άνοιξε την εργασία από τη σωστή κάρτα για να δεις το αντίστοιχο flow.</p>
          <button class="button" data-route="${escapeHtml(buildModuleDashboardRoute(selectedModule.key))}">Επιστροφή στο dashboard</button>
        </section>
      `;
    }

    if (state.currentRole === "partner" && !visibleTasks.some((visibleTask) => visibleTask.id === task.id)) {
      return `
        <section class="surface empty-screen">
          <h2>Δεν έχεις πρόσβαση σε αυτή την εργασία</h2>
          <p>Η εργασία δεν σου έχει ανατεθεί από τον admin.</p>
          <button class="button" data-route="${escapeHtml(buildModuleTasksRoute(selectedModule.key))}">Επιστροφή στη λίστα</button>
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

    if (isTaskArchived(task) && state.currentRole !== "admin") {
      return `
        <section class="surface empty-screen">
          <h2>Η εργασία έχει αρχειοθετηθεί</h2>
          <p>Η εργασία αφαιρέθηκε από τις ενεργές λίστες και το dashboard, χωρίς να χαθεί το ιστορικό της.</p>
          <p>${escapeHtml(task.archivedBy || "Admin")} · ${escapeHtml(task.archivedAt ? formatDateTime(task.archivedAt) : "Χωρίς καταγραφή ώρας")}</p>
          <button class="button" data-route="${escapeHtml(buildModuleTasksRoute(selectedModule.key))}">Επιστροφή στη λίστα</button>
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
      tasksRoute: buildModuleTasksRoute(selectedModule.key),
      validationComment: state.ui.validationComment,
      cancellationComment: state.ui.cancellationComment
    });
  }

  return `
    <section class="pipeline-dashboard">
      ${renderPipelineStatusSections(visibleTasks, "", selectedModule.key)}
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
  const moduleKey = getSelectedModuleKey();
  const openTasks = getVisibleTasks(moduleKey).filter((task) => !["completed", "cancelled"].includes(task.status));

  if (!openTasks.length) {
    window.alert("Δεν υπάρχουν ανοιχτές εργασίες για εξαγωγή.");
    return;
  }

  const currentHash = window.location.hash || "#/dashboard";
  state.ui.exportReturnRoute = currentHash.includes("/reports/")
    ? state.ui.exportReturnRoute || "#/dashboard"
    : currentHash;
  state.ui.reportAutoPrint = true;
  saveState();
  window.location.hash = buildModuleReportRoute(moduleKey);
}

function renderCreateModal(selectedModule = getTaskModuleByKey(getSelectedModuleKey())) {
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
            <span>Module</span>
            <input value="${escapeHtml(selectedModule?.name || "Workspace")}" disabled />
          </div>
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
    if (nextRoute?.startsWith("#/module/")) {
      const routePath = nextRoute.replace(/^#\/?/, "");
      const moduleKey = decodeURIComponent(routePath.split("/")[1] || "");
      if (moduleKey) {
        state.ui.activeModuleKey = moduleKey;
      }
    }
    if (!hasDashboardFilters && (nextRoute === "#/tasks" || nextRoute?.includes("/tasks"))) {
      resetTaskFilters();
    }
    if (hasDashboardFilters) {
      saveState();
    }
    if (nextRoute?.startsWith("#/tasks") || nextRoute?.startsWith("#/dashboard") || nextRoute?.startsWith("#/module/")) {
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

  const adminReportPresetTarget = event.target.closest("[data-admin-report-preset]");
  if (adminReportPresetTarget) {
    const route = getRoute();
    applyAdminTaskReportPreset(adminReportPresetTarget.getAttribute("data-admin-report-preset") || "custom", route.userId || state.ui.adminTaskReport?.userId || "");
    saveState();
    render();
    return;
  }

  if (event.target.closest("[data-export-admin-task-report]")) {
    const route = getRoute();
    const reportUser = getManagedUserById(route.userId || state.ui.adminTaskReport?.userId || "");
    if (!reportUser) {
      window.alert("Δεν βρέθηκε ο χρήστης για το export.");
      return;
    }

    if (!runtime.adminTaskReportRows.length) {
      window.alert("Δεν υπάρχουν γραμμές για export με τα τρέχοντα φίλτρα.");
      return;
    }

    runtime.adminTaskReportExportPending = true;
    render();

    exportAdminTaskReportWorkbook({
      user: reportUser,
      tasks: runtime.adminTaskReportRows,
      modules: getAllTaskModules(),
      filters: getAdminTaskReportState(reportUser.id)
    })
      .catch((error) => {
        window.alert(`Το export σε Excel απέτυχε: ${error.message}`);
      })
      .finally(() => {
        runtime.adminTaskReportExportPending = false;
        render();
      });
    return;
  }

  if (event.target.closest("[data-retry-admin-task-report]")) {
    const route = getRoute();
    runtime.adminTaskReportError = "";
    runtime.adminTaskReportSignature = "";
    render();
    ensureAdminTaskReportLoaded(route.userId || state.ui.adminTaskReport?.userId || "", true).catch((error) => {
      runtime.adminTaskReportError = error.message;
      runtime.adminTaskReportPending = false;
      render();
    });
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
    runtime.syncError = "";
    if (isSupabaseMode() && hasAuthSession()) {
      scheduleSupabaseHydration("manual-retry");
    } else {
      runtime.loading = true;
      render();
      bootstrap();
    }
    return;
  }

  if (event.target.closest("[data-retry-admin-users]")) {
    runtime.adminUsersError = "";
    runtime.adminUsersLoaded = false;
    render();
    ensureAdminUsersLoaded().catch((error) => {
      runtime.adminUsersError = error.message;
      render();
    });
    return;
  }

  if (event.target.closest("[data-print-report]")) {
    window.print();
    return;
  }

  const taskTarget = event.target.closest("[data-open-task]");
  if (taskTarget) {
    const taskId = taskTarget.getAttribute("data-open-task") || "";
    const task = getTaskById(taskId);
    state.ui.activeTab = "main";
    state.ui.validationComment = "";
    state.ui.cancellationComment = "";
    state.ui.materialSearch = "";
    state.ui.selectedMaterialId = "";
    state.ui.workSearch = "";
    state.ui.selectedWorkId = "";
    if (task?.moduleKey) {
      state.ui.activeModuleKey = task.moduleKey;
    }
    saveState();
    window.location.hash = buildModuleTaskDetailRoute(task?.moduleKey || getSelectedModuleKey(), taskId);
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

  const workflowTarget = event.target.closest("[data-workflow-action]");
  if (workflowTarget) {
    handleWorkflow(workflowTarget.getAttribute("data-task-id"), workflowTarget.getAttribute("data-workflow-action"));
  }
}

function handleChange(event) {
  if (event.target.matches("[data-admin-report-user]")) {
    const nextUserId = event.target.value;
    if (!nextUserId) {
      return;
    }

    setAdminTaskReportState({ userId: nextUserId }, nextUserId);
    runtime.adminTaskReportError = "";
    runtime.adminTaskReportSignature = "";
    saveState();
    window.location.hash = buildAdminUserReportRoute(nextUserId);
    return;
  }

  if (event.target.matches("[data-admin-report-filter]")) {
    const route = getRoute();
    const filterKey = event.target.getAttribute("data-admin-report-filter");
    const nextValue = event.target.value;
    const nextPatch = filterKey === "fromDate" || filterKey === "toDate"
      ? { [filterKey]: nextValue, datePreset: "custom" }
      : { [filterKey]: nextValue };

    setAdminTaskReportState(nextPatch, route.userId || state.ui.adminTaskReport?.userId || "");
    runtime.adminTaskReportError = "";
    saveState();
    render();
    return;
  }

  if (event.target.matches("[data-admin-report-status]")) {
    const route = getRoute();
    const currentState = getAdminTaskReportState(route.userId || state.ui.adminTaskReport?.userId || "");
    const nextStatusKeys = new Set(currentState.statusKeys || []);
    if (event.target.checked) {
      nextStatusKeys.add(event.target.value);
    } else {
      nextStatusKeys.delete(event.target.value);
    }
    setAdminTaskReportState({ statusKeys: [...nextStatusKeys] }, route.userId || state.ui.adminTaskReport?.userId || "");
    runtime.adminTaskReportError = "";
    saveState();
    render();
    return;
  }

  if (event.target.matches("[data-role-switch]")) {
    state.currentRole = event.target.value;
    state.currentUserId = USER_DIRECTORY[state.currentRole][0].id;
    ensureActiveModuleKey(state.ui.activeModuleKey);
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
    ensureActiveModuleKey(state.ui.activeModuleKey);
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
      .then((authData) => {
        resetUiStateForLiveSession();
        saveState();
        runtime.session = authData.session || runtime.session;
        runtime.authPending = false;
        runtime.loading = false;
        if (window.location.hash !== "#/dashboard") {
          window.location.hash = "#/dashboard";
        }
        render();
        window.setTimeout(() => {
          scheduleSupabaseHydration("login-submit", authData.session || runtime.session);
        }, 0);
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

  const adminUserCreateForm = event.target.closest("[data-admin-user-create-form]");
  if (adminUserCreateForm) {
    event.preventDefault();
    handleAdminUserCreate(new FormData(adminUserCreateForm));
    return;
  }

  const adminUserForm = event.target.closest("[data-admin-user-form]");
  if (adminUserForm) {
    event.preventDefault();
    const formData = new FormData(adminUserForm);
    if (event.submitter?.name) {
      formData.set(event.submitter.name, event.submitter.value || "");
    }
    const isContractDelete = String(formData.get("contractAction") || "") === "delete";
    if (!confirmAction(isContractDelete ? "Είστε σίγουροι ότι θέλετε να αφαιρέσετε τη σύμβαση αυτού του χρήστη;" : "Είστε σίγουροι ότι θέλετε να αποθηκεύσετε τις αλλαγές του χρήστη;")) {
      return;
    }
    handleAdminUserUpdate(formData);
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

  if (isSupabaseMode() && runtime.profile) {
    runtime.dashboardSummary = buildDashboardSummaryFromTasks(state.tasks, runtime.profiles, runtime.profile);
  }

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
  const moduleKey = getSelectedModuleKey();
  const selectedTeamId = formData.get("resourceTeam") || "";
  const selectedTeamUser = getAssignableUserById(selectedTeamId);
  const hasDirectAssignment = !!selectedTeamUser;

  const newTask = {
    id: createUuid(),
    taskCode: createId("TASK"),
    moduleKey,
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
    archivedAt: "",
    archivedById: "",
    archivedBy: "",
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
  if (isSupabaseMode() && runtime.profile) {
    runtime.dashboardSummary = buildDashboardSummaryFromTasks(state.tasks, runtime.profiles, runtime.profile);
  }
  state.ui.showCreateModal = false;
  state.ui.activeTab = "main";
  saveState();
  window.location.hash = buildModuleTaskDetailRoute(moduleKey, newTask.id);
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

  if (action === "archive") {
    if (!confirmAction("Είστε σίγουροι ότι θέλετε να αρχειοθετήσετε αυτή την εργασία; Θα αφαιρεθεί από τις ενεργές λίστες και το dashboard.")) {
      return;
    }

    commitTaskChange(
      taskId,
      (task) => {
        task.archivedAt = new Date().toISOString();
        task.archivedById = getCurrentUser().id;
        task.archivedBy = getCurrentUser().name;
      },
      "Αρχειοθέτηση εργασίας",
      "Η εργασία αρχειοθετήθηκε και αφαιρέθηκε από το ενεργό workflow."
    );
    state.ui.validationComment = "";
    state.ui.cancellationComment = "";
    saveState();
    window.location.hash = buildModuleTasksRoute(getSelectedModuleKey());
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
  const fileKindSelector = document.querySelector(`[data-file-kind="${taskId}"]`);
  const fileKind = fileKindSelector?.value || "general";

  try {
    const nextFiles =
      isSupabaseMode() && isAuthenticated()
        ? await uploadTaskFiles(runtime.supabase, taskId, files, currentUser, fileKind)
        : files.map((file) => ({
            id: createUuid(),
            name: file.name,
            kind: fileKind,
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
