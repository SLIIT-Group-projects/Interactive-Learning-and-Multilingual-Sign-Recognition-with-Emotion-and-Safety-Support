import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StoryCard } from '../../../components/StoryCard';
import { STORIES } from '../../../data/stories';
import { MAGIC } from '../../theme/childMagicTheme';

export default function StoriesListScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);

  const categories = [
    { id: 'c1', title: 'Adventure', icon: '🧭', color: MAGIC.softPurpleBg },
    { id: 'c2', title: 'Animal', icon: '🦁', color: MAGIC.softPinkBg },
    { id: 'c3', title: 'Colour', icon: '🎨', color: '#E0E7FF' },
  ];

  const filtered = useMemo(() => {
    let result = STORIES;
    const q = query.trim().toLowerCase();

    if (q) {
      result = result.filter((s) => s.title.toLowerCase().includes(q));
    }

    return result;
  }, [query, selectedCategory]);

  const handleBack = () => {
    if (navigation && navigation.goBack) {
      navigation.goBack();
    }
  };

  const handleStoryPress = (storyId) => {
    if (navigation && navigation.navigate) {
      navigation.navigate('StoryReading', { storyId });
    } else {
      console.warn('[StoriesList] Navigation not available');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: MAGIC.pageBg }}>
      <LinearGradient
        colors={MAGIC.headerGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backCircle}>
            <MaterialIcons name="chevron-left" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerKicker}>Magic library</Text>
            <Text style={styles.headerTitle}>Stories ✨</Text>
          </View>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="bookshelf" size={22} color={MAGIC.purple500} />
          </View>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <TextInput
            placeholder="Search stories..."
            placeholderTextColor={MAGIC.textMuted}
            style={styles.search}
            value={query}
            onChangeText={setQuery}
          />

          <View style={styles.catRow}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.catCard,
                  { backgroundColor: c.color },
                  selectedCategory === c.id && styles.catCardSelected,
                ]}
                activeOpacity={0.85}
                onPress={() => setSelectedCategory(selectedCategory === c.id ? null : c.id)}
              >
                <Text style={styles.catIcon}>{c.icon}</Text>
                <Text style={styles.catLabel}>{c.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Pick a tale</Text>

          {filtered.map((item) => (
            <StoryCard
              key={item.id}
              story={item}
              onPress={() => handleStoryPress(item.id)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 168,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
  },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  search: {
    backgroundColor: MAGIC.cardWhite,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 18,
    fontSize: 16,
    fontWeight: '600',
    color: MAGIC.textPrimary,
    borderWidth: 1,
    borderColor: MAGIC.softPurpleBorder,
    shadowColor: '#7c3aed',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
    gap: 12,
  },
  catCard: {
    flex: 1,
    borderRadius: 28,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 104,
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#7c3aed',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  catCardSelected: {
    borderColor: MAGIC.purple500,
    elevation: 5,
    shadowOpacity: 0.14,
  },
  catIcon: {
    fontSize: 40,
    marginBottom: 6,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: MAGIC.textPrimary,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 14,
    color: MAGIC.textPrimary,
  },
});
