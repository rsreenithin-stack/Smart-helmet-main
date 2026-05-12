// Minimal ESP8266 sketch: read DHT11 + MQ-2 and post to ThingSpeak
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <DHT.h>

// -------- User config - replace these before uploading --------
const char* ssid     = "YOUR_SSID";
const char* password = "YOUR_PASS";
const char* host     = "api.thingspeak.com";
const char* apiKey   = "8JKU7MB5273R0GQQ";  // Channel 3376690

// -------- Hardware pins --------
#define DHTPIN   D4
#define DHTTYPE  DHT11
#define MQ2_PIN  A0
#define BUZZER_PIN D8
#define LED_PIN D0

// -------- Objects & globals --------
DHT dht(DHTPIN, DHTTYPE);
WiFiClient client;

const unsigned long UPDATE_INTERVAL = 15000UL; // 15s
unsigned long lastUpdate = 0;

void setup() {
  Serial.begin(115200);
  delay(50);

  pinMode(MQ2_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  dht.begin();
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  if (millis() - lastUpdate >= UPDATE_INTERVAL) {
    lastUpdate = millis();

    float temp = dht.readTemperature();
    float hum  = dht.readHumidity();
    int raw = analogRead(MQ2_PIN);
    float gas = map(raw, 0, 1023, 0, 1000); // approximate

    if (isnan(temp) || isnan(hum)) {
      Serial.println("DHT read failed");
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
    } else {
      Serial.printf("Temp: %.2f C  Hum: %.2f %%  Gas: %.0f ppm\n", temp, hum, gas);
      sendToThingSpeak(temp, hum, gas);
    }
  }

  delay(100);
}

void connectWiFi() {
  Serial.printf("Connecting to %s\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000UL) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected, IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
  } else {
    Serial.println("WiFi connection failed");
  }
}

void sendToThingSpeak(float temperature, float humidity, float gasLevel) {
  if (!client.connect(host, 80)) {
    Serial.println("Connection to ThingSpeak failed");
    client.stop();
    return;
  }

  String url = "/update?api_key=" + String(apiKey);
  url += "&field1=" + String(temperature, 2);
  url += "&field2=" + String(humidity, 2);
  url += "&field3=" + String(gasLevel, 0);

  client.print(String("GET ") + url + " HTTP/1.1\r\n" +
               "Host: " + host + "\r\n" +
               "Connection: close\r\n\r\n");

  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 5000) {
      Serial.println(">>> Client Timeout !");
      client.stop();
      return;
    }
  }

  while (client.available()) {
    String line = client.readStringUntil('\n');
    Serial.println(line);
  }
  client.stop();
  Serial.println("ThingSpeak update sent");
}

