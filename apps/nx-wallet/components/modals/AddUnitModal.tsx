import { Bot, FileText, Hash, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

interface AddUnitModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (address: string, name: string, notes: string, avatarUrl: string) => Promise<void>;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const EMOJIS = ['🤖', '🦾', '🦿', '👾', '⚙️', '🔌', '🛰️', '🛸'];

export function AddUnitModal({ visible, onClose, onAdd }: AddUnitModalProps) {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!address || !name) {
      setError('Address and Name are required');
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address.trim())) {
      setError('Invalid EVM address format');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onAdd(address.trim(), name.trim(), notes.trim(), selectedEmoji);
      resetAndClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add unit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setAddress('');
    setName('');
    setNotes('');
    setSelectedEmoji(EMOJIS[0]);
    setError(null);
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <Pressable style={styles.centeredView} onPress={resetAndClose}>
          <Pressable style={styles.modalViewWrapper} onPress={e => e.stopPropagation()}>
            <View style={styles.modalView}>
              <View style={styles.header}>
                <Text style={styles.modalTitle}>Add New Unit</Text>
                <Pressable onPress={resetAndClose} style={styles.closeButton}>
                  <X size={24} color="#1A1A1A" />
                </Pressable>
              </View>

              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.emojiContainer}>
                  <Text style={styles.sectionLabel}>Select Avatar</Text>
                  <View style={styles.emojiGrid}>
                    {EMOJIS.map(emoji => (
                      <Pressable 
                        key={emoji} 
                        style={[styles.emojiItem, selectedEmoji === emoji && styles.selectedEmojiItem]}
                        onPress={() => setSelectedEmoji(emoji)}
                      >
                        <Text style={styles.emojiText}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.sectionLabel}>EVM Address</Text>
                  <View style={styles.inputWrapper}>
                    <Hash size={20} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="0x..."
                      placeholderTextColor="#94A3B8"
                      value={address}
                      onChangeText={(text) => {
                        setAddress(text);
                        setError(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.sectionLabel}>Unit Name</Text>
                  <View style={styles.inputWrapper}>
                    <Bot size={20} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Delivery Bot"
                      placeholderTextColor="#94A3B8"
                      value={name}
                      onChangeText={(text) => {
                        setName(text);
                        setError(null);
                      }}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.sectionLabel}>Notes (Optional)</Text>
                  <View style={styles.inputWrapper}>
                    <FileText size={20} color="#94A3B8" style={[styles.inputIcon, { marginTop: 12 }]} />
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Purpose or location..."
                      placeholderTextColor="#94A3B8"
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Pressable 
                  style={[styles.confirmButton, isSubmitting && styles.confirmButtonDisabled]} 
                  onPress={handleAdd}
                  disabled={isSubmitting}
                >
                  <Text style={styles.confirmButtonText}>
                    {isSubmitting ? 'Adding...' : 'Add Unit'}
                  </Text>
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
    maxHeight: '90%',
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
    color: '#0F172A',
  },
  closeButton: {
    padding: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  emojiContainer: {
    marginBottom: 24,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emojiItem: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedEmojiItem: {
    backgroundColor: '#F0F9FF',
    borderColor: '#007AFF',
  },
  emojiText: {
    fontSize: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginTop: 14,
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  confirmButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
});
