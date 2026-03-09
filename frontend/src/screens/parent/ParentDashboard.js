import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { logoutUser } from '../../services/auth/authService';
import { getParentChildren } from '../../services/firestore/userService';
import notificationService from '../../../services/notification.service';

const ParentDashboard = ({ navigation }) => {
  const { userData } = useAuth();
  const [selectedChild, setSelectedChild] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  
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

  // Load notifications for parent
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
            </View>
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => navigation.navigate('HazardHistory')}
                className="bg-white rounded-full p-3 shadow-md mr-3"
              >
                <View>
                  <MaterialIcons name="notifications" size={24} color="#374151" />
                  {unreadCount > 0 && (
                    <View className="absolute -top-2 -right-2 bg-red-500 rounded-full min-w-[18px] h-[18px] px-1 items-center justify-center">
                      <Text className="text-white font-bold text-[10px]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLogout}
                className="bg-white rounded-full p-3 shadow-md"
              >
                <MaterialIcons name="logout" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
          </View>

          
          
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

          {/* Emotion Dashboard */}
          <TouchableOpacity
            onPress={() => navigation.navigate('EmotionDashboard')}
            className="bg-pink-500 rounded-2xl p-5 mb-6 shadow-lg"
            activeOpacity={0.8}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="bg-white rounded-full p-3 mr-4">
                  <MaterialIcons name="favorite" size={32} color="#ec4899" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-white mb-1">
                    Emotion & Behavior Analysis
                  </Text>
                  <Text className="text-sm text-pink-100">
                    Track emotions, engagement, and get insights
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

