require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');

const THINGSPEAK_CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID || '3376690';
const THINGSPEAK_READ_KEY = process.env.THINGSPEAK_API_KEY || '8JKU7MB5273R0GQQ';
const THINGSPEAK_WRITE_KEY = process.env.THINGSPEAK_WRITE_API || 'WC8DXJQE1JQM3WYO';

const THRESHOLDS = {
  tempWarning:      Number(process.env.TEMP_WARNING      || 33),   // just above current ~32°C
  tempDanger:       Number(process.env.TEMP_DANGER       || 34),
  humidityWarning:  Number(process.env.HUMIDITY_WARNING  || 63),   // raised — current ~62%
  humidityDanger:   Number(process.env.HUMIDITY_DANGER   || 65),
  gasWarning:       Number(process.env.GAS_WARNING       || 82),   // just above current ~78ppm
  gasDanger:        Number(process.env.GAS_DANGER        || 90)
};

const EMAIL_INTERVAL = Math.max(1, Number(process.env.EMAIL_INTERVAL_HOURS || 1)) * 60 * 60 * 1000;
const ALERT_EMAIL_ADDRESS = process.env.ALERT_EMAIL_ADDRESS || process.env.EMAIL_USER || '';
const ALERT_COOLDOWN = 10 * 60 * 1000;  // 10 minutes between repeat emails for same condition
const POLL_INTERVAL  = 5 * 1000;
const CACHE_TTL      = 4 * 1000;
const MAX_ALERTS     = 200;

// How old ThingSpeak data can be before we consider the device offline (2 minutes)
const DEVICE_OFFLINE_MS = 2 * 60 * 1000;

function isDeviceOnline(timestamp) {
  const age = Date.now() - new Date(timestamp).getTime();
  return age <= DEVICE_OFFLINE_MS;
}
const emailUser = process.env.EMAIL_USER || '';
const emailPass = process.env.EMAIL_PASSWORD || '';
const emailReady = emailUser.includes('@') && emailPass.length > 0
  && !emailUser.includes('your-') && !emailPass.includes('xxxx');

const emailTransporter = emailReady
  ? nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT || 587),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: emailUser,
        pass: emailPass
      }
    })
  : null;

// Twilio removed: phone-call alerts disabled

const appState = {
  currentReading: null,
  currentStatus: 'normal',
  previousStatus: null,          // null = first poll, don't treat as "changed"
  lastFetchedAt: 0,
  lastNormalEmailAt: 0,
  lastWarningEmailAt: 0,
  lastDangerEmailAt: 0,
  latestSignature: '',
  pollFailures: 0,
  alertHistory: [],
  lastError: null,
  isFallbackData: false,
  startupEmailSent: false        // track if startup email was sent
};

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(ROOT_DIR));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));

function safeNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function classifyValue(value, warning, danger) {
  if (value >= danger) {
    return 'danger';
  }
  if (value >= warning) {
    return 'warning';
  }
  return 'normal';
}

function calculateRiskScore(reading) {
  const temperatureRisk = reading.temperature >= THRESHOLDS.tempDanger
    ? 100
    : reading.temperature >= THRESHOLDS.tempWarning
      ? 55 + ((reading.temperature - THRESHOLDS.tempWarning) / Math.max(1, THRESHOLDS.tempDanger - THRESHOLDS.tempWarning)) * 35
      : clamp((reading.temperature / Math.max(1, THRESHOLDS.tempWarning)) * 30, 0, 30);

  const humidityRisk = reading.humidity >= THRESHOLDS.humidityDanger
    ? 100
    : reading.humidity >= THRESHOLDS.humidityWarning
      ? 55 + ((reading.humidity - THRESHOLDS.humidityWarning) / Math.max(1, THRESHOLDS.humidityDanger - THRESHOLDS.humidityWarning)) * 35
      : clamp((reading.humidity / Math.max(1, THRESHOLDS.humidityWarning)) * 30, 0, 30);

  const gasRisk = reading.gasLevel >= THRESHOLDS.gasDanger
    ? 100
    : reading.gasLevel >= THRESHOLDS.gasWarning
      ? 55 + ((reading.gasLevel - THRESHOLDS.gasWarning) / Math.max(1, THRESHOLDS.gasDanger - THRESHOLDS.gasWarning)) * 35
      : clamp((reading.gasLevel / Math.max(1, THRESHOLDS.gasWarning)) * 30, 0, 30);

  return Math.round((temperatureRisk + humidityRisk + gasRisk) / 3);
}

