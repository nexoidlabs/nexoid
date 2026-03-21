import { DelegationCard } from '@/components/identity/DelegationCard';
import { DelegateCredentialModal } from '@/components/modals/DelegateCredentialModal';
import { TransactionProgressModal, TransactionStep } from '@/components/modals/TransactionProgressModal';
import { Wallet } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';
import { nexoidService } from '@/services/NexoidService';
import { IdentityRecord, formatDid, isActive, statusName } from '@/types/nexoid';

import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { ArrowLeft, CreditCard, Fingerprint, Info, Share2, ShieldCheck, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';

interface LiveIdentity {
  id: string;
  did: string;
  title: string;
  issuer: string;
  registryName: string;
  validUntil: string;
  verified: boolean;
  accentColor: string;
  active: boolean;
  subject: string;
}

interface LiveDelegation {
  id: string;
  credentialId: string;
  delegatedToWalletId: string;
  purpose: string;
  delegatedAt: string;
  expiresAt: string;
}

export default function CredentialDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const safeAddress = id as string;
  
  const [identity, setIdentity] = useState<LiveIdentity | null>(null);
  const [delegations, setDelegations] = useState<LiveDelegation[]>([]);
  const [managedWallets, setManagedWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [delegateModalVisible, setDelegateModalVisible] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [progressSteps, setProgressSteps] = useState<TransactionStep[]>([]);

  // Track if data has been loaded
  const hasLoadedRef = React.useRef(false);

  useEffect(() => {
    if (identity) hasLoadedRef.current = true;
  }, [identity]);

  const loadData = useCallback(async (showLoading = true) => {
    if (!safeAddress || !nexoidService.isIdentityReady()) return;

    try {
      if (showLoading) setIsLoading(true);

      // 1. Get identity from registry
      const registryInfo = await nexoidService.getIdentity(safeAddress);
      const active = registryInfo ? isActive(registryInfo.status) : false;
      const liveId: LiveIdentity = {
        id: safeAddress,
        did: formatDid(safeAddress),
        title: `Identity ${safeAddress.slice(0, 6)}`,
        issuer: 'Nexoid Issuer',
        registryName: 'Nexoid Global Registry',
        validUntil: 'Permanent',
        verified: active,
        accentColor: '#007AFF',
        active,
        subject: registryInfo?.owner ?? safeAddress
      };
      setIdentity(liveId);

      // 2. Get delegates
      const delegates = await nexoidService.getAllDelegates(safeAddress);
      const loadedDelegations: LiveDelegation[] = delegates.map(delegatee => ({
        id: `${safeAddress}-${delegatee}`,
        credentialId: safeAddress,
        delegatedToWalletId: delegatee,
        purpose: 'Managed access',
        delegatedAt: 'N/A',
        expiresAt: 'Session'
      }));
      setDelegations(loadedDelegations);

      // 3. Load managed units
      const managed = await ManagedUnitsService.getAll();
      const unitWallets: Wallet[] = managed.map(u => ({
        id: u.address,
        name: u.name,
        type: 'robot' as const,
        balance: 0,
        currency: 'USD',
        avatarUrl: u.avatarUrl || '🤖',
        address: u.address,
        tokens: [],
      }));
      setManagedWallets(unitWallets);

    } catch (e) {
      console.error('Error loading identity details:', e);
      Alert.alert('Error', 'Failed to load identity details from blockchain.');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [safeAddress]);

  useFocusEffect(
    useCallback(() => {
      const showLoading = !hasLoadedRef.current;
      loadData(showLoading);
    }, [loadData])
  );

  // Subscribe to NexoidService changes
  useEffect(() => {
    const unsubscribe = nexoidService.addChangeListener(() => {
       loadData(false);
    });
    return () => unsubscribe();
  }, [loadData]);

  const updateStepStatus = (id: string, status: TransactionStep['status'], description?: string) => {
    setProgressSteps(prev => prev.map(step => 
      step.id === id ? { ...step, status, ...(description ? { description } : {}) } : step
    ));
  };

  const handleConfirmDelegation = async (unitId: string, purpose: string, duration: string) => {
    setProgressSteps([
      { id: 'sign', label: 'Preparing Transaction', status: 'processing', description: 'Preparing delegation data' },
      { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Signing and sending to Ethereum Sepolia' },
      { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction' }
    ]);
    setTxHash(undefined);
    setDelegateModalVisible(false);
    setTimeout(() => setProgressModalVisible(true), 300);

    try {
      updateStepStatus('sign', 'completed', 'Delegation data prepared');
      updateStepStatus('broadcast', 'processing');

      const hash = await nexoidService.addDelegateAndSetAllowance(safeAddress, unitId, '100', 0);
      setTxHash(hash);
      updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${hash.slice(0, 10)}...`);
      updateStepStatus('confirm', 'processing');

      await nexoidService.waitForTransaction(hash, 1);
      updateStepStatus('confirm', 'completed', 'Delegation confirmed on Ethereum Sepolia');
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadData();
    } catch (e: any) {
      setProgressSteps(prev => prev.map(step => 
        step.status === 'processing' ? { ...step, status: 'error', description: e.message || 'Transaction failed' } : step
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRevokeDelegation = (delegatee: string) => {
    Alert.alert(
      "Revoke Delegation",
      "Are you sure you want to revoke this delegation? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            setProgressSteps([
              { id: 'sign', label: 'Preparing Transaction', status: 'processing', description: 'Preparing revocation data' },
              { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Signing and sending to Ethereum Sepolia' },
              { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction' }
            ]);
            setTxHash(undefined);
            setProgressModalVisible(true);

            try {
              updateStepStatus('sign', 'completed', 'Revocation data prepared');
              updateStepStatus('broadcast', 'processing');

              const hash = await nexoidService.removeDelegate(safeAddress, delegatee);
              setTxHash(hash);
              updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${hash.slice(0, 10)}...`);
              updateStepStatus('confirm', 'processing');

              await nexoidService.waitForTransaction(hash, 1);
              updateStepStatus('confirm', 'completed', 'Revocation confirmed on Ethereum Sepolia');
              
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadData();
            } catch (e: any) {
              setProgressSteps(prev => prev.map(step => 
                step.status === 'processing' ? { ...step, status: 'error', description: e.message || 'Transaction failed' } : step
              ));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          }
        }
      ]
    );
  };

  const handleDeleteIdentity = () => {
    Alert.alert(
      "Delete Identity",
      "Remove this identity from your Safe? This won't revoke it in the global registry.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setProgressSteps([
              { id: 'sign', label: 'Preparing Transaction', status: 'processing', description: 'Preparing deletion data' },
              { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Signing and sending to Ethereum Sepolia' },
              { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction' }
            ]);
            setTxHash(undefined);
            setProgressModalVisible(true);

            try {
              updateStepStatus('sign', 'completed', 'Deletion data prepared');
              updateStepStatus('broadcast', 'processing');

              const hash = await nexoidService.revokeAgent(safeAddress);
              setTxHash(hash);
              updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${hash.slice(0, 10)}...`);
              updateStepStatus('confirm', 'processing');

              await nexoidService.waitForTransaction(hash, 1);
              updateStepStatus('confirm', 'completed', 'Deletion confirmed on Ethereum Sepolia');
              
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setTimeout(() => router.back(), 1500);
            } catch (e: any) {
              setProgressSteps(prev => prev.map(step => 
                step.status === 'processing' ? { ...step, status: 'error', description: e.message || 'Transaction failed' } : step
              ));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Fetching identity data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!identity) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#1A1A1A" />
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <Text>Identity not found or Safe not configured.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#1A1A1A" />
        </Pressable>
        <Text style={styles.headerTitle}>Identity Details</Text>
        <Pressable onPress={handleDeleteIdentity} style={styles.deleteHeaderButton}>
          <Trash2 size={20} color="#FF3B30" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Visual Card */}
        <View style={[styles.visualCard, { backgroundColor: identity.accentColor }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Fingerprint size={24} color={identity.accentColor} />
            </View>
            {identity.verified && (
              <View style={styles.verifiedBadge}>
                <ShieldCheck size={14} color="#fff" />
                <Text style={styles.verifiedText}>Active</Text>
              </View>
            )}
          </View>
          
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{identity.title}</Text>
            <Text style={styles.cardIssuer}>{identity.registryName}</Text>
          </View>
          
          <View style={styles.cardFooter}>
             <View style={{ flex: 1 }}>
               <Text style={styles.cardLabel}>DID</Text>
               <Text style={styles.cardValue} numberOfLines={1}>{identity.did}</Text>
             </View>
          </View>
          
          <View style={styles.circle1} />
          <View style={styles.circle2} />
        </View>

        {/* Action Button */}
        <View style={styles.actionContainer}>
          <Pressable style={styles.delegateButton} onPress={() => setDelegateModalVisible(true)}>
            <Share2 size={20} color="#fff" />
            <Text style={styles.delegateButtonText}>Delegate to Unit</Text>
          </Pressable>
        </View>

        {/* Delegations Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {delegations.length > 0 ? `${delegations.length} Active Delegation(s)` : 'No Active Delegations'}
          </Text>
          
          {delegations.length > 0 ? (
            delegations.map(delegation => {
              const targetWallet = managedWallets.find(w => w.id === delegation.delegatedToWalletId);
              return (
                <View key={delegation.id} style={styles.delegationWrapper}>
                  <Swipeable
                    renderRightActions={(progress, dragX) => (
                      <RightActions 
                        dragX={dragX} 
                        onDelete={() => handleRevokeDelegation(delegation.delegatedToWalletId)} 
                      />
                    )}
                    rightThreshold={40}
                    containerStyle={styles.swipeableContainer}
                  >
                    <DelegationCard 
                      delegation={delegation as any} 
                      credential={identity as any} 
                      targetWallet={targetWallet}
                      style={styles.delegationCardOverride}
                    />
                  </Swipeable>
                </View>
              );
            })
          ) : (
             <View style={styles.emptyState}>
               <Info size={24} color="#ccc" />
               <Text style={styles.emptyStateText}>This identity is not currently delegated to any unit.</Text>
             </View>
          )}
        </View>
        
        {/* Metadata Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blockchain Data</Text>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Subject Address</Text>
            <Text style={styles.metadataValue}>{identity.subject.slice(0, 10)}...{identity.subject.slice(-8)}</Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Safe Address</Text>
            <Text style={styles.metadataValue}>{identity.id.slice(0, 10)}...{identity.id.slice(-8)}</Text>
          </View>
           <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Status</Text>
            <Text style={identity.active ? styles.metadataValueGreen : styles.metadataValue}>{identity.active ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>

      </ScrollView>

      <DelegateCredentialModal
        visible={delegateModalVisible}
        onClose={() => setDelegateModalVisible(false)}
        credential={identity}
        wallets={managedWallets}
        onConfirm={handleConfirmDelegation}
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

function RightActions({ dragX, onDelete }: { dragX: Animated.AnimatedInterpolation<number>, onDelete: () => void }) {
  const [hasTriggered, setHasTriggered] = React.useState(false);

  React.useEffect(() => {
    const id = dragX.addListener(({ value }) => {
      if (value < -180 && !hasTriggered) {
        setHasTriggered(true);
        onDelete();
      }
    });
    return () => dragX.removeListener(id);
  }, [hasTriggered, onDelete, dragX]);

  const scale = dragX.interpolate({
    inputRange: [-100, 0],
    outputRange: [1, 0.5],
    extrapolate: 'clamp',
  });

  const opacity = dragX.interpolate({
    inputRange: [-100, -20, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  return (
    <Pressable 
      style={styles.deleteButtonContainer} 
      onPress={onDelete}
    >
      <Animated.View style={styles.deleteButtonContent}>
        <Animated.View style={{ transform: [{ scale }], opacity }}>
          <Trash2 size={24} color="#fff" />
        </Animated.View>
        <Animated.Text style={[styles.deleteText, { opacity }]}>Revoke</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  deleteHeaderButton: {
    padding: 8,
    marginRight: -8,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  visualCard: {
    margin: 20,
    borderRadius: 24,
    padding: 24,
    height: 220,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  verifiedText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  cardBody: {
    zIndex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardIssuer: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 20,
    zIndex: 1,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  cardValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'SpaceMono',
  },
  circle1: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  circle2: {
    position: 'absolute',
    bottom: -80,
    left: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  actionContainer: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  delegateButton: {
    backgroundColor: '#00C896',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  delegateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    gap: 12,
  },
  emptyStateText: {
    color: '#888',
    textAlign: 'center',
    fontSize: 14,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  metadataLabel: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  metadataValue: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: 'SpaceMono',
  },
  metadataValueGreen: {
    color: '#00C896',
    fontWeight: '700',
    fontSize: 14,
  },
  delegationWrapper: {
    marginBottom: 12,
  },
  swipeableContainer: {
    backgroundColor: '#FF3B30',
    borderRadius: 16,
  },
  delegationCardOverride: {
    marginBottom: 0,
    backgroundColor: '#F9F9F9', 
  },
  deleteButtonContainer: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  deleteButtonContent: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    width: 80,
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
