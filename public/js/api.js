/**
 * SHERM - REST API Client
 */
const API = {
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const config = {
      credentials: 'same-origin',
      headers: { ...defaultHeaders, ...options.headers },
      ...options,
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.error || `HTTP ${response.status}: ${response.statusText}`;
        const error = new Error(errorMsg);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, err.message);
      throw err;
    }
  },

  // Auth Endpoints
  login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  },

  logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  },

  getCurrentUser() {
    return this.request('/api/auth/me');
  },

  // Dashboard Endpoints
  getDashboardSummary() {
    return this.request('/api/dashboard/summary');
  },

  getDashboardCharts() {
    return this.request('/api/dashboard/charts');
  },

  getUrgentQueue() {
    return this.request('/api/dashboard/urgent-queue');
  },

  getRecentActivity() {
    return this.request('/api/dashboard/activity');
  },

  // Emergency Cases Endpoints
  getCases(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/cases${query ? `?${query}` : ''}`);
  },

  getCaseById(id) {
    return this.request(`/api/cases/${id}`);
  },

  createCase(caseData) {
    return this.request('/api/cases', {
      method: 'POST',
      body: caseData,
    });
  },

  updateCase(id, caseData) {
    return this.request(`/api/cases/${id}`, {
      method: 'PATCH',
      body: caseData,
    });
  },

  closeCase(id) {
    return this.request(`/api/cases/${id}/close`, { method: 'POST' });
  },

  // Bed Endpoints
  getBeds(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/beds${query ? `?${query}` : ''}`);
  },

  createBed(bedData) {
    return this.request('/api/beds', {
      method: 'POST',
      body: bedData,
    });
  },

  updateBed(id, bedData) {
    return this.request(`/api/beds/${id}`, {
      method: 'PATCH',
      body: bedData,
    });
  },

  releaseBed(id) {
    return this.request(`/api/beds/${id}/release`, { method: 'POST' });
  },

  // Doctor Endpoints
  getDoctors(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/doctors${query ? `?${query}` : ''}`);
  },

  createDoctor(doctorData) {
    return this.request('/api/doctors', {
      method: 'POST',
      body: doctorData,
    });
  },

  updateDoctor(id, doctorData) {
    return this.request(`/api/doctors/${id}`, {
      method: 'PATCH',
      body: doctorData,
    });
  },

  // Ambulance Endpoints
  getAmbulances(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/ambulances${query ? `?${query}` : ''}`);
  },

  createAmbulance(ambulanceData) {
    return this.request('/api/ambulances', {
      method: 'POST',
      body: ambulanceData,
    });
  },

  updateAmbulance(id, ambulanceData) {
    return this.request(`/api/ambulances/${id}`, {
      method: 'PATCH',
      body: ambulanceData,
    });
  },

  simulateAmbulanceStep(id) {
    return this.request(`/api/ambulances/${id}/simulate-step`, { method: 'POST' });
  },

  // Allocation Endpoints
  getRecommendation(caseId) {
    return this.request('/api/allocations/recommend', {
      method: 'POST',
      body: { caseId },
    });
  },

  confirmAllocation(allocationData) {
    return this.request('/api/allocations/confirm', {
      method: 'POST',
      body: allocationData,
    });
  },

  getAllocationHistory() {
    return this.request('/api/allocations/history');
  },

  // Settings Endpoints
  getPriorities() {
    return this.request('/api/settings/priorities');
  },

  updatePriorities(priorities) {
    return this.request('/api/settings/priorities', {
      method: 'PATCH',
      body: { priorities },
    });
  },

  resetDemoData() {
    return this.request('/api/settings/reset-demo', {
      method: 'POST',
      body: { confirm: true },
    });
  },

  simulateSurge() {
    return this.request('/api/settings/simulate-surge', {
      method: 'POST',
    });
  },

  // Audit Logs
  getAuditLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/audit-logs${query ? `?${query}` : ''}`);
  },
};