function assessReading(reading) {
  const temperatureStatus = classifyValue(reading.temperature, THRESHOLDS.tempWarning, THRESHOLDS.tempDanger);
  const humidityStatus = classifyValue(reading.humidity, THRESHOLDS.humidityWarning, THRESHOLDS.humidityDanger);
  const gasStatus = classifyValue(reading.gasLevel, THRESHOLDS.gasWarning, THRESHOLDS.gasDanger);

  const overallStatus = [temperatureStatus, humidityStatus, gasStatus].includes('danger')
    ? 'danger'
    : [temperatureStatus, humidityStatus, gasStatus].includes('warning')
      ? 'warning'
      : 'normal';

  const riskScore = calculateRiskScore(reading);

  return {
    ...reading,
    temperatureStatus,
    humidityStatus,
    gasStatus,
    overallStatus,
    riskScore,
    statusText: overallStatus.toUpperCase(),
    alertLevel: overallStatus === 'danger' ? 2 : overallStatus === 'warning' ? 1 : 0
  };
}

function mapFeed(feed) {
  const reading = {
    temperature: safeNumber(feed.field1),
    humidity: safeNumber(feed.field2),
    gasLevel: safeNumber(feed.field3),
    deviceStatus: safeInteger(feed.field4, -1),
    timestamp: feed.created_at || new Date().toISOString()
  };

  const assessed = assessReading(reading);
  if (assessed.deviceStatus >= 0 && assessed.deviceStatus <= 2) {
    assessed.sourceStatus = assessed.deviceStatus;
  }

  return assessed;
}

function createFallbackReading() {
  return assessReading({
    temperature: 28.0,
    humidity: 52.0,
    gasLevel: 120.0,
    deviceStatus: 0,
    timestamp: new Date().toISOString(),
    sourceStatus: 0
  });
}

function createFallbackHistory(results) {
  const reading = createFallbackReading();
  const feedCount = Math.max(1, Math.min(results || 60, 120));
  const feeds = [];

  for (let index = feedCount - 1; index >= 0; index -= 1) {
    const offsetMinutes = index * 15;
    feeds.push({
      ...reading,
      timestamp: new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString(),
      temperature: Number((reading.temperature + Math.sin(index / 8) * 1.2).toFixed(2)),
      humidity: Number((reading.humidity + Math.cos(index / 10) * 1.8).toFixed(2)),
      gasLevel: Number((reading.gasLevel + Math.sin(index / 6) * 8).toFixed(2))
    });
  }

  return feeds;
}

function createFallbackAnalytics(results) {
  const feeds = createFallbackHistory(results);
  return summarizeHistory(feeds);
}

function addAlertRecord(entry) {
  appState.alertHistory.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry
  });

  if (appState.alertHistory.length > MAX_ALERTS) {
    appState.alertHistory.length = MAX_ALERTS;
  }
}

function buildEmailHtml(level, reading, subjectLine, description) {
  const accent = level === 'danger' ? '#ff3b4f' : level === 'warning' ? '#ffb020' : '#00d4ff';
  return `
    <div style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #0a0e27, #151b3e); padding: 24px; color: #e8ecff;">
      <div style="max-width: 640px; margin: 0 auto; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 24px;">
        <h1 style="margin: 0 0 12px; color: ${accent};">Smart Mining Helmet</h1>
        <h2 style="margin: 0 0 18px; font-size: 22px;">${subjectLine}</h2>
        <p style="margin: 0 0 20px; line-height: 1.6; white-space: pre-line;">${description}</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 14px;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">Temperature</td><td style="text-align: right;">${reading.temperature.toFixed(1)} °C</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">Humidity</td><td style="text-align: right;">${reading.humidity.toFixed(1)} %</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">Gas Level</td><td style="text-align: right;">${reading.gasLevel.toFixed(1)} ppm</td></tr>
          <tr><td style="padding: 10px 0;">Risk Score</td><td style="text-align: right;">${reading.riskScore}/100</td></tr>
        </table>
        <p style="margin-top: 20px; color: rgba(232,236,255,0.7); font-size: 12px;">Sent at ${new Date().toLocaleString()}</p>
      </div>
    </div>
  `;
}

