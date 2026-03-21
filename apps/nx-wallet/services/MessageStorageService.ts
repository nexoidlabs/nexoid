import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  username: string;
  expo_push_token: string | null;
}

export interface Conversation {
  id: string;
  participants: User[];
  created_at: string;
  updated_at: string;
  last_message?: Message; // Optional
}

export interface MessageContent {
  type: 'text' | 'ai' | 'human' | 'system' | 'json';
  data: string | any;
}

export interface Message {
  id: number | string; // number from backend, string for optimistic
  conversation_id: string;
  sender_id: string;
  content_type?: string; // e.g. "text", "delegation_request", "payment_request", ...
  content: MessageContent | string | any;
  timestamp: string;
  isOptimistic?: boolean; // UI only
  isRead?: boolean; // Track read status locally
}

const CONVERSATIONS_KEY = 'storage:conversations';
const MESSAGES_PREFIX = 'storage:messages:';
const CLEARED_AT_PREFIX = 'storage:clearedAt:';

class MessageStorageService {
  
  private listeners: (() => void)[] = [];
  private messageIdCache = new Map<string | number, number>();
  private cacheTtlMs = 5 * 60 * 1000;

  addChangeListener(listener: () => void) {
      this.listeners.push(listener);
  }

  removeChangeListener(listener: () => void) {
      this.listeners = this.listeners.filter(l => l !== listener);
  }

  private emitChange() {
      this.listeners.forEach(l => l());
  }

  private isDuplicate(messageId: string | number): boolean {
      const now = Date.now();
      this.messageIdCache.forEach((timestamp, id) => {
          if (now - timestamp > this.cacheTtlMs) {
              this.messageIdCache.delete(id);
          }
      });
      if (this.messageIdCache.has(messageId)) {
          return true;
      }
      this.messageIdCache.set(messageId, now);
      return false;
  }
  
  async syncConversations(userId: string): Promise<void> {
      // Helper to fetch all conversations for a user
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      try {
          const resp = await fetch(`${backendUrl}/users/${userId}/conversations`);
          if (resp.ok) {
              const incomingConversations: Conversation[] = await resp.json();
              await this.mergeConversations(incomingConversations);
          }
      } catch (e) {
          console.error('Failed to sync conversations', e);
      }
  }

