# SmartHelmet IoT Mining Safety System

## Overview

SmartHelmet is an advanced IoT-based safety monitoring system designed for mining workers. It combines real-time sensor data collection, cloud integration (ThinkSpeak), intelligent alert mechanisms, and a modern web dashboard to ensure worker safety in hazardous mining environments.

## Features

### 🎯 Core Features
- **Real-time Sensor Monitoring**: Temperature, Humidity, and Gas Level detection
- **Multi-Level Alert System**: Normal, Warning, and Danger alert states
- **Intelligent Buzzer System**: 
  - Normal: Silent
  - Warning: Flickering alert (1-second intervals)
  - Danger: Continuous loud alert
- **ThinkSpeak Cloud Integration**: All sensor data synced to ThinkSpeak platform
- **Automated Email Alerts**: Hourly status emails + instant alerts for warnings/dangers
- **Twilio Integration**: Emergency voice calls for danger scenarios
- **Responsive Dashboard**: Beautiful, animated web interface for real-time monitoring

### 📊 Advanced Features
- **Analytics & Trending**: Historical data visualization with Chart.js
- **Anomaly Detection**: Machine learning-based sensor anomaly detection
- **Mobile-Responsive Design**: Fully functional on desktop, tablet, and mobile
- **Real-Time Dashboard**: Live streaming of sensor data
- **Alert History**: Complete log of all alerts with timestamps
- **Customizable Thresholds**: Adjust alert levels from the dashboard
- **System Health Monitoring**: Continuous system status tracking

## System Architecture

```
┌─────────────┐
│ ESP8266     │
│ NodeMCU     │ ──WiFi──→ ThinkSpeak Cloud
│ + Sensors   │                │
└─────────────┘                │
                               ↓
                    ┌──────────────────────┐
                    │   ThinkSpeak API     │
                    │  (Cloud Database)    │
                    └──────────────────────┘
                               │
      ┌────────────────────────┼────────────────────────┐
      │                        │                        │
      ↓                        ↓                        ↓
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│ Backend      │      │  Web Dashboard   │      │   Database   │
│ Node.js      │←────→│   HTML/CSS/JS    │      │  (Alerts)    │
│ Server       │      └──────────────────┘      └──────────────┘
└──────────────┘
      │
      ├──→ Email (Nodemailer)
      ├──→ SMS/Call (Twilio)
      └──→ Anomaly Detection
```

## Hardware Components

| Component | Specification | Pin |
|-----------|---|---|
| **ESP8266 NodeMCU** | 32-bit microcontroller with WiFi | - |
| **DHT11** | Temperature & Humidity sensor | D4 (GPIO2) |
| **MQ-2** | Gas detection sensor | A0 (Analog) |
| **Buzzer** | Audio alert device | D8 (GPIO15) |
| **LED** | Status indicator | D0 (GPIO16) |
| **Power** | 5V USB or battery | - |

## Installation Guide

### Backend Setup

1. **Install Node.js Dependencies**
```bash
cd backend
npm install
```

2. **Configure Environment Variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Required Environment Variables**
```env
# ThinkSpeak
THINGSPEAK_CHANNEL_ID=your_channel_id
THINGSPEAK_API_KEY=your_read_key
THINGSPEAK_WRITE_API=your_write_key

# Email (Gmail SMTP)
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
ALERT_EMAIL_ADDRESS=recipient@gmail.com

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ALERT_PHONE_NUMBER=+1234567890

# Server
PORT=3000
```

4. **Start Backend Server**
```bash
npm start
# or for development
npm run dev
```

### ESP8266 Setup