async function sendEmail(level, reading, subjectLine, description) {
  if (!emailTransporter || !ALERT_EMAIL_ADDRESS) {
    const reason = !emailTransporter
      ? 'Email credentials not configured or still set to placeholder values in .env'
      : 'ALERT_EMAIL_ADDRESS not set in .env';
    addAlertRecord({ type: 'email', level, status: 'skipped', message: reason, reading });
    console.warn(`⚠️  Email skipped [${level}]: ${reason}`);
    return false;
  }

  try {
    await emailTransporter.sendMail({
      from: `"Smart Mining Helmet" <${emailUser}>`,
      to: ALERT_EMAIL_ADDRESS,
      subject: subjectLine,
      html: buildEmailHtml(level, reading, subjectLine, description)
    });

    addAlertRecord({ type: 'email', level, status: 'sent', message: subjectLine, reading });
    console.log(`✅ Email sent [${level}]: ${subjectLine} → ${ALERT_EMAIL_ADDRESS}`);
    return true;
  } catch (error) {
    const errMsg = `SMTP error: ${error.message}`;
    addAlertRecord({ type: 'email', level, status: 'failed', message: errMsg, reading });
    console.error(`❌ Email failed [${level}]:`, error.message);
    throw error;
  }
}

// sendDangerCall removed: Twilio-based phone alerts disabled per configuration

async function fetchLatestFeed() {
  if (!THINGSPEAK_CHANNEL_ID || !THINGSPEAK_READ_KEY) {
    throw new Error('ThingSpeak read credentials are missing');
  }

  const primaryUrl = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds/last.json?api_key=${THINGSPEAK_READ_KEY}`;
  const fallbackUrl = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds/last.json`;

  try {
    const response = await axios.get(primaryUrl, { timeout: 10000 });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      const fallbackResponse = await axios.get(fallbackUrl, { timeout: 10000 });
      return fallbackResponse.data;
    }

    throw error;
  }
}

async function refreshLatestReading(force = false) {
  const now = Date.now();
  if (!force && appState.currentReading && now - appState.lastFetchedAt < CACHE_TTL) {
    return appState.currentReading;
  }

  try {
    const feed = await fetchLatestFeed();
    const reading = mapFeed(feed);

    // Check if device is actually online (data must be fresh)
    const deviceOnline = isDeviceOnline(reading.timestamp);

    if (!deviceOnline) {
      // Device is offline — stale data, do NOT trigger alerts
      appState.pollFailures += 1;
      appState.lastError = `Device offline — last data: ${new Date(reading.timestamp).toLocaleTimeString()} (${Math.round((Date.now() - new Date(reading.timestamp).getTime()) / 60000)}min ago)`;
      appState.isFallbackData = true;

      // Reset previousStatus so when device comes back online it sends a fresh alert
      appState.previousStatus = null;

      if (!appState.currentReading) {
        appState.currentReading = reading;
        appState.lastFetchedAt = now;
      }
      console.log(`📴 Device offline: ${appState.lastError}`);
      return appState.currentReading;
    }

    appState.currentReading = reading;
    appState.currentStatus = reading.overallStatus;
    appState.lastFetchedAt = now;
    appState.pollFailures = 0;
    appState.lastError = null;
    appState.isFallbackData = false;

    const signature = [reading.overallStatus, reading.temperature.toFixed(1), reading.humidity.toFixed(1), reading.gasLevel.toFixed(1)].join('|');
    if (signature !== appState.latestSignature) {
      appState.latestSignature = signature;
      addAlertRecord({ type: 'state', level: reading.overallStatus, status: 'updated', message: `State changed to ${reading.statusText}`, reading });
    }

    await evaluateAlertPolicy(reading);
    return reading;
  } catch (error) {
    appState.pollFailures += 1;
    appState.lastError = error.message;
    if (appState.currentReading) {
      return appState.currentReading;
    }

    const fallbackReading = createFallbackReading();
    appState.currentReading = fallbackReading;
    appState.currentStatus = fallbackReading.overallStatus;
    appState.lastFetchedAt = now;
    appState.isFallbackData = true;
    return fallbackReading;
  }
}

