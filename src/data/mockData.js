import { deepClone } from "../lib/helpers.js";

export const ROLE_LABELS = {
  admin: "Admin",
  partner: "Partner"
};

export const STATUS_META = {
  unassigned: {
    label: "Μη ανατεθειμένη",
    tone: "unassigned",
    icon: "tasks",
    hint: "Η εργασία δημιουργήθηκε και περιμένει ανάθεση"
  },
  assigned: {
    label: "Ανατέθηκε",
    tone: "assigned",
    icon: "assigned",
    hint: "Χρειάζεται οργάνωση και ανάθεση"
  },
  scheduled: {
    label: "Προγραμματισμένη",
    tone: "scheduled",
    icon: "scheduled",
    hint: "Έχει οριστεί συνεργάτης και χρονικό παράθυρο"
  },
  in_progress: {
    label: "Σε εξέλιξη",
    tone: "in-progress",
    icon: "in_progress",
    hint: "Ο συνεργάτης δουλεύει στο πεδίο"
  },
  pending_validation: {
    label: "Για επικύρωση",
    tone: "pending-validation",
    icon: "pending_validation",
    hint: "Περιμένει έλεγχο και αποδοχή από admin"
  },
  completed: {
    label: "Ολοκληρωμένη",
    tone: "completed",
    icon: "completed",
    hint: "Η εργασία έχει κλείσει επιτυχώς"
  }
};

export const STATUS_ORDER = [
  "assigned",
  "scheduled",
  "in_progress",
  "pending_validation",
  "completed"
];

export const STATUS_OPTIONS_ORDER = [
  "unassigned",
  "assigned",
  "scheduled",
  "in_progress",
  "pending_validation",
  "completed"
];

export const TASK_TYPES = [
  { value: "survey", label: "Αυτοψία" },
  { value: "installation", label: "Εγκατάσταση" },
  { value: "repair", label: "Επισκευή" }
];

export const PIPELINE_META = {
  autopsia: {
    label: "Αυτοψία",
    tone: "pipeline-autopsia",
    hint: "Αρχική αποτύπωση, επίσκεψη και τεκμηρίωση πεδίου.",
    next: "leitourgies_inwn"
  },
  leitourgies_inwn: {
    label: "Λειτουργίες Ινών",
    tone: "pipeline-leitourgies-inwn",
    hint: "Επόμενη επιχειρησιακή φάση για τις εργασίες ινών μετά την αυτοψία.",
    next: null
  }
};

export const PIPELINE_ORDER = ["autopsia", "leitourgies_inwn"];

export const PHOTO_CATEGORIES = [
  { value: "before", label: "Πριν" },
  { value: "after", label: "Μετά" },
  { value: "equipment", label: "Εξοπλισμός" },
  { value: "wiring", label: "Καλωδίωση" }
];

export const USER_DIRECTORY = {
  admin: [
    { id: "admin-1", name: "Admin 1", title: "Administrator" }
  ],
  partner: [
    { id: "partner-1", name: "Συνεργάτης 1", title: "Field Partner" },
    { id: "partner-2", name: "Συνεργάτης 2", title: "Field Partner" }
  ]
};

export const TEAM_OPTIONS = [
  "Fiber Survey Crew A",
  "Civil Access Unit",
  "Repair Cell North",
  "Smart Readiness Squad"
];

