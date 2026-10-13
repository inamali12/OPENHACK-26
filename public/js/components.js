/**
 * SHERM - UI Components, Modals, Toasts, and Formatters
 */
const Components = {
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  playChime(type = 'click') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'surge') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(660, now + 0.12);
        osc.frequency.setValueAtTime(880, now + 0.24);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'allocate') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    } catch {
      // AudioContext policy restriction fallback
    }
  },

  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${this.escapeHtml(message)}</span>
      <button style="background:none;border:none;color:#fff;cursor:pointer;font-size:1.1rem;">&times;</button>
    `;

    toast.querySelector('button').addEventListener('click', () => toast.remove());
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  showConfirmModal({ title = 'Confirm Action', message, confirmText = 'Confirm', isDanger = true }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('modal-title');
      const msgEl = document.getElementById('modal-message');
      const confirmBtn = document.getElementById('modal-confirm-btn');
      const cancelBtn = document.getElementById('modal-cancel-btn');
      const closeBtn = document.getElementById('modal-close-btn');

      titleEl.textContent = title;
      msgEl.innerHTML = typeof message === 'string' ? message : '';
      confirmBtn.textContent = confirmText;
      confirmBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

      const cleanUp = () => {
        modal.classList.add('hidden');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
      };

      confirmBtn.onclick = () => {
        cleanUp();
        resolve(true);
      };

      cancelBtn.onclick = () => {
        cleanUp();
        resolve(false);
      };

      closeBtn.onclick = () => {
        cleanUp();
        resolve(false);
      };

      modal.classList.remove('hidden');
    });
  },

  showGenericModal(title, htmlContent) {
    const modal = document.getElementById('generic-modal');
    const titleEl = document.getElementById('generic-modal-title');
    const bodyEl = document.getElementById('generic-modal-body');
    const closeBtn = document.getElementById('generic-modal-close');

    titleEl.textContent = title;
    bodyEl.innerHTML = htmlContent;

    closeBtn.onclick = () => {
      modal.classList.add('hidden');
    };

    modal.classList.remove('hidden');
  },

  closeGenericModal() {
    const modal = document.getElementById('generic-modal');
    if (modal) modal.classList.add('hidden');
  },

  renderPriorityBadge(priority) {
    const prio = (priority || 'Low').trim();
    const map = {
      Critical: 'badge-critical',
      High: 'badge-high',
      Medium: 'badge-medium',
      Low: 'badge-low',
    };
    const cls = map[prio] || 'badge-low';
    return `<span class="badge ${cls}">${this.escapeHtml(prio)}</span>`;
  },

  renderCaseStatusBadge(status) {
    const st = (status || 'New').trim();
    let cls = 'badge-medium';
    if (st === 'New') cls = 'badge-low';
    if (st === 'Triage') cls = 'badge-high';
    if (st === 'Allocated') cls = 'badge-available';
    if (st === 'In Treatment') cls = 'badge-available';
    if (st === 'Closed') cls = 'badge-offline';
    return `<span class="badge ${cls}">${this.escapeHtml(st)}</span>`;
  },

  renderBedStatusBadge(status) {
    const st = (status || 'Available').trim();
    if (st === 'Available') return `<span class="badge badge-available">● Available</span>`;
    if (st === 'Occupied') return `<span class="badge badge-busy">● Occupied</span>`;
    return `<span class="badge badge-offline">● Out of Service</span>`;
  },

  renderDoctorStatusBadge(status) {
    const st = (status || 'Available').trim();
    if (st === 'Available') return `<span class="badge badge-available">Available</span>`;
    if (st === 'Busy') return `<span class="badge badge-busy">Busy</span>`;
    return `<span class="badge badge-offline">Off Duty</span>`;
  },

  renderAmbulanceStatusBadge(status) {
    const st = (status || 'Available').trim();
    if (st === 'Available') return `<span class="badge badge-available">Ready / Base</span>`;
    if (st === 'Dispatched') return `<span class="badge badge-busy">Dispatched</span>`;
    if (st === 'En Route') return `<span class="badge badge-high">En Route</span>`;
    if (st === 'At Hospital') return `<span class="badge badge-available">At Hospital</span>`;
    return `<span class="badge badge-offline">Out of Service</span>`;
  },

  formatDateTime(isoStr) {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  },
};
