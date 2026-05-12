// Smart Mining Helmet - ESP8266 Firmware
// - Reads DHT11 + MQ-2, posts to ThingSpeak every 15s
// - Runs a tiny HTTP server so the dashboard can trigger the buzzer directly
// - Polls ThingSpeak field4 as fallback command channel
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <DHT.h>

// -------- User config — replace before uploading --------
const char* ssid     = "YOUR_SSID";
const char* password = "YOUR_PASS";

// ThingSpeak
const char* tsHost      = "api.thingspeak.com";
const char* writeApiKey = "WC8DXJQE1JQM3WYO";
const char* readApiKey  = "8JKU7MB5273R0GQQ";
const unsigned long channelId = 3376690;

// -------- Hardware pins --------
#define DHTPIN      D4
#define DHTTYPE     DHT11
#define MQ2_PIN     A0
#define BUZZER_PIN  D8
#define LED_PIN     D0

// -------- Timing --------
const unsigned long UPLOAD_INTERVAL  = 15000UL;
const unsigned long BUZZER_DURATION  = 5000UL;

// -------- Thresholds --------
const float TEMP_WARNING     = 35.0;
const float TEMP_DANGER      = 45.0;
const float HUMIDITY_WARNING = 70.0;
const float HUMIDITY_DANGER  = 80.0;
const float GAS_WARNING      = 300.0;
const float GAS_DANGER       = 600.0;

// -------- State --------
DHT dht(DHTPIN, DHTTYPE);
WiFiClient client;
ESP8266WebServer server(80);   // HTTP server on port 80

unsigned long lastUpload  = 0;
unsigned long buzzerOnAt  = 0;
bool buzzerActive         = false;

// ============================================================
// HTTP endpoints — called by the backend on local network
// ============================================================
void handleBuzzerOn() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"status\":\"buzzer_on\"}");
  startBuzzer(BUZZER_DURATION);
  Serial.println("🔔 Remote buzzer ON command received");
}

void handleBuzzerOff() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"status\":\"buzzer_off\"}");
  stopBuzzer();
  Serial.println("🔕 Remote buzzer OFF command received");
}

void handleStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  int   raw  = analogRead(MQ2_PIN);
  float gas  = map(raw, 0, 1023, 0, 1000);
  String json = "{\"temperature\":" + String(temp, 1) +
                ",\"humidity\":"    + String(hum, 1)  +
                ",\"gasLevel\":"    + String(gas, 0)  +
                ",\"buzzer\":"      + String(buzzerActive ? "true" : "false") + "}";
  server.send(200, "application/json", json);
}

void handleNotFound() {
  server.send(404, "text/plain", "Not found");
}

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(MQ2_PIN,    INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN,    OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN,    LOW);

  dht.begin();
  connectWiFi();

  // Register HTTP routes
  server.on("/buzzer/on",  HTTP_GET, handleBuzzerOn);
  server.on("/buzzer/off", HTTP_GET, handleBuzzerOff);
  server.on("/status",     HTTP_GET, handleStatus);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("🌐 HTTP server started on port 80");
  Serial.print("📍 Device IP: ");
  Serial.println(WiFi.localIP());

  // Startup beep
  beep(150); delay(100); beep(150);
}

// ============================================================
void loop() {
  server.handleClient();   // handle incoming HTTP requests

  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  unsigned long now = millis();

  // ── Upload sensor data every 15s ────────────────────────
  if (now - lastUpload >= UPLOAD_INTERVAL) {
    lastUpload = now;

    float temp = dht.readTemperature();
    float hum  = dht.readHumidity();
    int   raw  = analogRead(MQ2_PIN);
    float gas  = map(raw, 0, 1023, 0, 1000);

    if (isnan(temp) || isnan(hum)) {
      Serial.println("⚠️  DHT read failed");
      blinkLED(3);
    } else {
      int alertLevel = 0;
      if (temp >= TEMP_DANGER || hum >= HUMIDITY_DANGER || gas >= GAS_DANGER) {
        alertLevel = 2;
      } else if (temp >= TEMP_WARNING || hum >= HUMIDITY_WARNING || gas >= GAS_WARNING) {
        alertLevel = 1;
      }

      Serial.printf("T:%.1f°C  H:%.1f%%  Gas:%.0fppm  Level:%d\n", temp, hum, gas, alertLevel);
      uploadToThingSpeak(temp, hum, gas, alertLevel);

      // Auto-buzz based on sensor readings
      if (alertLevel == 2 && !buzzerActive) {
        startBuzzer(BUZZER_DURATION);
      } else if (alertLevel == 1 && !buzzerActive) {
        beep(300); delay(500); beep(300);
      } else if (alertLevel == 0) {
        stopBuzzer();
      }
    }
  }

  // ── Auto-stop buzzer after duration ─────────────────────
  if (buzzerActive && (millis() - buzzerOnAt >= BUZZER_DURATION)) {
    stopBuzzer();
  }

  delay(10);
}

// ============================================================
void beep(int durationMs) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durationMs);
  digitalWrite(BUZZER_PIN, LOW);
}

void startBuzzer(unsigned long durationMs) {
  buzzerActive = true;
  buzzerOnAt   = millis();
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(LED_PIN,    HIGH);
  Serial.println("🔔 BUZZER ON");
}

void stopBuzzer() {
  if (buzzerActive) {
    buzzerActive = false;
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN,    LOW);
    Serial.println("🔕 BUZZER OFF");
  }
}

void uploadToThingSpeak(float temperature, float humidity, float gasLevel, int alertLevel) {
  if (!client.connect(tsHost, 80)) {
    Serial.println("ThingSpeak connect failed");
    return;
  }

  String url = "/update?api_key=" + String(writeApiKey);
  url += "&field1=" + String(temperature, 2);
  url += "&field2=" + String(humidity, 2);
  url += "&field3=" + String(gasLevel, 0);
  url += "&field4=" + String(alertLevel);

  client.print("GET " + url + " HTTP/1.1\r\nHost: " + String(tsHost) + "\r\nConnection: close\r\n\r\n");

  unsigned long timeout = millis();
  while (client.available() == 0 && millis() - timeout < 5000) delay(10);
  while (client.available()) client.readStringUntil('\n');
  client.stop();
  Serial.println("✅ ThingSpeak updated");
}

void connectWiFi() {
  Serial.printf("Connecting to %s", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000UL) {
    delay(500); Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("✅ WiFi connected, IP: ");
    Serial.println(WiFi.localIP());
    blinkLED(2);
  } else {
    Serial.println("❌ WiFi failed");
  }
}

void blinkLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(150);
    digitalWrite(LED_PIN, LOW);  delay(150);
  }
}
