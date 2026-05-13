// ============================================================
// Smart Mining Helmet - ESP8266 Firmware v2.0
// Sensors : DHT11 (Temp/Humidity) + MQ-2 (Gas)
// Actuator: Active Buzzer on D8
// Cloud   : ThingSpeak (channel 3376690)
// HTTP    : Built-in web server for remote buzzer control
//
// Thresholds (matching project spec):
//   Temperature : Warning >35°C  | Danger >40°C
//   Humidity    : Warning >70%   | Danger >80%
//   Gas (MQ-2)  : Warning >300ppm| Danger >400ppm
// ============================================================
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <WiFiClient.h>
#include <DHT.h>

// -------- WiFi credentials — CHANGE THESE --------
const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASS";

// -------- ThingSpeak --------
const char*          TS_HOST      = "api.thingspeak.com";
const char*          TS_WRITE_KEY = "WC8DXJQE1JQM3WYO";
const unsigned long  TS_CHANNEL   = 3376690;

// -------- Hardware pins --------
#define DHT_PIN     D4
#define DHT_TYPE    DHT11
#define MQ2_PIN     A0
#define BUZZER_PIN  D8
#define LED_PIN     D0

// -------- Thresholds — LOW FOR TESTING --------
// Current readings: Temp ~32°C, Hum ~58%, Gas ~78ppm
// Raise these to real values after testing:
//   Real: TEMP_WARN=35, TEMP_DANGER=40, GAS_WARN=300, GAS_DANGER=400
#define TEMP_WARN   33.0f
#define TEMP_DANGER 34.0f
#define HUM_WARN    59.0f
#define HUM_DANGER  61.0f
#define GAS_WARN    82.0f
#define GAS_DANGER  90.0f

// -------- Timing --------
#define UPLOAD_MS   15000UL   // ThingSpeak upload every 15s (free tier min)
#define BUZZ_MS     5000UL    // Buzzer auto-off after 5s (remote trigger)

// -------- Objects --------
DHT              dht(DHT_PIN, DHT_TYPE);
WiFiClient       tsClient;
ESP8266WebServer httpServer(80);

// -------- State --------
unsigned long lastUpload  = 0;
unsigned long buzzerOnAt  = 0;
bool          buzzerOn    = false;
int           alertLevel  = 0;   // 0=normal 1=warning 2=danger

// ============================================================
// HTTP handlers — called by backend on local network
// ============================================================
void onBuzzerOn() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.send(200, "application/json", "{\"buzzer\":\"on\"}");
  buzzerTrigger(BUZZ_MS);
  Serial.println("[HTTP] Buzzer ON command received");
}

void onBuzzerOff() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.send(200, "application/json", "{\"buzzer\":\"off\"}");
  buzzerStop();
  Serial.println("[HTTP] Buzzer OFF command received");
}

void onStatus() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  float g = map(analogRead(MQ2_PIN), 0, 1023, 0, 1000);
  String json = "{\"temperature\":" + String(t, 1) +
                ",\"humidity\":"    + String(h, 1) +
                ",\"gasLevel\":"    + String(g, 0) +
                ",\"alertLevel\":"  + String(alertLevel) +
                ",\"buzzer\":"      + (buzzerOn ? "true" : "false") + "}";
  httpServer.send(200, "application/json", json);
}

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n=== Smart Mining Helmet v2.0 ===");

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN,    OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN,    LOW);

  dht.begin();
  connectWiFi();

  // Register HTTP routes
  httpServer.on("/buzzer/on",  HTTP_GET, onBuzzerOn);
  httpServer.on("/buzzer/off", HTTP_GET, onBuzzerOff);
  httpServer.on("/status",     HTTP_GET, onStatus);
  httpServer.begin();

  Serial.println("[HTTP] Server started on port 80");
  Serial.print("[NET]  Device IP: ");
  Serial.println(WiFi.localIP());

  // Startup confirmation beep
  beepPattern(2, 150, 100);
}

// ============================================================
void loop() {
  httpServer.handleClient();

  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Reconnecting...");
    connectWiFi();
  }

  // Auto-stop buzzer after duration (for remote triggers)
  if (buzzerOn && alertLevel == 0 && (millis() - buzzerOnAt >= BUZZ_MS)) {
    buzzerStop();
  }

  // Upload sensor data on interval
  if (millis() - lastUpload >= UPLOAD_MS) {
    lastUpload = millis();
    readAndUpload();
  }

  delay(10);
}