  async mergeConversations(incoming: Conversation[]): Promise<void> {
      try {
          const existing = await this.getConversations();
          const map = new Map<string, Conversation>();
          
          existing.forEach(c => map.set(c.id, c));
          
          incoming.forEach(inc => {
              const current = map.get(inc.id);
              if (!current) {
                  map.set(inc.id, inc);
              } else {
                  // Merge logic: prefer incoming last_message if newer
                  let lastMessage = current.last_message;
                  
                  if (inc.last_message) {
                      if (!lastMessage || new Date(inc.last_message.timestamp) > new Date(lastMessage.timestamp)) {
                          lastMessage = inc.last_message;
                      }
                  }
                  
                  map.set(inc.id, {
                      ...current,
                      ...inc,
                      last_message: lastMessage
                  });
              }
          });
          
          const merged = Array.from(map.values());
          await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(merged));
          this.emitChange();
      } catch (e) {
          console.error('Failed to merge conversations', e);
      }
  }

  async getConversations(): Promise<Conversation[]> {
    try {
      const json = await AsyncStorage.getItem(CONVERSATIONS_KEY);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.error('Failed to load conversations', e);
      return [];
    }
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    try {
      const conversations = await this.getConversations();
      const index = conversations.findIndex(c => c.id === conversation.id);
      if (index >= 0) {
        conversations[index] = conversation;
      } else {
        conversations.push(conversation);
      }
      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
      this.emitChange();
    } catch (e) {
      console.error('Failed to save conversation', e);
    }
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    try {
      const json = await AsyncStorage.getItem(MESSAGES_PREFIX + conversationId);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.error('Failed to load messages', e);
      return [];
    }
  }

  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    try {
      await AsyncStorage.setItem(MESSAGES_PREFIX + conversationId, JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save messages', e);
    }
  }
  
  async updateConversationLastMessage(conversationId: string, message: Message): Promise<void> {
      try {
          const conversations = await this.getConversations();
          const index = conversations.findIndex(c => c.id === conversationId);
          if (index >= 0) {
              const current = conversations[index];
              const currentLastMsg = current.last_message;
              
              // Only update if newer
              if (!currentLastMsg || new Date(message.timestamp) > new Date(currentLastMsg.timestamp)) {
                  conversations[index] = {
                      ...current,
                      last_message: message,
                      updated_at: message.timestamp // Keep updated_at in sync
                  };
                  await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
                  this.emitChange();
              }
          } else {
             // If conversation not found in list, we can't update it easily because we miss participants/metadata.
             // Ideally we should fetch it, but that requires userId which we don't have here.
             // We rely on syncConversations or RobotChatScreen saving it.
          }
      } catch (e) {
          console.error('Failed to update conversation last message', e);
      }
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
      try {
          const messages = await this.getMessages(conversationId);
          // Check for dupes by ID if not optimistic
          if (!message.isOptimistic && (messages.some(m => m.id === message.id) || this.isDuplicate(message.id))) return;
          
          messages.push(message);
          await this.saveMessages(conversationId, messages);
          
          // Update conversation last_message for list view
          await this.updateConversationLastMessage(conversationId, message);
      } catch (e) {
          console.error('Failed to add message', e);
      }
  }
  
  async mergeMessages(conversationId: string, newMessages: Message[]): Promise<Message[]> {
      const current = await this.getMessages(conversationId);
      const clearedAt = await this.getClearedAt(conversationId);
      const clearedAtTime = clearedAt ? new Date(clearedAt).getTime() : 0;

      const map = new Map<string | number, Message>();
      // Keep existing read status when merging
      current.forEach(m => map.set(m.id, m));

      newMessages.forEach(m => {
          // Skip messages from before the conversation was cleared
          if (clearedAtTime && new Date(m.timestamp).getTime() < clearedAtTime) {
              return;
          }
          const existing = map.get(m.id);
          // Preserve isRead if it exists in local storage
          const isRead = existing?.isRead ?? m.isRead ?? false;
          map.set(m.id, { ...m, isRead });
      });

      const merged = Array.from(map.values()).sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      await this.saveMessages(conversationId, merged);
      
      // Update last message if we have messages
      if (merged.length > 0) {
          const lastMsg = merged[merged.length - 1];
          await this.updateConversationLastMessage(conversationId, lastMsg);
      }
      
      return merged;
  }

  async markAllAsRead(conversationId: string): Promise<void> {
      try {
          const messages = await this.getMessages(conversationId);
          let changed = false;
          const updated = messages.map(m => {
              if (!m.isRead) {
                  changed = true;
                  return { ...m, isRead: true };
              }
              return m;
          });
          
          if (changed) {
              await this.saveMessages(conversationId, updated);
          }
      } catch (e) {
          console.error('Failed to mark messages as read', e);
      }
  }

  async getUnreadCount(conversationId: string, userSafeAddress: string): Promise<number> {
      try {
          const messages = await this.getMessages(conversationId);
          // Count messages that are NOT read and NOT sent by me
          return messages.filter(m => !m.isRead && m.sender_id.toLowerCase() !== userSafeAddress.toLowerCase()).length;
      } catch (e) {
          console.error('Failed to get unread count', e);
          return 0;
      }
  }

  async getClearedAt(conversationId: string): Promise<string | null> {
      try {
          return await AsyncStorage.getItem(CLEARED_AT_PREFIX + conversationId);
      } catch {
          return null;
      }
  }

  async clearConversation(conversationId: string): Promise<void> {
      try {
          // Store the cleared-at timestamp so future fetches from backend are filtered
          await AsyncStorage.setItem(CLEARED_AT_PREFIX + conversationId, new Date().toISOString());
          await AsyncStorage.removeItem(MESSAGES_PREFIX + conversationId);
          const conversations = await this.getConversations();
          const updated = conversations.filter(c => c.id !== conversationId);
          await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(updated));
          this.emitChange();
      } catch (e) {
          console.error('Failed to clear conversation', e);
      }
  }

  async clearAllMessages(): Promise<void> {
      try {
          const keys = await AsyncStorage.getAllKeys();
          const messageKeys = keys.filter(key =>
              key === CONVERSATIONS_KEY || key.startsWith(MESSAGES_PREFIX) || key.startsWith(CLEARED_AT_PREFIX)
          );
          
          if (messageKeys.length > 0) {
              await AsyncStorage.multiRemove(messageKeys);
          }
          this.emitChange();
      } catch (e) {
          console.error('Failed to clear all messages', e);
      }
  }
}

export const messageStorageService = new MessageStorageService();