async function evaluateAlertPolicy(reading) {
  const now = Date.now();

  // First poll after startup — establish baseline, send startup email, no alert emails yet
  if (appState.previousStatus === null) {
    appState.previousStatus = reading.overallStatus;

    // Send startup email only once
    if (!appState.startupEmailSent) {
      appState.startupEmailSent = true;
      try {
        await sendEmail(
          'normal', reading,
          'Smart Helmet - System Online ✅',
          `✅ Smart Helmet system is now ONLINE and monitoring.\n\nCurrent readings:\nTemperature: ${reading.temperature.toFixed(1)} °C\nHumidity: ${reading.humidity.toFixed(1)} %\nGas Level: ${reading.gasLevel.toFixed(1)} ppm\nStatus: ${reading.statusText}\n\nAlert thresholds:\nTemp Warning: >${THRESHOLDS.tempWarning}°C | Danger: >${THRESHOLDS.tempDanger}°C\nGas Warning: >${THRESHOLDS.gasWarning}ppm | Danger: >${THRESHOLDS.gasDanger}ppm\nHumidity Warning: >${THRESHOLDS.humidityWarning}% | Danger: >${THRESHOLDS.humidityDanger}%`
        );
        appState.lastNormalEmailAt = now;
        console.log('📧 Startup email sent');
      } catch (err) {
        console.error('❌ Startup email failed:', err.message);
      }
    }
    return;
  }

  const statusChanged = reading.overallStatus !== appState.previousStatus;
  appState.previousStatus = reading.overallStatus;

  // ── NORMAL ──────────────────────────────────────────────────────────────
  if (reading.overallStatus === 'normal') {
    if (statusChanged) await triggerDeviceBuzzer('off');

    // Hourly status report
    if (now - appState.lastNormalEmailAt >= EMAIL_INTERVAL) {
      try {
        await sendEmail(
          'normal', reading,
          'Smart Helmet - Hourly Status Report ✅',
          `The helmet is operating normally.\n\nTemperature: ${reading.temperature.toFixed(1)} °C ✅\nHumidity: ${reading.humidity.toFixed(1)} % ✅\nGas Level: ${reading.gasLevel.toFixed(1)} ppm ✅\nRisk Score: ${reading.riskScore}/100\n\nNext report in 1 hour.`
        );
        appState.lastNormalEmailAt = now;
        console.log(`📧 Hourly report sent. Next at ${new Date(now + EMAIL_INTERVAL).toLocaleTimeString()}`);
      } catch (err) {
        console.error('❌ Hourly email failed:', err.message);
      }
    }
    return;
  }

  // ── WARNING ──────────────────────────────────────────────────────────────
  if (reading.overallStatus === 'warning') {
    if (statusChanged) await triggerDeviceBuzzer('on');

    // Send email: immediately on first detection, then every ALERT_COOLDOWN
    const shouldSend = statusChanged || (now - appState.lastWarningEmailAt >= ALERT_COOLDOWN);
    if (shouldSend) {
      try {
        await sendEmail(
          'warning', reading,
          '⚠️ Smart Helmet - WARNING ALERT',
          `⚠️ WARNING condition detected!\n\nTemperature: ${reading.temperature.toFixed(1)} °C  ${reading.temperature >= THRESHOLDS.tempWarning ? '🔴 HIGH' : '✅'}\nHumidity: ${reading.humidity.toFixed(1)} %  ${reading.humidity >= THRESHOLDS.humidityWarning ? '🔴 HIGH' : '✅'}\nGas Level: ${reading.gasLevel.toFixed(1)} ppm  ${reading.gasLevel >= THRESHOLDS.gasWarning ? '🔴 HIGH' : '✅'}\nRisk Score: ${reading.riskScore}/100\n\nPlease check the helmet immediately.`
        );
        appState.lastWarningEmailAt = now;
      } catch (err) {
        console.error('❌ Warning email failed:', err.message);
        addAlertRecord({ type: 'email', level: 'warning', status: 'failed', message: err.message, reading });
      }
    }
    return;
  }

  // ── DANGER ───────────────────────────────────────────────────────────────
  if (statusChanged) await triggerDeviceBuzzer('on');

  const shouldSend = statusChanged || (now - appState.lastDangerEmailAt >= ALERT_COOLDOWN);
  if (shouldSend) {
    try {
      await sendEmail(
        'danger', reading,
        '🚨 Smart Helmet - DANGER ALERT',
        `🚨 CRITICAL DANGER detected!\n\nTemperature: ${reading.temperature.toFixed(1)} °C  ${reading.temperature >= THRESHOLDS.tempDanger ? '🔴 DANGER' : '⚠️'}\nHumidity: ${reading.humidity.toFixed(1)} %  ${reading.humidity >= THRESHOLDS.humidityDanger ? '🔴 DANGER' : '⚠️'}\nGas Level: ${reading.gasLevel.toFixed(1)} ppm  ${reading.gasLevel >= THRESHOLDS.gasDanger ? '🔴 DANGER' : '⚠️'}\nRisk Score: ${reading.riskScore}/100\n\n⚠️ IMMEDIATE ACTION REQUIRED!`
      );
      appState.lastDangerEmailAt = now;
    } catch (err) {
      console.error('❌ Danger email failed:', err.message);
      addAlertRecord({ type: 'email', level: 'danger', status: 'failed', message: err.message, reading });
    }
  }
}

