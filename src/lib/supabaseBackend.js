import { createClient } from "@supabase/supabase-js";
import { toDateTimeLocalValue, toIsoDateTime } from "./helpers.js";

function assertNoError(response, label) {
  if (response.error) {
    throw new Error(`${label}: ${response.error.message}`);
  }

  return response.data;
}

function groupByTaskId(rows) {
  return (rows || []).reduce((map, row) => {
    const key = row.task_id;
    const existing = map.get(key) || [];
    existing.push(row);
    map.set(key, existing);
    return map;
  }, new Map());
}

function mapProfileRow(row) {
  return {
    id: row.id,
    email: row.email || "",
    role: row.role,
    name: row.display_name,
    companyName: row.company_name || "",
    title: row.title || "",
    phone: row.phone || "",
    isActive: row.is_active !== false
  };
}

function resolveProfileName(profileMap, id, fallback = "") {
  if (!id) {
    return fallback;
  }

  return profileMap.get(id)?.name || fallback || "System";
}

function sanitizeStorageFileName(name = "file") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-120) || "file";
}

function buildStoragePath(taskId, assetId, fileName) {
  return `${taskId}/${assetId}-${sanitizeStorageFileName(fileName)}`;
}

async function createSignedUrlMap(client, bucket, rows, expiresIn = 60 * 60 * 24 * 7) {
  const storagePaths = [...new Set((rows || []).map((row) => row.storage_path).filter(Boolean))];
  if (!storagePaths.length) {
    return new Map();
  }

  const signedResponse = await client.storage.from(bucket).createSignedUrls(storagePaths, expiresIn);
  const signedRows = assertNoError(signedResponse, `Create signed urls for ${bucket}`);

  return signedRows.reduce((map, entry) => {
    if (entry.path && entry.signedUrl) {
      map.set(entry.path, entry.signedUrl);
    }
    return map;
  }, new Map());
}

function mapMaterialCatalogRow(row) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    unit: row.unit || "τεμ.",
    stock: 0,
    minStock: 0
  };
}

function mapWorkCatalogRow(row) {
  return {
    id: row.id,
    article: row.article,
    description: row.description
  };
}

function toNullableIsoDateTime(value) {
  const isoValue = toIsoDateTime(value);
  return isoValue || null;
}

function normalizeDashboardBootstrapPayload(payload) {
  const rawProfile = payload?.profile && payload.profile !== "null" ? payload.profile : null;

  return {
    profile: rawProfile ? mapProfileRow(rawProfile) : null,
    profiles: Array.isArray(payload?.profiles) ? payload.profiles.map(mapProfileRow) : [],
    sectionTotals: Array.isArray(payload?.sectionTotals) ? payload.sectionTotals : [],
    currentPipelineTotals: Array.isArray(payload?.currentPipelineTotals) ? payload.currentPipelineTotals : [],
    statusCounts: Array.isArray(payload?.statusCounts) ? payload.statusCounts : [],
    queues: {
      cancellationRequested: Array.isArray(payload?.queues?.cancellationRequested) ? payload.queues.cancellationRequested : [],
      cancelled: Array.isArray(payload?.queues?.cancelled) ? payload.queues.cancelled : []
    }
  };
}

async function fetchTaskRelatedData(client, taskIds) {
  const [
    historyRows,
    pipelineHistoryRows,
    fiberStageHistoryRows,
    photoRows,
    fileRows,
    materialItemRows,
    workItemRows,
    safetyRows
  ] = await Promise.all([
    fetchCollection(client, "task_history", taskIds, "*", "created_at"),
    fetchCollection(client, "task_pipeline_history", taskIds, "*", "completed_at"),
    fetchCollection(client, "task_fiber_stage_history", taskIds, "*", "completed_at"),
    fetchCollection(client, "task_photos", taskIds, "*", "uploaded_at"),
    fetchCollection(client, "task_files", taskIds, "*", "uploaded_at"),
    fetchCollection(client, "task_materials", taskIds, "*", "created_at"),
    fetchCollection(client, "task_work_items", taskIds, "*", "created_at"),
    taskIds.length
      ? assertNoError(
          await client.from("task_safety_items").select("*").in("task_id", taskIds).order("position", { ascending: true }),
          "Fetch task_safety_items"
        )
      : []
  ]);

  const [photoUrlMap, fileUrlMap] = await Promise.all([
    createSignedUrlMap(client, "task-photos", photoRows),
    createSignedUrlMap(client, "task-files", fileRows)
  ]);

  return {
    historyMap: groupByTaskId(historyRows),
    pipelineHistoryMap: groupByTaskId(pipelineHistoryRows),
    fiberStageHistoryMap: groupByTaskId(fiberStageHistoryRows),
    photosMap: groupByTaskId(photoRows),
    filesMap: groupByTaskId(fileRows),
    materialsMap: groupByTaskId(materialItemRows),
    workItemsMap: groupByTaskId(workItemRows),
    safetyMap: groupByTaskId(safetyRows),
    photoUrlMap,
    fileUrlMap
  };
}

