import { MAIN_WALLET_ID, Wallet } from '@/constants/MockData';
import { nexoidService } from '@/services/NexoidService';
import { wdkService } from '@/services/WDKService';
import { ArrowRight, ChevronDown, Delete, Globe, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  sourceWallet: Wallet | null;
  targetWallet: Wallet | null;
  allWallets?: Wallet[];
  onSourceChange?: (id: string) => void;
  onTargetChange?: (id: string) => void;
  onConfirm: (amount: number, externalAddress?: string) => void;
}

export function TransferModal({ 
  visible, 
  onClose, 
  sourceWallet, 
  targetWallet, 
  allWallets = [],
  onSourceChange,
  onTargetChange,
  onConfirm 
}: TransferModalProps) {
  const [amount, setAmount] = useState('0');
  const [selectingSide, setSelectingSide] = useState<'source' | 'target' | null>(null);
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isExternalTarget, setIsExternalTarget] = useState(false);
  const [externalAddress, setExternalAddress] = useState('');

  useEffect(() => {
    if (visible && sourceWallet) {
      const fetchBalance = async () => {
        try {
          setIsLoadingBalance(true);
          
          // Check if source is the main wallet and Safe is configured
          if (sourceWallet.id === MAIN_WALLET_ID && nexoidService.isReady()) {
            const balanceStr = await nexoidService.getUSDTBalance();
            setRealBalance(parseFloat(balanceStr));
          } else if (sourceWallet.address) {
            // Use WDK for agent wallets or if Safe not configured
            const balanceStr = await wdkService.getUSDTBalanceForAddressFormatted('ethereum', sourceWallet.address);
            setRealBalance(parseFloat(balanceStr));
          } else {
            setRealBalance(sourceWallet.balance);
          }
        } catch (e) {
          console.warn('Failed to fetch real balance in modal', e);
          setRealBalance(sourceWallet.balance);
        } finally {
          setIsLoadingBalance(false);
        }
      };
      fetchBalance();
    } else {
      setRealBalance(null);
    }
  }, [visible, sourceWallet?.id, sourceWallet?.address]);

  const handleNumberPress = (num: string) => {
    if (num === '.') {
      if (amount.includes('.')) return;
      setAmount(prev => prev + '.');
      return;
    }

    if (amount === '0') {
      setAmount(num);
    } else {
      setAmount(prev => prev + num);
    }
  };

  const handleDelete = () => {
    if (amount.length > 1) {
      setAmount(prev => prev.slice(0, -1));
    } else {
      setAmount('0');
    }
  };

  const currentBalance = realBalance !== null ? realBalance : (sourceWallet?.balance || 0);

  const handleConfirm = () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) return;
    if (value > currentBalance) return; // Prevent confirming if balance exceeded
    
    if (isExternalTarget) {
      if (!externalAddress.startsWith('0x') || externalAddress.length !== 42) {
        alert('Please enter a valid EVM address');
        return;
      }
      onConfirm(value, externalAddress);
    } else {
      onConfirm(value);
    }
    setAmount('0');
  };

  const handleSelectWallet = (walletId: string) => {
    if (selectingSide === 'source') {
      setIsExternalTarget(false);
      if (onSourceChange) {
        // Prevent selecting same wallet as target
        if (targetWallet && targetWallet.id === walletId) {
          // If swapping, we might want to swap both, but for now just update source
          // or prevent selection. Let's swap if it matches target.
          if (onTargetChange && sourceWallet) {
             onTargetChange(sourceWallet.id);
          }
        }
        onSourceChange(walletId);
      }
    } else if (selectingSide === 'target') {
      setIsExternalTarget(false);
      if (onTargetChange) {
        if (sourceWallet && sourceWallet.id === walletId) {
           if (onSourceChange && targetWallet) {
             onSourceChange(targetWallet.id);
           }
        }
        onTargetChange(walletId);
      }
    }
    setSelectingSide(null);
  };

  const handleSelectExternal = () => {
    setIsExternalTarget(true);
    if (onTargetChange) {
      onTargetChange(''); // Clear target wallet if external
    }
    setSelectingSide(null);
  };

  if (!visible) return null;

  const currentAmount = parseFloat(amount);
  const isExceeded = currentAmount > currentBalance;
  const isInvalid = isExceeded || currentAmount <= 0 || !sourceWallet || (!targetWallet && !isExternalTarget);

  const renderWalletSelector = () => {
    if (!selectingSide) return null;

    return (
      <View style={styles.selectorOverlay}>
        <View style={styles.selectorContainer}>
          <View style={styles.selectorHeader}>
            <Text style={styles.selectorTitle}>
              Select {selectingSide === 'source' ? 'Origin' : 'Destination'}
            </Text>
            <TouchableOpacity onPress={() => setSelectingSide(null)} style={styles.closeButton}>
              <X size={20} color="#1A1A1A" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.walletList} contentContainerStyle={{ paddingBottom: 20 }}>
            {allWallets.map(wallet => {
              const isSelected = selectingSide === 'source' 
                ? wallet.id === sourceWallet?.id 
                : wallet.id === targetWallet?.id;
                
              // Optional: Disable the wallet currently selected in the OTHER slot
              const isDisabled = selectingSide === 'source'
                ? wallet.id === targetWallet?.id
                : wallet.id === sourceWallet?.id;

              return (
                <TouchableOpacity 
                  key={wallet.id} 
                  style={[styles.walletOption, isSelected && styles.selectedWalletOption, isDisabled && styles.disabledWalletOption]}
                  onPress={() => !isDisabled && handleSelectWallet(wallet.id)}
                  disabled={isDisabled}
                >
                  <Text style={styles.walletOptionEmoji}>{wallet.avatarUrl || (wallet.type === 'main' ? '💰' : '🤖')}</Text>
                  <View style={styles.walletOptionInfo}>
                    <Text style={styles.walletOptionName}>{wallet.name}</Text>
                    <Text style={styles.walletOptionBalance}>{wallet.currency} {wallet.balance.toFixed(2)}</Text>
                  </View>
                  {isSelected && <View style={styles.selectedDot} />}
                </TouchableOpacity>
              );
            })}
            
            {selectingSide === 'target' && (
              <TouchableOpacity 
                style={[styles.walletOption, isExternalTarget && styles.selectedWalletOption]}
                onPress={handleSelectExternal}
              >
                <View style={styles.externalIconContainer}>
                  <Globe size={24} color="#666" />
                </View>
                <View style={styles.walletOptionInfo}>
                  <Text style={styles.walletOptionName}>External Wallet</Text>
                  <Text style={styles.walletOptionBalance}>Send to any address</Text>
                </View>
                {isExternalTarget && <View style={styles.selectedDot} />}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    );
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <View style={styles.header}>
            <Text style={styles.modalTitle}>Transfer</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#1A1A1A" />
            </Pressable>
          </View>

          {/* Transfer Route */}
          <View style={styles.routeContainer}>
            <TouchableOpacity 
              style={styles.walletBadge} 
              onPress={() => setSelectingSide('source')}
            >
              {sourceWallet ? (
                <>
                  <Text style={styles.walletEmoji}>{sourceWallet.avatarUrl || (sourceWallet.type === 'main' ? '💰' : '🤖')}</Text>
                  <Text style={styles.walletName}>{sourceWallet.name}</Text>
                </>
              ) : (
                <Text style={styles.walletName}>Select Source</Text>
              )}
              <ChevronDown size={14} color="#666" />
            </TouchableOpacity>
            
            <ArrowRight color="#ccc" size={20} />
            
            <TouchableOpacity 
              style={styles.walletBadge} 
              onPress={() => setSelectingSide('target')}
            >
              {isExternalTarget ? (
                <>
                  <Globe size={16} color="#666" />
                  <Text style={styles.walletName}>External</Text>
                </>
              ) : targetWallet ? (
                <>
                  <Text style={styles.walletEmoji}>{targetWallet.avatarUrl || (targetWallet.type === 'main' ? '💰' : '🤖')}</Text>
                  <Text style={styles.walletName}>{targetWallet.name}</Text>
                </>
              ) : (
                <Text style={styles.walletName}>Select Target</Text>
              )}
              <ChevronDown size={14} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Amount Display */}
          <View style={styles.amountDisplay}>
            <Text style={[styles.currency, isExceeded && styles.errorText]}>$</Text>
            <Text style={[styles.amount, isExceeded && styles.errorText]}>{amount}</Text>
          </View>
          
          <View style={styles.balanceContainer}>
            <Text style={styles.availableBalance}>
              Available: {sourceWallet?.currency || 'USD'} {currentBalance.toFixed(2)}
            </Text>
            {isLoadingBalance && <ActivityIndicator size="small" color="#888" style={{ marginLeft: 8 }} />}
          </View>

          {isExternalTarget && (
            <View style={styles.externalAddressContainer}>
              <TextInput
                style={styles.addressInput}
                placeholder="Enter recipient address (0x...)"
                value={externalAddress}
                onChangeText={setExternalAddress}
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Token Selector Placeholder */}
          <Pressable style={styles.tokenSelector}>
            <Text style={styles.tokenText}>USD • US Dollar</Text>
          </Pressable>

          {/* Numpad */}
          <View style={styles.numpad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <Pressable 
                key={num} 
                style={({ pressed }) => [styles.numButton, pressed && styles.numButtonPressed]}
                onPress={() => handleNumberPress(num.toString())}
              >
                <Text style={styles.numText}>{num}</Text>
              </Pressable>
            ))}
            <Pressable style={({ pressed }) => [styles.numButton, pressed && styles.numButtonPressed]} onPress={() => handleNumberPress('.')}>
              <Text style={styles.numText}>.</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.numButton, pressed && styles.numButtonPressed]} onPress={() => handleNumberPress('0')}>
              <Text style={styles.numText}>0</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.numButton, pressed && styles.numButtonPressed]} onPress={handleDelete}>
              <Delete size={24} color="#1A1A1A" />
            </Pressable>
          </View>

          <Pressable 
            style={[styles.confirmButton, isInvalid && styles.confirmButtonDisabled]} 
            onPress={handleConfirm}
            disabled={isInvalid}
          >
            <Text style={styles.confirmButtonText}>Send Funds</Text>
          </Pressable>
          
          {renderWalletSelector()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalView: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    paddingBottom: 40,
    minHeight: 500, // Ensure enough height for everything
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  closeButton: {
    padding: 4,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 30,
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
    minWidth: 120,
    justifyContent: 'center',
  },
  walletEmoji: {
    fontSize: 16,
  },
  walletName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  amountDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  currency: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 8,
    marginRight: 4,
  },
  amount: {
    fontSize: 56,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  errorText: {
    color: '#FF3B30',
  },
  availableBalance: {
    textAlign: 'center',
    fontSize: 14,
    color: '#888',
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: -10,
  },
  tokenSelector: {
    alignSelf: 'center',
    backgroundColor: '#F0F0F0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 30,
  },
  tokenText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 30,
  },
  numButton: {
    width: '30%',
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
  },
  numButtonPressed: {
    backgroundColor: '#E0E0E0',
  },
  numText: {
    fontSize: 24,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  confirmButton: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#CCC',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    zIndex: 10,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
  },
  selectorContainer: {
    flex: 1,
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  walletList: {
    flex: 1,
  },
  walletOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  selectedWalletOption: {
    backgroundColor: '#F0F9FF',
    borderColor: '#007AFF',
  },
  disabledWalletOption: {
    opacity: 0.5,
  },
  walletOptionEmoji: {
    fontSize: 24,
    marginRight: 16,
  },
  walletOptionInfo: {
    flex: 1,
  },
  walletOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  walletOptionBalance: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  externalIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  externalAddressContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  addressInput: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 16,
    fontSize: 14,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#EEE',
  },
});
