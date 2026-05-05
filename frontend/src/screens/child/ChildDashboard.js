import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MaterialIcons,
  Ionicons,
  FontAwesome5,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../contexts/AuthContext";
import { logoutUser } from "../../services/auth/authService";
import { getChildAnalytics } from "../../services/firestore/gameService";

const { width, height } = Dimensions.get("window");
const CARD_WIDTH = (width - 60) / 2;

const ChildDashboard = ({ navigation }) => {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  const totalLetters = 26;
  const childName = userData?.name || "Friend";

  // Calculate stats
  const lettersLearned =
    analytics?.letterPerformance?.filter(
      (lp) => lp.attempts > 0 && lp.accuracy >= 70,
    ).length || 0;

  const starsEarned =
    analytics?.letterPerformance?.reduce(
      (sum, lp) => sum + (lp.correct || 0),
      0,
    ) || 0;

  const calculateBadges = () => {
    if (!analytics) return { count: 0, name: "Magic Rookie" };
    let badgeCount = 0;
    let badgeName = "Magic Rookie";
    if (analytics.totalSessions >= 1) {
      badgeCount++;
      badgeName = "Star Finder";
    }
    if (analytics.totalSessions >= 5) {
      badgeCount++;
      badgeName = "Sign Wizard";
    }
    if (analytics.totalSessions >= 10) {
      badgeCount++;
      badgeName = "Super Hero";
    }
    return { count: badgeCount, name: badgeName };
  };

  const badges = calculateBadges();
  const progressPercentage = (lettersLearned / totalLetters) * 100;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(bounceAnim, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();

    // Floating animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    const loadAnalytics = async () => {
      if (
        userData &&
        userData.role === "child" &&
        userData.uid &&
        userData.parentId
      ) {
        try {
          const childAnalytics = await getChildAnalytics(
            userData.uid,
            userData.parentId,
          );
          setAnalytics(childAnalytics);
        } catch (error) {
          console.error("Error loading child analytics:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    loadAnalytics();
  }, [userData]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercentage,
      duration: 1500,
      useNativeDriver: false,
    }).start();
  }, [progressPercentage]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -15],
  });

  const handleLogout = async () => {
    Alert.alert("Bye Bye?", "Want to go back to the start?", [
      { text: "Keep Playing!", style: "cancel" },
      {
        text: "Yes, Bye Bye!",
        style: "destructive",
        onPress: async () => {
          try {
            await logoutUser();
          } catch (error) {
            console.error("Logout error:", error);
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-purple-50">
      <LinearGradient
        colors={["#a855f7", "#d946ef"]}
        className="h-80 absolute top-0 left-0 right-0 rounded-b-[60px]"
      />

      {/* Floating Decorations */}
      <Animated.View
        style={{
          position: "absolute",
          top: 120,
          right: 30,
          transform: [{ translateY: floatY }],
        }}
      >
        <MaterialCommunityIcons
          name="star-face"
          size={40}
          color="rgba(255,255,255,0.4)"
        />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          top: 350,
          left: 20,
          transform: [{ translateY: floatY }],
        }}
      >
        <MaterialCommunityIcons
          name="heart-flash"
          size={30}
          color="rgba(168,85,247,0.2)"
        />
      </Animated.View>

      <SafeAreaView className="flex-1">
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Animated.View style={{ opacity: fadeAnim }} className="px-6 pt-4">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-8">
              <View className="flex-row items-center">
                <Animated.View
                  style={{ transform: [{ scale: bounceAnim }] }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white items-center justify-center mr-4 shadow-xl border-4 border-purple-200"
                >
                  <MaterialCommunityIcons
                    name="auto-fix"
                    size={width > 400 ? 40 : 32}
                    color="#a855f7"
                  />
                </Animated.View>
                <View>
                  <Text className="text-white text-base font-bold opacity-90">
                    Hi there,
                  </Text>
                  <Text className="text-white text-2xl sm:text-3xl font-black">
                    {childName}! 🦄
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleLogout}
                className="bg-white/30 rounded-full p-3 backdrop-blur-md"
              >
                <Ionicons name="sparkles" size={24} color="white" />
              </TouchableOpacity>
            </View>

            {/* Magic Progress Card */}
            <View className="bg-white rounded-[45px] p-8 mb-8 shadow-2xl shadow-purple-200 border-b-8 border-purple-100">
              <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-center">
                  <MaterialCommunityIcons
                    name="auto-fix"
                    size={30}
                    color="#a855f7"
                  />
                  <Text className="text-purple-900 text-xl sm:text-2xl font-black ml-2">
                    My Magic Stats
                  </Text>
                </View>
                <View className="bg-purple-100 px-4 py-2 rounded-full">
                  <Text className="text-purple-600 font-black text-sm">
                    {progressPercentage.toFixed(0)}%
                  </Text>
                </View>
              </View>

              <View className="h-8 bg-purple-50 rounded-full overflow-hidden mb-8 border-4 border-purple-100/50">
                <Animated.View style={{ width: progressWidth, height: "100%" }}>
                  <LinearGradient
                    colors={["#a855f7", "#d946ef"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1, borderRadius: 20 }}
                  />
                </Animated.View>
              </View>

              <View className="flex-row justify-between">
                <View className="items-center">
                  <View className="w-12 h-12 bg-purple-100 rounded-2xl items-center justify-center mb-2">
                    <MaterialIcons
                      name="auto-awesome"
                      size={24}
                      color="#a855f7"
                    />
                  </View>
                  <Text className="text-purple-400 text-[10px] font-black uppercase">
                    Signs
                  </Text>
                  <Text className="text-purple-900 text-lg font-black">
                    {lettersLearned}
                  </Text>
                </View>
                <View className="items-center">
                  <View className="w-12 h-12 bg-pink-100 rounded-2xl items-center justify-center mb-2">
                    <MaterialIcons name="stars" size={24} color="#ec4899" />
                  </View>
                  <Text className="text-pink-400 text-[10px] font-black uppercase">
                    Stars
                  </Text>
                  <Text className="text-pink-900 text-lg font-black">
                    {starsEarned}
                  </Text>
                </View>
                <View className="items-center">
                  <View className="w-12 h-12 bg-violet-100 rounded-2xl items-center justify-center mb-2">
                    <MaterialCommunityIcons
                      name="wizard-hat"
                      size={24}
                      color="#8b5cf6"
                    />
                  </View>
                  <Text className="text-violet-400 text-[10px] font-black uppercase">
                    Rank
                  </Text>
                  <Text className="text-violet-900 text-xs font-black">
                    {badges.name}
                  </Text>
                </View>
              </View>
            </View>

            {/* Responsive Action Grid */}
            <View className="flex-row flex-wrap justify-between mb-8">
              <TouchableOpacity
                onPress={() => navigation.navigate("LearnSigns")}
                style={{ width: CARD_WIDTH }}
                className="bg-purple-100 rounded-[40px] p-6 mb-4 shadow-lg shadow-purple-100 border-b-8 border-purple-200"
              >
                <View className="w-14 h-14 bg-white rounded-3xl items-center justify-center mb-4 shadow-md">
                  <MaterialIcons name="menu-book" size={32} color="#a855f7" />
                </View>
                <Text className="text-purple-900 font-black text-lg">
                  Learn
                </Text>
                <Text className="text-purple-600 text-xs font-bold">
                  New Magic!
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate("GameSelect")}
                style={{ width: CARD_WIDTH }}
                className="bg-violet-100 rounded-[40px] p-6 mb-4 shadow-lg shadow-violet-100 border-b-8 border-violet-200"
              >
                <View className="w-14 h-14 bg-white rounded-3xl items-center justify-center mb-4 shadow-md">
                  <MaterialIcons
                    name="videogame-asset"
                    size={32}
                    color="#8b5cf6"
                  />
                </View>
                <Text className="text-violet-900 font-black text-lg">
                  Games
                </Text>
                <Text className="text-violet-600 text-xs font-bold">
                  Play time!
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate("StoriesList")}
                style={{ width: CARD_WIDTH }}
                className="bg-fuchsia-100 rounded-[40px] p-6 mb-4 shadow-lg shadow-fuchsia-100 border-b-8 border-fuchsia-200"
              >
                <View className="w-14 h-14 bg-white rounded-3xl items-center justify-center mb-4 shadow-md">
                  <Ionicons name="book" size={32} color="#d946ef" />
                </View>
                <Text className="text-fuchsia-900 font-black text-lg">
                  Stories
                </Text>
                <Text className="text-fuchsia-600 text-xs font-bold">
                  Tales!
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate("HazardDetection")}
                style={{ width: CARD_WIDTH }}
                className="bg-pink-100 rounded-[40px] p-6 mb-4 shadow-lg shadow-pink-100 border-b-8 border-pink-200"
              >
                <View className="w-14 h-14 bg-white rounded-3xl items-center justify-center mb-4 shadow-md">
                  <MaterialCommunityIcons
                    name="shield-star"
                    size={32}
                    color="#ec4899"
                  />
                </View>
                <Text className="text-pink-900 font-black text-lg">Safe</Text>
                <Text className="text-pink-600 text-xs font-bold">
                  I'm Secure!
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sign Power - Bottom Common Stat Card */}
            <View className="bg-white rounded-[45px] p-8 shadow-2xl shadow-purple-200 border-b-8 border-purple-100 items-center overflow-hidden">
              <LinearGradient
                colors={["#fdf4ff", "#ffffff"]}
                className="absolute inset-0"
              />
              <MaterialCommunityIcons
                name="lightning-bolt-circle"
                size={50}
                color="#a855f7"
                style={{ marginBottom: 10 }}
              />
              <Text className="text-purple-400 text-xs font-black uppercase tracking-widest mb-1">
                Weekly Sign Power
              </Text>
              <Text className="text-purple-900 text-4xl font-black mb-2">
                {analytics ? (analytics.averageAccuracy || 0).toFixed(0) : "0"}%
              </Text>
              <View className="bg-purple-600 px-6 py-2 rounded-full">
                <Text className="text-white font-bold text-sm">
                  Magic Accuracy ✨
                </Text>
              </View>
              <Text className="text-purple-300 text-[10px] mt-4 text-center px-6">
                You're getting better every day! Keep practicing to increase
                your magic power.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default ChildDashboard;