function mapTaskRow(taskRow, context) {
  const {
    profileMap,
    historyMap,
    pipelineHistoryMap,
    fiberStageHistoryMap,
    photosMap,
    filesMap,
    materialsMap,
    workItemsMap,
    safetyMap,
    photoUrlMap,
    fileUrlMap
  } = context;

  return {
    id: taskRow.id,
    taskCode: taskRow.task_code,
    title: taskRow.title,
    type: taskRow.task_type,
    pipeline: taskRow.pipeline,
    status: taskRow.status,
    serviceProvider: taskRow.service_provider || "other",
    fiberStageKey: taskRow.current_fiber_stage_key || "",
    address: taskRow.address || "",
    city: taskRow.city || "",
    customerName: taskRow.customer_name || "",
    mobilePhone: taskRow.mobile_phone || "",
    landlinePhone: taskRow.landline_phone || "",
    srId: taskRow.sr_id || "",
    bid: taskRow.bid || "",
    projectName: taskRow.project_name || "",
    resourceTeam: taskRow.resource_team || "",
    assignedUserId: taskRow.assigned_user_id || "",
    assignedUserName: resolveProfileName(profileMap, taskRow.assigned_user_id, taskRow.resource_team || ""),
    assignedAt: taskRow.assigned_at || "",
    startDate: toDateTimeLocalValue(taskRow.start_date),
    endDate: toDateTimeLocalValue(taskRow.end_date),
    completedAt: taskRow.completed_at || "",
    adminNotes: taskRow.admin_notes || "",
    partnerNotes: taskRow.partner_notes || "",
    createdAt: taskRow.created_at || "",
    createdBy: resolveProfileName(profileMap, taskRow.created_by, "System"),
    createdById: taskRow.created_by || "",
    updatedAt: taskRow.updated_at || "",
    updatedBy: resolveProfileName(profileMap, taskRow.updated_by, "System"),
    updatedById: taskRow.updated_by || "",
    flags: {
      apiStatus: taskRow.api_status || "SYNCED",
      validationLock: !!taskRow.validation_lock,
      openIssues: !!taskRow.open_issues,
      smartReadiness: taskRow.smart_readiness || "Σε αναμονή",
      pendingDocumentReason: taskRow.pending_document_reason || "",
      cancellationRequested: !!taskRow.cancellation_requested,
      cancellationRequestedAt: taskRow.cancellation_requested_at || "",
      cancellationRequestedBy: resolveProfileName(profileMap, taskRow.cancellation_requested_by, ""),
      cancellationRequestedById: taskRow.cancellation_requested_by || "",
      cancellationReason: taskRow.cancellation_reason || ""
    },
    history: (historyMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      authorId: entry.actor_id || "",
      author: entry.actor_name || resolveProfileName(profileMap, entry.actor_id, "System"),
      at: entry.created_at,
      summary: entry.summary,
      details: entry.details || ""
    })),
    pipelineHistory: (pipelineHistoryMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      pipeline: entry.pipeline,
      approvedById: entry.approved_by || "",
      approvedBy: entry.approved_by_name || resolveProfileName(profileMap, entry.approved_by, "System"),
      completedAt: entry.completed_at
    })),
    fiberStageHistory: (fiberStageHistoryMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      stage: entry.stage,
      completedById: entry.completed_by || "",
      completedBy: entry.completed_by_name || resolveProfileName(profileMap, entry.completed_by, "System"),
      skipped: !!entry.skipped,
      completedAt: entry.completed_at
    })),
    photos: (photosMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      uploadedById: entry.uploaded_by || "",
      uploadedBy: resolveProfileName(profileMap, entry.uploaded_by, "System"),
      uploadedAt: entry.uploaded_at,
      preview: photoUrlMap.get(entry.storage_path) || entry.preview_url || "",
      storagePath: entry.storage_path,
      metadata: entry.metadata || {}
    })),
    files: (filesMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.mime_type || "application/octet-stream",
      size: entry.size_bytes || 0,
      uploadedById: entry.uploaded_by || "",
      uploadedBy: resolveProfileName(profileMap, entry.uploaded_by, "System"),
      uploadedAt: entry.uploaded_at,
      storagePath: entry.storage_path,
      downloadUrl: fileUrlMap.get(entry.storage_path) || "",
      metadata: entry.metadata || {}
    })),
    materials: (materialsMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      catalogId: entry.material_catalog_id || "",
      code: entry.code_snapshot,
      description: entry.description_snapshot,
      quantity: Number(entry.quantity) || 0,
      unit: entry.unit_snapshot,
      createdById: entry.created_by || ""
    })),
    workItems: (workItemsMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      catalogId: entry.work_catalog_id || "",
      article: entry.article_snapshot,
      description: entry.description_snapshot,
      createdById: entry.created_by || ""
    })),
    safety: (safetyMap.get(taskRow.id) || []).map((entry) => ({
      id: entry.id,
      item: entry.item,
      status: entry.status,
      note: entry.note || "",
      position: entry.position || 0,
      createdById: entry.created_by || "",
      updatedById: entry.updated_by || ""
    })),
    detailLoaded: context.detailLoaded !== false
  };
}

