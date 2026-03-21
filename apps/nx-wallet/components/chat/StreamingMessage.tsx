import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MarkdownText } from './MarkdownText';

interface Props {
  text: string;
}

/**
 * Renders a streaming agent response with markdown + blinking cursor.
 */
export function StreamingMessage({ text }: Props) {
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  return (
    <View style={styles.container}>
      <MarkdownText text={text} isUser={false} />
      <Animated.Text style={[styles.cursor, { opacity: cursorOpacity }]}>
        {' \u2588'}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  cursor: {
    fontSize: 16,
    color: '#007AFF',
  },
});
