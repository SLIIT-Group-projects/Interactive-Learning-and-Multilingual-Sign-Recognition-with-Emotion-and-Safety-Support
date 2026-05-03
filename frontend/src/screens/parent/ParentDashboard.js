import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BarChart } from 'react-native-gifted-charts';
import { useAuth } from '../../contexts/AuthContext';
import { logoutUser } from '../../services/auth/authService';
import { getParentChildren } from '../../services/firestore/userService';
import notificationService from '../../../services/notification.service';
import hazardDatabaseService from '../../../services/hazardDatabase.service';

const { width } = Dimensions.get('window');

const ParentDashboard = ({ navigation }) => {
  const { userData } = useAuth();
  const [selectedChild, setSelectedChild] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Hazard Stats State
  const [hazardStats, setHazardStats] = useState(null);
  const [latestHazard, setLatestHazard] = useState(null);
  const [chartData, setChartData] = useState([]);
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Load children on mount
  useEffect(() => {
    const loadChildren = async () => {
      if (userData && userData.role === 'parent') {
        try {
          const childrenList = await getParentChildren(userData.uid);
          setChildren(childrenList);
          if (childrenList.length > 0) {
            setSelectedChild(childrenList[0]);
          }
        } catch (error) {
          console.error('Error loading children:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    loadChildren();
  }, [userData]);

  // Load hazard stats when selected child changes
  useEffect(() => {
    if (selectedChild) {
      loadHazardData();
    }
  }, [selectedChild]);

  const loadHazardData = async () => {
    if (!selectedChild?.uid) return;
    
    try {
      const [stats, alerts] = await Promise.all([
        hazardDatabaseService.getHazardStats({ userId: selectedChild.uid }),
        hazardDatabaseService.getHazardAlerts({ userId: selectedChild.uid, limit: 1 })
      ]);
      
      setHazardStats(stats);
      if (alerts.length > 0) {
        setLatestHazard(alerts[0]);
      } else {
        setLatestHazard(null);
      }

      if (stats?.byType) {
        const formattedData = Object.entries(stats.byType)
          .map(([key, value]) => ({
            value,
            label: key.split('_')[0].charAt(0).toUpperCase() + key.split('_')[0].slice(1),
            frontColor: '#F87171',
            gradientColor: '#EF4444',
          }))
          .slice(0, 4);
        setChartData(formattedData);
      }
    } catch (error) {
      console.error('Error loading hazard data:', error);
    }
  };

  useEffect(() => {
    if (userData && userData.role === 'parent' && userData.uid) {
      loadNotifications();
    }
  }, [userData]);

  const loadNotifications = async () => {
    if (!userData?.uid) return;
    try {
      const unread = await notificationService.getUnreadCount(userData.uid);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        try { await logoutUser(); } catch (error) { console.error('Logout error:', error); }
      }},
    ]);
  };

  const formatTime = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '---'; }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <LinearGradient colors={['#6366f1', '#4f46e5']} className="h-64 absolute top-0 left-0 right-0 rounded-b-[40px]" />
      
      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim }} className="px-6 pt-4 pb-12">
            
            {/* Header */}
            <View className="flex-row items-center justify-between mb-8">
              <View>
                <Text className="text-white text-sm font-medium opacity-80">Welcome back,</Text>
                <Text className="text-white text-3xl font-bold">
                  {userData?.name?.split(' ')[0] || 'Parent'} 👋
                </Text>
              </View>
              <View className="flex-row">
                <TouchableOpacity
                  onPress={() => navigation.navigate('HazardHistory')}
                  className="bg-white/20 rounded-2xl p-3 mr-3 backdrop-blur-md"
                >
                  <Ionicons name="notifications-outline" size={24} color="white" />
                  {unreadCount > 0 && (
                    <View className="absolute top-2 right-2 bg-rose-500 rounded-full w-5 h-5 items-center justify-center border-2 border-indigo-600">
                      <Text className="text-white font-bold text-[9px]">{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleLogout}
                  className="bg-white/20 rounded-2xl p-3 backdrop-blur-md"
                >
                  <Ionicons name="log-out-outline" size={24} color="white" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Child Selector */}
            <View className="bg-white rounded-[32px] p-6 mb-8 shadow-xl shadow-indigo-200">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-slate-400 text-xs font-bold tracking-widest uppercase">My Children</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('AddChild')}
                  className="bg-indigo-50 px-4 py-2 rounded-full flex-row items-center"
                >
                  <MaterialIcons name="add" size={18} color="#4f46e5" />
                  <Text className="text-indigo-600 font-bold ml-1">Add</Text>
                </TouchableOpacity>
              </View>
              
              {loading ? (
                <View className="h-12 items-center justify-center">
                  <Text className="text-slate-400 italic">Loading...</Text>
                </View>
              ) : children.length === 0 ? (
                <View className="py-4 items-center">
                  <Text className="text-slate-400">No children linked yet</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  {children.map((child) => (
                    <TouchableOpacity
                      key={child.uid}
                      onPress={() => setSelectedChild(child)}
                      className={`mr-4 items-center py-2 px-6 rounded-2xl border-2 ${
                        selectedChild?.uid === child.uid ? 'border-indigo-500 bg-indigo-50' : 'border-transparent bg-slate-50'
                      }`}
                    >
                      <View className={`w-12 h-12 rounded-full items-center justify-center mb-2 ${
                        selectedChild?.uid === child.uid ? 'bg-indigo-500' : 'bg-slate-200'
                      }`}>
                        <FontAwesome5 name="user-alt" size={20} color={selectedChild?.uid === child.uid ? 'white' : '#94a3b8'} />
                      </View>
                      <Text className={`font-bold ${selectedChild?.uid === child.uid ? 'text-indigo-600' : 'text-slate-500'}`}>
                        {child.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Quick Modules Grid */}
            <View className="flex-row flex-wrap justify-between mb-4">
              {/* Learning Card */}
              <TouchableOpacity
                onPress={() => navigation.navigate('LearningProgress')}
                className="w-[48%] bg-white rounded-3xl p-5 mb-4 shadow-lg shadow-indigo-100"
              >
                <View className="w-12 h-12 bg-violet-100 rounded-2xl items-center justify-center mb-4">
                  <MaterialIcons name="school" size={28} color="#8b5cf6" />
                </View>
                <Text className="text-slate-800 font-bold text-lg">Learning</Text>
                <Text className="text-slate-400 text-xs">Track progress</Text>
              </TouchableOpacity>

              {/* Emotion Card */}
              <TouchableOpacity
                onPress={() => navigation.navigate('EmotionDashboard')}
                className="w-[48%] bg-white rounded-3xl p-5 mb-4 shadow-lg shadow-indigo-100"
              >
                <View className="w-12 h-12 bg-pink-100 rounded-2xl items-center justify-center mb-4">
                  <MaterialIcons name="favorite" size={28} color="#ec4899" />
                </View>
                <Text className="text-slate-800 font-bold text-lg">Emotions</Text>
                <Text className="text-slate-400 text-xs">Behavior insights</Text>
              </TouchableOpacity>

              {/* Sign Language Card */}
              <TouchableOpacity
                onPress={() => navigation.navigate('SignDetection')}
                className="w-[48%] bg-white rounded-3xl p-5 mb-4 shadow-lg shadow-indigo-100"
              >
                <View className="w-12 h-12 bg-blue-100 rounded-2xl items-center justify-center mb-4">
                  <MaterialIcons name="sign-language" size={28} color="#3b82f6" />
                </View>
                <Text className="text-slate-800 font-bold text-lg">Signs</Text>
                <Text className="text-slate-400 text-xs">Real-time tools</Text>
              </TouchableOpacity>

              {/* System Settings Card */}
              <TouchableOpacity
                onPress={() => navigation.navigate('HazardDetection')}
                className="w-[48%] bg-white rounded-3xl p-5 mb-4 shadow-lg shadow-indigo-100"
              >
                <View className="w-12 h-12 bg-slate-100 rounded-2xl items-center justify-center mb-4">
                  <MaterialIcons name="settings" size={28} color="#64748b" />
                </View>
                <Text className="text-slate-800 font-bold text-lg">Alerts</Text>
                <Text className="text-slate-400 text-xs">System settings</Text>
              </TouchableOpacity>
            </View>

            {/* Safety Snapshot Section */}
            <View className="bg-white rounded-[32px] p-6 mb-8 shadow-xl shadow-indigo-200">
              <View className="flex-row justify-between items-center mb-6">
                <View>
                  <Text className="text-slate-800 text-xl font-bold">Safety Snapshot</Text>
                  <Text className="text-slate-400 text-sm">Real-time hazard overview</Text>
                </View>
                <View className="bg-emerald-50 px-4 py-2 rounded-2xl flex-row items-center">
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }} className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2" />
                  <Text className="text-emerald-600 font-bold text-xs">LIVE</Text>
                </View>
              </View>

              <View className="flex-row gap-4 mb-6">
                <View className="flex-1 bg-slate-50 rounded-3xl p-5 border border-slate-100">
                  <Text className="text-slate-400 text-xs font-bold mb-2">LAST SOUND</Text>
                  <Text className="text-slate-800 text-lg font-bold" numberOfLines={1}>
                    {latestHazard ? latestHazard.type.replace('_', ' ').toUpperCase() : 'None'}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-1">
                    {latestHazard ? formatTime(latestHazard.timestamp) : 'Listening...'}
                  </Text>
                </View>
                <View className="flex-1 bg-rose-50 rounded-3xl p-5 border border-rose-100">
                  <Text className="text-rose-400 text-xs font-bold mb-2">TOTAL HAZARDS</Text>
                  <Text className="text-rose-600 text-3xl font-black">
                    {hazardStats?.hazards || 0}
                  </Text>
                  <Text className="text-rose-400 text-xs mt-1 opacity-70">Detected today</Text>
                </View>
              </View>

              {chartData.length > 0 && (
                <View className="mb-6">
                  <Text className="text-slate-400 text-xs font-bold mb-4">HAZARD DISTRIBUTION</Text>
                  <View className="items-center">
                    <BarChart
                      data={chartData}
                      barWidth={45}
                      noOfSections={3}
                      barBorderRadius={6}
                      yAxisThickness={0}
                      xAxisThickness={0}
                      hideRules
                      showGradient
                      labelSize={10}
                      height={120}
                      width={width - 100}
                      isAnimated
                    />
                  </View>
                </View>
              )}

              <View className="flex-row gap-4">
                <TouchableOpacity
                  onPress={() => navigation.navigate('HazardHistory')}
                  className="flex-1 overflow-hidden rounded-2xl"
                >
                  <LinearGradient colors={['#f87171', '#ef4444']} className="p-4 items-center justify-center flex-row">
                    <MaterialIcons name="history" size={20} color="white" />
                    <Text className="text-white font-bold ml-2">History</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('ParentPlaces')}
                  className="flex-1 overflow-hidden rounded-2xl"
                >
                  <LinearGradient colors={['#818cf8', '#6366f1']} className="p-4 items-center justify-center flex-row">
                    <MaterialIcons name="place" size={20} color="white" />
                    <Text className="text-white font-bold ml-2">Places</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default ParentDashboard;

