import React from 'react';
import { MarkdownText } from './MarkdownText';

interface Props {
  text: string;
  isUser: boolean;
}

export function MessageBubble({ text, isUser }: Props) {
  return <MarkdownText text={text} isUser={isUser} />;
}
