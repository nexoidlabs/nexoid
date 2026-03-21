import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Info, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react-native';
import type { StatusUpdateContent } from '@/types/messages';

interface Props {
  data: StatusUpdateContent;
}

const STATUS_CONFIG: Record<string, { icon: typeof Info; color: string; bg: string }> = {
  info:    { icon: Info,           color: '#1976D2', bg: '#E3F2FD' },
  success: { icon: CheckCircle2,   color: '#2E7D32', bg: '#E8F5E9' },
  warning: { icon: AlertTriangle,  color: '#F57C00', bg: '#FFF3E0' },
  error:   { icon: XCircle,        color: '#C62828', bg: '#FFEBEE' },
  pending: { icon: Clock,          color: '#7B1FA2', bg: '#F3E5F5' },
};

export function StatusUpdateCard({ data }: Props) {
  const config = STATUS_CONFIG[data.status] || STATUS_CONFIG.info;
  const Icon = config.icon;

  return (
    <View style={[styles.card, { backgroundColor: config.bg, borderLeftColor: config.color }]}>
      <View style={styles.header}>
        <Icon size={18} color={config.color} />
        <Text style={[styles.title, { color: config.color }]}>{data.title}</Text>
      </View>
      <Text style={styles.description}>{data.description}</Text>
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
  description: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
});
