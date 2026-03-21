import { create } from 'zustand';

import type { Conversation, Message } from '@/services/MessageStorageService';

export type DeliveryStatus = 'sending' | 'sent' | 'failed';
export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export interface ChatNotification {
  robotId: string;
  robotName: string;
  robotAvatar: string;
  messageText: string;
  conversationId: string;
}

interface MessageStoreState {
  currentUserId: string | null;
  conversations: Record<string, Conversation>;
  messages: Record<string, Message[]>;
  deliveryStatus: Record<string, DeliveryStatus>;
  unreadCounts: Record<string, number>;
  activeConversationId: string | null;
  connectionState: ConnectionState;
  notification: ChatNotification | null;

  // Streaming state: conversation_id -> current streaming text
  streamingMessages: Record<string, string>;

  setCurrentUserId: (userId: string | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  setActiveConversationId: (conversationId: string | null) => void;

  setConversations: (conversations: Conversation[]) => void;
  upsertConversation: (conversation: Conversation) => void;

  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message, options?: { markUnread?: boolean }) => void;
  replaceOptimistic: (conversationId: string, tempId: string, confirmed: Message) => void;
  setDeliveryStatus: (messageId: string, status: DeliveryStatus) => void;

  clearConversation: (conversationId: string) => void;
  markAllRead: (conversationId: string) => void;
  recomputeUnread: (conversationId: string) => void;
  clearNotification: () => void;
  setNotification: (notification: ChatNotification | null) => void;

  // Streaming actions
  setStreamingConversation: (conversationId: string, text: string) => void;
  appendStreamingChunk: (conversationId: string, fullText: string) => void;
  clearStreamingConversation: (conversationId: string) => void;

  getConversationByParticipant: (participantId: string) => Conversation | undefined;
  getLastMessageForConversation: (conversationId: string) => Message | undefined;
  getLastMessageForRobot: (robotId: string) => Message | undefined;
  getUnreadCountForRobot: (robotId: string) => number;
}

const sortMessages = (messages: Message[]) =>
  [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

export const useMessageStore = create<MessageStoreState>((set, get) => ({
  currentUserId: null,
  conversations: {},
  messages: {},
  deliveryStatus: {},
  unreadCounts: {},
  activeConversationId: null,
  connectionState: 'disconnected',
  notification: null,
  streamingMessages: {},

  setCurrentUserId: (userId) => set({ currentUserId: userId }),
  setConnectionState: (state) => set({ connectionState: state }),
  setActiveConversationId: (conversationId) => set({ activeConversationId: conversationId }),

  setConversations: (conversations) => {
    const map: Record<string, Conversation> = {};
    conversations.forEach((conversation) => {
      map[conversation.id] = conversation;
    });
    set({ conversations: map });
  },

  upsertConversation: (conversation) =>
    set((state) => ({
      conversations: {
        ...state.conversations,
        [conversation.id]: conversation,
      },
    })),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: sortMessages(messages),
      },
    })),

  addMessage: (conversationId, message, options) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];
      if (existing.some((m) => m.id === message.id)) {
        return {};
      }
      const updated = sortMessages([...existing, message]);

      const currentUserId = state.currentUserId;
      let unreadCounts = state.unreadCounts;
      if (options?.markUnread && currentUserId) {
        const isFromMe = message.sender_id.toLowerCase() === currentUserId.toLowerCase();
        if (!isFromMe && !message.isRead) {
          unreadCounts = {
            ...unreadCounts,
            [conversationId]: (unreadCounts[conversationId] || 0) + 1,
          };
        }
      }

      return {
        messages: {
          ...state.messages,
          [conversationId]: updated,
        },
        unreadCounts,
      };
    }),

  replaceOptimistic: (conversationId, tempId, confirmed) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];

      // Remove temporary message
      let filtered = existing.filter((m) => m.id !== tempId);

      // Check if confirmed message already exists (from WebSocket)
      const alreadyExists = filtered.some((m) => m.id === confirmed.id);

      // Only add confirmed message if it doesn't already exist
      const updated = alreadyExists
        ? filtered
        : sortMessages([...filtered, confirmed]);

      const { [tempId]: _removed, ...remaining } = state.deliveryStatus;

      return {
        messages: {
          ...state.messages,
          [conversationId]: updated,
        },
        deliveryStatus: {
          ...remaining,
          [String(confirmed.id)]: 'sent',
        },
      };
    }),

  setDeliveryStatus: (messageId, status) =>
    set((state) => ({
      deliveryStatus: {
        ...state.deliveryStatus,
        [messageId]: status,
      },
    })),

  clearConversation: (conversationId) =>
    set((state) => {
      const { [conversationId]: _msgs, ...restMessages } = state.messages;
      const { [conversationId]: _conv, ...restConversations } = state.conversations;
      const { [conversationId]: _unread, ...restUnread } = state.unreadCounts;
      return {
        messages: restMessages,
        conversations: restConversations,
        unreadCounts: restUnread,
      };
    }),

  markAllRead: (conversationId) =>
    set((state) => {
      const messages = state.messages[conversationId] || [];
      const updated = messages.map((m) => ({ ...m, isRead: true }));
      return {
        messages: {
          ...state.messages,
          [conversationId]: updated,
        },
        unreadCounts: {
          ...state.unreadCounts,
          [conversationId]: 0,
        },
      };
    }),

  recomputeUnread: (conversationId) =>
    set((state) => {
      const currentUserId = state.currentUserId;
      if (!currentUserId) return {};
      const messages = state.messages[conversationId] || [];
      const count = messages.filter(
        (m) => !m.isRead && m.sender_id.toLowerCase() !== currentUserId.toLowerCase()
      ).length;
      return {
        unreadCounts: {
          ...state.unreadCounts,
          [conversationId]: count,
        },
      };
    }),

  setNotification: (notification) => set({ notification }),
  clearNotification: () => set({ notification: null }),

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  setStreamingConversation: (conversationId, text) =>
    set((state) => ({
      streamingMessages: {
        ...state.streamingMessages,
        [conversationId]: text,
      },
    })),

  appendStreamingChunk: (conversationId, fullText) =>
    set((state) => ({
      streamingMessages: {
        ...state.streamingMessages,
        [conversationId]: fullText,
      },
    })),

  clearStreamingConversation: (conversationId) =>
    set((state) => {
      const { [conversationId]: _, ...rest } = state.streamingMessages;
      return { streamingMessages: rest };
    }),

  // ---------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------

  getConversationByParticipant: (participantId) => {
    const normalized = participantId.toLowerCase();
    const conversations = Object.values(get().conversations);
    return conversations.find((conversation) =>
      conversation.participants?.some(
        (participant) => participant.id?.toLowerCase() === normalized
      )
    );
  },

  getLastMessageForConversation: (conversationId) => {
    const messages = get().messages[conversationId] || [];
    if (messages.length === 0) return undefined;
    return messages[messages.length - 1];
  },

  getLastMessageForRobot: (robotId) => {
    const conversation = get().getConversationByParticipant(robotId);
    if (!conversation) return undefined;
    return get().getLastMessageForConversation(conversation.id) || conversation.last_message;
  },

  getUnreadCountForRobot: (robotId) => {
    const conversation = get().getConversationByParticipant(robotId);
    if (!conversation) return 0;
    return get().unreadCounts[conversation.id] || 0;
  },
}));
