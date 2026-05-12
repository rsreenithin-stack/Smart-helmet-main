# Smart Mining Helmet - Quick Reference

## 🚀 30-Second Setup

### 1. Hardware
```
DHT11:   VCC→3V,   GND→GND,  DATA→D4
MQ-2:    VCC→5V,   GND→GND,  A0→A0
Buzzer:  (+)→D8,   (-)→GND
```

### 2. Arduino Code
- Update WiFi: `ssid`, `password`
- Update ThinkSpeak: `apiKey`, `channelID`
- Upload to ESP8266

### 3. Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm start
```

### 4. Frontend
```bash
cd frontend
python -m http.server 8000
# Open http://localhost:8000
```

---

## 🔑 Key Credentials to Setup

| Service | What | Where to Get |
|---------|------|------|
| **WiFi** | SSID & Password | Your router |
| **ThinkSpeak** | Channel ID & API Key | thingspeak.com |
| **Gmail** | Email & App Password | myaccount.google.com/apppasswords |
| **Twilio** | Account SID, Auth Token, Phone | twilio.com (optional) |

---

## 📊 Default Alert Thresholds

| Condition | Normal | Warning | Danger |
|-----------|--------|---------|--------|
| **Temperature** | 0-40°C | 40-50°C | >50°C or <0°C |
| **Humidity** | 20-80% | 80-95% | >95% or <10% |
| **Gas (ppm)** | 0-400 | 400-800 | >800 |

---

## 🧪 Testing Checklist

- [ ] DHT11 reads correct temperature/humidity
- [ ] MQ-2 reads gas levels (varies with environment)
- [ ] Buzzer sounds when status changes
- [ ] Data appears on ThinkSpeak within 15 seconds
- [ ] Website loads and shows real data
- [ ] Email alert works (click "Test Email Alert")
- [ ] Phone alert works (click "Test Phone Alert")
- [ ] Charts update with historical data
- [ ] Mobile view is responsive
- [ ] Alerts trigger at correct thresholds

---

## 📱 Dashboard URLs

| Component | URL |
|-----------|-----|
| **Frontend** | http://localhost:8000 |
| **Backend API** | http://localhost:5000/api |
| **ThinkSpeak** | https://thingspeak.com/channels/{CHANNEL_ID} |
| **Twilio** | https://www.twilio.com/console |

---

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| ESP8266 won't upload | Check USB port, install CH340 driver, baud rate 115200 |
| DHT reads "nan" | Check pullup resistor, verify wiring to D4 |
| No data on website | Check API URL in script.js, verify backend is running |
| Emails not sending | Verify app password, enable 2FA on Gmail |
| Buzzer not working | Check D8 pin, verify 5V power to buzzer |
| MQ-2 stuck at high values | Needs 24-48 hour warm-up period |

---

## 📁 Important Files

```
ESP8266 Code:
├── esp8266/helmet_iot.ino

Backend:
├── backend/server.js (Main server)
├── backend/.env (Credentials)
├── backend/package.json (Dependencies)

Frontend:
├── frontend/index.html (Dashboard)
├── frontend/styles.css (Styling)
├── frontend/script.js (Logic)

Documentation:
├── README.md (Overview)
├── docs/SETUP_GUIDE.md (Installation)
├── docs/API_DOCUMENTATION.md (API Reference)
├── docs/LIBRARIES_REFERENCE.md (Arduino libraries)
```

---

## 🚨 Alert Flow Diagram

```
Sensor Readings
       ↓
ESP8266 Processing
       ↓
Determine Status (Normal/Warning/Danger)
       ↓
Activate Buzzer (if needed)
       ↓
Send to ThinkSpeak
       ↓
Backend Receives Data
       ↓
Check Alert Logic
       ├→ NORMAL: Hourly email
       ├→ WARNING: Immediate email + break hourly rule
       └→ DANGER: Immediate email + phone call
       ↓
Frontend Displays
       ├→ Real-time gauge updates
       ├→ Status indicator change
       ├→ Alert banner display
       └→ Data log entry
```

---

## 💡 Pro Tips

1. **Calibration**: Let MQ-2 warm up 24-48 hours before full deployment
2. **Testing**: Use test buttons before relying on real alerts
3. **Mobile**: Responsive design works on all screen sizes
4. **Security**: Never commit `.env` to git
5. **Monitoring**: Check server logs regularly for errors
6. **Updates**: Keep libraries and dependencies current
7. **Backups**: Backup ThinkSpeak data regularly
8. **Training**: Train workers on system usage and alerts

---

## 📞 Emergency Procedures

When **DANGER** alert triggers:
1. ✅ Buzzer sounds continuously
2. ✅ Dashboard shows red CRITICAL alert
3. ✅ Emergency phone call sent to admin
4. ✅ Email alert sent immediately
5. ✅ All protocols activated
6. ✅ Recommend immediate evacuation

---

## 🎯 Next Steps After Setup

1. ✅ Complete hardware assembly
2. ✅ Upload ESP8266 code
3. ✅ Test all sensors
4. ✅ Configure backend & frontend
5. ✅ Test all alert systems
6. ✅ Calibrate thresholds for your environment
7. ✅ Train mining workers
8. ✅ Deploy to production
9. ✅ Monitor for 24 hours
10. ✅ Establish emergency procedures

---

## 🌟 Features Summary

✨ **What Makes This Special:**
- Real-time 3D helmet visualization
- Beautiful animated dashboard
- Intelligent multi-level alerting
- Emergency phone notifications
- Automatic hourly reports
- Historical analytics
- Mobile responsive
- Production ready
- Fully documented
- Easy to customize

---

## 📚 Documentation

Full documentation available in `docs/`:
- **SETUP_GUIDE.md**: Step-by-step installation (very detailed)
- **API_DOCUMENTATION.md**: Backend API reference
- **LIBRARIES_REFERENCE.md**: Arduino library guide
- **README.md**: Project overview

---

## 🆘 Need Help?

1. Check SETUP_GUIDE.md for detailed instructions
2. Review API_DOCUMENTATION.md for API details
3. Check troubleshooting section in README.md
4. Review Arduino serial monitor output
5. Check browser console (F12) for errors
6. Check backend server logs

---

**Version**: 1.0.0
**Last Updated**: May 9, 2026
**Status**: ✅ Production Ready
