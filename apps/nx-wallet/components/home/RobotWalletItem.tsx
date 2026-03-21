import { MAIN_WALLET_ID, Wallet } from '@/constants/MockData';
import { useBalance } from '@/hooks/useBalance';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface RobotWalletItemProps {
  wallet: Wallet;
  onDrop: (walletId: string, x: number, y: number) => void;
  onPress: () => void;
  onDragUpdateJS?: (absoluteX: number, absoluteY: number) => void;
  onRegisterLayout?: (id: string, layout: { x: number, y: number, width: number, height: number }) => void;
  scrollOffsetX: SharedValue<number>;
  dropZoneShared: SharedValue<{ x: number, y: number, width: number, height: number }>;
  hoveredWalletId: SharedValue<string | null>;
  robotLayouts: SharedValue<Record<string, { x: number, y: number, width: number, height: number }>>;
  robotsContainerLayout: SharedValue<{ x: number, y: number, width: number, height: number }>;
  unreadCount?: number;
}

export function RobotWalletItem({ 
  wallet, 
  onDrop, 
  onPress, 
  onDragUpdateJS, 
  onRegisterLayout,
  scrollOffsetX,
  dropZoneShared,
  hoveredWalletId,
  robotLayouts,
  robotsContainerLayout,
  unreadCount = 0
}: RobotWalletItemProps) {
  
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const isPressed = useSharedValue(false);
  const startScrollX = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  
  // Use persistent balance
  const { balance } = useBalance(wallet.address || null);
  
  // Use display balance or wallet default if loading/null
  const displayBalance = balance ? parseFloat(balance) : wallet.balance;

  const formatAddress = (addr?: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const resetPosition = () => {
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    isDragging.value = false;
  };

  const handleLayout = (event: any) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    if (onRegisterLayout) {
      onRegisterLayout(wallet.id, { x, y, width, height });
    }
  };

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onBegin(() => {
      isPressed.value = true;
    })
    .onFinalize(() => {
      isPressed.value = false;
    })
    .onEnd(() => {
      runOnJS(onPress)();
    });

  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart((event) => {
      isDragging.value = true;
      isPressed.value = false;
      startScrollX.value = scrollOffsetX.value;
      touchX.value = event.x;
      touchY.value = event.y;
      runOnJS(Haptics.selectionAsync)();
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      
      const absX = event.absoluteX;
      const absY = event.absoluteY;
      
      const mainZone = dropZoneShared.value;
      const isOverMain = 
        mainZone.width > 0 &&
        absX >= mainZone.x && 
        absX <= mainZone.x + mainZone.width &&
        absY >= mainZone.y && 
        absY <= mainZone.y + mainZone.height;
      
      if (isOverMain) {
        if (hoveredWalletId.value !== MAIN_WALLET_ID) {
           hoveredWalletId.value = MAIN_WALLET_ID;
           runOnJS(Haptics.selectionAsync)();
        }
        if (onDragUpdateJS) runOnJS(onDragUpdateJS)(absX, absY);
        return;
      }

      const container = robotsContainerLayout.value;
      const scrollX = scrollOffsetX.value;
      const layouts = robotLayouts.value;
      let foundId: string | null = null;
      
      const ids = Object.keys(layouts);
      for (const id of ids) {
        if (id === wallet.id) continue;

        const layout = layouts[id];
        const targetScreenX = container.x + layout.x - scrollX;
        const targetScreenY = container.y + layout.y;
        
        if (
            absX >= targetScreenX && 
            absX <= targetScreenX + layout.width &&
            absY >= targetScreenY && 
            absY <= targetScreenY + layout.height
        ) {
            foundId = id;
            break;
        }
      }

      if (foundId) {
        if (hoveredWalletId.value !== foundId) {
          hoveredWalletId.value = foundId;
          runOnJS(Haptics.selectionAsync)();
        }
      } else {
        if (hoveredWalletId.value !== null) {
          hoveredWalletId.value = null;
        }
      }

      if (onDragUpdateJS) {
        runOnJS(onDragUpdateJS)(event.absoluteX, event.absoluteY);
      }
    })
    .onEnd((event) => {
      runOnJS(onDrop)(wallet.id, event.absoluteX, event.absoluteY);
      runOnJS(resetPosition)();
    })
    .onFinalize(() => {
      isDragging.value = false;
    });

  const pressProgress = useDerivedValue(() => {
    return withTiming((isPressed.value || isDragging.value) ? 1 : 0, { duration: 100 });
  });

  const containerStyle = useAnimatedStyle(() => {
    const isHovered = hoveredWalletId.value === wallet.id;
    const scale = isHovered ? 1.05 : 1;
    
    return {
      transform: [
        { scale: withSpring(scale) }
      ],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: withSpring(isHovered ? 0.1 : 0.05),
      shadowRadius: withSpring(isHovered ? 12 : 8),
      elevation: withSpring(isHovered ? 8 : 4),
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    const isHovered = hoveredWalletId.value === wallet.id;
    const isActive = isPressed.value || isDragging.value || isHovered;
    return {
        opacity: withTiming(isActive ? 0.05 : 0, { duration: 200 })
    };
  });

  const handleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + (scrollOffsetX.value - startScrollX.value) + touchX.value },
      { translateY: translateY.value + touchY.value },
      { scale: isDragging.value ? 1 : 0 },
    ],
    opacity: isDragging.value ? 1 : 0,  
    position: 'absolute',
    zIndex: 9999,
    top: 0, 
    left: 0, 
    // Center the cursor
    marginLeft: -40, // Half of 80
    marginTop: -40,
  }));

  const DragCursor = () => (
     <Animated.View style={[styles.dragCursor, handleStyle]} pointerEvents="none" />
  );

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      <DragCursor />
      <Animated.View style={[styles.container, containerStyle]}>
        
        {/* Background Layer */}
        <View style={StyleSheet.absoluteFill}>
          <Svg height="100%" width="100%">
            <Defs>
              <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="1" stopColor="#F1F5F9" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
            {/* Subtle Texture - Darker circle for light bg */}
            <Circle cx="100%" cy="0" r="80" fill="#0F172A" fillOpacity="0.03" />
          </Svg>
        </View>

        {/* Gesture Layer */}
        <GestureDetector gesture={Gesture.Race(pan, tap)}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]} />
        </GestureDetector>

        {/* Interaction Overlay - Dark overlay for light theme */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, overlayStyle]} pointerEvents="none" />

        {/* Content Layer */}
        <View style={[StyleSheet.absoluteFill, styles.content]} pointerEvents="none">
             <View style={styles.header}>
                <View style={styles.avatarContainer}>
                   <Text style={styles.avatarEmoji}>{wallet.avatarUrl}</Text>
                   {unreadCount > 0 && (
                     <View style={styles.unreadBadge}>
                       <Text style={styles.unreadText}>{unreadCount}</Text>
                     </View>
                   )}
                </View>
                <View style={styles.statusDot} />
             </View>
             
             <View style={styles.info}>
                 <Text style={styles.name} numberOfLines={1}>{wallet.name}</Text>
                 {wallet.address && (
                    <Text style={styles.addressText}>{formatAddress(wallet.address)}</Text>
                 )}
                 <Text style={styles.balance}>${displayBalance.toFixed(2)}</Text>
             </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginRight: 12,
    width: 140,
    height: 160,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0', // Slate 200
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC', // Slate 50
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9', // Slate 100
  },
  avatarEmoji: {
    fontSize: 22,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444', // Red-500
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  unreadText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80', // Green-400
    marginTop: 4,
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  info: {
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155', // Slate 700
    letterSpacing: -0.3,
  },
  addressText: {
    color: '#94A3B8', // Slate 400
    fontSize: 11,
    fontFamily: 'SpaceMono',
  },
  balance: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A', // Slate 900
    marginTop: 2,
  },
  dragCursor: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: 'rgba(100, 116, 139, 0.4)', 
      borderWidth: 2,
      borderColor: 'rgba(255, 255, 255, 0.8)',
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
  }
});
