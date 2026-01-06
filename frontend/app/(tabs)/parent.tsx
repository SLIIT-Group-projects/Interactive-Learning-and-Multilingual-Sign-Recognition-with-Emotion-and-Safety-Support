import React, { useMemo, useState } from 'react';
import {
	View,
	Text,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	TouchableOpacity,
	Modal,
} from 'react-native';
import { useRouter } from 'expo-router';

/* --- Mock data (TODO: replace with API) --- */
type Session = {
	id: string;
	dateTime: string; // ISO
	storyTitle: string;
	emotion: 'Happy' | 'Sad' | 'Angry' | 'Neutral' | 'Disgust' | 'Surprise';
	intensity: 'Low' | 'Medium' | 'High';
	durationSeconds: number;
	engagementScore: number; // 0-100
	notes?: string;
};

const MOCK_SESSIONS: Session[] = [
	{ id: 's1', dateTime: new Date().toISOString(), storyTitle: 'The Brave Little Squirrel', emotion: 'Happy', intensity: 'Low', durationSeconds: 180, engagementScore: 88 },
	{ id: 's2', dateTime: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), storyTitle: 'Luna and the Moon', emotion: 'Sad', intensity: 'Low', durationSeconds: 300, engagementScore: 50 },
	{ id: 's3', dateTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), storyTitle: 'Story Of Baby Dinosaur', emotion: 'Happy', intensity: 'High', durationSeconds: 900, engagementScore: 95 },
	{ id: 's4', dateTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), storyTitle: 'The Colorful Garden', emotion: 'Angry', intensity: 'High', durationSeconds: 420, engagementScore: 40 },
	{ id: 's5', dateTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(), storyTitle: 'Luna and the Moon', emotion: 'Neutral', intensity: 'Medium', durationSeconds: 300, engagementScore: 70 },
	{ id: 's6', dateTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), storyTitle: 'The Brave Little Squirrel', emotion: 'Happy', intensity: 'Low', durationSeconds: 200, engagementScore: 45 },
];

/* --- Children Data (Hardcoded - TODO: Connect to backend) --- */
const CHILDREN = [
	{ id: '1', name: 'Liviru' },
	{ id: '2', name: 'Emma' },
];

/* --- Helpers --- */
const isSameDay = (d1: Date, d2: Date) =>
	d1.getFullYear() === d2.getFullYear() &&
	d1.getMonth() === d2.getMonth() &&
	d1.getDate() === d2.getDate();

const filterByRange = (sessions: Session[], range: 'Day' | 'Week' | 'Month') => {
	const now = new Date();
	if (range === 'Day') {
		return sessions.filter((s) => isSameDay(new Date(s.dateTime), now));
	}
	if (range === 'Week') {
		const weekAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
		return sessions.filter((s) => new Date(s.dateTime) >= weekAgo);
	}
	const monthAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
	return sessions.filter((s) => new Date(s.dateTime) >= monthAgo);
};

/* --- Emotion Overview Component --- */
const EmotionOverview: React.FC = () => {
	const emotions = [
		{ emoji: '😊', label: 'Happy' },
		{ emoji: '😢', label: 'Sad' },
		{ emoji: '😠', label: 'Anger' },
		{ emoji: '🤢', label: 'Disgust' },
		{ emoji: '😐', label: 'Neutral' },
		{ emoji: '😲', label: 'Suprise' },
	];

	return (
		<View style={styles.emotionOverview}>
			{emotions.map((emotion, idx) => (
				<View key={idx} style={styles.emotionItem}>
					<View style={styles.emotionCircle}>
						<Text style={styles.emotionEmoji}>{emotion.emoji}</Text>
					</View>
					<Text style={styles.emotionLabel}>{emotion.label}</Text>
				</View>
			))}
		</View>
	);
};

/* --- Children Dropdown Component --- */
const ChildrenDropdown: React.FC<{
	selectedChild: typeof CHILDREN[0];
	children: typeof CHILDREN;
	onSelect: (child: typeof CHILDREN[0]) => void;
}> = ({ selectedChild, children, onSelect }) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<View>
			<TouchableOpacity
				onPress={() => setIsOpen(true)}
				style={styles.dropdownTrigger}
			>
				<Text style={styles.dropdownTriggerText}>{selectedChild.name}</Text>
				<Text style={styles.dropdownArrow}>▼</Text>
			</TouchableOpacity>

			<Modal
				visible={isOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setIsOpen(false)}
			>
				<TouchableOpacity
					style={styles.modalOverlay}
					activeOpacity={1}
					onPress={() => setIsOpen(false)}
				>
					<View style={styles.dropdownMenu}>
						{children.map((child) => (
							<TouchableOpacity
								key={child.id}
								style={[
									styles.dropdownItem,
									selectedChild.id === child.id && styles.dropdownItemActive,
								]}
								onPress={() => {
									onSelect(child);
									setIsOpen(false);
								}}
							>
								<Text
									style={[
										styles.dropdownItemText,
										selectedChild.id === child.id && styles.dropdownItemTextActive,
									]}
								>
									{child.name}
								</Text>
								{selectedChild.id === child.id && (
									<Text style={styles.checkmark}>✓</Text>
								)}
							</TouchableOpacity>
						))}
					</View>
				</TouchableOpacity>
			</Modal>
		</View>
	);
};