function buildTaskCoreRow(task, currentUserId) {
  return {
    id: task.id,
    task_code: task.taskCode || task.id,
    title: task.title || "",
    task_type: task.type || "survey",
    pipeline: task.pipeline || "autopsia",
    status: task.status || "unassigned",
    service_provider: task.serviceProvider || "other",
    current_fiber_stage_key: task.pipeline === "leitourgies_inwn" ? task.fiberStageKey || null : null,
    address: task.address || "",
    city: task.city || "",
    customer_name: task.customerName || "",
    mobile_phone: task.mobilePhone || "",
    landline_phone: task.landlinePhone || "",
    sr_id: task.srId || "",
    bid: task.bid || "",
    project_name: task.projectName || "",
    resource_team: task.resourceTeam || "",
    assigned_user_id: task.assignedUserId || null,
    assigned_at: toNullableIsoDateTime(task.assignedAt),
    start_date: toNullableIsoDateTime(task.startDate),
    end_date: toNullableIsoDateTime(task.endDate),
    completed_at: toNullableIsoDateTime(task.completedAt),
    admin_notes: task.adminNotes || "",
    partner_notes: task.partnerNotes || "",
    api_status: task.flags?.apiStatus || "SYNCED",
    validation_lock: !!task.flags?.validationLock,
    open_issues: !!task.flags?.openIssues,
    smart_readiness: task.flags?.smartReadiness || "Σε αναμονή",
    pending_document_reason: task.flags?.pendingDocumentReason || "",
    cancellation_requested: !!task.flags?.cancellationRequested,
    cancellation_requested_at: toNullableIsoDateTime(task.flags?.cancellationRequestedAt),
    cancellation_requested_by: task.flags?.cancellationRequestedById || null,
    cancellation_reason: task.flags?.cancellationReason || "",
    created_by: task.createdById || currentUserId || null,
    updated_by: task.updatedById || currentUserId || null,
    created_at: toIsoDateTime(task.createdAt) || new Date().toISOString(),
    updated_at: toIsoDateTime(task.updatedAt) || new Date().toISOString()
  };
}

async function fetchCollection(client, table, taskIds, selectColumns = "*", orderColumn = "") {
  if (!taskIds.length) {
    return [];
  }

  let query = client.from(table).select(selectColumns).in("task_id", taskIds);
  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }

  return assertNoError(await query, `Fetch ${table}`);
}

async function syncChildCollection(client, table, taskId, rows) {
  const existing = assertNoError(
    await client.from(table).select("id").eq("task_id", taskId),
    `Fetch existing ${table}`
  );

  const nextIds = new Set(rows.map((row) => row.id).filter(Boolean));
  const deleteIds = existing.map((row) => row.id).filter((id) => !nextIds.has(id));

  if (deleteIds.length) {
    assertNoError(
      await client.from(table).delete().in("id", deleteIds),
      `Delete removed ${table}`
    );
  }

  if (rows.length) {
    assertNoError(
      await client.from(table).upsert(rows, { onConflict: "id" }),
      `Upsert ${table}`
    );
  }
}

