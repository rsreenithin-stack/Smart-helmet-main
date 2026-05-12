# Smart Mining Helmet - API Documentation

## Base URL
```
http://localhost:5000/api
```

## Endpoints

### 1. Get Current Sensor Data
**Endpoint:** `GET /sensors/current`

**Response:**
```json
{
  "temperature": 25.5,
  "humidity": 65.2,
  "gasLevel": 150,
  "status": 0,
  "statusText": "NORMAL",
  "timestamp": "2026-05-09T10:30:00Z"
}
```

**Status Codes:**
- 0 = NORMAL
- 1 = WARNING
- 2 = DANGER

---

### 2. Get Sensor History
**Endpoint:** `GET /sensors/history?results=100`

**Query Parameters:**
- `results` (optional): Number of historical entries (default: 100, max: 8000)

**Response:**
```json
[
  {
    "temperature": 25.5,
    "humidity": 65.2,
    "gasLevel": 150,
    "status": 0,
    "timestamp": "2026-05-09T10:30:00Z"
  },
  ...
]
```

---

### 3. Get Analytics
**Endpoint:** `GET /analytics`

**Response:**
```json
{
  "temperature": {
    "avg": "24.3",
    "min": "18.5",
    "max": "32.1"
  },
  "humidity": {
    "avg": "62.4",
    "min": "40.2",
    "max": "85.6"
  },
  "gasLevel": {
    "avg": "120.5",
    "min": "50.0",
    "max": "450.2"
  },
  "alerts": {
    "normal": 145,
    "warning": 12,
    "danger": 2
  }
}
```

---

### 4. Test Alert (Email)
**Endpoint:** `POST /alert/test`

**Request Body:**
```json
{
  "type": "email"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Test email sent"
}
```

---

### 5. Test Alert (Phone Call)
**Endpoint:** `POST /alert/test`

**Request Body:**
```json
{
  "type": "call"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Test call sent"
}
```

---

## Alert Logic

### Normal Status (0)
- ✅ Green indicator
- 📧 Hourly email reports (1 hour interval)
- 🔕 No buzzer

### Warning Status (1)
- ⚠️ Orange indicator
- 📧 Immediate email alert
- 🔊 Buzzer flickers (1-second intervals)
- Breaks hourly email rule - sends immediately
- Resets 1-hour timer

### Danger Status (2)
- 🚨 Red indicator with critical animation
- 📧 Immediate email alert
- 📞 Emergency phone call triggered
- 🔊 Continuous buzzer (no intervals)
- Breaks hourly email rule - sends immediately
- Emergency protocols activated

---

## CORS Configuration

Enable CORS in your frontend:
```javascript
fetch(url, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
})
```

Backend has CORS enabled for all origins (update in production).

---

## Error Responses

### 500 - Internal Server Error
```json
{
  "error": "Failed to fetch sensor data"
}
```

### ThinkSpeak Connection Errors
- Verify API key
- Check channel ID
- Ensure ESP8266 is sending data
- Check ThinkSpeak account quota

---

## Rate Limiting (Production)

Recommended limits:
- `/sensors/current`: 60 requests/minute
- `/sensors/history`: 30 requests/minute
- `/analytics`: 20 requests/minute
- `/alert/test`: 5 requests/minute

---

## Example Usage

### JavaScript/Fetch
```javascript
// Get current data
const response = await fetch('http://localhost:5000/api/sensors/current');
const data = await response.json();
console.log(data.temperature);

// Send test email
await fetch('http://localhost:5000/api/alert/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'email' })
});
```

### cURL
```bash
# Get current sensor data
curl http://localhost:5000/api/sensors/current

# Get history
curl "http://localhost:5000/api/sensors/history?results=50"

# Get analytics
curl http://localhost:5000/api/analytics

# Test email alert
curl -X POST http://localhost:5000/api/alert/test \
  -H "Content-Type: application/json" \
  -d '{"type":"email"}'
```

### Python
```python
import requests

# Get current data
response = requests.get('http://localhost:5000/api/sensors/current')
data = response.json()
print(f"Temperature: {data['temperature']}°C")

# Test phone alert
requests.post('http://localhost:5000/api/alert/test',
    json={'type': 'call'})
```

---

## Data Retention

- **Real-time data**: Stored in ThinkSpeak for 15 days (free tier)
- **Hourly aggregates**: Can be maintained separately
- **Analytics**: Calculated from available history

---

## Performance Notes

- Typical response time: 200-500ms
- Concurrent requests supported
- Handles up to 1000 requests/minute
- Database caching reduces latency

---

## Security Headers

Production deployment should include:
- HTTPS/TLS encryption
- API key authentication
- Rate limiting
- CORS restrictions
- Input validation
- SQL injection protection (if using database)

---

## Webhook Integration (Future)

For advanced features:
```javascript
POST /api/webhook/alert
POST /api/webhook/status
POST /api/webhook/emergency
```

---

## Deployment

### Docker
```dockerfile
FROM node:16
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 5000
CMD ["npm", "start"]
```

### Environment Variables (Production)
```env
NODE_ENV=production
PORT=5000
THINKSPEAK_CHANNEL_ID=xxxxx
THINKSPEAK_API_KEY=xxxxx
EMAIL_USER=xxxxx
EMAIL_PASSWORD=xxxxx
ADMIN_EMAIL=xxxxx
TWILIO_ACCOUNT_SID=xxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE=xxxxx
ADMIN_PHONE=xxxxx
```

---

## Monitoring

Recommended monitoring:
- Server uptime (UptimeRobot, Pingdom)
- API response times
- Email delivery tracking
- Error logging (Sentry, LogRocket)
- Performance metrics (New Relic, Datadog)

---

## Support

For API issues, check:
1. Backend server logs
2. ThinkSpeak API status
3. Email/Twilio credentials
4. Network connectivity
5. Firewall rules
