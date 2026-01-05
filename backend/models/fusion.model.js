export function fuseEmotion(faceEmotion, hand) {
  const emotion = (faceEmotion?.emotion || "neutral").toLowerCase();
  const conf = Number(faceEmotion?.confidence ?? 0.0);

  const intensity = (hand?.intensity || "IDLE").toUpperCase();
  const level = Number(hand?.level ?? 0);
  const speed = Number(hand?.hand_speed ?? 0);

  // Basic mapping table (simple + explainable to supervisors)
  // You can adjust these easily later.
  let final_state = "Neutral";

  // HAPPY
  if (emotion === "happy") {
    if (intensity === "HIGH" || level >= 3) final_state = "Excited Happy";
    else if (intensity === "MEDIUM" || level === 2) final_state = "Engaged Happy";
    else final_state = "Calm Happy";
  }

  // ANGRY
  else if (emotion === "angry") {
    if (intensity === "HIGH" || level >= 3) final_state = "Escalated Anger";
    else if (intensity === "MEDIUM" || level === 2) final_state = "Irritated";
    else final_state = "Controlled Anger";
  }

  // SAD
  else if (emotion === "sad") {
    if (intensity === "IDLE" || level === 0) final_state = "Low Mood / Withdrawn";
    else if (intensity === "LOW" || level === 1) final_state = "Quiet Sad";
    else final_state = "Restless Sad";
  }

  // FEAR
  else if (emotion === "fear") {
    if (intensity === "HIGH" || level >= 3) final_state = "Anxious / Panic";
    else if (intensity === "MEDIUM" || level === 2) final_state = "Anxious";
    else final_state = "Mild Fear";
  }

  // DISGUST
  else if (emotion === "disgust") {
    if (intensity === "HIGH" || level >= 3) final_state = "Strong Disgust";
    else final_state = "Discomfort";
  }

  // SURPRISE
  else if (emotion === "surprise") {
    if (intensity === "HIGH" || level >= 3) final_state = "Excited Surprise";
    else final_state = "Surprised";
  }

  // NEUTRAL (or unknown)
  else {
    if (intensity === "HIGH" || level >= 3) final_state = "Restless / Hyper";
    else if (intensity === "MEDIUM" || level === 2) final_state = "Focused";
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
