import { CredentialCategory } from '@/constants/MockData';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

interface FilterChipsProps {
  selected: CredentialCategory | 'all';
  onSelect: (category: CredentialCategory | 'all') => void;
  counts: Record<string, number>;
}

const FILTERS: { id: CredentialCategory | 'all', label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'id', label: 'ID Cards' },
  { id: 'health', label: 'Health' },
  { id: 'document', label: 'Documents' },
];

export function FilterChips({ selected, onSelect, counts }: FilterChipsProps) {
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      contentContainerStyle={styles.container}
    >
      {FILTERS.map((filter) => {
        const isSelected = selected === filter.id;
        const count = counts[filter.id] || 0;
        
        return (
          <Pressable
            key={filter.id}
            style={[styles.chip, isSelected && styles.selectedChip]}
            onPress={() => onSelect(filter.id)}
          >
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>
              {filter.label} ({count})
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  selectedChip: {
    backgroundColor: '#00C896', // Green from screenshot
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  selectedLabel: {
    color: '#fff',
    fontWeight: '600',
  },
});



