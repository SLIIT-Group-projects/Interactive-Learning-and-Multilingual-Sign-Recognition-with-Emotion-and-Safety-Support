import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import hazardDatabaseService, { HazardAlert, HazardStats } from '@/services/hazardDatabase.service';

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const colors = Colors[colorScheme ?? 'light'];

  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [stats, setStats] = useState<HazardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  // Temporary user ID (replace with actual auth when ready)
  const userId = 'default-user'; // TODO: Get from auth service

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch all hazard alerts (don't filter by userId since some may have userId: null)
      // You can optionally filter by userId if needed
      const [alertsData, statsData] = await Promise.all([
        hazardDatabaseService.getHazardAlerts({
          // userId, // Commented out to show all alerts regardless of userId
          limit: 100,
        }),
        hazardDatabaseService.getHazardStats({
          // userId, // Commented out to show stats for all alerts
        }),
      ]);

      // Filter alerts by priority
      let filteredAlerts = alertsData;
      if (filter !== 'all') {
        filteredAlerts = alertsData.filter((alert) => {
          const urgency = getUrgencyLevel(alert.priority);
          return urgency === filter;
        });
      }

      setAlerts(filteredAlerts);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
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

  const getUrgencyLevel = (priority: number): 'critical' | 'high' | 'medium' | 'low' => {
    if (priority >= 9) return 'critical';
    if (priority >= 7) return 'high';
    if (priority >= 5) return 'medium';
    return 'low';
  };

  const getUrgencyColor = (priority: number): string => {
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
        return colors.tint;
    }
  };

  const getHazardIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      fire_alarm: 'local-fire-department',
      smoke_alarm: 'smoke-free',
      gun_shot: 'warning',
      siren: 'emergency',
      glass_breaking: 'broken-image',
      car_horn: 'directions-car',
      baby_crying: 'child-care',
      dog_barking: 'pets',
      chainsaw: 'build',
      fireworks: 'celebration',
      fire: 'whatshot',
      alarm: 'notifications',
    };
    return iconMap[type] || 'warning';
  };
  
  const getHazardIconName = (type: string): string => {
    // Map to SF Symbols names that exist in our mapping
    return 'warning'; // Default icon
  };

  const formatDate = (dateString: string): string => {
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

  const formatHazardType = (type: string): string => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleDeleteAlert = (alert: HazardAlert) => {
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
              Alert.alert('Success', 'Alert deleted successfully');
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete alert');
            }
          },
        },
      ]
    );
  };

  const handleMarkAsRead = async (alert: HazardAlert) => {
    try {
      await hazardDatabaseService.updateAlertStatus(alert.id, 'verified');
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update alert');
    }
  };

  if (loading && !refreshing) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color={colors.tint} />
        <ThemedText style={styles.loadingText}>Loading dashboard...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }>
        {/* Header */}
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Parent Dashboard
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Monitor identified hazard alerts
          </ThemedText>
        </ThemedView>

        {/* Statistics Cards */}
        {stats && (
          <View style={styles.statsContainer}>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.icon }]}>
              <ThemedText style={styles.statValue}>{stats.total}</ThemedText>
              <ThemedText style={styles.statLabel}>Total Alerts</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FF3B30', borderColor: '#FF3B30' }]}>
              <ThemedText style={[styles.statValue, { color: '#fff' }]}>{stats.hazards}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: '#fff' }]}>Hazards</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.icon }]}>
              <ThemedText style={styles.statValue}>
                {(stats.averageConfidence * 100).toFixed(0)}%
              </ThemedText>
              <ThemedText style={styles.statLabel}>Avg Confidence</ThemedText>
            </View>
          </View>
        )}

        {/* Filter Buttons */}
        <View style={styles.filterContainer}>
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((filterType) => (
            <TouchableOpacity
              key={filterType}
              style={[
                styles.filterButton,
                {
                  backgroundColor: filter === filterType ? colors.tint : colors.background,
                  borderColor: colors.icon,
                },
              ]}
              onPress={() => setFilter(filterType)}>
              <Text
                style={[
                  styles.filterButtonText,
                  { color: filter === filterType ? '#fff' : colors.text },
                ]}>
                {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Alerts List */}
        {alerts.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <IconSymbol name="house.fill" size={64} color={colors.icon} />
            <ThemedText style={styles.emptyText}>No alerts found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {filter === 'all'
                ? 'No hazard alerts have been detected yet'
                : `No ${filter} priority alerts found`}
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.alertsList}>
            {alerts.map((alert) => {
              const urgency = getUrgencyLevel(alert.priority);
              const urgencyColor = getUrgencyColor(alert.priority);

              return (
                <ThemedView key={alert.id} style={styles.alertCard}>
                  <View style={styles.alertHeader}>
                    <View
                      style={[
                        styles.alertIconContainer,
                        { backgroundColor: urgencyColor + '20' },
                      ]}>
                      <IconSymbol
                        name="house.fill"
                        size={24}
                        color={urgencyColor}
                      />
                    </View>
                    <View style={styles.alertInfo}>
                      <ThemedText type="defaultSemiBold" style={styles.alertType}>
                        {formatHazardType(alert.type)}
                      </ThemedText>
                      <ThemedText style={styles.alertTime}>
                        {formatDate(alert.timestamp)}
                      </ThemedText>
                      <View style={styles.alertMeta}>
                        <View style={[styles.badge, { backgroundColor: urgencyColor }]}>
                          <Text style={styles.badgeText}>
                            {urgency.toUpperCase()}
                          </Text>
                        </View>
                        <ThemedText style={styles.confidence}>
                          {(alert.confidence * 100).toFixed(0)}% confidence
                        </ThemedText>
                      </View>
                    </View>
                  </View>

                  {alert.location && (
                    <ThemedView style={styles.locationInfo}>
                      <IconSymbol name="mappin.circle.fill" size={16} color={colors.icon} />
                      <ThemedText style={styles.locationText}>
                        {alert.location.type || 'Location detected'}
                      </ThemedText>
                    </ThemedView>
                  )}

                  <View style={styles.alertActions}>
                    {alert.status === 'detected' && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleMarkAsRead(alert)}>
                        <IconSymbol name="house.fill" size={18} color={colors.tint} />
                        <Text style={[styles.actionText, { color: colors.tint }]}>Mark as Read</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDeleteAlert(alert)}>
                      <IconSymbol name="trash" size={18} color="#FF3B30" />
                      <Text style={[styles.actionText, { color: '#FF3B30' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </ThemedView>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  alertsList: {
    gap: 16,
  },
  alertCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  alertHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  alertIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertInfo: {
    flex: 1,
  },
  alertType: {
    fontSize: 18,
    marginBottom: 4,
  },
  alertTime: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  confidence: {
    fontSize: 12,
    opacity: 0.7,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  locationText: {
    fontSize: 14,
    opacity: 0.8,
  },
  alertActions: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

