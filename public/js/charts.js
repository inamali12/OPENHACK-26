/**
 * SHERM - Chart.js Visualizations Controller
 * Adaptive Mission Control Dark & Clinical Light Themes
 */
const Charts = {
  bedsChartInstance: null,
  doctorsChartInstance: null,
  ambulancesChartInstance: null,

  isDark() {
    return !document.body.classList.contains('theme-light');
  },

  applyDefaults() {
    if (typeof Chart === 'undefined') return;
    const dark = this.isDark();
    Chart.defaults.color = dark ? '#94a3b8' : '#475569';
    Chart.defaults.borderColor = dark ? 'rgba(51, 65, 85, 0.4)' : '#e2e8f0';
    Chart.defaults.font.family = "'Inter', sans-serif";
  },

  renderBedsChart(data = []) {
    const ctx = document.getElementById('chart-beds-ward');
    if (!ctx || typeof Chart === 'undefined') return;

    this.applyDefaults();

    if (this.bedsChartInstance) {
      this.bedsChartInstance.destroy();
    }

    const labels = data.map((d) => d.ward);
    const available = data.map((d) => d.available);
    const occupied = data.map((d) => d.occupied);
    const oos = data.map((d) => d.out_of_service);

    this.bedsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Available',
            data: available,
            backgroundColor: '#10b981',
            borderRadius: 4,
          },
          {
            label: 'Occupied',
            data: occupied,
            backgroundColor: '#f59e0b',
            borderRadius: 4,
          },
          {
            label: 'Out of Service',
            data: oos,
            backgroundColor: this.isDark() ? '#475569' : '#94a3b8',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        },
      },
    });
  },

  renderDoctorsChart(data = []) {
    const ctx = document.getElementById('chart-doctors-workload');
    if (!ctx || typeof Chart === 'undefined') return;

    this.applyDefaults();

    if (this.doctorsChartInstance) {
      this.doctorsChartInstance.destroy();
    }

    const labels = data.map((d) => d.specialty);
    const activeWorkload = data.map((d) => d.total_workload);
    const totalCapacity = data.map((d) => d.total_capacity);

    this.doctorsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Active Cases',
            data: activeWorkload,
            backgroundColor: '#0284c7',
            borderRadius: 4,
          },
          {
            label: 'Max Limit Capacity',
            data: totalCapacity,
            backgroundColor: this.isDark() ? '#1e293b' : '#e2e8f0',
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 2 } },
          y: { grid: { display: false } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        },
      },
    });
  },

  renderAmbulancesChart(data = []) {
    const ctx = document.getElementById('chart-ambulances');
    if (!ctx || typeof Chart === 'undefined') return;

    this.applyDefaults();

    if (this.ambulancesChartInstance) {
      this.ambulancesChartInstance.destroy();
    }

    const colorMap = {
      'Available': '#10b981',
      'Dispatched': '#f59e0b',
      'En Route': '#ea580c',
      'At Hospital': '#0284c7',
      'Out of Service': '#64748b',
    };

    const labels = data.map((d) => d.status);
    const counts = data.map((d) => d.count);
    const backgroundColors = labels.map((l) => colorMap[l] || '#64748b');

    this.ambulancesChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: counts,
            backgroundColor: backgroundColors,
            borderWidth: 2,
            borderColor: this.isDark() ? '#0f172a' : '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        },
      },
    });
  },
};
