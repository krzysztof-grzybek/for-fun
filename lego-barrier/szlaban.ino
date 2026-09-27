#include <Servo.h>

const int SERVO_PIN = D1;
const int BUTTON_PIN = D2;

Servo servo;

bool barrierOpen = false;
bool previousButtonState = HIGH;

unsigned long openedAt = 0;

const unsigned long OPEN_TIME = 5000; // 5 sekund

void setup() {
  Serial.begin(115200);
  servo.attach(SERVO_PIN);

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  servo.write(0);
  bool buttonState = digitalRead(BUTTON_PIN);
}

void loop() {
  bool buttonState = digitalRead(BUTTON_PIN);

  // Wykrycie nowego naciśnięcia:
  // przycisk był puszczony, a teraz jest wciśnięty
  if (previousButtonState == HIGH && buttonState == LOW) {
    Serial.println("button pressed");

    servo.write(90);

    barrierOpen = true;

    // Rozpocznij / zrestartuj odliczanie
    openedAt = millis();
  }

  previousButtonState = buttonState;

  // Czy minęło 5 sekund od ostatniego naciśnięcia?
  if (barrierOpen && millis() - openedAt >= OPEN_TIME) {
    Serial.println("closing");

    servo.write(0);

    barrierOpen = false;
  }
}
