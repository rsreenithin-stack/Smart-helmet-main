# Arduino Libraries Reference

Required libraries for ESP8266 Smart Helmet project.

## Library Installation Guide

### Method 1: Arduino IDE Library Manager (Recommended)

1. Open Arduino IDE
2. Go to: **Sketch** → **Include Library** → **Manage Libraries**
3. Search for each library and click **Install**

### Method 2: Manual Installation

1. Download .zip file from library repository
2. Extract to: `Documents/Arduino/libraries/`
3. Restart Arduino IDE

---

## Required Libraries

### 1. **ESP8266WiFi** (Built-in)
- **Included with**: ESP8266 Board Package
- **Purpose**: WiFi connectivity
- **No installation needed**

### 2. **DHT Sensor Library**
- **Author**: Adafruit
- **Version**: 1.4.3 or higher
- **Purpose**: DHT11 temperature & humidity sensor
- **Link**: https://github.com/adafruit/DHT-sensor-library

**Installation:**
```
Search: "DHT" or "DHT sensor"
Author: Adafruit
Click Install
```

**Usage:**
```cpp
#include <DHT.h>

DHT dht(4, DHT11); // pin 4, DHT11 sensor
dht.begin();

float temp = dht.readTemperature();
float humidity = dht.readHumidity();
```

### 3. **Adafruit Unified Sensor Library**
- **Author**: Adafruit
- **Version**: 1.1.5 or higher
- **Purpose**: Base library for Adafruit sensors
- **Link**: https://github.com/adafruit/Adafruit_Sensor

**Installation:**
```
Search: "Adafruit Unified Sensor"
Author: Adafruit
Click Install
```

### 4. **ESP8266 Board Package**
- **Version**: 3.0.0 or higher
- **Purpose**: ESP8266 board support
- **Link**: http://arduino.esp8266.com

**Installation Steps:**
1. Go to: **File** → **Preferences**
2. Add to "Additional Boards Manager URLs":
   ```
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. Go to: **Tools** → **Board** → **Boards Manager**
4. Search for "esp8266"
5. Click Install (latest version)

---

## Optional Libraries

### For Advanced Features

#### 1. **AsyncElegantOTA**
- **Purpose**: Over-the-air firmware updates
- **Installation**: Library Manager search "AsyncElegantOTA"

#### 2. **Time & NTP**
- **Purpose**: Accurate timekeeping
- **Included**: Built into ESP8266 core

#### 3. **ArduinoJSON**
- **Purpose**: JSON parsing (if needed)
- **Installation**: Library Manager search "ArduinoJson"

#### 4. **PubSubClient**
- **Purpose**: MQTT support (alternative to ThinkSpeak)
- **Installation**: Library Manager search "PubSubClient"

---

## Verification

After installation, verify libraries are working:

1. Open Arduino IDE
2. Go to: **File** → **Examples**
3. Look for examples from installed libraries:
   - Adafruit → DHT
   - ESP8266WiFi → WiFiScan
   - ESP8266 → Blink (built-in)

4. Open **DHT → DHTtester** example
5. Verify sketch loads without errors

---

## Common Issues

### Library Not Found Error

**Problem:** "fatal error: DHT.h: No such file or directory"

**Solutions:**
1. Verify library is installed (Manage Libraries)
2. Restart Arduino IDE
3. Reinstall library:
   - Remove from: `Documents/Arduino/libraries/DHT-sensor-library/`
   - Reinstall via Library Manager
4. Check WiFi board is selected: Tools → Board

### Compilation Errors

**Problem:** Conflicts between library versions

**Solution:**
1. Go to: **Sketch** → **Include Library** → **Manage Libraries**
2. Find conflicting library
3. Click dropdown for version selection
4. Select compatible version (usually latest)
5. Click Install

### DHT Sensor Not Reading

**Problem:** Reading returns NaN (Not a Number)

**Solutions:**
1. Check DHT11 wiring:
   - VCC → 3.3V
   - GND → GND
   - DATA → D4
   - Add 10kΩ pullup resistor

2. Verify DHT library is correct version (1.4.3+)
3. Try different GPIO pin in code
4. Check sensor is not damaged
5. Add delay(2000) after initialization

---

## Library Summary Table

| Library | Author | Version | Purpose | Required |
|---------|--------|---------|---------|----------|
| DHT Sensor Library | Adafruit | 1.4.3+ | DHT11 sensor | ✅ Yes |
| Adafruit Unified Sensor | Adafruit | 1.1.5+ | Sensor base | ✅ Yes |
| ESP8266WiFi | ESP8266 Community | 3.0.0+ | WiFi support | ✅ Yes |
| AsyncElegantOTA | Ayusman Biswas | Latest | OTA updates | ⭕ Optional |
| ArduinoJson | Benoit Blanchon | Latest | JSON parsing | ⭕ Optional |
| PubSubClient | Nick O'Leary | Latest | MQTT protocol | ⭕ Optional |

---

## Testing Library Installation

### Test Code
```cpp
#include <ESP8266WiFi.h>
#include <DHT.h>

DHT dht(D4, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
  Serial.println("Libraries loaded successfully!");
}

void loop() {
  float temp = dht.readTemperature();
  Serial.println(temp);
  delay(2000);
}
```

If this compiles without errors, all libraries are installed correctly.

---

## Dependency Resolution

**DHT Library Dependencies:**
- Adafruit Unified Sensor (auto-installed)
- Wire.h (built-in)
- SPI.h (built-in)

**ESP8266WiFi Dependencies:**
- Built-in modules
- No additional installation needed

---

## Update Check

To check for library updates:

1. Go to: **Sketch** → **Include Library** → **Manage Libraries**
2. Look for libraries with **"Update available"** button
3. Click Update for latest version
4. Restart Arduino IDE

---

## Troubleshooting Command Line

If using Arduino CLI:

```bash
# Install libraries
arduino-cli lib install "DHT sensor library"
arduino-cli lib install "Adafruit Unified Sensor"

# Update libraries
arduino-cli lib update-all

# List installed libraries
arduino-cli lib list
```

---

## Additional Resources

- **Adafruit DHT Library**: https://github.com/adafruit/DHT-sensor-library
- **ESP8266 Arduino Core**: https://github.com/esp8266/Arduino
- **Arduino Library Reference**: https://www.arduino.cc/en/reference/libraries
- **Troubleshooting Guide**: https://www.arduino.cc/en/guide/libraries

---

## Notes

- All libraries are **open source** and free
- **No commercial licenses** required
- Libraries are actively maintained
- Check GitHub repositories for latest updates
- Community support available on Arduino forum

---

**Last Updated:** May 9, 2026
