import { Credential, Wallet } from '@/constants/MockData';
import { ChevronDown, Clock, ShieldCheck, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface DelegateCredentialModalProps {
  visible: boolean;
  onClose: () => void;
  credential: {
    id: string;
    title: string;
    accentColor: string;
  } | null;
  wallets?: Wallet[]; // Optional override for wallets list
  onConfirm: (unitId: string, purpose: string, duration: string) => void;
  initialUnitId?: string; // Pre-select a unit
  initialPurpose?: string; // Pre-fill purpose
}

const DURATIONS = ['1h', '4h', '24h', '7d'];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function DelegateCredentialModal({ 
  visible, 
  onClose, 
  credential,
  wallets,
  onConfirm,
  initialUnitId,
  initialPurpose
}: DelegateCredentialModalProps) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialUnitId || null);
  const [purpose, setPurpose] = useState(initialPurpose || '');
  const [selectedDuration, setSelectedDuration] = useState('4h');
  const [isSelectingUnit, setIsSelectingUnit] = useState(false);

  // Update state when initial values change
  React.useEffect(() => {
    if (visible) {
      setSelectedUnitId(initialUnitId || null);
      setPurpose(initialPurpose || '');
    }
  }, [visible, initialUnitId, initialPurpose]);

  const robotWallets = wallets || [];
  const selectedUnit = robotWallets.find(w => w.id === selectedUnitId);

  const handleConfirm = () => {
    if (!selectedUnitId || !purpose) return;
    onConfirm(selectedUnitId, purpose, selectedDuration);
    resetState();
  };

  const resetState = () => {
    setSelectedUnitId(null);
    setPurpose('');
    setSelectedDuration('4h');
    setIsSelectingUnit(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (!credential) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <Pressable style={styles.centeredView} onPress={handleClose}>
          <Pressable style={styles.modalViewWrapper} onPress={e => e.stopPropagation()}>
            <View style={styles.modalView}>
              <View style={styles.header}>
                <Text style={styles.modalTitle}>Delegate Credential</Text>
                <Pressable onPress={handleClose} style={styles.closeButton}>
                  <X size={24} color="#1A1A1A" />
                </Pressable>
              </View>

              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.credentialPreview}>
                  <ShieldCheck size={20} color={credential.accentColor} />
                  <Text style={styles.credentialName}>{credential.title}</Text>
                </View>

                <Text style={styles.sectionLabel}>Delegate to Unit</Text>
                <TouchableOpacity 
                  style={styles.unitSelector} 
                  onPress={() => setIsSelectingUnit(!isSelectingUnit)}
                >
                  {selectedUnit ? (
                    <View style={styles.selectedUnitRow}>
                      <Text style={styles.unitEmoji}>{selectedUnit.avatarUrl}</Text>
                      <Text style={styles.unitName}>{selectedUnit.name}</Text>
                    </View>
                  ) : (
                    <Text style={styles.placeholderText}>Select a Unit...</Text>
                  )}
                  <ChevronDown size={20} color="#666" />
                </TouchableOpacity>

                {isSelectingUnit && (
                  <View style={styles.unitListContainer}>
                    <ScrollView style={styles.unitList} nestedScrollEnabled>
                      {robotWallets.map(wallet => (
                        <TouchableOpacity
                          key={wallet.id}
                          style={[styles.unitOption, selectedUnitId === wallet.id && styles.selectedUnitOption]}
                          onPress={() => {
                            setSelectedUnitId(wallet.id);
                            setIsSelectingUnit(false);
                          }}
                        >
                          <Text style={styles.unitOptionEmoji}>{wallet.avatarUrl}</Text>
                          <Text style={styles.unitOptionName}>{wallet.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.sectionLabel}>Purpose</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Alcohol purchase, Pickup..."
                  placeholderTextColor="#999"
                  value={purpose}
                  onChangeText={setPurpose}
                />

                <Text style={styles.sectionLabel}>Duration</Text>
                <View style={styles.durationContainer}>
                  {DURATIONS.map(duration => (
                    <TouchableOpacity
                      key={duration}
                      style={[
                        styles.durationChip,
                        selectedDuration === duration && styles.selectedDurationChip
                      ]}
                      onPress={() => setSelectedDuration(duration)}
                    >
                      <Clock size={14} color={selectedDuration === duration ? '#fff' : '#666'} />
                      <Text style={[
                        styles.durationText,
                        selectedDuration === duration && styles.selectedDurationText
                      ]}>{duration}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Pressable 
                  style={[styles.confirmButton, (!selectedUnitId || !purpose) && styles.confirmButtonDisabled]} 
                  onPress={handleConfirm}
                  disabled={!selectedUnitId || !purpose}
                >
                  <Text style={styles.confirmButtonText}>Confirm Delegation</Text>
                </Pressable>
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalViewWrapper: {
    width: '100%',
    maxHeight: '90%', // Limit height to allow space for keyboard
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
    maxHeight: '100%', // Take up to 100% of wrapper
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  credentialPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  credentialName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
  },
  unitSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  selectedUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitEmoji: {
    fontSize: 20,
  },
  unitName: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
  },
  unitListContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    marginBottom: 16,
    maxHeight: 200,
  },
  unitList: {
    padding: 8,
  },
  unitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  selectedUnitOption: {
    backgroundColor: '#F0F9FF',
  },
  unitOptionEmoji: {
    fontSize: 20,
  },
  unitOptionName: {
    fontSize: 16,
    color: '#1A1A1A',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#1A1A1A',
    marginBottom: 16,
  },
  durationContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  selectedDurationChip: {
    backgroundColor: '#1A1A1A',
  },
  durationText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  selectedDurationText: {
    color: '#fff',
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
});
