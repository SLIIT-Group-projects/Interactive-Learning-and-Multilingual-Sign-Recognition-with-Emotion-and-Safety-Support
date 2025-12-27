// app/story/[id].tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

// ✅ Change this import path if your STORIES file is elsewhere
import { STORIES } from "../../data/stories";

function formatSeconds(total: number) {
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

export default function StoryReaderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const story = useMemo(() => {
    const sid = params?.id ? String(params.id) : "";
    return STORIES.find((s: any) => String(s.id) === sid) ?? STORIES?.[0];
  }, [params?.id]);

  // session timer
  const [sessionActive, setSessionActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // camera permissions + show/hide overlay
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(true);

  // ✅ These will come from backend later
  const [finalEmotion, setFinalEmotion] = useState<string | null>(null);
  const [finalIntensity, setFinalIntensity] = useState<string | null>(null);

  const [summaryVisible, setSummaryVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (sessionActive) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [sessionActive]);

  const startSession = () => {
    setSeconds(0);
    setSessionActive(true);

    // reset outputs for new session
    setFinalEmotion(null);
    setFinalIntensity(null);
  };

  const finishSession = () => {
    setSessionActive(false);

    // ✅ Later: call backend here to compute finalEmotion/finalIntensity for the session
    // Example:
    // const res = await api.getSessionSummary()
    // setFinalEmotion(res.emotion)
    // setFinalIntensity(res.intensity)

    setSummaryVisible(true);
  };

  const ensureCameraPermission = async () => {
    if (permission?.granted) return true;
    const res = await requestPermission();
    return !!res?.granted;
  };

  const onToggleCamera = async () => {
    if (!cameraOn) {
      const ok = await ensureCameraPermission();
      if (!ok) return;
    }
    setCameraOn((v) => !v);
  };

  const CamStatus = () => {
    if (!cameraOn) return <Text style={styles.camHint}>Camera: OFF</Text>;
    if (!permission) return <Text style={styles.camHint}>Camera: checking…</Text>;
    if (permission.granted) return <Text style={styles.camHint}>Camera: ON</Text>;
    return (
      <Text style={[styles.camHint, { color: "#FF4AB3" }]}>
        Camera permission needed
      </Text>
    );
  };

  if (!story) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>No stories found.</Text>
          <Text style={{ marginTop: 8, color: "#666" }}>
            Check your STORIES import path and data file.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <View style={styles.hero}>
            <View style={[styles.heroThumb, { backgroundColor: story.coverColor }]}>
              <Text style={styles.heroEmoji}>{story.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={2}>{story.title}</Text>
              <Text style={styles.headerSubSmall}>{story.level} • {story.timeMin} min</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity onPress={onToggleCamera} style={styles.camToggle}>
          <Text style={styles.camToggleText}>{cameraOn ? "Hide Cam" : "Show Cam"}</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.storyTextLarge}>{story.storyText}</Text>
          {!!story.moral && <Text style={styles.moral}>Moral: {story.moral}</Text>}

          {/* Session Controls */}
          <View style={styles.sessionRow}>
            <TouchableOpacity
              onPress={sessionActive ? finishSession : startSession}
              style={[styles.primaryBtn, sessionActive && styles.finishBtn]}
            >
              <Text style={styles.primaryBtnText}>
                {sessionActive ? "Finish Session" : "Start Reading Session"}
              </Text>
            </TouchableOpacity>

            <View style={[styles.pill, sessionActive && styles.pillActive]}>
              <Text style={styles.pillText}>
                {sessionActive ? `Active (${formatSeconds(seconds)})` : "Inactive"}
              </Text>
            </View>
          </View>

          {/* ✅ Placeholder output card (no manual panel) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Session Output (From Backend)</Text>

            <Text style={styles.kvText}>
              Final Emotion:{" "}
              <Text style={styles.kvStrong}>{finalEmotion ?? "—"}</Text>
            </Text>

            <Text style={styles.kvText}>
              Final Intensity:{" "}
              <Text style={styles.kvStrong}>{finalIntensity ?? "—"}</Text>
            </Text>

            <Text style={styles.note}>
              These values will be filled after you connect the backend (camera → model → result).
            </Text>
          </View>
        </ScrollView>

        {/* Camera Overlay */}
        {cameraOn && (
          <View style={styles.camBox}>
            <CamStatus />

            {!permission?.granted ? (
              <TouchableOpacity
                style={[styles.primaryBtn, { paddingVertical: 8, paddingHorizontal: 10 }]}
                onPress={ensureCameraPermission}
              >
                <Text style={styles.primaryBtnText}>Allow Camera</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.camPreview}>
                <CameraView style={{ flex: 1 }} facing="front" />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Summary Modal */}
      <Modal visible={summaryVisible} animationType="slide" transparent>
        <View style={styles.modalBackground}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Session Summary</Text>
            <Text style={styles.modalText}>Story: {story.title}</Text>
            <Text style={styles.modalText}>Duration: {formatSeconds(seconds)}</Text>
            <Text style={styles.modalText}>Final Emotion: {finalEmotion ?? "—"}</Text>
            <Text style={styles.modalText}>Final Intensity: {finalIntensity ?? "—"}</Text>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSummaryVisible(false)}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7FEFF" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 0.5,
    borderColor: "#EAEAEA",
    backgroundColor: "#FFFFFF",
  },
  backBtn: { paddingVertical: 8, paddingHorizontal: 10, marginRight: 8 },
  backText: { color: "#07BDD6", fontWeight: "800" },

  headerTitle: { fontSize: 18, fontWeight: "900", color: "#212121" },
  headerSub: { marginTop: 2, fontSize: 12, color: "#666" },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  heroThumb: { width: 84, height: 84, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 40 },
  headerSubSmall: { color: '#666', fontSize: 12, marginTop: 6 },

  camToggle: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#E6F9FC",
    marginLeft: 10,
  },
  camToggleText: { fontWeight: "800", color: "#07BDD6" },

  content: { padding: 16, paddingBottom: 220 },

  storyText: { fontSize: 18, lineHeight: 28, color: "#212121" },
  storyTextLarge: { fontSize: 20, lineHeight: 30, color: '#212121' },
  moral: { marginTop: 12, fontWeight: "800", color: "#444" },

  sessionRow: { flexDirection: "row", alignItems: "center", marginTop: 14, flexWrap: "wrap" },
  primaryBtn: {
    backgroundColor: "#07BDD6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  finishBtn: { backgroundColor: "#FF4AB3" },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "900" },

  pill: {
    marginLeft: 10,
    marginTop: 10,
    backgroundColor: "#EEEEEE",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillActive: { backgroundColor: "#D1EC3F" },
  pillText: { fontWeight: "800", color: "#212121" },

  card: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#212121", marginBottom: 10 },

  kvText: { marginTop: 6, color: "#333", fontWeight: "800" },
  kvStrong: { color: "#07BDD6", fontWeight: "900" },

  note: { marginTop: 10, color: "#666", lineHeight: 20, fontWeight: "600" },

  camBox: {
    position: "absolute",
    left: 12,
    bottom: 12,
    width: 150,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    zIndex: 50,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  camHint: { fontSize: 12, fontWeight: "900", color: "#07BDD6", marginBottom: 8 },
  camPreview: {
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },

  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: { width: "85%", backgroundColor: "#fff", padding: 20, borderRadius: 14 },
  modalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10, color: "#212121" },
  modalText: { marginBottom: 6, fontWeight: "700", color: "#333" },
  closeBtn: {
    marginTop: 12,
    backgroundColor: "#07BDD6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-end",
  },
});
