import { MAIN_WALLET_ID, Transaction } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';
import { ArrowDownLeft, Coffee, ShoppingBag, Smartphone, ArrowUpRight, X, ExternalLink, Copy } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Modal, TouchableOpacity, Linking, ScrollView, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

const getIcon = (name: string, color: string) => {
  switch (name) {
    case 'coffee': return <Coffee size={20} color={color} />;
    case 'smartphone': return <Smartphone size={20} color={color} />;
    case 'arrow-down-left': return <ArrowDownLeft size={20} color={color} />;
    case 'arrow-up-right': return <ArrowUpRight size={20} color={color} />;
    default: return <ShoppingBag size={20} color={color} />;
  }
};

interface TransactionListProps {
  transactions: Transaction[];
  emptyMessage?: string;
  isLoading?: boolean;
}

export function TransactionList({ transactions, emptyMessage = 'No recent activity', isLoading = false }: TransactionListProps) {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [walletBadges, setWalletBadges] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;

    const loadBadges = async () => {
      try {
        const units = await ManagedUnitsService.getAll();
        const badgeMap: Record<string, string> = {};
        units.forEach(unit => {
          if (unit.address && unit.avatarUrl) {
            badgeMap[unit.address.toLowerCase()] = unit.avatarUrl;
          }
        });
        badgeMap[MAIN_WALLET_ID] = 'NX';
        if (isMounted) {
          setWalletBadges(badgeMap);
        }
      } catch (error) {
        console.warn('Failed to load unit badges:', error);
      }
    };

    loadBadges();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTransactionPress = (tx: Transaction) => {
    setSelectedTx(tx);
  };

  const closeModal = () => {
    setSelectedTx(null);
  };

  const openExplorer = () => {
    if (selectedTx?.txHash) {
      Linking.openURL(`https://sepolia.etherscan.io/tx/${selectedTx.txHash}`);
    }
  };

  const shortenAddress = (address: string) => {
    if (!address) return '';
    if (address.length < 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  if (isLoading && (!transactions || transactions.length === 0)) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <ActivityIndicator size="small" color="#64748B" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      {transactions.map((t, index) => {
        const isLast = index === transactions.length - 1;
        const title = t.from ? shortenAddress(t.from) : (t.merchant || 'Unknown');
        const badgeKey = t.walletId?.toLowerCase?.() ? t.walletId.toLowerCase() : t.walletId;
        const badgeContent = badgeKey ? walletBadges[badgeKey] : undefined;
        
        return (
        <TouchableOpacity key={t.id} onPress={() => handleTransactionPress(t)} style={[styles.row, isLast && styles.lastRow]}>
          <View style={styles.iconBox}>
            {getIcon(t.iconName, '#334155')}
            {badgeContent && (
              <View style={styles.initiatorBadge}>
                <Text style={styles.initiatorEmoji}>{badgeContent}</Text>
              </View>
            )}
          </View>
          <View style={styles.details}>
            <View style={styles.topLine}>
                <Text style={styles.merchant} numberOfLines={1} ellipsizeMode="middle">
                  {title}
                </Text>
                <Text style={[
                    styles.amount, 
                    { color: t.type === 'income' ? '#22C55E' : '#0F172A' }
                ]}>
                    {t.type === 'income' ? '+' : ''}{Math.abs(t.amount).toFixed(2)}
                </Text>
            </View>
            <View style={styles.bottomLine}>
                <Text style={styles.date}>{t.date}</Text>
                
                {/* Show Tx Hash */}
                {t.txHash && (
                    <View style={styles.hashTag}>
                        <Text style={styles.hashText}>
                          {t.txHash.slice(0, 6)}...{t.txHash.slice(-4)}
                        </Text>
                    </View>
                )}
            </View>
          </View>
        </TouchableOpacity>
      )})}

      <Modal
        animationType="slide"
        transparent={true}
        visible={!!selectedTx}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          <View style={styles.modalContent}>
            {selectedTx && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Transaction Details</Text>
                  <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <X size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.amountContainer}>
                   <View style={[styles.iconBoxLarge]}>
                        {getIcon(selectedTx.iconName, '#334155')}
                    </View>
                    <Text style={[
                        styles.modalAmount,
                        { color: selectedTx.type === 'income' ? '#22C55E' : '#0F172A' }
                    ]}>
                        {selectedTx.type === 'income' ? '+' : ''}{Math.abs(selectedTx.amount).toFixed(2)} {selectedTx.tokenSymbol || 'USDT'}
                    </Text>
                    <Text style={styles.modalDate}>{selectedTx.date}</Text>
                </View>

                <View style={styles.detailsContainer}>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Status</Text>
                        <View style={styles.statusBadge}>
                             <Text style={styles.statusText}>Completed</Text>
                        </View>
                    </View>
                    
                    {selectedTx.from && (
                        <TouchableOpacity onPress={() => copyToClipboard(selectedTx.from!, 'Sender address')}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>From</Text>
                                <View style={styles.copyRow}>
                                    <Text style={styles.detailValue} numberOfLines={1}>{shortenAddress(selectedTx.from)}</Text>
                                    <Copy size={14} color="#64748B" style={styles.copyIcon} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}

                    {selectedTx.to && (
                        <TouchableOpacity onPress={() => copyToClipboard(selectedTx.to!, 'Receiver address')}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>To</Text>
                                <View style={styles.copyRow}>
                                    <Text style={styles.detailValue} numberOfLines={1}>{shortenAddress(selectedTx.to)}</Text>
                                    <Copy size={14} color="#64748B" style={styles.copyIcon} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Token</Text>
                        <Text style={styles.detailValue}>{selectedTx.tokenSymbol || 'USDT'}</Text>
                    </View>

                    {selectedTx.txHash && (
                        <TouchableOpacity onPress={() => copyToClipboard(selectedTx.txHash!, 'Transaction hash')}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Transaction Hash</Text>
                                <View style={styles.copyRow}>
                                    <Text style={styles.detailValue} numberOfLines={1}>{shortenAddress(selectedTx.txHash)}</Text>
                                    <Copy size={14} color="#64748B" style={styles.copyIcon} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>

                {selectedTx.txHash && (
                    <TouchableOpacity style={styles.scanButton} onPress={openExplorer}>
                        <Text style={styles.scanButtonText}>View on Etherscan</Text>
                        <ExternalLink size={16} color="#0F172A" />
                    </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 10,
    flex: 1, // Extend to bottom
  },
  centerContainer: {
    alignItems: 'center',
    minHeight: 200,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 20,
    marginTop: 10,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  lastRow: {
    marginBottom: 40,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  initiatorBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  initiatorEmoji: {
    fontSize: 10,
    fontWeight: '700',
  },
  details: {
    flex: 1,
  },
  topLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
  },
  bottomLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
  },
  merchant: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: '70%',
  },
  date: {
    fontSize: 13,
    color: '#64748B',
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
  initiatorTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  initiatorText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  hashTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hashText: {
    fontSize: 10,
    color: '#94A3B8',
    fontFamily: 'Courier', 
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    height: '70%', 
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconBoxLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalAmount: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalDate: {
    fontSize: 14,
    color: '#64748B',
  },
  detailsContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scanButtonText: {
    marginRight: 8,
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 15,
  },
  copyRow: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  copyIcon: {
    marginLeft: 8,
  },
});
