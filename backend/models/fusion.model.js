export function fuseEmotion(faceEmotion, hand) {
  const emotion = (faceEmotion?.emotion || "neutral").toLowerCase();
  const conf = Number(faceEmotion?.confidence ?? 0.0);

  const intensity = (hand?.intensity || "IDLE").toUpperCase();
  const level = Number(hand?.level ?? 0);
  const speed = Number(hand?.hand_speed ?? 0);

  // Map intensity to arousal level
  // HIGH intensity = HIGH arousal
  // MEDIUM intensity = MEDIUM arousal  
  // LOW/IDLE intensity = LOW arousal
  const arousal = intensity === "HIGH" || level >= 3 ? "HIGH" :
                  intensity === "MEDIUM" || level === 2 ? "MEDIUM" : "LOW";

  let final_state = "Neutral";

  // HAPPY
  if (emotion === "happy") {
    if (arousal === "HIGH") final_state = "Excited Happy";
    else if (arousal === "MEDIUM") final_state = "Happy";  // Maintain base emotion
    else final_state = "Calm Happy";
  }

  // ANGRY
  else if (emotion === "angry") {
    if (arousal === "HIGH") final_state = "Highly Agitated Angry";
    else if (arousal === "MEDIUM") final_state = "Angry";  // Maintain base emotion
    else final_state = "Controlled Anger";
  }

  // SAD
  else if (emotion === "sad") {
    if (arousal === "HIGH") final_state = "Distressed";
    else if (arousal === "MEDIUM") final_state = "Sad";  // Maintain base emotion
    else final_state = "Low-energy Sad";
  }

  // FEAR
  else if (emotion === "fear") {
    if (arousal === "HIGH") final_state = "Panicked";
    else if (arousal === "MEDIUM") final_state = "Fear";  // Maintain base emotion
    else final_state = "Nervous";
  }

  // DISGUST
  else if (emotion === "disgust") {
    if (arousal === "HIGH") final_state = "Strong Disgust";
    else if (arousal === "MEDIUM") final_state = "Disgust";  // Maintain base emotion
    else final_state = "Mild Disgust";
  }

  // SURPRISE
  else if (emotion === "surprise") {
    if (arousal === "HIGH") final_state = "Strong Shock";
    else if (arousal === "MEDIUM") final_state = "Surprise";  // Maintain base emotion
    else final_state = "Mild Surprise";
  }

  // NEUTRAL (or unknown)
  else {
    if (arousal === "HIGH") final_state = "Hyperactive";
    else if (arousal === "MEDIUM") final_state = "Neutral";  // Maintain base emotion
    else final_state = "Calm Neutral";
  }

  // Confidence strategy: keep face confidence
  let fused_confidence = conf;

  return {
    final_state,
    components: {
      face: { emotion, confidence: conf },
      hand: { intensity, level, hand_speed: speed, arousal },
    },
    fused_confidence,
    arousal,  // Include arousal level in output
  };
}
