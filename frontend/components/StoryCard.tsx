import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Story } from '../data/stories';

type Props = {
	story: Story;
	onPress: () => void;
};

export const StoryCard: React.FC<Props> = ({ story, onPress }) => {
	const accent = '#07BDD6';
	return (
		<TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
			{/* decorative circle */}
			<View style={[styles.decoration, { backgroundColor: story.coverColor }]} />

			{/* emoji thumb */}
			<View style={styles.thumb}>
				<Text style={styles.emoji}>{story.emoji ?? '📘'}</Text>
			</View>

			{/* content */}
			<View style={styles.right}>
				<View style={styles.rowTop}>
					<Text style={styles.title} numberOfLines={2}>
						{story.title}
					</Text>
					<View style={styles.levelBadge}>
						<Text style={styles.levelText}>{story.level}</Text>
					</View>
				</View>

				<Text style={styles.subtitle} numberOfLines={2}>
					{story.moral}
				</Text>

				<View style={styles.metaRow}>
					<View style={styles.metaPill}>
						<Text style={styles.metaText}>⏱ {story.timeMin} min</Text>
					</View>
					{story.uploadedOn ? (
						<View style={[styles.metaPill, styles.metaPillLight]}>
							<Text style={[styles.metaText, styles.metaTextMuted]}>{story.uploadedOn}</Text>
						</View>
					) : null}
					<TouchableOpacity style={styles.readBtn} onPress={onPress}>
						<Text style={styles.readBtnText}>Read</Text>
					</TouchableOpacity>
				</View>
			</View>
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	card: {
		width: '100%',
		backgroundColor: '#fff',
		borderRadius: 16,
		padding: 14,
		marginVertical: 8,
		flexDirection: 'row',
		alignItems: 'center',
		elevation: 3,
		shadowColor: '#000',
		shadowOpacity: 0.06,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
		overflow: 'hidden',
	},
	decoration: {
		position: 'absolute',
		right: -40,
		top: -40,
		width: 120,
		height: 120,
		borderRadius: 60,
		opacity: 0.13,
	},
	thumb: {
		width: 92,
		height: 92,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 12,
		backgroundColor: '#fff',
		elevation: 2,
	},
	emoji: { fontSize: 44 },
	right: { flex: 1, justifyContent: 'space-between' },
	rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	title: { fontSize: 18, fontWeight: '800', color: '#212121', flex: 1, marginRight: 8 },
	levelBadge: {
		backgroundColor: '#FFFCF3',
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: '#F0E6B6',
	},
	levelText: { fontSize: 11, fontWeight: '900', color: '#7A5B00' },
	subtitle: { fontSize: 13, color: '#6B6B6B', marginTop: 8 },
	metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
	metaPill: {
		backgroundColor: '#EAF7F8',
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		marginRight: 8,
	},
	metaPillLight: { backgroundColor: '#FFFFFF' },
	metaText: { fontSize: 12, fontWeight: '700', color: '#07BDD6' },
	metaTextMuted: { color: '#666' },
	readBtn: {
		marginLeft: 'auto',
		backgroundColor: '#07BDD6',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 10,
	},
	readBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
