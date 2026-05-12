// ============ GLOBAL STATE ============
const state = {
    deviceId: 'HELMET-001',
    sensors: {
        temperature: 0,
        humidity: 0,
        gasLevel: 0
    },
    thresholds: {
        tempWarning: 35,
        tempDanger: 45,
        humidityWarning: 70,
        humidityDanger: 80,
        gasWarning: 300,
        gasDanger: 600
    },
    thinkSpeakConfig: {
        channelId: '3376690',
        apiKey: '8JKU7MB5273R0GQQ',
        updateInterval: 15
    },
    alerts: [],
    chartData: {
        temp: [],
        humidity: [],
        gas: [],
        time: []
    },
    lastAlertTime: 0,
    emailLastSent: 0,
    emailInterval: 3600000, // 1 hour
    currentAlertLevel: 'normal',
    buzzerActive: false
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadSettings();
    startDataFetch();
    initializeCharts();
    setupHamburgerMenu();
});

function initializeApp() {
    // Set device ID
    document.getElementById('deviceId').textContent = state.deviceId;
    
    // Initialize 3D canvas
    init3DScene();
    
    // Setup connection status
    updateConnectionStatus(true);
    
    // Load ThinkSpeak configuration
    loadThinkSpeakConfig();
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    // Hamburger menu
    document.querySelector('.hamburger').addEventListener('click', toggleMobileMenu);
    
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

    // Settings buttons
    document.getElementById('saveSetting').addEventListener('click', saveSettings);
    document.getElementById('resetSettings').addEventListener('click', resetSettings);
    document.getElementById('testBuzzer').addEventListener('click', testBuzzer);

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelector('.nav-menu').classList.remove('active');
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
    // Fetch from ThinkSpeak every N seconds
    setInterval(fetchThinkSpeakData, state.thinkSpeakConfig.updateInterval * 1000);
    
    // Initial fetch
    fetchThinkSpeakData();
}

async function fetchThinkSpeakData() {
    try {
        const url = `https://api.thingspeak.com/channels/${state.thinkSpeakConfig.channelId}/feeds.json?api_key=${state.thinkSpeakConfig.apiKey}&results=1`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.feeds && data.feeds.length > 0) {
            const feed = data.feeds[0];
            
            // Extract sensor values
            const temperature = parseFloat(feed.field1) || 0;
            const humidity = parseFloat(feed.field2) || 0;
            const gasLevel = parseFloat(feed.field3) || 0;
            
            // Update state
            state.sensors.temperature = temperature;
            state.sensors.humidity = humidity;
            state.sensors.gasLevel = gasLevel;
            
            // Update timestamp
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
            
            // Update UI
            updateSensorDisplay();
            updateChartData();
            
            // Check alert conditions
            checkAlertConditions();
            
            // Update connection status
            updateConnectionStatus(true);
        }
    } catch (error) {
        console.error('Error fetching ThinkSpeak data:', error);
        updateConnectionStatus(false);
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

function updateConnectionStatus(isConnected) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    
    if (isConnected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    }
}

// ============ ALERT SYSTEM ============
function checkAlertConditions() {
    const { temperature, humidity, gasLevel } = state.sensors;
    const { tempWarning, tempDanger, humidityWarning, humidityDanger, gasWarning, gasDanger } = state.thresholds;
    
    let alertLevel = 'normal';
    let alertMessage = '';
    let shouldAlert = false;

    // Check danger conditions
    if (temperature >= tempDanger) {
        alertLevel = 'danger';
        alertMessage = `DANGER: Temperature ${temperature.toFixed(1)}°C exceeds safe limit!`;
        shouldAlert = true;
    } else if (humidity >= humidityDanger) {
        alertLevel = 'danger';
        alertMessage = `DANGER: Humidity ${humidity.toFixed(1)}% exceeds safe limit!`;
        shouldAlert = true;
    } else if (gasLevel >= gasDanger) {
        alertLevel = 'danger';
        alertMessage = `DANGER: Gas level ${gasLevel.toFixed(1)} ppm exceeds safe limit!`;
        shouldAlert = true;
    }
    // Check warning conditions
    else if (temperature >= tempWarning) {
        alertLevel = 'warning';
        alertMessage = `WARNING: Temperature ${temperature.toFixed(1)}°C is high`;
        shouldAlert = true;
    } else if (humidity >= humidityWarning) {
        alertLevel = 'warning';
        alertMessage = `WARNING: Humidity ${humidity.toFixed(1)}% is high`;
        shouldAlert = true;
    } else if (gasLevel >= gasWarning) {
        alertLevel = 'warning';
        alertMessage = `WARNING: Gas level ${gasLevel.toFixed(1)} ppm is high`;
        shouldAlert = true;
    }

    state.currentAlertLevel = alertLevel;

    if (shouldAlert) {
        triggerAlert(alertLevel, alertMessage);
    } else {
        state.buzzerActive = false;
        updateBuzzerUI();
        hidealertBanner();
    }
}

