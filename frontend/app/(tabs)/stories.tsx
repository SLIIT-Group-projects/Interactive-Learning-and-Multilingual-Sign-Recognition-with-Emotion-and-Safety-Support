import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StoryCard } from '../../components/StoryCard';
import { STORIES } from '../../data/stories';

export default function StoriesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    { id: 'c1', title: 'Adventure', icon: '🧭', color: '#FFF7E6' },
    { id: 'c2', title: 'Animal', icon: '🦁', color: '#FFF0F6' },
    { id: 'c3', title: 'Colour', icon: '🎨', color: '#EAF9F1' },
  ];

  const filtered = useMemo(() => {
    let result = STORIES;
    const q = query.trim().toLowerCase();
    
    if (q) {
      result = result.filter((s) => s.title.toLowerCase().includes(q));
    }
    
    // Category filtering can be added here if needed
    // if (selectedCategory) {
    //   result = result.filter((s) => s.category === selectedCategory);
    // }
    
    return result;
  }, [query, selectedCategory]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="chevron-left" size={28} color="#212121" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Story dashboard</Text>
          <TouchableOpacity style={styles.avatar}>
            <MaterialIcons name="person" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TextInput
          placeholder="search stories..."
          placeholderTextColor="#999"
          style={styles.search}
          value={query}
          onChangeText={setQuery}
        />

        {/* Categories */}
        <View style={styles.catRow}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.catCard, 
                { backgroundColor: c.color },
                selectedCategory === c.id && styles.catCardSelected
              ]}
              activeOpacity={0.8}
              onPress={() => setSelectedCategory(selectedCategory === c.id ? null : c.id)}
            >
              <Text style={styles.catIcon}>{c.icon}</Text>
              <Text style={styles.catLabel}>{c.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stories header */}
        <Text style={styles.sectionTitle}>Stories</Text>

        {/* Stories List */}
        {filtered.map((item) => (
          <StoryCard
            key={item.id}
            story={item}
            onPress={() => router.push(`/story/${item.id}`)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: '#F7FEFF' 
  },
  container: { 
    flex: 1 
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#212121',
    flex: 1,
    textAlign: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0A7EA4',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  search: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#212121',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  catCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    aspectRatio: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  catCardSelected: {
    elevation: 4,
    shadowOpacity: 0.12,
    transform: [{ scale: 1.02 }],
  },
  catIcon: { 
    fontSize: 48,
    marginBottom: 8,
  },
  catLabel: { 
    fontSize: 14,
    fontWeight: '700', 
    color: '#212121',
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
    color: '#212121',
  },
});
