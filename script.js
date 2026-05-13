// ============ GLOBAL STATE ============
const THINGSPEAK_CHANNEL_ID = '3376690';
const THINGSPEAK_API_KEY    = '8JKU7MB5273R0GQQ';
const THINGSPEAK_BASE       = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}`;
const POLL_INTERVAL_MS      = 5000;   // fetch every 5 seconds
const HISTORY_INTERVAL_MS   = 30000;  // update charts every 30 seconds

const state = {
    deviceId: 'ESP-CCE1E1',
    sensors: { temperature: 0, humidity: 0, gasLevel: 0 },
    thresholds: {
        tempWarning: 33,
        tempDanger: 34,
        humidityWarning: 63,
        humidityDanger: 65,
        gasWarning: 82,
        gasDanger: 90
    },
    thinkSpeakConfig: {
        channelId: THINGSPEAK_CHANNEL_ID,
        apiKey: THINGSPEAK_API_KEY,
        updateInterval: 5
    },
    alerts: [],
    chartData: { temp: [], humidity: [], gas: [], time: [] },
    lastAlertTime: 0,
    emailLastSent: 0,
    emailInterval: 3600000,   // 1 hour for normal status
    currentAlertLevel: 'normal',
    previousAlertLevel: 'normal',
    buzzerActive: false,
    audioUnlocked: false,
    audioContext: null,
    alarmInterval: null
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    startDataFetch();
    initializeCharts();
    setupHamburgerMenu();
    unlockAudioOnInteraction(); // unlock audio on first user tap/click
});

function initializeApp() {
    const devEl = document.getElementById('deviceId');
    if (devEl) devEl.textContent = state.deviceId;
    init3DScene();
    updateConnectionStatus(false);
    loadThinkSpeakConfig();
}

// Unlock Web Audio API on first user interaction (required by browsers)
function unlockAudioOnInteraction() {
    const unlock = () => {
        if (state.audioUnlocked) return;
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();
        state.audioUnlocked = true;
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);
}

function getAudioContext() {
    if (!state.audioContext) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (Ctor) state.audioContext = new Ctor();
    }
    return state.audioContext;
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    // Hamburger menu
    const hamburger = document.querySelector('.hamburger');
    if (hamburger) hamburger.addEventListener('click', toggleMobileMenu);

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateChartsTimeRange(e.target.dataset.filter);
        });
    });

    // Alert filter buttons
    document.querySelectorAll('.alert-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.alert-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterAlerts(e.target.dataset.alert);
        });
    });

    // Settings buttons — only attach if elements exist
    const saveBtn = document.getElementById('saveSetting');
    const resetBtn = document.getElementById('resetSettings');
    const testBtn = document.getElementById('testBuzzer');
    const dangerBtn = document.getElementById('testDangerTrigger');

    if (saveBtn) saveBtn.addEventListener('click', saveSettings);
    if (resetBtn) resetBtn.addEventListener('click', resetSettings);
    if (testBtn) testBtn.addEventListener('click', testBuzzer);
    if (dangerBtn) dangerBtn.addEventListener('click', () => {
        showNotification('🚨 Danger test triggered!');
        triggerAlert('danger', 'DANGER: Manual test triggered from dashboard');
    });

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            const menu = document.querySelector('.nav-menu');
            if (menu) menu.classList.remove('active');
        });
    });
}

function setupHamburgerMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    hamburger.addEventListener('click', toggleMobileMenu);
}

function toggleMobileMenu() {
    document.querySelector('.nav-menu').classList.toggle('active');
}

// ============ DATA FETCHING ============
function startDataFetch() {
    fetchThinkSpeakData(); // immediate first fetch
    setInterval(fetchThinkSpeakData, POLL_INTERVAL_MS);
    fetchThinkSpeakHistory();
    setInterval(fetchThinkSpeakHistory, HISTORY_INTERVAL_MS);
}

async function fetchThinkSpeakData() {
    try {
        const url = `${THINGSPEAK_BASE}/feeds.json?api_key=${state.thinkSpeakConfig.apiKey}&results=1`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (!data.feeds || data.feeds.length === 0) {
            updateConnectionStatus(false, 'Disconnected');
            return;
        }

        const feed = data.feeds[data.feeds.length - 1];

        // ── Check data freshness — device must have sent data within 2 minutes ──
        const feedTime = feed.created_at ? new Date(feed.created_at) : null;
        const ageMs    = feedTime ? (Date.now() - feedTime.getTime()) : Infinity;
        const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

        if (ageMs > OFFLINE_THRESHOLD_MS) {
            // Data is stale — device is offline, no power or not connected
            const ageMin = Math.round(ageMs / 60000);
            updateConnectionStatus(false, `Device Offline (${ageMin}m ago)`);
            document.getElementById('lastUpdate').textContent = `Last seen: ${feedTime ? feedTime.toLocaleTimeString() : 'unknown'}`;
            // Clear sensor displays to show device is not active
            document.getElementById('tempValue').textContent    = '--°C';
            document.getElementById('humidityValue').textContent = '--%';
            document.getElementById('gasValue').textContent     = '-- ppm';
            hidealertBanner();
            stopAlarm();
            return;
        }

        const temperature = parseFloat(feed.field1);
        const humidity    = parseFloat(feed.field2);
        const gasLevel    = parseFloat(feed.field3);

        // If all fields are missing/NaN the device hasn't sent real data
        if (isNaN(temperature) && isNaN(humidity) && isNaN(gasLevel)) {
            updateConnectionStatus(false, 'No Sensor Data');
            return;
        }

        state.sensors.temperature = isNaN(temperature) ? 0 : temperature;
        state.sensors.humidity    = isNaN(humidity)    ? 0 : humidity;
        state.sensors.gasLevel    = isNaN(gasLevel)    ? 0 : gasLevel;

        const feedTime = feed.created_at ? new Date(feed.created_at) : new Date();
        document.getElementById('lastUpdate').textContent = feedTime.toLocaleTimeString();

        updateSensorDisplay();
        updateChartData(state.sensors.temperature, state.sensors.humidity, state.sensors.gasLevel, feedTime);
        checkAlertConditions();
        updateConnectionStatus(true);  // ✅ Connected — real data received

    } catch (error) {
        console.error('Error fetching ThingSpeak data:', error);
        updateConnectionStatus(false, 'Disconnected');
    }
}

async function fetchThinkSpeakHistory() {
    try {
        const url = `${THINGSPEAK_BASE}/feeds.json?api_key=${state.thinkSpeakConfig.apiKey}&results=80`;
        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.json();
        if (!data.feeds || data.feeds.length === 0) return;

        const labels = [], temps = [], humids = [], gases = [];
        data.feeds.forEach(feed => {
            const t = feed.created_at ? new Date(feed.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            labels.push(t);
            temps.push(parseFloat(feed.field1) || 0);
            humids.push(parseFloat(feed.field2) || 0);
            gases.push(parseFloat(feed.field3) || 0);
        });

        charts.temp.data.labels = labels;
        charts.temp.data.datasets[0].data = temps;
        charts.temp.update('none');

        charts.humidity.data.labels = labels;
        charts.humidity.data.datasets[0].data = humids;
        charts.humidity.update('none');

        charts.gas.data.labels = labels;
        charts.gas.data.datasets[0].data = gases;
        charts.gas.update('none');

        // Update statistics from real history
        const avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
        const avgHum  = (humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(1);
        const peakGas = Math.max(...gases).toFixed(1);
        document.getElementById('avgTemp').textContent     = avgTemp + '°C';
        document.getElementById('avgHumidity').textContent = avgHum + '%';
        document.getElementById('peakGas').textContent     = peakGas + ' ppm';

    } catch (error) {
        console.error('Error fetching ThingSpeak history:', error);
    }
}

// ============ SENSOR DISPLAY ============
function updateSensorDisplay() {
    const { temperature, humidity, gasLevel } = state.sensors;
    const { tempWarning, tempDanger, humidityWarning, humidityDanger, gasWarning, gasDanger } = state.thresholds;

    // Temperature
    updateGauge('tempGauge', temperature, 0, 50, 'tempValue', '°C');
    updateSensorStatus('tempStatus', temperature, tempWarning, tempDanger);

    // Humidity
    updateGauge('humidityGauge', humidity, 0, 100, 'humidityValue', '%');
    updateSensorStatus('humidityStatus', humidity, humidityWarning, humidityDanger);

    // Gas Level
    updateGauge('gasGauge', gasLevel, 0, 1000, 'gasValue', ' ppm');
    updateSensorStatus('gasStatus', gasLevel, gasWarning, gasDanger);

    // System Health
    updateSystemHealth();
}

function updateGauge(gaugeId, value, min, max, valueId, unit) {
    const gauge = document.getElementById(gaugeId);
    const valueElement = document.getElementById(valueId);
    
    // Calculate percentage
    const percentage = ((value - min) / (max - min)) * 100;
    const circumference = 2 * Math.PI * 90; // radius is 90
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    
    // Update gauge
    const circles = gauge.querySelectorAll('circle');
    if (circles.length > 1) {
        circles[1].style.strokeDasharray = circumference;
        circles[1].style.strokeDashoffset = strokeDashoffset;
    }
    
    // Update value
    valueElement.textContent = value.toFixed(1) + unit;
}

function updateSensorStatus(statusId, value, warning, danger) {
    const element = document.getElementById(statusId);
    element.classList.remove('normal', 'warning', 'danger');
    
    if (value >= danger) {
        element.classList.add('danger');
        element.textContent = 'DANGER';
    } else if (value >= warning) {
        element.classList.add('warning');
        element.textContent = 'WARNING';
    } else {
        element.classList.add('normal');
        element.textContent = 'NORMAL';
    }
}

function updateSystemHealth() {
    const healthElement = document.getElementById('systemHealth');
    const { temperature, humidity, gasLevel } = state.sensors;
    const { tempDanger, humidityDanger, gasDanger } = state.thresholds;

    if (temperature >= tempDanger || humidity >= humidityDanger || gasLevel >= gasDanger) {
        healthElement.className = 'health-critical';
        healthElement.textContent = 'Critical';
    } else if (temperature >= state.thresholds.tempWarning || 
               humidity >= state.thresholds.humidityWarning || 
               gasLevel >= state.thresholds.gasWarning) {
        healthElement.className = 'health-warning';
        healthElement.textContent = 'Warning';
    } else {
        healthElement.className = 'health-good';
        healthElement.textContent = 'Good';
    }
}

function updateConnectionStatus(isConnected, label) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    
    if (isConnected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = label || 'Connected';
        statusText.style.color = '#00ff88';
    } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = label || 'Disconnected';
        statusText.style.color = '#ff3b4f';
    }
}

// ============ ALERT SYSTEM ============
function checkAlertConditions() {
    const { temperature, humidity, gasLevel } = state.sensors;
    const { tempWarning, tempDanger, humidityWarning, humidityDanger, gasWarning, gasDanger } = state.thresholds;

    let alertLevel = 'normal';
    let alertMessage = '';

    if (temperature >= tempDanger || humidity >= humidityDanger || gasLevel >= gasDanger) {
        alertLevel = 'danger';
        if (temperature >= tempDanger)  alertMessage = `DANGER: Temperature ${temperature.toFixed(1)}°C exceeds safe limit!`;
        else if (humidity >= humidityDanger) alertMessage = `DANGER: Humidity ${humidity.toFixed(1)}% exceeds safe limit!`;
        else alertMessage = `DANGER: Gas level ${gasLevel.toFixed(1)} ppm exceeds safe limit!`;
    } else if (temperature >= tempWarning || humidity >= humidityWarning || gasLevel >= gasWarning) {
        alertLevel = 'warning';
        if (temperature >= tempWarning)  alertMessage = `WARNING: Temperature ${temperature.toFixed(1)}°C is high`;
        else if (humidity >= humidityWarning) alertMessage = `WARNING: Humidity ${humidity.toFixed(1)}% is high`;
        else alertMessage = `WARNING: Gas level ${gasLevel.toFixed(1)} ppm is high`;
    }

    const levelChanged = alertLevel !== state.currentAlertLevel;
    state.previousAlertLevel = state.currentAlertLevel;
    state.currentAlertLevel = alertLevel;

    if (alertLevel === 'normal') {
        if (levelChanged) {
            stopAlarm();
            hidealertBanner();
            updateBuzzerUI();
        }
    } else {
        // Trigger alarm and alert on level change or every 30s for same level
        const now = Date.now();
        if (levelChanged || now - state.lastAlertTime > 30000) {
            state.lastAlertTime = now;
            triggerAlert(alertLevel, alertMessage);
        }
    }
}

function triggerAlert(level, message) {
    // Add to alerts list
    state.alerts.unshift({ level, message, timestamp: new Date(), dismissed: false });

    // Show alert banner
    showAlertBanner(level, message);

    // Start alarm sound
    triggerBuzzer(level);

    // Send email via backend (works on localhost:3000)
    sendEmailAlert(level, message);

    // Update UI
    addAlertToList(level, message);
    updateStatistics();
    showNotification(level === 'danger' ? `🚨 ${message}` : `⚠️ ${message}`, level);
}

function triggerBuzzer(level) {
    startAlarm(level);
}

function updateBuzzerUI() {
    const buzzerIndicator = document.getElementById('buzzerIndicator');
    const buzzerStatus = document.getElementById('buzzerStatus');
    const buzzerMode = document.getElementById('buzzerMode');

    buzzerIndicator.className = '';
    
    if (!state.buzzerActive) {
        buzzerIndicator.classList.add('buzzer-inactive');
        buzzerIndicator.innerHTML = '<i class="fas fa-volume-mute"></i>';
        buzzerStatus.textContent = 'Silent';
        buzzerMode.textContent = 'No Alert';
    } else if (state.currentAlertLevel === 'danger') {
        buzzerIndicator.classList.add('buzzer-danger');
        buzzerIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        buzzerStatus.textContent = 'CRITICAL';
        buzzerMode.textContent = 'Continuous Alert';
    } else if (state.currentAlertLevel === 'warning') {
        buzzerIndicator.classList.add('buzzer-warning');
        buzzerIndicator.innerHTML = '<i class="fas fa-bell"></i>';
        buzzerStatus.textContent = 'WARNING';
        buzzerMode.textContent = 'Flickering Alert (1s)';
    }
}

function testBuzzer() {
    playAlertSound('warning');
    showNotification('🔔 Test alarm triggered!');
}

function playAlertSound(level) {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (level === 'danger') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(660, now + 0.15);
        osc.frequency.setValueAtTime(880, now + 0.30);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
    } else {
        osc.type = 'square';
        osc.frequency.value = 720;
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
    }
}

function startAlarm(level) {
    stopAlarm(); // clear any existing alarm
    state.buzzerActive = true;
    updateBuzzerUI();
    playAlertSound(level);
    const interval = level === 'danger' ? 600 : 1500;
    state.alarmInterval = setInterval(() => {
        if (state.currentAlertLevel === level || (level === 'warning' && state.currentAlertLevel !== 'normal')) {
            playAlertSound(state.currentAlertLevel);
        } else {
            stopAlarm();
        }
    }, interval);
}

function stopAlarm() {
    if (state.alarmInterval) {
        clearInterval(state.alarmInterval);
        state.alarmInterval = null;
    }
    state.buzzerActive = false;
    updateBuzzerUI();
}

function showAlertBanner(level, message) {
    const banner = document.getElementById('alertBanner');
    banner.textContent = message;
    banner.className = `alert-banner ${level}`;
    banner.style.display = 'block';
}

function hidealertBanner() {
    const banner = document.getElementById('alertBanner');
    banner.style.display = 'none';
}

function addAlertToList(level, message) {
    const alertsList = document.querySelector('.alerts-list');
    const alertItem = document.createElement('div');
    alertItem.className = `alert-item ${level}`;
    
    const icon = level === 'danger' ? 'fas fa-exclamation-triangle' : 'fas fa-exclamation-circle';
    
    alertItem.innerHTML = `
        <div class="alert-icon ${level}">
            <i class="${icon}"></i>
        </div>
        <div class="alert-content">
            <h4>${message.split(':')[0]}</h4>
            <p>${message}</p>
            <span class="alert-time">Just now</span>
        </div>
        <div class="alert-actions">
            <button class="btn-dismiss">Dismiss</button>
        </div>
    `;

    alertItem.querySelector('.btn-dismiss').addEventListener('click', () => {
        alertItem.remove();
    });

    // Insert at beginning
    const exampleItem = alertsList.querySelector('.example');
    if (exampleItem) {
        exampleItem.remove();
    }
    alertsList.insertBefore(alertItem, alertsList.firstChild);
}

function filterAlerts(type) {
    const alertItems = document.querySelectorAll('.alert-item');
    alertItems.forEach(item => {
        if (type === 'all') {
            item.style.display = '';
        } else if (type === 'warning' && item.classList.contains('warning')) {
            item.style.display = '';
        } else if (type === 'danger' && item.classList.contains('danger')) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

// ============ EMAIL NOTIFICATIONS ============
async function sendEmailAlert(level, message) {
    try {
        // Use backend API for email (works on localhost:3000)
        const response = await fetch('/api/alerts/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'email' })
        });
        if (response.ok) {
            console.log(`✅ Email alert sent [${level}]`);
        } else {
            console.warn(`⚠️ Email API returned ${response.status}`);
        }
    } catch (error) {
        // On Vercel (no backend), silently skip — email handled by backend server
        console.warn('Email not sent (no backend):', error.message);
    }
}

// Twilio call alerts removed: phone alerts disabled

// ============ CHARTS ============
let charts = {};

function initializeCharts() {
    const chartConfig = {
        type: 'line',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#f0f0f0'
                    }
                }
            },
            scales: {
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#f0f0f0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#f0f0f0'
                    }
                }
            }
        }
    };

    // Temperature Chart
    charts.temp = new Chart(document.getElementById('tempChart'), {
        ...chartConfig,
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                tension: 0.4
            }]
        }
    });

    // Humidity Chart
    charts.humidity = new Chart(document.getElementById('humidityChart'), {
        ...chartConfig,
        data: {
            labels: [],
            datasets: [{
                label: 'Humidity (%)',
                data: [],
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                tension: 0.4
            }]
        }
    });

    // Gas Level Chart
    charts.gas = new Chart(document.getElementById('gasChart'), {
        ...chartConfig,
        data: {
            labels: [],
            datasets: [{
                label: 'Gas Level (ppm)',
                data: [],
                borderColor: '#ff6b9d',
                backgroundColor: 'rgba(255, 107, 157, 0.1)',
                tension: 0.4
            }]
        }
    });
}

function updateChartData(temperature, humidity, gasLevel, feedTime) {
    const timeString = new Date(feedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Keep only last 20 live data points (history fetch handles the full chart)
    if (state.chartData.time.length >= 20) {
        state.chartData.time.shift();
        state.chartData.temp.shift();
        state.chartData.humidity.shift();
        state.chartData.gas.shift();
    }

    // Avoid duplicate timestamps
    if (state.chartData.time[state.chartData.time.length - 1] === timeString) return;

    state.chartData.time.push(timeString);
    state.chartData.temp.push(temperature);
    state.chartData.humidity.push(humidity);
    state.chartData.gas.push(gasLevel);
}

function updateChartsTimeRange(range) {
    // This would typically fetch historical data based on range
    console.log('Updating charts for range:', range);
}

// ============ STATISTICS ============
function updateStatistics() {
    const avgTemp = state.chartData.temp.length > 0 
        ? (state.chartData.temp.reduce((a, b) => a + b) / state.chartData.temp.length).toFixed(1)
        : 0;
    
    const avgHumidity = state.chartData.humidity.length > 0 
        ? (state.chartData.humidity.reduce((a, b) => a + b) / state.chartData.humidity.length).toFixed(1)
        : 0;
    
    const peakGas = state.chartData.gas.length > 0 
        ? Math.max(...state.chartData.gas).toFixed(1)
        : 0;

    document.getElementById('avgTemp').textContent = avgTemp + '°C';
    document.getElementById('avgHumidity').textContent = avgHumidity + '%';
    document.getElementById('peakGas').textContent = peakGas + ' ppm';
    document.getElementById('totalAlerts').textContent = state.alerts.length;
}

// ============ SETTINGS ============
function loadSettings() {
    const saved = localStorage.getItem('helmetSettings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            if (settings.thresholds) Object.assign(state.thresholds, settings.thresholds);
            if (settings.thinkSpeak) Object.assign(state.thinkSpeakConfig, settings.thinkSpeak);
        } catch(e) { localStorage.removeItem('helmetSettings'); }
    }

    // Populate form only if elements exist
    const fields = ['tempWarning','tempDanger','humidityWarning','humidityDanger','gasWarning','gasDanger'];
    fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = state.thresholds[f]; });
    const chEl = document.getElementById('thinkSpeakChannelId');
    if (chEl) chEl.value = state.thinkSpeakConfig.channelId;
    const intEl = document.getElementById('updateInterval');
    if (intEl) intEl.value = state.thinkSpeakConfig.updateInterval;
}

function saveSettings() {
    const fields = ['tempWarning','tempDanger','humidityWarning','humidityDanger','gasWarning','gasDanger'];
    fields.forEach(f => { const el = document.getElementById(f); if (el) state.thresholds[f] = parseFloat(el.value); });
    const chEl = document.getElementById('thinkSpeakChannelId');
    if (chEl) state.thinkSpeakConfig.channelId = chEl.value;
    const intEl = document.getElementById('updateInterval');
    if (intEl) state.thinkSpeakConfig.updateInterval = parseInt(intEl.value);

    localStorage.setItem('helmetSettings', JSON.stringify({
        thresholds: state.thresholds,
        thinkSpeak: state.thinkSpeakConfig
    }));
    showNotification('Settings saved!');
}

function resetSettings() {
    localStorage.removeItem('helmetSettings');
    location.reload();
}

function loadThinkSpeakConfig() {
    const link = `https://thingspeak.com/channels/${state.thinkSpeakConfig.channelId}`;
    const el = document.getElementById('thinkSpeakLink');
    if (el) el.innerHTML = `<a href="${link}" target="_blank">View Channel</a>`;
}

