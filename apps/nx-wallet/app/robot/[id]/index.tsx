/**
 * Robot Chat Screen -- chat with an AI agent using rich interactive messages.
 *
 * Supports:
 *   - Text messages
 *   - Delegation request / response cards
 *   - Payment request / response cards
 *   - Status update cards
 *   - Streaming (typing indicator)
 *   - Connection status banner
 *   - Pull-to-refresh
 */

import { Wallet } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';
import { nexoidService } from '@/services/NexoidService';
import { messagingService } from '@/services/MessagingService';
import { chatActionService } from '@/services/ChatActionService';
import type { Message as ServiceMessage } from '@/services/MessageStorageService';
import { useMessageStore } from '@/stores/MessageStore';
import { MessageRenderer } from '@/components/chat/MessageRenderer';
import { StreamingMessage } from '@/components/chat/StreamingMessage';
import { TransactionProgressModal, type TransactionStep } from '@/components/modals/TransactionProgressModal';
import { MessageContentType } from '@/types/messages';
import type { DelegationRequestContent, PaymentRequestContent } from '@/types/messages';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronRight, Mic, Send, Wifi, WifiOff } from 'lucide-react-native';
import { transcribeAudio } from '@/services/WhisperService';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  sender_id: string;
  content_type: string;
  content: Record<string, unknown> | string;
  timestamp: string;
  isUser: boolean;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RobotChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [robot, setRobot] = useState<Wallet | null>(null);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [userSafeAddress, setUserSafeAddress] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [visibleCount, setVisibleCount] = useState(50);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const inputRef = useRef<TextInput>(null);
  const keyboardWasVisibleRef = useRef(false);
  const recordingPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecording || isTranscribing) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(recordingPulse, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(recordingPulse, { toValue: 0, duration: 800, useNativeDriver: false }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      recordingPulse.setValue(0);
    }
  }, [isRecording, isTranscribing]);
  const pageSize = 50;
  const hasInitialScroll = useRef(false);
  const isNearBottom = useRef(true); // Track if user is near bottom
  const previousMessageCount = useRef(0); // Track message count for auto-scroll

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Transaction modal
  const [txModalVisible, setTxModalVisible] = useState(false);
  const [txSteps, setTxSteps] = useState<TransactionStep[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txTitle, setTxTitle] = useState('Processing');

  // Store selectors
  const messagesByConversation = useMessageStore((s) => s.messages);
  const connectionState = useMessageStore((s) => s.connectionState);
  const streamingMessages = useMessageStore((s) => s.streamingMessages);
  const currentUserId = useMessageStore((s) => s.currentUserId);

  const storeMessages = useMemo(() => {
    if (!conversationId) return [];
    return messagesByConversation[conversationId] || [];
  }, [conversationId, messagesByConversation]);

  const streamingText = conversationId
    ? streamingMessages[conversationId]
    : undefined;

  // Map store messages to ChatMessage format
  const mappedMessages = useMemo<ChatMessage[]>(() => {
    // Use currentUserId from store (set by MessagingService) for consistent comparison
    const localUserAddress = currentUserId || userSafeAddress || '';

    console.log('[RobotChat] Message mapping debug:', {
      currentUserId,
      userSafeAddress,
      localUserAddress,
      messageCount: storeMessages.length,
    });

    return storeMessages.map((message) => {
      const isUser = localUserAddress
        ? message.sender_id.toLowerCase() === localUserAddress.toLowerCase()
        : false;

      console.log('[RobotChat] Message attribution:', {
        messageId: message.id,
        senderId: message.sender_id,
        localUserAddress,
        isUser,
      });

      // Resolve content_type and content
      let content_type = (message as any).content_type || 'text';
      let content: Record<string, unknown> | string = message.content as any;

      // Handle legacy format: { type: "text", data: "..." }
      if (typeof content === 'object' && content !== null) {
        const obj = content as Record<string, unknown>;
        if (obj.type && obj.data && !content_type.includes('_')) {
          // Legacy format -- convert
          if (obj.type === 'json' && typeof obj.data === 'object') {
            content = obj.data as Record<string, unknown>;
            content_type = 'text'; // will render as JSON fallback
          } else if (typeof obj.data === 'string') {
            content = { text: obj.data as string };
            content_type = 'text';
          }
        }
      } else if (typeof content === 'string') {
        content = { text: content };
        content_type = 'text';
      }

      return {
        id: String(message.id),
        sender_id: message.sender_id,
        content_type,
        content,
        timestamp: message.timestamp,
        isUser,
      };
    });
  }, [storeMessages, currentUserId, userSafeAddress]);

  const orderedMessages = useMemo(
    () =>
      [...mappedMessages].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [mappedMessages]
  );

  const paginatedMessages = useMemo(
    () => orderedMessages.slice(0, visibleCount),
    [orderedMessages, visibleCount]
  );

  // Prepend streaming message as the newest item so it scrolls naturally
  const messages = useMemo(() => {
    if (streamingText === undefined) return paginatedMessages;
    const streamingItem: ChatMessage = {
      id: '__streaming__',
      sender_id: '',
      content_type: 'streaming',
      content: streamingText,
      timestamp: new Date().toISOString(),
      isUser: false,
    };
    return [streamingItem, ...paginatedMessages];
  }, [paginatedMessages, streamingText]);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const init = async () => {
      setErrorMsg(null);

      let safeAddress = nexoidService.getSafeAddress();
      if (!safeAddress) {
        const { SecureStorage } = require('@/services/SecureStorage');
        safeAddress = await SecureStorage.getSafeAddress();
      }
      if (!safeAddress) {
        setErrorMsg('No wallet found. Please setup Safe.');
        return;
      }
      setUserSafeAddress(safeAddress);
      console.log('[RobotChat] Safe address', safeAddress);

      try {
        const managedUnits = await ManagedUnitsService.getAll();
        const searchId = (Array.isArray(id) ? id[0] : id)?.toLowerCase();
        const unit = managedUnits.find(
          (u) => u.address.toLowerCase() === searchId
        );

        if (unit) {
          console.log('[RobotChat] Robot unit', {
            address: unit.address,
            name: unit.name,
          });
          setRobot({
            id: unit.address,
            name: unit.name,
            type: 'robot',
            balance: 0,
            currency: 'USD',
            avatarUrl: unit.avatarUrl || '🤖',
            address: unit.address,
            tokens: [],
          });

          // Ensure we are authenticated before making API calls
          const { authService } = require('@/services/AuthService');
          if (!authService.isAuthenticated()) {
            console.log('[RobotChat] Not authenticated, attempting SIWE auth...');
            try {
              const { wdkService } = require('@/services/WDKService');
              const { SecureStorage } = require('@/services/SecureStorage');
              const address = await wdkService.getAddress('ethereum');
              const storedSafeAddress = await SecureStorage.getSafeAddress();
              await authService.authenticate(address, storedSafeAddress || undefined);
              console.log('[RobotChat] SIWE auth successful with Safe context:', { address, safeAddress: storedSafeAddress });
            } catch (authErr: any) {
              console.error('[RobotChat] SIWE auth failed:', authErr.message);
              setErrorMsg(`Authentication failed: ${authErr.message}`);
              return;
            }
          }

          const authAddress = authService.getAddress();
          if (authAddress && authAddress.toLowerCase() === unit.address.toLowerCase()) {
            setErrorMsg(
              'Robot address matches your authenticated address. Please use a different robot address.'
            );
            return;
          }

          const convId = await messagingService.setupConversation(
            safeAddress,
            unit.address
          );
          console.log('[RobotChat] Conversation ready', convId);
          setConversationId(convId);
        } else {
          setErrorMsg('Robot not found');
        }
      } catch (error: any) {
        setErrorMsg(`Init failed: ${error.message}`);
      }
    };

    if (id) init();
  }, [id]);

  // Set active conversation when focused, clear when blurred
  // This ensures notifications work when user navigates away
  useFocusEffect(
    useCallback(() => {
      if (conversationId) {
        messagingService.setActiveConversation(conversationId);
        setVisibleCount(pageSize);
        hasInitialScroll.current = false;
      }
      // Cleanup: clear active conversation when screen loses focus
      return () => {
        messagingService.setActiveConversation(null);
      };
    }, [conversationId, pageSize])
  );

  useEffect(() => {
    if (conversationId && storeMessages.length > 0) {
      messagingService.markAsRead(conversationId);
    }
  }, [conversationId, storeMessages.length]);

  useEffect(() => {
    if (!hasInitialScroll.current && messages.length > 0) {
      // In inverted lists, offset 0 is the latest message (bottom)
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      hasInitialScroll.current = true;
      previousMessageCount.current = messages.length;
    }
  }, [messages.length]);

  // Auto-scroll when new messages arrive (only if user is near bottom)
  const pendingScrollRef = useRef(false);
  useEffect(() => {
    if (hasInitialScroll.current && messages.length > previousMessageCount.current) {
      if (isNearBottom.current) {
        pendingScrollRef.current = true;
        // Scroll multiple times to catch async rendering of tall messages
        const scrollToBottom = () => flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        setTimeout(scrollToBottom, 100);
        setTimeout(scrollToBottom, 300);
        setTimeout(scrollToBottom, 600);
      }
      previousMessageCount.current = messages.length;
    }
  }, [messages.length]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleApproveDelegation = useCallback(
    async (data: DelegationRequestContent) => {
      if (!conversationId) return;
      setTxTitle('Processing Delegation');
      setTxSteps([
        { id: 'prepare', label: 'Preparing Delegation', status: 'processing' },
        { id: 'execute', label: 'Executing Transaction', status: 'pending' },
        { id: 'confirm', label: 'Confirming on Chain', status: 'pending' },
      ]);
      setTxHash(null);
      setTxModalVisible(true);

      try {
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'prepare' ? { ...s, status: 'completed' } : s
          )
        );
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'execute' ? { ...s, status: 'processing' } : s
          )
        );

        const hash = await chatActionService.approveDelegation(
          conversationId,
          data
        );
        setTxHash(hash);

        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'execute'
              ? { ...s, status: 'completed', description: hash }
              : s
          )
        );
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'confirm' ? { ...s, status: 'processing' } : s
          )
        );
        await new Promise((r) => setTimeout(r, 2000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'confirm' ? { ...s, status: 'completed' } : s
          )
        );
      } catch (error: any) {
        setTxSteps((prev) =>
          prev.map((s) =>
            s.status === 'processing'
              ? { ...s, status: 'error', description: error.message }
              : s
          )
        );
      }
    },
    [conversationId]
  );

  const handleRejectDelegation = useCallback(
    (data: DelegationRequestContent) => {
      if (!conversationId) return;
      chatActionService
        .rejectDelegation(conversationId, data)
        .catch(console.error);
    },
    [conversationId]
  );

  const handleApprovePayment = useCallback(
    async (data: PaymentRequestContent) => {
      if (!conversationId) return;
      setTxTitle('Processing Payment');
      setTxSteps([
        { id: 'prepare', label: 'Preparing Payment', status: 'processing' },
        { id: 'execute', label: 'Sending Tokens', status: 'pending' },
        { id: 'confirm', label: 'Confirming on Chain', status: 'pending' },
      ]);
      setTxHash(null);
      setTxModalVisible(true);

      try {
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'prepare' ? { ...s, status: 'completed' } : s
          )
        );
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'execute' ? { ...s, status: 'processing' } : s
          )
        );

        const hash = await chatActionService.approvePayment(
          conversationId,
          data
        );
        setTxHash(hash);

        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'execute'
              ? { ...s, status: 'completed', description: hash }
              : s
          )
        );
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'confirm' ? { ...s, status: 'processing' } : s
          )
        );
        await new Promise((r) => setTimeout(r, 2000));
        setTxSteps((prev) =>
          prev.map((s) =>
            s.id === 'confirm' ? { ...s, status: 'completed' } : s
          )
        );
      } catch (error: any) {
        setTxSteps((prev) =>
          prev.map((s) =>
            s.status === 'processing'
              ? { ...s, status: 'error', description: error.message }
              : s
          )
        );
      }
    },
    [conversationId]
  );

  const handleRejectPayment = useCallback(
    (data: PaymentRequestContent) => {
      if (!conversationId) return;
      chatActionService
        .rejectPayment(conversationId, data)
        .catch(console.error);
    },
    [conversationId]
  );

  const handleSend = async () => {
    if (!inputText.trim()) return;
    if (!userSafeAddress) {
      alert('Wallet address not found. Please restart app.');
      return;
    }
    if (!conversationId) {
      alert('Chat not connected.');
      return;
    }

    const text = inputText.trim();
    setInputText('');
    Haptics.selectionAsync();
    try {
      if (userSafeAddress && !messagingService.isInitialized()) {
        const { authService } = require('@/services/AuthService');
        const authAddress = authService.getAddress();
        messagingService.initialize(authAddress || userSafeAddress);
      }
      await messagingService.sendMessage(conversationId, text);

      // Always scroll to bottom when user sends a message
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        isNearBottom.current = true; // Update near-bottom state
      }, 100);
    } catch (e) {
      console.error('Send error:', e);
      alert('Failed to send message');
    }
  };

  const handleMicPress = async () => {
    if (isTranscribing) return;

    if (isRecording) {
      // Stop recording and transcribe
      try {
        setIsRecording(false);
        const recording = recordingRef.current;
        if (!recording) return;
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        recordingRef.current = null;
        if (!uri) return;

        setIsTranscribing(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Restore audio mode so iOS gives focus back to the keyboard
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        const text = await transcribeAudio(uri);
        if (text) {
          setInputText((prev) => (prev ? prev + ' ' + text : text));
        }
        // Only refocus if the keyboard was open before recording started
        if (keyboardWasVisibleRef.current) {
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      } catch (e) {
        console.error('Transcription error:', e);
        alert('Failed to transcribe audio');
      } finally {
        setIsTranscribing(false);
      }
    } else {
      // Start recording
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          alert('Microphone permission is required for voice input');
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        keyboardWasVisibleRef.current = keyboardVisible;
        setIsRecording(true);
        Haptics.selectionAsync();
      } catch (e) {
        console.error('Recording error:', e);
        alert('Failed to start recording');
      }
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!conversationId) return;
    setRefreshing(true);
    try {
      setVisibleCount(pageSize);
      await messagingService.fetchMessages(conversationId, {
        order: 'desc',
        limit: pageSize,
      });
    } catch {
      // ignore
    }
    setRefreshing(false);
  }, [conversationId, pageSize]);

  const handleLoadOlder = useCallback(async () => {
    if (!conversationId || isLoadingOlder) return;

    // If we already have more in memory, just increase visibleCount
    if (visibleCount < orderedMessages.length) {
      setVisibleCount((count) => Math.min(count + pageSize, orderedMessages.length));
      return;
    }

    setIsLoadingOlder(true);
    try {
      const added = await messagingService.fetchOlderMessages(conversationId, {
        limit: pageSize,
      });
      if (added > 0) {
        setVisibleCount((count) => count + pageSize);
      }
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, isLoadingOlder, orderedMessages.length, pageSize, visibleCount]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!robot) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Robot not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            // Clear active conversation BEFORE navigating back
            // This ensures notifications work when agent responds after user leaves
            messagingService.setActiveConversation(null);
            router.back();
          }}
          style={[styles.backButton, styles.headerSide]}
        >
          <ArrowLeft color="#1A1A1A" size={24} />
        </Pressable>
        <Pressable
          onPress={() => router.push(`/robot/${id}/info`)}
          style={styles.headerTitleContainer}
        >
          <Text style={styles.avatar}>{robot.avatarUrl}</Text>
          <View>
            <Text style={styles.title}>{robot.name}</Text>
            <View style={styles.statusRow}>
              {connectionState === 'connected' ? (
                <Wifi size={12} color="#2E7D32" />
              ) : connectionState === 'connecting' ? (
                <Wifi size={12} color="#F59E0B" />
              ) : (
                <WifiOff size={12} color="#999" />
              )}
              <Text
                style={[
                  styles.statusText,
                  connectionState === 'connected'
                    ? styles.statusOnline
                    : connectionState === 'connecting'
                    ? styles.statusConnecting
                    : styles.statusOffline,
                ]}
              >
                {connectionState === 'connected'
                  ? 'Online'
                  : connectionState === 'connecting'
                  ? 'Connecting...'
                  : 'Offline'}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/robot/${id}/info`)}
          style={styles.headerSide}
        >
          <ChevronRight size={20} color="#999" />
        </Pressable>
      </View>

      {/* Error Banner */}
      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable
            onPress={async () => {
              setErrorMsg(null);
              if (userSafeAddress && robot) {
                const convId = await messagingService.setupConversation(
                  userSafeAddress,
                  robot.id
                );
                setConversationId(convId);
              }
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Chat Area */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.chatContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        inverted
        onEndReached={handleLoadOlder}
        onEndReachedThreshold={0.1}
        onScroll={(event) => {
          // Track if user is near bottom of chat
          // For inverted lists, offset 0 means at the bottom (latest messages)
          const offsetY = event.nativeEvent.contentOffset.y;
          // Consider "near bottom" if within 100px of offset 0
          isNearBottom.current = offsetY < 100;
        }}
        scrollEventThrottle={400}
        onContentSizeChange={() => {
          // After a new message renders and lays out, scroll to show it fully
          if (pendingScrollRef.current) {
            pendingScrollRef.current = false;
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }, 50);
          }
        }}
        onLayout={() => {
          if (!hasInitialScroll.current && messages.length > 0) {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
            hasInitialScroll.current = true;
          }
        }}
        ListFooterComponent={() => (
          <View style={styles.bannerContainer}>
            <Text style={styles.bannerText}>
              Secure chat with your AI agent. Actions require your explicit approval.
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          // Render streaming message inline
          if (item.id === '__streaming__') {
            return (
              <View style={[styles.messageBubble, styles.robotBubble]}>
                <StreamingMessage text={item.content as string} />
              </View>
            );
          }
          const isUser = item.isUser;
          return (
            <View>
              <View
                style={[
                  styles.messageBubble,
                  isUser ? styles.userBubble : styles.robotBubble,
                ]}
              >
                <MessageRenderer
                  message={item}
                  onApproveDelegation={handleApproveDelegation}
                  onRejectDelegation={handleRejectDelegation}
                  onApprovePayment={handleApprovePayment}
                  onRejectPayment={handleRejectPayment}
                />
              </View>
            </View>
          );
        }}
      />

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.inputContainer, { paddingBottom: keyboardVisible ? 8 : insets.bottom + 8 }]}>
          <Pressable
            onPress={handleMicPress}
            style={[
              styles.micButton,
              isRecording && styles.micButtonRecording,
            ]}
            disabled={isTranscribing}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Mic
                color={isRecording ? '#fff' : '#666'}
                size={20}
              />
            )}
          </Pressable>

          <Animated.View
            style={[
              styles.inputWrapper,
              (isRecording || isTranscribing) && {
                borderColor: recordingPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: isRecording ? ['#FF3B3044', '#FF3B30'] : ['#007AFF44', '#007AFF'],
                }),
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={
                isRecording
                  ? 'Listening...'
                  : isTranscribing
                    ? 'Transcribing...'
                    : connectionState === 'connecting'
                      ? 'Connecting...'
                      : 'Type a message...'
              }
              placeholderTextColor={
                isRecording ? '#FF3B30' : isTranscribing ? '#007AFF' : connectionState === 'connecting' ? '#CCC' : '#999'
              }
            multiline
            maxLength={4000}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            />
          </Animated.View>

          <Pressable
            onPress={handleSend}
            style={[
              styles.sendButton,
              (!conversationId || !inputText.trim()) &&
                styles.sendButtonDisabled,
            ]}
            disabled={!conversationId || !inputText.trim()}
          >
            <Send
              color={
                !conversationId || !inputText.trim() ? '#999' : '#fff'
              }
              size={20}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Transaction Progress Modal */}
      <TransactionProgressModal
        visible={txModalVisible}
        onClose={() => {
          setTxModalVisible(false);
          setTxHash(null);
          setTxSteps([]);
        }}
        steps={txSteps}
        title={txTitle}
        txHash={txHash || undefined}
        onViewOnExplorer={(hash) => {
          const { Linking } = require('react-native');
          Linking.openURL(`https://sepolia.etherscan.io/tx/${hash}`);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  headerSide: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  avatar: {
    fontSize: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusOnline: {
    color: '#2E7D32',
  },
  statusConnecting: {
    color: '#F59E0B',
  },
  statusOffline: {
    color: '#999',
  },
  chatContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  bannerContainer: {
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 24,
    marginTop: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderStyle: 'dashed',
  },
  bannerText: {
    fontSize: 13,
    color: '#6C757D',
    textAlign: 'center',
    fontWeight: '500',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 8,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  robotBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  input: {
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    color: '#1A1A1A',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
  micButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonRecording: {
    backgroundColor: '#FF3B30',
  },
  errorBanner: {
    backgroundColor: '#FFE5E5',
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#D8000C',
    fontSize: 12,
    flex: 1,
  },
  retryText: {
    color: '#D8000C',
    fontWeight: 'bold',
    marginLeft: 10,
  },
});
