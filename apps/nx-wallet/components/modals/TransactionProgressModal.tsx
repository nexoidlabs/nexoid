import { CheckCircle2, Circle, ExternalLink, X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type TransactionStepStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface TransactionStep {
  id: string;
  label: string;
  status: TransactionStepStatus;
  description?: string;
}

interface TransactionProgressModalProps {
  visible: boolean;
  onClose: () => void;
  steps: TransactionStep[];
  title?: string;
  txHash?: string;
  onViewOnExplorer?: (hash: string) => void;
}

export function TransactionProgressModal({
  visible,
  onClose,
  steps,
  title = 'Processing Transaction',
  txHash,
  onViewOnExplorer
}: TransactionProgressModalProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(100);
    }
  }, [visible]);

  const allCompleted = steps.every(s => s.status === 'completed');
  const hasError = steps.some(s => s.status === 'error');

  const renderStepIcon = (status: TransactionStepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={24} color="#4ADE80" />;
      case 'processing':
        return <ActivityIndicator size="small" color="#3B82F6" />;
      case 'error':
        return <X size={24} color="#EF4444" />;
      default:
        return <Circle size={24} color="#CBD5E1" />;
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={hasError || allCompleted ? onClose : undefined}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        <Animated.View 
          style={[
            styles.container, 
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }] 
            }
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {(allCompleted || hasError) && (
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.stepsContainer}>
            {steps.map((step, index) => (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.iconColumn}>
                  {renderStepIcon(step.status)}
                  {index < steps.length - 1 && (
                    <View 
                      style={[
                        styles.connector, 
                        step.status === 'completed' && styles.connectorCompleted
                      ]} 
                    />
                  )}
                </View>
                <View style={styles.textColumn}>
                  <Text 
                    style={[
                      styles.stepLabel, 
                      step.status === 'processing' && styles.stepLabelActive,
                      step.status === 'completed' && styles.stepLabelCompleted
                    ]}
                  >
                    {step.label}
                  </Text>
                  {step.description && (
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {txHash && (
            <TouchableOpacity 
              style={styles.explorerButton}
              onPress={() => onViewOnExplorer?.(txHash)}
            >
              <ExternalLink size={16} color="#3B82F6" />
              <Text style={styles.explorerText}>View on Explorer</Text>
            </TouchableOpacity>
          )}

          {allCompleted && (
            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}

          {hasError && (
            <TouchableOpacity style={[styles.doneButton, styles.errorButton]} onPress={onClose}>
              <Text style={styles.doneButtonText}>Dismiss</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  stepsContainer: {
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 60,
  },
  iconColumn: {
    alignItems: 'center',
    marginRight: 16,
    width: 24,
  },
  connector: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  connectorCompleted: {
    backgroundColor: '#4ADE80',
  },
  textColumn: {
    flex: 1,
    paddingTop: 2,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  stepLabelActive: {
    color: '#3B82F6',
  },
  stepLabelCompleted: {
    color: '#0F172A',
  },
  stepDescription: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 12,
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    marginBottom: 16,
    marginTop: 8,
  },
  explorerText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  errorButton: {
    backgroundColor: '#EF4444',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
