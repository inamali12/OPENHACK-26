/**
 * SHERM - Smart Hospital Emergency Resource Manager
 * Master Single-Page Application (SPA) Controller
 */

const App = {
  currentView: 'dashboard',
  casesPage: 1,
  casesLimit: 12,
  auditPage: 1,
  auditLimit: 20,
  preselectedCaseIdForAlloc: null,

  async init() {
    this.initTheme();
    this.initClock();
    this.bindGlobalEvents();
    this.bindLoginEvents();

    // Check existing session
    const isAuthenticated = await Auth.checkSession();
    if (isAuthenticated) {
      SSEManager.init();
      this.bindSSEEvents();
      this.loadCurrentView();
    }
  },

  initTheme() {
    const savedTheme = localStorage.getItem('sherm_theme') || 'theme-dark';
    document.body.className = savedTheme;
    this.updateThemeButtonUI(savedTheme);
  },

  toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'theme-light' : 'theme-dark';
    document.body.className = newTheme;
    localStorage.setItem('sherm_theme', newTheme);
    this.updateThemeButtonUI(newTheme);
    if (this.currentView === 'dashboard') {
      this.loadDashboardData();
    }
  },

  updateThemeButtonUI(theme) {
    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon && label) {
      if (theme === 'theme-light') {
        icon.textContent = '🌙';
        label.textContent = 'Dark Mode';
      } else {
        icon.textContent = '☀️';
        label.textContent = 'Light Mode';
      }
    }
  },

  initClock() {
    const clockEl = document.getElementById('system-clock');
    if (!clockEl) return;
    const update = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour12: false });
    };
    update();
    setInterval(update, 1000);
  },

  bindSSEEvents() {
    SSEManager.on('refresh', () => {
      this.loadCurrentView();
    });
  },

  bindGlobalEvents() {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const view = btn.dataset.view;
        if (view) {
          this.navigateTo(view);
        }
      });
    });

    // Theme Toggle Button
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        Components.playChime('click');
        this.toggleTheme();
      });
    }

    // Command Palette & Spotlight (Ctrl + K)
    this.bindCommandPaletteEvents();

    // Hackathon Guided Showcase Tour
    this.bindTourEvents();

    // Emergency Notification Center & Channels
    this.bindNotificationCenterEvents();

    // Sidebar toggle for mobile
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) sidebar.classList.toggle('open');
      });
    }

    // Manual Refresh
    const refreshBtn = document.getElementById('manual-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        Components.playChime('click');
        this.loadCurrentView();
        Components.showToast('Data refreshed.', 'info');
      });
    }

    // Surge Event Simulation Trigger (Demonstration & Hackathon Showcase)
    const surgeBtn = document.getElementById('btn-simulate-surge');
    if (surgeBtn) {
      surgeBtn.addEventListener('click', async () => {
        const confirmed = await Components.showConfirmModal({
          title: 'Simulate Surge Influx',
          message: 'Triggering a surge will inject 3 high-acuity trauma and respiratory patients into the operational queue, allowing you to test real-time reallocation. Proceed?',
          confirmText: 'Trigger Surge',
          isDanger: false,
        });
        if (confirmed) {
          try {
            Components.playChime('surge');
            const res = await API.simulateSurge();
            if (res.success) {
              this.addNotification({
                title: '🚨 Mass Surge Influx Injected',
                desc: '3 acute polytrauma cases received into operational queue.',
                icon: '🚨',
                type: 'alert',
              });
              Components.showToast('🚨 Mass surge event triggered! 3 acute cases incoming.', 'warning', 4500);
            }
          } catch (err) {
            Components.showToast('Surge failed: ' + err.message, 'danger');
          }
        }
      });
    }

    // Header Role Switcher Listener
    const roleSelect = document.getElementById('header-role-select');
    if (roleSelect) {
      roleSelect.addEventListener('change', async () => {
        const selected = roleSelect.value;
        await Auth.switchRole(selected);
        this.loadCurrentView();
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        const confirmed = await Components.showConfirmModal({
          title: 'Sign Out',
          message: 'Are you sure you want to sign out of the emergency command system?',
          confirmText: 'Sign Out',
          isDanger: false,
        });
        if (confirmed) {
          await Auth.logout();
        }
      });
    }

    // Quick Action: Dashboard -> Register Case
    const quickNewCase = document.getElementById('btn-quick-new-case');
    if (quickNewCase) {
      quickNewCase.addEventListener('click', () => this.navigateTo('register-case'));
    }

    // Quick Action: Cases -> Register Case
    const casesNew = document.getElementById('btn-cases-new');
    if (casesNew) {
      casesNew.addEventListener('click', () => this.navigateTo('register-case'));
    }

    // Dashboard View All Audit
    const viewAllAudit = document.getElementById('btn-view-all-audit');
    if (viewAllAudit) {
      viewAllAudit.addEventListener('click', () => this.navigateTo('audit'));
    }

    // Cases Filters & Pagination
    this.bindCasesEvents();

    // Register Case Form Events
    this.bindRegisterCaseEvents();

    // Allocation Workbench Events
    this.bindAllocationEvents();

    // Bed Management Events
    this.bindBedEvents();

    // Doctor Management Events
    this.bindDoctorEvents();

    // Ambulance Events
    this.bindAmbulanceEvents();

    // Audit Events
    this.bindAuditEvents();

    // Settings Events
    this.bindSettingsEvents();
  },

  bindLoginEvents() {
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    // Quick Launch Button (Instant launch as Coordinator)
    const quickLaunchBtn = document.getElementById('btn-quick-launch');
    if (quickLaunchBtn) {
      quickLaunchBtn.addEventListener('click', async () => {
        document.getElementById('login-username').value = 'coordinator';
        document.getElementById('login-password').value = 'coord123';
        quickLaunchBtn.disabled = true;
        try {
          const success = await Auth.login('coordinator', 'coord123');
          if (success) {
            SSEManager.init();
            this.bindSSEEvents();
            this.navigateTo('dashboard');
          }
        } catch (err) {
          loginError.textContent = err.message || 'Login failed.';
          loginError.classList.remove('hidden');
        } finally {
          quickLaunchBtn.disabled = false;
        }
      });
    }

    // Demo account buttons with instant 1-click login
    document.querySelectorAll('.btn-demo-fill').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const user = btn.dataset.user;
        const pass = btn.dataset.pass;
        document.getElementById('login-username').value = user;
        document.getElementById('login-password').value = pass;

        // Auto authenticate on click for seamless 1-click evaluation
        btn.disabled = true;
        try {
          const success = await Auth.login(user, pass);
          if (success) {
            SSEManager.init();
            this.bindSSEEvents();
            this.navigateTo('dashboard');
          }
        } catch (err) {
          loginError.textContent = err.message || 'Login failed.';
          loginError.classList.remove('hidden');
        } finally {
          btn.disabled = false;
        }
      });
    });

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');

        const user = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value;
        const submitBtn = document.getElementById('login-submit-btn');

        submitBtn.disabled = true;

        try {
          const success = await Auth.login(user, pass);
          if (success) {
            SSEManager.init();
            this.bindSSEEvents();
            this.navigateTo('dashboard');
          }
        } catch (err) {
          loginError.textContent = err.message || 'Login failed. Please check credentials.';
          loginError.classList.remove('hidden');
        } finally {
          submitBtn.disabled = false;
        }
      });
    }
  },

  navigateTo(viewName) {
    this.currentView = viewName;

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach((item) => {
      if (item.dataset.view === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Close mobile sidebar if open
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.classList.remove('open');

    // Switch panels
    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.remove('active');
    });

    const targetPanel = document.getElementById(`panel-${viewName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // Update Header Title
    const titleMap = {
      dashboard: 'Emergency Command Dashboard',
      cases: 'Emergency Cases Directory',
      'register-case': 'Register Incoming Emergency Case',
      allocation: 'Resource Allocation Workbench',
      beds: 'Hospital Bed Management & Floor Grid',
      doctors: 'Physician & Staff Roster',
      ambulances: 'Emergency Ambulance Fleet',
      audit: 'System Activity & Audit Trail',
      settings: 'Administrative Priority & System Settings',
    };
    const titleEl = document.getElementById('current-view-title');
    if (titleEl) titleEl.textContent = titleMap[viewName] || 'Emergency Command';

    this.loadCurrentView();
  },

  loadCurrentView() {
    switch (this.currentView) {
      case 'dashboard':
        this.loadDashboardData();
        break;
      case 'cases':
        this.loadCasesData();
        break;
      case 'register-case':
        this.prepareRegisterCaseForm();
        break;
      case 'allocation':
        this.loadAllocationWorkbench();
        break;
      case 'beds':
        this.loadBedsData();
        break;
      case 'doctors':
        this.loadDoctorsData();
        break;
      case 'ambulances':
        this.loadAmbulancesData();
        break;
      case 'audit':
        this.loadAuditData();
        break;
      case 'settings':
        this.loadSettingsData();
        break;
    }
  },

  /* ========================================================================
     1. DASHBOARD VIEW CONTROLLER
     ======================================================================== */
  async loadDashboardData() {
    try {
      // 1. Fetch Summary Stats
      const summaryRes = await API.getDashboardSummary();
      if (summaryRes.success && summaryRes.data) {
        const d = summaryRes.data;

        // Stat 1: Active Cases
        const activeCasesEl = document.getElementById('stat-active-cases');
        const criticalCasesEl = document.getElementById('stat-critical-cases');
        const awaitingCasesEl = document.getElementById('stat-awaiting-cases');
        if (activeCasesEl) activeCasesEl.textContent = d.cases.totalActive;
        if (criticalCasesEl) criticalCasesEl.textContent = `${d.cases.criticalActive} Critical`;
        if (awaitingCasesEl) awaitingCasesEl.textContent = `${d.cases.awaitingAllocation} awaiting allocation`;

        // Update nav badge for pending allocations
        const navPending = document.getElementById('nav-pending-badge');
        if (navPending) {
          if (d.cases.awaitingAllocation > 0) {
            navPending.textContent = d.cases.awaitingAllocation;
            navPending.classList.remove('hidden');
          } else {
            navPending.classList.add('hidden');
          }
        }

        // Stat 2: Beds
        const bedRateEl = document.getElementById('stat-bed-rate');
        const bedAvailEl = document.getElementById('stat-beds-available');
        const bedTotalEl = document.getElementById('stat-beds-total');
        const bedProgEl = document.getElementById('stat-bed-progress');
        if (bedRateEl) bedRateEl.textContent = `${d.beds.occupancyRate}%`;
        if (bedAvailEl) bedAvailEl.textContent = `${d.beds.available} Available`;
        if (bedTotalEl) bedTotalEl.textContent = `${d.beds.total} Total`;
        if (bedProgEl) {
          bedProgEl.style.width = `${d.beds.occupancyRate}%`;
          bedProgEl.style.backgroundColor = d.beds.occupancyRate > 85 ? '#dc2626' : (d.beds.occupancyRate > 70 ? '#ea580c' : '#10b981');
        }

        // Stat 3: Doctors
        const docAvailEl = document.getElementById('stat-doctors-available');
        const docReadyEl = document.getElementById('stat-doctors-ready');
        const docBusyEl = document.getElementById('stat-doctors-busy');
        if (docAvailEl) docAvailEl.textContent = `${d.doctors.available}`;
        if (docReadyEl) docReadyEl.textContent = `${d.doctors.available} Available`;
        if (docBusyEl) docBusyEl.textContent = `${d.doctors.total - d.doctors.offDuty} Active Shift`;

        // Stat 4: Ambulances
        const ambReadyEl = document.getElementById('stat-ambulances-ready');
        const ambActiveEl = document.getElementById('stat-ambulances-active');
        if (ambReadyEl) ambReadyEl.textContent = `${d.ambulances.available}`;
        if (ambActiveEl) ambActiveEl.textContent = `${d.ambulances.dispatched + d.ambulances.enRoute} Dispatched / In Transit`;

        // Resource Shortage Alerts
        const shortageContainer = document.getElementById('shortage-banner-container');
        if (shortageContainer) {
          if (d.shortages && d.shortages.length > 0) {
            shortageContainer.innerHTML = d.shortages.map((s) => `
              <div class="alert ${s.severity === 'critical' ? 'alert-danger' : 'alert-warning'}" style="margin-bottom:1rem;display:flex;align-items:center;gap:0.75rem;">
                <span style="font-size:1.2rem;">⚠️</span>
                <div>
                  <strong>${Components.escapeHtml(s.type)}:</strong> ${Components.escapeHtml(s.message)}
                </div>
              </div>
            `).join('');
          } else {
            shortageContainer.innerHTML = '';
          }
        }

        // Live Mission Control Telemetry Ticker Update
        const tickCrit = document.getElementById('ticker-critical');
        const tickOcc = document.getElementById('ticker-occupancy');
        const tickAmb = document.getElementById('ticker-ambulances');
        if (tickCrit) tickCrit.textContent = `${d.cases.criticalActive} CRITICAL`;
        if (tickOcc) tickOcc.textContent = `${d.beds.occupancyRate}%`;
        if (tickAmb) tickAmb.textContent = `${d.ambulances.available} UNITS`;
      }

      // 2. Fetch Urgent Operational Queue
      const queueRes = await API.getUrgentQueue();
      const queueTbody = document.getElementById('urgent-queue-tbody');
      if (queueTbody) {
        if (queueRes.success && queueRes.data && queueRes.data.length > 0) {
          queueTbody.innerHTML = queueRes.data.map((c) => `
            <tr class="priority-row-${(c.priority || 'low').toLowerCase()}">
              <td><span class="font-mono font-semibold">${Components.escapeHtml(c.case_number)}</span></td>
              <td><span class="font-mono text-muted">${Components.escapeHtml(c.patient_ref)}</span></td>
              <td>${Components.renderPriorityBadge(c.priority)}</td>
              <td>${Components.escapeHtml(c.category)}</td>
              <td><strong>${Components.escapeHtml(c.care_area)}</strong></td>
              <td>${Components.formatDateTime(c.arrival_time)}</td>
              <td>${Components.renderCaseStatusBadge(c.status)}</td>
              <td>
                <div class="flex-gap">
                  ${c.status !== 'Closed' && c.status !== 'In Treatment' ? `
                    <button class="btn btn-primary btn-xs btn-queue-recommend" data-id="${c.id}">
                      ⚡ Allocate
                    </button>
                  ` : ''}
                  <button class="btn btn-outline btn-xs btn-queue-view" data-id="${c.id}">
                    Details
                  </button>
                </div>
              </td>
            </tr>
          `).join('');

          // Bind click actions
          queueTbody.querySelectorAll('.btn-queue-recommend').forEach((b) => {
            b.addEventListener('click', () => {
              this.preselectedCaseIdForAlloc = b.dataset.id;
              this.navigateTo('allocation');
            });
          });
          queueTbody.querySelectorAll('.btn-queue-view').forEach((b) => {
            b.addEventListener('click', () => this.showCaseDetailModal(b.dataset.id));
          });
        } else {
          queueTbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No active emergency cases in queue. Facility operating normally.</td></tr>`;
        }
      }

      // 3. Fetch Chart Aggregations
      const chartsRes = await API.getDashboardCharts();
      if (chartsRes.success && chartsRes.data) {
        Charts.renderBedsChart(chartsRes.data.bedsByWard || []);
        Charts.renderDoctorsChart(chartsRes.data.doctorSpecialties || []);
        Charts.renderAmbulancesChart(chartsRes.data.ambulanceStatus || []);
      }

      // 4. Fetch Mini Activity Feed
      const actRes = await API.getRecentActivity();
      const feedEl = document.getElementById('dashboard-activity-feed');
      if (feedEl && actRes.success && actRes.data) {
        if (actRes.data.length > 0) {
          feedEl.innerHTML = actRes.data.slice(0, 7).map((a) => `
            <div class="activity-item">
              <span class="activity-icon"></span>
              <div class="activity-content">
                <strong>${Components.escapeHtml(a.username)}</strong>: ${Components.escapeHtml(a.description)}
              </div>
              <span class="activity-time">${Components.formatDateTime(a.created_at)}</span>
            </div>
          `).join('');
        } else {
          feedEl.innerHTML = `<p class="text-muted">No recent activity.</p>`;
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  },

  /* ========================================================================
     2. EMERGENCY CASES DIRECTORY
     ======================================================================== */
  bindCasesEvents() {
    const searchInput = document.getElementById('cases-search');
    const prioFilter = document.getElementById('cases-filter-priority');
    const statusFilter = document.getElementById('cases-filter-status');
    const areaFilter = document.getElementById('cases-filter-area');
    const resetBtn = document.getElementById('cases-filter-reset');

    const triggerRefresh = () => {
      this.casesPage = 1;
      this.loadCasesData();
    };

    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(triggerRefresh, 300);
      });
    }

    if (prioFilter) prioFilter.addEventListener('change', triggerRefresh);
    if (statusFilter) statusFilter.addEventListener('change', triggerRefresh);
    if (areaFilter) areaFilter.addEventListener('change', triggerRefresh);

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (prioFilter) prioFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        if (areaFilter) areaFilter.value = '';
        triggerRefresh();
      });
    }

    // Pagination
    const prevBtn = document.getElementById('cases-prev-btn');
    const nextBtn = document.getElementById('cases-next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.casesPage > 1) {
          this.casesPage--;
          this.loadCasesData();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.casesPage++;
        this.loadCasesData();
      });
    }
  },

  async loadCasesData() {
    const tbody = document.getElementById('cases-tbody');
    if (!tbody) return;

    const params = {
      page: this.casesPage,
      limit: this.casesLimit,
      search: document.getElementById('cases-search')?.value || '',
      priority: document.getElementById('cases-filter-priority')?.value || '',
      status: document.getElementById('cases-filter-status')?.value || '',
      care_area: document.getElementById('cases-filter-area')?.value || '',
    };

    try {
      const res = await API.getCases(params);
      if (res.success && res.data) {
        if (res.data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No emergency cases match the search criteria.</td></tr>`;
        } else {
          tbody.innerHTML = res.data.map((c) => {
            const assigned = [];
            if (c.allocated_bed_number) assigned.push(`Bed: ${c.allocated_bed_number}`);
            if (c.allocated_doctor_name) assigned.push(`Dr: ${c.allocated_doctor_name}`);
            if (c.allocated_ambulance_call_sign) assigned.push(`Amb: ${c.allocated_ambulance_call_sign}`);

            return `
              <tr class="priority-row-${(c.priority || 'low').toLowerCase()}">
                <td><span class="font-mono font-semibold">${Components.escapeHtml(c.case_number)}</span></td>
                <td><span class="font-mono text-muted">${Components.escapeHtml(c.patient_ref)}</span></td>
                <td>${Components.renderPriorityBadge(c.priority)}</td>
                <td>${Components.escapeHtml(c.category)}</td>
                <td>${Components.escapeHtml(c.care_area)}</td>
                <td>${Components.escapeHtml(c.specialty_needed || 'Any')}</td>
                <td>
                  <small class="text-muted">${assigned.length > 0 ? assigned.join(' | ') : '<em>Unallocated</em>'}</small>
                </td>
                <td>${Components.renderCaseStatusBadge(c.status)}</td>
                <td>
                  <div class="flex-gap">
                    <button class="btn btn-outline btn-xs btn-case-view" data-id="${c.id}">View</button>
                    ${c.status !== 'Closed' && Auth.hasRole('admin', 'coordinator') ? `
                      <button class="btn btn-primary btn-xs btn-case-recommend" data-id="${c.id}">Allocate</button>
                      <button class="btn btn-danger btn-xs btn-case-close" data-id="${c.id}" data-num="${c.case_number}">Discharge</button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('');

          // Bind Action Buttons
          tbody.querySelectorAll('.btn-case-view').forEach((b) => {
            b.addEventListener('click', () => this.showCaseDetailModal(b.dataset.id));
          });
          tbody.querySelectorAll('.btn-case-recommend').forEach((b) => {
            b.addEventListener('click', () => {
              this.preselectedCaseIdForAlloc = b.dataset.id;
              this.navigateTo('allocation');
            });
          });
          tbody.querySelectorAll('.btn-case-close').forEach((b) => {
            b.addEventListener('click', () => this.handleCloseCase(b.dataset.id, b.dataset.num));
          });
        }

        // Pagination info
        const info = document.getElementById('cases-page-info');
        const prevBtn = document.getElementById('cases-prev-btn');
        const nextBtn = document.getElementById('cases-next-btn');

        if (info && res.pagination) {
          info.textContent = `Page ${res.pagination.page} of ${res.pagination.totalPages || 1} (${res.pagination.total} total cases)`;
          if (prevBtn) prevBtn.disabled = res.pagination.page <= 1;
          if (nextBtn) nextBtn.disabled = res.pagination.page >= res.pagination.totalPages;
        }
      }
    } catch (err) {
      console.error('Failed to load cases:', err);
    }
  },

  async showCaseDetailModal(caseId) {
    try {
      const res = await API.getCaseById(caseId);
      if (!res.success || !res.data) return;
      const c = res.data;

      const allocationsHtml = c.allocations && c.allocations.length > 0
        ? c.allocations.map((a) => `
            <div class="p-3 mb-2 bg-slate-50 border-rounded text-sm">
              <div class="flex-between">
                <strong>Allocation #${a.id} (${a.status})</strong>
                <span class="text-muted text-xs">${Components.formatDateTime(a.created_at)}</span>
              </div>
              <div class="mt-2">
                ${a.bed_number ? `<span>Bed: <strong>${a.bed_number}</strong> (${a.ward})</span> | ` : ''}
                ${a.doctor_name ? `<span>Physician: <strong>${a.doctor_name}</strong></span> | ` : ''}
                ${a.ambulance_call_sign ? `<span>Ambulance: <strong>${a.ambulance_call_sign}</strong></span>` : ''}
              </div>
              <div class="mt-2 text-xs text-muted">
                <em>${Components.escapeHtml(a.recommendation_rationale || '')}</em>
              </div>
            </div>
          `).join('')
        : '<p class="text-muted text-sm">No resource allocations recorded.</p>';

      const content = `
        <div class="case-detail-container">
          <div class="flex-between mb-3 pb-2" style="border-bottom: 1px solid #e2e8f0;">
            <div>
              <span class="font-mono font-semibold" style="font-size:1.1rem;">${Components.escapeHtml(c.case_number)}</span>
              <span class="text-muted ml-2">(${Components.escapeHtml(c.patient_ref)})</span>
            </div>
            <div>
              ${Components.renderPriorityBadge(c.priority)}
              ${Components.renderCaseStatusBadge(c.status)}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;" class="text-sm">
            <div><strong>Category:</strong> ${Components.escapeHtml(c.category)}</div>
            <div><strong>Arrival:</strong> ${Components.formatDateTime(c.arrival_time)}</div>
            <div><strong>Care Area:</strong> ${Components.escapeHtml(c.care_area)}</div>
            <div><strong>Specialty Needed:</strong> ${Components.escapeHtml(c.specialty_needed || 'Any General')}</div>
            <div><strong>Transport Needed:</strong> ${c.transport_needed ? 'Yes (Ambulance Required)' : 'No (Walk-in / Direct Intake)'}</div>
            <div><strong>Age:</strong> ${c.age ? c.age : 'Not specified'}</div>
          </div>

          <div class="mb-3">
            <strong class="text-sm">Operational Briefing Notes:</strong>
            <div class="p-3 bg-slate-50 border-rounded text-sm mt-1">
              ${c.operational_notes ? Components.escapeHtml(c.operational_notes) : '<em>No operational notes recorded.</em>'}
            </div>
          </div>

          <hr class="my-3">
          <h4 class="section-title text-sm">Resource Allocation & Assignment History</h4>
          ${allocationsHtml}

          <div class="mt-4 flex-between">
            <div class="flex-gap">
              <button class="btn btn-secondary btn-sm" onclick="Components.closeGenericModal()">Close</button>
              <button class="btn btn-outline btn-sm" onclick="App.printCaseHandover(window.__currentCaseDetail)">
                🖨️ Print Handover Sheet
              </button>
              <button class="btn btn-outline btn-sm" style="border-color:#25d366;color:#25d366;" onclick="App.dispatchWhatsAppAlert(window.__currentCaseDetail)">
                📲 WhatsApp Dispatch
              </button>
              <button class="btn btn-outline btn-sm" style="border-color:#0284c7;color:#38bdf8;" onclick="App.dispatchEmailAlert(window.__currentCaseDetail)">
                📧 Email Alert
              </button>
            </div>
            ${c.status !== 'Closed' && Auth.hasRole('admin', 'coordinator') ? `
              <button class="btn btn-primary btn-sm" onclick="Components.closeGenericModal(); App.preselectedCaseIdForAlloc=${c.id}; App.navigateTo('allocation');">
                ⚡ Allocate Resources
              </button>
            ` : ''}
          </div>
        </div>
      `;

      window.__currentCaseDetail = c;
      Components.showGenericModal(`Emergency Case Details`, content);
    } catch (err) {
      Components.showToast('Failed to load case details: ' + err.message, 'danger');
    }
  },

  async handleCloseCase(caseId, caseNumber) {
    const confirmed = await Components.showConfirmModal({
      title: 'Discharge & Close Case',
      message: `Are you sure you want to close emergency case <strong>${Components.escapeHtml(caseNumber)}</strong>? This will release all occupied beds, decrement doctor workload, and release any dispatched ambulance.`,
      confirmText: 'Discharge Case',
      isDanger: true,
    });

    if (confirmed) {
      try {
        const res = await API.closeCase(caseId);
        if (res.success) {
          Components.showToast(res.message, 'success');
          this.loadCasesData();
        }
      } catch (err) {
        Components.showToast('Failed to close case: ' + err.message, 'danger');
      }
    }
  },

  printCaseHandover(c) {
    if (!c) return;
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      Components.showToast('Pop-up blocked. Please allow pop-ups to print handover sheet.', 'warning');
      return;
    }

    const assigned = [];
    if (c.allocations && c.allocations.length > 0) {
      const active = c.allocations[0];
      if (active.bed_number) assigned.push(`Bed: ${active.bed_number} (${active.ward})`);
      if (active.doctor_name) assigned.push(`Attending: ${active.doctor_name} (${active.doctor_specialty})`);
      if (active.ambulance_call_sign) assigned.push(`Transport Unit: ${active.ambulance_call_sign}`);
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SHERM Handover - ${c.case_number}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2.5rem; color: #0f172a; line-height: 1.5; }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
          .hospital-title { font-size: 1.3rem; font-weight: 800; color: #0284c7; }
          .handover-title { font-size: 0.95rem; font-weight: 600; color: #64748b; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
          .field { background: #f8fafc; border: 1px solid #e2e8f0; padding: 0.75rem; border-radius: 6px; }
          .label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 0.25rem; }
          .val { font-size: 0.95rem; font-weight: 600; }
          .notes-box { background: #fffbeb; border: 1px solid #fde68a; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; }
          .footer { font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 1rem; margin-top: 2rem; display: flex; justify-content: space-between; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="hospital-title">METRO CENTRAL EMERGENCY COMMAND</div>
            <div class="handover-title">Emergency Department Patient Handover Sheet</div>
          </div>
          <div>
            <button class="no-print" onclick="window.print()" style="padding: 0.5rem 1rem; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">🖨️ Print Document</button>
          </div>
        </div>

        <div class="grid">
          <div class="field">
            <div class="label">Case Number &bull; Patient Ref</div>
            <div class="val">${c.case_number} &mdash; ${c.patient_ref}</div>
          </div>
          <div class="field">
            <div class="label">Triage Priority</div>
            <div class="val" style="color:${c.priority === 'Critical' ? '#dc2626' : (c.priority === 'High' ? '#ea580c' : '#2563eb')};">${c.priority} Priority</div>
          </div>
          <div class="field">
            <div class="label">Category &bull; Care Area</div>
            <div class="val">${c.category} &bull; ${c.care_area}</div>
          </div>
          <div class="field">
            <div class="label">Arrival Timestamp</div>
            <div class="val">${c.arrival_time}</div>
          </div>
        </div>

        <div class="field" style="margin-bottom: 1.5rem;">
          <div class="label">Assigned Resources & Clinical Coverage</div>
          <div class="val">${assigned.length > 0 ? assigned.join(' &bull; ') : 'Awaiting Operational Resource Allocation'}</div>
        </div>

        <div class="notes-box">
          <div class="label" style="color: #92400e;">Operational Handover Notes</div>
          <div>${c.operational_notes || 'No notes entered.'}</div>
        </div>

        <div class="footer">
          <span>Generated: ${new Date().toLocaleString()}</span>
          <span>SHERM Operations Platform &bull; Hackathon System</span>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  },

  /* ========================================================================
     3. REGISTER EMERGENCY CASE
     ======================================================================== */
  bindRegisterCaseEvents() {
    const btnRegenCase = document.getElementById('btn-regen-case-num');
    const btnRegenPat = document.getElementById('btn-regen-patient-ref');
    const cancelBtn = document.getElementById('btn-cancel-reg');
    const form = document.getElementById('register-case-form');

    if (btnRegenCase) {
      btnRegenCase.addEventListener('click', () => {
        document.getElementById('reg-case-number').value = this.generateDemoCaseId();
      });
    }

    if (btnRegenPat) {
      btnRegenPat.addEventListener('click', () => {
        document.getElementById('reg-patient-ref').value = this.generateDemoPatientRef();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.navigateTo('cases'));
    }

    // 1-Click Clinical Triage Presets
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        Components.playChime('click');
        const preset = btn.dataset.preset;
        const caseNumInput = document.getElementById('reg-case-number');
        const patRefInput = document.getElementById('reg-patient-ref');
        const ageInput = document.getElementById('reg-age');
        const prioInput = document.getElementById('reg-priority');
        const catInput = document.getElementById('reg-category');
        const areaInput = document.getElementById('reg-care-area');
        const specInput = document.getElementById('reg-specialty');
        const transInput = document.getElementById('reg-transport');
        const notesInput = document.getElementById('reg-notes');

        if (!caseNumInput.value) caseNumInput.value = this.generateDemoCaseId();
        if (!patRefInput.value) patRefInput.value = this.generateDemoPatientRef();

        if (preset === 'trauma') {
          if (ageInput) ageInput.value = 34;
          if (prioInput) prioInput.value = 'Critical';
          if (catInput) catInput.value = 'Trauma';
          if (areaInput) areaInput.value = 'Trauma Bay';
          if (specInput) specInput.value = 'Trauma Surgery';
          if (transInput) transInput.checked = true;
          if (notesInput) notesInput.value = 'High-velocity motor vehicle trauma. Hypotensive (BP 85/55, HR 128 bpm, SpO2 91%). Bilateral flail chest, pelvic instability. Immediate resuscitation bay and surgeon consult required.';
          Components.showToast('Loaded Major Trauma (Critical) clinical preset.', 'info');
        } else if (preset === 'cardiac') {
          if (ageInput) ageInput.value = 62;
          if (prioInput) prioInput.value = 'Critical';
          if (catInput) catInput.value = 'Cardiovascular';
          if (areaInput) areaInput.value = 'Trauma Bay';
          if (specInput) specInput.value = 'Cardiology';
          if (transInput) transInput.checked = true;
          if (notesInput) notesInput.value = 'Acute anterior STEMI. Crushing substernal chest pain radiating to left arm. Diaphoretic, SpO2 93%, BP 145/95. Cath lab standby activated.';
          Components.showToast('Loaded STEMI Cardiac (Critical) clinical preset.', 'info');
        } else if (preset === 'stroke') {
          if (ageInput) ageInput.value = 68;
          if (prioInput) prioInput.value = 'High';
          if (catInput) catInput.value = 'Neurological';
          if (areaInput) areaInput.value = 'Emergency Dept';
          if (specInput) specInput.value = 'Neurology';
          if (transInput) transInput.checked = true;
          if (notesInput) notesInput.value = 'Acute ischemic stroke code. Sudden right hemiparesis and dysarthria. Last normal: 35 minutes ago. Blood sugar 110 mg/dL. Fast-track CT protocol.';
          Components.showToast('Loaded Acute Stroke (High) clinical preset.', 'info');
        } else if (preset === 'respiratory') {
          if (ageInput) ageInput.value = 28;
          if (prioInput) prioInput.value = 'High';
          if (catInput) catInput.value = 'Respiratory';
          if (areaInput) areaInput.value = 'Emergency Dept';
          if (specInput) specInput.value = 'Emergency Medicine';
          if (transInput) transInput.checked = false;
          if (notesInput) notesInput.value = 'Status asthmaticus exacerbation. Tachypneic (RR 32), marked accessory muscle use, SpO2 89% on ambient air. Continuous bronchodilator nebulization initiated.';
          Components.showToast('Loaded Severe Asthma (High) clinical preset.', 'info');
        } else if (preset === 'minor') {
          if (ageInput) ageInput.value = 22;
          if (prioInput) prioInput.value = 'Low';
          if (catInput) catInput.value = 'Orthopedic';
          if (areaInput) areaInput.value = 'Observation';
          if (specInput) specInput.value = 'Orthopedics';
          if (transInput) transInput.checked = false;
          if (notesInput) notesInput.value = 'Closed distal radius fracture from skateboarding fall. Hemodynamically stable, skin intact, normal distal neurovascular examination.';
          Components.showToast('Loaded Minor Orthopedic (Low) clinical preset.', 'info');
        }
      });
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const caseData = {
          case_number: document.getElementById('reg-case-number').value,
          patient_ref: document.getElementById('reg-patient-ref').value,
          age: document.getElementById('reg-age').value ? parseInt(document.getElementById('reg-age').value, 10) : null,
          arrival_time: document.getElementById('reg-arrival').value.replace('T', ' ') + ':00',
          priority: document.getElementById('reg-priority').value,
          category: document.getElementById('reg-category').value,
          care_area: document.getElementById('reg-care-area').value,
          specialty_needed: document.getElementById('reg-specialty').value || null,
          transport_needed: document.getElementById('reg-transport').checked,
          operational_notes: document.getElementById('reg-notes').value.trim(),
        };

        try {
          const res = await API.createCase(caseData);
          if (res.success) {
            Components.showToast(res.message, 'success');
            // Ask user if they want to allocate resources right away
            this.preselectedCaseIdForAlloc = res.data.id;
            this.navigateTo('allocation');
          }
        } catch (err) {
          Components.showToast('Registration failed: ' + err.message, 'danger');
        }
      });
    }
  },

  prepareRegisterCaseForm() {
    const caseNumInput = document.getElementById('reg-case-number');
    const patRefInput = document.getElementById('reg-patient-ref');
    const arrivalInput = document.getElementById('reg-arrival');

    if (caseNumInput) caseNumInput.value = this.generateDemoCaseId();
    if (patRefInput) patRefInput.value = this.generateDemoPatientRef();
    if (arrivalInput) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      arrivalInput.value = now.toISOString().slice(0, 16);
    }
  },

  generateDemoCaseId() {
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    return `CAS-${y}-${r}`;
  },

  generateDemoPatientRef() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const l1 = letters[Math.floor(Math.random() * letters.length)];
    const l2 = letters[Math.floor(Math.random() * letters.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `PT-${num}-${l1}${l2}`;
  },

  /* ========================================================================
     4. RESOURCE ALLOCATION WORKBENCH
     ======================================================================== */
  bindAllocationEvents() {
    const runBtn = document.getElementById('btn-run-recommendation');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        const select = document.getElementById('alloc-case-select');
        const caseId = select ? select.value : null;
        if (!caseId) {
          Components.showToast('Please select an active emergency case first.', 'warning');
          return;
        }
        this.runRecommendation(caseId);
      });
    }
  },

  async loadAllocationWorkbench() {
    const select = document.getElementById('alloc-case-select');
    if (!select) return;

    try {
      // 1. Fetch active cases awaiting or needing allocation
      const res = await API.getCases({ limit: 50, sortBy: 'priority_score', sortOrder: 'DESC' });
      if (res.success && res.data) {
        const activeCases = res.data.filter((c) => c.status !== 'Closed');
        select.innerHTML = `<option value="">-- Choose active emergency case (${activeCases.length} active) --</option>` +
          activeCases.map((c) => `
            <option value="${c.id}" ${this.preselectedCaseIdForAlloc == c.id ? 'selected' : ''}>
              [${c.priority}] ${c.case_number} (${c.patient_ref}) - ${c.category} - ${c.status}
            </option>
          `).join('');

        if (this.preselectedCaseIdForAlloc) {
          const targetId = this.preselectedCaseIdForAlloc;
          this.preselectedCaseIdForAlloc = null;
          this.runRecommendation(targetId);
        }
      }

      // 2. Load Allocation History
      this.loadAllocationHistory();
    } catch (err) {
      console.error('Failed to load allocation workbench:', err);
    }
  },

  async runRecommendation(caseId) {
    const resultsContainer = document.getElementById('recommendation-results');
    if (!resultsContainer) return;

    resultsContainer.classList.remove('hidden');
    resultsContainer.innerHTML = `<div class="p-4 text-center text-muted">Running multi-criteria allocation algorithm...</div>`;

    try {
      const [recRes, bedsRes, docsRes, ambRes] = await Promise.all([
        API.getRecommendation(caseId),
        API.getBeds({ status: 'Available' }),
        API.getDoctors({ status: 'Available' }),
        API.getAmbulances({ status: 'Available' }),
      ]);

      if (!recRes.success || !recRes.data) {
        throw new Error(recRes.error || 'Failed to generate recommendation.');
      }

      const d = recRes.data;
      const rec = d.recommendations;

      // Build options for interactive manual adjustments
      const allAvailBeds = bedsRes.data || [];
      const allAvailDocs = docsRes.data || [];
      const allAvailAmbs = ambRes.data || [];

      resultsContainer.innerHTML = `
        <div class="recommendation-card">
          <div class="rec-header">
            <div class="rec-title-wrap">
              <h3>Allocation Recommendation for ${Components.escapeHtml(d.case.case_number)}</h3>
              <p class="text-sm text-muted">
                Patient Ref: <strong>${Components.escapeHtml(d.case.patient_ref)}</strong> | 
                Priority: <strong>${Components.escapeHtml(d.case.priority)}</strong> (Score: ${d.case.priority_score}) | 
                Care Area: <strong>${Components.escapeHtml(d.case.care_area)}</strong>
              </p>
            </div>
            <div>
              ${d.alreadyAllocated ? '<span class="badge badge-busy">Existing Allocation Active (Re-allocation Mode)</span>' : '<span class="badge badge-available">Ready to Assign</span>'}
            </div>
          </div>

          <!-- Explainability Cards Grid -->
          <div class="rec-grid">
            <!-- Bed Card -->
            <div class="rec-item-card ${rec.bed.isAvailable ? 'feasible' : 'shortage'}">
              <span class="rec-item-title">Bed Recommendation</span>
              <div class="rec-resource-picked">
                ${rec.bed.isAvailable ? `Bed ${Components.escapeHtml(rec.bed.resource.bed_number)}` : '⚠️ No Bed Available'}
              </div>
              <p class="rec-rationale">${Components.escapeHtml(rec.bed.rationale)}</p>

              <div class="mt-2">
                <label class="text-xs font-semibold">Assign Bed:</label>
                <select id="alloc-bed-select" class="form-control text-xs mt-1">
                  ${rec.bed.isAvailable ? `<option value="${rec.bed.resource.id}" selected>Recommended: ${rec.bed.resource.bed_number} (${rec.bed.resource.ward})</option>` : '<option value="">-- No Bed Selected --</option>'}
                  ${allAvailBeds.filter((b) => !rec.bed.resource || b.id !== rec.bed.resource.id).map((b) => `
                    <option value="${b.id}">Alternative: ${b.bed_number} (${b.ward} - ${b.bed_type})</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Doctor Card -->
            <div class="rec-item-card ${rec.doctor.isAvailable ? 'feasible' : 'shortage'}">
              <span class="rec-item-title">Physician Recommendation</span>
              <div class="rec-resource-picked">
                ${rec.doctor.isAvailable ? `${Components.escapeHtml(rec.doctor.resource.name)}` : '⚠️ No Physician Available'}
              </div>
              <p class="rec-rationale">${Components.escapeHtml(rec.doctor.rationale)}</p>

              <div class="mt-2">
                <label class="text-xs font-semibold">Assign Physician:</label>
                <select id="alloc-doc-select" class="form-control text-xs mt-1">
                  ${rec.doctor.isAvailable ? `<option value="${rec.doctor.resource.id}" selected>Recommended: ${rec.doctor.resource.name} (${rec.doctor.resource.specialty})</option>` : '<option value="">-- No Physician Selected --</option>'}
                  ${allAvailDocs.filter((doc) => !rec.doctor.resource || doc.id !== rec.doctor.resource.id).map((doc) => `
                    <option value="${doc.id}">Alternative: ${doc.name} (${doc.specialty} - Workload: ${doc.current_workload}/${doc.max_workload})</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Ambulance Card -->
            <div class="rec-item-card ${rec.ambulance.isAvailable ? 'feasible' : 'shortage'}">
              <span class="rec-item-title">Ambulance Transport</span>
              <div class="rec-resource-picked">
                ${rec.ambulance.isNeeded 
                  ? (rec.ambulance.resource ? `${rec.ambulance.resource.call_sign}` : '⚠️ No Ambulance Available')
                  : 'Not Required (Intake Direct)'}
              </div>
              <p class="rec-rationale">${Components.escapeHtml(rec.ambulance.rationale)}</p>

              ${rec.ambulance.isNeeded ? `
                <div class="mt-2">
                  <label class="text-xs font-semibold">Dispatch Unit:</label>
                  <select id="alloc-amb-select" class="form-control text-xs mt-1">
                    ${rec.ambulance.resource ? `<option value="${rec.ambulance.resource.id}" selected>Recommended: ${rec.ambulance.resource.call_sign} (${rec.ambulance.resource.capability})</option>` : '<option value="">-- No Unit Selected --</option>'}
                    ${allAvailAmbs.filter((a) => !rec.ambulance.resource || a.id !== rec.ambulance.resource.id).map((a) => `
                      <option value="${a.id}">Alternative: ${a.call_sign} (${a.capability})</option>
                    `).join('')}
                  </select>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Disclaimer Notice -->
          <div class="rec-disclaimer-box">
            🛡️ <strong>Administrative Recommendation Disclaimer:</strong> ${Components.escapeHtml(d.disclaimer)}
          </div>

          <!-- Assignment Actions -->
          <div class="flex-between">
            <div class="text-xs text-muted">
              Generated at: ${Components.formatDateTime(d.generatedAt)}
            </div>
            <div class="flex-gap">
              <button id="btn-cancel-alloc" class="btn btn-secondary btn-sm">Dismiss</button>
              ${Auth.hasRole('admin', 'coordinator') ? `
                <button id="btn-confirm-alloc" class="btn btn-primary" data-case="${d.case.id}">
                  <span>✓ Authorize & Confirm Allocation</span>
                </button>
              ` : '<span class="text-muted text-xs">Viewing mode: Login as Coordinator or Admin to confirm assignments.</span>'}
            </div>
          </div>
        </div>
      `;

      // Cancel button
      document.getElementById('btn-cancel-alloc')?.addEventListener('click', () => {
        resultsContainer.classList.add('hidden');
      });

      // Confirm button
      document.getElementById('btn-confirm-alloc')?.addEventListener('click', () => {
        this.executeAllocation(d.case.id);
      });
    } catch (err) {
      resultsContainer.innerHTML = `
        <div class="alert alert-danger">
          <strong>Failed to generate recommendation:</strong> ${Components.escapeHtml(err.message)}
        </div>
      `;
    }
  },

  async executeAllocation(caseId) {
    const bedSelect = document.getElementById('alloc-bed-select');
    const docSelect = document.getElementById('alloc-doc-select');
    const ambSelect = document.getElementById('alloc-amb-select');

    const bedId = bedSelect ? bedSelect.value : null;
    const doctorId = docSelect ? docSelect.value : null;
    const ambulanceId = ambSelect ? ambSelect.value : null;

    const confirmed = await Components.showConfirmModal({
      title: 'Authorize Resource Assignment',
      message: 'Confirming this allocation will atomically update bed occupancy, doctor workload limits, and ambulance dispatch status. Proceed?',
      confirmText: 'Confirm Assignment',
      isDanger: false,
    });

    if (!confirmed) return;

    try {
      const res = await API.confirmAllocation({
        caseId,
        bedId,
        doctorId,
        ambulanceId,
        notes: 'Confirmed via Command Center Allocation Workbench',
      });

      if (res.success) {
        Components.playChime('allocate');
        Components.showToast('Resource allocation successfully executed!', 'success');
        document.getElementById('recommendation-results')?.classList.add('hidden');
        this.loadAllocationWorkbench();
      }
    } catch (err) {
      Components.showToast(err.message || 'Allocation conflict occurred.', 'danger');
    }
  },

  async loadAllocationHistory() {
    const tbody = document.getElementById('allocation-history-tbody');
    if (!tbody) return;

    try {
      const res = await API.getAllocationHistory();
      if (res.success && res.data) {
        if (res.data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No allocations recorded.</td></tr>`;
        } else {
          tbody.innerHTML = res.data.map((a) => `
            <tr>
              <td><span class="font-mono">#${a.id}</span></td>
              <td><strong>${Components.escapeHtml(a.case_number)}</strong> (${Components.escapeHtml(a.patient_ref)})</td>
              <td>${a.bed_number ? `Bed ${a.bed_number} (${a.ward})` : '<em>None</em>'}</td>
              <td>${a.doctor_name ? `${a.doctor_name} (${a.doctor_specialty})` : '<em>None</em>'}</td>
              <td>${a.ambulance_call_sign || '<em>None</em>'}</td>
              <td>${Components.escapeHtml(a.allocated_by_name || 'Coordinator')}</td>
              <td>${Components.formatDateTime(a.created_at)}</td>
              <td><span class="badge ${a.status === 'Active' ? 'badge-available' : 'badge-offline'}">${a.status}</span></td>
            </tr>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },

  /* ========================================================================
     5. BED MANAGEMENT
     ======================================================================== */
  bindBedEvents() {
    const wardFilter = document.getElementById('beds-filter-ward');
    const statusFilter = document.getElementById('beds-filter-status');
    const resetBtn = document.getElementById('beds-filter-reset');

    const triggerBeds = () => this.loadBedsData();

    if (wardFilter) wardFilter.addEventListener('change', triggerBeds);
    if (statusFilter) statusFilter.addEventListener('change', triggerBeds);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (wardFilter) wardFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        triggerBeds();
      });
    }

    // Grid vs Table Toggle
    const btnGrid = document.getElementById('btn-view-grid');
    const btnTable = document.getElementById('btn-view-table');
    const gridEl = document.getElementById('beds-visual-grid');
    const tableEl = document.getElementById('beds-table-container');

    if (btnGrid && btnTable && gridEl && tableEl) {
      btnGrid.addEventListener('click', () => {
        btnGrid.classList.add('active');
        btnTable.classList.remove('active');
        gridEl.classList.remove('hidden');
        tableEl.classList.add('hidden');
      });

      btnTable.addEventListener('click', () => {
        btnTable.classList.add('active');
        btnGrid.classList.remove('active');
        gridEl.classList.add('hidden');
        tableEl.classList.remove('hidden');
      });
    }

    // Add Bed Modal Button
    const addBedBtn = document.getElementById('btn-add-bed-modal');
    if (addBedBtn) {
      addBedBtn.addEventListener('click', () => this.showAddBedModal());
    }
  },

  async loadBedsData() {
    const grid = document.getElementById('beds-visual-grid');
    const tbody = document.getElementById('beds-tbody');
    const chipsEl = document.getElementById('bed-summary-chips');

    const params = {
      ward: document.getElementById('beds-filter-ward')?.value || '',
      status: document.getElementById('beds-filter-status')?.value || '',
    };

    try {
      const res = await API.getBeds(params);
      if (res.success && res.data) {
        // Summary chips
        if (chipsEl && res.summary) {
          chipsEl.innerHTML = `
            <div class="bed-chip chip-available">Available: ${res.summary.available}</div>
            <div class="bed-chip chip-occupied">Occupied: ${res.summary.occupied}</div>
            <div class="bed-chip chip-oos">Out of Service: ${res.summary.outOfService}</div>
            <div class="bed-chip" style="background:#f8fafc;border:1px solid #cbd5e1;">Occupancy: ${res.summary.occupancyRate}%</div>
          `;
        }

        // Render Visual Grid
        if (grid) {
          if (res.data.length === 0) {
            grid.innerHTML = `<p class="text-muted py-4">No beds found matching filters.</p>`;
          } else {
            grid.innerHTML = res.data.map((b) => {
              const statusClass = b.status.replace(/\s+/g, '-');
              return `
                <div class="bed-card status-${statusClass}">
                  <div class="bed-card-header">
                    <span class="bed-number">${Components.escapeHtml(b.bed_number)}</span>
                    ${Components.renderBedStatusBadge(b.status)}
                  </div>
                  <div class="bed-ward-tag">${Components.escapeHtml(b.ward)}</div>
                  <div class="bed-type-tag">${Components.escapeHtml(b.bed_type)}</div>
                  <div class="bed-equipment-list">
                    ${b.has_oxygen ? '<span class="equip-tag equip-oxygen">O₂ OXYGEN</span>' : ''}
                    ${b.has_telemetry ? '<span class="equip-tag equip-telemetry">ECG TELEMETRY</span>' : ''}
                    ${b.has_ventilator ? '<span class="equip-tag equip-vent">VENTILATOR</span>' : ''}
                  </div>
                  
                  ${b.status === 'Occupied' ? `
                    <div class="bed-case-info">
                      Occupied by <strong>${Components.escapeHtml(b.case_number || 'Case')}</strong>
                    </div>
                  ` : ''}

                  <div class="bed-actions">
                    ${b.status === 'Available' && Auth.hasRole('admin', 'coordinator') ? `
                      <button class="btn btn-outline btn-xs btn-bed-oos" data-id="${b.id}" data-num="${b.bed_number}">Mark OOS</button>
                    ` : ''}
                    ${b.status === 'Out of Service' && Auth.hasRole('admin', 'coordinator') ? `
                      <button class="btn btn-outline btn-xs btn-bed-avail" data-id="${b.id}" data-num="${b.bed_number}">Mark Available</button>
                    ` : ''}
                    ${b.status === 'Occupied' && Auth.hasRole('admin', 'coordinator') ? `
                      <button class="btn btn-danger btn-xs btn-bed-release" data-id="${b.id}" data-num="${b.bed_number}">Release Bed</button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('');

            // Bind bed action buttons
            grid.querySelectorAll('.btn-bed-oos').forEach((btn) => {
              btn.addEventListener('click', () => this.updateBedStatus(btn.dataset.id, 'Out of Service'));
            });
            grid.querySelectorAll('.btn-bed-avail').forEach((btn) => {
              btn.addEventListener('click', () => this.updateBedStatus(btn.dataset.id, 'Available'));
            });
            grid.querySelectorAll('.btn-bed-release').forEach((btn) => {
              btn.addEventListener('click', () => this.releaseBedAction(btn.dataset.id, btn.dataset.num));
            });
          }
        }

        // Render Table View
        if (tbody) {
          tbody.innerHTML = res.data.map((b) => `
            <tr>
              <td><span class="font-mono font-semibold">${Components.escapeHtml(b.bed_number)}</span></td>
              <td>${Components.escapeHtml(b.ward)}</td>
              <td>${Components.escapeHtml(b.bed_type)}</td>
              <td>${Components.renderBedStatusBadge(b.status)}</td>
              <td>${b.case_number ? `<strong>${b.case_number}</strong>` : '<em>Unoccupied</em>'}</td>
              <td>${Components.escapeHtml(b.notes || '')}</td>
              <td>
                <div class="flex-gap">
                  ${b.status === 'Occupied' && Auth.hasRole('admin', 'coordinator') ? `
                    <button class="btn btn-danger btn-xs btn-bed-release" data-id="${b.id}" data-num="${b.bed_number}">Release</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('');

          tbody.querySelectorAll('.btn-bed-release').forEach((btn) => {
            btn.addEventListener('click', () => this.releaseBedAction(btn.dataset.id, btn.dataset.num));
          });
        }
      }
    } catch (err) {
      console.error('Failed to load beds:', err);
    }
  },

  async updateBedStatus(bedId, newStatus) {
    try {
      const res = await API.updateBed(bedId, { status: newStatus });
      if (res.success) {
        Components.showToast(res.message, 'success');
        this.loadBedsData();
      }
    } catch (err) {
      Components.showToast('Failed to update bed: ' + err.message, 'danger');
    }
  },

  async releaseBedAction(bedId, bedNum) {
    const confirmed = await Components.showConfirmModal({
      title: 'Release Bed',
      message: `Release bed <strong>${Components.escapeHtml(bedNum)}</strong> back to the Available pool?`,
      confirmText: 'Release',
      isDanger: false,
    });

    if (confirmed) {
      try {
        const res = await API.releaseBed(bedId);
        if (res.success) {
          Components.showToast(res.message, 'success');
          this.loadBedsData();
        }
      } catch (err) {
        Components.showToast('Failed to release bed: ' + err.message, 'danger');
      }
    }
  },

  showAddBedModal() {
    const content = `
      <form id="add-bed-form">
        <div class="form-group">
          <label class="form-label">Bed Number / Identifier</label>
          <input type="text" id="new-bed-num" class="form-control" placeholder="e.g. ED-09, ICU-07" required>
        </div>
        <div class="form-group">
          <label class="form-label">Ward / Care Area</label>
          <select id="new-bed-ward" class="form-control" required>
            <option value="Emergency Dept">Emergency Dept</option>
            <option value="Trauma Bay">Trauma Bay</option>
            <option value="ICU">ICU</option>
            <option value="Step-Down">Step-Down</option>
            <option value="Observation">Observation</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Bed Capability Type</label>
          <input type="text" id="new-bed-type" class="form-control" placeholder="e.g. Acute Care, Critical Care, Isolation" required>
        </div>
        <div class="form-group">
          <label class="form-label">Operational Notes</label>
          <input type="text" id="new-bed-notes" class="form-control" placeholder="e.g. Ventilator ready">
        </div>
        <div class="modal-actions mt-3">
          <button type="button" class="btn btn-secondary" onclick="Components.closeGenericModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Bed</button>
        </div>
      </form>
    `;

    Components.showGenericModal('Add New Hospital Bed', content);

    document.getElementById('add-bed-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await API.createBed({
          bed_number: document.getElementById('new-bed-num').value.trim(),
          ward: document.getElementById('new-bed-ward').value,
          bed_type: document.getElementById('new-bed-type').value.trim(),
          notes: document.getElementById('new-bed-notes').value.trim(),
        });
        if (res.success) {
          Components.showToast(res.message, 'success');
          Components.closeGenericModal();
          this.loadBedsData();
        }
      } catch (err) {
        Components.showToast('Failed to add bed: ' + err.message, 'danger');
      }
    });
  },

  /* ========================================================================
     6. DOCTOR MANAGEMENT
     ======================================================================== */
  bindDoctorEvents() {
    const specFilter = document.getElementById('doc-filter-specialty');
    const statusFilter = document.getElementById('doc-filter-status');
    const shiftFilter = document.getElementById('doc-filter-shift');
    const resetBtn = document.getElementById('doc-filter-reset');

    const triggerDocs = () => this.loadDoctorsData();

    if (specFilter) specFilter.addEventListener('change', triggerDocs);
    if (statusFilter) statusFilter.addEventListener('change', triggerDocs);
    if (shiftFilter) shiftFilter.addEventListener('change', triggerDocs);

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (specFilter) specFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        if (shiftFilter) shiftFilter.value = '';
        triggerDocs();
      });
    }

    const addDocBtn = document.getElementById('btn-add-doctor-modal');
    if (addDocBtn) {
      addDocBtn.addEventListener('click', () => this.showAddDoctorModal());
    }
  },

  async loadDoctorsData() {
    const grid = document.getElementById('doctors-cards-grid');
    if (!grid) return;

    const params = {
      specialty: document.getElementById('doc-filter-specialty')?.value || '',
      status: document.getElementById('doc-filter-status')?.value || '',
      shift: document.getElementById('doc-filter-shift')?.value || '',
    };

    try {
      const res = await API.getDoctors(params);
      if (res.success && res.data) {
        if (res.data.length === 0) {
          grid.innerHTML = `<p class="text-muted py-4">No physicians match filters.</p>`;
          return;
        }

        grid.innerHTML = res.data.map((d) => {
          const initials = d.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
          const workloadPct = Math.round((d.current_workload / (d.max_workload || 1)) * 100);

          return `
            <div class="doctor-card">
              <div class="doctor-header">
                <div class="doctor-avatar">${initials}</div>
                <div class="doctor-meta">
                  <div class="doctor-name">${Components.escapeHtml(d.name)}</div>
                  <div class="doctor-specialty">${Components.escapeHtml(d.specialty)}</div>
                </div>
                <div>${Components.renderDoctorStatusBadge(d.status)}</div>
              </div>

              <div class="text-xs text-muted">
                Shift: <strong>${Components.escapeHtml(d.shift)} Shift</strong> | 
                ${Components.escapeHtml(d.notes || 'On clinical duty')}
              </div>

              <!-- Workload Progress -->
              <div class="workload-meter">
                <div class="workload-labels">
                  <span>Workload (Active Cases)</span>
                  <span>${d.current_workload} / ${d.max_workload} limit</span>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width:${workloadPct}%;background-color:${workloadPct >= 100 ? '#dc2626' : (workloadPct >= 75 ? '#ea580c' : '#0284c7')};"></div>
                </div>
              </div>

              <div class="flex-between mt-2 pt-2" style="border-top:1px solid #f1f5f9;">
                <div class="text-xs text-muted">
                  ${d.current_workload >= d.max_workload ? '<span class="text-danger font-semibold">At Workload Capacity</span>' : '<span class="text-success font-semibold">Capacity Available</span>'}
                </div>
                ${Auth.hasRole('admin', 'coordinator') ? `
                  <div class="flex-gap">
                    <select class="form-control text-xs doc-status-select" data-id="${d.id}" style="padding:0.2rem 0.4rem;">
                      <option value="Available" ${d.status === 'Available' ? 'selected' : ''}>Available</option>
                      <option value="Busy" ${d.status === 'Busy' ? 'selected' : ''}>Busy</option>
                      <option value="Off Duty" ${d.status === 'Off Duty' ? 'selected' : ''}>Off Duty</option>
                    </select>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');

        // Bind quick status dropdowns
        grid.querySelectorAll('.doc-status-select').forEach((sel) => {
          sel.addEventListener('change', async () => {
            try {
              const res = await API.updateDoctor(sel.dataset.id, { status: sel.value });
              if (res.success) {
                Components.showToast(`Physician status updated to ${sel.value}.`, 'success');
                this.loadDoctorsData();
              }
            } catch (err) {
              Components.showToast('Failed to update status: ' + err.message, 'danger');
            }
          });
        });
      }
    } catch (err) {
      console.error('Failed to load doctors:', err);
    }
  },

  showAddDoctorModal() {
    const content = `
      <form id="add-doctor-form">
        <div class="form-group">
          <label class="form-label">Doctor Name</label>
          <input type="text" id="new-doc-name" class="form-control" placeholder="Dr. Full Name" required>
        </div>
        <div class="form-group">
          <label class="form-label">Medical Specialty</label>
          <select id="new-doc-spec" class="form-control" required>
            <option value="Emergency Medicine">Emergency Medicine</option>
            <option value="Trauma Surgery">Trauma Surgery</option>
            <option value="Cardiology">Cardiology</option>
            <option value="Neurology">Neurology</option>
            <option value="Orthopedics">Orthopedics</option>
            <option value="Pediatrics">Pediatrics</option>
            <option value="Critical Care / ICU">Critical Care / ICU</option>
            <option value="General Emergency">General Emergency</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assigned Shift</label>
          <select id="new-doc-shift" class="form-control" required>
            <option value="Day">Day Shift</option>
            <option value="Evening">Evening Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Max Workload Limit (Cases)</label>
          <input type="number" id="new-doc-max" class="form-control" value="4" min="1" max="10" required>
        </div>
        <div class="modal-actions mt-3">
          <button type="button" class="btn btn-secondary" onclick="Components.closeGenericModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Doctor</button>
        </div>
      </form>
    `;

    Components.showGenericModal('Add Physician to Staff Roster', content);

    document.getElementById('add-doctor-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await API.createDoctor({
          name: document.getElementById('new-doc-name').value.trim(),
          specialty: document.getElementById('new-doc-spec').value,
          shift: document.getElementById('new-doc-shift').value,
          max_workload: parseInt(document.getElementById('new-doc-max').value, 10),
        });
        if (res.success) {
          Components.showToast(res.message, 'success');
          Components.closeGenericModal();
          this.loadDoctorsData();
        }
      } catch (err) {
        Components.showToast('Failed to add doctor: ' + err.message, 'danger');
      }
    });
  },

  /* ========================================================================
     7. AMBULANCE FLEET
     ======================================================================== */
  bindAmbulanceEvents() {
    const addAmbBtn = document.getElementById('btn-add-ambulance-modal');
    if (addAmbBtn) {
      addAmbBtn.addEventListener('click', () => this.showAddAmbulanceModal());
    }
  },

  async loadAmbulancesData() {
    const grid = document.getElementById('ambulances-grid');
    if (!grid) return;

    try {
      const res = await API.getAmbulances();
      if (res.success && res.data) {
        // Render Live Dispatch Radar
        this.renderAmbulanceRadar(res.data);

        if (res.data.length === 0) {
          grid.innerHTML = `<p class="text-muted py-4">No ambulances in fleet.</p>`;
          return;
        }

        grid.innerHTML = res.data.map((a) => `
          <div class="ambulance-card">
            <div class="ambulance-header">
              <div>
                <span class="ambulance-callsign">${Components.escapeHtml(a.call_sign)}</span>
                <span class="text-xs text-muted font-mono ml-2">[${Components.escapeHtml(a.plate_number)}]</span>
              </div>
              <div>${Components.renderAmbulanceStatusBadge(a.status)}</div>
            </div>

            <div class="text-xs">
              Capability: <strong>${Components.escapeHtml(a.capability)}</strong>
            </div>

            <div class="ambulance-location">
              📍 <strong>Location:</strong> ${Components.escapeHtml(a.current_location || 'Base')}
            </div>

            ${a.case_number ? `
              <div class="p-2 bg-slate-50 border-rounded text-xs">
                Assigned Case: <strong>${a.case_number}</strong>
              </div>
            ` : ''}

            <div class="flex-between mt-2 pt-2" style="border-top:1px solid #f1f5f9;">
              <span class="text-xs text-muted">Last Update: ${Components.formatDateTime(a.last_status_update)}</span>
              ${Auth.hasRole('admin', 'coordinator') ? `
                <button class="btn btn-primary btn-xs btn-amb-simulate" data-id="${a.id}" data-call="${a.call_sign}">
                  ⚡ Simulate Step
                </button>
              ` : ''}
            </div>
          </div>
        `).join('');

        // Bind simulate step buttons
        grid.querySelectorAll('.btn-amb-simulate').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const res = await API.simulateAmbulanceStep(btn.dataset.id);
              if (res.success) {
                Components.showToast(res.message, 'success');
                this.loadAmbulancesData();
              }
            } catch (err) {
              Components.showToast('Failed to simulate step: ' + err.message, 'danger');
            }
          });
        });
      }
    } catch (err) {
      console.error('Failed to load ambulances:', err);
    }
  },

  showAddAmbulanceModal() {
    const content = `
      <form id="add-ambulance-form">
        <div class="form-group">
          <label class="form-label">Call Sign</label>
          <input type="text" id="new-amb-call" class="form-control" placeholder="e.g. MEDIC-103" required>
        </div>
        <div class="form-group">
          <label class="form-label">Plate Registration (Simulated)</label>
          <input type="text" id="new-amb-plate" class="form-control" placeholder="e.g. SIM-EM-103" required>
        </div>
        <div class="form-group">
          <label class="form-label">Medical Capability</label>
          <select id="new-amb-cap" class="form-control" required>
            <option value="Advanced Life Support">Advanced Life Support (ALS)</option>
            <option value="Basic Life Support">Basic Life Support (BLS)</option>
            <option value="Critical Care Transport">Critical Care Transport (CCT)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Station / Base Location</label>
          <input type="text" id="new-amb-loc" class="form-control" placeholder="e.g. Central Base Station" value="Metro Base Station">
        </div>
        <div class="modal-actions mt-3">
          <button type="button" class="btn btn-secondary" onclick="Components.closeGenericModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Register Unit</button>
        </div>
      </form>
    `;

    Components.showGenericModal('Register Ambulance Unit to Fleet', content);

    document.getElementById('add-ambulance-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await API.createAmbulance({
          call_sign: document.getElementById('new-amb-call').value.trim(),
          plate_number: document.getElementById('new-amb-plate').value.trim(),
          capability: document.getElementById('new-amb-cap').value,
          current_location: document.getElementById('new-amb-loc').value.trim(),
        });
        if (res.success) {
          Components.showToast(res.message, 'success');
          Components.closeGenericModal();
          this.loadAmbulancesData();
        }
      } catch (err) {
        Components.showToast('Registration failed: ' + err.message, 'danger');
      }
    });
  },

  /* ========================================================================
     8. ACTIVITY & AUDIT LOG
     ======================================================================== */
  bindAuditEvents() {
    const searchInput = document.getElementById('audit-search');
    const actionFilter = document.getElementById('audit-filter-action');
    const resetBtn = document.getElementById('audit-filter-reset');
    const exportBtn = document.getElementById('btn-export-audit');

    const triggerAudit = () => {
      this.auditPage = 1;
      this.loadAuditData();
    };

    if (searchInput) {
      let t;
      searchInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(triggerAudit, 300);
      });
    }

    if (actionFilter) actionFilter.addEventListener('change', triggerAudit);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (actionFilter) actionFilter.value = '';
        triggerAudit();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          Components.showToast('Generating audit CSV export...', 'info');
          const res = await API.getAuditLogs({ limit: 500 });
          if (res.success && res.data) {
            const headers = ['ID', 'Timestamp', 'Username', 'Action Type', 'Entity Type', 'Entity ID', 'Description'];
            const rows = res.data.map(l => [
              l.id,
              `"${l.created_at}"`,
              `"${l.username || 'system'}"`,
              `"${l.action_type}"`,
              `"${l.entity_type}"`,
              `"${l.entity_id || ''}"`,
              `"${(l.description || '').replace(/"/g, '""')}"`
            ]);
            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sherm_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Components.showToast('Audit log CSV downloaded successfully!', 'success');
          }
        } catch (err) {
          Components.showToast('Export failed: ' + err.message, 'danger');
        }
      });
    }

    // Pagination
    document.getElementById('audit-prev-btn')?.addEventListener('click', () => {
      if (this.auditPage > 1) {
        this.auditPage--;
        this.loadAuditData();
      }
    });

    document.getElementById('audit-next-btn')?.addEventListener('click', () => {
      this.auditPage++;
      this.loadAuditData();
    });
  },

  async loadAuditData() {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;

    const params = {
      page: this.auditPage,
      limit: this.auditLimit,
      search: document.getElementById('audit-search')?.value || '',
      actionType: document.getElementById('audit-filter-action')?.value || '',
    };

    try {
      const res = await API.getAuditLogs(params);
      if (res.success && res.data) {
        if (res.data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No audit records found.</td></tr>`;
        } else {
          tbody.innerHTML = res.data.map((l) => `
            <tr>
              <td><span class="font-mono text-xs">${Components.formatDateTime(l.created_at)}</span></td>
              <td><strong>${Components.escapeHtml(l.username || 'system')}</strong></td>
              <td><span class="badge badge-offline text-xs">${Components.escapeHtml(l.action_type)}</span></td>
              <td>${Components.escapeHtml(l.entity_type)}</td>
              <td><span class="font-mono text-xs">${Components.escapeHtml(l.entity_id || '')}</span></td>
              <td>${Components.escapeHtml(l.description)}</td>
            </tr>
          `).join('');
        }

        const info = document.getElementById('audit-page-info');
        const prevBtn = document.getElementById('audit-prev-btn');
        const nextBtn = document.getElementById('audit-next-btn');

        if (info && res.pagination) {
          info.textContent = `Page ${res.pagination.page} of ${res.pagination.totalPages || 1} (${res.pagination.total} total log entries)`;
          if (prevBtn) prevBtn.disabled = res.pagination.page <= 1;
          if (nextBtn) nextBtn.disabled = res.pagination.page >= res.pagination.totalPages;
        }
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  },

  /* ========================================================================
     9. SYSTEM SETTINGS & PRIORITIES
     ======================================================================== */
  bindSettingsEvents() {
    const form = document.getElementById('settings-priorities-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = document.querySelectorAll('#settings-priorities-tbody tr');
        const priorities = [];

        rows.forEach((r) => {
          priorities.push({
            priority_key: r.dataset.key,
            label: r.querySelector('.input-prio-label').value.trim(),
            score: parseInt(r.querySelector('.input-prio-score').value, 10),
            color: r.querySelector('.input-prio-color').value,
            sort_order: parseInt(r.querySelector('.input-prio-sort').value, 10),
          });
        });

        try {
          const res = await API.updatePriorities(priorities);
          if (res.success) {
            Components.showToast('Priority settings updated successfully.', 'success');
            this.loadSettingsData();
          }
        } catch (err) {
          Components.showToast('Failed to save priorities: ' + err.message, 'danger');
        }
      });
    }

    const resetBtn = document.getElementById('btn-reset-demo-data');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const confirmed = await Components.showConfirmModal({
          title: 'Reset Demo Database',
          message: 'Are you sure you want to restore the demonstration database to its original baseline? All new cases, allocations, and modifications will be replaced with pristine test data.',
          confirmText: 'Reset Database',
          isDanger: true,
        });

        if (confirmed) {
          try {
            const res = await API.resetDemoData();
            if (res.success) {
              Components.showToast(res.message, 'success');
              this.navigateTo('dashboard');
            }
          } catch (err) {
            Components.showToast('Reset failed: ' + err.message, 'danger');
          }
        }
      });
    }
  },

  async loadSettingsData() {
    const tbody = document.getElementById('settings-priorities-tbody');
    if (!tbody) return;

    try {
      const res = await API.getPriorities();
      if (res.success && res.data) {
        tbody.innerHTML = res.data.map((p) => `
          <tr data-key="${p.priority_key}">
            <td><strong>${Components.escapeHtml(p.priority_key)}</strong></td>
            <td>
              <input type="text" class="form-control text-xs input-prio-label" value="${Components.escapeHtml(p.label)}" required>
            </td>
            <td>
              <input type="number" class="form-control text-xs input-prio-score" value="${p.score}" min="1" max="1000" style="width:90px;" required>
            </td>
            <td>
              <div class="flex-gap">
                <input type="color" class="input-prio-color" value="${p.color}" style="width:36px;height:28px;padding:0;border:none;cursor:pointer;">
                <input type="hidden" class="input-prio-sort" value="${p.sort_order}">
              </div>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  /* ========================================================================
     GPS DISPATCH RADAR CONTROLLER
     ======================================================================== */
  renderAmbulanceRadar(ambulances = []) {
    const blipsContainer = document.getElementById('radar-blips-container');
    const cardsContainer = document.getElementById('radar-telemetry-cards');
    if (!blipsContainer) return;

    const centerX = 140;
    const centerY = 140;
    const angles = [35, 110, 160, 215, 280, 330, 75, 190];

    const blipsHtml = ambulances.map((a, idx) => {
      const angle = (angles[idx % angles.length] * Math.PI) / 180;
      let dist = 40;
      let cls = 'blip-avail';

      if (a.status === 'Available') {
        dist = 30 + (idx * 5);
        cls = 'blip-avail';
      } else if (a.status === 'Dispatched') {
        dist = 85 + (idx * 4);
        cls = 'blip-dispatch';
      } else if (a.status === 'En Route') {
        dist = 55 + (idx * 3);
        cls = 'blip-enroute';
      } else if (a.status === 'At Hospital') {
        dist = 18;
        cls = 'blip-hospital';
      } else {
        dist = 120;
        cls = 'blip-oos';
      }

      const x = Math.round(centerX + Math.cos(angle) * dist);
      const y = Math.round(centerY + Math.sin(angle) * dist);

      return `
        <div class="radar-blip ${cls}" style="left:${x}px;top:${y}px;" title="${Components.escapeHtml(a.call_sign)}: ${a.status}">
          <span class="radar-label">${Components.escapeHtml(a.call_sign)}</span>
        </div>
      `;
    }).join('');

    blipsContainer.innerHTML = blipsHtml;

    if (cardsContainer) {
      cardsContainer.innerHTML = ambulances.map((a) => {
        let speed = '0 km/h (Base)';
        let eta = 'Standby';
        if (a.status === 'Dispatched') { speed = '62 km/h'; eta = 'ETA ~7m'; }
        if (a.status === 'En Route') { speed = '78 km/h'; eta = 'ETA ~3m (Transit)'; }
        if (a.status === 'At Hospital') { speed = '0 km/h (Bayside)'; eta = 'At Triage'; }
        if (a.status === 'Out of Service') { speed = '0 km/h'; eta = 'Maintenance'; }

        return `
          <div class="radar-unit-card">
            <div class="flex-between">
              <strong style="color:#38bdf8;">${Components.escapeHtml(a.call_sign)}</strong>
              ${Components.renderAmbulanceStatusBadge(a.status)}
            </div>
            <div class="mt-1 text-xs" style="color:var(--text-muted);">
              Speed: <strong>${speed}</strong> &bull; ${eta}
            </div>
          </div>
        `;
      }).join('');
    }
  },

  /* ========================================================================
     SPOTLIGHT COMMAND PALETTE (Ctrl + K)
     ======================================================================== */
  bindCommandPaletteEvents() {
    const modal = document.getElementById('command-modal');
    const input = document.getElementById('command-palette-input');
    const searchBtn = document.getElementById('btn-quick-search');

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        Components.playChime('click');
        this.openCommandPalette();
      });
    }

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        Components.playChime('click');
        this.openCommandPalette();
      } else if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        this.closeCommandPalette();
      }
    });

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeCommandPalette();
      });
    }

    if (input) {
      input.addEventListener('input', () => this.filterCommandPalette(input.value.trim().toLowerCase()));
    }
  },

  openCommandPalette() {
    const modal = document.getElementById('command-modal');
    const input = document.getElementById('command-palette-input');
    if (!modal || !input) return;
    modal.classList.remove('hidden');
    input.value = '';
    input.focus();
    this.filterCommandPalette('');
  },

  closeCommandPalette() {
    const modal = document.getElementById('command-modal');
    if (modal) modal.classList.add('hidden');
  },

  filterCommandPalette(query) {
    const resultsContainer = document.getElementById('command-palette-results');
    if (!resultsContainer) return;

    const views = [
      { name: 'Command Dashboard', view: 'dashboard', icon: '📊', desc: 'Central emergency overview & telemetry metrics' },
      { name: 'Emergency Cases Directory', view: 'cases', icon: '📋', desc: 'Patient triage cases & discharge management' },
      { name: 'Register Emergency Case', view: 'register-case', icon: '➕', desc: 'Intake registration with 1-click clinical presets' },
      { name: 'Resource Allocation Workbench', view: 'allocation', icon: '⚡', desc: 'Heuristic allocation recommendation engine' },
      { name: 'Bed Management & Floor Grid', view: 'beds', icon: '🛏️', desc: 'Ward bed availability & equipment capabilities' },
      { name: 'Physician Staff Roster', view: 'doctors', icon: '👨‍⚕️', desc: 'Physician workload limits & shift coverage' },
      { name: 'Ambulance Fleet & GPS Radar', view: 'ambulances', icon: '🚑', desc: 'GPS vehicle radar & simulated dispatch trips' },
      { name: 'Activity & Audit Log', view: 'audit', icon: '📜', desc: 'Chronological operations audit trail & CSV export' },
      { name: 'Administrative Priorities', view: 'settings', icon: '⚙️', desc: 'Triage weights & database reset' },
    ];

    const matchedViews = views.filter((v) => !query || v.name.toLowerCase().includes(query) || v.desc.toLowerCase().includes(query));

    let html = `
      <div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);padding:0.3rem 0.5rem;text-transform:uppercase;letter-spacing:0.05em;">
        Quick Navigation & Views
      </div>
    `;

    if (matchedViews.length > 0) {
      html += matchedViews.map((v) => `
        <div class="command-result-item" data-action="navigate" data-target="${v.view}">
          <div class="flex-gap">
            <span style="font-size:1.1rem;">${v.icon}</span>
            <div>
              <div style="font-weight:600;font-size:0.875rem;">${Components.escapeHtml(v.name)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${Components.escapeHtml(v.desc)}</div>
            </div>
          </div>
          <span class="kbd-hint">Jump</span>
        </div>
      `).join('');
    } else {
      html += `<div style="padding:0.75rem;color:var(--text-muted);font-size:0.8rem;">No commands or views matching "${Components.escapeHtml(query)}"</div>`;
    }

    resultsContainer.innerHTML = html;

    resultsContainer.querySelectorAll('.command-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        const target = item.dataset.target;
        this.closeCommandPalette();
        if (target) {
          this.navigateTo(target);
        }
      });
    });
  },

  /* ========================================================================
     HACKATHON GUIDED SHOWCASE TOUR
     ======================================================================== */
  currentTourStep: 1,

  bindTourEvents() {
    const tourBtn = document.getElementById('btn-demo-tour');
    const modal = document.getElementById('tour-modal');
    const closeBtn = document.getElementById('tour-close-btn');
    const prevBtn = document.getElementById('tour-prev-btn');
    const nextBtn = document.getElementById('tour-next-btn');
    const actBtn = document.getElementById('tour-action-btn');

    if (tourBtn) {
      tourBtn.addEventListener('click', () => {
        Components.playChime('click');
        this.startDemoTour();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentTourStep > 1) {
          this.currentTourStep--;
          this.renderTourStep(this.currentTourStep);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentTourStep < 5) {
          this.currentTourStep++;
          this.renderTourStep(this.currentTourStep);
        } else {
          if (modal) modal.classList.add('hidden');
          Components.showToast('Demonstration walkthrough complete! Feel free to explore all modules.', 'success');
        }
      });
    }

    if (actBtn) {
      actBtn.addEventListener('click', () => this.executeTourStepAction(this.currentTourStep));
    }
  },

  startDemoTour() {
    const modal = document.getElementById('tour-modal');
    if (!modal) return;
    this.currentTourStep = 1;
    modal.classList.remove('hidden');
    this.renderTourStep(1);
  },

  renderTourStep(step) {
    const badge = document.getElementById('tour-badge');
    const title = document.getElementById('tour-title');
    const body = document.getElementById('tour-body');
    const prevBtn = document.getElementById('tour-prev-btn');
    const nextBtn = document.getElementById('tour-next-btn');
    const actBtn = document.getElementById('tour-action-btn');
    const dots = document.querySelectorAll('#tour-dots .tour-dot');

    if (prevBtn) prevBtn.disabled = step === 1;
    if (nextBtn) nextBtn.textContent = step === 5 ? 'Finish Tour ✓' : 'Next Step →';

    dots.forEach((dot, idx) => {
      dot.className = idx === (step - 1) ? 'tour-dot active' : 'tour-dot';
    });

    const steps = [
      {
        badge: 'STEP 1 OF 5 • LIVE COMMAND OVERVIEW',
        title: 'Real-Time Mission Control Dashboard',
        body: 'SHERM aggregates patient triage queues, hospital bed capacity, on-duty physician workloads, and ambulance readiness in real time via Server-Sent Events (SSE). The top rolling ticker alerts staff to acute trauma counts.',
        action: 'Jump to Dashboard',
      },
      {
        badge: 'STEP 2 OF 5 • MASS CASUALTY SIMULATION',
        title: 'Mass Surge Influx Trigger',
        body: 'During multi-vehicle collisions or urban crises, hospital intake surges rapidly. Click "Simulate Surge Influx" to inject 3 acute trauma patients and observe real-time recalculation of bed availability and triage queues.',
        action: '⚡ Trigger Surge Influx',
      },
      {
        badge: 'STEP 3 OF 5 • HEURISTIC ALLOCATION ENGINE',
        title: 'Explainable Multi-Criteria Resource Allocation',
        body: 'The recommendation engine calculates a feasibility score for each emergency case using bed equipment (Oxygen, Telemetry, Ventilator), physician specialty, and proximity, returning human-understandable rationales with race-condition collision detection.',
        action: 'Open Allocation Workbench',
      },
      {
        badge: 'STEP 4 OF 5 • FLEET GPS RADAR & FLOOR GRID',
        title: 'Interactive Bed Grid & Ambulance Dispatch Radar',
        body: 'Hospital coordinators can view acute bed capability badges (O₂, ECG, Vent) on the floor grid and track simulated ambulance GPS locations on the concentric dispatch radar with real-time ETA and step progression.',
        action: 'Inspect Ambulance Radar',
      },
      {
        badge: 'STEP 5 OF 5 • AUDIT TRAIL & CLINICAL HANDOVER',
        title: 'Audit Compliance & Print Handover Sheets',
        body: 'Every operational action, bed transfer, and patient intake is recorded in an immutable SQLite audit log with CSV export capability. Hospital staff can print formatted emergency handover sheets with a single click.',
        action: 'View Audit Log',
      },
    ];

    const s = steps[step - 1];
    if (badge) badge.textContent = s.badge;
    if (title) title.textContent = s.title;
    if (body) body.textContent = s.body;
    if (actBtn) actBtn.textContent = s.action;
  },

  executeTourStepAction(step) {
    if (step === 1) {
      this.navigateTo('dashboard');
    } else if (step === 2) {
      this.navigateTo('dashboard');
      document.getElementById('btn-simulate-surge')?.click();
    } else if (step === 3) {
      this.navigateTo('allocation');
    } else if (step === 4) {
      this.navigateTo('ambulances');
    } else if (step === 5) {
      this.navigateTo('audit');
    }
  },

  /* ========================================================================
     WHATSAPP, EMAIL & NOTIFICATION CENTER CONTROLLER
     ======================================================================== */
  notifications: [
    {
      id: 1,
      title: '🚨 Level-1 Trauma Protocol Active',
      desc: 'Central trauma bay on active standby. Real-time telemetry monitoring.',
      time: 'Just now',
      icon: '🚨',
      type: 'alert',
      unread: true,
    },
    {
      id: 2,
      title: '📲 WhatsApp Dispatch Gateway Ready',
      desc: 'One-click clinical dispatch brief available for on-call surgical roster.',
      time: '2 mins ago',
      icon: '📲',
      type: 'whatsapp',
      unread: true,
    },
    {
      id: 3,
      title: '📧 Emergency Email Handover Online',
      desc: 'Formatted clinical handover sheets ready for attending physician dispatch.',
      time: '5 mins ago',
      icon: '📧',
      type: 'email',
      unread: true,
    },
  ],

  bindNotificationCenterEvents() {
    const bellBtn = document.getElementById('btn-notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    const clearBtn = document.getElementById('btn-clear-notifications');
    const broadcastBtn = document.getElementById('btn-open-broadcast-modal');
    const broadcastModal = document.getElementById('broadcast-modal');
    const broadcastClose = document.getElementById('broadcast-modal-close');
    const broadcastForm = document.getElementById('broadcast-form');

    if (bellBtn && dropdown) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Components.playChime('click');
        dropdown.classList.toggle('hidden');
        this.renderNotifications();
      });

      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.notifications = [];
        this.renderNotifications();
        Components.showToast('Notification tray cleared.', 'info');
      });
    }

    if (broadcastBtn && broadcastModal) {
      broadcastBtn.addEventListener('click', () => {
        if (dropdown) dropdown.classList.add('hidden');
        broadcastModal.classList.remove('hidden');
      });
    }

    if (broadcastClose && broadcastModal) {
      broadcastClose.addEventListener('click', () => {
        broadcastModal.classList.add('hidden');
      });
    }

    if (broadcastForm) {
      broadcastForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('broadcast-code').value;
        const msg = document.getElementById('broadcast-msg').value.trim();

        Components.playChime('surge');

        this.addNotification({
          title: `Broadcast Transmitted: ${code}`,
          desc: msg,
          icon: '📲',
          type: 'whatsapp',
        });

        // Open WhatsApp Web with broadcast message
        const waText = `🚨 *EMERGENCY BROADCAST ALERT - ${code}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `${msg}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `*Metro Central Trauma Command* • ${window.location.origin}`;

        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');

        if (broadcastModal) broadcastModal.classList.add('hidden');
        Components.showToast('📲 Emergency WhatsApp & SMS broadcast dispatched to all trauma teams!', 'warning', 5000);
      });
    }

    this.renderNotifications();
  },

  renderNotifications() {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-badge');
    if (!list) return;

    const unreadCount = this.notifications.filter((n) => n.unread).length;
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (this.notifications.length === 0) {
      list.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.8rem;">No active notifications. System operating normally.</div>`;
      return;
    }

    list.innerHTML = this.notifications.map((n) => {
      let iconClass = 'icon-alert';
      if (n.type === 'whatsapp') iconClass = 'icon-whatsapp';
      if (n.type === 'email') iconClass = 'icon-email';

      return `
        <div class="notification-item ${n.unread ? 'unread' : ''}">
          <div class="notification-item-icon ${iconClass}">
            ${n.icon || '🔔'}
          </div>
          <div class="notification-item-content">
            <div class="notification-item-title">${Components.escapeHtml(n.title)}</div>
            <div class="notification-item-desc">${Components.escapeHtml(n.desc)}</div>
            <div class="notification-item-time">${n.time}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  addNotification({ title, desc, icon = '🔔', type = 'alert' }) {
    this.notifications.unshift({
      id: Date.now(),
      title,
      desc,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      icon,
      type,
      unread: true,
    });
    this.renderNotifications();
  },

  dispatchWhatsAppAlert(c) {
    if (!c) return;
    const assigned = [];
    if (c.allocations && c.allocations.length > 0) {
      const a = c.allocations[0];
      if (a.bed_number) assigned.push(`Bed: ${a.bed_number} (${a.ward})`);
      if (a.doctor_name) assigned.push(`Doctor: ${a.doctor_name}`);
      if (a.ambulance_call_sign) assigned.push(`Unit: ${a.ambulance_call_sign}`);
    }

    const text = `🚨 *SHERM EMERGENCY CLINICAL DISPATCH*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `*Case ID:* ${c.case_number}\n` +
      `*Patient Ref:* ${c.patient_ref} (Age: ${c.age || 'N/A'})\n` +
      `*Priority:* ${c.priority.toUpperCase()}\n` +
      `*Care Area:* ${c.care_area} (${c.category})\n` +
      `*Coverage:* ${assigned.length > 0 ? assigned.join(' | ') : 'Awaiting Allocation'}\n` +
      `*Notes:* ${c.operational_notes || 'Immediate clinical assessment required.'}\n` +
      `*Timestamp:* ${new Date().toLocaleTimeString()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `*Hospital:* Metro Central Emergency Command\n` +
      `*Command Center:* ${window.location.origin}`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');

    this.addNotification({
      title: `WhatsApp Dispatched: ${c.case_number}`,
      desc: `Sent ${c.priority} clinical brief to on-call surgical/trauma team.`,
      icon: '📲',
      type: 'whatsapp',
    });

    Components.playChime('click');
    Components.showToast(`📲 WhatsApp dispatch draft opened for ${c.case_number}!`, 'success');
  },

  dispatchEmailAlert(c) {
    if (!c) return;
    const assigned = [];
    if (c.allocations && c.allocations.length > 0) {
      const a = c.allocations[0];
      if (a.bed_number) assigned.push(`Bed: ${a.bed_number} (${a.ward})`);
      if (a.doctor_name) assigned.push(`Doctor: ${a.doctor_name}`);
      if (a.ambulance_call_sign) assigned.push(`Unit: ${a.ambulance_call_sign}`);
    }

    const subject = `URGENT: Emergency Case Handover - ${c.case_number} [${c.priority.toUpperCase()}]`;
    const body = `METRO CENTRAL EMERGENCY COMMAND CENTER\n` +
      `CLINICAL DISPATCH & PATIENT HANDOVER BRIEF\n\n` +
      `Case Number: ${c.case_number}\n` +
      `Patient Reference: ${c.patient_ref} (Age: ${c.age || 'N/A'})\n` +
      `Triage Priority: ${c.priority}\n` +
      `Emergency Category: ${c.category}\n` +
      `Requested Care Area: ${c.care_area}\n` +
      `Assigned Coverage: ${assigned.length > 0 ? assigned.join(' | ') : 'Awaiting Allocation'}\n` +
      `Operational Notes: ${c.operational_notes || 'Standard clinical assessment.'}\n\n` +
      `System Link: ${window.location.origin}\n` +
      `Dispatched: ${new Date().toLocaleString()}\n`;

    const mailto = `mailto:emergency-dispatch@metrocentral.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    this.addNotification({
      title: `Email Handover Sent: ${c.case_number}`,
      desc: `Email handover sent to emergency department on-call roster.`,
      icon: '📧',
      type: 'email',
    });

    Components.playChime('click');
    Components.showToast(`📧 Emergency handover email client opened!`, 'info');
  },
};

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
