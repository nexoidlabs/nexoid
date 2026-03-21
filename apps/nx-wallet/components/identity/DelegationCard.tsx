import { INITIAL_WALLETS, Wallet } from '@/constants/MockData';
import { Clock } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

interface DelegationCardProps {
  delegation: {
    id: string;
    credentialId: string;
    delegatedToWalletId: string;
    purpose: string;
    expiresAt: string;
  };
  credential: {
    id: string;
    title: string;
    accentColor: string;
  };
  targetWallet?: Wallet;
  style?: ViewStyle;
}

export function DelegationCard({ delegation, credential, targetWallet, style }: DelegationCardProps) {
  const wallet = targetWallet || INITIAL_WALLETS.find(w => w.id === delegation.delegatedToWalletId);

  return (
    <View style={[styles.card, style]}>
      <View style={[styles.iconContainer, { backgroundColor: credential.accentColor + '20' }]}>
        <Text style={styles.emoji}>{wallet?.avatarUrl || '🤖'}</Text>
      </View>
      
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.credentialTitle}>{credential.title}</Text>
          <View style={styles.expiryBadge}>
            <Clock size={10} color="#666" />
            <Text style={styles.expiryText}>{delegation.expiresAt || 'Session'}</Text>
          </View>
        </View>
        
        <Text style={styles.delegatedTo}>
          delegated to <Text style={styles.bold}>{wallet?.name || delegation.delegatedToWalletId.slice(0, 10)}</Text>
        </Text>
        
        <Text style={styles.purpose}>Purpose: {delegation.purpose}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  emoji: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  credentialTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  expiryText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  delegatedTo: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  bold: {
    fontWeight: '600',
    color: '#333',
  },
  purpose: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
});