// ============ NOTIFICATIONS ============
function showNotification(message, level = 'normal') {
    const notification = document.createElement('div');
    const bg = level === 'danger' ? 'rgba(255,59,79,0.95)' 
             : level === 'warning' ? 'rgba(255,176,32,0.95)' 
             : 'linear-gradient(45deg,#00d4ff,#7b61ff)';
    notification.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${bg}; color: white;
        padding: 14px 22px; border-radius: 12px;
        font-weight: 600; font-size: 14px;
        z-index: 3000; max-width: 320px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        animation: slideInUp 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ============ 3D ANIMATION ============
function init3DScene() {
    // Using Three.js if available
    const canvas = document.getElementById('canvas3D');
    if (!canvas || typeof THREE === 'undefined') {
        // Fallback to canvas 2D animation
        initCanvas2D();
        return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    camera.position.z = 5;

    // Create helmet model (simplified)
    const helmetGeometry = new THREE.ConeGeometry(1, 2, 32);
    const helmetMaterial = new THREE.MeshPhongMaterial({ color: 0x00d4ff });
    const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    
    scene.add(helmet);

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, 0.7);
    light.position.set(5, 5, 5);
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xff6b9d, 0.3);
    scene.add(ambientLight);

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        helmet.rotation.x += 0.005;
        helmet.rotation.y += 0.005;
        
        renderer.render(scene, camera);
    }

    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function initCanvas2D() {
    const canvas = document.getElementById('helmetCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    let animationFrame = 0;

    function drawHelmet() {
        animationFrame++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const rotation = animationFrame * 0.01;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation);

        // Draw helmet shape
        ctx.fillStyle = `rgba(0, 212, 255, ${0.5 + 0.3 * Math.sin(rotation)})`;
        ctx.beginPath();
        ctx.ellipse(0, -20, 40, 60, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw visor
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -10, 30, 0.3, Math.PI - 0.3);
        ctx.stroke();

        ctx.restore();

        requestAnimationFrame(drawHelmet);
    }

    drawHelmet();
}

// ============ UTILITY FUNCTIONS ============
function getColor(level) {
    switch(level) {
        case 'danger': return '#ff3333';
        case 'warning': return '#ffa500';
        default: return '#00ff88';
    }
}

// Export for external use
window.SmartHelmet = {
    state,
    fetchThinkSpeakData,
    triggerAlert,
    sendEmailAlert,
};

// Initialize on page load
window.addEventListener('load', () => {
    console.log('SmartHelmet Dashboard Initialized');
    initializeApp();
});
