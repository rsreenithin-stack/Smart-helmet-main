const API_BASE_URL = '/api';
const DEFAULT_THRESHOLDS = {
    tempWarning: 35,
    tempDanger: 45,
    humidityWarning: 70,
    humidityDanger: 80,
    gasWarning: 300,
    gasDanger: 600
};
const STORAGE_KEY = 'smart-helmet-dashboard-v2';
const POLL_INTERVAL = 10000;
const HISTORY_INTERVAL = 30000;
const ANALYTICS_INTERVAL = 60000;

const state = {
    thresholds: { ...DEFAULT_THRESHOLDS },
    autoRefresh: true,
    soundEnabled: false,
    browserNotifications: true,
    current: null,
    history: [],
    analytics: null,
    alerts: [],
    eventLog: [],
    currentFilter: 'all',
    timeRange: '24h',
    config: null,
    currentStatus: 'normal',
    lastSignature: '',
    charts: {},
    audioContext: null,
    warningTimer: null,
    dangerTimer: null,
    polling: {
        current: null,
        history: null,
        analytics: null,
        alerts: null
    }
};

const COLORS = {
    normal: '#00ff88',
    warning: '#ffb020',
    danger: '#ff3b4f',
    accent: '#00d4ff',
    muted: '#b0b8d4'
};

function el(id) {
    return document.getElementById(id);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatTime(value) {
    const date = new Date(value);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(value) {
    const date = new Date(value);
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        thresholds: state.thresholds,
        autoRefresh: state.autoRefresh,
        soundEnabled: state.soundEnabled,
        browserNotifications: state.browserNotifications,
        timeRange: state.timeRange,
        currentFilter: state.currentFilter
    }));
}

function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        state.thresholds = { ...DEFAULT_THRESHOLDS, ...(parsed.thresholds || {}) };
        state.autoRefresh = parsed.autoRefresh ?? true;
        state.soundEnabled = parsed.soundEnabled ?? false;
        state.browserNotifications = parsed.browserNotifications ?? true;
        state.timeRange = parsed.timeRange || '24h';
        state.currentFilter = parsed.currentFilter || 'all';
    } catch {
        localStorage.removeItem(STORAGE_KEY);
    }
}

function applyStateToSettings() {
    const autoRefreshStatus = el('autoRefreshStatus');
    if (autoRefreshStatus) {
        autoRefreshStatus.textContent = state.autoRefresh ? 'ON' : 'OFF';
    }
}

function getChartSampleCount() {
    switch (state.timeRange) {
        case '1h':
            return 240;
        case '6h':
            return 720;
        case '24h':
            return 800;
        case '7d':
            return 800;
        default:
            return 800;
    }
}

function computeLocalStatus(reading) {
    const temp = Number(reading.temperature) || 0;
    const humidity = Number(reading.humidity) || 0;
    const gas = Number(reading.gasLevel) || 0;

    const levels = [
        temp >= state.thresholds.tempDanger ? 'danger' : temp >= state.thresholds.tempWarning ? 'warning' : 'normal',
        humidity >= state.thresholds.humidityDanger ? 'danger' : humidity >= state.thresholds.humidityWarning ? 'warning' : 'normal',
        gas >= state.thresholds.gasDanger ? 'danger' : gas >= state.thresholds.gasWarning ? 'warning' : 'normal'
    ];

    if (levels.includes('danger')) {
        return 'danger';
    }

    if (levels.includes('warning')) {
        return 'warning';
    }

    return 'normal';
}

function normalizeReading(payload) {
    const reading = payload.reading || payload || {};
    const status = String(reading.overallStatus || reading.statusText || payload.status || '').toLowerCase();
    const computedStatus = ['normal', 'warning', 'danger'].includes(status)
        ? status
        : computeLocalStatus(reading);

    const result = {
        temperature: Number(reading.temperature) || 0,
        humidity: Number(reading.humidity) || 0,
        gasLevel: Number(reading.gasLevel) || 0,
        status: computedStatus,
        statusText: computedStatus.toUpperCase(),
        riskScore: Number(reading.riskScore) || 0,
        timestamp: reading.timestamp || payload.updatedAt || new Date().toISOString(),
        temperatureStatus: reading.temperatureStatus || computedStatus,
        humidityStatus: reading.humidityStatus || computedStatus,
        gasStatus: reading.gasStatus || computedStatus,
        deviceStatus: Number.isFinite(Number(reading.deviceStatus)) ? Number(reading.deviceStatus) : null,
        sourceStatus: Number.isFinite(Number(reading.sourceStatus)) ? Number(reading.sourceStatus) : null
    };

    if (!result.riskScore) {
        result.riskScore = computeRiskScore(result);
    }

    return result;
}