/* --- Parent Dashboard Screen --- */
export default function ParentDashboardScreen() {
	const router = useRouter();
	const [selectedChild, setSelectedChild] = useState(CHILDREN[0]);
	const [view, setView] = useState<'Liviru' | 'Overview'>('Liviru');
	const [range, setRange] = useState<'Day' | 'Week' | 'Month'>('Day');

	// TODO: replace MOCK_SESSIONS with API call and subscribe to live updates
	const sessions = useMemo(() => filterByRange(MOCK_SESSIONS, range), [range]);

	const sessionCount = useMemo(() => sessions.length, [sessions]);

	const avgEngagement = useMemo(() => {
		if (!sessions.length) return 0;
		return Math.round(sessions.reduce((s, x) => s + x.engagementScore, 0) / sessions.length);
	}, [sessions]);

	const mostCommonEmotion = useMemo(() => {
		const tally: Record<string, number> = {};
		sessions.forEach((s) => (tally[s.emotion] = (tally[s.emotion] || 0) + 1));
		const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
		return sorted[0]?.[0] ?? 'Neutral';
	}, [sessions]);

	const avgIntensity = useMemo(() => {
		if (!sessions.length) return 'Low';
		const map: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
		const avg = sessions.reduce((s, x) => s + map[x.intensity], 0) / sessions.length;
		if (avg < 1.5) return 'Low';
		if (avg < 2.5) return 'Medium';
		return 'High';
	}, [sessions]);

	// Interpret state from emotion + intensity
	const interpreted = useMemo(() => {
		const e = mostCommonEmotion;
		const i = avgIntensity;
		if (e === 'Happy' && i === 'Low') return { label: 'Calm', emoji: '😊' };
		if (e === 'Happy') return { label: 'Happy', emoji: '😊' };
		return { label: e, emoji: '😐' };
	}, [mostCommonEmotion, avgIntensity]);

	// Trend: last 7 days
	const last7 = useMemo(() => {
		const res: { day: string; emotion: string; dotColor: string }[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date();
			d.setDate(d.getDate() - i);
			const dayStr = d.toLocaleDateString(undefined, { weekday: 'short' });
			const daySessions = MOCK_SESSIONS.filter((s) => isSameDay(new Date(s.dateTime), d));
			const tally: Record<string, number> = {};
			daySessions.forEach((s) => (tally[s.emotion] = (tally[s.emotion] || 0) + 1));
			const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
			
			const colorMap: Record<string, string> = {
				Happy: '#67D37A',
				Sad: '#6CB4FF',
				Angry: '#FF6B6B',
				Neutral: '#DDE3E8',
				'—': '#DDE3E8',
			};
			
			res.push({ day: dayStr, emotion: dominant, dotColor: colorMap[dominant] ?? '#DDE3E8' });
		}
		return res;
	}, []);

	// Achievements: Calm streak
	const calmStreakDays = useMemo(() => {
		const angrySessions = sessions.filter((s) => s.emotion === 'Angry').sort((a, b) => +new Date(b.dateTime) - +new Date(a.dateTime));
		if (angrySessions.length === 0 && sessions.length > 0) {
			// No angry sessions, calculate from first session
			const firstSession = sessions.sort((a, b) => +new Date(a.dateTime) - +new Date(b.dateTime))[0];
			if (firstSession) {
				const days = Math.floor((Date.now() - new Date(firstSession.dateTime).getTime()) / (1000 * 60 * 60 * 24));
				return days;
			}
			return 3; // Default
		}
		if (angrySessions.length > 0) {
			const lastAngry = new Date(angrySessions[0].dateTime);
			const days = Math.floor((Date.now() - lastAngry.getTime()) / (1000 * 60 * 60 * 24));
			return days;
		}
		return 3;
	}, [sessions]);

	return (
		<SafeAreaView style={styles.safe}>
			{/* Header */}
			<View style={styles.headerRow}>
				<TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
					<Text style={styles.backIcon}>←</Text>
				</TouchableOpacity>
				<Text style={styles.headerTitle}>Emotion Dashboard</Text>
				<TouchableOpacity style={styles.profileBtn}>
					<View style={styles.profileIcon} />
				</TouchableOpacity>
			</View>

			{/* Navigation/Filter Bar */}
			<View style={styles.navBar}>
				<View style={styles.dropdownContainer}>
					<ChildrenDropdown
						selectedChild={selectedChild}
						children={CHILDREN}
						onSelect={setSelectedChild}
					/>
				</View>
				<TouchableOpacity 
					onPress={() => setView('Overview')} 
					style={[styles.navItem, view === 'Overview' && styles.navItemActive]}
				>
					<Text style={[styles.navText, view === 'Overview' && styles.navTextActive]}>Overview</Text>
				</TouchableOpacity>
			</View>

			<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
				{/* Emotion Overview Section */}
				<EmotionOverview />

				{/* Key Metrics Cards (2x2 Grid) */}
				<View style={styles.metricsGrid}>
					<View style={styles.metricCard}>
						<Text style={styles.metricValue}>{sessionCount}</Text>
						<Text style={styles.metricSubtitle}>
							{range === 'Day' ? "Today's Sessions" : range === 'Week' ? "Week's Sessions" : "Month's Sessions"}
						</Text>
						<Text style={styles.metricLabel}>{range === 'Day' ? 'today' : range.toLowerCase()}</Text>
					</View>
					<View style={styles.metricCard}>
						<Text style={[styles.metricValue, styles.metricValueYellow]}>{mostCommonEmotion}</Text>
						<Text style={styles.metricSubtitle}>Common Emotion</Text>
						<Text style={styles.metricLabel}>{range}</Text>
					</View>
					<View style={styles.metricCard}>
						<Text style={[styles.metricValue, styles.metricValueBlue]}>{avgIntensity}</Text>
						<Text style={styles.metricSubtitle}>AVg intensity</Text>
						<Text style={styles.metricLabel}>{range}</Text>
					</View>
					<View style={styles.metricCard}>
						<Text style={[styles.metricValue, styles.metricValueBlue]}>{avgEngagement}%</Text>
						<Text style={styles.metricSubtitle}>AVg Engagement</Text>
						<Text style={styles.metricLabel}>{range}</Text>
					</View>
				</View>

				{/* Current State Card */}
				<View style={styles.stateCard}>
					<View style={styles.stateContent}>
						<Text style={styles.stateLabel}>{interpreted.label}</Text>
						<Text style={styles.stateBreakdown}>{mostCommonEmotion} | {avgIntensity}</Text>
					</View>
					<Text style={styles.stateEmoji}>{interpreted.emoji}</Text>
				</View>

				{/* Time Period Filters */}
				<View style={styles.timeFilters}>
					{(['Day', 'Week', 'Month'] as const).map((r) => (
						<TouchableOpacity 
							key={r} 
							onPress={() => setRange(r)} 
							style={[styles.timeFilter, range === r && styles.timeFilterActive]}
						>
							<Text style={[styles.timeFilterText, range === r && styles.timeFilterTextActive]}>{r}</Text>
						</TouchableOpacity>
					))}
				</View>

				{/* Emotion Trend Section */}
				<View style={styles.trendCard}>
					<Text style={styles.trendTitle}>Emotion Trend (last 7 days)</Text>
					<View style={styles.trendRow}>
						{last7.map((d, idx) => (
							<View key={idx} style={styles.trendItem}>
								<View style={[styles.trendDot, { backgroundColor: d.dotColor }]} />
								<Text style={styles.trendDay}>{d.day}</Text>
								<Text style={styles.trendEmotion}>{d.emotion === '—' ? '' : d.emotion}</Text>
							</View>
						))}
					</View>
				</View>

				{/* Achievements Section */}
				<View style={styles.achievementsCard}>
					<Text style={styles.achievementsTitle}>Achievements</Text>
					<View style={styles.achievementItem}>
						<Text style={styles.achievementIcon}>🌿</Text>
						<Text style={styles.achievementText}>Calm for {calmStreakDays} day(s) since last angry session</Text>
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: {
		flex: 1,
		backgroundColor: '#F0F8FF', // Light blue background
	},
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 12,
		backgroundColor: '#FFFFFF',
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	backIcon: {
		fontSize: 24,
		color: '#000000',
		fontWeight: '700',
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#000000',
	},
	profileBtn: {
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	profileIcon: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: '#0A7EA4',
	},
	navBar: {
		flexDirection: 'row',
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 16,
		alignItems: 'center',
	},
	dropdownContainer: {
		flex: 1,
	},
	dropdownTrigger: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderBottomWidth: 2,
		borderBottomColor: '#0A7EA4',
		maxWidth: 120,
	},
	dropdownTriggerText: {
		fontSize: 14,
		fontWeight: '700',
		color: '#0A7EA4',
	},
	dropdownArrow: {
		fontSize: 10,
		color: '#0A7EA4',
		marginLeft: 6,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.3)',
		justifyContent: 'flex-start',
		paddingTop: 60,
		paddingHorizontal: 16,
	},
	dropdownMenu: {
		backgroundColor: '#FFFFFF',
		borderRadius: 12,
		paddingVertical: 8,
		elevation: 4,
		shadowColor: '#000',
		shadowOpacity: 0.2,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
		minWidth: 150,
	},
	dropdownItem: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
		paddingHorizontal: 16,
	},
	dropdownItemActive: {
		backgroundColor: '#F0F8FF',
	},
	dropdownItemText: {
		fontSize: 14,
		fontWeight: '600',
		color: '#212121',
	},
	dropdownItemTextActive: {
		color: '#0A7EA4',
		fontWeight: '700',
	},
	checkmark: {
		fontSize: 16,
		color: '#0A7EA4',
		fontWeight: '700',
	},
	navItem: {
		paddingVertical: 6,
	},
	navItemActive: {
		borderBottomWidth: 2,
		borderBottomColor: '#0A7EA4',
	},
	navText: {
		fontSize: 14,
		fontWeight: '600',
		color: '#999999',
	},
	navTextActive: {
		color: '#0A7EA4',
		fontWeight: '700',
	},
	scrollContent: {
		padding: 16,
		paddingBottom: 32,
	},
	emotionOverview: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		marginBottom: 24,
	},
	emotionItem: {
		width: '30%',
		alignItems: 'center',
		marginBottom: 16,
	},
	emotionCircle: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: '#FFFFFF',
		alignItems: 'center',
		justifyContent: 'center',
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.1,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
	},
	emotionEmoji: {
		fontSize: 32,
	},
	emotionLabel: {
		marginTop: 8,
		fontSize: 12,
		fontWeight: '600',
		color: '#212121',
	},
	metricsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		marginBottom: 16,
	},
	metricCard: {
		width: '48%',
		backgroundColor: '#FFFFFF',
		borderRadius: 12,
		padding: 16,
		marginBottom: 12,
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.08,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
	},
	metricValue: {
		fontSize: 28,
		fontWeight: '900',
		color: '#212121',
		marginBottom: 4,
	},
	metricValueYellow: {
		color: '#FFC107',
	},
	metricValueBlue: {
		color: '#0A7EA4',
	},
	metricSubtitle: {
		fontSize: 13,
		fontWeight: '700',
		color: '#212121',
		marginTop: 4,
	},
	metricLabel: {
		fontSize: 11,
		fontWeight: '600',
		color: '#999999',
		marginTop: 2,
	},
	stateCard: {
		backgroundColor: '#FFFFFF',
		borderRadius: 12,
		padding: 16,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 16,
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.08,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
	},
	stateContent: {
		flex: 1,
	},
	stateLabel: {
		fontSize: 24,
		fontWeight: '900',
		color: '#212121',
		marginBottom: 4,
	},
	stateBreakdown: {
		fontSize: 14,
		fontWeight: '600',
		color: '#666666',
	},
	stateEmoji: {
		fontSize: 48,
	},
	timeFilters: {
		flexDirection: 'row',
		gap: 12,
		marginBottom: 16,
	},
	timeFilter: {
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		backgroundColor: '#FFFFFF',
		borderWidth: 1,
		borderColor: '#E0E0E0',
	},
	timeFilterActive: {
		backgroundColor: '#0A7EA4',
		borderColor: '#0A7EA4',
	},
	timeFilterText: {
		fontSize: 14,
		fontWeight: '700',
		color: '#666666',
	},
	timeFilterTextActive: {
		color: '#FFFFFF',
	},
	trendCard: {
		backgroundColor: '#FFFFFF',
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.08,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
	},
	trendTitle: {
		fontSize: 16,
		fontWeight: '900',
		color: '#212121',
		marginBottom: 16,
	},
	trendRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	trendItem: {
		alignItems: 'center',
		flex: 1,
	},
	trendDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginBottom: 8,
	},
	trendDay: {
		fontSize: 12,
		fontWeight: '600',
		color: '#212121',
		marginBottom: 4,
	},
	trendEmotion: {
		fontSize: 11,
		color: '#666666',
	},
	achievementsCard: {
		backgroundColor: '#FFFFFF',
		borderRadius: 12,
		padding: 16,
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.08,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
	},
	achievementsTitle: {
		fontSize: 16,
		fontWeight: '900',
		color: '#212121',
		marginBottom: 12,
	},
	achievementItem: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	achievementIcon: {
		fontSize: 24,
		marginRight: 12,
	},
	achievementText: {
		flex: 1,
		fontSize: 14,
		fontWeight: '600',
		color: '#212121',
	},
});
