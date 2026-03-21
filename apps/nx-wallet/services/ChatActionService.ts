/**
 * ChatActionService -- DEMO STUB
 *
 * No backend or on-chain chat actions for the hackathon demo.
 * All methods throw a descriptive error.
 */

class ChatActionServiceClass {
  async approveDelegation(_conversationId: string, _data: any): Promise<string> {
    throw new Error('Chat actions are not available in demo mode');
  }

  async rejectDelegation(_conversationId: string, _data: any): Promise<void> {
    throw new Error('Chat actions are not available in demo mode');
  }

  async approvePayment(_conversationId: string, _data: any): Promise<string> {
    throw new Error('Chat actions are not available in demo mode');
  }

  async rejectPayment(_conversationId: string, _data: any): Promise<void> {
    throw new Error('Chat actions are not available in demo mode');
  }
}

export const chatActionService = new ChatActionServiceClass();
