# Smart Mining Helmet Project

> An advanced IoT-based safety system for mining workers with real-time environmental monitoring, intelligent alerting, and emergency response protocols.

## 🎯 Features

### Real-Time Monitoring
- ✅ Temperature monitoring (DHT11)
- ✅ Humidity tracking (DHT11)
- ✅ Harmful gas detection (MQ-2)
- ✅ Live 3D helmet visualization
- ✅ Multi-level alert system (Normal/Warning/Danger)

### Intelligent Alert System
- 📊 **Normal Mode**: Hourly email reports, green dashboard
- ⚠️ **Warning Mode**: Immediate email, flickering buzzer alerts
- 🚨 **Danger Mode**: Critical alerts, continuous buzzer, emergency Twilio calls

### Advanced Features
- 📈 Real-time analytics and trending
- 📊 Historical data visualization (Charts.js)
- 📱 Fully mobile-responsive design
- 🎨 Beautiful animated 3D UI (Three.js)
- 🔔 Email notifications (Gmail integration)
- 📞 Phone alerts (Twilio integration)
- ⚡ Auto-refresh with manual controls
- 📋 Live data logging

## 📁 Project Structure

```
helmet/
├── esp8266/
│   └── helmet_iot.ino           # ESP8266 Arduino code
├── backend/
│   ├── server.js                # Node.js backend server
│   ├── package.json             # Dependencies
│   └── .env.example             # Environment template
├── frontend/
│   ├── index.html               # Main dashboard HTML
│   ├── styles.css               # Modern animated styles
│   ├── script.js                # Interactive dashboard logic
│   └── favicon.ico              # Browser icon
├── docs/
│   ├── SETUP_GUIDE.md           # Complete setup guide
│   ├── API_DOCUMENTATION.md     # API reference
│   └── README.md                # This file
└── .gitignore                   # Git ignore patterns
```

## 🚀 Quick Start

### Hardware Setup
1. Connect DHT11 to ESP8266 D4
2. Connect MQ-2 to ESP8266 A0
3. Connect Buzzer to ESP8266 D8
4. Power ESP8266 via USB

### Software Setup
1. **ESP8266**: Upload Arduino code with WiFi credentials
2. **ThinkSpeak**: Create channel and copy API keys
3. **Backend**: `npm install && npm start`
4. **Frontend**: Open `index.html` in browser

