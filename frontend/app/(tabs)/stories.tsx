import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StoryCard } from '../../components/StoryCard';
import { STORIES } from '../../data/stories';

export default function StoriesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? STORIES.filter((s) => s.title.toLowerCase().includes(q))
      : STORIES;
  }, [query]);

  const categories = [
    { id: 'c1', title: 'Adventure', emoji: '🧭', color: '#FFF7E6' },
    { id: 'c2', title: 'Animals', emoji: '🦁', color: '#FFF0F6' },
    // { id: 'c3', title: 'Space', emoji: '🚀', color: '#E8F6FF' },
    { id: 'c4', title: 'Colors', emoji: '🎨', color: '#EAF9F1' },
  ];

  const featured = STORIES[STORIES.length - 1];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good Evening</Text>
            <Text style={styles.name}>
              Daham{' '}
              <Text style={{ fontSize: 18 }}>👋</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.avatar}>
            <Text style={{ fontWeight: '800' }}>D</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TextInput
          placeholder="Search stories..."
          style={styles.search}
          value={query}
          onChangeText={setQuery}
        />

        {/* Featured */}
        {/* {featured && (
          <View style={styles.featuredWrap}>
            <Text style={styles.featuredLabel}>Featured</Text>
            <TouchableOpacity
              onPress={() => router.push(`/story/${featured.id}`)}
              activeOpacity={0.9}
            >
              <View style={styles.featuredCard}>
                <Text style={styles.featuredEmoji}>{featured.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featuredTitle} numberOfLines={2}>
                    {featured.title}
                  </Text>
                  <Text style={styles.featuredSubtitle} numberOfLines={1}>
                    {featured.moral}
                  </Text>
                </View>
                <View style={styles.featuredPill}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Read</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )} */}

        {/* Categories */}
        <View style={styles.catRow}>
          {categories.map((c) => (
            <View
              key={c.id}
              style={[styles.catCard, { backgroundColor: c.color }]}
            >
              <Text style={styles.catEmoji}>{c.emoji}</Text>
              <Text style={styles.catLabel}>{c.title}</Text>
            </View>
          ))}
        </View>

        {/* Stories header */}
        <Text style={styles.sectionTitle}>Stories</Text>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => (
            <View style={{ width: '100%' }}>
              <StoryCard
                story={item}
                onPress={() => router.push(`/story/${item.id}`)}
              />
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FEFF' },
  container: { flex: 1, padding: 16 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  greeting: { color: '#666', fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '900', color: '#212121' },
  avatar: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    elevation: 3,
  },

  search: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    elevation: 2,
  },

  featuredWrap: { marginBottom: 12 },
  featuredLabel: { color: '#07BDD6', fontWeight: '900', marginBottom: 8 },
  featuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  featuredEmoji: { fontSize: 44, marginRight: 12 },
  featuredTitle: { fontWeight: '900', fontSize: 16, color: '#222' },
  featuredSubtitle: { color: '#666', marginTop: 6 },
  featuredPill: {
    backgroundColor: '#07BDD6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  catCard: {
    flex: 1,
    marginRight: 8,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    elevation: 2,
  },
  catEmoji: { fontSize: 40 },
  catLabel: { marginTop: 8, fontWeight: '800', color: '#333' },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginVertical: 8,
    color: '#212121',
  },
});
