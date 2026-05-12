# Smart Mining Helmet - Setup & Installation Guide

## 📋 Project Overview

The Smart Mining Helmet is an IoT-enabled safety system designed for mining workers. It monitors:
- **Temperature** (DHT11 sensor)
- **Humidity** (DHT11 sensor)
- **Harmful Gases** (MQ-2 sensor)
- **Alerts** (Buzzer with variable tones)

Data flows through: **Sensors → ESP8266 → ThinkSpeak → Website Dashboard**

## 🔧 Hardware Setup

### Components Required:
- ESP8266 NodeMCU
- DHT11 Temperature & Humidity Sensor
- MQ-2 Gas Sensor
- Active Buzzer (5V)
- Micro USB Cable
- Jumper Wires
- 10kΩ Resistor (for DHT11)

### Wiring Diagram:

```
ESP8266 NodeMCU Pin Layout:
┌─────────────────────────┐
│  D0   D1   D2   D3   D4 │
│  G    3V   GND  5V   A0 │
│  D8   D7   D6   D5   RX │
│  TX   GND  3V   5V      │
└─────────────────────────┘

Connections:
- DHT11:
  - VCC → 3V (ESP8266)
  - GND → GND (ESP8266)
  - DATA → D4 (ESP8266)
  - (Add 10kΩ pullup resistor between DATA and VCC)

- MQ-2:
  - VCC → 5V (ESP8266)
  - GND → GND (ESP8266)
  - A0 → A0 (ESP8266 Analog Input)

- Buzzer:
  - (+) → D8 (ESP8266)
  - (-) → GND (ESP8266)
```

## ⚡ ESP8266 Setup

### 1. Arduino IDE Configuration:

1. **Install Arduino IDE**: https://www.arduino.cc/en/software
2. **Add ESP8266 Board**:
   - Go to: File → Preferences
   - Add to "Additional Boards Manager URLs":
     ```
     http://arduino.esp8266.com/stable/package_esp8266com_index.json
     ```
   - Go to: Tools → Board → Boards Manager
   - Search for "esp8266" and install

3. **Select Board**:
   - Tools → Board → ESP8266 Modules → Generic ESP8266 Module
   - Tools → Flash Size → 4M (1M SPIFFS)
   - Tools → CPU Frequency → 80 MHz

### 2. Install Required Libraries:

In Arduino IDE, go to: Sketch → Include Library → Manage Libraries

Search and install:
- **DHT sensor library** by Adafruit (v1.4.3+)
- **Adafruit Unified Sensor** by Adafruit (v1.1.5+)
- **ESP8266WiFi** (built-in)

### 3. Upload Code:

1. Copy code from `esp8266/helmet_iot.ino`
2. Update WiFi credentials:
   ```cpp
   const char* ssid = "YOUR_SSID";
   const char* password = "YOUR_PASSWORD";
   ```
3. Update ThinkSpeak credentials:
   ```cpp
   const String apiKey = "YOUR_THINGSPEAK_API_KEY";
   unsigned long channelID = 0; // YOUR_CHANNEL_ID
   ```
4. Connect ESP8266 via USB
5. Select correct COM Port in Tools → Port
6. Click Upload

### 4. Verify Serial Output:

- Open Tools → Serial Monitor
- Set baud rate to 115200
- You should see debug messages and sensor readings

## 🌐 ThinkSpeak Configuration

### 1. Create ThinkSpeak Account:
- Visit: https://thingspeak.com
- Sign up for free account
- Create new channel

### 2. Configure Channel Fields:
- **Field 1**: Temperature (°C)
- **Field 2**: Humidity (%)
- **Field 3**: Gas Level (ppm)
- **Field 4**: Status (0=Normal, 1=Warning, 2=Danger)

### 3. Get API Keys:
- Go to Channel Settings
- Copy: **Channel ID** and **Write API Key**
- Update `esp8266/helmet_iot.ino` with these values

### 4. Test Data Upload:
- Check ThinkSpeak channel → Feeds
- You should see data updating every 15 seconds

## 🚀 Backend Server Setup

### 1. Prerequisites:
- Node.js (v14+): https://nodejs.org
- npm (comes with Node.js)

### 2. Install Dependencies:

```bash
cd backend
npm install
```

### 3. Configure Environment:

Create `.env` file in `backend/` directory:

```env
# ThinkSpeak Configuration
THINKSPEAK_CHANNEL_ID=your_channel_id
THINKSPEAK_API_KEY=your_api_key

# Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your_app_password
ADMIN_EMAIL=admin@example.com

# Twilio Configuration (for phone alerts)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1234567890
ADMIN_PHONE=+1234567890

# Server Configuration
PORT=5000
```

### 4. Gmail App Password Setup:

1. Enable 2-Factor Authentication on Gmail account
2. Go to: https://myaccount.google.com/apppasswords
3. Generate app password for "Mail" on "Windows Computer"
4. Use generated password in `.env` as `EMAIL_PASSWORD`

### 5. Twilio Setup (Optional):

1. Create account at: https://www.twilio.com
2. Get phone numbers for `TWILIO_PHONE` and `ADMIN_PHONE`
3. Generate API credentials from Twilio console
4. Update `.env` with credentials

### 6. Start Backend Server:

```bash
npm start
```

