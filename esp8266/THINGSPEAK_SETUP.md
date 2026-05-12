# ThingSpeak Setup Guide for ESP8266 Helmet IoT

## Step 1: Create a ThingSpeak Account

1. Go to [https://thingspeak.com](https://thingspeak.com)
2. Click **Sign Up** (top-right)
3. Enter your email and create a password
4. Verify your email and log in

---

## Step 2: Create a New Channel

1. After logging in, click **Channels** in the left menu
2. Click **New Channel**
3. Fill in the form:
   - **Name**: `Smart Helmet Monitoring` (or your preferred name)
   - **Description**: `ESP8266 sensor data: temperature, humidity, gas level`
   - **Field 1 Name**: `Temperature` (Units: °C)
   - **Field 2 Name**: `Humidity` (Units: %)
   - **Field 3 Name**: `Gas Level` (Units: ppm)
   - Leave other fields empty for now
4. Click **Save Channel**

---

## Step 3: Get Your Write API Key

1. After saving, you should see your new channel dashboard
2. Click the **API Keys** tab at the top
3. Under **Write API Key**, you'll see a long string (e.g., `WC8DXJQE1JQM3WYO`)
4. **Copy this key** — you'll need it for your sketch

You'll also see a **Channel ID** (e.g., `2834141`) — note this for reference.

---

## Step 4: Configure Your Arduino Sketch

Open `helmet_iot.ino` and replace these lines at the top:

```cpp
const char* ssid     = "YOUR_SSID";        // Your WiFi network name
const char* password = "YOUR_PASS";        // Your WiFi password
const char* apiKey   = "YOUR_WRITE_API_KEY"; // Paste your ThingSpeak Write API Key here
```

**Example:**
```cpp
const char* ssid     = "MyHomeWiFi";
const char* password = "my_secure_password_123";
const char* apiKey   = "WC8DXJQE1JQM3WYO";  // Your actual key from Step 3
```

---

## Step 5: Install Required Arduino Libraries

### For ESP8266, you need:

1. **ESP8266 Board Support**
   - In Arduino IDE: **Tools** → **Board** → **Board Manager**
   - Search for `ESP8266`
   - Install `esp8266 by ESP8266 Community`

2. **DHT Sensor Library**
   - **Sketch** → **Include Library** → **Manage Libraries**
   - Search for `DHT sensor library`
   - Install `DHT sensor library by Adafruit`

---

## Step 6: Upload to ESP8266

1. Connect your ESP8266 to your computer via USB
2. In Arduino IDE: **Tools** → **Board** → Select **NodeMCU 1.0 (ESP-12E)** (or your board model)
3. **Tools** → **Port** → Select the COM port
4. Click **Upload** (arrow button)

**Expected output:**
```
Connecting to MyHomeWiFi
...
Connected, IP: 192.168.x.x
Temp: 28.50 C  Hum: 45.32 %  Gas: 150 ppm
ThingSpeak update sent
```

---

## Step 7: View Data on ThingSpeak

1. Go back to ThingSpeak and open your channel
2. You should see **live graph data** updating every 15 seconds
3. Each field (Temperature, Humidity, Gas Level) will display on its own chart

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **"WiFi connection failed"** | Double-check SSID/password; ensure 2.4 GHz WiFi (ESP8266 doesn't support 5 GHz) |
| **"Connection to ThingSpeak failed"** | Check internet connection; verify Write API Key is correct |
| **"DHT read failed"** | Check DHT11 wiring (data pin D4, VCC, GND); try different pins |
| **"No data on ThingSpeak"** | Verify API Key is pasted correctly; check Arduino Serial Monitor for errors |

---

## Serial Monitor Debug

Open **Tools** → **Serial Monitor** (Ctrl+Shift+M) set to **115200 baud** to see:
- WiFi connection status
- Sensor readings
- ThingSpeak upload confirmations

---

## Optional: Set Up Alerts

In ThingSpeak, go to **Apps** → **React** to create automated alerts when temperature or gas levels exceed thresholds (sends email/webhook).

---

## Useful Links

- ThingSpeak API: https://www.mathworks.com/help/thingspeak/
- ESP8266 Arduino Docs: https://arduino-esp8266.readthedocs.io/
- DHT Sensor Guide: https://learn.adafruit.com/dht/overview
