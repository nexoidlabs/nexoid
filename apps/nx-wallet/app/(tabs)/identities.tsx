import { CredentialCard } from '@/components/identity/CredentialCard';
import { DelegationCard } from '@/components/identity/DelegationCard';
import { FilterChips } from '@/components/identity/FilterChips';
import { DelegateCredentialModal } from '@/components/modals/DelegateCredentialModal';
import { TransactionProgressModal, TransactionStep } from '@/components/modals/TransactionProgressModal';
import { CredentialCategory, INITIAL_WALLETS, Wallet } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';
import { nexoidService } from '@/services/NexoidService';
import { NEXOID_MODULE_ADDRESS, IDENTITY_REGISTRY_ADDRESS } from '@/services/ContractABIs';
import { SecureStorage } from '@/services/SecureStorage';
import { AgentRecord, entityTypeName, statusName, isActive, formatDid } from '@/types/nexoid';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Plus, QrCode, RefreshCw, Shield, ShieldCheck, Trash, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';

// Type definitions for live data — based on AgentRecord
interface LiveIdentity {
  id: string; // agentSafe address
  did: string;
  title: string;
  description?: string;
  issuer: string;
  registryName: string;
  validUntil: string;
  verified: boolean;
  category: CredentialCategory;
  accentColor: string;
  active: boolean;
  subject: string;
  agentRecord: AgentRecord;
}

interface LiveDelegation {
  id: string;
  credentialId: string; // agentSafe address
  delegatedToWalletId: string;
  purpose: string;
  delegatedAt: string;
  expiresAt: string;
}