function computeRiskScore(reading) {
    const tempSpan = Math.max(1, state.thresholds.tempDanger - state.thresholds.tempWarning);
    const humiditySpan = Math.max(1, state.thresholds.humidityDanger - state.thresholds.humidityWarning);
    const gasSpan = Math.max(1, state.thresholds.gasDanger - state.thresholds.gasWarning);

    const tempRisk = reading.temperature >= state.thresholds.tempDanger
        ? 100
        : reading.temperature >= state.thresholds.tempWarning
            ? 55 + ((reading.temperature - state.thresholds.tempWarning) / tempSpan) * 35
            : clamp((reading.temperature / Math.max(1, state.thresholds.tempWarning)) * 30, 0, 30);

    const humidityRisk = reading.humidity >= state.thresholds.humidityDanger
        ? 100
        : reading.humidity >= state.thresholds.humidityWarning
            ? 55 + ((reading.humidity - state.thresholds.humidityWarning) / humiditySpan) * 35
            : clamp((reading.humidity / Math.max(1, state.thresholds.humidityWarning)) * 30, 0, 30);

    const gasRisk = reading.gasLevel >= state.thresholds.gasDanger
        ? 100
        : reading.gasLevel >= state.thresholds.gasWarning
            ? 55 + ((reading.gasLevel - state.thresholds.gasWarning) / gasSpan) * 35
            : clamp((reading.gasLevel / Math.max(1, state.thresholds.gasWarning)) * 30, 0, 30);

    return Math.round((tempRisk + humidityRisk + gasRisk) / 3);
}

