import React from 'react';
import { MessageContentType } from '@/types/messages';
import type {
  DelegationRequestContent,
  DelegationResponseContent,
  PaymentRequestContent,
  PaymentResponseContent,
  StatusUpdateContent,
  TransactionReportContent,
  CredentialPresentedContent,
} from '@/types/messages';

import { MessageBubble } from './MessageBubble';
import { DelegationRequestCard } from './DelegationRequestCard';
import { PaymentRequestCard } from './PaymentRequestCard';
import { StatusUpdateCard } from './StatusUpdateCard';
import { ResponseCard } from './ResponseCard';
import { TransactionReportCard } from './TransactionReportCard';
import { CredentialPresentedCard } from './CredentialPresentedCard';

export interface ChatMessage {
  id: string;
  sender_id: string;
  content_type: string;
  content: Record<string, unknown> | string;
  timestamp: string;
  isUser: boolean;
}

interface Props {
  message: ChatMessage;
  onApproveDelegation: (data: DelegationRequestContent) => Promise<void>;
  onRejectDelegation: (data: DelegationRequestContent) => void;
  onApprovePayment: (data: PaymentRequestContent) => Promise<void>;
  onRejectPayment: (data: PaymentRequestContent) => void;
}

/**
 * Dispatches to the correct chat card component based on `content_type`.
 */
export function MessageRenderer({
  message,
  onApproveDelegation,
  onRejectDelegation,
  onApprovePayment,
  onRejectPayment,
}: Props) {
  const { content_type, content, isUser } = message;

  switch (content_type) {
    case MessageContentType.DELEGATION_REQUEST:
      return (
        <DelegationRequestCard
          data={content as unknown as DelegationRequestContent}
          onApprove={onApproveDelegation}
          onReject={onRejectDelegation}
          disabled={isUser}
        />
      );

    case MessageContentType.DELEGATION_RESPONSE:
      return (
        <ResponseCard
          type="delegation"
          data={content as unknown as DelegationResponseContent}
        />
      );

    case MessageContentType.PAYMENT_REQUEST:
      return (
        <PaymentRequestCard
          data={content as unknown as PaymentRequestContent}
          onApprove={onApprovePayment}
          onReject={onRejectPayment}
          disabled={isUser}
        />
      );

    case MessageContentType.PAYMENT_RESPONSE:
      return (
        <ResponseCard
          type="payment"
          data={content as unknown as PaymentResponseContent}
        />
      );

    case MessageContentType.STATUS_UPDATE:
      return (
        <StatusUpdateCard
          data={content as unknown as StatusUpdateContent}
        />
      );

    case MessageContentType.TRANSACTION_REPORT:
      return (
        <TransactionReportCard
          data={content as unknown as TransactionReportContent}
        />
      );

    case MessageContentType.CREDENTIAL_PRESENTED:
      return (
        <CredentialPresentedCard
          data={content as unknown as CredentialPresentedContent}
        />
      );

    case MessageContentType.TEXT:
    default: {
      // Extract text from various shapes
      let text = '';
      if (typeof content === 'string') {
        text = content;
      } else if (content && typeof content === 'object') {
        text =
          (content as any).text ||
          (content as any).data ||
          JSON.stringify(content);
      }
      return <MessageBubble text={text} isUser={isUser} />;
    }
  }
}