export default function IdentitiesScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<CredentialCategory | 'all'>('all');
  const [identities, setIdentities] = useState<LiveIdentity[]>([]);
  const [delegations, setDelegations] = useState<LiveDelegation[]>([]);
  const [managedWallets, setManagedWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal state
  const [delegateModalVisible, setDelegateModalVisible] = useState(false);
  const [eidasModalVisible, setEidasModalVisible] = useState(false);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | null>(null);

  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [progressSteps, setProgressSteps] = useState<TransactionStep[]>([
    { id: 'sign', label: 'Signing Transaction', status: 'pending', description: 'Authorize identity action' },
    { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Sending transaction to Ethereum Sepolia network' },
    { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction on blockchain' }
  ]);

  // Track if data has been loaded to avoid stale closures in useFocusEffect
  const hasLoadedRef = React.useRef(false);

  React.useEffect(() => {
      if (identities.length > 0) hasLoadedRef.current = true;
  }, [identities]);

  const updateStepStatus = (id: string, status: TransactionStep['status'], description?: string) => {
    setProgressSteps(prev => prev.map(step =>
      step.id === id ? { ...step, status, ...(description ? { description } : {}) } : step
    ));
  };

  useFocusEffect(
    useCallback(() => {
      // Check ref to decide if we need a loading spinner
      const shouldShowLoading = !hasLoadedRef.current;
      loadAllData(false, shouldShowLoading);
    }, [])
  );

  // Subscribe to NexoidService changes
  React.useEffect(() => {
    const unsubscribe = nexoidService.addChangeListener(() => {
       // Refresh when NexoidService updates (e.g. init complete)
       // Don't force full loading state here to avoid jarring UI updates
       loadAllData(false, false);
    });
    return () => unsubscribe();
  }, []); // Empty dependencies to avoid re-subscribing loop

  const loadAllData = async (showRefresh = false, showLoading = true) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else if (showLoading) setIsLoading(true);

      // 1. Load managed units (wallets)
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

      // 2. Ensure NexoidService is configured
      if (!nexoidService.getSafeAddress() || !nexoidService.isIdentityReady()) {
        try {
          const [safeAddr, moduleAddr, registryAddr] = await Promise.all([
            SecureStorage.getSafeAddress(),
            SecureStorage.getNexoidModuleAddress(),
            SecureStorage.getIdentityRegistryAddress()
          ]);

          if (safeAddr) {
            const currentSafe = nexoidService.getSafeAddress();
            if (currentSafe !== safeAddr) {
              nexoidService.configure(
                safeAddr,
                moduleAddr || NEXOID_MODULE_ADDRESS,
                registryAddr || IDENTITY_REGISTRY_ADDRESS
              );
            }
          }
        } catch (e) {
          console.warn('Failed to configure NexoidService from storage:', e);
        }
      }

      // 3. Load agent records from NexoidModule
      try {
        const agentRecords = await nexoidService.getAgentSafes();

        // Fetch delegates in parallel for each agent
        const identityPromises = agentRecords.map(async (agent) => {
          try {
            const validUntilStr = agent.validUntil === 0
              ? 'Permanent'
              : new Date(agent.validUntil * 1000).toLocaleDateString();

            const liveId: LiveIdentity = {
              id: agent.agentSafe,
              did: formatDid(agent.agentSafe),
              title: `Agent ${agent.agentSafe.slice(0, 8)}...`,
              description: `${statusName(agent.status)} | EOA: ${agent.agentEOA.slice(0, 10)}...`,
              issuer: 'Nexoid Module',
              registryName: 'Nexoid Agent Registry',
              validUntil: validUntilStr,
              verified: isActive(agent.status),
              category: 'id',
              accentColor: isActive(agent.status) ? '#00C896' : '#FF3B30',
              active: isActive(agent.status),
              subject: agent.agentEOA,
              agentRecord: agent,
            };

            // Get delegates for this agent's Safe
            let liveDelegations: LiveDelegation[] = [];
            try {
              const delegates = await nexoidService.getAllDelegates(agent.agentSafe);
              liveDelegations = delegates.map(delegatee => ({
                id: `${agent.agentSafe}-${delegatee}`,
                credentialId: agent.agentSafe,
                delegatedToWalletId: delegatee,
                purpose: 'USDT Allowance',
                delegatedAt: new Date(agent.createdAt * 1000).toLocaleDateString(),
                expiresAt: validUntilStr,
              }));
            } catch (e) {
              console.warn(`Could not load delegates for ${agent.agentSafe}:`, e);
            }

            return { identity: liveId, delegations: liveDelegations };
          } catch (e) {
            console.error(`Error loading details for agent ${agent.agentSafe}:`, e);
            return null;
          }
        });

        const results = await Promise.all(identityPromises);

        const loadedIdentities: LiveIdentity[] = [];
        const loadedDelegations: LiveDelegation[] = [];

        results.forEach(result => {
            if (result) {
                loadedIdentities.push(result.identity);
                loadedDelegations.push(...result.delegations);
            }
        });

        setIdentities(loadedIdentities);
        setDelegations(loadedDelegations);
      } catch (err) {
        console.log('Could not load agents (Safe not ready or empty):', err);
      }
    } catch (err) {
      console.error('Failed to load identity data:', err);
      // Don't alert if it's just a background refresh that failed due to network
      if (!showRefresh && showLoading) {
        Alert.alert('Error', 'Failed to load identity data from blockchain.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const activeDelegations = delegations;

  const filteredCredentials = identities.filter(c =>
    selectedCategory === 'all' || c.category === selectedCategory
  );

  const counts = {
    all: identities.length,
    id: identities.filter(c => c.category === 'id').length,
    health: identities.filter(c => c.category === 'health').length,
    document: identities.filter(c => c.category === 'document').length,
  };

  const handleDelegate = (credentialId: string) => {
    setSelectedCredentialId(credentialId);
    setDelegateModalVisible(true);
  };

  const handleConfirmDelegation = async (unitId: string, purpose: string, duration: string) => {
    if (!selectedCredentialId) return;

    // Reset and show progress modal
    setProgressSteps([
      { id: 'sign', label: 'Preparing Transaction', status: 'processing', description: 'Preparing delegation data' },
      { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Signing and sending to Ethereum Sepolia' },
      { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction' }
    ]);
    setTxHash(undefined);
    setDelegateModalVisible(false);

    // UI delay to allow closing the first modal
    setTimeout(() => setProgressModalVisible(true), 300);

    try {
      updateStepStatus('sign', 'completed', 'Delegation data prepared');
      updateStepStatus('broadcast', 'processing');

      // Add delegate with default USDT allowance (100 USDT, no reset)
      const hash = await nexoidService.addDelegateAndSetAllowance(selectedCredentialId, unitId, '100', 0);
      setTxHash(hash);
      updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${hash.slice(0, 10)}...`);
      updateStepStatus('confirm', 'processing');

      await nexoidService.waitForTransaction(hash, 1);
      updateStepStatus('confirm', 'completed', 'Delegation confirmed on Ethereum Sepolia');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadAllData(true);
    } catch (e: any) {
      console.error('Delegation failed:', e);
      setProgressSteps(prev => prev.map(step =>
        step.status === 'processing' ? { ...step, status: 'error', description: e.message || 'Transaction failed' } : step
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSelectedCredentialId(null);
    }
  };

  const handleDeleteDelegation = (id: string, credentialId: string, delegatee: string) => {
    Alert.alert(
      "Revoke Delegation",
      "Are you sure you want to revoke this delegation? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            // Reset and show progress modal
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

              const hash = await nexoidService.removeDelegate(credentialId, delegatee);
              setTxHash(hash);
              updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${hash.slice(0, 10)}...`);
              updateStepStatus('confirm', 'processing');

              await nexoidService.waitForTransaction(hash, 1);
              updateStepStatus('confirm', 'completed', 'Revocation confirmed on Ethereum Sepolia');

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadAllData(true);
            } catch (e: any) {
              console.error('Revocation failed:', e);
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

  const handleAddIdentity = () => {
    Alert.prompt(
      "Register Agent",
      "Enter the Agent EOA address to register a new agent Safe",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Register",
          onPress: async (text?: string) => {
            if (!text) return;

            // Reset and show progress modal
            setProgressSteps([
              { id: 'sign', label: 'Preparing Transaction', status: 'processing', description: 'Preparing registration data' },
              { id: 'broadcast', label: 'Broadcasting to Network', status: 'pending', description: 'Signing and sending to Ethereum Sepolia' },
              { id: 'confirm', label: 'Waiting for Confirmation', status: 'pending', description: 'Securing transaction' }
            ]);
            setTxHash(undefined);
            setProgressModalVisible(true);

            try {
              const agentEOA = text.trim();
              // Use the EOA as the agent Safe address for simplicity in hackathon demo
              // In production, a Safe would be deployed first
              const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
              updateStepStatus('sign', 'completed', `Registration prepared for ${agentEOA.slice(0, 10)}...`);
              updateStepStatus('broadcast', 'processing');

              const hash = await nexoidService.registerAgentSafe(agentEOA, agentEOA, zeroHash, zeroHash, 0);
              setTxHash(hash);
              updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${hash.slice(0, 10)}...`);
              updateStepStatus('confirm', 'processing');

              await nexoidService.waitForTransaction(hash, 1);
              updateStepStatus('confirm', 'completed', 'Registration confirmed on Ethereum Sepolia');

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadAllData(true);
            } catch (e: any) {
              console.error('Registration failed:', e);
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

  const handleDeleteIdentity = (agentSafe: string) => {
    Alert.alert(
      "Revoke Agent",
      "Revoke this agent? This will permanently disable it on-chain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            // Reset and show progress modal
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

              const hash = await nexoidService.revokeAgent(agentSafe);
              setTxHash(hash);
              updateStepStatus('broadcast', 'completed', `Transaction broadcasted: ${hash.slice(0, 10)}...`);
              updateStepStatus('confirm', 'processing');

              await nexoidService.waitForTransaction(hash, 1);
              updateStepStatus('confirm', 'completed', 'Agent revoked on Ethereum Sepolia');

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadAllData(true);
            } catch (e: any) {
              console.error('Revocation failed:', e);
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

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, delegation: LiveDelegation) => {
    return (
        <RightActions
          dragX={dragX}
          onDelete={() => handleDeleteDelegation(delegation.id, delegation.credentialId, delegation.delegatedToWalletId)}
        />
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading agents...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Agent Wallets</Text>
            <Text style={styles.headerSubtitle}>{identities.length} registered agents</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.refreshButton} onPress={() => loadAllData(true)}>
              <RefreshCw size={20} color="#666" />
            </Pressable>
            <Pressable style={styles.addButton} onPress={handleAddIdentity}>
              <Plus size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        {!nexoidService.getSafeAddress() ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>Safe wallet not configured. Please visit Settings.</Text>
          </View>
        ) : !nexoidService.isReady() ? (
          <View style={[styles.errorBanner, { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' }]}>
             <Text style={[styles.errorText, { color: '#C2410C' }]}>
                {identities.length > 0 ? 'Offline Mode - Using cached data' : 'Connecting to network...'}
             </Text>
           </View>
        ) : !nexoidService.isIdentityReady() ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>Identity Module/Registry not configured. Please visit Settings.</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Pressable style={styles.actionCard} onPress={handleAddIdentity}>
            <View style={[styles.iconCircle, { backgroundColor: '#E0F7EF' }]}>
              <QrCode size={24} color="#00C896" />
            </View>
            <Text style={styles.actionText}>Register Agent</Text>
          </Pressable>

          <Pressable style={styles.actionCard}>
            <View style={[styles.iconCircle, { backgroundColor: '#E0F2FE' }]}>
              <Shield size={24} color="#007AFF" />
            </View>
            <Text style={styles.actionText}>Verify Agent</Text>
          </Pressable>
        </View>

        {/* Active Delegations */}
        {activeDelegations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.statusDot} />
              <Text style={styles.sectionTitle}>Active Delegations</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{activeDelegations.length}</Text>
              </View>
            </View>

            {activeDelegations.map(delegation => {
              const cred = identities.find(c => c.id === delegation.credentialId);
              if (!cred) return null;
              const targetWallet = [...INITIAL_WALLETS, ...managedWallets].find(w => w.id === delegation.delegatedToWalletId);

              return (
                <View key={delegation.id} style={styles.delegationWrapper}>
                  <Swipeable
                    renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, delegation)}
                    rightThreshold={40}
                    containerStyle={styles.swipeableContainer}
                  >
                    <DelegationCard
                      delegation={delegation as any}
                      credential={cred as any}
                      targetWallet={targetWallet}
                      style={styles.delegationCardOverride}
                    />
                  </Swipeable>
                </View>
              );
            })}
          </View>
        )}

        {/* Filters */}
        <View style={styles.filtersWrapper}>
          <FilterChips
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            counts={counts}
          />
        </View>

        {/* Credential List */}
        <View style={styles.credentialList}>
          {filteredCredentials.map(cred => (
            <CredentialCard
              key={cred.id}
              credential={cred as any}
              onPress={() => router.push(`/credential/${cred.id}`)}
              onDelegate={() => handleDelegate(cred.id)}
              onDelete={() => handleDeleteIdentity(cred.id)}
            />
          ))}
          {filteredCredentials.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No agents registered.</Text>
            </View>
          )}
        </View>

        {/* Trust Banner (Moved to bottom) */}
        <Pressable style={styles.banner} onPress={() => setEidasModalVisible(true)}>
          <View style={styles.bannerIcon}>
            <ShieldCheck size={24} color="#007AFF" />
          </View>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>eIDAS-compliant & secure</Text>
            <Text style={styles.bannerSubtitle}>Your credentials are encrypted and blockchain-verified. Tap for more info.</Text>
          </View>
        </Pressable>

      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={eidasModalVisible}
        onRequestClose={() => setEidasModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About eIDAS</Text>
              <Pressable onPress={() => setEidasModalVisible(false)} style={styles.closeButton}>
                <X size={24} color="#666" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.modalIconContainer}>
                <ShieldCheck size={48} color="#007AFF" />
              </View>
              <Text style={styles.modalText}>
                The Regulation (EU) No 910/2014 on electronic identification and trust services for electronic transactions in the internal market (eIDAS Regulation) is a milestone regulation in the EU.
              </Text>
              <Text style={styles.modalText}>
                It provides a predictable regulatory environment to enable secure and seamless electronic interactions between businesses, citizens and public authorities.
              </Text>
              <Text style={styles.modalSubtitle}>Key Benefits:</Text>
              <View style={styles.benefitRow}>
                <View style={styles.bullet} />
                <Text style={styles.benefitText}>Ensures that people and businesses can use their own national electronic identification schemes (eIDs) to access public services in other EU countries where eIDs are available.</Text>
              </View>
              <View style={styles.benefitRow}>
                <View style={styles.bullet} />
                <Text style={styles.benefitText}>Creates an internal European market for eTrust Services - namely electronic signatures, electronic seals, time stamp, electronic delivery service and website authentication - by ensuring that they will work across borders and have the same legal status as traditional paper based processes.</Text>
              </View>
            </ScrollView>
            <Pressable style={styles.modalButton} onPress={() => setEidasModalVisible(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <DelegateCredentialModal
        visible={delegateModalVisible}
        onClose={() => setDelegateModalVisible(false)}
        credential={identities.find(c => c.id === selectedCredentialId) || null}
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
          <Trash size={24} color="#fff" />
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
  scrollContent: {
    paddingBottom: 40,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    marginBottom: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  refreshOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#F0F9FF',
    marginBottom: 16,
  },
  refreshText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00C896',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  bannerIcon: {
    marginRight: 16,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00C896',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filtersWrapper: {
    marginBottom: 8,
  },
  credentialList: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    marginBottom: 24,
  },
  modalIconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalText: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 8,
    marginBottom: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#007AFF',
    marginTop: 9,
    marginRight: 12,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  delegationWrapper: {
    marginBottom: 12,
  },
  swipeableContainer: {
    backgroundColor: 'red',
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
