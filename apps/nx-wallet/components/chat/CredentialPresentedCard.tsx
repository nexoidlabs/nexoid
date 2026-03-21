import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, ShieldX } from 'lucide-react-native';
import type { CredentialPresentedContent } from '@/types/messages';

interface Props {
  data: CredentialPresentedContent;
}

export function CredentialPresentedCard({ data }: Props) {
  const color = data.valid ? '#1565C0' : '#C62828';
  const bg = data.valid ? '#E3F2FD' : '#FFEBEE';
  const Icon = data.valid ? ShieldCheck : ShieldX;

  const shortId = (id: string) =>
    id.length > 16 ? `${id.slice(0, 10)}...${id.slice(-6)}` : id;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderLeftColor: color }]}>
      <View style={styles.header}>
        <Icon size={18} color={color} />
        <Text style={[styles.title, { color }]}>
          Credential {data.valid ? 'Presented' : 'Invalid'}
        </Text>
      </View>

      {data.purpose && (
        <Text style={styles.purpose}>{data.purpose}</Text>
      )}

      <View style={styles.detailRow}>
        <Text style={styles.label}>Identity</Text>
        <Text style={styles.value}>{shortId(data.identity_id)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.label}>Holder</Text>
        <Text style={styles.value}>{shortId(data.holder)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.label}>Status</Text>
        <Text style={[styles.value, { color, fontWeight: '600' }]}>
          {data.valid ? 'Verified' : 'Failed'}
        </Text>
      </View>

      {data.error && (
        <Text style={styles.error}>{data.error}</Text>
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
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  purpose: {
    fontSize: 13,
    color: '#333',
    marginBottom: 8,
    lineHeight: 18,
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
  error: {
    fontSize: 12,
    color: '#C62828',
    marginTop: 6,
  },
});
