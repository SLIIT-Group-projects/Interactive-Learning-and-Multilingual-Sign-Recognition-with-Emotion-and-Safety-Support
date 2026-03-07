import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getParentChildren } from '../../services/firestore/userService';
import { getChildGameSessions } from '../../services/firestore/gameService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/firebaseConfig';
import LearningInsightCard from '../../components/LearningInsightCard';
import ChildSelector from '../../components/ChildSelector';
import EngagementCard from '../../components/EngagementCard';
import WeeklyProgressChart from '../../components/WeeklyProgressChart';
import SkillRadarChart from '../../components/SkillRadarChart';
import LetterProgressCard from '../../components/LetterProgressCard';
import LearningTimeCard from '../../components/LearningTimeCard';
import ASLSkillHeatmap from '../../components/ASLSkillHeatmap';

const LearningProgressScreen = ({ navigation }) => {
  const { userData } = useAuth();
  const [selectedChild, setSelectedChild] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [engagement, setEngagement] = useState(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showRadarChart, setShowRadarChart] = useState(false);

  useEffect(() => {
    const loadChildren = async () => {
      if (userData && userData.role === 'parent') {
        try {
          const childrenList = await getParentChildren(userData.uid);
          setChildren(childrenList);
          if (childrenList.length > 0) {
            setSelectedChild(childrenList[0]);
            loadLearningInsight(childrenList[0].uid);
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

  useEffect(() => {
    if (selectedChild && selectedChild.uid) {
      loadLearningInsight(selectedChild.uid);
      loadEngagement(selectedChild.uid);
    }
  }, [selectedChild]);

  const loadLearningInsight = async (childId) => {
    if (!childId || !db) {
      setInsight(null);
      return;
    }

    setInsightLoading(true);
    try {
      // Get sessions from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Get all game sessions for this child
      const sessions = await getChildGameSessions(childId, 100);
      
      // Filter sessions from last 7 days
      const weeklySessions = sessions.filter((session) => {
        const sessionDate = session.createdAt?.toDate 
          ? session.createdAt.toDate() 
          : new Date(session.createdAt);
        return sessionDate >= sevenDaysAgo;
      });

      // Calculate weekly accuracy
      let weeklyAccuracy = 0;
      if (weeklySessions.length > 0) {
        const totalAccuracy = weeklySessions.reduce((sum, s) => sum + (s.accuracy || 0), 0);
        weeklyAccuracy = totalAccuracy / weeklySessions.length;
      }

      // Get letter performance
      const letterPerfQuery = query(
        collection(db, 'letterPerformance'),
        where('childId', '==', childId)
      );
      const letterPerfSnapshot = await getDocs(letterPerfQuery);

      const letterPerformance = [];
      letterPerfSnapshot.forEach((doc) => {
        const data = doc.data();
        const attempts = data.attempts || 0;
        const correct = data.correct || 0;
        const accuracy = attempts > 0 ? (correct / attempts) * 100 : 0;
        
        letterPerformance.push({
          letter: data.letter,
          attempts,
          correct,
          accuracy,
        });
      });

      // Find mastered letters (accuracy >= 80 AND attempts >= 5)
      const masteredLetters = letterPerformance
        .filter((lp) => lp.accuracy >= 80 && lp.attempts >= 5)
        .map((lp) => lp.letter)
        .sort();

      // Find weak letters (accuracy < 50 AND attempts >= 3)
      const weakLetters = letterPerformance
        .filter((lp) => lp.accuracy < 50 && lp.attempts >= 3)
        .map((lp) => lp.letter)
        .sort();

      setInsight({
        sessionsThisWeek: weeklySessions.length,
        weeklyAccuracy,
        masteredLetters,
        weakLetters,
      });
    } catch (error) {
      console.error('Error loading learning insight:', error);
      setInsight(null);
    } finally {
      setInsightLoading(false);
    }
  };

  const loadEngagement = async (childId) => {
    if (!childId || !db) {
      setEngagement(null);
      return;
    }

    setEngagementLoading(true);
    try {
      // Get sessions from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Get all game sessions for this child
      const sessions = await getChildGameSessions(childId, 1000);
      
      // Filter sessions from last 7 days
      const weeklySessions = sessions.filter((session) => {
        const sessionDate = session.createdAt?.toDate 
          ? session.createdAt.toDate() 
          : new Date(session.createdAt);
        return sessionDate >= sevenDaysAgo;
      });

      // Get streak count from children collection (try direct access first, then fallback)
      let streakCount = 0;
      try {
        const { getChildProgress } = await import('../../services/firestore/childProgressService');
        const progress = await getChildProgress(childId);
        if (progress) {
          streakCount = progress.streakCount ?? 0;
        }
      } catch (error) {
        // If permission denied, streak will remain 0
        console.warn('Could not load streak count:', error.message);
      }

      // Calculate engagement level
      let engagementLevel = 'Low Engagement';
      if (weeklySessions.length >= 5) {
        engagementLevel = 'Highly Engaged';
      } else if (weeklySessions.length >= 3) {
        engagementLevel = 'Moderately Engaged';
      }

      setEngagement({
        sessionsThisWeek: weeklySessions.length,
        streakCount,
        engagementLevel,
      });
    } catch (error) {
      console.error('Error loading engagement:', error);
      setEngagement(null);
    } finally {
      setEngagementLoading(false);
    }
  };


  return (
    <SafeAreaView className="flex-1 bg-blue-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mr-3 p-2 -ml-2"
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800 flex-1">Learning Progress</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-4 pt-3 pb-6">
          {/* Child selector */}
          <ChildSelector
            children={children}
            selectedChild={selectedChild}
            onSelectChild={setSelectedChild}
            loading={loading}
          />

          {/* Learning Insight Card */}
          {insightLoading ? (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
              <ActivityIndicator size="small" color="#8b5cf6" />
              <Text className="text-gray-600 mt-2 text-sm">Loading insights...</Text>
            </View>
          ) : insight ? (
            <LearningInsightCard insight={insight} />
          ) : !loading && children.length > 0 ? (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
              <Text className="text-gray-500 text-center text-sm">No learning data yet. Have your child play the game!</Text>
            </View>
          ) : null}

          {/* Engagement Card */}
          {engagementLoading ? (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
              <ActivityIndicator size="small" color="#8b5cf6" />
              <Text className="text-gray-600 mt-2 text-sm">Loading engagement...</Text>
            </View>
          ) : engagement ? (
            <EngagementCard engagement={engagement} />
          ) : !loading && children.length > 0 && !insightLoading ? (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
              <Text className="text-gray-500 text-center text-sm">No engagement data yet</Text>
            </View>
          ) : null}

          {/* Letter Progress Card */}
          {selectedChild && (
            <LetterProgressCard childId={selectedChild.uid} />
          )}

          {/* ASL Skill Heatmap */}
          {selectedChild && (
            <ASLSkillHeatmap childId={selectedChild.uid} />
          )}

          {/* Learning Time Card */}
          {selectedChild && (
            <LearningTimeCard childId={selectedChild.uid} />
          )}

          {/* Chart Buttons - Side by Side */}
          {selectedChild && (
            <View className="flex-row mb-4" style={{ gap: 12 }}>
              {/* Weekly Progress Chart Button */}
              <TouchableOpacity
                onPress={() => setShowChart(true)}
                className="bg-white rounded-2xl p-3 shadow-md flex-1"
                style={{ flex: 1 }}
              >
                <View className="items-center">
                  <View className="bg-purple-100 rounded-full p-2 mb-2">
                    <MaterialIcons name="show-chart" size={20} color="#7c3aed" />
                  </View>
                  <Text className="text-sm font-bold text-gray-800 text-center mb-1">
                    Weekly Progress
                  </Text>
                  <Text className="text-xs text-gray-500 text-center" style={{ marginTop: 2 }}>
                    4 weeks trend
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Skill Radar Chart Button */}
              <TouchableOpacity
                onPress={() => setShowRadarChart(true)}
                className="bg-white rounded-2xl p-3 shadow-md flex-1"
                style={{ flex: 1 }}
              >
                <View className="items-center">
                  <View className="bg-purple-100 rounded-full p-2 mb-2">
                    <MaterialIcons name="radar" size={20} color="#7c3aed" />
                  </View>
                  <Text className="text-sm font-bold text-gray-800 text-center mb-1">
                    Skill Radar
                  </Text>
                  <Text className="text-xs text-gray-500 text-center" style={{ marginTop: 2 }}>
                    Skill metrics
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Weekly Progress Chart Modal */}
      {selectedChild && (
        <WeeklyProgressChart
          childId={selectedChild.uid}
          visible={showChart}
          onClose={() => setShowChart(false)}
        />
      )}

      {/* Skill Radar Chart Modal */}
      {selectedChild && (
        <SkillRadarChart
          childId={selectedChild.uid}
          visible={showRadarChart}
          onClose={() => setShowRadarChart(false)}
        />
      )}
    </SafeAreaView>
  );
};

export default LearningProgressScreen;