function placeholderData(title, color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="#0f2533" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" fill="url(#bg)" rx="26" />
      <circle cx="530" cy="86" r="54" fill="rgba(255,255,255,0.13)" />
      <path d="M84 290h472" stroke="rgba(255,255,255,0.24)" stroke-width="14" stroke-linecap="round" />
      <path d="M84 240h300" stroke="rgba(255,255,255,0.44)" stroke-width="14" stroke-linecap="round" />
      <path d="M84 186h180" stroke="rgba(255,255,255,0.3)" stroke-width="12" stroke-linecap="round" />
      <text x="84" y="112" font-family="Avenir Next, Segoe UI, sans-serif" font-size="38" fill="white">${title}</text>
      <text x="84" y="148" font-family="Avenir Next, Segoe UI, sans-serif" font-size="18" fill="rgba(255,255,255,0.75)">Mock field documentation preview</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const tasks = [
  {
    id: "TASK-24031",
    title: "Αυτοψία πολυκατοικίας για smart readiness",
    type: "survey",
    pipeline: "autopsia",
    status: "scheduled",
    address: "Λεωφ. Κηφισίας 124",
    city: "Αθήνα",
    customerName: "Ελένη Παπαδοπούλου",
    mobilePhone: "6944123456",
    landlinePhone: "2106987452",
    srId: "SR-74273960",
    bid: "BID-ATH-2104",
    projectName: "North Athens Fiber Readiness",
    resourceTeam: "Fiber Survey Crew A",
    assignedAt: "2026-03-28T15:20",
    completedAt: "",
    assignedUserId: "partner-1",
    assignedUserName: "Συνεργάτης 1",
    startDate: "2026-03-30T08:30",
    endDate: "2026-03-30T10:30",
    notes:
      "Επιβεβαίωση πρόσβασης roof cabinet και φωτογράφιση κάθετου οδεύματος. Χρειάζεται επικοινωνία με διαχειριστή κτιρίου πριν την άφιξη.",
    createdAt: "2026-03-20T09:15",
    createdBy: "Admin 1",
    updatedAt: "2026-03-29T12:05",
    updatedBy: "Admin 1",
    flags: {
      apiStatus: "SYNCED",
      validationLock: false,
      openIssues: false,
      smartReadiness: "Σε αναμονή πρόσβασης",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationReason: ""
    },
    photos: [
      {
        id: "PHOTO-1",
        name: "building-entry.jpg",
        category: "before",
        uploadedBy: "Admin 1",
        uploadedAt: "2026-03-29T12:06",
        preview: placeholderData("Building entry", "#f6a623")
      }
    ],
    files: [
      {
        id: "FILE-1",
        name: "permit-request.pdf",
        type: "application/pdf",
        size: 284320,
        uploadedBy: "Admin 1",
        uploadedAt: "2026-03-29T12:10"
      }
    ],
    history: [
      {
        id: "HIST-1",
        author: "Admin 1",
        at: "2026-03-20T09:15",
        summary: "Δημιουργία εργασίας",
        details: "Καταχωρήθηκε νέα αυτοψία για πολυκατοικία στην Αθήνα."
      },
      {
        id: "HIST-2",
        author: "Admin 1",
        at: "2026-03-29T12:05",
        summary: "Ανάθεση και προγραμματισμός",
        details: "Ορίστηκε συνεργάτης και χρονικό παράθυρο επίσκεψης."
      }
    ],
    pipelineHistory: [],
    materials: [
      { id: "MAT-1", code: "FBR-12", description: "Fiber terminal kit", quantity: 1, unit: "τεμ." },
      { id: "MAT-2", code: "CBL-UTP", description: "UTP spool 20m", quantity: 1, unit: "ρολό" }
    ],
    floors: [
      { id: "FL-1", level: "Ισόγειο", units: 2, access: "Ελεύθερη", riser: "Κεντρικός" },
      { id: "FL-2", level: "1ος", units: 4, access: "Κατόπιν συνεννόησης", riser: "Κεντρικός" }
    ],
    safety: [
      { id: "SAFE-1", item: "Πρόσβαση σε ταράτσα", status: "needs-review", note: "Αναμένεται κλειδί από διαχειριστή" },
      { id: "SAFE-2", item: "Ηλεκτρολογικός πίνακας", status: "ok", note: "Ελεγχόμενη πρόσβαση" }
    ]
  },
  {
    id: "TASK-24032",
    title: "Εγκατάσταση εξοπλισμού οπτικής ίνας σε MDU",
    type: "installation",
    pipeline: "autopsia",
    status: "in_progress",
    address: "Εθνικής Αντιστάσεως 45",
    city: "Κομοτηνή",
    customerName: "Ιωάννης Καραλής",
    mobilePhone: "6977654321",
    landlinePhone: "2531022455",
    srId: "SR-73318842",
    bid: "BID-KOM-8760",
    projectName: "Komotini MDU Rollout",
    resourceTeam: "Smart Readiness Squad",
    assignedAt: "2026-03-29T16:45",
    completedAt: "",
    assignedUserId: "partner-2",
    assignedUserName: "Συνεργάτης 2",
    startDate: "2026-03-30T09:00",
    endDate: "2026-03-30T13:30",
    notes:
      "Το συνεργείο ξεκίνησε την τοποθέτηση κατανεμητή. Απαιτείται τελική φωτογράφιση patch panel και ενημέρωση για τις οδεύσεις.",
    createdAt: "2026-03-18T08:45",
    createdBy: "Admin 1",
    updatedAt: "2026-03-30T09:12",
    updatedBy: "Συνεργάτης 2",
    flags: {
      apiStatus: "LOCAL-ONLY",
      validationLock: false,
      openIssues: false,
      smartReadiness: "ΝΑΙ",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationReason: ""
    },
    photos: [
      {
        id: "PHOTO-2",
        name: "cabinet-progress.jpg",
        category: "equipment",
        uploadedBy: "Συνεργάτης 2",
        uploadedAt: "2026-03-30T09:14",
        preview: placeholderData("Cabinet progress", "#8f95ff")
      }
    ],
    files: [],
    history: [
      {
        id: "HIST-3",
        author: "Admin 1",
        at: "2026-03-18T08:45",
        summary: "Δημιουργία εργασίας",
        details: "Ζητήθηκε εγκατάσταση εξοπλισμού σε πολυκατοικία."
      },
      {
        id: "HIST-4",
        author: "Συνεργάτης 2",
        at: "2026-03-30T09:12",
        summary: "Έναρξη εκτέλεσης",
        details: "Ο συνεργάτης σημείωσε την εργασία ως σε εξέλιξη."
      }
    ],
    pipelineHistory: [],
    materials: [
      { id: "MAT-3", code: "ONT-24", description: "Optical network terminal", quantity: 4, unit: "τεμ." },
      { id: "MAT-4", code: "SPL-08", description: "Splitter 1:8", quantity: 1, unit: "τεμ." }
    ],
    floors: [
      { id: "FL-3", level: "Ισόγειο", units: 1, access: "Ελεύθερη", riser: "Κεντρικός" },
      { id: "FL-4", level: "2ος", units: 3, access: "Κλήση ιδιοκτητών", riser: "Ανατολικό shaft" }
    ],
    safety: [
      { id: "SAFE-3", item: "Σκάλα πρόσβασης", status: "ok", note: "Έγινε οπτικός έλεγχος" },
      { id: "SAFE-4", item: "Σήμανση εργοταξίου", status: "warning", note: "Απαιτείται πρόσθετη κορδέλα" }
    ]
  },
  {
    id: "TASK-24033",
    title: "Repair ticket για πτώση σήματος",
    type: "repair",
    pipeline: "autopsia",
    status: "unassigned",
    address: "Πίνδου 19",
    city: "Θεσσαλονίκη",
    customerName: "Χρήστος Νικολάου",
    mobilePhone: "6981122334",
    landlinePhone: "",
    srId: "SR-94533210",
    bid: "BID-TH-1190",
    projectName: "North Grid Stabilisation",
    resourceTeam: "Repair Cell North",
    assignedAt: "",
    completedAt: "",
    assignedUserId: "",
    assignedUserName: "",
    startDate: "",
    endDate: "",
    notes:
      "Ο πελάτης αναφέρει διακοπές σύνδεσης τις απογευματινές ώρες. Η εργασία περιμένει ανάθεση από τον admin.",
    createdAt: "2026-03-30T07:25",
    createdBy: "Admin 1",
    updatedAt: "2026-03-30T07:26",
    updatedBy: "Admin 1",
    flags: {
      apiStatus: "SYNCED",
      validationLock: false,
      openIssues: false,
      smartReadiness: "N/A",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationReason: ""
    },
    photos: [],
    files: [],
    history: [
      {
        id: "HIST-5",
        author: "Admin 1",
        at: "2026-03-30T07:25",
        summary: "Δημιουργία εργασίας",
        details: "Η εργασία δημιουργήθηκε και αναμένει ανάθεση σε συνεργάτη."
      }
    ],
    pipelineHistory: [],
    materials: [],
    floors: [
      { id: "FL-5", level: "Ισόγειο", units: 1, access: "Ελεύθερη", riser: "Κύρια είσοδος" }
    ],
    safety: [
      { id: "SAFE-5", item: "Εργασία σε εξωτερικό χώρο", status: "ok", note: "Κανονικές συνθήκες" }
    ]
  },
  {
    id: "TASK-24034",
    title: "Τελικός έλεγχος ποιότητας κατακόρυφης καλωδίωσης",
    type: "survey",
    pipeline: "autopsia",
    status: "pending_validation",
    address: "Μακεδονομάχων 8",
    city: "Πάτρα",
    customerName: "Μαρία Σταθοπούλου",
    mobilePhone: "6977001100",
    landlinePhone: "2610223344",
    srId: "SR-80221490",
    bid: "BID-PAT-5511",
    projectName: "Patra Vertical Fiber Upgrade",
    resourceTeam: "Fiber Survey Crew A",
    assignedAt: "2026-03-28T10:10",
    completedAt: "",
    assignedUserId: "partner-1",
    assignedUserName: "Συνεργάτης 1",
    startDate: "2026-03-29T11:00",
    endDate: "2026-03-29T13:15",
    notes:
      "Η εγκατάσταση ολοκληρώθηκε και το πακέτο παραδόθηκε για επικύρωση με πλήρη φωτογραφική τεκμηρίωση.",
    createdAt: "2026-03-21T10:05",
    createdBy: "Admin 1",
    updatedAt: "2026-03-29T14:02",
    updatedBy: "Συνεργάτης 1",
    flags: {
      apiStatus: "SYNCED",
      validationLock: true,
      openIssues: false,
      smartReadiness: "ΝΑΙ",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationReason: ""
    },
    photos: [
      {
        id: "PHOTO-3",
        name: "riser-after.jpg",
        category: "after",
        uploadedBy: "Συνεργάτης 1",
        uploadedAt: "2026-03-29T13:55",
        preview: placeholderData("Riser after", "#1fc879")
      }
    ],
    files: [
      {
        id: "FILE-2",
        name: "handover-report.pdf",
        type: "application/pdf",
        size: 622120,
        uploadedBy: "Συνεργάτης 1",
        uploadedAt: "2026-03-29T13:58"
      }
    ],
    history: [
      {
        id: "HIST-6",
        author: "Συνεργάτης 1",
        at: "2026-03-29T14:02",
        summary: "Παράδοση για επικύρωση",
        details: "Η εργασία μεταφέρθηκε στο στάδιο ελέγχου."
      }
    ],
    pipelineHistory: [],
    materials: [
      { id: "MAT-5", code: "DUCT-16", description: "Micro duct 16mm", quantity: 12, unit: "μ." }
    ],
    floors: [
      { id: "FL-6", level: "3ος", units: 2, access: "Ελεύθερη", riser: "Νότιο shaft" }
    ],
    safety: [
      { id: "SAFE-6", item: "Πρόσβαση σε shaft", status: "ok", note: "Χωρίς εμπόδια" }
    ]
  },
  {
    id: "TASK-24035",
    title: "Κλείσιμο αποκατάστασης σε cabinet cluster",
    type: "repair",
    pipeline: "leitourgies_inwn",
    status: "completed",
    address: "25ης Μαρτίου 61",
    city: "Ηράκλειο",
    customerName: "Αθανάσιος Γεωργίου",
    mobilePhone: "6945001122",
    landlinePhone: "",
    srId: "SR-91004500",
    bid: "BID-HER-7734",
    projectName: "Heraklion Stabilization Wave 3",
    resourceTeam: "Repair Cell North",
    assignedAt: "2026-03-23T14:05",
    completedAt: "2026-03-24T16:30",
    assignedUserId: "partner-2",
    assignedUserName: "Συνεργάτης 2",
    startDate: "2026-03-24T08:15",
    endDate: "2026-03-24T11:20",
    notes:
      "Αποκαταστάθηκε η τροφοδοσία του cabinet και επαληθεύτηκε η υπηρεσία. Δεν υπάρχουν εκκρεμότητες.",
    createdAt: "2026-03-22T09:00",
    createdBy: "Admin 1",
    updatedAt: "2026-03-24T16:30",
    updatedBy: "Admin 1",
    flags: {
      apiStatus: "SYNCED",
      validationLock: false,
      openIssues: false,
      smartReadiness: "N/A",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationReason: ""
    },
    photos: [
      {
        id: "PHOTO-4",
        name: "cabinet-fixed.jpg",
        category: "after",
        uploadedBy: "Συνεργάτης 2",
        uploadedAt: "2026-03-24T11:18",
        preview: placeholderData("Cabinet fixed", "#12c48d")
      }
    ],
    files: [],
    history: [
      {
        id: "HIST-7A",
        author: "Admin 1",
        at: "2026-03-23T13:45",
        summary: "Μετάβαση στο pipeline Λειτουργίες Ινών",
        details: "Η φάση Αυτοψία εγκρίθηκε και η ίδια εργασία άνοιξε στη φάση Λειτουργίες Ινών."
      },
      {
        id: "HIST-7",
        author: "Admin 1",
        at: "2026-03-24T16:30",
        summary: "Επικύρωση ολοκλήρωσης",
        details: "Η εργασία εγκρίθηκε και έκλεισε."
      }
    ],
    pipelineHistory: [
      {
        id: "PIPE-1",
        pipeline: "autopsia",
        completedAt: "2026-03-23T13:45",
        approvedBy: "Admin 1"
      }
    ],
    materials: [
      { id: "MAT-6", code: "PSU-48", description: "Power supply module", quantity: 1, unit: "τεμ." }
    ],
    floors: [
      { id: "FL-7", level: "Εξωτερικό cabinet", units: 1, access: "Ελεύθερη", riser: "N/A" }
    ],
    safety: [
      { id: "SAFE-7", item: "Κλείδωμα cabinet", status: "ok", note: "Επανατοποθετήθηκε" }
    ]
  },
  {
    id: "TASK-24036",
    title: "Νέα εργασία χαρτογράφησης καλωδίωσης",
    type: "survey",
    pipeline: "autopsia",
    status: "unassigned",
    address: "Σπύρου Λούη 12",
    city: "Λάρισα",
    customerName: "Κατερίνα Ράλλη",
    mobilePhone: "6933112244",
    landlinePhone: "2410556677",
    srId: "SR-81223010",
    bid: "BID-LAR-3900",
    projectName: "Larisa Mapping Sprint",
    resourceTeam: "Fiber Survey Crew A",
    assignedAt: "",
    completedAt: "",
    assignedUserId: "",
    assignedUserName: "",
    startDate: "",
    endDate: "",
    notes:
      "Νέα αυτοψία για χαρτογράφηση υφιστάμενων οδεύσεων. Το slot επίσκεψης και η ανάθεση θα γίνουν από admin.",
    createdAt: "2026-03-30T08:00",
    createdBy: "Admin 1",
    updatedAt: "2026-03-30T08:00",
    updatedBy: "Admin 1",
    flags: {
      apiStatus: "PENDING",
      validationLock: false,
      openIssues: false,
      smartReadiness: "Άγνωστο",
      cancellationRequested: false,
      cancellationRequestedAt: "",
      cancellationRequestedBy: "",
      cancellationReason: ""
    },
    photos: [],
    files: [],
    history: [
      {
        id: "HIST-8",
        author: "Admin 1",
        at: "2026-03-30T08:00",
        summary: "Δημιουργία εργασίας",
        details: "Η εργασία καταχωρήθηκε και περιμένει ανάθεση."
      }
    ],
    pipelineHistory: [],
    materials: [],
    floors: [
      { id: "FL-8", level: "Υπόγειο", units: 1, access: "Με συνοδεία", riser: "Κύριο shaft" }
    ],
    safety: [
      { id: "SAFE-8", item: "Υπόγειος χώρος", status: "warning", note: "Απαιτείται φωτισμός" }
    ]
  }
];

export const PARTNERS = USER_DIRECTORY.partner;
export const TECHNICIANS = PARTNERS;

export function createInitialState() {
  return {
    currentRole: "admin",
    currentUserId: USER_DIRECTORY.admin[0].id,
    filters: {
      search: "",
      status: "all",
      pipeline: "all",
      city: "all",
      technician: "all"
    },
    ui: {
      activeTab: "main",
      showCreateModal: false,
      sidebarCollapsed: false,
      validationComment: "",
      cancellationComment: "",
      exportReturnRoute: "#/dashboard",
      reportAutoPrint: false
    },
    tasks: deepClone(tasks)
  };
}
