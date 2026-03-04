import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getParentChildren } from '../../services/firestore/userService';
import hazardDatabaseService from '../../../services/hazardDatabase.service';

/**
 * Parent Hazard History Screen
 * Shows recorded hazard sounds from the shared `sounds` collection.
 * This is a React Navigation version of the Expo Router dashboard.
 */

const HazardHistoryScreen = () => {
  const { userData } = useAuth();
  const userId = userData?.uid || null;

  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'critical' | 'high' | 'medium' | 'low'
  const [children, setChildren] = useState([]);

  // Load children for parent users
  useEffect(() => {
    const loadChildren = async () => {
      if (userData && userData.role === 'parent') {
        try {
          const childrenList = await getParentChildren(userData.uid);
          setChildren(childrenList);
        } catch (error) {
          console.error('Error loading children:', error);
        }
      }
    };
    loadChildren();
  }, [userData]);

  useEffect(() => {
    loadData();
  }, [filter, userId, children]);

  const getUrgencyLevel = (priority) => {
    if (priority >= 9) return 'critical';
    if (priority >= 7) return 'high';
    if (priority >= 5) return 'medium';
    return 'low';
  };

  const getUrgencyColor = (priority) => {
    const level = getUrgencyLevel(priority);
    switch (level) {
      case 'critical':
        return '#FF3B30';
      case 'high':
        return '#FF9500';
      case 'medium':
        return '#FFCC00';
      case 'low':
        return '#34C759';
      default:
        return '#6366f1';
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatHazardType = (type) => {
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // For parent users, get hazards from all children
      // For child users, get their own hazards
      let queryParams = {};
      if (userData?.role === 'parent' && children.length > 0) {
        // Get all children's userIds
        const childrenUserIds = children.map(child => child.uid).filter(Boolean);
        if (childrenUserIds.length > 0) {
          queryParams.userIds = childrenUserIds;
        }
      } else if (userId) {
        // Single userId for child users
        queryParams.userId = userId;
      }

      const [alertsData, statsData] = await Promise.all([
        hazardDatabaseService.getHazardAlerts({
          ...queryParams,
          limit: 100,
        }),
        hazardDatabaseService.getHazardStats({
          ...queryParams,
        }),
      ]);

      let filtered = alertsData;
      if (filter !== 'all') {
        filtered = alertsData.filter((alert) => {
          const urgency = getUrgencyLevel(alert.priority);
          return urgency === filter;
        });
      }

      setAlerts(filtered);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading hazard history:', error);
      Alert.alert('Error', error.message || 'Failed to load hazard alerts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleDeleteAlert = (alert) => {
    Alert.alert(
      'Delete Alert',
      `Are you sure you want to delete this ${formatHazardType(alert.type)} alert?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await hazardDatabaseService.deleteAlert(alert.id);
              await loadData();
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete alert');
            }
          },
        },
      ]
    );
  };

  const handleMarkAsRead = async (alert) => {
    try {
      await hazardDatabaseService.updateAlertStatus(alert.id, 'verified');
      await loadData();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update alert');
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading hazard history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Hazard Alerts</Text>
          <Text style={styles.subtitle}>
            Review recorded hazard sounds detected for your child
          </Text>
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total Alerts</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#fee2e2' }]}>
              <Text style={[styles.statValue, { color: '#b91c1c' }]}>{stats.hazards}</Text>
              <Text style={[styles.statLabel, { color: '#b91c1c' }]}>Hazards</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {(stats.averageConfidence * 100).toFixed(0)}%
              </Text>
              <Text style={styles.statLabel}>Avg Confidence</Text>
            </View>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filterRow}>
          {['all', 'critical', 'high', 'medium', 'low'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                filter === f && styles.filterChipActive,
              ]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filter === f && styles.filterChipTextActive,
                ]}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Alerts list */}
        {alerts.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="hearing" size={48} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No alerts found</Text>
            <Text style={styles.emptyText}>
              {filter === 'all'
                ? 'No hazard alerts have been detected yet.'
                : `No ${filter} priority alerts found.`}
            </Text>
          </View>
        ) : (
          alerts.map((alert) => {
            const urgency = getUrgencyLevel(alert.priority);
            const color = getUrgencyColor(alert.priority);

            return (
              <View key={alert.id} style={styles.alertCard}>
                <View style={styles.alertHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: color + '22' }]}>
                    <MaterialIcons name="warning" size={24} color={color} />
                  </View>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertType}>{formatHazardType(alert.type)}</Text>
                    <Text style={styles.alertTime}>{formatDate(alert.timestamp)}</Text>
                    <View style={styles.alertMeta}>
                      <View style={[styles.badge, { backgroundColor: color }]}>
                        <Text style={styles.badgeText}>{urgency.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.confidenceText}>
                        {(alert.confidence * 100).toFixed(0)}% confidence
                      </Text>
                    </View>
                  </View>
                </View>

                {alert.location && (
                  <View style={styles.locationRow}>
                    <MaterialIcons name="place" size={16} color="#6b7280" />
                    <Text style={styles.locationText}>
                      {alert.location.type || 'Location detected'}
                    </Text>
                  </View>
                )}

                <View style={styles.actionsRow}>
                  {alert.status === 'detected' && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleMarkAsRead(alert)}
                    >
                      <MaterialIcons name="check-circle" size={18} color="#10b981" />
                      <Text style={[styles.actionText, { color: '#10b981' }]}>
                        Mark as Read
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeleteAlert(alert)}
                  >
                    <MaterialIcons name="delete" size={18} color="#ef4444" />
                    <Text style={[styles.actionText, { color: '#ef4444' }]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 8,
    color: '#6b7280',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#eef2ff',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  filterChipText: {
    fontSize: 13,
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  alertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  alertHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  alertInfo: {
    flex: 1,
  },
  alertType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  alertTime: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  confidenceText: {
    fontSize: 12,
    color: '#4b5563',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#6b7280',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default HazardHistoryScreen;

