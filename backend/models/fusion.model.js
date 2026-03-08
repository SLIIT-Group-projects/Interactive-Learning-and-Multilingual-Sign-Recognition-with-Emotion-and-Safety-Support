export function fuseEmotion(faceEmotion, hand) {
  const emotion = (faceEmotion?.emotion || "neutral").toLowerCase();
  const conf = Number(faceEmotion?.confidence ?? 0.0);

  const intensity = (hand?.intensity || "LOW").toUpperCase();
  const level = Number(hand?.level ?? 1);
  const speed = Number(hand?.hand_speed ?? 0);

  // Behavior mapping based on emotion + hand speed intensity (arousal level)
  // HIGH arousal (intensity HIGH or level >= 3): Intensified emotions
  // MEDIUM arousal (intensity MEDIUM or level === 2): Maintain base emotion
  // LOW arousal (intensity LOW or level === 1): Subdued emotions
  let final_state = "Neutral";

  // Determine arousal level
  const isHighArousal = intensity === "HIGH" || level >= 3;
  const isMediumArousal = intensity === "MEDIUM" || level === 2;
  const isLowArousal = intensity === "LOW" || level === 1;

  // HAPPY
  if (emotion === "happy") {
    if (isHighArousal) final_state = "Excited Happy";
    else if (isMediumArousal) final_state = "Happy"; // Maintain base emotion
    else final_state = "Calm Happy";
  }

  // ANGRY
  else if (emotion === "angry") {
    if (isHighArousal) final_state = "Highly Agitated Angry";
    else if (isMediumArousal) final_state = "Angry"; // Maintain base emotion
    else final_state = "Controlled Anger";
  }

  // SAD
  else if (emotion === "sad") {
    if (isHighArousal) final_state = "Distressed";
    else if (isMediumArousal) final_state = "Sad"; // Maintain base emotion
    else final_state = "Low-energy Sad";
  }

  // FEAR
  else if (emotion === "fear") {
    if (isHighArousal) final_state = "Panicked";
    else if (isMediumArousal) final_state = "Fear"; // Maintain base emotion
    else final_state = "Nervous";
  }

  // DISGUST
  else if (emotion === "disgust") {
    if (isHighArousal) final_state = "Strong Disgust";
    else if (isMediumArousal) final_state = "Disgust"; // Maintain base emotion
    else final_state = "Mild Disgust";
  }

  // SURPRISE
  else if (emotion === "surprise") {
    if (isHighArousal) final_state = "Strong Shock";
    else if (isMediumArousal) final_state = "Surprise"; // Maintain base emotion
    else final_state = "Mild Surprise";
  }

  // NEUTRAL (or unknown)
  else {
    if (isHighArousal) final_state = "Hyperactive";
    else if (isMediumArousal) final_state = "Neutral"; // Maintain base emotion
    else final_state = "Calm Neutral";
  }

  // Confidence strategy:
  // - keep face confidence
  // - boost slightly if intensity matches expectation (optional)
  let fused_confidence = conf;
  if ((emotion === "happy" && level >= 2) || (emotion === "sad" && level <= 1)) {
    fused_confidence = Math.min(1.0, conf + 0.05);
  }

  return {
    final_state,
    components: {
      face: { emotion, confidence: conf },
      hand: { intensity, level, hand_speed: speed },
    },
    fused_confidence,
  };
}
