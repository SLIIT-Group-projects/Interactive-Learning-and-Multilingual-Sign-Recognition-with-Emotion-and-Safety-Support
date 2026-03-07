import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { logoutUser } from '../../services/auth/authService';
import { getParentChildren } from '../../services/firestore/userService';
import hazardDatabaseService from '../../../services/hazardDatabase.service';
import notificationService from '../../../services/notification.service';

const ParentDashboard = ({ navigation }) => {
  const { userData } = useAuth();
  const [selectedChild, setSelectedChild] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentHazards, setRecentHazards] = useState([]);
  const [hazardsLoading, setHazardsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  
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

  // Load recent hazards from all children
  useEffect(() => {
    if (children.length > 0) {
      loadRecentHazards();
    }
  }, [children]);

  // Load notifications for parent
  useEffect(() => {
    if (userData && userData.role === 'parent' && userData.uid) {
      loadNotifications();
    }
  }, [userData]);

  const loadChildAnalytics = async (childId) => {
    if (!childId || !userData) return;
    
    setAnalyticsLoading(true);
    try {
      const childAnalytics = await getChildAnalytics(childId, userData.uid);
      setAnalytics(childAnalytics);
      
      // Load recent sessions for chart
      const recentSessions = await getParentGameSessions(userData.uid, 20);
      const childSessions = recentSessions.filter(s => s.childId === childId);
      setSessions(childSessions);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadRecentHazards = async () => {
    if (children.length === 0) return;
    
    setHazardsLoading(true);
    try {
      const childrenUserIds = children.map(child => child.uid).filter(Boolean);
      if (childrenUserIds.length > 0) {
        const hazards = await hazardDatabaseService.getHazardAlerts({
          userIds: childrenUserIds,
          limit: 5, // Show 5 most recent hazards
        });
        setRecentHazards(hazards);
      }
    } catch (error) {
      console.error('Error loading recent hazards:', error);
    } finally {
      setHazardsLoading(false);
    }
  };

  const loadNotifications = async () => {
    if (!userData?.uid) return;
    
    setNotificationsLoading(true);
    try {
      const [notificationsList, unread] = await Promise.all([
        notificationService.getNotifications(userData.uid, { limit: 10 }),
        notificationService.getUnreadCount(userData.uid),
      ]);
      setNotifications(notificationsList);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await logoutUser();
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-blue-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-6 pt-4 pb-8">
          {/* Header Section */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Text className="text-3xl font-bold text-gray-800">
                Parent Dashboard
              </Text>
              {unreadCount > 0 && (
                <View className="ml-3 bg-red-500 rounded-full px-3 py-1">
                  <Text className="text-white font-bold text-sm">{unreadCount}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={handleLogout}
              className="bg-white rounded-full p-3 shadow-md"
            >
              <MaterialIcons name="logout" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Critical Alert Notifications */}
          {notifications.length > 0 && (
            <View className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-6">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-lg font-bold text-red-800">
                  🚨 Critical Alerts
                </Text>
                <TouchableOpacity onPress={() => navigation.navigate('HazardHistory')}>
                  <Text className="text-sm text-red-600 font-semibold">View All</Text>
                </TouchableOpacity>
              </View>
              {notifications.slice(0, 3).map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  onPress={async () => {
                    if (!notification.read) {
                      await notificationService.markAsRead(notification.id);
                      loadNotifications();
                    }
                    navigation.navigate('HazardHistory');
                  }}
                  className={`bg-white rounded-lg p-3 mb-2 ${!notification.read ? 'border-l-4 border-red-500' : ''}`}
                >
                  <Text className="font-semibold text-gray-800">
                    {notification.title}
                  </Text>
                  <Text className="text-sm text-gray-600 mt-1">
                    {notification.message}
                  </Text>
                  {notification.childName && (
                    <Text className="text-xs text-gray-500 mt-1">
                      From: {notification.childName}
                    </Text>
                  )}
                  {notification.location && (
                    <View className="flex-row items-center mt-1">
                      <MaterialIcons name="location-on" size={14} color="#ef4444" />
                      <Text className="text-xs text-gray-500 ml-1">
                        {notification.locationText || 
                          (notification.location.coordinates 
                            ? `${notification.location.coordinates[1]?.toFixed(6)}, ${notification.location.coordinates[0]?.toFixed(6)}`
                            : notification.location.latitude 
                              ? `${notification.location.latitude.toFixed(6)}, ${notification.location.longitude.toFixed(6)}`
                              : 'Location available')}
                      </Text>
                    </View>
                  )}
                  <Text className="text-xs text-gray-400 mt-1">
                    {new Date(notification.timestamp).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Child Selection */}
          <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-gray-600">Child</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('AddChild')}
                className="bg-green-500 rounded-full px-4 py-2 flex-row items-center"
              >
                <MaterialIcons name="add" size={20} color="#ffffff" style={{ marginRight: 4 }} />
                <Text className="text-white font-semibold">Add Child</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <Text className="text-gray-500">Loading children...</Text>
            ) : children.length === 0 ? (
              <View className="items-center py-4">
                <Text className="text-gray-500">No children added yet</Text>
              </View>
            ) : (
              <View>
                <Text className="text-xl font-semibold text-gray-800">
                  {selectedChild?.name || children[0]?.name || 'Select a child'}
                </Text>
                {children.length > 1 && (
                  <View className="flex-row flex-wrap mt-3">
                    {children.map((child) => (
                      <TouchableOpacity
                        key={child.id || child.uid}
                        onPress={() => setSelectedChild(child)}
                        className={`px-3 py-1 rounded-full mr-2 mb-2 ${
                          selectedChild?.uid === child.uid
                            ? 'bg-blue-500'
                            : 'bg-gray-200'
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            selectedChild?.uid === child.uid
                              ? 'text-white'
                              : 'text-gray-600'
                          }`}
                        >
                          {child.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Safety & Hazard Section */}
          <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
            <Text className="text-xl font-bold text-gray-800 mb-3">
              Safety & Hazard Monitoring
            </Text>
            <View className="flex-row">
              {/* Hazard History Button */}
              <TouchableOpacity
                onPress={() => navigation.navigate('HazardHistory')}
                className="flex-1 bg-red-500 rounded-2xl p-4 mr-2 flex-row items-center justify-between"
                activeOpacity={0.85}
              >
                <View className="flex-row items-center">
                  <View className="bg-white rounded-full p-2 mr-3">
                    <MaterialIcons name="warning" size={24} color="#ef4444" />
                  </View>
                  <View>
                    <Text className="text-white font-semibold text-base">
                      Hazard Alerts
                    </Text>
                    <Text className="text-red-100 text-xs">
                      View recorded dangerous sounds
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#fee2e2" />
              </TouchableOpacity>

              {/* Places Button */}
              <TouchableOpacity
                onPress={() => navigation.navigate('ParentPlaces')}
                className="flex-1 bg-indigo-500 rounded-2xl p-4 ml-2 flex-row items-center justify-between"
                activeOpacity={0.85}
              >
                <View className="flex-row items-center">
                  <View className="bg-white rounded-full p-2 mr-3">
                    <MaterialIcons name="place" size={24} color="#4f46e5" />
                  </View>
                  <View>
                    <Text className="text-white font-semibold text-base">
                      Safe Places
                    </Text>
                    <Text className="text-indigo-100 text-xs">
                      Manage home, school, and more
                    </Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#e0e7ff" />
              </TouchableOpacity>
            </View>

            {/* Recent Hazards Summary */}
            {hazardsLoading ? (
              <View className="mt-4 py-4 items-center">
                <ActivityIndicator size="small" color="#ef4444" />
              </View>
            ) : recentHazards.length > 0 ? (
              <View className="mt-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-semibold text-gray-700">
                    Recent Hazards Detected
                  </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('HazardHistory')}>
                    <Text className="text-xs text-red-500 font-semibold">View All</Text>
                  </TouchableOpacity>
                </View>
                {recentHazards.slice(0, 3).map((hazard, index) => {
                  const getUrgencyColor = (priority) => {
                    if (priority >= 9) return '#FF3B30';
                    if (priority >= 7) return '#FF9500';
                    if (priority >= 5) return '#FFCC00';
                    return '#34C759';
                  };
                  const formatHazardType = (type) => {
                    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  };
                  const formatDate = (dateString) => {
                    try {
                      const date = new Date(dateString);
                      const now = new Date();
                      const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
                      if (diffMins < 1) return 'Just now';
                      if (diffMins < 60) return `${diffMins}m ago`;
                      const diffHours = Math.floor(diffMins / 60);
                      if (diffHours < 24) return `${diffHours}h ago`;
                      return date.toLocaleDateString();
                    } catch {
                      return dateString;
                    }
                  };
                  const color = getUrgencyColor(hazard.priority);
                  return (
                    <View
                      key={hazard.id || index}
                      className="bg-gray-50 rounded-xl p-3 mb-2 flex-row items-center"
                    >
                      <View className="w-2 h-2 rounded-full mr-3" style={{ backgroundColor: color }} />
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-800">
                          {formatHazardType(hazard.type)}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {formatDate(hazard.timestamp)} • {(hazard.confidence * 100).toFixed(0)}% confidence
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Track Child Learning Progress */}
          <TouchableOpacity
            onPress={() => navigation.navigate('LearningProgress')}
            className="bg-violet-500 rounded-2xl p-5 mb-6 shadow-lg"
            activeOpacity={0.8}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="bg-white rounded-full p-3 mr-4">
                  <MaterialIcons name="school" size={32} color="#7c3aed" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-white mb-1">
                    Track Child Learning Progress
                  </Text>
                  <Text className="text-sm text-violet-100">
                    Letters learned, accuracy, weekly chart & more
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={28} color="#ffffff" />
            </View>
          </TouchableOpacity>
          
          {/* Hazard Detection Button */}
          <TouchableOpacity
            onPress={() => navigation.navigate('HazardDetection')}
            className="bg-red-500 rounded-2xl p-5 mb-6 shadow-lg"
            activeOpacity={0.8}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="bg-white rounded-full p-3 mr-4">
                  <MaterialIcons name="warning" size={32} color="#ef4444" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-white mb-1">
                    Hazard Alert System
                  </Text>
                  <Text className="text-sm text-red-100">
                    Detect and identify dangerous sounds
                  </Text>
                </View>
              </View>
              <MaterialIcons name="arrow-forward" size={24} color="#ffffff" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({});

export default ParentDashboard;

