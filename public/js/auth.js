/**
 * SHERM - Authentication and Authorization Client Module
 */
const Auth = {
  currentUser: null,

  async checkSession() {
    try {
      const res = await API.getCurrentUser();
      if (res.authenticated && res.user) {
        this.currentUser = res.user;
        this.renderUserSession();
        return true;
      }

      // Automatically initialize demo Coordinator session on first visit so dashboard loads directly!
      const autoLogin = await API.login('coordinator', 'coord123');
      if (autoLogin.success && autoLogin.user) {
        this.currentUser = autoLogin.user;
        this.renderUserSession();
        return true;
      }
    } catch (err) {
      console.warn('Session check failed:', err);
    }
    this.currentUser = null;
    this.showLoginView();
    return false;
  },

  async switchRole(newRole) {
    const creds = {
      coordinator: { u: 'coordinator', p: 'coord123' },
      admin: { u: 'admin', p: 'admin123' },
      staff: { u: 'staff', p: 'staff123' },
    };
    const target = creds[newRole.toLowerCase()];
    if (!target) return;

    try {
      const res = await API.login(target.u, target.p);
      if (res.success && res.user) {
        this.currentUser = res.user;
        this.renderUserSession();
        Components.showToast(`Switched operational role to ${res.user.role.toUpperCase()}.`, 'info');
        return true;
      }
    } catch (err) {
      Components.showToast('Failed to switch role: ' + err.message, 'danger');
    }
    return false;
  },

  async login(username, password) {
    const res = await API.login(username, password);
    if (res.success && res.user) {
      this.currentUser = res.user;
      this.renderUserSession();
      Components.showToast(`Welcome, ${res.user.fullName}!`, 'success');
      return true;
    }
    return false;
  },

  async logout() {
    try {
      await API.logout();
    } catch (e) {
      // Ignore
    }
    this.currentUser = null;
    Components.showToast('You have been signed out.', 'info');
    this.showLoginView();
  },

  showLoginView() {
    const loginView = document.getElementById('view-login');
    const appShell = document.getElementById('app-shell');
    if (loginView) loginView.classList.remove('hidden');
    if (appShell) appShell.classList.add('hidden');
  },

  renderUserSession() {
    const loginView = document.getElementById('view-login');
    const appShell = document.getElementById('app-shell');
    if (loginView) loginView.classList.add('hidden');
    if (appShell) appShell.classList.remove('hidden');

    if (!this.currentUser) return;

    // Sidebar user information
    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');
    const avatarEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.textContent = this.currentUser.fullName || this.currentUser.username;
    if (roleEl) {
      roleEl.textContent = this.currentUser.role.toUpperCase();
      roleEl.className = 'user-role badge-role';
    }
    if (avatarEl) {
      const initials = (this.currentUser.fullName || this.currentUser.username)
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      avatarEl.textContent = initials;
    }

    // Header Role Select Dropdown Sync
    const headerRoleSelect = document.getElementById('header-role-select');
    if (headerRoleSelect) {
      headerRoleSelect.value = this.currentUser.role.toLowerCase();
    }

    // Role-gating elements
    const roleElements = document.querySelectorAll('.role-gated');
    roleElements.forEach((el) => {
      const allowedRoles = (el.dataset.roles || '').split(',').map((r) => r.trim().toLowerCase());
      if (allowedRoles.includes(this.currentUser.role.toLowerCase())) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  },

  hasRole(...roles) {
    if (!this.currentUser) return false;
    return roles.map((r) => r.toLowerCase()).includes(this.currentUser.role.toLowerCase());
  },
};
