import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Animated } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useMessageStore } from '@/stores/MessageStore';
import { X } from 'lucide-react-native';

export function ChatNotificationBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const notification = useMessageStore(state => state.notification);
  const clearNotification = useMessageStore(state => state.clearNotification);
  const [visible, setVisible] = useState(false);
  
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-100))[0];

  useEffect(() => {
    if (!notification) return;
    setVisible(true);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();

    const timeout = setTimeout(hideNotification, 5000);
    return () => clearTimeout(timeout);
  }, [notification]);

  const hideNotification = () => {
    Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start(() => {
        setVisible(false);
        clearNotification();
      });
  };

  // Hide notification if user navigates to the chat manually
  useEffect(() => {
      if (visible && notification) {
          const currentPath = decodeURIComponent(pathname.toLowerCase());
          const targetId = notification.robotId.toLowerCase();
          
          if (currentPath.includes(targetId)) {
              hideNotification();
          }
      }
  }, [pathname, visible, notification]);

  const handlePress = () => {
    if (notification) {
      router.push(`/robot/${notification.robotId}`);
      hideNotification();
    }
  };

  if (!visible || !notification) return null;

  return (
    <Animated.View style={[
      styles.container, 
      { 
        opacity: fadeAnim, 
        transform: [{ translateY: slideAnim }] 
      }
    ]}>
      <Pressable style={styles.content} onPress={handlePress}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatar}>{notification.robotAvatar}</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{notification.robotName}</Text>
          <Text style={styles.message} numberOfLines={1}>
            {notification.messageText}
          </Text>
        </View>
        <Pressable onPress={hideNotification} style={styles.closeButton}>
          <X size={20} color="#94A3B8" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#F1F5F9', // Slate 100
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontWeight: '700',
    fontSize: 15,
    color: '#0F172A', // Slate 900
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    color: '#64748B', // Slate 500
    lineHeight: 20,
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  }
});