function buildMaterialRows(task) {
  return (task.materials || []).map((item) => ({
    id: item.id,
    task_id: task.id,
    material_catalog_id: item.catalogId || null,
    code_snapshot: item.code || "",
    description_snapshot: item.description || "",
    unit_snapshot: item.unit || "τεμ.",
    quantity: Number(item.quantity) || 0,
    created_by: item.createdById || task.updatedById || task.createdById || null
  }));
}

function buildWorkItemRows(task) {
  return (task.workItems || []).map((item) => ({
    id: item.id,
    task_id: task.id,
    work_catalog_id: item.catalogId || null,
    article_snapshot: item.article || "",
    description_snapshot: item.description || "",
    created_by: item.createdById || task.updatedById || task.createdById || null
  }));
}

function buildSafetyRows(task) {
  return (task.safety || []).map((item, index) => ({
    id: item.id,
    task_id: task.id,
    item: item.item || "",
    status: item.status || "needs-review",
    note: item.note || "",
    position: Number(item.position ?? index) || index,
    created_by: item.createdById || task.createdById || null,
    updated_by: item.updatedById || task.updatedById || task.createdById || null
  }));
}

function buildPhotoRows(task) {
  return (task.photos || []).map((item) => ({
    id: item.id,
    task_id: task.id,
    name: item.name || "",
    category: item.category || "before",
    storage_path: item.storagePath || "",
    preview_url: item.preview || "",
    uploaded_by: item.uploadedById || task.updatedById || task.createdById || null,
    uploaded_at: toIsoDateTime(item.uploadedAt) || new Date().toISOString(),
    metadata: item.metadata || {}
  }));
}

function buildFileRows(task) {
  return (task.files || []).map((item) => ({
    id: item.id,
    task_id: task.id,
    name: item.name || "",
    document_kind: "general",
    mime_type: item.type || "application/octet-stream",
    size_bytes: Number(item.size) || 0,
    storage_path: item.storagePath || "",
    uploaded_by: item.uploadedById || task.updatedById || task.createdById || null,
    uploaded_at: toIsoDateTime(item.uploadedAt) || new Date().toISOString(),
    metadata: item.metadata || {}
  }));
}

function buildPipelineHistoryRows(task) {
  return (task.pipelineHistory || []).map((entry) => ({
    id: entry.id,
    task_id: task.id,
    pipeline: entry.pipeline,
    approved_by: entry.approvedById || null,
    approved_by_name: entry.approvedBy || "System",
    completed_at: toIsoDateTime(entry.completedAt) || new Date().toISOString()
  }));
}

function buildFiberStageHistoryRows(task) {
  return (task.fiberStageHistory || []).map((entry) => ({
    id: entry.id,
    task_id: task.id,
    stage: entry.stage,
    completed_by: entry.completedById || null,
    completed_by_name: entry.completedBy || "System",
    skipped: !!entry.skipped,
    completed_at: toIsoDateTime(entry.completedAt) || new Date().toISOString()
  }));
}

function buildHistoryRow(taskId, entry) {
  return {
    id: entry.id,
    task_id: taskId,
    actor_id: entry.authorId || null,
    actor_name: entry.author || "System",
    summary: entry.summary || "",
    details: entry.details || "",
    created_at: toIsoDateTime(entry.at) || new Date().toISOString()
  };
}

