import { Text, View } from '@/components/Themed';
import { nexoidService } from '@/services/NexoidService';
import { NEXOID_MODULE_ADDRESS, IDENTITY_REGISTRY_ADDRESS } from '@/services/ContractABIs';
import { transactionService } from '@/services/TransactionService';
import { messageStorageService } from '@/services/MessageStorageService';
import { SecureStorage } from '@/services/SecureStorage';
import { wdkService } from '@/services/WDKService';
import { ethers } from 'ethers';
import * as Clipboard from 'expo-clipboard';
import { AlertTriangle, CheckCircle, Copy, Edit, Eye, EyeOff, Save, Shield, Trash2, Wallet } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isReinitializing, setIsReinitializing] = useState(false);
  const [isClearingMessages, setIsClearingMessages] = useState(false);
  const [isClearingTransactions, setIsClearingTransactions] = useState(false);

  // Safe wallet state
  const [safeAddress, setSafeAddress] = useState('');
  const [isEditingSafe, setIsEditingSafe] = useState(false);
  const [isSafeConfigured, setIsSafeConfigured] = useState(false);
  const [isSavingSafe, setIsSavingSafe] = useState(false);

  // Identity module state
  const [moduleAddress, setModuleAddress] = useState('');
  const [isEditingModule, setIsEditingModule] = useState(false);
  const [isSavingModule, setIsSavingModule] = useState(false);

  // Identity registry state
  const [registryAddress, setRegistryAddress] = useState('');
  const [isEditingRegistry, setIsEditingRegistry] = useState(false);
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    const stored = await SecureStorage.getSeedPhrase();
    if (stored) {
      setSeedPhrase(stored);
    }

    const storedSafeAddress = await SecureStorage.getSafeAddress();
    if (storedSafeAddress) {
      setSafeAddress(storedSafeAddress);
      setIsSafeConfigured(true);
    }

    const storedModuleAddress = await SecureStorage.getNexoidModuleAddress();
    setModuleAddress(storedModuleAddress || NEXOID_MODULE_ADDRESS);

    const storedRegistryAddress = await SecureStorage.getIdentityRegistryAddress();
    setRegistryAddress(storedRegistryAddress || IDENTITY_REGISTRY_ADDRESS);
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(seedPhrase);
    Alert.alert('Copied', 'Seed phrase copied to clipboard');
  };

  const validateSeedPhrase = (phrase: string): boolean => {
    const trimmed = phrase.trim();
    const words = trimmed.split(/\s+/);
    return [12, 15, 18, 21, 24].includes(words.length) && words.every(w => w.length > 0);
  };

  const handleSave = async () => {
    const trimmedPhrase = seedPhrase.trim();

    if (!trimmedPhrase) {
      Alert.alert('Error', 'Seed phrase cannot be empty');
      return;
    }

    if (!validateSeedPhrase(trimmedPhrase)) {
      Alert.alert(
        'Invalid Seed Phrase',
        'Please enter a valid seed phrase with 12, 15, 18, 21, or 24 words.'
      );
      return;
    }

    Alert.alert(
        'Warning',
        'Changing the seed phrase will reset your wallet connection. Make sure this phrase is correct.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Confirm',
                style: 'destructive',
                onPress: async () => {
                    try {
                        setIsReinitializing(true);
                        await SecureStorage.saveSeedPhrase(trimmedPhrase);
                        await wdkService.initialize(trimmedPhrase, true);
                        setIsEditing(false);
                        Alert.alert(
                          'Success',
                          'Wallet has been reinitialized with the new seed phrase.'
                        );
                    } catch (error) {
                        console.error('Error reinitializing wallet:', error);
                        Alert.alert(
                          'Error',
                          'Failed to reinitialize wallet. Please check your seed phrase and try again.'
                        );
                    } finally {
                        setIsReinitializing(false);
                    }
                }
            }
        ]
    );
  };

  const handleSaveSafeAddress = async () => {
    const trimmedAddress = safeAddress.trim();

    if (!trimmedAddress) {
      Alert.alert('Error', 'Safe address cannot be empty');
      return;
    }

    if (!ethers.isAddress(trimmedAddress)) {
      Alert.alert('Invalid Address', 'Please enter a valid Ethereum address (0x...)');
      return;
    }

    try {
      setIsSavingSafe(true);
      await SecureStorage.saveSafeAddress(trimmedAddress);
      await nexoidService.initialize(trimmedAddress, moduleAddress, registryAddress);
      setIsEditingSafe(false);
      setIsSafeConfigured(true);
      Alert.alert('Success', 'Safe wallet address has been configured successfully.');
    } catch (error) {
      console.error('Error saving Safe address:', error);
      Alert.alert('Error', 'Failed to configure Safe wallet. Please check the address and try again.');
    } finally {
      setIsSavingSafe(false);
    }
  };

  const handleSaveModuleAddress = async () => {
    const trimmedAddress = moduleAddress.trim();
    if (!trimmedAddress) {
      Alert.alert('Error', 'Module address cannot be empty');
      return;
    }
    if (!ethers.isAddress(trimmedAddress)) {
      Alert.alert('Invalid Address', 'Please enter a valid Ethereum address');
      return;
    }
    try {
      setIsSavingModule(true);
      await SecureStorage.saveNexoidModuleAddress(trimmedAddress);
      if (isSafeConfigured) {
        await nexoidService.initialize(safeAddress, trimmedAddress, registryAddress);
      }
      setIsEditingModule(false);
      Alert.alert('Success', 'Identity module address saved');
    } catch (error) {
      console.error('Error saving module address:', error);
      Alert.alert('Error', 'Failed to save address');
    } finally {
      setIsSavingModule(false);
    }
  };

  const handleSaveRegistryAddress = async () => {
    const trimmedAddress = registryAddress.trim();
    if (!trimmedAddress) {
      Alert.alert('Error', 'Registry address cannot be empty');
      return;
    }
    if (!ethers.isAddress(trimmedAddress)) {
      Alert.alert('Invalid Address', 'Please enter a valid Ethereum address');
      return;
    }
    try {
      setIsSavingRegistry(true);
      await SecureStorage.saveIdentityRegistryAddress(trimmedAddress);
      if (isSafeConfigured) {
        await nexoidService.initialize(safeAddress, moduleAddress, trimmedAddress);
      }
      setIsEditingRegistry(false);
      Alert.alert('Success', 'Identity registry address saved');
    } catch (error) {
      console.error('Error saving registry address:', error);
      Alert.alert('Error', 'Failed to save address');
    } finally {
      setIsSavingRegistry(false);
    }
  };

  const handleCopySafeAddress = async () => {
    if (safeAddress) {
      await Clipboard.setStringAsync(safeAddress);
      Alert.alert('Copied', 'Safe address copied to clipboard');
    }
  };

  const handleClear = () => {
      Alert.alert(
          'Reset Wallet',
          'Are you sure you want to delete your wallet? You will lose access to your funds if you have not backed up your seed phrase.',
          [
              { text: 'Cancel', style: 'cancel' },
              {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                      try {
                          setIsReinitializing(true);
                          await SecureStorage.deleteSeedPhrase();
                          const newSeedPhrase = await wdkService.initialize(undefined, true);
                          await SecureStorage.saveSeedPhrase(newSeedPhrase);
                          setSeedPhrase(newSeedPhrase);
                          setIsVisible(false);
                          Alert.alert(
                            'Wallet Reset',
                            'A new wallet has been generated. Please back up your new seed phrase.'
                          );
                      } catch (error) {
                          console.error('Error resetting wallet:', error);
                          Alert.alert(
                            'Error',
                            'Failed to reset wallet. Please try again.'
                          );
                      } finally {
                          setIsReinitializing(false);
                      }
                  }
              }
          ]
      );
  };

  const handleClearMessages = () => {
      Alert.alert(
          'Clear Message History',
          'Are you sure you want to delete the entire message history? This includes all stored messages and conversations.',
          [
              { text: 'Cancel', style: 'cancel' },
              {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                      try {
                          setIsClearingMessages(true);
                          await messageStorageService.clearAllMessages();
                          Alert.alert('Success', 'Message history has been cleared.');
                      } catch (error) {
                          console.error('Error clearing messages:', error);
                          Alert.alert('Error', 'Failed to clear message history.');
                      } finally {
                          setIsClearingMessages(false);
                      }
                  }
              }
          ]
      );
  };

  const handleClearTransactions = () => {
      Alert.alert(
          'Clear Transaction History',
          'This will remove cached transaction history from this device. It does not affect on-chain data.',
          [
              { text: 'Cancel', style: 'cancel' },
              {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: async () => {
                      try {
                          setIsClearingTransactions(true);
                          await transactionService.clearAllCache();
                          Alert.alert('Success', 'Transaction history cache cleared.');
                      } catch (error) {
                          console.error('Error clearing transaction cache:', error);
                          Alert.alert('Error', 'Failed to clear transaction history.');
                      } finally {
                          setIsClearingTransactions(false);
                      }
                  }
              }
          ]
      );
  };

  const formatSafeAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  const renderAddressCard = (
    title: string,
    icon: React.ReactNode,
    description: string,
    address: string,
    setAddress: (v: string) => void,
    isEditingAddr: boolean,
    setIsEditingAddr: (v: boolean) => void,
    isSaving: boolean,
    onSave: () => void,
    onCopy?: () => void,
    statusBadge?: React.ReactNode,
  ) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconContainer}>{icon}</View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{title}</Text>
            {statusBadge}
          </View>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>

      <View style={styles.inputWrapper}>
        {isEditingAddr ? (
          <TextInput
            style={styles.addressInput}
            value={address}
            onChangeText={setAddress}
            placeholder="0x..."
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : (
          <View style={styles.addressDisplay}>
            <Text style={styles.addressText}>
              {address ? formatSafeAddress(address) : 'Not configured'}
            </Text>
            {address ? (
              <Pressable onPress={onCopy} style={styles.copyIcon}>
                <Copy size={16} color="#999" />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.cardActions}>
        {isEditingAddr ? (
          <>
            <Pressable
              style={[styles.cardButton, styles.cancelButton]}
              onPress={() => {
                setIsEditingAddr(false);
                loadWalletData();
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.cardButton, styles.primaryButton, isSaving && styles.disabledButton]}
              onPress={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Save size={16} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.cardButton, styles.secondaryButton]}
            onPress={() => setIsEditingAddr(true)}
          >
            <Edit size={16} color="#1A1A1A" />
            <Text style={styles.secondaryButtonText}>{address ? 'Edit' : 'Configure'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Manage your wallet configuration</Text>
        </View>

        {/* Safe Wallet */}
        {renderAddressCard(
          'Safe Wallet',
          <Shield size={20} color="#007AFF" />,
          'Smart wallet address for multi-sig transactions',
          safeAddress,
          setSafeAddress,
          isEditingSafe,
          setIsEditingSafe,
          isSavingSafe,
          handleSaveSafeAddress,
          handleCopySafeAddress,
          isSafeConfigured && !isEditingSafe ? (
            <View style={styles.statusBadge}>
              <CheckCircle size={14} color="#22C55E" />
              <Text style={styles.statusBadgeText}>Connected</Text>
            </View>
          ) : undefined,
        )}

        {/* Identity Module */}
        {renderAddressCard(
          'Identity Module',
          <Shield size={20} color="#8B5CF6" />,
          'Safe module for identities and delegations',
          moduleAddress,
          setModuleAddress,
          isEditingModule,
          setIsEditingModule,
          isSavingModule,
          handleSaveModuleAddress,
          async () => {
            await Clipboard.setStringAsync(moduleAddress);
            Alert.alert('Copied', 'Address copied');
          },
        )}

        {/* Identity Registry */}
        {renderAddressCard(
          'Identity Registry',
          <Shield size={20} color="#EC4899" />,
          'Global registry for decentralized identifiers',
          registryAddress,
          setRegistryAddress,
          isEditingRegistry,
          setIsEditingRegistry,
          isSavingRegistry,
          handleSaveRegistryAddress,
          async () => {
            await Clipboard.setStringAsync(registryAddress);
            Alert.alert('Copied', 'Address copied');
          },
        )}

        {/* Signer Wallet */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainer}>
              <Wallet size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Signer Wallet</Text>
              <Text style={styles.cardDescription}>Seed phrase that signs Safe transactions</Text>
            </View>
            <Pressable onPress={() => setIsVisible(!isVisible)} style={styles.iconButton}>
              {isVisible ? <EyeOff size={18} color="#999" /> : <Eye size={18} color="#999" />}
            </Pressable>
          </View>

          <View style={styles.inputWrapper}>
            {isEditing ? (
              <TextInput
                style={[styles.seedInputField]}
                multiline
                value={seedPhrase}
                onChangeText={setSeedPhrase}
                placeholder="Enter your seed phrase (12-24 words)"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.seedDisplayText}>
                {isVisible ? seedPhrase : '•••••••• •••••••• •••••••• •••••••• •••••••• ••••••••'}
              </Text>
            )}
          </View>

          <View style={styles.cardActions}>
            {isEditing ? (
              <>
                <Pressable
                  style={[styles.cardButton, styles.cancelButton]}
                  onPress={() => {
                    setIsEditing(false);
                    loadWalletData();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.cardButton, styles.primaryButton, isReinitializing && styles.disabledButton]}
                  onPress={handleSave}
                  disabled={isReinitializing}
                >
                  {isReinitializing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Save size={16} color="#fff" />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {isReinitializing ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={[styles.cardButton, styles.secondaryButton]} onPress={handleCopy}>
                  <Copy size={16} color="#1A1A1A" />
                  <Text style={styles.secondaryButtonText}>Copy</Text>
                </Pressable>
                <Pressable style={[styles.cardButton, styles.secondaryButton]} onPress={() => setIsEditing(true)}>
                  <Edit size={16} color="#1A1A1A" />
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Security Warning */}
        <View style={styles.warningCard}>
          <AlertTriangle size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            Your seed phrase is the only way to recover your funds. Never share it with anyone.
          </Text>
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <Text style={styles.sectionLabel}>Danger Zone</Text>

          <Pressable
            style={[styles.dangerButton, isReinitializing && styles.disabledButton]}
            onPress={handleClear}
            disabled={isReinitializing}
          >
            {isReinitializing ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Trash2 size={18} color="#DC2626" />
            )}
            <Text style={styles.dangerButtonText}>
              {isReinitializing ? 'Resetting...' : 'Reset Wallet'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.dangerButton, isClearingMessages && styles.disabledButton]}
            onPress={handleClearMessages}
            disabled={isClearingMessages}
          >
            {isClearingMessages ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Trash2 size={18} color="#DC2626" />
            )}
            <Text style={styles.dangerButtonText}>
              {isClearingMessages ? 'Deleting...' : 'Clear Message History'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.dangerButton, isClearingTransactions && styles.disabledButton]}
            onPress={handleClearTransactions}
            disabled={isClearingTransactions}
          >
            {isClearingTransactions ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Trash2 size={18} color="#DC2626" />
            )}
            <Text style={styles.dangerButtonText}>
              {isClearingTransactions ? 'Clearing...' : 'Clear Transaction History'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  cardIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  cardDescription: {
    fontSize: 13,
    color: '#888',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
  },
  inputWrapper: {
    marginBottom: 12,
  },
  addressInput: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    fontFamily: 'SpaceMono',
  },
  addressDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addressText: {
    fontSize: 14,
    color: '#1A1A1A',
    fontFamily: 'SpaceMono',
  },
  copyIcon: {
    padding: 4,
  },
  seedInputField: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    minHeight: 100,
    textAlignVertical: 'top',
    fontFamily: 'SpaceMono',
  },
  seedDisplayText: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#1A1A1A',
    lineHeight: 20,
    fontFamily: 'SpaceMono',
    minHeight: 80,
  },
  iconButton: {
    padding: 8,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#1A1A1A',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
  },
  secondaryButtonText: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    padding: 14,
    borderRadius: 12,
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  warningText: {
    flex: 1,
    color: '#92400E',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  dangerSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 8,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dangerButtonText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