See [SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for detailed instructions.

## 🔌 Hardware Requirements

| Component | Quantity | Purpose |
|-----------|----------|---------|
| ESP8266 NodeMCU | 1 | Main microcontroller |
| DHT11 | 1 | Temperature & Humidity |
| MQ-2 | 1 | Gas sensor |
| Active Buzzer | 1 | Alert mechanism |
| USB Cable | 1 | Power & programming |
| Jumper Wires | 10+ | Connections |
| 10kΩ Resistor | 1 | DHT11 pullup |

## 💻 Software Stack

- **Firmware**: Arduino C/C++
- **Backend**: Node.js (Express)
- **Frontend**: HTML5, CSS3, JavaScript
- **3D Graphics**: Three.js
- **Charts**: Chart.js
- **APIs**: 
  - ThinkSpeak (IoT data)
  - Gmail SMTP (Email)
  - Twilio (Phone calls)

## 🌐 Data Flow

```
┌─────────────────────────────────────────────────────┐
│                   HELMET                             │
│  (Temp, Humidity, Gas Sensors + Buzzer)             │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼ (WiFi)
┌─────────────────────────────────────────────────────┐
│            THINGSPEAK CLOUD STORAGE                  │
│  (Real-time channel storage & history)              │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼ (HTTPS)
┌─────────────────────────────────────────────────────┐
│          BACKEND SERVER (Node.js)                    │
│  - Data processing & alert logic                     │
│  - Email notifications (Gmail)                       │
│  - Emergency calls (Twilio)                          │
│  - Analytics calculation                            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼ (API)
┌─────────────────────────────────────────────────────┐
│         FRONTEND DASHBOARD                           │
│  - Real-time monitoring                             │
│  - Live visualization                               │
│  - Historical analytics                             │
│  - Control panel                                    │
└─────────────────────────────────────────────────────┘
```

## 📊 Alert Thresholds

### Temperature
| Status | Range |
|--------|-------|
| ✅ Normal | 0°C to 40°C |
| ⚠️ Warning | 40-50°C or below 0°C |
| 🚨 Danger | >50°C or <0°C |

### Humidity
| Status | Range |
|--------|-------|
| ✅ Normal | 20% to 80% |
| ⚠️ Warning | 80-95% or 10-20% |
| 🚨 Danger | >95% or <10% |

### Gas Level (PPM)
| Status | Range |
|--------|-------|
| ✅ Normal | 0-400 ppm |
| ⚠️ Warning | 400-800 ppm |
| 🚨 Danger | >800 ppm |

*Thresholds can be customized in `helmet_iot.ino`*

## 🔔 Notification System

### Normal Mode (Every Hour)
```
Subject: Smart Helmet - Hourly Status Report
Content: All systems operating normally with current readings
```

### Warning Mode (Immediate)
```
Subject: Smart Helmet - WARNING ALERT
Content: Suboptimal conditions detected - immediate attention required
- Sends immediately (breaks 1-hour rule)
- Buzzer flickers with 1-second intervals
- Dashboard shows orange warning
```

### Danger Mode (Immediate + Call)
```
Subject: Smart Helmet - DANGER ALERT
Content: CRITICAL CONDITIONS - IMMEDIATE EVACUATION REQUIRED
- Sends immediately (breaks 1-hour rule)
- Continuous buzzer alert
- Emergency phone call triggered
- Dashboard shows critical red alert with animation
```

## 📱 Mobile Responsiveness

Dashboard is fully responsive across:
- 📱 Mobile phones (320px+)
- 📱 Tablets (768px+)
- 💻 Laptops (1024px+)
- 🖥️ Desktop (1400px+)

All animations, charts, and 3D elements adapt to screen size.

## 🎨 UI/UX Features

### Animations
- Smooth blob background gradients
- Floating header icon
- Glowing cards on hover
- Pulsing status indicators
- Animated 3D helmet rotation
- Real-time gauge animations

### Visual Hierarchy
- Color-coded alerts (Green/Orange/Red)
- Clear data hierarchy
- Icon-based navigation
- Glassmorphism design
- Dark theme for mining environments

### Accessibility
- High contrast ratios
- Large touch targets (mobile)
- Semantic HTML
- ARIA labels (where needed)
- Keyboard navigation support

## 🔐 Security Features

- ✅ Environment variable protection (.env)
- ✅ HTTPS ready (production)
- ✅ API rate limiting
- ✅ Input validation
- ✅ Secure credential storage
- ✅ CORS configuration

## 📊 Analytics Dashboard

Track metrics over time:
- Temperature trends (24h)
- Humidity patterns
- Gas level history
- Alert distribution
- Average readings
- Peak values
- Alert statistics

## 🧪 Testing

### Test Email Alert
Click "Test Email Alert" button to verify:
- Email service connection
- Recipient address
- Email template rendering

### Test Phone Alert
Click "Test Phone Alert" to verify:
- Twilio connection
- Phone number validity
- Emergency notification system

### Manual Sensor Testing
Use serial monitor to:
- Verify sensor readings
- Test WiFi connection
- Monitor ThinkSpeak upload
- Check buzzer functionality

## 🚀 Deployment

### Local Development
```bash
# Terminal 1: Backend
cd backend
npm start

# Terminal 2: Frontend
cd frontend
python -m http.server 8000
```

### Production Deployment
- Deploy backend to Heroku/AWS/DigitalOcean
- Deploy frontend to GitHub Pages/Netlify/Vercel
- Use HTTPS certificates (Let's Encrypt)
- Configure domain names
- Set up monitoring/logging

See [SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for detailed deployment steps.

## 🐛 Troubleshooting

### ESP8266 Issues
- Check USB cable and port
- Install CH340 driver
- Verify baud rate (115200)
- Update WiFi credentials

### Sensor Issues
- DHT11: Verify pullup resistor
- MQ-2: Needs 24-48 hour warm-up
- Check power supply voltages

### Backend Issues
- Verify ThinkSpeak API key
- Check .env configuration
- Test Gmail app password
- Verify Twilio credentials

### Frontend Issues
- Check API URL in script.js
- Verify CORS settings
- Clear browser cache
- Check browser console for errors

See [SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for comprehensive troubleshooting.

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review serial monitor output
3. Check browser console (F12)
4. Review backend server logs
5. Verify ThinkSpeak data upload

## 📝 License

Open source project for educational and commercial mining safety applications.

## 🎓 Learning Resources

- [Arduino Documentation](https://www.arduino.cc/reference/en/)
- [ESP8266 Guide](https://github.com/esp8266/Arduino)
- [Node.js Tutorials](https://nodejs.org/en/docs/)
- [Three.js Documentation](https://threejs.org/docs/)
- [Chart.js Guide](https://www.chartjs.org/docs/latest/)

## 🏆 Best Practices

- ✅ Always test in safe environment first
- ✅ Calibrate sensors monthly
- ✅ Keep firmware updated
- ✅ Monitor email delivery
- ✅ Test alerts regularly
- ✅ Train workers on system usage
- ✅ Maintain emergency contact list
- ✅ Document all customizations

## 🚀 Future Enhancements

- [ ] Mobile app (iOS/Android)
- [ ] Multi-helmet fleet management
- [ ] Geolocation tracking
- [ ] Emergency location sharing
- [ ] Worker shift management
- [ ] Advanced ML-based anomaly detection
- [ ] Multiple backend server support
- [ ] Offline data caching
- [ ] Wearable integration
- [ ] Mining site analytics dashboard

## 🎉 Achievements

- ✅ Real-time IoT monitoring
- ✅ Intelligent multi-level alerting
- ✅ Emergency response system
- ✅ Beautiful animated UI
- ✅ Mobile-responsive design
- ✅ Production-ready code
- ✅ Comprehensive documentation
- ✅ Easy deployment

---

**Built with ❤️ for mining worker safety**

*Last Updated: May 9, 2026*
