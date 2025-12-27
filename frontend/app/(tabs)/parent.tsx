import React, { useMemo, useState } from 'react';
import {
	View,
	Text,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	TouchableOpacity,
	FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';

/* --- Mock data (TODO: replace with API) --- */
type Session = {
	id: string;
	dateTime: string; // ISO
	storyTitle: string;
	emotion: 'Happy' | 'Sad' | 'Angry' | 'Neutral';
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
	{ id: 's6', dateTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), storyTitle: 'The Brave Little Squirrel', emotion: 'Sad', intensity: 'Low', durationSeconds: 200, engagementScore: 45 },
];

const BADGES = [
	{ id: 'b1', title: 'Maths', emoji: '🔢', bg: '#FFF7E6' },
	{ id: 'b2', title: 'Learner', emoji: '🏅', bg: '#FFF0F6' },
	{ id: 'b3', title: 'Student', emoji: '🎓', bg: '#E8F6FF' },
	{ id: 'b4', title: 'Science', emoji: '🧪', bg: '#EAF9F1' },
];

const ACHIEVEMENTS = [
	{ id: 'a1', text: 'Completed Maths 10 sessions in a row', emoji: '✅' },
	{ id: 'a2', text: 'Earned the badge of super fast learner', emoji: '🏅' },
	{ id: 'a3', text: 'Finished 3 stories this week', emoji: '📚' },
];

/* --- Helpers --- */
const formatTime = (iso: string) => {
	const d = new Date(iso);
	return d.toLocaleString();
};

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

/* --- Small reusable components --- */
const SummaryCard: React.FC<{ title: string; value: string | number; subtitle?: string }> = ({ title, value, subtitle }) => (
	<View style={styles.summaryCard}>
		<Text style={styles.summaryValue}>{value}</Text>
		<Text style={styles.summaryTitle}>{title}</Text>
		{subtitle ? <Text style={styles.summarySubtitle}>{subtitle}</Text> : null}
	</View>
);

// Emotion guide card (new)
const EmotionGuideCard: React.FC = () => {
	return (
		<View style={styles.guideCard}>
			<Text style={styles.summaryTitle}>Emotion Guide</Text>

			<View style={styles.guideSection}>
				<Text style={styles.guideHeading}>😊 Happy</Text>
				<View style={styles.guideList}>
					<Text style={styles.guideItem}><Text style={styles.guideLevel}>Low</Text> — Calm, content</Text>
					<Text style={styles.guideItem}><Text style={styles.guideLevel}>Medium</Text> — Cheerful, smiling</Text>
					<Text style={styles.guideItem}><Text style={styles.guideLevel}>High</Text> — Excited, joyful</Text>
				</View>
			</View>

			<View style={[styles.guideSection, { marginTop: 8 }]}>
				<Text style={styles.guideHeading}>😠 Angry</Text>
				<View style={styles.guideList}>
					<Text style={styles.guideItem}><Text style={styles.guideLevel}>Low</Text> — Annoyed, irritated</Text>
					<Text style={styles.guideItem}><Text style={styles.guideLevel}>Medium</Text> — Frustrated, upset</Text>
					<Text style={styles.guideItem}><Text style={styles.guideLevel}>High</Text> — Furious, enraged</Text>
				</View>
			</View>
		</View>
	);
};

const Badge: React.FC<{ label: string; type?: 'emotion' | 'intensity' | 'neutral' }> = ({ label, type = 'neutral' }) => {
	const colorMap: Record<string, string> = {
		Happy: '#67D37A',
		Sad: '#6CB4FF',
		Angry: '#FF6B6B',
		Neutral: '#AAB2BD',
		Low: '#E0F2F2',
		Medium: '#FFE8B8',
		High: '#FFD7D7',
	};
	const bg = colorMap[label] ?? '#EAEAEA';
	const textColor = type === 'emotion' ? '#fff' : '#222';
	return (
		<View style={[styles.badge, { backgroundColor: bg }]}>
			<Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
		</View>
	);
};