export function createSupabaseBrowserClient(config) {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export async function fetchSupabaseBootstrapData(client, sessionOverride = null) {
  const session = sessionOverride || (await client.auth.getSession()).data.session;

  if (!session) {
    return {
      session: null,
      profile: null,
      profiles: [],
      inventory: [],
      workCatalog: [],
      tasks: []
    };
  }

  try {
    const dashboardPayload = assertNoError(await client.rpc("dashboard_bootstrap_v1"), "Fetch dashboard bootstrap");
    const normalizedDashboard = normalizeDashboardBootstrapPayload(dashboardPayload);

    if (normalizedDashboard.profile) {
      return {
        session,
        profile: normalizedDashboard.profile,
        profiles: normalizedDashboard.profiles,
        inventory: [],
        workCatalog: [],
        tasks: [],
        tasksLoaded: false,
        dashboardSummary: normalizedDashboard
      };
    }
  } catch {
    // Fall back to direct table reads if the RPC hasn't been installed yet.
  }

  const user = session.user;
  const profileRow = assertNoError(
    await client
      .from("profiles")
      .select("id, email, role, display_name, company_name, title, phone, is_active")
      .eq("id", user.id)
      .single(),
    "Fetch current profile"
  );

  const currentProfile = mapProfileRow(profileRow);

  let profilesQuery = client
    .from("profiles")
    .select("id, email, role, display_name, company_name, title, phone, is_active")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (currentProfile.role !== "admin") {
    profilesQuery = client
      .from("profiles")
      .select("id, email, role, display_name, company_name, title, phone, is_active")
      .eq("id", currentProfile.id);
  }

  const [profilesRows, taskRows] = await Promise.all([
    assertNoError(await profilesQuery, "Fetch profiles"),
    assertNoError(await client.from("tasks").select("*").order("updated_at", { ascending: false }), "Fetch tasks")
  ]);

  const profiles = profilesRows.map(mapProfileRow);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  if (!profileMap.has(currentProfile.id)) {
    profileMap.set(currentProfile.id, currentProfile);
  }

  const taskIds = taskRows.map((row) => row.id);
  const pipelineHistoryRows = await fetchCollection(client, "task_pipeline_history", taskIds, "*", "completed_at");

  const context = {
    profileMap,
    historyMap: new Map(),
    pipelineHistoryMap: groupByTaskId(pipelineHistoryRows),
    fiberStageHistoryMap: new Map(),
    photosMap: new Map(),
    filesMap: new Map(),
    materialsMap: new Map(),
    workItemsMap: new Map(),
    safetyMap: new Map(),
    photoUrlMap: new Map(),
    fileUrlMap: new Map(),
    detailLoaded: false
  };

  return {
    session,
    profile: currentProfile,
    profiles,
    inventory: [],
    workCatalog: [],
    tasks: taskRows.map((taskRow) => mapTaskRow(taskRow, context)),
    tasksLoaded: true,
    dashboardSummary: null
  };
}

export async function fetchSupabaseTaskSummaries(client, profiles = []) {
  const taskRows = assertNoError(await client.from("tasks").select("*").order("updated_at", { ascending: false }), "Fetch tasks");
  const taskIds = taskRows.map((row) => row.id);
  const pipelineHistoryRows = await fetchCollection(client, "task_pipeline_history", taskIds, "*", "completed_at");
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return taskRows.map((taskRow) =>
    mapTaskRow(taskRow, {
      profileMap,
      historyMap: new Map(),
      pipelineHistoryMap: groupByTaskId(pipelineHistoryRows),
      fiberStageHistoryMap: new Map(),
      photosMap: new Map(),
      filesMap: new Map(),
      materialsMap: new Map(),
      workItemsMap: new Map(),
      safetyMap: new Map(),
      photoUrlMap: new Map(),
      fileUrlMap: new Map(),
      detailLoaded: false
    })
  );
}

export async function fetchSupabaseCatalogs(client) {
  const [materialRows, workRows] = await Promise.all([
    assertNoError(
      await client.from("material_catalog").select("id, code, description, unit").eq("is_active", true).order("code", { ascending: true }),
      "Fetch material catalog"
    ),
    assertNoError(
      await client.from("work_catalog").select("id, article, description").eq("is_active", true).order("article", { ascending: true }),
      "Fetch work catalog"
    )
  ]);

  return {
    inventory: materialRows.map(mapMaterialCatalogRow),
    workCatalog: workRows.map(mapWorkCatalogRow)
  };
}

export async function fetchSupabaseTaskDetail(client, taskId, sessionOverride = null) {
  const session = sessionOverride || (await client.auth.getSession()).data.session;

  if (!session) {
    throw new Error("Δεν υπάρχει ενεργό session.");
  }

  const user = session.user;
  const profileRow = assertNoError(
    await client
      .from("profiles")
      .select("id, email, role, display_name, company_name, title, phone, is_active")
      .eq("id", user.id)
      .single(),
    "Fetch current profile"
  );

  const currentProfile = mapProfileRow(profileRow);

  let profilesRows = [];
  if (currentProfile.role === "admin") {
    profilesRows = assertNoError(
      await client
        .from("profiles")
        .select("id, email, role, display_name, company_name, title, phone, is_active")
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
      "Fetch profiles"
    );
  } else {
    profilesRows = [profileRow];
  }

  const taskRow = assertNoError(
    await client.from("tasks").select("*").eq("id", taskId).single(),
    "Fetch task detail"
  );

  const profiles = profilesRows.map(mapProfileRow);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  if (!profileMap.has(currentProfile.id)) {
    profileMap.set(currentProfile.id, currentProfile);
  }

  const relatedData = await fetchTaskRelatedData(client, [taskId]);

  return mapTaskRow(taskRow, {
    profileMap,
    ...relatedData,
    detailLoaded: true
  });
}

export async function signInWithPassword(client, email, password) {
  const response = await client.auth.signInWithPassword({
    email,
    password
  });

  return assertNoError(response, "Login failed");
}

export async function signOutSession(client) {
  const response = await client.auth.signOut();
  if (response.error) {
    throw new Error(response.error.message);
  }
}

export async function uploadTaskPhotos(client, taskId, files, category, currentUser) {
  const now = new Date().toISOString();

  return Promise.all(
    files.map(async (file) => {
      const assetId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const storagePath = buildStoragePath(taskId, assetId, file.name);

      assertNoError(
        await client.storage.from("task-photos").upload(storagePath, file, {
          upsert: false,
          contentType: file.type || "image/jpeg"
        }),
        `Upload photo ${file.name}`
      );

      const signedUrlRow = assertNoError(
        await client.storage.from("task-photos").createSignedUrl(storagePath, 60 * 60 * 24 * 7),
        `Create signed url for ${file.name}`
      );

      return {
        id: assetId,
        name: file.name,
        category,
        uploadedById: currentUser.id,
        uploadedBy: currentUser.name,
        uploadedAt: now,
        preview: signedUrlRow.signedUrl || "",
        storagePath,
        metadata: {
          size: file.size || 0,
          mimeType: file.type || "image/jpeg"
        }
      };
    })
  );
}

export async function uploadTaskFiles(client, taskId, files, currentUser) {
  const now = new Date().toISOString();

  return Promise.all(
    files.map(async (file) => {
      const assetId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const storagePath = buildStoragePath(taskId, assetId, file.name);

      assertNoError(
        await client.storage.from("task-files").upload(storagePath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream"
        }),
        `Upload file ${file.name}`
      );

      const signedUrlRow = assertNoError(
        await client.storage.from("task-files").createSignedUrl(storagePath, 60 * 60 * 24 * 7),
        `Create signed url for ${file.name}`
      );

      return {
        id: assetId,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        uploadedById: currentUser.id,
        uploadedBy: currentUser.name,
        uploadedAt: now,
        storagePath,
        downloadUrl: signedUrlRow.signedUrl || "",
        metadata: {}
      };
    })
  );
}