function updateGauge(circle, value, min, max, color) {
    if (!circle) {
        return;
    }

    const radius = Number(circle.getAttribute('r')) || 90;
    const circumference = 2 * Math.PI * radius;
    const ratio = clamp((value - min) / Math.max(1, max - min), 0, 1);
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference - (ratio * circumference)}`;
    circle.style.stroke = color;
}

function setSensorStatus(element, status) {
    if (!element) {
        return;
    }

    element.classList.remove('normal', 'warning', 'danger');
    element.classList.add(status);
    element.textContent = status.toUpperCase();
}

function addEventLogEntry(type, message, status = 'normal', timestamp = new Date().toISOString()) {
    state.eventLog.unshift({
        type,
        message,
        status,
        timestamp
    });

    if (state.eventLog.length > 25) {
        state.eventLog.length = 25;
    }

    renderEventLog();
}

function renderEventLog() {
    const container = el('dataLog');
    if (!container) {
        return;
    }

    if (!state.eventLog.length) {
        container.innerHTML = '<p>Waiting for data...</p>';
        return;
    }

    container.innerHTML = state.eventLog.slice(0, 12).map((entry) => `
        <div class="log-entry log-${entry.status}">
            <div class="log-top">
                <strong>${entry.type.toUpperCase()}</strong>
                <span>${formatTime(entry.timestamp)}</span>
            </div>
            <p>${entry.message}</p>
        </div>
    `).join('');
}

function renderAlertList() {
    const alertList = el('alertHistory');
    const alertsSection = document.querySelector('.alerts-list');
    const alerts = filterAlerts(state.currentFilter);

    const markup = alerts.slice(0, 10).map((alert) => `
        <div class="alert-history-item ${alert.level === 'danger' ? 'danger' : ''}">
            <div class="log-top">
                <strong>${(alert.type || 'alert').toUpperCase()} · ${String(alert.level || 'warning').toUpperCase()}</strong>
                <span>${formatTime(alert.timestamp)}</span>
            </div>
            <p>${alert.message}</p>
            <small>${alert.status ? alert.status.toUpperCase() : 'RECORDED'}</small>
        </div>
    `).join('');

    if (alertList) {
        alertList.innerHTML = markup || '<div class="alert-history-item">No alerts recorded yet.</div>';
    }

    if (alertsSection) {
        alertsSection.innerHTML = alerts.slice(0, 8).map((alert) => `
            <div class="alert-item ${alert.level === 'danger' ? 'danger' : alert.level === 'warning' ? 'warning' : ''}">
                <div class="alert-icon ${alert.level === 'danger' ? 'danger' : alert.level === 'warning' ? 'warning' : ''}">
                    <i class="fas fa-${alert.level === 'danger' ? 'exclamation-triangle' : alert.level === 'warning' ? 'bell' : 'circle-check'}"></i>
                </div>
                <div class="alert-content">
                    <h4>${String(alert.level || 'warning').toUpperCase()} ALERT</h4>
                    <p>${alert.message}</p>
                    <span class="alert-time">${formatDateTime(alert.timestamp)}</span>
                </div>
                <div class="alert-actions">
                    <button class="btn-dismiss" type="button" data-alert-id="${alert.id}">Dismiss</button>
                </div>
            </div>
        `).join('') || '<div class="alert-item"><div class="alert-content"><h4>No alerts</h4><p>The system is stable right now.</p></div></div>';

        alertsSection.querySelectorAll('.btn-dismiss').forEach((button) => {
            button.addEventListener('click', () => {
                const alertId = button.getAttribute('data-alert-id');
                state.alerts = state.alerts.filter((alert) => alert.id !== alertId);
                renderAlertList();
            });
        });
    }
}

function filterAlerts(type) {
    if (type && type !== 'all') {
        return state.alerts.filter((alert) => String(alert.level || '').toLowerCase() === type);
    }

    return state.alerts;
}

function updateStatisticsFromAnalytics(analytics) {
    if (!analytics) {
        return;
    }

    el('avgTemp').textContent = `${Number(analytics.temperature?.avg || 0).toFixed(1)}°C`;
    el('avgHumidity').textContent = `${Number(analytics.humidity?.avg || 0).toFixed(1)}%`;
    el('peakGas').textContent = `${Number(analytics.gasLevel?.max || 0).toFixed(1)} ppm`;
    el('totalAlerts').textContent = String((analytics.alerts?.warning || 0) + (analytics.alerts?.danger || 0));

    el('statAvgTemp').textContent = `${Number(analytics.temperature?.avg || 0).toFixed(1)} °C`;
    el('statAvgHumidity').textContent = `${Number(analytics.humidity?.avg || 0).toFixed(1)} %`;
    el('statAvgGas').textContent = `${Number(analytics.gasLevel?.avg || 0).toFixed(1)} ppm`;
    el('statTotalAlerts').textContent = `${((analytics.alerts?.warning || 0) + (analytics.alerts?.danger || 0))} 🚨`;

    const alertChart = state.charts.alertChart;
    if (alertChart) {
        alertChart.data.datasets[0].data = [
            analytics.alerts?.normal || 0,
            analytics.alerts?.warning || 0,
            analytics.alerts?.danger || 0
        ];
        alertChart.update('none');
    }
}

function updateStatusWidgets(reading) {
    const statusIndicator = el('statusIndicator');
    const statusText = statusIndicator?.querySelector('.status-text');
    const alertContainer = el('alertContainer');
    const systemHealth = el('systemHealth');
    const buzzerIndicator = el('buzzerIndicator');
    const buzzerStatus = el('buzzerStatus');
    const buzzerMode = el('buzzerMode');

    if (statusIndicator) {
        statusIndicator.classList.remove('warning', 'danger');
        if (reading.status === 'warning') {
            statusIndicator.classList.add('warning');
        }
        if (reading.status === 'danger') {
            statusIndicator.classList.add('danger');
        }
    }

    if (statusText) {
        statusText.textContent = reading.statusText;
    }

    if (systemHealth) {
        systemHealth.classList.remove('health-good', 'health-warning', 'health-critical');
        if (reading.status === 'normal') {
            systemHealth.classList.add('health-good');
            systemHealth.textContent = 'Good';
        } else if (reading.status === 'warning') {
            systemHealth.classList.add('health-warning');
            systemHealth.textContent = 'Warning';
        } else {
            systemHealth.classList.add('health-critical');
            systemHealth.textContent = 'Critical';
        }
    }

    if (buzzerIndicator) {
        buzzerIndicator.className = '';
        if (reading.status === 'normal') {
            buzzerIndicator.classList.add('buzzer-inactive');
            buzzerIndicator.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (reading.status === 'warning') {
            buzzerIndicator.classList.add('buzzer-warning');
            buzzerIndicator.innerHTML = '<i class="fas fa-bell"></i>';
        } else {
            buzzerIndicator.classList.add('buzzer-danger');
            buzzerIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        }
    }

    if (buzzerStatus) {
        buzzerStatus.textContent = reading.status === 'normal' ? 'Silent' : reading.status.toUpperCase();
    }

    if (buzzerMode) {
        buzzerMode.textContent = reading.status === 'normal'
            ? 'No Alert'
            : reading.status === 'warning'
                ? 'Flickering Alert (1s interval)'
                : 'Continuous Emergency Alert';
    }

    if (alertContainer) {
        if (reading.status === 'normal') {
            alertContainer.innerHTML = `
                <div class="alert-normal">
                    <span class="alert-icon">✅</span>
                    <span class="alert-message">System operating normally</span>
                </div>
            `;
            alertContainer.classList.remove('warning-pulse', 'danger-pulse');
        } else if (reading.status === 'warning') {
            alertContainer.innerHTML = `
                <div class="alert-warning">
                    <span class="alert-icon">⚠️</span>
                    <span class="alert-message">Warning level detected. Monitor conditions carefully.</span>
                </div>
                <div class="alert-details">
                    <p>Temperature: ${reading.temperature.toFixed(1)}°C</p>
                    <p>Humidity: ${reading.humidity.toFixed(1)}%</p>
                    <p>Gas Level: ${reading.gasLevel.toFixed(1)} ppm</p>
                    <p>Risk Score: ${reading.riskScore}/100</p>
                </div>
            `;
            alertContainer.classList.remove('danger-pulse');
            alertContainer.classList.add('warning-pulse');
        } else {
            alertContainer.innerHTML = `
                <div class="alert-danger">
                    <span class="alert-icon">🚨</span>
                    <span class="alert-message">Critical danger detected. Immediate evacuation required.</span>
                </div>
                <div class="alert-details">
                    <p><strong>Temperature:</strong> ${reading.temperature.toFixed(1)}°C</p>
                    <p><strong>Humidity:</strong> ${reading.humidity.toFixed(1)}%</p>
                    <p><strong>Gas Level:</strong> ${reading.gasLevel.toFixed(1)} ppm</p>
                    <p><strong>Risk Score:</strong> ${reading.riskScore}/100</p>
                </div>
            `;
            alertContainer.classList.remove('warning-pulse');
            alertContainer.classList.add('danger-pulse');
        }
    }
}

function showBanner(reading) {
    const banner = el('alertBanner');
    if (!banner) {
        return;
    }

    if (reading.status === 'normal') {
        banner.style.display = 'none';
        return;
    }

    banner.className = `alert-banner ${reading.status}`;
    banner.style.display = 'block';
    banner.textContent = reading.status === 'warning'
        ? 'Warning conditions detected. Helmet alert system active.'
        : 'Danger conditions detected. Emergency response active.';
}

function updateMainSensorCards(reading) {
    el('tempValue').textContent = `${reading.temperature.toFixed(1)}°C`;
    el('humidityValue').textContent = `${reading.humidity.toFixed(1)}%`;
    el('gasValue').textContent = `${reading.gasLevel.toFixed(1)} ppm`;

    updateGauge(el('tempGauge'), reading.temperature, 0, 50, reading.status === 'danger' ? COLORS.danger : reading.status === 'warning' ? COLORS.warning : COLORS.normal);
    updateGauge(el('humidityGauge'), reading.humidity, 0, 100, reading.status === 'danger' ? COLORS.danger : reading.status === 'warning' ? COLORS.warning : COLORS.accent);
    updateGauge(el('gasGauge'), reading.gasLevel, 0, 1000, reading.status === 'danger' ? COLORS.danger : reading.status === 'warning' ? COLORS.warning : COLORS.warning);

    setSensorStatus(el('tempStatus'), reading.temperatureStatus || reading.status);
    setSensorStatus(el('humidityStatus'), reading.humidityStatus || reading.status);
    setSensorStatus(el('gasStatus'), reading.gasStatus || reading.status);
}

function updateConnectionState(connected, message) {
    const indicator = el('connectionStatus');
    const text = el('statusText');

    if (!indicator || !text) {
        return;
    }

    indicator.classList.remove('connected', 'warning', 'danger');

    if (!connected) {
        text.textContent = message || 'Disconnected';
        return;
    }

    if (message === 'warning') {
        indicator.classList.add('warning');
        text.textContent = 'Warning';
        return;
    }

    if (message === 'danger') {
        indicator.classList.add('danger');
        text.textContent = 'Danger';
        return;
    }

    indicator.classList.add('connected');
    text.textContent = 'Connected';
}

function updateLastSync(timestamp) {
    el('lastUpdate').textContent = formatTime(timestamp);
}

function updateThinkSpeakLink(channelId) {
    const wrapper = el('thinkSpeakLink');
    if (!wrapper || !channelId) {
        return;
    }

    wrapper.innerHTML = `<a href="https://thingspeak.com/channels/${channelId}" target="_blank" rel="noreferrer">View Channel</a>`;
}

function renderCharts(history) {
    if (!history.length) {
        return;
    }

    const labels = history.map((item) => formatTime(item.timestamp));
    const temperatures = history.map((item) => item.temperature);
    const humidity = history.map((item) => item.humidity);
    const gas = history.map((item) => item.gasLevel);

    const tempChart = state.charts.tempChart;
    const humidityChart = state.charts.humidityChart;
    const gasChart = state.charts.gasChart;

    if (tempChart) {
        tempChart.data.labels = labels;
        tempChart.data.datasets[0].data = temperatures;
        tempChart.update('none');
    }

    if (humidityChart) {
        humidityChart.data.labels = labels;
        humidityChart.data.datasets[0].data = humidity;
        humidityChart.update('none');
    }

    if (gasChart) {
        gasChart.data.labels = labels;
        gasChart.data.datasets[0].data = gas;
        gasChart.update('none');
    }
}

function initCharts() {
    if (!window.Chart) {
        return;
    }

    Chart.defaults.color = '#b0b8d4';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';

    const tempCanvas = el('tempChart');
    const humidityCanvas = el('humidityChart');
    const gasCanvas = el('gasChart');

    if (tempCanvas) {
        state.charts.tempChart = new Chart(tempCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature',
                data: [],
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255,107,107,0.12)',
                tension: 0.4,
                fill: true,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: createChartOptions('°C')
        });
    }

    if (humidityCanvas) {
        state.charts.humidityChart = new Chart(humidityCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Humidity',
                data: [],
                borderColor: '#4dabf7',
                backgroundColor: 'rgba(77,171,247,0.12)',
                tension: 0.4,
                fill: true,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: createChartOptions('%')
        });
    }

    if (gasCanvas) {
        state.charts.gasChart = new Chart(gasCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Gas',
                data: [],
                borderColor: '#ffb020',
                backgroundColor: 'rgba(255,176,32,0.12)',
                tension: 0.4,
                fill: true,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: createChartOptions('ppm')
        });
    }
}

function createChartOptions(suffix) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label(context) {
                        return `${context.parsed.y.toFixed(1)} ${suffix}`;
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: { color: '#b0b8d4', maxRotation: 0, autoSkip: true }
            },
            y: {
                ticks: { color: '#b0b8d4' },
                grid: { color: 'rgba(255,255,255,0.08)' }
            }
        }
    };
}

function renderChartsFromAnalytics(analytics) {
    if (!analytics) {
        return;
    }

    updateStatisticsFromAnalytics(analytics);
}

function stopAudio() {
    clearInterval(state.warningTimer);
    clearInterval(state.dangerTimer);
    state.warningTimer = null;
    state.dangerTimer = null;
}

function ensureAudioContext() {
    if (!state.audioContext) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) {
            return null;
        }
        state.audioContext = new AudioCtor();
    }

    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }

    return state.audioContext;
}

function playTone(frequency, duration, volume = 0.2, type = 'sine') {
    const audioContext = ensureAudioContext();
    if (!audioContext) {
        return;
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

function startWarningSound() {
    if (!state.soundEnabled) {
        return;
    }

    stopAudio();
    playTone(720, 0.18, 0.2, 'square');
    state.warningTimer = setInterval(() => playTone(720, 0.18, 0.2, 'square'), 1000);
}

function startDangerSound() {
    if (!state.soundEnabled) {
        return;
    }

    stopAudio();
    let toggle = false;
    playTone(820, 0.2, 0.24, 'sawtooth');
    state.dangerTimer = setInterval(() => {
        toggle = !toggle;
        playTone(toggle ? 980 : 760, 0.2, 0.24, 'sawtooth');
    }, 240);
}

function updateBuzzerSound(reading) {
    if (reading.status === 'warning') {
        startWarningSound();
    } else if (reading.status === 'danger') {
        startDangerSound();
    } else {
        stopAudio();
    }
}

function showToast(message, level = 'normal') {
    let host = el('toastHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toastHost';
        host.style.position = 'fixed';
        host.style.right = '20px';
        host.style.bottom = '20px';
        host.style.zIndex = '2000';
        host.style.display = 'grid';
        host.style.gap = '12px';
        document.body.appendChild(host);
    }

    const toast = document.createElement('div');
    toast.style.minWidth = '240px';
    toast.style.maxWidth = '340px';
    toast.style.padding = '14px 16px';
    toast.style.borderRadius = '16px';
    toast.style.backdropFilter = 'blur(12px)';
    toast.style.background = level === 'danger'
        ? 'rgba(255,59,79,0.22)'
        : level === 'warning'
            ? 'rgba(255,176,32,0.22)'
            : 'rgba(10,14,39,0.75)';
    toast.style.border = `1px solid ${level === 'danger' ? COLORS.danger : level === 'warning' ? COLORS.warning : COLORS.accent}`;
    toast.style.color = '#fff';
    toast.style.boxShadow = '0 18px 40px rgba(0,0,0,0.35)';
    toast.textContent = message;
    host.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        toast.style.transition = 'all 0.3s ease';
    }, 2200);

    setTimeout(() => toast.remove(), 2600);
}

function maybeNotify(reading) {
    if (!state.browserNotifications || !('Notification' in window)) {
        return;
    }

    if (Notification.permission !== 'granted') {
        return;
    }

    const title = reading.status === 'danger' ? 'Smart Helmet Danger Alert' : 'Smart Helmet Warning Alert';
    const body = `${reading.statusText}: Temperature ${reading.temperature.toFixed(1)}°C, Humidity ${reading.humidity.toFixed(1)}%, Gas ${reading.gasLevel.toFixed(1)} ppm`;
    new Notification(title, { body, icon: '' });
}

function handleStatusTransition(nextStatus, reading) {
    if (nextStatus === state.currentStatus && state.current) {
        return;
    }

    const previous = state.currentStatus;
    state.currentStatus = nextStatus;

    if (nextStatus === 'normal') {
        showToast('Helmet conditions returned to normal.', 'normal');
        addEventLogEntry('status', 'System restored to normal conditions', 'normal', reading.timestamp);
        stopAudio();
        return;
    }

    if (nextStatus === 'warning') {
        showToast('Warning level detected. Check the dashboard.', 'warning');
        addEventLogEntry('alert', 'Warning detected. Flickering buzzer mode active.', 'warning', reading.timestamp);
        if (state.soundEnabled) {
            startWarningSound();
        }
        if (navigator.vibrate) {
            navigator.vibrate([120, 80, 120]);
        }
        maybeNotify(reading);
        return;
    }

    showToast('Danger level detected. Emergency action required.', 'danger');
    addEventLogEntry('alert', 'Danger detected. Continuous emergency mode active.', 'danger', reading.timestamp);
    if (state.soundEnabled) {
        startDangerSound();
    }
    if (navigator.vibrate) {
        navigator.vibrate([300, 100, 300, 100, 300]);
    }
    maybeNotify(reading);
}

async function fetchConfig() {
    try {
        const response = await fetch(`${API_BASE_URL}/config`);
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        state.config = data;
        updateThinkSpeakLink(data.channelId);
        if (data.thresholds) {
            state.thresholds = { ...state.thresholds, ...data.thresholds };
            applyStateToSettings();
        }
    } catch {
        // ignore config failures
    }
}

async function refreshCurrent(force = false) {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/current${force ? '?force=1' : ''}`);
        if (!response.ok) {
            throw new Error('Unable to fetch current reading');
        }

        const payload = await response.json();
        const reading = normalizeReading(payload);
        const statusChanged = reading.status !== state.currentStatus;

        state.current = reading;
        state.alerts = Array.isArray(payload.alertHistory) ? payload.alertHistory : state.alerts;
        updateMainSensorCards(reading);
        updateStatusWidgets(reading);
        updateBannerAndConnection(reading, payload);
        updateLastSync(payload.updatedAt || reading.timestamp);
        updateBuzzerSound(reading);
        renderAlertList();

        if (statusChanged) {
            handleStatusTransition(reading.status, reading);
        }

        if (state.currentStatus === 'normal') {
            stopAudio();
        }

        renderEventLog();
        return reading;
    } catch (error) {
        updateConnectionState(false, 'Disconnected');
        showToast(`Sensor sync failed: ${error.message}`, 'danger');
        return null;
    }
}