1. **Install Arduino IDE**
   - Download from [arduino.cc](https://www.arduino.cc/en/software)

2. **Add ESP8266 Board**
   - Tools → Boards Manager
   - Search for "ESP8266"
   - Install "esp8266 by ESP8266 Community"

3. **Install Libraries**
   - Sketch → Include Library → Manage Libraries
   - Install: `DHT sensor library`, `Adafruit DHT`

4. **Configure Arduino Sketch**
   - Open `esp8266/helmet_iot.ino`
   - Update WiFi credentials:
     ```cpp
     const char* ssid = "YOUR_SSID";
     const char* password = "YOUR_PASSWORD";
     ```
   - Update ThinkSpeak API keys

5. **Upload to ESP8266**
   - Select Tools → Board → NodeMCU 1.0
   - Select correct COM port
   - Click Upload

### Web Dashboard

The web dashboard is served automatically by the backend server.

**Access:** http://localhost:3000

## Sensor Thresholds (Configurable)

| Sensor | Normal | Warning | Danger |
|--------|--------|---------|--------|
| **Temperature** | < 35°C | 35-45°C | > 45°C |
| **Humidity** | 30-70% | <30% or >70% | <20% or >80% |
| **Gas Level** | < 300 ppm | 300-600 ppm | > 600 ppm |

## API Endpoints

### Get Current Sensor Data
```
GET /api/sensors/current
Response: { temperature, humidity, gasLevel, status, timestamp }
```

### Get Sensor History
```
GET /api/sensors/history?results=100
Response: Array of historical readings
```

### Get Analytics
```
GET /api/analytics?range=24h
Response: { temperature, humidity, gasLevel statistics }
```

### Send Email Alert
```
POST /api/send-email
Body: { level, message, deviceId, sensorData }
```

### Send Twilio Call Alert
```
POST /api/send-twilio-alert
Body: { message, deviceId }
```

## Alert System Logic

### Email Alerts
- **Hourly**: Normal status report every 1 hour
- **Immediate**: Warning alert sent instantly + breaks 1-hour cycle
- **Immediate**: Danger alert sent instantly + breaks 1-hour cycle

### Buzzer Alerts
- **Normal (0)**: Silent - no action
- **Warning (1)**: Flickering tone (600Hz) for 1 second, repeats
- **Danger (2)**: Continuous loud tone (1000Hz) until resolved

### Twilio Alerts
- **Danger Level Only**: Automatic voice call triggered
- Repeats alert message twice
- Logs call SID for tracking

## Dashboard Features

### 📈 Real-Time Monitoring
- Live gauge displays for each sensor
- Color-coded status indicators
- System health overview
- Last update timestamp

### 📊 Analytics Section
- Temperature trend chart
- Humidity trend chart
- Gas level trend chart
- Alert history timeline
- Statistical summaries (avg, min, max)

### 🔔 Alert Management
- Filter alerts by type (all, warning, danger)
- Dismiss individual alerts
- View alert timestamps and details
- Download alert history

### ⚙️ Settings
- Customize alert thresholds
- Configure ThinkSpeak parameters
- Enable/disable notifications
- Save preferences to browser

## Troubleshooting

### ESP8266 Won't Connect to WiFi
```
✗ Solution: Check WiFi credentials in code
✗ Check WiFi signal strength (RSSI > -70 dBm)
✗ Reset ESP8266: Connect RST pin to GND
```

### Sensors Not Reading
```
✗ DHT11: Check pin connections and library installation
✗ MQ-2: Warm up sensor for 20 seconds, check ADC pin
✗ Check Serial Monitor: Tools → Serial Monitor (115200 baud)
```

### Email Alerts Not Sending
```
✗ Check SMTP credentials in .env
✗ For Gmail: Enable "Less secure app access"
✗ Or generate App Password for 2FA accounts
✗ Verify ALERT_EMAIL_ADDRESS is correct
```

### ThinkSpeak Upload Fails
```
✗ Verify Channel ID and API keys
✗ Check internet connection on ESP8266
✗ Monitor ThinkSpeak channel for updates
✗ Check ThinkSpeak rate limits (15-second minimum)
```

## Performance Optimization

### ESP8266 Settings
- Update interval: 15 seconds (adjustable in code)
- WiFi power saving: Sleep between uploads
- Sensor calibration: Regular MQ-2 calibration needed

### Dashboard Optimization
- Data refreshes every 15 seconds
- Chart data limited to last 20 points
- Local storage for settings
- Lazy loading of analytics

### Backend Scalability
- Express.js with CORS enabled
- Rate limiting available (express-rate-limit)
- Connection pooling for email/SMS
- Alert history limited to 1000 entries

## Advanced Features

### Machine Learning Anomaly Detection
```
POST /api/detect-anomaly
Detects unusual sensor readings using Z-score analysis
```

### 3D Helmet Visualization
- Uses Three.js library
- Animated helmet model in dashboard hero section
- Rotates based on sensor state

### Browser Notifications
- Desktop push notifications
- Mobile vibration alerts
- Customizable notification preferences

## Security Considerations

1. **API Keys**: Never commit .env files to version control
2. **HTTPS**: Deploy with SSL certificates in production
3. **Rate Limiting**: Enabled on sensitive endpoints
4. **CORS**: Configured for authorized domains
5. **Input Validation**: All server inputs validated
6. **Helmet.js**: Security headers protection enabled

## Deployment Guide

### Local Testing
```bash
npm run dev
```

### Production Deployment
```bash
# Using PM2
npm install -g pm2
pm2 start backend/server.js --name "smarthelmet"
pm2 startup
pm2 save
```

### Docker Deployment
```dockerfile
FROM node:16
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Updates & Maintenance

### OTA (Over-The-Air) Updates
- Implement in ESP8266 for wireless firmware updates
- Requires secure update server setup

### Regular Maintenance
- Monthly sensor calibration (MQ-2)
- Check DHT11 sensor health
- Review alert patterns for optimization
- Update dependencies quarterly

## License & Support

**License**: MIT  
**Author**: Mining Safety Solutions

For issues, feature requests, or support:
- Create an issue in repository
- Email: support@mining-safety.com

---

**Last Updated**: May 9, 2026
**Version**: 1.0.0
