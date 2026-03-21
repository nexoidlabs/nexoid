import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react-native';
import type { DelegationResponseContent, PaymentResponseContent } from '@/types/messages';

interface Props {
  type: 'delegation' | 'payment';
  data: DelegationResponseContent | PaymentResponseContent;
}

export function ResponseCard({ type, data }: Props) {
  const approved = data.approved;
  const txHash = data.tx_hash;
  const baseScanUrl = txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : null;

  const title = type === 'delegation' ? 'Delegation' : 'Payment';
  const color = approved ? '#2E7D32' : '#C62828';
  const bg = approved ? '#E8F5E9' : '#FFEBEE';

  return (
    <View style={[styles.card, { backgroundColor: bg, borderLeftColor: color }]}>
      <View style={styles.header}>
        {approved ? (
          <CheckCircle2 size={18} color={color} />
        ) : (
          <XCircle size={18} color={color} />
        )}
        <Text style={[styles.title, { color }]}>
          {title} {approved ? 'Approved' : 'Rejected'}
        </Text>
      </View>

      {data.error && (
        <Text style={styles.error}>{data.error}</Text>
      )}

      {baseScanUrl && (
        <Pressable
          style={styles.link}
          onPress={() => Linking.openURL(baseScanUrl)}
        >
          <ExternalLink size={14} color="#0066cc" />
          <Text style={styles.linkText}>View on Etherscan</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    fontSize: 12,
    color: '#C62828',
    marginTop: 6,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  linkText: {
    fontSize: 13,
    color: '#0066cc',
    fontWeight: '500',
  },
});