function updateBannerAndConnection(reading, payload) {
    const connected = Boolean(reading);
    if (connected) {
        updateConnectionState(true, reading.status);
    } else {
        updateConnectionState(false, 'Disconnected');
    }

    showBanner(reading);

    const signature = [reading.status, reading.temperature.toFixed(1), reading.humidity.toFixed(1), reading.gasLevel.toFixed(1)].join('|');
    if (signature !== state.lastSignature) {
        state.lastSignature = signature;
        addEventLogEntry('reading', `T ${reading.temperature.toFixed(1)}°C | H ${reading.humidity.toFixed(1)}% | Gas ${reading.gasLevel.toFixed(1)} ppm`, reading.status, reading.timestamp);
    }

    if (payload && payload.lastError) {
        showToast(payload.lastError, 'warning');
    }
}

async function refreshHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/history?results=${getChartSampleCount()}`);
        if (!response.ok) {
            throw new Error('Unable to fetch history');
        }

        const payload = await response.json();
        if (payload.fallback) {
            throw new Error('No real history from ThingSpeak');
        }
        state.history = Array.isArray(payload.feeds) ? payload.feeds : [];
        renderCharts(state.history);
        return state.history;
    } catch (error) {
        showToast(`History sync failed: ${error.message}`, 'warning');
        return [];
    }
}

async function refreshAnalytics() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/analytics?results=${getChartSampleCount()}`);
        if (!response.ok) {
            throw new Error('Unable to fetch analytics');
        }

        const payload = await response.json();
        if (payload.fallback) {
            throw new Error('No real analytics from ThingSpeak');
        }
        state.analytics = payload;
        renderChartsFromAnalytics(payload);
        return payload;
    } catch (error) {
        showToast(`Analytics sync failed: ${error.message}`, 'warning');
        return null;
    }
}