You should see:
```
🚀 Smart Helmet Backend Server running on port 5000
📊 ThinkSpeak Channel ID: xxxxx
📧 Alert Email: admin@example.com
```

## 💻 Frontend Website Setup

### 1. Update API URL:

In `frontend/script.js`, line 3:
```javascript
const API_BASE_URL = 'http://localhost:5000/api';
```

Change to your server address if deploying remotely:
```javascript
const API_BASE_URL = 'https://your-domain.com/api';
```

### 2. Deploy Website:

**Option A - Local Testing:**
```bash
cd frontend
# Use Python's built-in server
python -m http.server 8000

# Or use Node's http-server
npx http-server
```

Then open: http://localhost:8000

**Option B - Deploy Online:**
- Upload `frontend/` folder to:
  - GitHub Pages
  - Vercel
  - Netlify
  - AWS S3
  - Any web hosting service

## 🧪 Testing & Verification

### 1. Sensor Calibration:

**MQ-2 Gas Sensor Calibration:**
1. Let sensor warm up for 24-48 hours
2. Use known gas concentrations to calibrate
3. Adjust ppm conversion formula in `helmet_iot.ino`

**DHT11 Verification:**
1. Compare readings with calibrated thermometer
2. Should be accurate within ±2°C

### 2. Alert Thresholds:

Current thresholds (in `helmet_iot.ino`):

```
WARNING CONDITIONS:
- Temperature: 0°C to 0°C OR 40°C to 50°C
- Humidity: 10% to 20% OR 80% to 95%
- Gas: 400-800 ppm

DANGER CONDITIONS:
- Temperature: <0°C OR >50°C
- Humidity: <10% OR >95%
- Gas: >800 ppm
```

Modify thresholds in `determineStatus()` function as needed.

### 3. Test Alerts:

**Email Alert:**
1. Click "Test Email Alert" on dashboard
2. Check inbox for test email

**Phone Alert:**
1. Ensure Twilio is configured
2. Click "Test Phone Alert"
3. You should receive a call

### 4. Data Refresh:**

- Auto-refresh every 5 seconds
- Manual refresh button available
- Charts update every 30 seconds

## 📊 Dashboard Features

### Real-time Monitoring:
- Temperature, Humidity, Gas Level gauges
- Live status indicator
- 3D helmet visualization

### Analytics:
- 24-hour trend charts
- Statistical averages
- Alert distribution pie chart

### Alerts:
- **NORMAL** (✅): Green indicator, continuous hourly emails
- **WARNING** (⚠️): Orange alert, buzzer flickers (1-sec intervals), immediate email
- **DANGER** (🚨): Red critical alert, continuous buzzer, emergency call, immediate email

### Data Log:
- Real-time event log
- Last 50 entries displayed
- Color-coded by alert level

## 🔐 Security Considerations

1. **API Protection:**
   - Use HTTPS in production
   - Implement rate limiting
   - Add authentication tokens

2. **Credentials:**
   - Never commit `.env` to git
   - Rotate API keys regularly
   - Use environment variables

3. **Data Privacy:**
   - Encrypt sensitive data
   - Implement access controls
   - Regular security audits

## 🐛 Troubleshooting

### ESP8266 Connection Issues:
- Check USB cable (data cable, not charge-only)
- Install CH340 driver if needed
- Try different USB port
- Check baud rate (115200)

### DHT11 Reading Errors:
- Check wiring and pullup resistor
- Ensure sensor is not damaged
- Try different GPIO pin
- Check sensor power supply

### MQ-2 Issues:
- Sensor needs 24-48 hour warm-up
- Check analog pin connection
- Verify power supply voltage (5V)
- Sensor drift is normal - recalibrate periodically

### Data Not Updating on Website:
- Check backend server is running
- Verify ThinkSpeak API key
- Check CORS settings
- Look at browser console for errors

### Email Not Sending:
- Verify Gmail app password
- Check email whitelist
- Ensure 2FA is enabled on Gmail
- Check spam folder

### No Twilio Call:
- Verify Twilio credentials
- Check phone numbers format
- Ensure account has credits
- Test in Twilio console first

## 📱 Mobile App Alternative

For iOS/Android app, use:
- Flutter with same backend API
- React Native
- WebView wrapper of the website

## 🚢 Deployment Checklist

- [ ] Test all sensors
- [ ] Verify alert thresholds
- [ ] Configure email settings
- [ ] Set up Twilio (optional)
- [ ] Deploy backend server
- [ ] Deploy frontend website
- [ ] Test email alerts
- [ ] Test phone alerts
- [ ] Verify data flow
- [ ] Monitor for 24 hours
- [ ] Train workers on usage
- [ ] Set up emergency contacts
- [ ] Document emergency procedures

## 📞 Support & Contact

For issues or questions:
1. Check troubleshooting section
2. Review Arduino IDE serial monitor output
3. Check browser developer console (F12)
4. Review backend server logs
5. Check ThinkSpeak feed for data

## 📄 License

This project is open source and available for educational and commercial use.

## 🎉 Success!

Once everything is set up, your Smart Mining Helmet will:
✅ Monitor environmental conditions in real-time
✅ Alert workers to hazardous conditions
✅ Send emergency notifications
✅ Track historical data and analytics
✅ Help prevent mining-related accidents

**Stay Safe!**
