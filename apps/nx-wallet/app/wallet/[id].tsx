import { INITIAL_WALLETS, MAIN_WALLET_ID, Transaction, Wallet } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';
import { transactionService } from '@/services/TransactionService';
import { SecureStorage } from '@/services/SecureStorage';
import { wdkService } from '@/services/WDKService';
import { TransactionList } from '@/components/home/TransactionList';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const findAndSetWallet = async () => {
    // 1. Check if it's the Main Wallet
    if (id === MAIN_WALLET_ID) {
      const mainWallet = INITIAL_WALLETS.find((w) => w.id === id);
      if (mainWallet) {
        setWallet(mainWallet);
        return;
      }
    }

    // 2. Check ManagedUnits
    const managedUnits = await ManagedUnitsService.getAll();
    const unit = managedUnits.find(u => u.address === id);
    if (unit) {
      setWallet({
        id: unit.address,
        name: unit.name,
        type: 'robot',
        balance: 0, // Will be updated by fetchBalance
        currency: 'USD',
        avatarUrl: unit.avatarUrl || '🤖',
        address: unit.address,
        tokens: [],
      });
    }
  };

  const fetchBalance = async () => {
    if (!wallet) return;

    try {
      setError(null);
      let usdtBalance: string;
      
      if (wallet.type === 'main' && wallet.id === MAIN_WALLET_ID) {
        usdtBalance = await wdkService.getUSDTBalanceForAddressFormatted('ethereum', wallet.address || '');
      } else if (wallet.address) {
        // Fetch real balance for managed unit
        usdtBalance = await wdkService.getUSDTBalanceForAddressFormatted('ethereum', wallet.address);
      } else {
        // Fallback for robots without address in INITIAL_WALLETS
        usdtBalance = wallet.balance.toFixed(2);
      }
      
      setBalance(usdtBalance);
    } catch (err) {
      console.error('Error fetching USDT balance:', err);
      setError('Failed to load balance');
      // Fallback to mock data if available
      setBalance(wallet.balance.toFixed(2));
    }
  };

  const filterTransactions = (items: Transaction[]) =>
    items.filter(tx =>
      (tx.tokenSymbol || '').toUpperCase() === 'USDT' && Math.abs(tx.amount) >= 0.001
    );

  const fetchTransactions = async (force = false) => {
    if (!wallet?.address) return;
    setTransactionsLoading(true);
    try {
      let addressForTx = wallet.address;
      if (wallet.id === MAIN_WALLET_ID) {
        const safeAddress = await SecureStorage.getSafeAddress();
        if (safeAddress) {
          addressForTx = safeAddress;
        }
      }

      if (!force) {
        const cached = await transactionService.getCachedTransactions(addressForTx);
        if (cached && cached.length > 0) {
          setTransactions(filterTransactions(cached));
        }
      }

      const history = await transactionService.getTransactionHistory(addressForTx, force, wallet.id);
      setTransactions(filterTransactions(history));
    } catch (error) {
      console.warn('Failed to load transactions:', error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await findAndSetWallet();
    };
    init();
  }, [id]);

  useEffect(() => {
    if (wallet) {
      Promise.all([fetchBalance(), fetchTransactions()]).finally(() => setIsLoading(false));
    }
  }, [wallet?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([fetchBalance(), fetchTransactions(true)]);
    setRefreshing(false);
  };

  if (!wallet) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.text}>Wallet not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#0F172A"
            title="Refreshing..."
            titleColor="#64748B"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft color="#1A1A1A" size={20} />
          </Pressable>
          <View style={styles.headerTitle}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{wallet.avatarUrl || '🤖'}</Text>
            </View>
            <View>
              <Text style={styles.title}>{wallet.name}</Text>
              <Text style={styles.subtitle}>Robot Wallet</Text>
            </View>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {/* Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          {isLoading ? (
            <ActivityIndicator size="large" color="#0F172A" style={{ marginVertical: 10 }} />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <View style={styles.balanceRow}>
              <Text style={styles.balance}>{balance}</Text>
              <View style={styles.tokenPill}>
                <Text style={styles.tokenText}>USDT</Text>
              </View>
            </View>
          )}
        </View>

        {/* Recent Activity */}
        <TransactionList
          transactions={transactions}
          isLoading={transactionsLoading}
          emptyMessage="No activity yet"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  balanceCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  balanceLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  balance: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0F172A',
  },
  tokenPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  tokenText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  text: {
    fontSize: 16,
    color: '#0F172A',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  }
});

