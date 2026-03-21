import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainWalletCard } from '@/components/home/MainWalletCard';
import { RobotWalletItem } from '@/components/home/RobotWalletItem';
import { TransactionList } from '@/components/home/TransactionList';
import { WalletHeader } from '@/components/home/WalletHeader';
import { TransactionProgressModal, TransactionStep } from '@/components/modals/TransactionProgressModal';
import { TransferModal } from '@/components/modals/TransferModal';
import { INITIAL_WALLETS, MAIN_WALLET_ID, Transaction, Wallet } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';
import { balanceService } from '@/services/BalanceService';
import { transactionService } from '@/services/TransactionService';
import { nexoidService } from '@/services/NexoidService';
import { wdkService } from '@/services/WDKService';
import { SecureStorage } from '@/services/SecureStorage';
import { messagingService } from '@/services/MessagingService';
import { useMessageStore } from '@/stores/MessageStore';
import * as Linking from 'expo-linking';

import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export default function HomeScreen() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>(INITIAL_WALLETS.filter(w => w.type === 'main'));
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [progressSteps, setProgressSteps] = useState<TransactionStep[]>([
    { id: 'sign', label: 'Signing Transaction', status: 'pending', description: 'Authorize transfer with your secure key' },
    { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Sending transaction to Ethereum Sepolia network nodes' },
    { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction on the blockchain' }
  ]);
  const [transferState, setTransferState] = useState<{ sourceId: string | null, targetId: string | null }>({ sourceId: null, targetId: null });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const unreadCounts = useMessageStore(state => state.unreadCounts);
  const conversations = useMessageStore(state => state.conversations);

  const getUnreadCountForRobot = useCallback((robotId: string) => {
    const normalized = robotId.toLowerCase();
    const conversation = Object.values(conversations).find(c =>
      c.participants?.some(p => p.id?.toLowerCase() === normalized)
    );
    if (!conversation) return 0;
    return unreadCounts[conversation.id] || 0;
  }, [unreadCounts, conversations]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const fetchWallets = async () => {
    try {
      const managedUnits = await ManagedUnitsService.getAll();
      
      // Create wallet objects for each managed unit
      const unitWallets: Wallet[] = await Promise.all(managedUnits.map(async (unit) => {
        // Trigger background refresh of balances
        balanceService.refreshBalance(unit.address);
        
        // Initial state doesn't need to await balance, use stored if available via BalanceService (but here we construct object)
        // MainWalletCard/RobotWalletItem will handle displaying the live balance via hook.
        // We just need the structure.
        
        return {
          id: unit.address,
          name: unit.name,
          type: 'robot' as const,
          balance: 0, // Placeholder, managed by UI hook
          currency: 'USD',
          avatarUrl: unit.avatarUrl || '🤖',
          address: unit.address,
          tokens: [],
        };
      }));

      // If no managed units yet, only show the main wallet
      const mockMainWallet = INITIAL_WALLETS.find(w => w.id === MAIN_WALLET_ID)!;
      let mainWalletAddress = mockMainWallet.address;

      try {
        // Try to get configured Safe address first
        const safeAddr = await SecureStorage.getSafeAddress();
        
        if (safeAddr) {
          mainWalletAddress = safeAddr;
        } else {
          // Fallback to WDK address (Signer)
          const address = await wdkService.getAddress('ethereum');
          mainWalletAddress = address;
        }

        // Trigger background refresh
        balanceService.refreshBalance(mainWalletAddress);
      } catch (e) {
        console.warn('Failed to fetch real address for main wallet, falling back to mock');
      }

      const mainWallet: Wallet = {
        ...mockMainWallet,
        balance: 0, // Placeholder
        address: mainWalletAddress,
      };

      // Ensure NexoidService is configured with the address we are using
      if (mainWalletAddress) {
        nexoidService.configure(mainWalletAddress);
        messagingService.syncConversations(mainWalletAddress).catch(() => undefined);
      }

      setWallets([mainWallet, ...unitWallets]);
      
    } catch (err) {
      console.error('Failed to fetch wallets:', err);
      setWallets(INITIAL_WALLETS);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchWallets();
    }, [])
  );
  
  const mainWalletRef = useRef<View>(null);
  
  // Shared values for UI-thread logic
  const dropZoneShared = useSharedValue({ x: 0, y: 0, width: 0, height: 0 });
  // Use a string ID for hover state to support multiple targets
  const hoveredWalletId = useSharedValue<string | null>(null);
  const isDraggingMainWalletShared = useSharedValue(false);
  
  // Track robot layouts and container
  const robotsContainerLayout = useSharedValue({ x: 0, y: 0, width: 0, height: 0 });
  const robotLayouts = useSharedValue<Record<string, { x: number, y: number, width: number, height: number }>>({});
  const layoutsRef = useRef<Record<string, { x: number, y: number, width: number, height: number }>>({});

  const handleRegisterLayout = (id: string, layout: { x: number, y: number, width: number, height: number }) => {
    layoutsRef.current[id] = layout;
    robotLayouts.value = { ...layoutsRef.current };
  };
  
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollLayout = useRef<{width: number, x: number} | null>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shared value to track scroll offset
  const scrollOffsetX = useSharedValue(0);

  const mainWallet = wallets.find(w => w.id === MAIN_WALLET_ID)!;
  const robotWallets = wallets.filter(w => w.type === 'robot');
  
  const fetchTransactions = async (force = false) => {
    // Only fetch if we have a valid-looking address (not the mock default if it hasn't been replaced yet, 
    // although NexoidService logic handles any address).
    if (!mainWallet.address) return;
    
    try {
      // 1. Load cache immediately (if not forcing refresh)
      if (!force) {
        const cached = await transactionService.getCachedTransactions(mainWallet.address);
        if (cached && cached.length > 0) {
          setTransactions(cached);
          // If we have cache, we don't need to show full loading state, 
          // but we can let the background fetch happen silently
          setTransactionsLoading(false);
        } else {
          // No cache, show loading
          if (transactions.length === 0) setTransactionsLoading(true);
        }
      } else {
        setTransactionsLoading(true);
      }

      // 2. Fetch fresh data (background update)
      const mainHistory = await nexoidService.getUSDTTransactionHistory(force);
      const managedUnits = await ManagedUnitsService.getAll();
      const unitHistories = await Promise.all(
        managedUnits.map(unit =>
          transactionService.getTransactionHistory(unit.address, force, unit.address)
        )
      );

      const merged = [...mainHistory, ...unitHistories.flat()].filter(tx =>
        (tx.tokenSymbol || '').toUpperCase() === 'USDT' &&
        Math.abs(tx.amount) >= 0.001
      ).sort(
        (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
      );
      
      // Update state with fresh data
      setTransactions(merged);
    } catch (e) {
      console.warn('Failed to fetch transactions:', e);
    } finally {
      setTransactionsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [mainWallet.address]);

  const handleMainWalletLayout = () => {
    mainWalletRef.current?.measure((x, y, width, height, pageX, pageY) => {
      // Update the shared value for the UI thread
      dropZoneShared.value = { x: pageX, y: pageY, width, height };
    });
  };

  const handleDragUpdate = (absoluteX: number, absoluteY: number) => {
    // 1. Check Scroll Edges (keep on JS thread for now as it uses setInterval/timers)
    if (scrollLayout.current) {
      const threshold = 50;
      const { width, x } = scrollLayout.current;
      const leftEdge = x;
      const rightEdge = x + width;
      
      if (absoluteX < leftEdge + threshold) {
        startAutoScroll('left');
      } else if (absoluteX > rightEdge - threshold) {
        startAutoScroll('right');
      } else {
        stopAutoScroll();
      }
    }
  };

  const startAutoScroll = (direction: 'left' | 'right') => {
    if (autoScrollTimer.current) return; 

    autoScrollTimer.current = setInterval(() => {
      performAutoScroll(direction);
    }, 16);
  };
  
  // Revised Auto Scroll Logic using onScroll tracking
  const currentScrollX = useRef(0);
  const contentWidth = useRef(0);

  const handleScroll = (event: any) => {
    currentScrollX.current = event.nativeEvent.contentOffset.x;
    scrollOffsetX.value = event.nativeEvent.contentOffset.x;
    contentWidth.current = event.nativeEvent.contentSize.width;
  };

  const performAutoScroll = (direction: 'left' | 'right') => {
      if (!scrollRef.current || !scrollLayout.current) return;
      
      const step = 15;
      const maxScroll = contentWidth.current - scrollLayout.current.width;
      
      let newX = direction === 'left' 
        ? Math.max(0, currentScrollX.current - step)
        : Math.min(maxScroll > 0 ? maxScroll : 0, currentScrollX.current + step);
        
      if (newX === currentScrollX.current) return;

      scrollRef.current.scrollTo({ x: newX, animated: false });
      currentScrollX.current = newX; 
      scrollOffsetX.value = newX;
  };
  
  const stopAutoScroll = () => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  };

  const handleDrop = (sourceId: string, absoluteX: number, absoluteY: number) => {
    stopAutoScroll(); 
    
    // Check Main Wallet Drop
    const mainZone = dropZoneShared.value;
    const isOverMain = 
      sourceId !== MAIN_WALLET_ID && // Prevent self-transfer
      mainZone.width > 0 &&
      absoluteX >= mainZone.x && 
      absoluteX <= mainZone.x + mainZone.width &&
      absoluteY >= mainZone.y && 
      absoluteY <= mainZone.y + mainZone.height;

    if (isOverMain) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTransferState({ sourceId, targetId: MAIN_WALLET_ID });
      setTransferModalVisible(true);
      hoveredWalletId.value = null;
      return;
    }

    // Check Robot Wallets Drop
    const container = robotsContainerLayout.value;
    if (container.width > 0) {
      const scrollX = scrollOffsetX.value;
      const layouts = robotLayouts.value;
      
      for (const [targetId, layout] of Object.entries(layouts)) {
        if (targetId === sourceId) continue;

        const targetScreenX = container.x + layout.x - scrollX;
        const targetScreenY = container.y + layout.y;
        
        const isOverTarget = 
          absoluteX >= targetScreenX &&
          absoluteX <= targetScreenX + layout.width &&
          absoluteY >= targetScreenY &&
          absoluteY <= targetScreenY + layout.height;
          
        if (isOverTarget) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTransferState({ sourceId, targetId });
          setTransferModalVisible(true);
          hoveredWalletId.value = null;
          return;
        }
      }
    }
    
    hoveredWalletId.value = null;
  };

  const handleConfirmTransfer = async (amount: number, externalAddress?: string) => {
    const { sourceId, targetId } = transferState;
    if (!sourceId || (!targetId && !externalAddress)) return;

    // Reset progress steps
    const initialSteps: TransactionStep[] = [
      { id: 'sign', label: 'Signing Transaction', status: 'processing', description: 'Authorize transfer with your secure key' },
      { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Sending transaction to Ethereum Sepolia network nodes' },
      { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction on the blockchain' }
    ];
    setProgressSteps(initialSteps);
    setTxHash(undefined);
    setTransferModalVisible(false);
    
    // Slight delay to allow TransferModal to close before showing progress
    setTimeout(() => setProgressModalVisible(true), 300);

    const updateStepStatus = (id: string, status: TransactionStep['status'], description?: string) => {
      setProgressSteps(prev => prev.map(step => 
        step.id === id ? { ...step, status, ...(description ? { description } : {}) } : step
      ));
    };

    try {
      const sourceWallet = wallets.find(w => w.id === sourceId);
      const targetAddress = externalAddress || wallets.find(w => w.id === targetId)?.address;

      if (sourceWallet?.address && targetAddress) {
        if (sourceId === MAIN_WALLET_ID) {
          console.log(`Executing real USDT transfer from Main Wallet to ${targetAddress}`);
          
          // Check if Safe is configured and ready
          if (nexoidService.isReady()) {
            console.log('Using Nexoid wallet for transaction');

            // 1. Preparing transaction (Nexoid-specific)
            updateStepStatus('sign', 'processing', 'Preparing Nexoid transaction');
            await new Promise(resolve => setTimeout(resolve, 1000)); // UI delay
            
            // 2. Sign and broadcast through Nexoid
            updateStepStatus('sign', 'completed', 'Transaction prepared');
            updateStepStatus('broadcast', 'processing', 'Signing and executing Nexoid transaction');

            const txHash = await nexoidService.sendUSDTTransfer(targetAddress, amount);
            setTxHash(txHash);
            updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${txHash.slice(0, 10)}...`);
            updateStepStatus('confirm', 'processing');

            // 3. Confirm
            await nexoidService.waitForTransaction(txHash, 1);
            updateStepStatus('confirm', 'completed', 'Transaction confirmed on Ethereum Sepolia');
          } else {
            console.log('Nexoid not configured, using WDK directly');
            
            // Fallback to WDK if Safe is not configured
            // 1. Sign (simulated as part of the call)
            await new Promise(resolve => setTimeout(resolve, 1500)); // UI delay for feel
            updateStepStatus('sign', 'completed', 'Transaction signed successfully');
            updateStepStatus('broadcast', 'processing');

            // 2. Broadcast
            const tx = await wdkService.sendUSDTTransfer('ethereum', targetAddress, amount);
            setTxHash(tx.hash);
            updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${tx.hash.slice(0, 10)}...`);
            updateStepStatus('confirm', 'processing');

            // 3. Confirm
            await wdkService.waitForTransaction('ethereum', tx.hash, 1);
            updateStepStatus('confirm', 'completed', 'Transaction confirmed on Ethereum Sepolia');
          }
        } else {
          console.warn('Real transfers from robot units are not yet implemented in this demo');
          // Mock robot transfer progress
          await new Promise(resolve => setTimeout(resolve, 1000));
          updateStepStatus('sign', 'completed');
          updateStepStatus('broadcast', 'processing');
          await new Promise(resolve => setTimeout(resolve, 1000));
          updateStepStatus('broadcast', 'completed');
          updateStepStatus('confirm', 'processing');
          await new Promise(resolve => setTimeout(resolve, 1000));
          updateStepStatus('confirm', 'completed');
        }
      }
      
      // Update local UI state
      setWallets(prev => prev.map(w => {
        if (targetId && w.id === targetId) {
          return { ...w, balance: w.balance + amount };
        }
        if (w.id === sourceId) {
          return { ...w, balance: w.balance - amount };
        }
        return w;
      }));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Refresh real balances from chain
      fetchWallets();
      
    } catch (err: any) {
      console.error('Transfer failed:', err);
      // Update current active step to error
      setProgressSteps(prev => prev.map(step => 
        step.status === 'processing' ? { ...step, status: 'error', description: err.message || 'Unknown error occurred' } : step
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    await Promise.all([
      fetchWallets(),
      fetchTransactions(true)
    ]);
    
    // Trigger refresh by updating the key, which will cause MainWalletCard to remount and fetch fresh data
    setRefreshKey(prev => prev + 1);
    
    setRefreshing(false);
  };

  const mainWalletZIndexStyle = useAnimatedStyle(() => ({
    zIndex: isDraggingMainWalletShared.value ? 100 : 0,
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#0F172A"
            title="Refreshing balances..."
            titleColor="#64748B"
          />
        }
      >
        
        <WalletHeader />
        
        <Animated.View ref={mainWalletRef} onLayout={handleMainWalletLayout} style={mainWalletZIndexStyle}>
          <MainWalletCard 
            key={refreshKey}
            wallet={mainWallet} 
            onPress={() => router.push(`/wallet/${mainWallet.id}`)}
            hoveredWalletId={hoveredWalletId}
            onDrop={handleDrop}
            onSend={() => {
              console.log('MainWalletCard onSend triggered in HomeScreen');
              // Default to main wallet -> first robot wallet (if any) or null
              const firstRobot = robotWallets.length > 0 ? robotWallets[0].id : null;
              console.log('Pre-selecting transfer state:', { sourceId: MAIN_WALLET_ID, targetId: firstRobot });
              setTransferState({ sourceId: MAIN_WALLET_ID, targetId: firstRobot });
              setTransferModalVisible(true);
            }}
            onDragUpdateJS={handleDragUpdate}
            scrollOffsetX={scrollOffsetX}
            robotLayouts={robotLayouts}
            robotsContainerLayout={robotsContainerLayout}
            isDraggingShared={isDraggingMainWalletShared}
          />
        </Animated.View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Humanoids</Text>
        </View>

        <ScrollView 
          ref={scrollRef}
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.robotsList}
          style={{ overflow: 'visible' }} 
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(w, h) => {
            contentWidth.current = w;
          }}
          onLayout={(e) => {
             e.target.measure((x, y, width, height, pageX, pageY) => {
               scrollLayout.current = { x: pageX, width };
               robotsContainerLayout.value = { x: pageX, y: pageY, width, height };
             });
          }}
        >
          {robotWallets.map((wallet) => (
            <RobotWalletItem 
              key={wallet.id} 
              wallet={wallet} 
              onDrop={handleDrop}
              onPress={() => router.push(`/wallet/${wallet.id}`)}
              onDragUpdateJS={handleDragUpdate}
              onRegisterLayout={handleRegisterLayout}
              scrollOffsetX={scrollOffsetX}
              dropZoneShared={dropZoneShared}
              hoveredWalletId={hoveredWalletId}
              robotLayouts={robotLayouts}
              robotsContainerLayout={robotsContainerLayout}
              unreadCount={getUnreadCountForRobot(wallet.id)}
            />
          ))}
        </ScrollView>

        <TransactionList transactions={transactions} isLoading={transactionsLoading} />

      </ScrollView>

      <TransferModal
        visible={transferModalVisible}
        onClose={() => setTransferModalVisible(false)}
        sourceWallet={wallets.find(w => w.id === transferState.sourceId) || null}
        targetWallet={wallets.find(w => w.id === transferState.targetId) || null}
        allWallets={wallets}
        onSourceChange={(id) => setTransferState(prev => ({ ...prev, sourceId: id }))}
        onTargetChange={(id) => setTransferState(prev => ({ ...prev, targetId: id }))}
        onConfirm={handleConfirmTransfer}
      />

      <TransactionProgressModal
        visible={progressModalVisible}
        onClose={() => setProgressModalVisible(false)}
        steps={progressSteps}
        txHash={txHash}
        onViewOnExplorer={(hash) => Linking.openURL(`https://sepolia.etherscan.io/tx/${hash}`)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Slate 50
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  robotsList: {
    paddingHorizontal: 20,
    paddingBottom: 20, 
    paddingTop: 10,
    overflow: 'visible',
  },
});
