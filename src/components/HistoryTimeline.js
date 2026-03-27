import { escapeHtml, formatDateTime, icon } from "../lib/helpers.js";

export function HistoryTimeline(entries) {
  return `
    <section class="tab-panel">
      <div class="tab-panel__head">
        <div>
          <h3>Audit trail</h3>
          <p>Πλήρης καταγραφή αλλαγών με χρήστη, χρονική σήμανση και περιγραφή.</p>
        </div>
      </div>

      <div class="timeline">
        ${entries
          .map(
            (entry) => `
              <article class="timeline-item">
                <span class="timeline-item__icon">${icon("history")}</span>
                <div class="timeline-item__body">
                  <div class="timeline-item__head">
                    <strong>${escapeHtml(entry.summary)}</strong>
                    <span>${formatDateTime(entry.at)}</span>
                  </div>
                  <p>${escapeHtml(entry.details)}</p>
                  <small>${escapeHtml(entry.author)}</small>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
