import { PHOTO_CATEGORIES } from "../data/mockData.js";
import { escapeHtml, formatDateTime, icon } from "../lib/helpers.js";

export function PhotoUploader(task, permissions) {
  return `
    <section class="tab-panel">
      <div class="tab-panel__head">
        <div>
          <h3>Φωτογραφική τεκμηρίωση</h3>
          <p>Κατηγοριοποιημένα αποδεικτικά πεδίου για έλεγχο και τεκμηρίωση.</p>
        </div>
        ${
          permissions.canUploadPhotos
            ? `
              <form class="upload-card upload-card--inline">
                <input type="hidden" name="taskId" value="${escapeHtml(task.id)}" />
                <label class="field">
                  <span>Κατηγορία</span>
                  <select name="category">
                    ${PHOTO_CATEGORIES.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join("")}
                  </select>
                </label>
                <label class="button button--secondary upload-button">
                  ${icon("upload")}
                  <span>Μεταφόρτωση εικόνων</span>
                  <input type="file" accept="image/*" multiple data-photo-input hidden />
                </label>
              </form>
            `
            : ""
        }
      </div>

      <div class="photo-grid">
        ${
          task.photos.length
            ? task.photos
                .map(
                  (photo) => `
                    <article class="photo-card">
                      ${
                        photo.preview
                          ? `<a href="${escapeHtml(photo.preview)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(photo.preview)}" alt="${escapeHtml(photo.name)}" /></a>`
                          : `<div class="empty-state"><p>Δεν υπάρχει preview</p></div>`
                      }
                      <div class="photo-card__meta">
                        <div>
                          <strong>${escapeHtml(photo.name)}</strong>
                          <span>${escapeHtml(PHOTO_CATEGORIES.find((item) => item.value === photo.category)?.label || photo.category)}</span>
                        </div>
                        <small>${escapeHtml(photo.uploadedBy)} · ${formatDateTime(photo.uploadedAt)}</small>
                      </div>
                    </article>
                  `
                )
                .join("")
            : `
              <div class="empty-state">
                <p>Δεν έχουν ανέβει φωτογραφίες ακόμα.</p>
              </div>
            `
        }
      </div>
    </section>
  `;
}