function transformHistoryFeeds(feeds) {
  return feeds
    .map(mapFeed)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function summarizeHistory(feeds) {
  const temperatures = feeds.map((feed) => feed.temperature).filter(Number.isFinite);
  const humidity = feeds.map((feed) => feed.humidity).filter(Number.isFinite);
  const gasLevel = feeds.map((feed) => feed.gasLevel).filter(Number.isFinite);
  const alerts = feeds.reduce((accumulator, feed) => {
    accumulator[feed.overallStatus] = (accumulator[feed.overallStatus] || 0) + 1;
    return accumulator;
  }, { normal: 0, warning: 0, danger: 0 });

  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const min = (values) => values.length ? Math.min(...values) : 0;
  const max = (values) => values.length ? Math.max(...values) : 0;

  return {
    temperature: { avg: average(temperatures), min: min(temperatures), max: max(temperatures) },
    humidity: { avg: average(humidity), min: min(humidity), max: max(humidity) },
    gasLevel: { avg: average(gasLevel), min: min(gasLevel), max: max(gasLevel) },
    alerts,
    totalSamples: feeds.length
  };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    channelId: THINGSPEAK_CHANNEL_ID,
    writeKeyConfigured: Boolean(THINGSPEAK_WRITE_KEY),
    readKeyConfigured: Boolean(THINGSPEAK_READ_KEY),
    thresholds: THRESHOLDS,
    emailConfigured: Boolean(emailTransporter && ALERT_EMAIL_ADDRESS)
  });
});

app.get('/api/dashboard/current', async (req, res) => {
  try {
    const reading = await refreshLatestReading(Boolean(req.query.force));
    const deviceOnline = reading ? isDeviceOnline(reading.timestamp) : false;
    res.json({
      reading,
      thresholds: THRESHOLDS,
      status: deviceOnline ? reading.overallStatus : 'offline',
      deviceOnline,
      updatedAt: new Date(appState.lastFetchedAt).toISOString(),
      lastError: appState.lastError,
      pollFailures: appState.pollFailures,
      alertHistory: appState.alertHistory.slice(0, 20),
      isFallback: appState.isFallbackData
    });
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch current sensor data', detail: error.message });
  }
});

app.get('/api/dashboard/history', async (req, res) => {
  try {
    const results = Math.min(Math.max(Number.parseInt(req.query.results || '100', 10) || 100, 1), 800);
    const response = await axios.get(
      `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json`,
      {
        params: {
          api_key: THINGSPEAK_READ_KEY,
          results
        },
        timeout: 10000
      }
    );

    const feeds = transformHistoryFeeds(response.data.feeds || []);
    res.json({ feeds, total: feeds.length });
  } catch (error) {
    const results = Math.min(Math.max(Number.parseInt(req.query.results || '100', 10) || 100, 1), 800);
    res.json({
      feeds: createFallbackHistory(results),
      total: results,
      fallback: true,
      error: error.message
    });
  }
});

app.get('/api/dashboard/analytics', async (req, res) => {
  try {
    const results = Math.min(Math.max(Number.parseInt(req.query.results || '120', 10) || 120, 1), 800);
    const response = await axios.get(
      `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json`,
      {
        params: {
          api_key: THINGSPEAK_READ_KEY,
          results
        },
        timeout: 10000
      }
    );

    const feeds = transformHistoryFeeds(response.data.feeds || []);
    res.json({
      ...summarizeHistory(feeds),
      samples: feeds
    });
  } catch (error) {
    const results = Math.min(Math.max(Number.parseInt(req.query.results || '120', 10) || 120, 1), 800);
    const analytics = createFallbackAnalytics(results);
    res.json({
      ...analytics,
      fallback: true,
      error: error.message
    });
  }
});

app.get('/api/dashboard/alerts', (req, res) => {
  res.json({ alerts: appState.alertHistory.slice(0, 100) });
});

