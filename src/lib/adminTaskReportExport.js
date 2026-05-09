import { formatDateTime } from "./helpers.js";
import { PIPELINE_META, STATUS_META } from "../data/mockData.js";

let xlsxModulePromise = null;

function sanitizeFileSegment(value = "report") {
  return String(value || "report")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "report";
}

function formatMaterialText(materials = []) {
  if (!materials.length) {
    return "";
  }

  return materials
    .map((item) => {
      const label = [item.code, item.description].filter(Boolean).join(" · ");
      const quantity = Number(item.quantity) || 0;
      const unit = item.unit || "";
      return `${label || "Υλικό"} x ${quantity}${unit ? ` ${unit}` : ""}`;
    })
    .join(" | ");
}

function formatWorkItemText(workItems = []) {
  if (!workItems.length) {
    return "";
  }

  return workItems
    .map((item) => [item.article, item.description].filter(Boolean).join(" · ") || "Άρθρο εργασίας")
    .join(" | ");
}

async function loadXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }

  return xlsxModulePromise;
}

export async function exportAdminTaskReportWorkbook({ user, tasks, modules, filters }) {
  const XLSX = await loadXlsxModule();
  const moduleMap = new Map((modules || []).map((module) => [module.key, module]));
  const exportRows = (tasks || []).map((task) => ({
    "Ημερομηνία ολοκλήρωσης": task.completedAt || task.endDate ? formatDateTime(task.completedAt || task.endDate) : "",
    "Module / εργασία": moduleMap.get(task.moduleKey)?.name || task.moduleKey || "",
    Pipeline: PIPELINE_META[task.pipeline]?.label || task.pipeline || "",
    Status: STATUS_META[task.status]?.label || task.status || "",
    "Κωδικός εργασίας": task.taskCode || task.id || "",
    Τίτλος: task.title || "",
    Πελάτης: task.customerName || "",
    Κινητό: task.mobilePhone || "",
    Σταθερό: task.landlinePhone || "",
    Project: task.projectName || "",
    "SR ID": task.srId || "",
    BID: task.bid || "",
    Διεύθυνση: task.address || "",
    Πόλη: task.city || "",
    "Ανατέθηκε σε": task.assignedUserName || user?.displayName || user?.email || "",
    "Assigned at": task.assignedAt ? formatDateTime(task.assignedAt) : "",
    Έναρξη: task.startDate ? formatDateTime(task.startDate) : "",
    Λήξη: task.endDate ? formatDateTime(task.endDate) : "",
    Υλικά: formatMaterialText(task.materials || []),
    "Άρθρα εργασιών": formatWorkItemText(task.workItems || []),
    "Σημειώσεις admin": task.adminNotes || "",
    "Σημειώσεις συνεργάτη": task.partnerNotes || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
    { wch: 34 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 30 },
    { wch: 18 },
    { wch: 24 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 64 },
    { wch: 64 },
    { wch: 36 },
    { wch: 36 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Αναφορά");

  const userSegment = sanitizeFileSegment(user?.displayName || user?.email || "user");
  const fromSegment = sanitizeFileSegment(filters?.fromDate || "");
  const toSegment = sanitizeFileSegment(filters?.toDate || "");
  const fileName = `report-${userSegment}${fromSegment || toSegment ? `-${fromSegment || "from"}-${toSegment || "to"}` : ""}.xlsx`;

  if (typeof XLSX.writeFileXLSX === "function") {
    XLSX.writeFileXLSX(workbook, fileName);
    return;
  }

  XLSX.writeFile(workbook, fileName, { bookType: "xlsx" });
}
