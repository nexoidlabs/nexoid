import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react-native';
import type { DelegationRequestContent } from '@/types/messages';

interface Props {
  data: DelegationRequestContent;
  onApprove: (data: DelegationRequestContent) => Promise<void>;
  onReject: (data: DelegationRequestContent) => void;
  disabled?: boolean;
}

export function DelegationRequestCard({ data, onApprove, onReject, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove(data);
      setResolved('approved');
    } catch {
      setLoading(false);
    }
  };

  const handleReject = () => {
    onReject(data);
    setResolved('rejected');
  };

  const shortAddr = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  const shortId = (id: string) =>
    id.length > 16 ? `${id.slice(0, 10)}...${id.slice(-4)}` : id;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ShieldCheck size={18} color="#0066cc" />
        <Text style={styles.headerText}>Delegation Request</Text>
      </View>

      <View style={styles.body}>
        <DetailRow label="Identity" value={shortId(data.identity_id)} />
        <DetailRow label="Delegatee" value={shortAddr(data.delegatee)} />
        <Text style={styles.reason}>{data.reason}</Text>
      </View>

      {resolved ? (
        <View style={[styles.result, resolved === 'approved' ? styles.resultApproved : styles.resultRejected]}>
          <Text style={styles.resultText}>
            {resolved === 'approved' ? 'Approved' : 'Rejected'}
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.rejectBtn]}
            onPress={handleReject}
            disabled={disabled || loading}
          >
            <XCircle size={16} color="#D8000C" />
            <Text style={styles.rejectText}>Reject</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.approveBtn]}
            onPress={handleApprove}
            disabled={disabled || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <CheckCircle2 size={16} color="#fff" />
                <Text style={styles.approveText}>Approve</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066cc',
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    color: '#1A1A1A',
    fontFamily: 'Menlo',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  reason: {
    fontSize: 13,
    color: '#333',
    marginTop: 6,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  rejectBtn: {
    borderRightWidth: 0.5,
    borderRightColor: '#f0f0f0',
  },
  approveBtn: {
    backgroundColor: '#0066cc',
    borderBottomRightRadius: 12,
  },
  rejectText: {
    color: '#D8000C',
    fontSize: 14,
    fontWeight: '600',
  },
  approveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  result: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  resultApproved: {
    backgroundColor: '#E8F5E9',
  },
  resultRejected: {
    backgroundColor: '#FFEBEE',
  },
  resultText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});
