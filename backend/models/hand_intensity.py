# backend/models/hand_intensity.py
import json
import sys
import random

"""
This script simulates hand movement intensity.
Later you can replace this logic with real landmark input.
"""

def get_intensity(speed):
    if speed < 60:
        return "IDLE", 0
    elif speed < 200:
        return "LOW", 1
    elif speed < 400:
        return "MEDIUM", 2
    else:
        return "HIGH", 3

# Simulated speed (for now)
speed = random.uniform(0, 500)

label, level = get_intensity(speed)

output = {
    "hand_speed": round(speed, 2),
    "intensity": label,
    "level": level
}

print(json.dumps(output))
