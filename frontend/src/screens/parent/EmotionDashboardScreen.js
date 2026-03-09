import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getParentChildren } from '../../services/firestore/userService';
import {
  getDailyEmotionStats,
  getWeeklyEmotionStats,
  getChildEmotionSessions,
  getChildStoryEmotionSessions,
  getAllParentEmotionSessions,
} from '../../services/firestore/emotionService';
import {
  analyzeEmotionPatterns,
  getEmotionInsights,
} from '../../services/firestore/emotionAnalysisService';

const EmotionDashboardScreen = ({ navigation }) => {
  const { userData } = useAuth();
  const [selectedChild, setSelectedChild] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('week'); // 'day' or 'week'
  const [dailyStats, setDailyStats] = useState(null);
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [insights, setInsights] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recentSessions, setRecentSessions] = useState({ gameSessions: [], storySessions: [] });

  useEffect(() => {
    loadChildren();
  }, [userData]);

  useEffect(() => {
    if (selectedChild) {
      loadEmotionData();
    }
  }, [selectedChild, timeRange]);

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

  const loadEmotionData = async () => {
    if (!selectedChild) return;

    setLoading(true);
    try {
      if (timeRange === 'day') {
        const today = await getDailyEmotionStats(selectedChild.uid);
        setDailyStats(today);
        setWeeklyStats([]);
      } else {
        const week = await getWeeklyEmotionStats(selectedChild.uid, 1);
        setWeeklyStats(week);
        setDailyStats(null);
      }

      // Load recent sessions
      const [gameSessions, storySessions] = await Promise.all([
        getChildEmotionSessions(selectedChild.uid, 10),
        getChildStoryEmotionSessions(selectedChild.uid, 10),
      ]);
      setRecentSessions({ gameSessions, storySessions });

      // Load and analyze insights
      setAnalyzing(true);
      const analysis = await analyzeEmotionPatterns(selectedChild.uid, userData.uid);
      setInsights(analysis);
    } catch (error) {
      console.error('Error loading emotion data:', error);
      Alert.alert('Error', 'Failed to load emotion data');
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  const getEmotionEmoji = (emotion) => {
    const emojiMap = {
      happy: '😊',
      sad: '😢',
      angry: '😠',
      fear: '😨',
      surprise: '😲',
      disgust: '😖',
      neutral: '😐',
    };
    return emojiMap[emotion?.toLowerCase()] || '😐';
  };

  const getBehaviorColor = (behavior) => {
    if (!behavior) return '#gray';
    const lower = behavior.toLowerCase();
    if (lower.includes('happy') || lower.includes('calm')) return '#10b981'; // green
    if (lower.includes('angry') || lower.includes('agitated') || lower.includes('distressed')) return '#ef4444'; // red
    if (lower.includes('sad') || lower.includes('fear')) return '#f59e0b'; // amber
    return '#6b7280'; // gray
  };

  const getEmotionColor = (emotion) => {
    const colorMap = {
      happy: '#10b981',
      sad: '#3b82f6',
      angry: '#ef4444',
      fear: '#f59e0b',
      surprise: '#8b5cf6',
      disgust: '#ec4899',
      neutral: '#6b7280',
    };
    return colorMap[emotion?.toLowerCase()] || '#6b7280';
  };

  const getEngagementColor = (engagement) => {
    if (engagement === 'HIGH') return { backgroundColor: '#10b981' };
    if (engagement === 'MEDIUM') return { backgroundColor: '#f59e0b' };
    return { backgroundColor: '#6b7280' };
  };

  if (loading && !selectedChild) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emotion Dashboard</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Child Selector */}
      {children.length > 1 && (
        <View style={styles.childSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {children.map((child) => (
              <TouchableOpacity
                key={child.uid}
                onPress={() => setSelectedChild(child)}
                style={[
                  styles.childButton,
                  selectedChild?.uid === child.uid && styles.childButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.childButtonText,
                    selectedChild?.uid === child.uid && styles.childButtonTextActive,
                  ]}
                >
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Time Range Selector */}
      <View style={styles.timeRangeSelector}>
        <TouchableOpacity
          onPress={() => setTimeRange('day')}
          style={[
            styles.timeRangeButton,
            timeRange === 'day' && styles.timeRangeButtonActive,
          ]}
        >
          <Text
            style={[
              styles.timeRangeText,
              timeRange === 'day' && styles.timeRangeTextActive,
            ]}
          >
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTimeRange('week')}
          style={[
            styles.timeRangeButton,
            timeRange === 'week' && styles.timeRangeButtonActive,
          ]}
        >
          <Text
            style={[
              styles.timeRangeText,
              timeRange === 'week' && styles.timeRangeTextActive,
            ]}
          >
            This Week
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Session Breakdown - Games vs Stories */}
          {insights && insights.sessionBreakdown && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}> Activity Breakdown</Text>
              <View style={styles.card}>
                <View style={styles.breakdownContainer}>
                  <View style={styles.breakdownItem}>
                    <View style={[styles.breakdownIcon, { backgroundColor: '#3b82f6' }]}>
                      <MaterialIcons name="videogame-asset" size={24} color="#fff" />
                    </View>
                    <View style={styles.breakdownContent}>
                      <Text style={styles.breakdownLabel}>Games</Text>
                      <Text style={styles.breakdownValue}>{insights.sessionBreakdown.gameCount}</Text>
                      <Text style={styles.breakdownPercentage}>
                        {insights.sessionBreakdown.gamePercentage}%
                      </Text>
                    </View>
                  </View>
                  <View style={styles.breakdownItem}>
                    <View style={[styles.breakdownIcon, { backgroundColor: '#10b981' }]}>
                      <MaterialIcons name="menu-book" size={24} color="#fff" />
                    </View>
                    <View style={styles.breakdownContent}>
                      <Text style={styles.breakdownLabel}>Stories</Text>
                      <Text style={styles.breakdownValue}>{insights.sessionBreakdown.storyCount}</Text>
                      <Text style={styles.breakdownPercentage}>
                        {insights.sessionBreakdown.storyPercentage}%
                      </Text>
                    </View>
                  </View>
                </View>
                {/* Visual Bar */}
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${insights.sessionBreakdown.gamePercentage}%`,
                        backgroundColor: '#3b82f6',
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${insights.sessionBreakdown.storyPercentage}%`,
                        backgroundColor: '#10b981',
                      },
                    ]}
                  />
                </View>
                {/* Engagement Comparison */}
                <View style={styles.engagementComparison}>
                  <View style={styles.engagementItem}>
                    <Text style={styles.engagementLabel}>Games Engagement</Text>
                    <View style={[styles.engagementBadge, getEngagementColor(insights.sessionBreakdown.gameAvgEngagement)]}>
                      <Text style={styles.engagementText}>{insights.sessionBreakdown.gameAvgEngagement}</Text>
                    </View>
                  </View>
                  <View style={styles.engagementItem}>
                    <Text style={styles.engagementLabel}>Stories Engagement</Text>
                    <View style={[styles.engagementBadge, getEngagementColor(insights.sessionBreakdown.storyAvgEngagement)]}>
                      <Text style={styles.engagementText}>{insights.sessionBreakdown.storyAvgEngagement}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Insights Section */}
          {insights && insights.hasData && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}> Insights & Analysis</Text>

              {/* Overall Mood with Emotion Distribution */}
              {insights.overallMood && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Overall Mood</Text>
                  <View style={styles.moodContainer}>
                    <Text style={styles.moodEmoji}>
                      {getEmotionEmoji(insights.overallMood.dominant)}
                    </Text>
                    <View style={styles.moodTextContainer}>
                      <Text style={styles.moodText}>
                        {insights.overallMood.dominant.charAt(0).toUpperCase() +
                          insights.overallMood.dominant.slice(1)}
                      </Text>
                      <Text style={styles.cardSubtext}>
                        Based on {insights.overallMood.totalSessions} sessions
                      </Text>
                    </View>
                  </View>
                  {/* Emotion Distribution Chart */}
                  {insights.overallMood.percentages && (
                    <View style={styles.emotionChart}>
                      {Object.entries(insights.overallMood.percentages)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([emotion, percentage]) => (
                          <View key={emotion} style={styles.emotionBarItem}>
                            <View style={styles.emotionBarLabel}>
                              <Text style={styles.emotionEmoji}>{getEmotionEmoji(emotion)}</Text>
                              <Text style={styles.emotionName}>
                                {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                              </Text>
                            </View>
                            <View style={styles.emotionBarContainer}>
                              <View
                                style={[
                                  styles.emotionBar,
                                  {
                                    width: `${percentage}%`,
                                    backgroundColor: getEmotionColor(emotion),
                                  },
                                ]}
                              />
                              <Text style={styles.emotionPercentage}>{percentage}%</Text>
                            </View>
                          </View>
                        ))}
                    </View>
                  )}
                </View>
              )}

              {/* Engagement Trend */}
              {insights.engagementTrend && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Engagement Trend</Text>
                  <Text style={styles.trendText}>
                    {insights.engagementTrend.message}
                  </Text>
                  {insights.engagementTrend.trend === 'improving' && (
                    <View style={styles.trendIndicator}>
                      <MaterialIcons name="trending-up" size={20} color="#10b981" />
                      <Text style={styles.trendIndicatorText}>Improving</Text>
                    </View>
                  )}
                  {insights.engagementTrend.trend === 'declining' && (
                    <View style={styles.trendIndicator}>
                      <MaterialIcons name="trending-down" size={20} color="#ef4444" />
                      <Text style={styles.trendIndicatorText}>Declining</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Warnings */}
              {insights.warnings && insights.warnings.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>⚠️ Important Notices</Text>
                  {insights.warnings.map((warning, index) => (
                    <View key={index} style={styles.warningItem}>
                      <Text style={styles.warningTitle}>{warning.title}</Text>
                      <Text style={styles.warningMessage}>{warning.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Recommendations */}
              {insights.recommendations && insights.recommendations.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>💡 Recommendations</Text>
                  {insights.recommendations.map((rec, index) => (
                    <View key={index} style={styles.recommendationItem}>
                      <Text style={styles.recommendationTitle}>{rec.title}</Text>
                      <Text style={styles.recommendationMessage}>{rec.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Confusion Patterns */}
              {insights.confusionPatterns &&
                insights.confusionPatterns.mostConfusedLetters.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Confusion Patterns</Text>
                    <Text style={styles.cardSubtext}>
                      Letters your child struggles with:
                    </Text>
                    <View style={styles.lettersContainer}>
                      {insights.confusionPatterns.mostConfusedLetters.map(
                        (item, index) => (
                          <View key={index} style={styles.letterBadge}>
                            <Text style={styles.letterText}>{item.letter}</Text>
                            <Text style={styles.letterCount}>{item.count}x</Text>
                          </View>
                        ),
                      )}
                    </View>
                  </View>
                )}

              {/* Progress */}
              {insights.progress && insights.progress.accuracyChange !== undefined && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Progress</Text>
                  {insights.progress.isImproving ? (
                    <View style={styles.progressContainer}>
                      <MaterialIcons name="trending-up" size={24} color="#10b981" />
                      <Text style={styles.progressText}>
                        Accuracy improved by{' '}
                        {Math.abs(insights.progress.accuracyChange).toFixed(1)}%
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.progressText}>
                      Accuracy: {insights.progress.lastWeekAccuracy.toFixed(1)}%
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Daily Stats */}
          {timeRange === 'day' && dailyStats && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Today's Stats</Text>
              <View style={styles.card}>
                <Text style={styles.statText}>
                  Sessions: {dailyStats.sessions || 0}
                </Text>
                <Text style={styles.statText}>
                  Confused Letters: {dailyStats.totalConfusion || 0}
                </Text>
                <Text style={styles.statText}>
                  Accuracy:{' '}
                  {dailyStats.totalQuestions > 0
                    ? (
                        (dailyStats.totalCorrect / dailyStats.totalQuestions) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </Text>
              </View>
            </View>
          )}

          {/* Weekly Stats */}
          {timeRange === 'week' && weeklyStats.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Weekly Overview</Text>
              {weeklyStats.map((day, index) => (
                <View key={index} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {new Date(day.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.statText}>Sessions: {day.sessions || 0}</Text>
                  <Text style={styles.statText}>
                    Accuracy:{' '}
                    {day.totalQuestions > 0
                      ? ((day.totalCorrect / day.totalQuestions) * 100).toFixed(1)
                      : 0}
                    %
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Recent Sessions */}
          {(recentSessions.gameSessions.length > 0 || recentSessions.storySessions.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📝 Recent Sessions</Text>
              
              {/* Game Sessions */}
              {recentSessions.gameSessions.slice(0, 5).map((session, index) => (
                <View key={session.id || index} style={[styles.card, styles.sessionCard]}>
                  <View style={styles.sessionHeader}>
                    <View style={[styles.sessionIcon, { backgroundColor: '#3b82f6' }]}>
                      <MaterialIcons name="videogame-asset" size={20} color="#fff" />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionTitle}>Letter Practice Game</Text>
                      <Text style={styles.sessionDate}>
                        {session.createdAt?.toDate
                          ? session.createdAt.toDate().toLocaleDateString()
                          : 'Recent'}
                      </Text>
                    </View>
                    <View style={styles.sessionEmotion}>
                      <Text style={styles.sessionEmotionEmoji}>
                        {getEmotionEmoji(session.finalEmotion)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sessionDetails}>
                    <View style={styles.sessionDetailItem}>
                      <Text style={styles.sessionDetailLabel}>Behavior</Text>
                      <Text style={[styles.sessionDetailValue, { color: getBehaviorColor(session.behavior) }]}>
                        {session.behavior || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.sessionDetailItem}>
                      <Text style={styles.sessionDetailLabel}>Engagement</Text>
                      <View style={[styles.engagementBadgeSmall, getEngagementColor(session.engagementLevel)]}>
                        <Text style={styles.engagementTextSmall}>{session.engagementLevel || 'LOW'}</Text>
                      </View>
                    </View>
                    {session.accuracy !== undefined && (
                      <View style={styles.sessionDetailItem}>
                        <Text style={styles.sessionDetailLabel}>Accuracy</Text>
                        <Text style={styles.sessionDetailValue}>{session.accuracy.toFixed(0)}%</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}

              {/* Story Sessions */}
              {recentSessions.storySessions.slice(0, 5).map((session, index) => (
                <View key={session.id || index} style={[styles.card, styles.sessionCard]}>
                  <View style={styles.sessionHeader}>
                    <View style={[styles.sessionIcon, { backgroundColor: '#10b981' }]}>
                      <MaterialIcons name="menu-book" size={20} color="#fff" />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionTitle} numberOfLines={1}>
                        {session.storyTitle || 'Story Reading'}
                      </Text>
                      <Text style={styles.sessionDate}>
                        {session.createdAt?.toDate
                          ? session.createdAt.toDate().toLocaleDateString()
                          : 'Recent'}
                      </Text>
                    </View>
                    <View style={styles.sessionEmotion}>
                      <Text style={styles.sessionEmotionEmoji}>
                        {getEmotionEmoji(session.finalEmotion)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sessionDetails}>
                    <View style={styles.sessionDetailItem}>
                      <Text style={styles.sessionDetailLabel}>Behavior</Text>
                      <Text style={[styles.sessionDetailValue, { color: getBehaviorColor(session.behavior) }]}>
                        {session.behavior || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.sessionDetailItem}>
                      <Text style={styles.sessionDetailLabel}>Engagement</Text>
                      <View style={[styles.engagementBadgeSmall, getEngagementColor(session.engagementLevel)]}>
                        <Text style={styles.engagementTextSmall}>{session.engagementLevel || 'LOW'}</Text>
                      </View>
                    </View>
                    {session.duration > 0 && (
                      <View style={styles.sessionDetailItem}>
                        <Text style={styles.sessionDetailLabel}>Duration</Text>
                        <Text style={styles.sessionDetailValue}>
                          {Math.floor(session.duration / 60)}m {session.duration % 60}s
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* No Data Message */}
          {(!insights || !insights.hasData) && !dailyStats && weeklyStats.length === 0 && (
            <View style={styles.centerContent}>
              <Text style={styles.noDataText}>
                No emotion data available yet.{'\n'}Play some games and read stories to see insights!
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  placeholder: {
    width: 40,
  },
  childSelector: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  childButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  childButtonActive: {
    backgroundColor: '#3b82f6',
  },
  childButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  childButtonTextActive: {
    color: '#ffffff',
  },
  timeRangeSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: '#f3f4f6',
  },
  timeRangeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  timeRangeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  timeRangeTextActive: {
    color: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  cardSubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  moodContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  moodEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  moodText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  trendText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  trendIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  trendIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  warningItem: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 4,
  },
  warningMessage: {
    fontSize: 13,
    color: '#991b1b',
  },
  recommendationItem: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  recommendationMessage: {
    fontSize: 13,
    color: '#1e3a8a',
  },
  lettersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  letterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  letterText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginRight: 4,
  },
  letterCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#1f2937',
    marginLeft: 8,
  },
  statText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  noDataText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  // Session Breakdown Styles
  breakdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  breakdownIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  breakdownContent: {
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 2,
  },
  breakdownPercentage: {
    fontSize: 14,
    color: '#6b7280',
  },
  progressBarContainer: {
    flexDirection: 'row',
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
  },
  engagementComparison: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  engagementItem: {
    alignItems: 'center',
  },
  engagementLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  engagementBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  engagementText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  engagementBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  engagementTextSmall: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  // Emotion Chart Styles
  emotionChart: {
    marginTop: 16,
  },
  emotionBarItem: {
    marginBottom: 12,
  },
  emotionBarLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  emotionEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  emotionName: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  emotionBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emotionBar: {
    height: 20,
    borderRadius: 10,
    marginRight: 8,
    minWidth: 4,
  },
  emotionPercentage: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  moodTextContainer: {
    flex: 1,
  },
  // Session Card Styles
  sessionCard: {
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  sessionDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  sessionEmotion: {
    marginLeft: 8,
  },
  sessionEmotionEmoji: {
    fontSize: 24,
  },
  sessionDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  sessionDetailItem: {
    marginRight: 16,
    marginBottom: 8,
  },
  sessionDetailLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  sessionDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
});

export default EmotionDashboardScreen;