// ============================================================
// Read sensors, determine alert level, control buzzer, upload
// ============================================================
void readAndUpload() {
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  int   raw  = analogRead(MQ2_PIN);
  float gas  = (float)map(raw, 0, 1023, 0, 1000);

  // Validate DHT reading
  if (isnan(temp) || isnan(hum)) {
    Serial.println("[DHT]  Read failed — check wiring & 10kΩ pull-up on D4");
    blinkLED(3);
    // Still upload gas reading with 0 for temp/hum
    temp = 0.0f;
    hum  = 0.0f;
  }

  // ── Determine alert level ──────────────────────────────
  int newLevel = 0;
  String reason = "";

  if (temp >= TEMP_DANGER || hum >= HUM_DANGER || gas >= GAS_DANGER) {
    newLevel = 2;
    if (temp >= TEMP_DANGER) reason = "TEMP " + String(temp, 1) + "°C >= " + String(TEMP_DANGER, 0) + "°C";
    else if (gas >= GAS_DANGER) reason = "GAS "  + String(gas, 0)  + "ppm >= " + String(GAS_DANGER, 0) + "ppm";
    else reason = "HUMIDITY " + String(hum, 1) + "% >= " + String(HUM_DANGER, 0) + "%";
  } else if (temp >= TEMP_WARN || hum >= HUM_WARN || gas >= GAS_WARN) {
    newLevel = 1;
    if (temp >= TEMP_WARN) reason = "TEMP " + String(temp, 1) + "°C >= " + String(TEMP_WARN, 0) + "°C";
    else if (gas >= GAS_WARN) reason = "GAS "  + String(gas, 0)  + "ppm >= " + String(GAS_WARN, 0) + "ppm";
    else reason = "HUMIDITY " + String(hum, 1) + "% >= " + String(HUM_WARN, 0) + "%";
  }

  // ── Log to Serial ──────────────────────────────────────
  Serial.printf("[DATA] T:%.1f°C  H:%.1f%%  Gas:%.0fppm  Level:%d\n",
                temp, hum, gas, newLevel);
  if (newLevel > 0) Serial.println("[ALERT] " + reason);

  // ── Control buzzer based on alert level ───────────────
  if (newLevel == 2) {
    // DANGER: continuous buzzer until resolved
    if (!buzzerOn) {
      Serial.println("[BUZZ] DANGER — continuous buzzer ON");
      digitalWrite(BUZZER_PIN, HIGH);
      digitalWrite(LED_PIN,    HIGH);
      buzzerOn   = true;
      buzzerOnAt = millis();
    }
  } else if (newLevel == 1) {
    // WARNING: double beep every upload cycle
    Serial.println("[BUZZ] WARNING — double beep");
    beepPattern(2, 200, 200);
  } else {
    // NORMAL: stop buzzer if it was on from sensor reading
    if (buzzerOn && alertLevel > 0) {
      buzzerStop();
    }
  }

  alertLevel = newLevel;

  // ── Upload to ThingSpeak ───────────────────────────────
  uploadThingSpeak(temp, hum, gas, newLevel);
}

// ============================================================
void uploadThingSpeak(float temp, float hum, float gas, int level) {
  if (!tsClient.connect(TS_HOST, 80)) {
    Serial.println("[TS]   Connection failed");
    return;
  }

  String url = "/update?api_key=" + String(TS_WRITE_KEY);
  url += "&field1=" + String(temp, 2);
  url += "&field2=" + String(hum,  2);
  url += "&field3=" + String(gas,  0);
  url += "&field4=" + String(level);

  tsClient.print("GET " + url + " HTTP/1.1\r\nHost: " +
                 String(TS_HOST) + "\r\nConnection: close\r\n\r\n");

  unsigned long t = millis();
  while (!tsClient.available() && millis() - t < 5000) delay(10);

  String resp = "";
  while (tsClient.available()) resp = tsClient.readStringUntil('\n');
  tsClient.stop();

  Serial.println("[TS]   Entry ID: " + resp.trim());
}

// ============================================================
void buzzerTrigger(unsigned long durationMs) {
  buzzerOn   = true;
  buzzerOnAt = millis();
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(LED_PIN,    HIGH);
}

void buzzerStop() {
  buzzerOn = false;
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN,    LOW);
  Serial.println("[BUZZ] OFF");
}

void beepPattern(int count, int onMs, int offMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(onMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < count - 1) delay(offMs);
  }
}

void blinkLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(120);
    digitalWrite(LED_PIN, LOW);  delay(120);
  }
}

// ============================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000UL) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected! IP: ");
    Serial.println(WiFi.localIP());
    blinkLED(3);
  } else {
    Serial.println("[WiFi] FAILED — check SSID/password");
    blinkLED(6);
  }
}
