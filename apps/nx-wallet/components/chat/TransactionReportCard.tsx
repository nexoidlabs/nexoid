import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, ExternalLink } from 'lucide-react-native';
import type { TransactionReportContent } from '@/types/messages';

interface Props {
  data: TransactionReportContent;
}

export function TransactionReportCard({ data }: Props) {
  const isCompleted = data.status === 'completed';
  const color = isCompleted ? '#2E7D32' : data.status === 'failed' ? '#C62828' : '#F57C00';
  const bg = isCompleted ? '#E8F5E9' : data.status === 'failed' ? '#FFEBEE' : '#FFF3E0';
  const baseScanUrl = data.tx_hash ? `https://sepolia.etherscan.io/tx/${data.tx_hash}` : null;

  const shortAddr = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderLeftColor: color }]}>
      <View style={styles.header}>
        <ArrowUpRight size={18} color={color} />
        <Text style={[styles.title, { color }]}>Transaction Sent</Text>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>{data.amount} {data.token}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.label}>To</Text>
        <Text style={styles.value}>{shortAddr(data.recipient)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.label}>From</Text>
        <Text style={styles.value}>{shortAddr(data.from)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.label}>Network</Text>
        <Text style={styles.value}>{data.network || 'Ethereum Sepolia'}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.label}>Status</Text>
        <Text style={[styles.value, { color, fontWeight: '600' }]}>
          {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
        </Text>
      </View>

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
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountRow: {
    marginBottom: 8,
  },
  amount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  label: {
    fontSize: 12,
    color: '#666',
  },
  value: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
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
