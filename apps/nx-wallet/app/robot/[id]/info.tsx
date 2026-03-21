import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Copy, MessageSquareX, Trash2 } from 'lucide-react-native';
import { ManagedUnit, ManagedUnitsService } from '@/services/ManagedUnitsService';
import { useMessageStore } from '@/stores/MessageStore';
import { messageStorageService } from '@/services/MessageStorageService';

export default function AgentInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [unit, setUnit] = useState<ManagedUnit | null>(null);

  useEffect(() => {
    (async () => {
      const units = await ManagedUnitsService.getAll();
      const found = units.find(
        (u) => u.address.toLowerCase() === id?.toLowerCase(),
      );
      setUnit(found ?? null);
    })();
  }, [id]);

  const handleCopyAddress = async () => {
    if (!unit) return;
    await Clipboard.setStringAsync(unit.address);
    Alert.alert('Copied', 'Address copied to clipboard');
  };

  const getConversationByParticipant = useMessageStore((s) => s.getConversationByParticipant);
  const clearConversation = useMessageStore((s) => s.clearConversation);

  const handleClearHistory = () => {
    if (!unit) return;
    const conversation = getConversationByParticipant(unit.address);
    if (!conversation) {
      Alert.alert('No History', 'No conversation history found for this agent.');
      return;
    }
    Alert.alert(
      'Clear Conversation',
      `Are you sure you want to clear all chat history with "${unit.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            clearConversation(conversation.id);
            await messageStorageService.clearConversation(conversation.id);
            Alert.alert('Done', 'Conversation history cleared.');
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    if (!unit) return;
    Alert.alert(
      'Delete Agent',
      `Are you sure you want to remove "${unit.name}"? This will not delete chat history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await ManagedUnitsService.remove(unit.address);
            router.replace('/(tabs)/tasks');
          },
        },
      ],
    );
  };

  if (!unit) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft color="#1A1A1A" size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>Agent Info</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Agent not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formattedDate = new Date(unit.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color="#1A1A1A" size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>Agent Info</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar & Name */}
        <View style={styles.profileSection}>
          <Text style={styles.avatar}>{unit.avatarUrl || '🤖'}</Text>
          <Text style={styles.name}>{unit.name}</Text>
        </View>

        {/* Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Address</Text>
            <Pressable onPress={handleCopyAddress} style={styles.addressRow}>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                {unit.address}
              </Text>
              <Copy size={16} color="#666" />
            </Pressable>
          </View>

          {unit.notes ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.detailValue}>{unit.notes}</Text>
            </View>
          ) : null}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Added</Text>
            <Text style={styles.detailValue}>{formattedDate}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.bottomSection}>
        <Pressable onPress={handleClearHistory} style={styles.clearButton}>
          <MessageSquareX size={20} color="#DC2626" />
          <Text style={styles.clearButtonText}>Clear Conversation History</Text>
        </Pressable>
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.deleteButtonText}>Delete Agent</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  content: {
    paddingBottom: 32,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    fontSize: 64,
    marginBottom: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  detailsSection: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  detailRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  detailLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#1A1A1A',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressText: {
    fontSize: 15,
    color: '#1A1A1A',
    fontFamily: 'monospace',
    flex: 1,
  },
  bottomSection: {
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
    gap: 12,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