const SessionCard: React.FC<{ item: Session; onPress: () => void }> = ({ item, onPress }) => {
	return (
		<TouchableOpacity style={styles.sessionCard} onPress={onPress}>
			<View style={{ flex: 1 }}>
				<Text style={styles.sessionTitle}>{item.storyTitle}</Text>
				<Text style={styles.sessionTime}>{formatTime(item.dateTime)}</Text>
			</View>
			<View style={{ alignItems: 'flex-end' }}>
				<Badge label={item.emotion} type="emotion" />
				<Badge label={item.intensity} type="intensity" />
				<Text style={styles.sessionMeta}>⏱ {Math.round(item.durationSeconds / 60)}m</Text>
				<Text style={styles.sessionMeta}>⭐ {item.engagementScore}</Text>
			</View>
		</TouchableOpacity>
	);
};

/* --- Parent Dashboard Screen --- */
export default function ParentDashboardScreen() {
	const router = useRouter();
	const [child, setChild] = useState('Child 01');
	const [range, setRange] = useState<'Day' | 'Week' | 'Month'>('Week');

	// TODO: replace MOCK_SESSIONS with API call and subscribe to live updates
	const sessions = useMemo(() => filterByRange(MOCK_SESSIONS, range), [range]);

	const todayCount = useMemo(() => filterByRange(MOCK_SESSIONS, 'Day').length, []);
	const avgEngagement = useMemo(() => {
		if (!sessions.length) return 0;
		return Math.round(sessions.reduce((s, x) => s + x.engagementScore, 0) / sessions.length);
	}, [sessions]);

	const mostCommonEmotion = useMemo(() => {
		const tally: Record<string, number> = {};
		sessions.forEach((s) => (tally[s.emotion] = (tally[s.emotion] || 0) + 1));
		const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
		return sorted[0]?.[0] ?? '—';
	}, [sessions]);

	const avgIntensity = useMemo(() => {
		if (!sessions.length) return '—';
		// map Low=1, Medium=2, High=3
		const map: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
		const avg = sessions.reduce((s, x) => s + map[x.intensity], 0) / sessions.length;
		if (avg < 1.5) return 'Low';
		if (avg < 2.5) return 'Medium';
		return 'High';
	}, [sessions]);

	/* Simple recommendations logic (hardcoded for now) */
	const recommendations = useMemo(() => {
		const recs: string[] = [];
		const angryCount = sessions.filter((s) => s.emotion === 'Angry').length;
		const lowEngCount = sessions.filter((s) => s.engagementScore < 60).length;
		const happyHigh = sessions.filter((s) => s.emotion === 'Happy' && s.intensity === 'High').length;
		if (angryCount >= 2) recs.push('Try calming stories & breathing mini-games');
		if (lowEngCount >= 2) recs.push('Shorter stories + interactive activities to boost engagement');
		if (happyHigh >= 1) recs.push('Reward / continue with slightly harder stories');
		if (!recs.length) recs.push('All good — keep encouraging reading sessions!');
		return recs;
	}, [sessions]);

	/* Trend placeholder: last 7 days dominant emotion */
	const last7 = useMemo(() => {
		const res: { day: string; emotion: string }[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date();
			d.setDate(d.getDate() - i);
			const dayStr = d.toLocaleDateString(undefined, { weekday: 'short' });
			const daySessions = MOCK_SESSIONS.filter((s) => isSameDay(new Date(s.dateTime), d));
			const tally: Record<string, number> = {};
			daySessions.forEach((s) => (tally[s.emotion] = (tally[s.emotion] || 0) + 1));
			const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
			res.push({ day: dayStr, emotion: dominant });
		}
		return res;
	}, []);

	/* Dynamic Achievements (based on emotion detection & engagement) */
	const dynamicAchievements = useMemo(() => {
		const res: { id: string; emoji: string; text: string }[] = [];
		const angryCount = sessions.filter((s) => s.emotion === 'Angry').length;
		const happyHigh = sessions.filter((s) => s.emotion === 'Happy' && s.intensity === 'High').length;
		const highEng = sessions.filter((s) => s.engagementScore >= 85).length;

		if (angryCount >= 2) {
			res.push({
				id: 'dyn-angry',
				emoji: '🧘',
				text: `Multiple angry sessions (${angryCount}) — try calming stories & breathing activities`,
			});
		}
		if (happyHigh >= 1) {
			res.push({
				id: 'dyn-happy',
				emoji: '🎉',
				text: `${happyHigh} high-energy happy session(s) — consider rewarding or adding tougher stories`,
			});
		}
		if (highEng >= 1) {
			res.push({
				id: 'dyn-engage',
				emoji: '🏆',
				text: `${highEng} highly engaged session(s) — great progress!`,
			});
		}

		// Calm streak (days since last angry session)
		const angrySessionsSorted = sessions
			.filter((s) => s.emotion === 'Angry')
			.sort((a, b) => +new Date(b.dateTime) - +new Date(a.dateTime));
		if (angrySessionsSorted.length === 0 && sessions.length > 0) {
			res.unshift({ id: 'dyn-calm', emoji: '🌿', text: 'No angry sessions in this range — calm streak!' });
		} else if (angrySessionsSorted.length > 0) {
			const lastAngry = new Date(angrySessionsSorted[0].dateTime);
			const days = Math.floor((Date.now() - lastAngry.getTime()) / (1000 * 60 * 60 * 24));
			if (days >= 1) res.unshift({ id: 'dyn-calm-days', emoji: '🌿', text: `Calm for ${days} day(s) since last angry session` });
		}

		// fallback
		if (!res.length) res.push({ id: 'dyn-none', emoji: '✨', text: 'All good — keep encouraging reading sessions!' });
		return res;
	}, [sessions]);

	// interpret combined state from emotion + intensity
	const interpretState = (emotion: string, intensity: string) => {
		// default
		if (!emotion || emotion === '—') return { label: '—', emoji: '—' };
		const e = emotion;
		const i = intensity || 'Low';
		let label = '—';
		if (e === 'Happy') {
			if (i === 'Low') label = 'Calm';
			else if (i === 'Medium') label = 'Cheerful';
			else label = 'Excited';
		} else if (e === 'Angry') {
			if (i === 'Low') label = 'Annoyed';
			else if (i === 'Medium') label = 'Frustrated';
			else label = 'Furious';
		} else if (e === 'Sad') {
			if (i === 'Low') label = 'Down';
			else if (i === 'Medium') label = 'Upset';
			else label = 'Distressed';
		} else {
			label = 'Neutral';
		}
		const emojiMap: Record<string, string> = {
			Calm: '😌',
			Cheerful: '😊',
			Excited: '🤩',
			Annoyed: '😒',
			Frustrated: '😤',
			Furious: '😡',
			Down: '😔',
			Upset: '☹️',
			Distressed: '😩',
			Neutral: '😐',
			'—': '—',
		};
		return { label, emoji: emojiMap[label] ?? '—' };
	};

	// small card to show interpreted single-state
	const InterpretedStateCard: React.FC<{ label: string; emoji: string; breakdown?: string }> = ({ label, emoji, breakdown }) => (
		<View style={styles.stateCard}>
			<View style={styles.stateLeft}>
				<Text style={styles.stateEmoji}>{emoji}</Text>
			</View>
			<View style={{ flex: 1 }}>
				<Text style={styles.stateLabel}>{label}</Text>
				{breakdown ? <Text style={styles.stateSub}>{breakdown}</Text> : null}
			</View>
		</View>
	);

	// computed interpreted state (single label) from the mostCommonEmotion & avgIntensity
	const interpreted = useMemo(() => {
		return interpretState(mostCommonEmotion, typeof avgIntensity === 'string' ? avgIntensity : String(avgIntensity));
	}, [mostCommonEmotion, avgIntensity, sessions]);

	return (
		<SafeAreaView style={styles.safe}>
			<ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
				<View style={styles.container}>
					{/* Header */}
					<View style={styles.headerRow}>
						<View>
							<Text style={styles.headerTitle}>Parent Dashboard</Text>
							<View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
								<TouchableOpacity style={styles.childPill} onPress={() => setChild(child === 'Child 01' ? 'Child 02' : 'Child 01')}>
									<Text style={styles.childPillText}>{child}</Text>
								</TouchableOpacity>
								<Text style={{ marginLeft: 12, color: '#666' }}>Overview</Text>
							</View>
						</View>
						<View style={styles.avatar}><Text style={{color:'#fff',fontWeight:'700'}}>P</Text></View>
					</View>

					{/* Badges strip (new) */}
					<View style={styles.badgesRow}>
						{BADGES.map((b) => (
							<View key={b.id} style={styles.badgeItem}>
								<View style={[styles.badgeCircle, { backgroundColor: b.bg }]}>
									<Text style={styles.badgeEmoji}>{b.emoji}</Text>
								</View>
								<Text style={styles.badgeLabel}>{b.title}</Text>
							</View>
						))}
					</View>

					{/* Summary (grid: 2 per row, last full-width if odd) */}
					{(() => {
						const summaries = [
							{ id: 's1', title: "Today’s Sessions", value: todayCount, subtitle: 'today' },
							{ id: 's2', title: 'Common Emotion', value: mostCommonEmotion, subtitle: range.toLowerCase() },
							{ id: 's3', title: 'Avg Intensity', value: avgIntensity, subtitle: range.toLowerCase() },
							{ id: 's4', title: 'Avg Engagement', value: `${avgEngagement}%`, subtitle: range.toLowerCase() },
							{ id: 's5', stateCard: true, idKey: 'interpreted-state' },
						];
						return (
							<View style={styles.summaryGrid}>
								{summaries.map((s: any, idx: number) => {
									const isLastOdd = idx === summaries.length - 1 && summaries.length % 2 === 1;
									return (
										<View
											key={s.id ?? s.idKey ?? idx}
											style={[styles.summaryWrapper, isLastOdd && styles.summaryFullWidth]}
										>
											{s.stateCard ? (
												<InterpretedStateCard
													label={interpreted.label}
													emoji={interpreted.emoji}
													breakdown={`${mostCommonEmotion} • ${avgIntensity}`}
												/>
											) : s.guide ? (
												<EmotionGuideCard />
											) : (
												<SummaryCard title={s.title} value={s.value} subtitle={s.subtitle} />
											)}
										</View>
									);
								})}
							</View>
						);
					})()}

					{/* Time Filter Tabs */}
					<View style={styles.tabsRow}>
						{(['Day', 'Week', 'Month'] as const).map((r) => (
							<TouchableOpacity key={r} onPress={() => setRange(r)} style={[styles.tab, range === r && styles.tabActive]}>
								<Text style={[styles.tabText, range === r && styles.tabTextActive]}>{r}</Text>
							</TouchableOpacity>
						))}
					</View>

					{/* Trend */}
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Emotion Trend (last 7 days)</Text>
						<View style={{ flexDirection: 'row', marginTop: 12, justifyContent: 'space-between' }}>
							{last7.map((d) => (
								<View key={d.day} style={{ alignItems: 'center', flex: 1 }}>
									<View style={[styles.trendBar, { backgroundColor: d.emotion === 'Happy' ? '#67D37A' : d.emotion === 'Sad' ? '#6CB4FF' : d.emotion === 'Angry' ? '#FF6B6B' : '#DDE3E8' }]} />
									<Text style={{ fontSize: 12, marginTop: 6 }}>{d.day}</Text>
									<Text style={{ fontSize: 12, color: '#666' }}>{d.emotion}</Text>
								</View>
							))}
						</View>
					</View>

					{/* Achievements (dynamic based on emotion detection) */}
					<View style={{ marginTop: 8 }}>
						<Text style={styles.sectionTitle}>Achievements</Text>
						{dynamicAchievements.map((a) => (
							<View key={a.id} style={styles.achievementCard}>
								<View style={styles.achievementLeft}>
									<Text style={styles.achievementEmoji}>{a.emoji}</Text>
								</View>
								<View style={{ flex: 1 }}>
									<Text style={styles.achievementText}>{a.text}</Text>
								</View>
								<TouchableOpacity style={styles.achievementViewBtn}>
									<Text style={{ color: '#07BDD6', fontWeight: '800' }}>View</Text>
								</TouchableOpacity>
							</View>
						))}
					</View>

					
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: '#F7FEFF' },
	container: { flex: 1, padding: 16, paddingBottom: 96 },

	headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
	headerTitle: { fontSize: 20, fontWeight: '900', color: '#212121' },
	avatar: { width: 44, height: 44, borderRadius: 44, backgroundColor: '#07BDD6', alignItems: 'center', justifyContent: 'center' },

	childPill: { backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, elevation: 2 },
	childPillText: { fontWeight: '800', color: '#07BDD6' },

	// grid that supports 2-per-row, last item full width if odd count
	summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 },
	summaryWrapper: { width: '48%', marginBottom: 12 },
	summaryFullWidth: { width: '100%' },
	summaryCard: { backgroundColor: '#fff', padding: 12, borderRadius: 12, alignItems: 'flex-start', elevation: 2 },

	tabsRow: { flexDirection: 'row', marginVertical: 12 },
	tab: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff', borderRadius: 12, marginRight: 8 },
	tabActive: { backgroundColor: '#07BDD6' },
	tabText: { fontWeight: '800', color: '#666' },
	tabTextActive: { color: '#fff' },

	card: { backgroundColor: '#fff', padding: 14, borderRadius: 14, elevation: 2, marginBottom: 12 },
	cardTitle: { fontWeight: '900', color: '#212121', fontSize: 15 },

	trendBar: { width: '60%', height: 10, borderRadius: 6 },

	sectionTitle: { fontSize: 16, fontWeight: '900', color: '#212121', marginBottom: 8 },

	sessionCard: { backgroundColor: '#fff', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 1 },
	sessionTitle: { fontSize: 14, fontWeight: '900' },
	sessionTime: { color: '#666', marginTop: 6, fontSize: 12 },
	sessionMeta: { fontSize: 12, color: '#666', marginTop: 6 },

	badge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, marginVertical: 6, minWidth: 72, alignItems: 'center' },
	badgeText: { fontWeight: '800', fontSize: 12 },

	recoItem: { marginTop: 8, fontWeight: '700', color: '#333' },

	actionBtn: { backgroundColor: '#07BDD6', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, minWidth: 80, alignItems: 'center' },
	actionText: { color: '#fff', fontWeight: '900', fontSize: 12 },

	// badges
	badgesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 },
	badgeItem: { alignItems: 'center', width: 80 },
	badgeCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 2 },
	badgeEmoji: { fontSize: 22 },
	badgeLabel: { marginTop: 8, fontWeight: '800', color: '#333', fontSize: 12 },

	// achievements
	achievementCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 10, elevation: 2 },
	achievementLeft: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F6F8FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
	achievementEmoji: { fontSize: 20 },
	achievementText: { fontWeight: '800', color: '#333' },
	achievementViewBtn: { paddingHorizontal: 10 },

	// bottom nav
	bottomNav: {
		position: 'absolute',
		left: 12,
		right: 12,
		bottom: 12,
		height: 72,
		borderRadius: 20,
		backgroundColor: '#fff',
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-around',
		elevation: 6,
		paddingHorizontal: 8,
	},

	// emotion guide styles
	guideCard: { backgroundColor: '#fff', padding: 12, borderRadius: 12, elevation: 2 },
	guideSection: { marginTop: 6 },
	guideHeading: { fontWeight: '900', color: '#07BDD6', fontSize: 13 },
	guideList: { marginTop: 6 },
	guideItem: { color: '#333', fontWeight: '700', marginTop: 4 },
	guideLevel: { fontWeight: '900', color: '#333', marginRight: 6 },

	// interpreted state card styles (new)
	stateCard: { backgroundColor: '#fff', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', elevation: 2 },
	stateLeft: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: '#EAF7F8' },
	stateEmoji: { fontSize: 28 },
	stateLabel: { fontWeight: '900', fontSize: 16, color: '#212121' },
	stateSub: { marginTop: 6, color: '#666', fontWeight: '700' },

	// added style to ensure scrollable content has enough bottom space
	scrollContent: { paddingBottom: 160 },
});