async function refreshAlerts() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/alerts`);
        if (!response.ok) {
            return [];
        }
        const payload = await response.json();
        state.alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
        renderAlertList();
        return state.alerts;
    } catch {
        return [];
    }
}

async function refreshData() {
    await Promise.all([
        refreshCurrent(true),
        refreshHistory(),
        refreshAnalytics(),
        refreshAlerts(),
        fetchConfig()
    ]);
}

function startPolling() {
    stopPolling();

    if (!state.autoRefresh) {
        return;
    }

    state.polling.current = setInterval(refreshCurrent, POLL_INTERVAL);
    state.polling.history = setInterval(refreshHistory, HISTORY_INTERVAL);
    state.polling.analytics = setInterval(refreshAnalytics, ANALYTICS_INTERVAL);
    state.polling.alerts = setInterval(refreshAlerts, HISTORY_INTERVAL);
}

function stopPolling() {
    Object.values(state.polling).forEach((timer) => {
        if (timer) {
            clearInterval(timer);
        }
    });

    state.polling = { current: null, history: null, analytics: null, alerts: null };
}

function toggleAutoRefresh() {
    state.autoRefresh = !state.autoRefresh;
    el('autoRefreshStatus').textContent = state.autoRefresh ? 'ON' : 'OFF';
    saveState();
    if (state.autoRefresh) {
        startPolling();
        showToast('Auto refresh enabled.', 'normal');
    } else {
        stopPolling();
        showToast('Auto refresh paused.', 'warning');
    }
}

async function testEmailAlert() {
    try {
        const response = await fetch(`${API_BASE_URL}/alerts/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'email' })
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || 'Email test failed');
        }
        showToast(payload.message || 'Email test sent', 'normal');
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

