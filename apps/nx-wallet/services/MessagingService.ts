/**
 * MessagingService -- DEMO STUB
 *
 * No messaging backend exists for the hackathon demo.
 * All methods are no-ops that keep the same public API so callers compile.
 */

import { useMessageStore } from '@/stores/MessageStore';

class MessagingService {
  private userId: string | null = null;

  isInitialized() {
    return !!this.userId;
  }

  initialize(userId: string) {
    this.userId = userId;
    useMessageStore.getState().setCurrentUserId(userId);
    useMessageStore.getState().setConnectionState('disconnected');
    console.log('[MessagingService DEMO] initialized with userId:', userId);
  }

  attachWebSocket(_ws: any) {
    // no-op
  }

  detachWebSocket() {
    // no-op
  }

  dispose() {
    this.userId = null;
  }

  async setupConversation(_userId: string, _robotId: string): Promise<string> {
    return `demo-conv-${Date.now()}`;
  }

  async syncConversations(_userId: string): Promise<void> {
    // no-op
  }

  async fetchMessages(_conversationId: string, _options?: any): Promise<void> {
    // no-op
  }

  async fetchOlderMessages(_conversationId: string, _options?: any): Promise<number> {
    return 0;
  }

  async sendMessage(_conversationId: string, _content: string): Promise<void> {
    console.log('[MessagingService DEMO] sendMessage - not available in demo mode');
  }

  async sendStructuredMessage(
    _conversationId: string,
    _payload: { content_type: string; content: Record<string, unknown> }
  ): Promise<void> {
    console.log('[MessagingService DEMO] sendStructuredMessage - not available in demo mode');
  }

  markAsRead(_conversationId: string) {
    // no-op
  }

  setActiveConversation(_conversationId: string | null) {
    // no-op
  }

  async registerUser(_id: string, _username: string): Promise<void> {
    // no-op
  }
}

export const messagingService = new MessagingService();
