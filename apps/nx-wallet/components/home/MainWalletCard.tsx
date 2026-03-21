import { MAIN_WALLET_ID, Wallet } from '@/constants/MockData';
import { nexoidService } from '@/services/NexoidService';
import { wdkService } from '@/services/WDKService';
import { useBalance } from '@/hooks/useBalance';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ArrowUpRight, Copy, Plus, QrCode, Repeat } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
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

interface MainWalletCardProps {
  wallet: Wallet;
  onLayout?: (event: any) => void;
  style?: ViewStyle;
  onPress?: () => void;
  hoveredWalletId?: SharedValue<string | null>;
  onDrop?: (walletId: string, x: number, y: number) => void;
  onDragUpdateJS?: (absoluteX: number, absoluteY: number) => void;
  onSend?: () => void;
  scrollOffsetX?: SharedValue<number>;
  robotLayouts?: SharedValue<Record<string, { x: number, y: number, width: number, height: number }>>;
  robotsContainerLayout?: SharedValue<{ x: number, y: number, width: number, height: number }>;
  isDraggingShared?: SharedValue<boolean>;
}

export function MainWalletCard({ 
  wallet, 
  onLayout, 
  style, 
  onPress, 
  hoveredWalletId,
  onDrop,
  onDragUpdateJS,
  onSend,
  scrollOffsetX,
  robotLayouts,
  robotsContainerLayout,
  isDraggingShared
}: MainWalletCardProps) {
  
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const isPressed = useSharedValue(false);
  const startScrollX = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const [copied, setCopied] = useState(false);
  // Start with loading state and null balance to avoid showing mock data
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [address, setAddress] = useState<string | null>(null);

  // Fetch USDT balance and address for main wallet
  useEffect(() => {
    let isMounted = true;

    const fetchWalletData = async () => {
      // Ensure we don't try to fetch data if wallet ID is invalid or address is missing
      if (!wallet.id) return;

      if (wallet.id === MAIN_WALLET_ID) {
        try {
          if (isMounted) setIsLoadingBalance(true);
          
          // Attempt to use Safe Address
          // We prefer showing the Safe address even if the service isn't fully "ready" (e.g. SDK init pending)
          // as long as the address is known/configured.
          const safeAddr = nexoidService.getSafeAddress();
          
          if (safeAddr && isMounted) {
            setAddress(safeAddr);
          } 
          // Removed fallback to WDK/EOA as per requirement: always display Safe wallet
          // If Safe address is not available yet, we wait (address stays null)
        } catch (err) {
          // Suppress error messages
        } finally {
          if (isMounted) setIsLoadingBalance(false);
        }
      } else {
        // For non-main wallets (robots), we might still want to show what was passed
        // but since we want to avoid "mock data" generally, let's treat them carefully.
        // For now, only Main Wallet logic was requested to be fixed regarding mock data.
        if (isMounted) {
            setBalance(wallet.balance.toFixed(2));
            setAddress(wallet.address || null);
            setIsLoadingBalance(false);
        }
      }
    };

    fetchWalletData();

    // Subscribe to NexoidService changes (e.g. late initialization)
    const unsubscribe = nexoidService.addChangeListener(() => {
        fetchWalletData();
    });

    return () => {
        isMounted = false;
        unsubscribe();
    };
  }, [wallet.id]);

  const { balance: liveBalance, isLoading: isLiveLoading } = useBalance(address);

  // Use live balance for main wallet, fallback to state for others
  const activeBalance = wallet.id === MAIN_WALLET_ID ? liveBalance : balance;
  const activeLoading = wallet.id === MAIN_WALLET_ID ? isLiveLoading : isLoadingBalance;

  // Fallback balance display if null (loading)
  // Ensure we don't crash if displayBalance is referenced before defined
  const displayBalance = activeBalance || null;

  const resetPosition = () => {
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    isDragging.value = false;
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
      if (onPress) runOnJS(onPress)();
    });

  const pan = Gesture.Pan()
    .minDistance(10)
    .activateAfterLongPress(200)
    .onStart((event) => {
      isDragging.value = true;
      isPressed.value = false;
      if (isDraggingShared) isDraggingShared.value = true;
      if (scrollOffsetX) {
        startScrollX.value = scrollOffsetX.value;
      }
      touchX.value = event.x;
      touchY.value = event.y;
      runOnJS(Haptics.selectionAsync)();
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      
      const absX = event.absoluteX;
      const absY = event.absoluteY;
      
      if (robotsContainerLayout && robotLayouts && scrollOffsetX && hoveredWalletId) {
        const container = robotsContainerLayout.value;
        const scrollX = scrollOffsetX.value;
        const layouts = robotLayouts.value;
        let foundId: string | null = null;
        
        const ids = Object.keys(layouts);
        for (const id of ids) {
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
      }
      
      if (onDragUpdateJS) {
        runOnJS(onDragUpdateJS)(absX, absY);
      }
    })
    .onEnd((event) => {
      if (onDrop) {
        runOnJS(onDrop)(wallet.id, event.absoluteX, event.absoluteY);
      }
      runOnJS(resetPosition)();
      if (isDraggingShared) isDraggingShared.value = false;
    })
    .onFinalize(() => {
      isDragging.value = false;
      if (isDraggingShared) isDraggingShared.value = false;
    });

  const pressProgress = useDerivedValue(() => {
    return withTiming((isPressed.value || isDragging.value) ? 1 : 0, { duration: 100 });
  });

  const animatedStyle = useAnimatedStyle(() => {
    const isHovering = hoveredWalletId?.value === wallet.id;
    const scale = isHovering ? 1.02 : 1;
    
    return {
      transform: [
        { scale: withSpring(scale) }
      ],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: withSpring(isHovering ? 0.5 : 0.3),
      shadowRadius: withSpring(isHovering ? 20 : 10),
      elevation: withSpring(isHovering ? 15 : 8),
      zIndex: isDragging.value ? 999 : 1,
    };
  });
  
  const overlayStyle = useAnimatedStyle(() => {
    const isHovering = hoveredWalletId?.value === wallet.id;
    const isActive = isPressed.value || isDragging.value || isHovering;
    return {
        opacity: withTiming(isActive ? 0.15 : 0, { duration: 200 })
    };
  });
  
  const handleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + (scrollOffsetX ? scrollOffsetX.value - startScrollX.value : 0) + touchX.value },
      { translateY: translateY.value + touchY.value },
      { scale: isDragging.value ? 1 : 0 },
    ],
    opacity: isDragging.value ? 1 : 0,  
    position: 'absolute',
    zIndex: 9999,
    top: 0,
    left: 0,
    marginLeft: -40,
    marginTop: -40,
  }));

  const DragCursor = () => (
      <Animated.View style={[styles.dragCursor, handleStyle]} pointerEvents="none" />
  );

  const formatAddress = (addr?: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleCopy = async () => {
    if (address) {
        await Clipboard.setStringAsync(address);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAction = (label: string) => {
    console.log(`Action button pressed in MainWalletCard: ${label}`);
    Haptics.selectionAsync();
    if (label === 'Send' && onSend) {
      console.log('onSend callback being triggered from MainWalletCard');
      onSend();
      return;
    }
    // Placeholder for future navigation or logic
    console.log(`Action pressed: ${label}`);
  };

  return (
    <View>
        <View>
          <DragCursor />
          <Animated.View 
            style={[styles.container, style, animatedStyle]} 
            onLayout={onLayout}
          >
            {/* Background Layer */}
            <View style={StyleSheet.absoluteFill}>
              <Svg height="100%" width="100%">
                <Defs>
                  <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#334155" stopOpacity="1" />
                    <Stop offset="1" stopColor="#0F172A" stopOpacity="1" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
                <Circle cx="100%" cy="0" r="100" fill="white" fillOpacity="0.05" />
                <Circle cx="0%" cy="100%" r="50" fill="white" fillOpacity="0.02" />
              </Svg>
            </View>
            
            {/* Gesture Handling Layer - sits behind content but above background */}
            <GestureDetector gesture={Gesture.Race(pan, tap)}>
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]} />
            </GestureDetector>

            {/* Interaction Feedback Overlay */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 0 }, overlayStyle]} pointerEvents="none" />
            
            {/* Content Layer - allow touches to pass through to gesture layer for empty spaces */}
            <View style={[StyleSheet.absoluteFill, styles.content, { zIndex: 1 }]} pointerEvents="box-none">
                <View style={styles.headerRow} pointerEvents="box-none">
                    <View pointerEvents="box-none">
                    <Text style={styles.walletName}>Main Wallet</Text>
                    {address && (
                        <Pressable 
                            style={styles.addressContainer} 
                            onPress={handleCopy}
                            hitSlop={10}
                        >
                            <Text style={styles.addressText}>{formatAddress(address)}</Text>
                            {copied ? (
                                <Text style={[styles.addressText, { marginLeft: 6, color: '#4ADE80' }]}>Copied!</Text>
                            ) : (
                                <Copy size={12} color="#94A3B8" style={{ marginLeft: 6 }} />
                            )}
                        </Pressable>
                    )}
                    </View>
                    <View style={styles.nxLogoContainer}>
                    <Text style={styles.nxLogoText}>NX</Text>
                    </View>
                </View>

                <View style={styles.balanceContainer} pointerEvents="none">
                    <Text style={styles.currencySymbol}>{wallet.currency === 'USD' ? '$' : wallet.currency}</Text>
                    {activeLoading || displayBalance === null ? (
                      <ActivityIndicator size="large" color="#FFF" style={{ marginLeft: 8 }} />
                    ) : (
                      <Text style={styles.balanceAmount}>
                        {parseFloat(displayBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    )}
                </View>

                <View style={styles.actionsRow} pointerEvents="box-none">
                    <ActionButton icon={<ArrowUpRight size={24} color="#FFF" />} label="Send" onPress={() => handleAction('Send')} />
                    <ActionButton icon={<Plus size={24} color="#FFF" />} label="Top Up" onPress={() => handleAction('Top Up')} />
                    <ActionButton icon={<Repeat size={24} color="#FFF" />} label="Swap" onPress={() => handleAction('Swap')} />
                    <ActionButton icon={<QrCode size={24} color="#FFF" />} label="Receive" onPress={() => handleAction('Receive')} />
                </View>
            </View>
          </Animated.View>
        </View>
    </View>
  );
}

function ActionButton({ icon, label, onPress }: { icon: React.ReactNode, label: string, onPress?: () => void }) {
  return (
    <Pressable style={styles.actionItem} onPress={onPress}>
      <View style={styles.actionIcon}>
        {icon}
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    marginHorizontal: 20,
    marginVertical: 10,
    minHeight: 225,
    overflow: 'hidden',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
    flex: 1,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  walletName: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
    marginTop: -4,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  addressText: {
    color: '#94A3B8',
    fontSize: 13,
    fontFamily: 'SpaceMono',
  },
  nxLogoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -8,
  },
  nxLogoText: {
    fontSize: 36,
    color: '#fff',
    fontWeight: '800',
    opacity: 0.5,
    letterSpacing: -1,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
  },
  currencySymbol: {
    fontSize: 24,
    color: '#FFF',
    fontWeight: '600',
    marginTop: 8,
    marginRight: 4,
  },
  balanceAmount: {
    fontSize: 42,
    color: '#FFF',
    fontWeight: '700',
    letterSpacing: -1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
  dragCursor: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(100, 116, 139, 0.4)', // Slate 500 with opacity
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  }
});