async function testPhoneAlert() {
    try {
        const response = await fetch(`${API_BASE_URL}/alerts/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'call' })
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || 'Call test failed');
        }
        showToast(payload.message || 'Call test sent', 'normal');
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

async function triggerDangerTest() {
    try {
        const response = await fetch(`${API_BASE_URL}/alerts/trigger-danger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || 'Danger trigger failed');
        }
        showToast('🚨 Danger test triggered! Check your email for alert.', 'danger');
        console.log('Danger trigger response:', payload);
        setTimeout(() => refreshData(), 1000);
    } catch (error) {
        showToast(error.message, 'danger');
    }
}

async function sendImmediateHourlyEmail() {
    try {
        if (!state.current) {
            return;
        }
        const response = await fetch(`${API_BASE_URL}/alerts/send-hourly-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reading: state.current })
        });
        const payload = await response.json();
        if (response.ok) {
            console.log('✅ Hourly email sent successfully');
            showToast('📧 Hourly status email sent', 'normal');
        }
    } catch (error) {
        console.error('❌ Failed to send hourly email:', error.message);
    }
}

function saveSettings() {
    saveState();
    showToast('Dashboard preferences saved locally.', 'normal');
    refreshHistory();
    refreshAnalytics();
}

function resetSettings() {
    state.thresholds = { ...DEFAULT_THRESHOLDS };
    state.timeRange = '24h';
    state.currentFilter = 'all';
    saveState();
    showToast('Dashboard preferences reset to defaults.', 'warning');
}

function toggleSoundAlerts() {
    state.soundEnabled = !state.soundEnabled;
    saveState();
    const button = el('soundToggleButton');
    if (button) {
        button.textContent = state.soundEnabled ? 'Sound Alerts: ON' : 'Sound Alerts: OFF';
        button.classList.toggle('btn-primary', state.soundEnabled);
        button.classList.toggle('btn-secondary', !state.soundEnabled);
    }
    if (!state.soundEnabled) {
        stopAudio();
    } else if (state.current && state.current.status !== 'normal') {
        updateBuzzerSound(state.current);
    }
    showToast(state.soundEnabled ? 'Browser sound alerts enabled.' : 'Browser sound alerts disabled.', state.soundEnabled ? 'normal' : 'warning');
}

function exportCsv() {
    const rows = [['timestamp', 'temperature', 'humidity', 'gasLevel', 'status']];
    state.history.forEach((entry) => {
        rows.push([
            entry.timestamp,
            entry.temperature,
            entry.humidity,
            entry.gasLevel,
            entry.statusText || entry.overallStatus || entry.status
        ]);
    });

    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-helmet-history-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function testBuzzer() {
    state.soundEnabled = true;
    saveState();
    playTone(740, 0.18, 0.2, 'square');
    showToast('Local buzzer test played in the browser.', 'warning');
}

function bindEvents() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    document.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
            navMenu?.classList.remove('active');
        });
    });

    document.querySelectorAll('.filter-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            document.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('active'));
            event.currentTarget.classList.add('active');
            updateChartsTimeRange(event.currentTarget.dataset.filter);
        });
    });

    document.querySelectorAll('.alert-filter-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            document.querySelectorAll('.alert-filter-btn').forEach((item) => item.classList.remove('active'));
            event.currentTarget.classList.add('active');
            filterAlertSection(event.currentTarget.dataset.alert);
        });
    });

    const testBuzzerButton = el('testBuzzer');
    if (testBuzzerButton) {
        testBuzzerButton.addEventListener('click', testBuzzer);
    }
    
    const testDangerButton = el('testDangerTrigger');
    if (testDangerButton) {
        testDangerButton.addEventListener('click', triggerDangerTest);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAudio();
        } else if (state.current && state.current.status !== 'normal' && state.soundEnabled) {
            updateBuzzerSound(state.current);
        }
    });
}

function injectButtons() {
    const controls = document.querySelector('.control-buttons');
    if (!controls) {
        return;
    }

    if (!el('soundToggleButton')) {
        const soundButton = document.createElement('button');
        soundButton.id = 'soundToggleButton';
        soundButton.type = 'button';
        soundButton.className = 'btn btn-secondary';
        soundButton.textContent = 'Sound Alerts: OFF';
        soundButton.addEventListener('click', toggleSoundAlerts);
        controls.appendChild(soundButton);
    }

    if (!el('exportCsvButton')) {
        const exportButton = document.createElement('button');
        exportButton.id = 'exportCsvButton';
        exportButton.type = 'button';
        exportButton.className = 'btn btn-primary';
        exportButton.textContent = '⬇️ Export CSV';
        exportButton.addEventListener('click', exportCsv);
        controls.appendChild(exportButton);
    }
}

function updateChartsTimeRange(filter) {
    state.timeRange = filter || '24h';
    document.querySelectorAll('.filter-btn').forEach((item) => item.classList.toggle('active', item.dataset.filter === state.timeRange));
    saveState();
    refreshHistory();
    refreshAnalytics();
}

function filterAlertSection(filter) {
    state.currentFilter = filter || 'all';
    saveState();
    renderAlertList();
}

function initialize3DHelmet() {
    if (!window.THREE || !el('helmetCanvas')) {
        return;
    }

    const canvas = el('helmetCanvas');
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 1.1, 7);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth || 420, canvas.clientHeight || 380, false);

    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0x00d4ff, 2.2);
    directional.position.set(5, 6, 6);
    scene.add(directional);

    const dangerLight = new THREE.PointLight(0xff3b4f, 1.6, 20);
    dangerLight.position.set(-4, 2, 3);
    scene.add(dangerLight);

    const group = new THREE.Group();
    scene.add(group);

    const shell = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 40, 24),
        new THREE.MeshStandardMaterial({
            color: 0x132547,
            metalness: 0.5,
            roughness: 0.3,
            emissive: 0x08213f,
            emissiveIntensity: 0.35
        })
    );
    shell.scale.set(1, 0.8, 1.1);
    group.add(shell);

    const brim = new THREE.Mesh(
        new THREE.TorusGeometry(1.6, 0.18, 12, 48),
        new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x00d4ff,
            emissiveIntensity: 0.5
        })
    );
    brim.rotation.x = Math.PI / 2;
    brim.position.y = -0.85;
    group.add(brim);

    const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(1.25, 1.5, 0.42, 32, 1, false),
        new THREE.MeshStandardMaterial({
            color: 0x08111f,
            metalness: 0.25,
            roughness: 0.15,
            transparent: true,
            opacity: 0.85,
            emissive: 0x0b1930,
            emissiveIntensity: 0.2
        })
    );
    visor.position.set(0, -0.1, 1.05);
    visor.rotation.x = Math.PI / 2;
    group.add(visor);

    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 2.15, 2.1),
        new THREE.MeshStandardMaterial({
            color: 0xffb020,
            metalness: 0.4,
            roughness: 0.3,
            emissive: 0xffb020,
            emissiveIntensity: 0.4
        })
    );
    stripe.position.set(0, 0.1, -0.1);
    group.add(stripe);

    const sensorPod = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 20, 20),
        new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.6,
            roughness: 0.1,
            emissive: 0x00ff88,
            emissiveIntensity: 0.5
        })
    );
    sensorPod.position.set(1.15, 0.25, 0.6);
    group.add(sensorPod);

    const glowRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.5, 0.04, 10, 80),
        new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            emissive: 0x00d4ff,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.5
        })
    );
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = -1.3;
    group.add(glowRing);

    const animate = () => {
        group.rotation.y += 0.01;
        group.rotation.x = Math.sin(Date.now() * 0.001) * 0.05;
        glowRing.rotation.z += 0.004;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('resize', () => {
        renderer.setSize(canvas.clientWidth || 420, canvas.clientHeight || 380, false);
        camera.aspect = (canvas.clientWidth || 420) / Math.max(1, canvas.clientHeight || 380);
        camera.updateProjectionMatrix();
    });
}

function initializeBackground3D() {
    if (!window.THREE || !el('canvas3D')) {
        return;
    }

    const canvas = el('canvas3D');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 10);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);

    const group = new THREE.Group();
    scene.add(group);

    const outer = new THREE.Mesh(
        new THREE.TorusKnotGeometry(2.8, 0.32, 120, 16),
        new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            metalness: 0.7,
            roughness: 0.2,
            emissive: 0x0a3a5a,
            emissiveIntensity: 0.45,
            wireframe: false,
            transparent: true,
            opacity: 0.4
        })
    );
    group.add(outer);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(4.0, 0.06, 10, 160),
        new THREE.MeshStandardMaterial({
            color: 0xffb020,
            emissive: 0xffb020,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.35
        })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const ambient = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambient);

    const point = new THREE.PointLight(0xff3b4f, 2, 30);
    point.position.set(3, 3, 5);
    scene.add(point);

    const animate = () => {
        group.rotation.x += 0.003;
        group.rotation.y += 0.006;
        ring.rotation.z += 0.004;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('resize', () => {
        renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
        camera.aspect = (canvas.clientWidth || window.innerWidth) / Math.max(1, canvas.clientHeight || window.innerHeight);
        camera.updateProjectionMatrix();
    });
}

function initializeApp() {
    loadState();
    applyStateToSettings();
    bindEvents();
    injectButtons();
    initCharts();
    initialize3DHelmet();
    initializeBackground3D();
    updateConnectionState(true, 'Connected');
    updateThinkSpeakLink('2834141');

    if ('Notification' in window && state.browserNotifications && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }

    fetchConfig()
        .then(() => refreshData())
        .then(() => {
            // Send immediate hourly email on page load
            setTimeout(() => {
                if (state.current && state.current.status === 'normal') {
                    sendImmediateHourlyEmail();
                }
            }, 500);
            
            // Send hourly email every 60 minutes
            setInterval(() => {
                if (state.current && state.current.status === 'normal') {
                    sendImmediateHourlyEmail();
                }
            }, 60 * 60 * 1000);
        })
        .finally(() => {
            if (state.autoRefresh) {
                startPolling();
            }
        });

    setTimeout(() => {
        const spinner = el('loadingSpinner');
        if (spinner) {
            spinner.classList.add('hidden');
        }
    }, 1200);
}

document.addEventListener('DOMContentLoaded', initializeApp);

window.refreshData = refreshData;
window.toggleAutoRefresh = toggleAutoRefresh;
window.testEmailAlert = testEmailAlert;
window.testPhoneAlert = testPhoneAlert;
window.triggerDangerTest = triggerDangerTest;
window.sendImmediateHourlyEmail = sendImmediateHourlyEmail;
window.saveSettings = saveSettings;
window.resetSettings = resetSettings;
window.testBuzzer = testBuzzer;
window.updateChartsTimeRange = updateChartsTimeRange;
window.filterAlerts = filterAlertSection;
