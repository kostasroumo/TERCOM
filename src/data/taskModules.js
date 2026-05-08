export const TASK_MODULES_SEED = [
  {
    id: "module-ftth",
    key: "ftth",
    name: "FTTH",
    description: "Το τρέχον end-to-end flow για αυτοψία, λειτουργίες ινών, validation και παράδοση.",
    accent: "module-ftth",
    icon: "network"
  },
  {
    id: "module-smart-readiness",
    key: "smart_readiness",
    name: "Smart Readiness",
    description: "Ξεχωριστό workspace για έργα readiness, vouchers και κτιριακές παραδόσεις.",
    accent: "module-smart-readiness",
    icon: "smart"
  },
  {
    id: "module-field-maintenance",
    key: "field_maintenance",
    name: "Συντήρηση Πεδίου",
    description: "Βλάβες, επανεπισκέψεις και διορθωτικές παρεμβάσεις με δικό τους queue.",
    accent: "module-field-maintenance",
    icon: "wrench"
  },
  {
    id: "module-special-projects",
    key: "special_projects",
    name: "Λοιπά Έργα",
    description: "Χώρος για ad-hoc ή ειδικά έργα που δεν ανήκουν στο βασικό FTTH flow.",
    accent: "module-special-projects",
    icon: "briefcase"
  }
];

export const LOCAL_USER_MODULE_ACCESS = {
  "admin-1": TASK_MODULES_SEED.map((module) => module.key),
  "partner-1": ["ftth", "smart_readiness"],
  "partner-2": ["ftth", "field_maintenance"],
  "partner-3": ["special_projects"]
};

export function getLocalVisibleModuleKeys(userId, role) {
  if (role === "admin") {
    return TASK_MODULES_SEED.map((module) => module.key);
  }

  return LOCAL_USER_MODULE_ACCESS[userId] || ["ftth"];
}
