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
    return "—";
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
    return "—";
  }

  return workItems
    .map((item) => [item.article, item.description].filter(Boolean).join(" · ") || "Άρθρο εργασίας")
    .join(" | ");
}

function formatTaskText(task) {
  const taskCode = String(task?.taskCode || "").trim();
  const title = String(task?.title || "").trim();

  if (taskCode && title) {
    return `${taskCode} · ${title}`;
  }

  return taskCode || title || "Εργασία";
}

function formatDateRangeText(filters = {}) {
  const fromDate = String(filters?.fromDate || "").trim();
  const toDate = String(filters?.toDate || "").trim();

  if (fromDate && toDate) {
    return `${fromDate} έως ${toDate}`;
  }

  if (fromDate) {
    return `Από ${fromDate}`;
  }

  if (toDate) {
    return `Έως ${toDate}`;
  }

  return "Όλο το διαθέσιμο διάστημα";
}

function sortByLabel(items = []) {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, "el"));
}

function buildMaterialSummary(tasks = []) {
  const totals = new Map();

  tasks.forEach((task) => {
    (task.materials || []).forEach((item) => {
      const code = String(item.code || "").trim();
      const description = String(item.description || "").trim();
      const unit = String(item.unit || "").trim();
      const key = JSON.stringify([code, description, unit]);
      const currentEntry = totals.get(key) || {
        label: [code, description].filter(Boolean).join(" · ") || "Υλικό",
        unit,
        quantity: 0
      };

      currentEntry.quantity += Number(item.quantity) || 0;
      totals.set(key, currentEntry);
    });
  });

  return sortByLabel([...totals.values()]);
}

function buildWorkItemSummary(tasks = []) {
  const totals = new Map();

  tasks.forEach((task) => {
    (task.workItems || []).forEach((item) => {
      const article = String(item.article || "").trim();
      const description = String(item.description || "").trim();
      const key = JSON.stringify([article, description]);
      const currentEntry = totals.get(key) || {
        label: [article, description].filter(Boolean).join(" · ") || "Άρθρο εργασίας",
        count: 0
      };

      currentEntry.count += 1;
      totals.set(key, currentEntry);
    });
  });

  return sortByLabel([...totals.values()]);
}

async function loadXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }

  return xlsxModulePromise;
}

export async function exportAdminTaskReportWorkbook({ user, tasks, filters }) {
  const XLSX = await loadXlsxModule();
  const userLabel = user?.displayName || user?.email || "Χρήστης";
  const materialSummary = buildMaterialSummary(tasks || []);
  const workItemSummary = buildWorkItemSummary(tasks || []);
  const totalMaterialQuantity = (tasks || []).reduce(
    (sum, task) => sum + (task.materials || []).reduce((innerSum, item) => innerSum + (Number(item.quantity) || 0), 0),
    0
  );
  const totalWorkItems = (tasks || []).reduce((sum, task) => sum + (task.workItems || []).length, 0);
  const detailRows = (tasks || []).map((task) => [
    task.assignedUserName || userLabel,
    formatTaskText(task),
    formatMaterialText(task.materials || []),
    formatWorkItemText(task.workItems || [])
  ]);
  const worksheetRows = [
    ["Χρήστης", userLabel],
    ["Χρονικό διάστημα", formatDateRangeText(filters)],
    [],
    ["Χρήστης", "Εργασία", "Υλικά", "Άρθρα εργασιών"],
    ...detailRows,
    [],
    ["ΣΥΝΟΛΑ ΦΙΛΤΡΟΥ"],
    ["Σύνολο εργασιών", (tasks || []).length],
    ["Σύνολο ποσότητας υλικών", totalMaterialQuantity],
    ["Σύνολο άρθρων εργασιών", totalWorkItems],
    [],
    ["ΣΥΝΟΛΑ ΥΛΙΚΩΝ"],
    ["Υλικό", "Συνολική ποσότητα", "Μονάδα"]
  ];

  if (materialSummary.length) {
    materialSummary.forEach((item) => {
      worksheetRows.push([item.label, item.quantity, item.unit || ""]);
    });
  } else {
    worksheetRows.push(["Δεν υπάρχουν υλικά στο επιλεγμένο φίλτρο."]);
  }

  worksheetRows.push([]);
  worksheetRows.push(["ΣΥΝΟΛΑ ΑΡΘΡΩΝ ΕΡΓΑΣΙΩΝ"]);
  worksheetRows.push(["Άρθρο εργασίας", "Πλήθος"]);

  if (workItemSummary.length) {
    workItemSummary.forEach((item) => {
      worksheetRows.push([item.label, item.count]);
    });
  } else {
    worksheetRows.push(["Δεν υπάρχουν άρθρα εργασιών στο επιλεγμένο φίλτρο."]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 46 },
    { wch: 72 },
    { wch: 72 }
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
