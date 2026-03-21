import { AddUnitModal } from '@/components/modals/AddUnitModal';
import { Text } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { Wallet } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';
import { nexoidService } from '@/services/NexoidService';
import { Message } from '@/services/MessageStorageService';
import { messagingService } from '@/services/MessagingService';
import { useMessageStore } from '@/stores/MessageStore';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface RobotWithStatus extends Wallet {}

export default function TasksScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [robots, setRobots] = useState<RobotWithStatus[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const messages = useMessageStore(state => state.messages);
  const conversations = useMessageStore(state => state.conversations);

  const getLastMessageForRobot = useCallback((robotId: string): Message | undefined => {
    const normalized = robotId.toLowerCase();
    const conversation = Object.values(conversations).find(c =>
      c.participants?.some(p => p.id?.toLowerCase() === normalized)
    );
    if (!conversation) return undefined;
    const convMessages = messages[conversation.id] || [];
    if (convMessages.length === 0) {
      return conversation.last_message;
    }
    return convMessages[convMessages.length - 1];
  }, [messages, conversations]);

  const refreshFromStorage = async () => {
    const managed = await ManagedUnitsService.getAll();
    const robotWallets: RobotWithStatus[] = managed.map(u => ({
      id: u.address,
      name: u.name,
      type: 'robot' as const,
      balance: 0,
      currency: 'USD',
      avatarUrl: u.avatarUrl || '🤖',
      address: u.address,
      tokens: [],
    }));

    setRobots(robotWallets);
  };

  const syncWithBackend = async () => {
    let userSafeAddress = nexoidService.getSafeAddress();
    if (!userSafeAddress) {
       try {
           const { SecureStorage } = require('@/services/SecureStorage');
           const stored = await SecureStorage.getSafeAddress();
           if (stored) userSafeAddress = stored;
       } catch (e) {
           console.log('SecureStorage fallback failed', e);
       }
    }
    
    if (userSafeAddress) {
        await messagingService.syncConversations(userSafeAddress);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refreshFromStorage();
      syncWithBackend();
    }, [])
  );

  const handleAddUnit = async (address: string, name: string, notes: string, avatarUrl: string) => {
    await ManagedUnitsService.add({
      address,
      name,
      notes,
      avatarUrl,
      createdAt: new Date().toISOString(),
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshFromStorage(); // Refresh list
  };

  const renderItem = ({ item, index }: { item: RobotWithStatus, index: number }) => {
    const formatId = (id: string) => {
        if (id.length < 10) return id;
        return `${id.slice(0, 6)}...${id.slice(-4)}`;
    };

    const robotAddress = item.address || item.id;
    const lastMessage = getLastMessageForRobot(robotAddress);

    const getLastMessageDisplay = () => {
        if (!lastMessage) {
            return {
                text: 'Start a conversation',
                bg: '#F3F4F6', // Slate 100
                color: '#9CA3AF', // Slate 400
                isUser: false
            };
        }

        const isUser = lastMessage.sender_id.toLowerCase() !== robotAddress.toLowerCase();

        // Resolve content_type and content (same logic as robot chat screen)
        let contentType = (lastMessage as any).content_type || 'text';
        let content: any = lastMessage.content;

        // Handle legacy format: { type: "text", data: "..." }
        if (typeof content === 'object' && content !== null) {
          const obj = content as Record<string, unknown>;
          if (obj.type && obj.data && !contentType.includes('_')) {
            // Legacy format -- convert
            if (obj.type === 'json' && typeof obj.data === 'object') {
              content = obj.data;
              contentType = 'text'; // will render as JSON fallback
            } else if (typeof obj.data === 'string') {
              content = { text: obj.data };
              contentType = 'text';
            }
          }
        } else if (typeof content === 'string') {
          content = { text: content };
          contentType = 'text';
        }

        // Extract preview text based on content_type
        let text = '';

        if (contentType === 'delegation_request') {
          text = '🤝 Delegation request';
        } else if (contentType === 'payment_request') {
          text = '💰 Payment request';
        } else if (contentType === 'status_update') {
          text = content?.title || 'Status update';
        } else if (contentType === 'delegation_response') {
          text = content?.approved ? '✅ Approved delegation' : '❌ Rejected delegation';
        } else if (contentType === 'payment_response') {
          text = content?.approved ? '✅ Approved payment' : '❌ Rejected payment';
        } else {
          // Handle text messages and fallback
          if (typeof content === 'string') {
            text = content;
          } else if (content && typeof content === 'object') {
            // Standard format: { text: "..." }
            text = content.text || JSON.stringify(content);
          } else {
            text = String(content || '');
          }
        }

        // Truncate long messages for preview
        const maxLength = 50;
        if (text.length > maxLength) {
          text = text.substring(0, maxLength) + '...';
        }

        return {
            text,
            bg: isUser ? '#EFF6FF' : '#F0FDF4', // Blue-50 (User) : Green-50 (Robot)
            color: isUser ? '#3B82F6' : '#22C55E', // Blue-500 : Green-500
            isUser
        };
    };

    const msgInfo = getLastMessageDisplay();

    const getTimestampDisplay = () => {
      if (!lastMessage?.timestamp) return '';
      const date = new Date(lastMessage.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays === 1) {
        return 'Yesterday';
      } else if (diffDays < 7) {
        return date.toLocaleDateString(undefined, { weekday: 'short' });
      }
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
      <Pressable 
        onPress={() => router.push(`/robot/${item.id}`)}
        style={({ pressed }) => [
          styles.card,
          { opacity: pressed ? 0.9 : 1 }
        ]}
      >
        <View style={[styles.accentStrip, { backgroundColor: msgInfo.color }]} />
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.robotInfo}>
              <Text style={styles.avatar}>{item.avatarUrl}</Text>
              <View>
                <Text style={styles.robotName}>{item.name}</Text>
                <Text style={styles.robotId}>ID: {formatId(item.id)}</Text>
              </View>
            </View>
            <ChevronRight size={20} color="#ccc" />
          </View>

          <View style={[styles.statusContainer, { backgroundColor: msgInfo.bg }]}>
            <View style={styles.statusLabelRow}>
              <Text style={[styles.statusLabel, { color: msgInfo.color }]}>
                  {lastMessage ? (msgInfo.isUser ? 'You' : item.name) : 'Status'}
              </Text>
              {lastMessage?.timestamp ? (
                <Text style={styles.timestampText}>{getTimestampDisplay()}</Text>
              ) : null}
            </View>
            <Text style={styles.statusText} numberOfLines={1}>
              {msgInfo.text}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const sortedRobots = useMemo(() => {
    return [...robots].sort((a, b) => {
      const msgA = getLastMessageForRobot(a.address || a.id);
      const msgB = getLastMessageForRobot(b.address || b.id);
      const timeA = msgA?.timestamp ? new Date(msgA.timestamp).getTime() : 0;
      const timeB = msgB?.timestamp ? new Date(msgB.timestamp).getTime() : 0;
      return timeB - timeA; // Most recent first
    });
  }, [robots, getLastMessageForRobot]);

  const ListHeader = () => (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>My Humanoids</Text>
        <Text style={styles.headerSubtitle}>{robots.length} active units</Text>
      </View>
      <Pressable style={styles.addButton} onPress={() => setIsModalVisible(true)}>
        <Plus size={24} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={sortedRobots}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
      />
      <AddUnitModal 
        visible={isModalVisible} 
        onClose={() => setIsModalVisible(false)} 
        onAdd={handleAddUnit}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00C896',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    marginHorizontal: 20,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  accentStrip: {
    width: 6,
    height: '100%',
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  robotInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    fontSize: 32,
    marginRight: 12,
  },
  robotName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  robotId: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  statusContainer: {
    padding: 12,
    borderRadius: 12,
  },
  statusLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  statusIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
    marginBottom: 2,
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  timestampText: {
    fontSize: 11,
    color: '#999',
    fontWeight: '400',
  },
});
