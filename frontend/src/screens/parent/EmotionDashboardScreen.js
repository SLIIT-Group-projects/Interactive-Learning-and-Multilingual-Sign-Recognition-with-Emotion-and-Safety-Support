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
  generatePredictiveInsights,
  getCurrentWeekData,
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
  const [currentWeekData, setCurrentWeekData] = useState([]);
  const [predictiveInsights, setPredictiveInsights] = useState(null);

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

      // Load current week data
      const weekData = await getCurrentWeekData(selectedChild.uid);
      setCurrentWeekData(weekData);

      // Load and analyze insights
      setAnalyzing(true);
      const analysis = await analyzeEmotionPatterns(selectedChild.uid, userData.uid);
      setInsights(analysis);

      // Generate predictive insights
      const predictions = await generatePredictiveInsights(selectedChild.uid, weekData, analysis);
      setPredictiveInsights(predictions);
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
          {/* Session Breakdown - Games vs Stories - Only show for day view */}
          {timeRange === 'day' && insights && insights.sessionBreakdown && (
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

          {/* Insights Section - Enhanced for Week View */}
          {timeRange === 'week' && insights && insights.hasData && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Weekly Insights & Analysis</Text>

              {/* Overall Mood with Enhanced Design */}
              {insights.overallMood && (
                <View style={[styles.card, styles.insightCardLarge]}>
                  <View style={styles.insightCardHeader}>
                    <Text style={styles.insightCardTitle}>Overall Mood This Week</Text>
                    <View style={[styles.moodBadge, { backgroundColor: getEmotionColor(insights.overallMood.dominant) + '20' }]}>
                      <Text style={styles.moodBadgeEmoji}>
                        {getEmotionEmoji(insights.overallMood.dominant)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.moodContainerLarge}>
                    <View style={styles.moodMainInfo}>
                      <Text style={styles.moodEmojiLarge}>
                        {getEmotionEmoji(insights.overallMood.dominant)}
                      </Text>
                      <View>
                        <Text style={styles.moodTextLarge}>
                          {insights.overallMood.dominant.charAt(0).toUpperCase() +
                            insights.overallMood.dominant.slice(1)}
                        </Text>
                        <Text style={styles.moodSubtextLarge}>
                          Based on {insights.overallMood.totalSessions} sessions this week
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Enhanced Emotion Distribution Chart */}
                  {insights.overallMood.percentages && (
                    <View style={styles.emotionChartLarge}>
                      <Text style={styles.chartTitle}>Emotion Distribution</Text>
                      {Object.entries(insights.overallMood.percentages)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([emotion, percentage]) => (
                          <View key={emotion} style={styles.emotionBarItemLarge}>
                            <View style={styles.emotionBarLabelLarge}>
                              <Text style={styles.emotionEmojiLarge}>{getEmotionEmoji(emotion)}</Text>
                              <Text style={styles.emotionNameLarge}>
                                {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                              </Text>
                              <Text style={styles.emotionPercentageLarge}>{percentage}%</Text>
                            </View>
                            <View style={styles.emotionBarContainerLarge}>
                              <View
                                style={[
                                  styles.emotionBarLarge,
                                  {
                                    width: `${percentage}%`,
                                    backgroundColor: getEmotionColor(emotion),
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        ))}
                    </View>
                  )}
                </View>
              )}

              {/* Enhanced Engagement Trend */}
              {insights.engagementTrend && (
                <View style={[styles.card, styles.insightCardLarge]}>
                  <View style={styles.insightCardHeader}>
                    <Text style={styles.insightCardTitle}>Engagement Trend</Text>
                    {insights.engagementTrend.trend === 'improving' && (
                      <View style={[styles.trendBadge, { backgroundColor: '#10b981' }]}>
                        <MaterialIcons name="trending-up" size={20} color="#fff" />
                      </View>
                    )}
                    {insights.engagementTrend.trend === 'declining' && (
                      <View style={[styles.trendBadge, { backgroundColor: '#ef4444' }]}>
                        <MaterialIcons name="trending-down" size={20} color="#fff" />
                      </View>
                    )}
                    {insights.engagementTrend.trend === 'stable' && (
                      <View style={[styles.trendBadge, { backgroundColor: '#6b7280' }]}>
                        <MaterialIcons name="trending-flat" size={20} color="#fff" />
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.trendContentLarge}>
                    <Text style={styles.trendMessageLarge}>
                      {insights.engagementTrend.message}
                    </Text>
                    {insights.engagementTrend.recentAvg !== undefined && (
                      <View style={styles.trendStatsContainer}>
                        <View style={styles.trendStatItem}>
                          <Text style={styles.trendStatLabel}>This Week</Text>
                          <Text style={[styles.trendStatValue, { color: '#3b82f6' }]}>
                            {insights.engagementTrend.recentAvg.toFixed(1)}
                          </Text>
                        </View>
                        {insights.engagementTrend.previousAvg !== undefined && (
                          <>
                            <MaterialIcons name="arrow-forward" size={16} color="#9ca3af" />
                            <View style={styles.trendStatItem}>
                              <Text style={styles.trendStatLabel}>Last Week</Text>
                              <Text style={[styles.trendStatValue, { color: '#6b7280' }]}>
                                {insights.engagementTrend.previousAvg.toFixed(1)}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Enhanced Warnings */}
              {insights.warnings && insights.warnings.length > 0 && (
                <View style={[styles.card, styles.insightCardLarge, styles.warningCardLarge]}>
                  <View style={styles.insightCardHeader}>
                    <View style={styles.warningHeaderContent}>
                      <MaterialIcons name="warning" size={24} color="#ef4444" />
                      <Text style={styles.insightCardTitle}>Important Notices</Text>
                    </View>
                    <View style={[styles.warningCountBadge, { backgroundColor: '#fee2e2' }]}>
                      <Text style={styles.warningCountText}>{insights.warnings.length}</Text>
                    </View>
                  </View>
                  {insights.warnings.map((warning, index) => (
                    <View key={index} style={styles.warningItemLarge}>
                      <View style={styles.warningItemHeader}>
                        <Text style={styles.warningTitleLarge}>{warning.title}</Text>
                        {warning.severity && (
                          <View style={[
                            styles.severityBadge,
                            warning.severity === 'high' ? styles.severityHigh :
                            warning.severity === 'medium' ? styles.severityMedium : styles.severityLow
                          ]}>
                            <Text style={styles.severityText}>{warning.severity.toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.warningMessageLarge}>{warning.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Enhanced Recommendations */}
              {insights.recommendations && insights.recommendations.length > 0 && (
                <View style={[styles.card, styles.insightCardLarge, styles.recommendationCardLarge]}>
                  <View style={styles.insightCardHeader}>
                    <View style={styles.recommendationHeaderContent}>
                      <MaterialIcons name="lightbulb" size={24} color="#f59e0b" />
                      <Text style={styles.insightCardTitle}>Recommendations</Text>
                    </View>
                    <View style={[styles.recommendationCountBadge, { backgroundColor: '#fef3c7' }]}>
                      <Text style={styles.recommendationCountText}>{insights.recommendations.length}</Text>
                    </View>
                  </View>
                  {insights.recommendations.map((rec, index) => (
                    <View key={index} style={[
                      styles.recommendationItemLarge,
                      rec.priority === 'high' && styles.recommendationItemHigh
                    ]}>
                      <View style={styles.recommendationItemHeader}>
                        <MaterialIcons 
                          name={rec.priority === 'high' ? 'priority-high' : rec.priority === 'medium' ? 'star' : 'check-circle'} 
                          size={20} 
                          color={rec.priority === 'high' ? '#ef4444' : rec.priority === 'medium' ? '#f59e0b' : '#10b981'} 
                        />
                        <Text style={styles.recommendationTitleLarge}>{rec.title}</Text>
                      </View>
                      <Text style={styles.recommendationMessageLarge}>{rec.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Confusion Patterns - Only show for day view */}
              {timeRange === 'day' && insights.confusionPatterns &&
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

              {/* Progress - Only show for day view */}
              {timeRange === 'day' && insights.progress && insights.progress.accuracyChange !== undefined && (
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

          {/* Insights Section - For Day View */}
          {timeRange === 'day' && insights && insights.hasData && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Insights & Analysis</Text>

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

          {/* Weekly Calendar View */}
          {timeRange === 'week' && currentWeekData.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📅 This Week's Progress</Text>
              
              {/* Week Calendar Grid - Larger Cards */}
              <View style={styles.weekCalendarLarge}>
                {currentWeekData.map((day, index) => {
                  const data = day.data;
                  const sessions = data?.sessions || 0;
                  const accuracy = data?.totalQuestions > 0
                    ? ((data.totalCorrect / data.totalQuestions) * 100)
                    : 0;
                  
                  // Calculate engagement score
                  const engagementCounts = data?.engagementCounts || {};
                  const high = engagementCounts.HIGH || 0;
                  const medium = engagementCounts.MEDIUM || 0;
                  const low = engagementCounts.LOW || 0;
                  const total = high + medium + low;
                  const engagementScore = total > 0
                    ? ((high * 3 + medium * 2 + low * 1) / total) * 33.33
                    : 0;

                  // Get dominant emotion
                  const emotionCounts = data?.emotionCounts || {};
                  const dominantEmotion = Object.entries(emotionCounts)
                    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

                  // Get confusion count
                  const confusionCount = data?.totalConfusion || 0;

                  return (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.8}
                      style={[
                        styles.dayCardLarge,
                        day.isToday && styles.dayCardTodayLarge,
                        !data && styles.dayCardEmptyLarge,
                      ]}
                    >
                      {/* Header Section */}
                      <View style={styles.dayCardHeaderLarge}>
                        <View>
                          <Text style={[styles.dayNameLarge, day.isToday && styles.dayNameTodayLarge]}>
                            {day.dayName}
                          </Text>
                          <Text style={[styles.dayNumberLarge, day.isToday && styles.dayNumberTodayLarge]}>
                            {day.dayNumber}
                          </Text>
                        </View>
                        {data && (
                          <View style={styles.dayEmotionContainerLarge}>
                            <Text style={styles.dayEmotionLarge}>
                              {getEmotionEmoji(dominantEmotion)}
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      {data ? (
                        <View style={styles.dayCardContentLarge}>
                          {/* Sessions */}
                          <View style={styles.dayMetricLarge}>
                            <View style={[styles.dayMetricIconContainer, { backgroundColor: '#eff6ff' }]}>
                              <MaterialIcons name="videogame-asset" size={20} color="#3b82f6" />
                            </View>
                            <View style={styles.dayMetricInfoLarge}>
                              <Text style={styles.dayMetricLabelLarge}>Sessions</Text>
                              <Text style={styles.dayMetricValueLarge}>{sessions}</Text>
                            </View>
                          </View>

                          {/* Engagement Progress */}
                          <View style={styles.dayProgressContainerLarge}>
                            <Text style={styles.dayProgressLabelLarge}>Engagement</Text>
                            <View style={styles.dayProgressBarLarge}>
                              <View
                                style={[
                                  styles.dayProgressFillLarge,
                                  {
                                    width: `${engagementScore}%`,
                                    backgroundColor:
                                      engagementScore > 66
                                        ? '#10b981'
                                        : engagementScore > 33
                                        ? '#f59e0b'
                                        : '#ef4444',
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.dayProgressTextLarge}>
                              {engagementScore > 66 ? 'HIGH' : engagementScore > 33 ? 'MEDIUM' : 'LOW'}
                            </Text>
                          </View>

                          {/* Accuracy */}
                          <View style={styles.dayAccuracyContainerLarge}>
                            <View style={[styles.dayMetricIconContainer, { backgroundColor: '#f0fdf4' }]}>
                              <MaterialIcons name="check-circle" size={20} color="#10b981" />
                            </View>
                            <View style={styles.dayMetricInfoLarge}>
                              <Text style={styles.dayMetricLabelLarge}>Accuracy</Text>
                              <Text style={styles.dayAccuracyValueLarge}>{accuracy.toFixed(0)}%</Text>
                            </View>
                          </View>

                          {/* Confusion Count */}
                          {confusionCount > 0 && (
                            <View style={styles.dayConfusionContainerLarge}>
                              <MaterialIcons name="help-outline" size={18} color="#f59e0b" />
                              <Text style={styles.dayConfusionTextLarge}>
                                {confusionCount} confused letter{confusionCount !== 1 ? 's' : ''}
                              </Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={styles.dayNoDataContainerLarge}>
                          <MaterialIcons name="event-busy" size={40} color="#d1d5db" />
                          <Text style={styles.dayNoDataTextLarge}>No activity</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Weekly Summary Stats */}
              {currentWeekData.some(d => d.data) && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Weekly Summary</Text>
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Total Sessions</Text>
                      <Text style={styles.summaryValue}>
                        {currentWeekData.reduce((sum, d) => sum + (d.data?.sessions || 0), 0)}
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Avg Accuracy</Text>
                      <Text style={styles.summaryValue}>
                        {(() => {
                          const totalCorrect = currentWeekData.reduce(
                            (sum, d) => sum + (d.data?.totalCorrect || 0),
                            0
                          );
                          const totalQuestions = currentWeekData.reduce(
                            (sum, d) => sum + (d.data?.totalQuestions || 0),
                            0
                          );
                          return totalQuestions > 0
                            ? ((totalCorrect / totalQuestions) * 100).toFixed(1)
                            : 0;
                        })()}
                        %
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>Active Days</Text>
                      <Text style={styles.summaryValue}>
                        {currentWeekData.filter(d => d.data).length}/7
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Predictive Insights Section - Only for Week View */}
          {timeRange === 'week' && predictiveInsights && predictiveInsights.hasPredictions && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔮 Predictive Insights</Text>
              
              {/* Risk Level Indicator */}
              {predictiveInsights.riskLevel && (
                <View style={styles.card}>
                  <View style={styles.riskLevelContainer}>
                    <Text style={styles.riskLevelLabel}>Overall Assessment:</Text>
                    <View
                      style={[
                        styles.riskLevelBadge,
                        predictiveInsights.riskLevel === 'high'
                          ? styles.riskLevelHigh
                          : predictiveInsights.riskLevel === 'medium'
                          ? styles.riskLevelMedium
                          : styles.riskLevelLow,
                      ]}
                    >
                      <Text style={styles.riskLevelText}>
                        {predictiveInsights.riskLevel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Learning Patterns */}
              {predictiveInsights.learningPatterns?.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>📚 Learning Patterns</Text>
                  {predictiveInsights.learningPatterns.map((pattern, index) => (
                    <View key={index} style={styles.predictionItem}>
                      <View style={styles.predictionHeader}>
                        <Text style={styles.predictionTitle}>{pattern.title}</Text>
                        <View
                          style={[
                            styles.confidenceBadge,
                            pattern.severity === 'high'
                              ? styles.confidenceHigh
                              : styles.confidenceMedium,
                          ]}
                        >
                          <Text style={styles.confidenceText}>
                            {pattern.confidence}% confidence
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.predictionMessage}>{pattern.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Attention Patterns */}
              {predictiveInsights.attentionPatterns?.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🎯 Attention Patterns</Text>
                  {predictiveInsights.attentionPatterns.map((pattern, index) => (
                    <View key={index} style={styles.predictionItem}>
                      <View style={styles.predictionHeader}>
                        <Text style={styles.predictionTitle}>{pattern.title}</Text>
                        <View
                          style={[
                            styles.confidenceBadge,
                            pattern.severity === 'high'
                              ? styles.confidenceHigh
                              : styles.confidenceMedium,
                          ]}
                        >
                          <Text style={styles.confidenceText}>
                            {pattern.confidence}% confidence
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.predictionMessage}>{pattern.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Emotional Patterns */}
              {predictiveInsights.emotionalPatterns?.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>💭 Emotional Patterns</Text>
                  {predictiveInsights.emotionalPatterns.map((pattern, index) => (
                    <View key={index} style={styles.predictionItem}>
                      <View style={styles.predictionHeader}>
                        <Text style={styles.predictionTitle}>{pattern.title}</Text>
                        <View
                          style={[
                            styles.confidenceBadge,
                            pattern.severity === 'high'
                              ? styles.confidenceHigh
                              : styles.confidenceMedium,
                          ]}
                        >
                          <Text style={styles.confidenceText}>
                            {pattern.confidence}% confidence
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.predictionMessage}>{pattern.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Predictive Recommendations */}
              {predictiveInsights.recommendations?.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>💡 Actionable Recommendations</Text>
                  {predictiveInsights.recommendations.map((rec, index) => (
                    <View
                      key={index}
                      style={[
                        styles.recommendationItem,
                        rec.priority === 'high' && styles.recommendationHigh,
                      ]}
                    >
                      <Text style={styles.recommendationTitle}>{rec.title}</Text>
                      <Text style={styles.recommendationMessage}>{rec.message}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Recent Sessions - Only show for day view */}
          {timeRange === 'day' && (recentSessions.gameSessions.length > 0 || recentSessions.storySessions.length > 0) && (
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
  // Weekly Calendar Styles
  weekCalendar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  dayCard: {
    width: '13.5%',
    minWidth: 45,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dayCardToday: {
    borderColor: '#3b82f6',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  dayCardEmpty: {
    backgroundColor: '#f9fafb',
    opacity: 0.6,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dayNameToday: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 6,
  },
  dayNumberToday: {
    color: '#3b82f6',
  },
  dayMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayMetricText: {
    fontSize: 10,
    color: '#6b7280',
    marginLeft: 2,
  },
  dayProgressContainer: {
    width: '100%',
    marginBottom: 4,
  },
  dayProgressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  dayProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  dayAccuracy: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  dayEmotion: {
    fontSize: 16,
  },
  dayNoData: {
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  // Predictive Insights Styles
  riskLevelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  riskLevelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  riskLevelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  riskLevelLow: {
    backgroundColor: '#10b981',
  },
  riskLevelMedium: {
    backgroundColor: '#f59e0b',
  },
  riskLevelHigh: {
    backgroundColor: '#ef4444',
  },
  riskLevelText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  predictionItem: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  predictionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    marginRight: 8,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  confidenceHigh: {
    backgroundColor: '#fee2e2',
  },
  confidenceMedium: {
    backgroundColor: '#fef3c7',
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#991b1b',
  },
  predictionMessage: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  recommendationHigh: {
    borderLeftColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  // Enhanced Weekly Calendar Styles - Larger Cards
  weekCalendarLarge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  dayCardLarge: {
    width: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  dayCardTodayLarge: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
    shadowColor: '#3b82f6',
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  dayCardEmptyLarge: {
    backgroundColor: '#f9fafb',
    opacity: 0.7,
    borderColor: '#d1d5db',
  },
  dayCardHeaderLarge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
  },
  dayNameLarge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dayNameTodayLarge: {
    color: '#3b82f6',
  },
  dayNumberLarge: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  dayNumberTodayLarge: {
    color: '#3b82f6',
  },
  dayEmotionContainerLarge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayEmotionLarge: {
    fontSize: 32,
  },
  dayCardContentLarge: {
    gap: 14,
  },
  dayMetricLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayMetricIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayMetricInfoLarge: {
    flex: 1,
  },
  dayMetricLabelLarge: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  dayMetricValueLarge: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  dayProgressContainerLarge: {
    marginTop: 4,
  },
  dayProgressLabelLarge: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
    fontWeight: '600',
  },
  dayProgressBarLarge: {
    height: 10,
    backgroundColor: '#e5e7eb',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  dayProgressFillLarge: {
    height: '100%',
    borderRadius: 5,
  },
  dayProgressTextLarge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  dayAccuracyContainerLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  dayAccuracyValueLarge: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10b981',
  },
  dayConfusionContainerLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    padding: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  dayConfusionTextLarge: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },
  dayNoDataContainerLarge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  dayNoDataTextLarge: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 12,
    fontWeight: '500',
  },
  // Enhanced Insights Styles
  insightCardLarge: {
    padding: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  insightCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  insightCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  moodBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodBadgeEmoji: {
    fontSize: 28,
  },
  moodContainerLarge: {
    marginTop: 8,
  },
  moodMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  moodEmojiLarge: {
    fontSize: 48,
  },
  moodTextLarge: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  moodSubtextLarge: {
    fontSize: 14,
    color: '#6b7280',
  },
  emotionChartLarge: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emotionBarItemLarge: {
    marginBottom: 16,
  },
  emotionBarLabelLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  emotionEmojiLarge: {
    fontSize: 20,
    marginRight: 8,
  },
  emotionNameLarge: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
    flex: 1,
  },
  emotionPercentageLarge: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    minWidth: 45,
    textAlign: 'right',
  },
  emotionBarContainerLarge: {
    width: '100%',
  },
  emotionBarLarge: {
    height: 24,
    borderRadius: 12,
    minWidth: 4,
  },
  trendContentLarge: {
    marginTop: 8,
  },
  trendMessageLarge: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '500',
    marginBottom: 16,
    lineHeight: 24,
  },
  trendStatsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  trendStatItem: {
    alignItems: 'center',
  },
  trendStatLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  trendStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  trendBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningCardLarge: {
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  warningHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningCountBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
  },
  warningItemLarge: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  warningItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  warningTitleLarge: {
    fontSize: 16,
    fontWeight: '700',
    color: '#dc2626',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  severityHigh: {
    backgroundColor: '#fee2e2',
  },
  severityMedium: {
    backgroundColor: '#fef3c7',
  },
  severityLow: {
    backgroundColor: '#dbeafe',
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#991b1b',
  },
  warningMessageLarge: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  recommendationCardLarge: {
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    backgroundColor: '#f0f9ff',
  },
  recommendationHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recommendationCountBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
  },
  recommendationItemLarge: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  recommendationItemHigh: {
    borderLeftColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  recommendationItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  recommendationTitleLarge: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
    flex: 1,
  },
  recommendationMessageLarge: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginLeft: 30,
  },
});

export default EmotionDashboardScreen;