function triggerAlert(level, message) {
    const now = Date.now();
    
    // Add to alerts list
    state.alerts.unshift({
        level,
        message,
        timestamp: new Date(),
        dismissed: false
    });

    // Show alert banner
    showAlertBanner(level, message);

    // Trigger buzzer
    if (level === 'danger') {
        triggerBuzzer('danger');
    } else if (level === 'warning') {
        triggerBuzzer('warning');
    }

    // Send email if it's been more than 1 hour since last email, or if this is an alert
    const timeSinceLastEmail = now - state.emailLastSent;
    if (timeSinceLastEmail >= state.emailInterval || level === 'danger' || level === 'warning') {
        sendEmailAlert(level, message);
        state.emailLastSent = now;
    }

    // Update UI
    addAlertToList(level, message);
    updateStatistics();
}

function triggerBuzzer(level) {
    state.buzzerActive = true;
    updateBuzzerUI();
    
    // Play sound
    playAlertSound(level);

    if (level === 'danger') {
        // Continuous alert
        const buzzer = setInterval(() => {
            if (state.currentAlertLevel !== 'danger') {
                clearInterval(buzzer);
                return;
            }
            playAlertSound('danger');
        }, 1000);
    } else if (level === 'warning') {
        // Flickering alert with 1 second delay
        const buzzer = setInterval(() => {
            if (state.currentAlertLevel !== 'warning') {
                clearInterval(buzzer);
                return;
            }
            playAlertSound('warning');
        }, 2000);
    }
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
    showNotification('Test alert triggered!');
}

function playAlertSound(level) {
    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (level === 'danger') {
        oscillator.frequency.value = 1000; // Higher pitch
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } else if (level === 'warning') {
        oscillator.frequency.value = 600;
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    }
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
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                level,
                message,
                deviceId: state.deviceId,
                timestamp: new Date().toISOString(),
                sensorData: state.sensors
            })
        });

        if (response.ok) {
            console.log('Email alert sent successfully');
        }
    } catch (error) {
        console.error('Error sending email alert:', error);
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

function updateChartData() {
    const now = new Date();
    const timeString = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

    // Keep only last 20 data points
    if (state.chartData.time.length >= 20) {
        state.chartData.time.shift();
        state.chartData.temp.shift();
        state.chartData.humidity.shift();
        state.chartData.gas.shift();
    }

    state.chartData.time.push(timeString);
    state.chartData.temp.push(state.sensors.temperature);
    state.chartData.humidity.push(state.sensors.humidity);
    state.chartData.gas.push(state.sensors.gasLevel);

    // Update charts
    charts.temp.data.labels = state.chartData.time;
    charts.temp.data.datasets[0].data = state.chartData.temp;
    charts.temp.update();

    charts.humidity.data.labels = state.chartData.time;
    charts.humidity.data.datasets[0].data = state.chartData.humidity;
    charts.humidity.update();

    charts.gas.data.labels = state.chartData.time;
    charts.gas.data.datasets[0].data = state.chartData.gas;
    charts.gas.update();
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
        const settings = JSON.parse(saved);
        Object.assign(state.thresholds, settings.thresholds);
        Object.assign(state.thinkSpeakConfig, settings.thinkSpeak);
    }

    // Populate form
    document.getElementById('tempWarning').value = state.thresholds.tempWarning;
    document.getElementById('tempDanger').value = state.thresholds.tempDanger;
    document.getElementById('humidityWarning').value = state.thresholds.humidityWarning;
    document.getElementById('humidityDanger').value = state.thresholds.humidityDanger;
    document.getElementById('gasWarning').value = state.thresholds.gasWarning;
    document.getElementById('gasDanger').value = state.thresholds.gasDanger;
    document.getElementById('thinkSpeakChannelId').value = state.thinkSpeakConfig.channelId;
    document.getElementById('updateInterval').value = state.thinkSpeakConfig.updateInterval;
}

function saveSettings() {
    state.thresholds.tempWarning = parseFloat(document.getElementById('tempWarning').value);
    state.thresholds.tempDanger = parseFloat(document.getElementById('tempDanger').value);
    state.thresholds.humidityWarning = parseFloat(document.getElementById('humidityWarning').value);
    state.thresholds.humidityDanger = parseFloat(document.getElementById('humidityDanger').value);
    state.thresholds.gasWarning = parseFloat(document.getElementById('gasWarning').value);
    state.thresholds.gasDanger = parseFloat(document.getElementById('gasDanger').value);
    
    state.thinkSpeakConfig.channelId = document.getElementById('thinkSpeakChannelId').value;
    state.thinkSpeakConfig.updateInterval = parseInt(document.getElementById('updateInterval').value);

    localStorage.setItem('helmetSettings', JSON.stringify({
        thresholds: state.thresholds,
        thinkSpeak: state.thinkSpeakConfig
    }));

    showNotification('Settings saved successfully!');
}

function resetSettings() {
    localStorage.removeItem('helmetSettings');
    location.reload();
}

function loadThinkSpeakConfig() {
    const channelId = document.getElementById('thinkSpeakChannelId').value;
    if (channelId) {
        state.thinkSpeakConfig.channelId = channelId;
        const link = `https://thingspeak.com/channels/${channelId}`;
        document.getElementById('thinkSpeakLink').innerHTML = `<a href="${link}" target="_blank">View Channel</a>`;
    }
}

// ============ NOTIFICATIONS ============
function showNotification(message) {
    // Create a simple toast notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(45deg, #00d4ff, #ff6b9d);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        z-index: 2000;
        animation: slideInUp 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutDown 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
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
