import { ArrowRight, Fingerprint, ShieldCheck, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface CredentialCardProps {
  credential: {
    id: string;
    did: string;
    title: string;
    description?: string;
    issuer: string;
    registryName: string;
    validUntil: string;
    verified: boolean;
    accentColor: string;
    metadata?: {
      name?: string;
      issuer?: string;
      description?: string;
      did?: string;
      subject?: string;
      createdAt?: string;
    };
  };
  onPress: () => void;
  onDelegate: () => void;
  onDelete?: () => void;
}

export function CredentialCard({ credential, onPress, onDelegate, onDelete }: CredentialCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.accentStrip, { backgroundColor: credential.accentColor }]} />
      
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleWithIcon}>
              <Fingerprint size={20} color={credential.accentColor} />
              <Text style={styles.title} numberOfLines={1}>{credential.title}</Text>
            </View>
            {credential.verified && (
              <View style={styles.verifiedBadge}>
                <ShieldCheck size={12} color="#fff" />
                <Text style={styles.verifiedText}>Active</Text>
              </View>
            )}
          </View>
          <View style={styles.issuerRow}>
            <Text style={styles.registryName}>{credential.registryName}</Text>
            {credential.issuer && (
              <>
                <View style={styles.dot} />
                <Text style={styles.issuerText}>{credential.issuer}</Text>
              </>
            )}
          </View>
          {credential.description && (
            <Text style={styles.description} numberOfLines={2}>{credential.description}</Text>
          )}
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.didContainer}>
            <Text style={styles.didLabel}>{credential.did.startsWith('did:') ? 'DID' : 'IDENTITY ID'}</Text>
            <Text style={styles.didText} numberOfLines={1}>{credential.did}</Text>
          </View>
        </View>

        {credential.metadata?.createdAt && (
          <View style={styles.footerInfo}>
            <Text style={styles.dateLabel}>Issued on {new Date(credential.metadata.createdAt).toLocaleDateString()}</Text>
          </View>
        )}

        <View style={styles.actions}>
          {onDelete && (
            <Pressable style={styles.deleteButton} onPress={onDelete}>
              <Trash2 size={18} color="#FF3B30" />
            </Pressable>
          )}
          <Pressable style={styles.delegateButton} onPress={onDelegate}>
            <Text style={styles.delegateButtonText}>Delegate</Text>
            <ArrowRight size={14} color="#007AFF" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  accentStrip: {
    width: 6,
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  verifiedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  registryName: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  issuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#999',
  },
  issuerText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 18,
  },
  detailsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  didContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  didLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 2,
  },
  didText: {
    fontSize: 11,
    color: '#475569',
    fontFamily: 'SpaceMono',
  },
  footerInfo: {
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    alignItems: 'center',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#FFF1F0',
  },
  delegateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 20,
  },
  delegateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});




