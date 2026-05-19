import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import AndroidSafeText from './AndroidSafeText';

const Text = Platform.OS === 'android' ? AndroidSafeText : RNText;

function padAndroidText(value: string): string {
  if (!value) return value;
  return Platform.OS === 'android' ? `${value}\u2009` : value;
}

async function ensureAuthHeader(): Promise<void> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

export type InlineServiceCatalogService = {
  id: number;
  title: string;
  price: number | string | null;
  duration_minutes: number;
};

export type InlineServiceCreateResult =
  | { kind: 'adhoc'; title: string; price: number; durationMinutes: number }
  | { kind: 'catalog'; service: InlineServiceCatalogService };

export type ServiceCreateScope = 'job' | 'subscription';

/**
 * Bottom sheet to add a catalog service or an ad-hoc line (same UX as job composer).
 */
export function ServiceCreateSheet({
  visible,
  insets,
  scope,
  onClose,
  onComplete,
}: {
  visible: boolean;
  insets: { bottom: number; top: number };
  scope: ServiceCreateScope;
  onClose: () => void;
  onComplete: (r: InlineServiceCreateResult) => void | Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('60');
  const [saveToAccount, setSaveToAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) return;
    setTitle('');
    setPrice('');
    setDuration('60');
    setSaveToAccount(false);
    setBusy(false);
  }, [visible]);

  const introSub =
    scope === 'subscription'
      ? 'Use for this subscription only, or save to your catalog for reuse on any client.'
      : 'Use for this job only, or save to your catalog for reuse on any client.';

  const switchOffSub =
    scope === 'subscription'
      ? 'Only on this subscription (not saved to catalog).'
      : 'Only on this job (not saved to catalog).';

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      Alert.alert('Name required', 'Enter a service name.');
      return;
    }
    const p = parseFloat(String(price).replace(',', '.'));
    const d = parseInt(String(duration).replace(/\D/g, ''), 10);
    if (!Number.isFinite(p) || p < 0) {
      Alert.alert('Check price', 'Enter a valid price.');
      return;
    }
    if (!Number.isFinite(d) || d < 1) {
      Alert.alert('Check duration', 'Enter duration in minutes (at least 1).');
      return;
    }
    if (saveToAccount) {
      setBusy(true);
      try {
        await ensureAuthHeader();
        const res = await apiClient.post('/services', {
          title: t,
          price: p,
          duration_minutes: d,
        });
        const row = res.data?.service;
        if (!row?.id) {
          Alert.alert('Error', 'Service was not returned.');
          return;
        }
        await Promise.resolve(
          onComplete({
            kind: 'catalog',
            service: {
              id: row.id,
              title: row.title || t,
              price: row.price,
              duration_minutes: Number(row.duration_minutes) || d,
            },
          }),
        );
        onClose();
      } catch (e: any) {
        Alert.alert(
          'Could not save',
          e?.response?.data?.error || e?.message || 'Try again.',
        );
      } finally {
        setBusy(false);
      }
    } else {
      await Promise.resolve(
        onComplete({
          kind: 'adhoc',
          title: t,
          price: p,
          durationMinutes: d,
        }),
      );
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.svcSheetRoot}>
        <TouchableOpacity
          style={styles.svcSheetBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          style={styles.svcSheetKav}
        >
          <View
            style={[
              styles.svcSheetCard,
              { paddingBottom: Math.max(insets.bottom, 16) + 12 },
            ]}
          >
            <View style={styles.svcSheetGrab} />
            <Text style={styles.svcSheetTitle}>
              {padAndroidText('New service')}
            </Text>
            <Text style={styles.svcSheetSub}>{padAndroidText(introSub)}</Text>

            <Text style={styles.svcFieldLbl}>{padAndroidText('Name')}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Window cleaning"
              placeholderTextColor="#94A3B8"
              style={styles.svcFieldInput}
            />

            <View style={styles.svcFieldRow}>
              <View style={styles.svcFieldCol}>
                <Text style={styles.svcFieldLbl}>{padAndroidText('Price')}</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  style={styles.svcFieldInput}
                />
              </View>
              <View style={[styles.svcFieldCol, { marginLeft: 12 }]}>
                <Text style={styles.svcFieldLbl}>
                  {padAndroidText('Duration (min)')}
                </Text>
                <TextInput
                  value={duration}
                  onChangeText={(x) => setDuration(x.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor="#94A3B8"
                  style={styles.svcFieldInput}
                />
              </View>
            </View>

            <View style={styles.svcSwitchRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.svcSwitchTitle}>
                  {padAndroidText('Save to account')}
                </Text>
                <Text style={styles.svcSwitchSub}>
                  {padAndroidText(
                    saveToAccount
                      ? 'Added to your standard service list.'
                      : switchOffSub,
                  )}
                </Text>
              </View>
              <Switch
                value={saveToAccount}
                onValueChange={setSaveToAccount}
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={saveToAccount ? '#166534' : '#f4f3f4'}
              />
            </View>

            <View style={styles.svcSheetActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                onPress={onClose}
                disabled={busy}
              >
                <Text style={styles.btnGhostText}>{padAndroidText('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                onPress={() => void submit()}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    {padAndroidText('Add service')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  svcSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  svcSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  svcSheetKav: {
    width: '100%',
    maxHeight: '88%',
  },
  svcSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  svcSheetGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginBottom: 12,
  },
  svcSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#193434',
  },
  svcSheetSub: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  svcFieldLbl: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  svcFieldInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 14,
  },
  svcFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  svcFieldCol: {
    flex: 1,
    minWidth: 0,
  },
  svcSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  svcSwitchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
  },
  svcSwitchSub: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  svcSheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  btn: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  btnPrimary: { backgroundColor: '#193434' },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  btnGhost: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnGhostText: { color: '#193434', fontWeight: '700', fontSize: 15 },
});
