/**
 * Structured message types shared between the wallet and backend.
 *
 * Every persisted message has a `content_type` string and a `content`
 * JSON object whose shape depends on the type.
 */

// ---------------------------------------------------------------------------
// Content type enum
// ---------------------------------------------------------------------------

export enum MessageContentType {
  TEXT = 'text',
  DELEGATION_REQUEST = 'delegation_request',
  DELEGATION_RESPONSE = 'delegation_response',
  PAYMENT_REQUEST = 'payment_request',
  PAYMENT_RESPONSE = 'payment_response',
  STATUS_UPDATE = 'status_update',
  TRANSACTION_REPORT = 'transaction_report',
  CREDENTIAL_PRESENTED = 'credential_presented',
}

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export interface TextContent {
  text: string;
}

export interface DelegationRequestContent {
  identity_id: string;
  delegatee: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
  request_id?: string;
}

export interface DelegationResponseContent {
  identity_id: string;
  delegatee: string;
  approved: boolean;
  tx_hash?: string | null;
  error?: string | null;
  request_id?: string;
}

export interface PaymentRequestContent {
  token: string;
  amount: string;
  recipient: string;
  reason: string;
  chain?: string;
  request_id?: string;
}

export interface PaymentResponseContent {
  token: string;
  amount: string;
  recipient: string;
  approved: boolean;
  tx_hash?: string | null;
  error?: string | null;
  request_id?: string;
}

export interface StatusUpdateContent {
  title: string;
  description: string;
  status: 'info' | 'success' | 'warning' | 'error' | 'pending';
}

export interface TransactionReportContent {
  tx_hash: string;
  from: string;
  recipient: string;
  amount: string;
  token: string;
  network?: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface CredentialPresentedContent {
  identity_id: string;
  holder: string;
  valid: boolean;
  purpose?: string;
  error?: string | null;
}

// Union type for all content shapes
export type MessageContent =
  | TextContent
  | DelegationRequestContent
  | DelegationResponseContent
  | PaymentRequestContent
  | PaymentResponseContent
  | StatusUpdateContent
  | TransactionReportContent
  | CredentialPresentedContent;

// ---------------------------------------------------------------------------
// WebSocket event types
// ---------------------------------------------------------------------------

export interface WSMessageNew {
  type: 'message.new';
  conversation_id: string;
  message_id: number;
  sender_id: string;
  content_type: string;
  content: Record<string, unknown>;
  timestamp: string;
}

export interface WSStreamChunk {
  type: 'agent.stream.chunk';
  conversation_id: string;
  chunk: string;
  full_text: string;
}

export interface WSStreamEnd {
  type: 'agent.stream.end';
  conversation_id: string;
  error?: boolean;
}

export interface WSStreamStart {
  type: 'agent.stream.start';
  conversation_id: string;
}

export interface WSAgentAction {
  type: 'agent.action';
  conversation_id: string;
  action: {
    tool: string;
    args: Record<string, unknown>;
  };
}

export interface WSTypingIndicator {
  type: 'typing.start' | 'typing.stop';
  conversation_id: string;
  user_id: string;
}

export type WSEvent =
  | WSMessageNew
  | WSStreamChunk
  | WSStreamEnd
  | WSStreamStart
  | WSAgentAction
  | WSTypingIndicator;
