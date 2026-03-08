# Hand Speed Thresholds for Children - Calibration Guide

## Overview
This document explains the hand speed thresholds calibrated specifically for children (ages 4-12) in sign language learning and gesture-based games.

## Current Thresholds (Calibrated for Children)

| Intensity Level | Speed Range (px/s) | Level | Description |
|----------------|-------------------|-------|-------------|
| **LOW** | 0 - 40 | 1 | Calm, careful movements, learning signs, low engagement |
| **MEDIUM** | 40 - 100 | 2 | Normal play, engaged but controlled, moderate engagement |
| **HIGH** | 100+ | 3 | Excited play, rapid gestures, enthusiastic, high engagement |

## Rationale

### Why Lower Thresholds for Children?

1. **Physical Development**: Children have smaller hands and shorter arm reach, resulting in naturally slower absolute speeds compared to adults.

2. **Learning Context**: During sign language learning and gesture games:
   - Children move more deliberately when learning new signs
   - They need time to form correct hand shapes and movements
   - Speed increases as confidence and engagement grow

3. **Typical Movement Patterns**:
   - **Calm/Learning (LOW)**: 15-40 px/s
     - Careful, deliberate movements
     - Learning new signs
     - Low engagement or concentration
   
   - **Engaged Play (MEDIUM)**: 40-100 px/s
     - Normal interactive play
     - Confident sign execution
     - Moderate engagement and enjoyment
   
   - **Excited/Enthusiastic (HIGH)**: 100+ px/s
     - Rapid, enthusiastic gestures
     - High engagement and excitement
     - Energetic play

### Comparison with Adult Thresholds

**Previous (Adult-oriented) Thresholds:**
- LOW: < 60 px/s
- MEDIUM: 60-200 px/s
- HIGH: 200+ px/s

**New (Child-calibrated) Thresholds:**
- LOW: < 40 px/s (33% lower)
- MEDIUM: 40-100 px/s (50% lower range)
- HIGH: 100+ px/s (50% lower)

### Research Basis

Based on observations and studies of:
- Children's motor development patterns
- Sign language learning in children
- Gesture-based interactive games
- Typical engagement levels during educational play

## Integration with Emotion Detection

The speed thresholds directly map to engagement levels:
- **LOW speed** → **LOW engagement** → Subdued emotions (Calm Happy, Controlled Anger, etc.)
- **MEDIUM speed** → **MEDIUM engagement** → Base emotions (Happy, Angry, Sad, etc.)
- **HIGH speed** → **HIGH engagement** → Intensified emotions (Excited Happy, Highly Agitated Angry, etc.)

## Usage in Sign Language Games

When children play sign language games:
1. **Learning Phase**: Typically LOW speed (careful movements)
2. **Practice Phase**: MEDIUM speed (confident but controlled)
3. **Excited Play**: HIGH speed (enthusiastic, rapid gestures)

Parents can monitor:
- **Emotion** (from face detection): How the child feels
- **Speed/Engagement** (from hand movement): How actively engaged they are
- **Behavior** (combined): Overall state (e.g., "Excited Happy" = Happy emotion + HIGH engagement)

## Adjusting Thresholds

If you find the thresholds need adjustment based on your specific use case:

1. **Too sensitive (too many HIGH)**: Increase thresholds
   - LOW: < 50 px/s
   - MEDIUM: 50-120 px/s
   - HIGH: 120+ px/s

2. **Not sensitive enough (too many LOW)**: Decrease thresholds
   - LOW: < 30 px/s
   - MEDIUM: 30-80 px/s
   - HIGH: 80+ px/s

3. **Age-specific adjustments**:
   - **Younger children (4-6)**: Lower thresholds by 20%
   - **Older children (10-12)**: Can use slightly higher thresholds

## Notes

- Thresholds are in pixels per second (px/s)
- Values depend on camera resolution and distance
- These thresholds work best with standard webcam/camera setups (640x480 to 1920x1080)
- For different camera setups, you may need to calibrate based on observed behavior