async function handleTestAlert(req, res) {
  try {
    const type = String(req.body?.type || '').toLowerCase();
    const reading = appState.currentReading || assessReading({
      temperature: 28.0,
      humidity: 52.0,
      gasLevel: 120.0,
      timestamp: new Date().toISOString()
    });

    if (type === 'email') {
      if (!emailTransporter || !ALERT_EMAIL_ADDRESS) {
        return res.status(503).json({
          error: 'Email alerts are not configured. Set EMAIL_USER, EMAIL_PASSWORD, and ALERT_EMAIL_ADDRESS in your .env file.'
        });
      }

      // Verify SMTP connection before sending
      try {
        await emailTransporter.verify();
      } catch (verifyError) {
        return res.status(503).json({
          error: 'SMTP connection failed. Check your email credentials.',
          detail: verifyError.message
        });
      }

      await sendEmail('warning', reading, 'Smart Helmet - Test Email', 'This is a test email from the Smart Mining Helmet dashboard. If you received this, email alerts are working correctly.');
      return res.json({ success: true, message: `Test email sent to ${ALERT_EMAIL_ADDRESS}` });
    }

    if (type === 'call') {
      // Phone call alerts are disabled (Twilio removed)
      return res.status(503).json({ error: 'Phone call alerts are not available in this build.' });
    }

    res.status(400).json({ error: 'Unsupported test type. Use "email" or "call".' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send test alert', detail: error.message });
  }
}

app.get('/api/email/status', async (req, res) => {
  if (!emailTransporter || !ALERT_EMAIL_ADDRESS) {
    return res.json({
      configured: false,
      reason: !emailTransporter
        ? 'EMAIL_USER or EMAIL_PASSWORD is missing in .env'
        : 'ALERT_EMAIL_ADDRESS is missing in .env'
    });
  }

  try {
    await emailTransporter.verify();
    res.json({ configured: true, recipient: ALERT_EMAIL_ADDRESS, smtp: 'connected' });
  } catch (error) {
    res.json({ configured: true, recipient: ALERT_EMAIL_ADDRESS, smtp: 'failed', detail: error.message });
  }
});

app.post('/api/alerts/test', handleTestAlert);

app.post('/api/alert/test', handleTestAlert);

// Send buzzer command directly to ESP8266 HTTP server on local network
async function triggerDeviceBuzzer(command = 'on') {
  const deviceIp = process.env.HELMET_DEVICE_IP;
  if (!deviceIp) return false;
  try {
    const url = `http://${deviceIp}/buzzer/${command}`;
    const response = await axios.get(url, { timeout: 3000 });
    console.log(`📡 Buzzer ${command.toUpperCase()} → device ${deviceIp}:`, response.data);
    return true;
  } catch (error) {
    // Silently skip if device is unreachable — firmware may not be uploaded yet
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`⚠️  Device buzzer unreachable (${deviceIp}) — upload new firmware to ESP8266`);
    }
    return false;
  }
}

// Write a command value to ThingSpeak field4 so ESP8266 picks it up
async function writeThingSpeakCommand(field4Value) {
  if (!THINGSPEAK_WRITE_KEY) return;
  try {
    const url = `https://api.thingspeak.com/update?api_key=${THINGSPEAK_WRITE_KEY}&field4=${field4Value}`;
    const response = await axios.get(url, { timeout: 8000 });
    if (response.data === 0) {
      console.warn('⚠️  ThingSpeak write returned 0 — rate limited (15s minimum between updates)');
    } else {
      console.log(`📡 ThingSpeak field4=${field4Value} written (entry ${response.data})`);
    }
  } catch (error) {
    console.error('❌ ThingSpeak write failed:', error.message);
  }
}

