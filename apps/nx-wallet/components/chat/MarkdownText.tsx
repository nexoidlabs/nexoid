/**
 * Lightweight Markdown renderer for chat messages.
 *
 * Supported syntax:
 *   **bold**  /  __bold__
 *   *italic*  /  _italic_
 *   `inline code`
 *   ```code blocks```
 *   # / ## / ### headings
 *   - / * unordered lists
 *   1. ordered lists
 *   [label](url) → rendered as underlined label (no navigation – security)
 *   > blockquotes
 *
 * Security:
 *   - NO raw HTML rendering (tags are escaped / shown as-is)
 *   - Links are displayed as styled text only – never opened automatically
 *   - No image loading (prevents SSRF / tracking pixels)
 *   - No script or event-handler injection surface
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  text: string;
  isUser: boolean;
}

// ---------------------------------------------------------------------------
// Inline parser – converts a single line into <Text> spans
// ---------------------------------------------------------------------------

type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'boldItalic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; label: string };

function parseInline(line: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  // Order matters: bold-italic (***) before bold (**) before italic (*)
  const regex =
    /(\*\*\*(.+?)\*\*\*|___(.+?)___)|(\*\*(.+?)\*\*|__(.+?)__)|(\*(.+?)\*|_(.+?)_)|(`(.+?)`)|(\[(.+?)\]\(.+?\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    // Push preceding plain text
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: line.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // ***bold italic***
      nodes.push({ type: 'boldItalic', value: match[2] || match[3] });
    } else if (match[4]) {
      // **bold**
      nodes.push({ type: 'bold', value: match[5] || match[6] });
    } else if (match[7]) {
      // *italic*
      nodes.push({ type: 'italic', value: match[8] || match[9] });
    } else if (match[10]) {
      // `code`
      nodes.push({ type: 'code', value: match[11] });
    } else if (match[12]) {
      // [label](url) – render label only (security: no link opening)
      nodes.push({ type: 'link', label: match[13] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    nodes.push({ type: 'text', value: line.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', value: line }];
}

function renderInline(
  nodes: InlineNode[],
  baseStyle: 'user' | 'robot',
  key: string
) {
  const color = baseStyle === 'user' ? '#fff' : '#1A1A1A';
  const codeColor = baseStyle === 'user' ? 'rgba(255,255,255,0.15)' : '#E8E8E8';

  return (
    <Text key={key} style={[styles.text, { color }]}>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'bold':
            return (
              <Text key={i} style={{ fontWeight: '700' }}>
                {node.value}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={{ fontStyle: 'italic' }}>
                {node.value}
              </Text>
            );
          case 'boldItalic':
            return (
              <Text key={i} style={{ fontWeight: '700', fontStyle: 'italic' }}>
                {node.value}
              </Text>
            );
          case 'code':
            return (
              <Text
                key={i}
                style={[
                  styles.inlineCode,
                  { backgroundColor: codeColor, color },
                ]}
              >
                {node.value}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={i}
                style={{
                  textDecorationLine: 'underline',
                  color: baseStyle === 'user' ? '#D0E8FF' : '#007AFF',
                }}
              >
                {node.label}
              </Text>
            );
          default:
            return <Text key={i}>{node.value}</Text>;
        }
      })}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Block parser
// ---------------------------------------------------------------------------

type Block =
  | { type: 'heading'; level: number; content: string }
  | { type: 'codeBlock'; content: string }
  | { type: 'blockquote'; content: string }
  | { type: 'listItem'; ordered: boolean; index: number; content: string }
  | { type: 'paragraph'; content: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++; // skip opening ```
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'codeBlock', content: codeLines.join('\n') });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (ulMatch) {
      blocks.push({ type: 'listItem', ordered: false, index: 0, content: ulMatch[1] });
      i++;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^[\s]*(\d+)\.\s+(.+)$/);
    if (olMatch) {
      blocks.push({
        type: 'listItem',
        ordered: true,
        index: parseInt(olMatch[1], 10),
        content: olMatch[2],
      });
      i++;
      continue;
    }

    // Empty line – skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push({ type: 'paragraph', content: line });
    i++;
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarkdownText({ text, isUser }: Props) {
  const baseStyle = isUser ? 'user' : 'robot';
  const color = isUser ? '#fff' : '#1A1A1A';
  const blocks = parseBlocks(text);

  return (
    <View>
      {blocks.map((block, idx) => {
        const key = `b${idx}`;

        switch (block.type) {
          case 'heading': {
            const fontSize = block.level === 1 ? 20 : block.level === 2 ? 18 : 16;
            return (
              <Text
                key={key}
                style={[
                  styles.text,
                  {
                    color,
                    fontSize,
                    fontWeight: '700',
                    marginBottom: 4,
                    marginTop: idx > 0 ? 8 : 0,
                  },
                ]}
              >
                {block.content}
              </Text>
            );
          }

          case 'codeBlock':
            return (
              <View
                key={key}
                style={[
                  styles.codeBlock,
                  {
                    backgroundColor: isUser
                      ? 'rgba(255,255,255,0.12)'
                      : '#F3F3F3',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.codeBlockText,
                    { color: isUser ? '#E0E0E0' : '#333' },
                  ]}
                >
                  {block.content}
                </Text>
              </View>
            );

          case 'blockquote':
            return (
              <View
                key={key}
                style={[
                  styles.blockquote,
                  {
                    borderLeftColor: isUser
                      ? 'rgba(255,255,255,0.4)'
                      : '#CCC',
                  },
                ]}
              >
                {renderInline(parseInline(block.content), baseStyle, key + 'i')}
              </View>
            );

          case 'listItem':
            return (
              <View key={key} style={styles.listItem}>
                <Text style={[styles.text, { color }]}>
                  {block.ordered ? `${block.index}. ` : '\u2022 '}
                </Text>
                {renderInline(parseInline(block.content), baseStyle, key + 'i')}
              </View>
            );

          case 'paragraph':
          default:
            return renderInline(parseInline(block.content), baseStyle, key);
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  inlineCode: {
    fontFamily: 'SpaceMono',
    fontSize: 14,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  codeBlock: {
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  codeBlockText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    lineHeight: 18,
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginVertical: 2,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 1,
  },
});
