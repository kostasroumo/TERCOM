export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDate(value) {
  if (!value) {
    return "Δεν έχει οριστεί";
  }

  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) {
    return "Δεν έχει οριστεί";
  }

  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatCompactDateTime(value) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function countElapsedDays(startValue, endValue) {
  if (!startValue) {
    return null;
  }

  const start = new Date(startValue);
  const end = endValue ? new Date(endValue) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function formatElapsedDays(startValue, endValue) {
  const days = countElapsedDays(startValue, endValue);

  if (days === null) {
    return "Δεν έχει οριστεί";
  }

  if (days === 1) {
    return "1 ημέρα";
  }

  return `${days} ημέρες`;
}

export function formatFileSize(size) {
  if (!size && size !== 0) {
    return "-";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function createId(prefix = "ID") {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

export function countByStatus(tasks, statusKey) {
  return tasks.filter((task) => task.status === statusKey).length;
}

export function upcomingCount(tasks) {
  const today = new Date();
  return tasks.filter((task) => {
    if (!task.startDate) {
      return false;
    }

    const taskDate = new Date(task.startDate);
    return (
      task.status === "scheduled" &&
      taskDate.getFullYear() === today.getFullYear() &&
      taskDate.getMonth() === today.getMonth() &&
      taskDate.getDate() === today.getDate()
    );
  }).length;
}

export function icon(name) {
  const icons = {
    dashboard: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7V11h-7v9Zm0-18v7h7V2h-7Z"></path>
      </svg>
    `,
    tasks: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5h14v2H7V5Zm0 6h14v2H7v-2Zm0 6h14v2H7v-2ZM3 6.5A1.5 1.5 0 1 0 3 3.5a1.5 1.5 0 0 0 0 3Zm0 6A1.5 1.5 0 1 0 3 9.5a1.5 1.5 0 0 0 0 3Zm0 6A1.5 1.5 0 1 0 3 15.5a1.5 1.5 0 0 0 0 3Z"></path>
      </svg>
    `,
    assigned: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 6.5A3.5 3.5 0 1 0 8 13.5a3.5 3.5 0 0 0 0-7Zm9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-9.7 5.5C4.4 16 2 17.6 2 19.7V21h12v-1.3c0-2.1-2.4-3.7-5.7-3.7Zm9.5 1c-1.2 0-2.4.3-3.3.9.9.7 1.5 1.7 1.5 2.8V21h7v-1c0-1.7-2.2-3-5.2-3Z"></path>
      </svg>
    `,
    scheduled: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm13 8H4v9h16v-9Zm-2 3v2h-2v-2h2Zm-4 0v2h-2v-2h2Zm-4 0v2H8v-2h2Z"></path>
      </svg>
    `,
    in_progress: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2 4.5 7.79L21 12l-4.5 2.21L12 22l-4.5-7.79L3 12l4.5-2.21L12 2Zm0 4.4-2.3 4L5.4 12l4.3 1.6L12 17.6l2.3-4 4.3-1.6-4.3-1.6L12 6.4Z"></path>
      </svg>
    `,
    pending_validation: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 1H4a2 2 0 0 0-2 2v18l4-3h10a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2Zm6 4v14a2 2 0 0 1-2 2H7v-2h13V5h2Zm-6 6-1.4-1.4-3.1 3.1-1.6-1.6L8.5 12.5l2.9 2.9L16 11Z"></path>
      </svg>
    `,
    completed: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm-1.2 14.3-3.6-3.6 1.4-1.4 2.2 2.2 5-5 1.4 1.4-6.4 6.4Z"></path>
      </svg>
    `,
    upload: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 20h14v-2H5v2Zm7-18-5.5 5.5 1.4 1.4L11 6.8V16h2V6.8l3.1 3.1 1.4-1.4L12 2Z"></path>
      </svg>
    `,
    files: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 2a2 2 0 0 0-2 2v16l4-3h10a2 2 0 0 0 2-2V2H6Zm9 8H9V8h6v2Zm0 4H9v-2h6v2Z"></path>
      </svg>
    `,
    history: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5c1.93 0 3.68.78 4.95 2.05L15 10h7V3l-2.62 2.62A8.96 8.96 0 0 0 13 3Zm-1 5v5l4.25 2.52.75-1.23-3.5-2.04V8H12Z"></path>
      </svg>
    `,
    materials: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Zm0 4.5 9 4.5 9-4.5V16.5L12 21l-9-4.5V12Z"></path>
      </svg>
    `,
    building: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 21V5l8-3 8 3v16H4Zm4-2h2v-2H8v2Zm0-4h2v-2H8v2Zm0-4h2V9H8v2Zm6 8h2v-2h-2v2Zm0-4h2v-2h-2v2Zm0-4h2V9h-2v2Z"></path>
      </svg>
    `,
    shield: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4 2.6 2.6 4.6-4.6L17 10l-6 6Z"></path>
      </svg>
    `,
    system: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m19.14 12.94.86-1.49-1.7-2.94-1.7.3a5.58 5.58 0 0 0-1.23-.71L14.93 6h-3.4l-.44 2.1c-.43.17-.84.4-1.23.7l-1.7-.29L6.46 11.45l.86 1.49c-.04.35-.04.71 0 1.06l-.86 1.49 1.7 2.94 1.7-.3c.39.31.8.54 1.23.71l.44 2.1h3.4l.44-2.1c.43-.17.84-.4 1.23-.7l1.7.29 1.7-2.94-.86-1.49c.04-.35.04-.71 0-1.06ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"></path>
      </svg>
    `,
    print: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8V3h10v5H7Zm8-2V5H9v1h6Zm3 3a3 3 0 0 1 3 3v4h-3v5H6v-5H3v-4a3 3 0 0 1 3-3h12Zm-2 10v-5H8v5h8Zm2-5h1v-2a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v2h1v-2h12v2Z"></path>
      </svg>
    `
  };

  return icons[name] || icons.tasks;
}