app.post('/api/alerts/simulate', async (req, res) => {
  try {
    const level = String(req.body?.level || 'warning').toLowerCase();
    const validLevels = ['warning', 'danger', 'normal'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ error: 'level must be warning, danger, or normal' });
    }

    const readings = {
      warning: { temperature: THRESHOLDS.tempWarning + 2, humidity: THRESHOLDS.humidityWarning + 2, gasLevel: THRESHOLDS.gasWarning + 50 },
      danger:  { temperature: THRESHOLDS.tempDanger  + 5, humidity: THRESHOLDS.humidityDanger  + 5, gasLevel: THRESHOLDS.gasDanger  + 100 },
      normal:  { temperature: 28, humidity: 52, gasLevel: 120 }
    };

    const reading = assessReading({ ...readings[level], deviceStatus: level === 'danger' ? 2 : level === 'warning' ? 1 : 0, timestamp: new Date().toISOString() });

    // Force status change so email fires
    appState.previousStatus = level === 'normal' ? 'danger' : 'normal';
    appState.lastWarningEmailAt = 0;
    appState.lastDangerEmailAt  = 0;

    await evaluateAlertPolicy(reading);

    return res.json({ success: true, message: `Simulated ${level} — email sent`, reading });
  } catch (error) {
    return res.status(500).json({ error: 'Simulation failed', detail: error.message });
  }
});

app.post('/api/alerts/trigger-danger', async (req, res) => {
  try {
    const dangerReading = {
      temperature: THRESHOLDS.tempDanger + 5,
      humidity: THRESHOLDS.humidityDanger + 5,
      gasLevel: THRESHOLDS.gasDanger + 100,
      deviceStatus: 2,
      timestamp: new Date().toISOString()
    };
    const reading = assessReading(dangerReading);

    // Update state so evaluateAlertPolicy sees a real status change next poll
    appState.currentReading = reading;
    appState.currentStatus = 'danger';
    appState.previousStatus = 'danger';
    // Reset danger cooldown so next real danger also fires immediately
    appState.lastDangerEmailAt = 0;

    // Trigger physical buzzer
    await triggerDeviceBuzzer('on');

    // Send danger email immediately
    await sendEmail(
      'danger', reading,
      '🚨 Smart Helmet - DANGER TRIGGER TEST',
      `🚨 Manual danger trigger test activated from dashboard.\n\nTemperature: ${reading.temperature.toFixed(1)} °C 🔴\nHumidity: ${reading.humidity.toFixed(1)} % 🔴\nGas Level: ${reading.gasLevel.toFixed(1)} ppm 🔴\nRisk Score: ${reading.riskScore}/100\n\nThis is a TEST ALERT triggered from the dashboard.`
    );

    addAlertRecord({ type: 'test', level: 'danger', status: 'triggered', message: 'Danger trigger — buzzer + email sent', reading });
    return res.json({ success: true, message: 'Danger test triggered: buzzer command sent to helmet + email sent', reading });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to trigger danger test', detail: error.message });
  }
});

app.post('/api/alerts/send-hourly-email', async (req, res) => {
  try {
    const { reading } = req.body;
    if (!reading) {
      return res.status(400).json({ error: 'Reading data is required' });
    }
    
    const processedReading = assessReading(reading);
    
    // Send hourly status email
    await sendEmail(
      'hourly',
      processedReading,
      'Smart Helmet - Hourly Status Report',
      `Hourly status report for Smart Helmet IoT system.\n\nTemperature: ${processedReading.temperature.toFixed(1)} °C\nHumidity: ${processedReading.humidity.toFixed(1)} %\nGas Level: ${processedReading.gasLevel.toFixed(1)} ppm\nRisk Score: ${processedReading.riskScore}/100\nStatus: ${processedReading.overallStatus.toUpperCase()}\n\nThis is a periodic status report.`
    );
    
    addAlertRecord({ type: 'hourly', level: 'normal', status: 'sent', message: 'Hourly status email sent', reading: processedReading });
    return res.json({ success: true, message: 'Hourly email sent successfully', reading: processedReading });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send hourly email', detail: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

setInterval(() => {
  refreshLatestReading(true).catch((error) => {
    appState.lastError = error.message;
  });
}, POLL_INTERVAL);

refreshLatestReading(true).catch((error) => {
  appState.lastError = error.message;
  console.error('Initial ThingSpeak refresh failed:', error.message);
});

app.listen(PORT, () => {
  console.log(`\n🪖  SmartHelmet backend running on port ${PORT}`);
  console.log(`📡  ThingSpeak channel: ${THINGSPEAK_CHANNEL_ID}`);
  console.log(`📧  Email alerts: ${emailTransporter && ALERT_EMAIL_ADDRESS ? `enabled → ${ALERT_EMAIL_ADDRESS}` : 'DISABLED (set EMAIL_USER, EMAIL_PASSWORD, ALERT_EMAIL_ADDRESS in .env)'}`);
  console.log(`🌐  Dashboard: http://localhost:${PORT}\n`);
});

module.exports = app;