export async function persistTaskToSupabase(client, task, previousTask, options = {}) {
  const {
    currentUserId,
    newHistoryEntry = null
  } = options;

  assertNoError(
    await client.from("tasks").upsert(buildTaskCoreRow(task, currentUserId), { onConflict: "id" }),
    "Persist task"
  );

  if (!previousTask || JSON.stringify(previousTask.photos || []) !== JSON.stringify(task.photos || [])) {
    await syncChildCollection(client, "task_photos", task.id, buildPhotoRows(task));
  }

  if (!previousTask || JSON.stringify(previousTask.files || []) !== JSON.stringify(task.files || [])) {
    await syncChildCollection(client, "task_files", task.id, buildFileRows(task));
  }

  if (!previousTask || JSON.stringify(previousTask.materials || []) !== JSON.stringify(task.materials || [])) {
    await syncChildCollection(client, "task_materials", task.id, buildMaterialRows(task));
  }

  if (!previousTask || JSON.stringify(previousTask.workItems || []) !== JSON.stringify(task.workItems || [])) {
    await syncChildCollection(client, "task_work_items", task.id, buildWorkItemRows(task));
  }

  if (!previousTask || JSON.stringify(previousTask.safety || []) !== JSON.stringify(task.safety || [])) {
    await syncChildCollection(client, "task_safety_items", task.id, buildSafetyRows(task));
  }

  if (!previousTask || JSON.stringify(previousTask.pipelineHistory || []) !== JSON.stringify(task.pipelineHistory || [])) {
    await syncChildCollection(client, "task_pipeline_history", task.id, buildPipelineHistoryRows(task));
  }

  if (!previousTask || JSON.stringify(previousTask.fiberStageHistory || []) !== JSON.stringify(task.fiberStageHistory || [])) {
    await syncChildCollection(client, "task_fiber_stage_history", task.id, buildFiberStageHistoryRows(task));
  }

  if (newHistoryEntry) {
    assertNoError(
      await client.from("task_history").upsert(buildHistoryRow(task.id, newHistoryEntry), { onConflict: "id" }),
      "Persist task history"
    );
  }
}
