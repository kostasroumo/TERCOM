import { STATUS_META } from "../data/mockData.js";
import { escapeHtml, icon } from "../lib/helpers.js";

export function TaskCard(status, count, pipelineKey) {
  const meta = STATUS_META[status];
  return `
    <button
      class="status-card status-card--${escapeHtml(meta.tone)}"
      data-route="#/tasks"
      data-filter-status="${escapeHtml(status)}"
      data-filter-pipeline="${escapeHtml(pipelineKey)}"
    >
      <span class="status-card__icon">${icon(meta.icon)}</span>
      <span class="status-card__count">${count}</span>
      <span class="status-card__label">${escapeHtml(meta.label)}</span>
      <span class="status-card__hint">${escapeHtml(meta.hint)}</span>
      <span class="status-card__cta">Άνοιγμα queue</span>
    </button>
  `;
}
