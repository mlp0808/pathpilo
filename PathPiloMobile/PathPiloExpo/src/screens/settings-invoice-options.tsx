import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { apiClient } from '../api/client';
import AndroidSafeText from '../components/AndroidSafeText';
import { androidTextFix, padAndroidText } from '../ui/androidText';

const Text = Platform.OS === 'android' ? AndroidSafeText : RNText;

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SNAPPY = {
  duration: 220,
  update: { type: 'spring', springDamping: 0.85 },
} as const;

async function ensureAuthHeader(): Promise<void> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

type InvoiceDefaultsForm = {
  invoiceDefaultDueDays: number;
  invoiceDefaultPaymentTerms: string;
  invoiceNextNumber: number;
  maxNumericInvoice: number;
  invoiceNumberingConfigured: boolean;
};

type BankConfig = {
  accountHolder?: string;
  iban?: string;
  accountNumber?: string;
  registrationNumber?: string;
};

type IntegrationRow = {
  provider: string;
  title: string;
  description: string;
  enabled: boolean;
  capabilities: unknown;
  config: BankConfig;
};

function isAdminRole(company: any): boolean {
  const r = String(company?.user_role || '').toLowerCase();
  // Some tokens / company payloads use broader admin-like labels.
  // Treat only explicit employee role as read-only on mobile settings.
  return r !== 'employee';
}

function hasInvoicePaymentCapability(row: IntegrationRow): boolean {
  const c = row.capabilities;
  return Array.isArray(c) && c.includes('invoice_payment');
}

function ChevronLeftIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M15 18l-6-6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function MobileInvoiceOptionsSettingsScreen(props: any) {
  const { route, navigation } = props;
  const { company } = route.params || {};
  const insets = useSafeAreaInsets();
  const canEdit = isAdminRole(company);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [paymentLoadError, setPaymentLoadError] = useState('');

  const [form, setForm] = useState<InvoiceDefaultsForm>({
    invoiceDefaultDueDays: 30,
    invoiceDefaultPaymentTerms: '',
    invoiceNextNumber: 1,
    maxNumericInvoice: 0,
    invoiceNumberingConfigured: false,
  });

  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSavedFlash, setDefaultsSavedFlash] = useState(false);

  const [bankEnabled, setBankEnabled] = useState(false);
  const [bankConfig, setBankConfig] = useState<BankConfig>({});
  const [serverBankEnabled, setServerBankEnabled] = useState(false);
  const [serverBankConfig, setServerBankConfig] = useState<BankConfig>({});
  const [bankExpanded, setBankExpanded] = useState(true);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSavedFlash, setBankSavedFlash] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    setPaymentLoadError('');
    setLoading(true);
    try {
      await ensureAuthHeader();
    } catch {
      setLoadError('Could not read session');
      setLoading(false);
      return;
    }

    try {
      const defsRes = await apiClient.get('/companies/invoice-defaults');
      const d = defsRes.data?.defaults;
      if (d) {
        const nextNumber = d.invoiceNextNumber ?? 1;
        const maxIssued = d.maxNumericInvoice ?? 0;
        const realityConfigured =
          Number(nextNumber) > 1 || Number(maxIssued) > 0;
        const configured =
          realityConfigured
            ? true
            : typeof d.invoiceNumberingConfigured === 'boolean'
              ? d.invoiceNumberingConfigured
              : false;
        setForm({
          invoiceDefaultDueDays: d.invoiceDefaultDueDays ?? 30,
          invoiceDefaultPaymentTerms: d.invoiceDefaultPaymentTerms ?? '',
          invoiceNextNumber: Math.max(1, Number(nextNumber) || 1),
          maxNumericInvoice: Number(maxIssued) || 0,
          invoiceNumberingConfigured: configured,
        });
      } else {
        setLoadError('No invoice defaults returned');
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || 'Failed to load invoice defaults';
      setLoadError(String(msg));
    }

    try {
      const intRes = await apiClient.get('/integrations');
      const all: IntegrationRow[] = Array.isArray(intRes.data?.integrations)
        ? intRes.data.integrations
        : [];
      const bank = all.find(
        (r) => r.provider === 'bank_transfer' && hasInvoicePaymentCapability(r),
      );
      if (bank) {
        const cfg = (bank.config || {}) as BankConfig;
        setBankEnabled(Boolean(bank.enabled));
        setBankConfig({ ...cfg });
        setServerBankEnabled(Boolean(bank.enabled));
        setServerBankConfig({ ...cfg });
        setBankExpanded(Boolean(bank.enabled));
      } else {
        setBankEnabled(false);
        setBankConfig({});
        setServerBankEnabled(false);
        setServerBankConfig({});
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || 'Failed to load payment options';
      setPaymentLoadError(String(msg));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canEnableBank = useMemo(() => {
    const h = String(bankConfig.accountHolder || '').trim();
    const ib = String(bankConfig.iban || '').trim();
    return Boolean(h && ib);
  }, [bankConfig]);

  const bankDirty = useMemo(() => {
    if (bankEnabled !== serverBankEnabled) return true;
    return (
      JSON.stringify(bankConfig || {}) !== JSON.stringify(serverBankConfig || {})
    );
  }, [bankEnabled, serverBankEnabled, bankConfig, serverBankConfig]);

  const saveDefaults = async () => {
    if (!canEdit || defaultsSaving) return;
    setDefaultsSaving(true);
    setDefaultsSavedFlash(false);
    try {
      await ensureAuthHeader();
      const res = await apiClient.put('/companies/invoice-defaults', {
        invoiceDefaultDueDays: form.invoiceDefaultDueDays,
        invoiceDefaultPaymentTerms: form.invoiceDefaultPaymentTerms,
        invoiceNextNumber: form.invoiceNextNumber,
      });
      const d = res.data?.defaults;
      if (d) {
        const nextNumber = d.invoiceNextNumber ?? 1;
        const maxIssued = d.maxNumericInvoice ?? 0;
        const realityConfigured =
          Number(nextNumber) > 1 || Number(maxIssued) > 0;
        const configured =
          realityConfigured
            ? true
            : Boolean(d.invoiceNumberingConfigured);
        setForm({
          invoiceDefaultDueDays: d.invoiceDefaultDueDays ?? 30,
          invoiceDefaultPaymentTerms: d.invoiceDefaultPaymentTerms ?? '',
          invoiceNextNumber: Math.max(1, Number(nextNumber) || 1),
          maxNumericInvoice: Number(maxIssued) || 0,
          invoiceNumberingConfigured: configured,
        });
      } else {
        setForm((prev) => ({ ...prev, invoiceNumberingConfigured: true }));
      }
      setDefaultsSavedFlash(true);
      setTimeout(() => setDefaultsSavedFlash(false), 2000);
    } catch (e: any) {
      Alert.alert(
        'Could not save',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
    } finally {
      setDefaultsSaving(false);
    }
  };

  const saveBank = async () => {
    if (!canEdit || bankSaving) return;
    if (bankEnabled && !canEnableBank) {
      Alert.alert(
        'Bank transfer',
        'Fill account holder and IBAN before enabling bank transfer on invoices.',
      );
      return;
    }
    setBankSaving(true);
    setBankSavedFlash(false);
    try {
      await ensureAuthHeader();
      const res = await apiClient.put('/integrations/bank_transfer/config', {
        enabled: bankEnabled,
        config: {
          accountHolder: bankConfig.accountHolder,
          iban: bankConfig.iban,
          accountNumber: bankConfig.accountNumber,
          registrationNumber: bankConfig.registrationNumber,
        },
      });
      const int = res.data?.integration;
      if (int) {
        setBankEnabled(Boolean(int.enabled));
        setBankConfig({ ...(int.config || {}) });
        setServerBankEnabled(Boolean(int.enabled));
        setServerBankConfig({ ...(int.config || {}) });
      }
      setBankSavedFlash(true);
      setTimeout(() => setBankSavedFlash(false), 2000);
    } catch (e: any) {
      Alert.alert(
        'Could not save',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
    } finally {
      setBankSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeftIcon />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.titleText}>{padAndroidText('Invoice options')}</Text>
          <Text style={styles.subtitleText} numberOfLines={2}>
            {padAndroidText(
              'Numbering, due dates, payment terms, and bank details on invoices.',
            )}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#193434" />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.err}>{padAndroidText(loadError)}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Text style={styles.retryTxt}>{padAndroidText('Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: 100 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!canEdit ? (
              <View style={styles.readOnlyBanner}>
                <Text style={styles.readOnlyText}>
                  {padAndroidText(
                    'Only owners and admins can edit invoice settings.',
                  )}
                </Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {padAndroidText('Next invoice number')}
              </Text>
              <Text style={styles.sectionHint}>
                {padAndroidText(
                  'First number for new invoices; later ones count up from here.',
                )}
              </Text>
              {!form.invoiceNumberingConfigured ? (
                <View style={styles.warnBox}>
                  <Text style={styles.warnText}>
                    {padAndroidText(
                      'Save a starting invoice number before creating invoices. If you are migrating, set it above your highest existing number.',
                    )}
                  </Text>
                </View>
              ) : null}
              {form.maxNumericInvoice > 0 ? (
                <View style={styles.amberBox}>
                  <Text style={styles.amberText}>
                    {padAndroidText(
                      `Highest numeric invoice in use: ${form.maxNumericInvoice}. Avoid choosing a lower next number.`,
                    )}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.fieldLbl}>{padAndroidText('Next number')}</Text>
              <TextInput
                value={String(form.invoiceNextNumber)}
                onChangeText={(t) => {
                  if (!canEdit) return;
                  const n = Math.max(1, parseInt(t.replace(/\D/g, '') || '1', 10));
                  setForm((f) => ({ ...f, invoiceNextNumber: n }));
                }}
                editable={canEdit}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {padAndroidText('Default due date')}
              </Text>
              <Text style={styles.sectionHint}>
                {padAndroidText('Days after the invoice date until payment is due.')}
              </Text>
              <Text style={styles.fieldLbl}>{padAndroidText('Days')}</Text>
              <TextInput
                value={String(form.invoiceDefaultDueDays)}
                onChangeText={(t) => {
                  if (!canEdit) return;
                  const n = Math.min(
                    3650,
                    Math.max(1, parseInt(t.replace(/\D/g, '') || '30', 10)),
                  );
                  setForm((f) => ({ ...f, invoiceDefaultDueDays: n }));
                }}
                editable={canEdit}
                keyboardType="number-pad"
                style={styles.inputNarrow}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {padAndroidText('Default payment terms')}
              </Text>
              <Text style={styles.sectionHint}>
                {padAndroidText(
                  'Shown on every invoice. Placeholders: {due_date}, {invoice_date}, {invoice_number}, {overdue_days}',
                )}
              </Text>
              <TextInput
                value={form.invoiceDefaultPaymentTerms}
                onChangeText={(t) => {
                  if (!canEdit) return;
                  setForm((f) => ({ ...f, invoiceDefaultPaymentTerms: t }));
                }}
                editable={canEdit}
                multiline
                textAlignVertical="top"
                placeholder="e.g. Payment due by {due_date}."
                placeholderTextColor="#94A3B8"
                style={styles.textarea}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {padAndroidText('Payment options')}
              </Text>
              <Text style={styles.sectionHint}>
                {padAndroidText(
                  'When enabled, bank details appear on invoices for clients to pay you.',
                )}
              </Text>
              {paymentLoadError ? (
                <Text style={styles.miniErr}>{padAndroidText(paymentLoadError)}</Text>
              ) : null}

              <View
                style={[
                  styles.bankShell,
                  bankEnabled ? styles.bankShellOn : styles.bankShellOff,
                ]}
              >
                <View style={styles.bankHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.bankTitle}>
                      {padAndroidText('Bank transfer')}
                    </Text>
                    <Text style={styles.bankSub} numberOfLines={2}>
                      {padAndroidText(
                        'Manual transfer using your IBAN and account details.',
                      )}
                    </Text>
                  </View>
                  <Switch
                    value={bankEnabled}
                    onValueChange={(v) => {
                      if (!canEdit) return;
                      LayoutAnimation.configureNext(SNAPPY);
                      setBankEnabled(v);
                      if (v) setBankExpanded(true);
                    }}
                    disabled={!canEdit}
                    trackColor={{ false: '#CBD5E1', true: '#94CFB7' }}
                    thumbColor={bankEnabled ? '#193434' : '#F1F5F9'}
                  />
                </View>

                <TouchableOpacity
                  onPress={() => {
                    LayoutAnimation.configureNext(SNAPPY);
                    setBankExpanded((e) => !e);
                  }}
                  style={styles.expandBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.expandBtnTxt}>
                    {padAndroidText(bankExpanded ? 'Hide details' : 'Show details')}
                  </Text>
                </TouchableOpacity>

                {bankExpanded ? (
                  <View style={styles.bankBody}>
                    <Text style={styles.fieldLbl}>
                      {padAndroidText('Account holder *')}
                    </Text>
                    <TextInput
                      value={String(bankConfig.accountHolder || '')}
                      onChangeText={(t) =>
                        setBankConfig((c) => ({ ...c, accountHolder: t }))
                      }
                      editable={canEdit}
                      autoCapitalize="words"
                      style={styles.input}
                    />
                    <Text style={styles.fieldLbl}>{padAndroidText('IBAN *')}</Text>
                    <TextInput
                      value={String(bankConfig.iban || '')}
                      onChangeText={(t) =>
                        setBankConfig((c) => ({ ...c, iban: t }))
                      }
                      editable={canEdit}
                      autoCapitalize="characters"
                      style={styles.input}
                    />
                    <Text style={styles.fieldLbl}>
                      {padAndroidText('Registration number')}
                    </Text>
                    <TextInput
                      value={String(bankConfig.registrationNumber || '')}
                      onChangeText={(t) =>
                        setBankConfig((c) => ({ ...c, registrationNumber: t }))
                      }
                      editable={canEdit}
                      style={styles.input}
                    />
                    <Text style={styles.fieldLbl}>
                      {padAndroidText('Account number')}
                    </Text>
                    <TextInput
                      value={String(bankConfig.accountNumber || '')}
                      onChangeText={(t) =>
                        setBankConfig((c) => ({ ...c, accountNumber: t }))
                      }
                      editable={canEdit}
                      style={styles.input}
                    />
                    {bankEnabled && !canEnableBank ? (
                      <View style={styles.amberBox}>
                        <Text style={styles.amberText}>
                          {padAndroidText(
                            'Fill account holder and IBAN to show bank transfer on invoices.',
                          )}
                        </Text>
                      </View>
                    ) : null}

                    {canEdit ? (
                      <TouchableOpacity
                        style={[
                          styles.secondaryBtn,
                          (!bankDirty || bankSaving) && styles.secondaryBtnOff,
                        ]}
                        onPress={saveBank}
                        disabled={!bankDirty || bankSaving}
                        activeOpacity={0.88}
                      >
                        {bankSaving ? (
                          <ActivityIndicator color="#193434" />
                        ) : (
                          <RNText style={styles.secondaryBtnTxt}>
                            {padAndroidText(
                              bankSavedFlash
                                ? 'Saved ✓'
                                : bankDirty
                                  ? 'Save payment details'
                                  : 'Up to date',
                            )}
                          </RNText>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          </ScrollView>

          {canEdit ? (
            <View
              style={[
                styles.stickyBar,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <TouchableOpacity
                style={[styles.saveBtn, defaultsSaving && styles.saveBtnOff]}
                onPress={saveDefaults}
                disabled={defaultsSaving}
                activeOpacity={0.88}
              >
                {defaultsSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <RNText style={styles.saveBtnTxt}>
                    {padAndroidText(
                      defaultsSavedFlash ? 'Saved ✓' : 'Save invoice settings',
                    )}
                  </RNText>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F9F7' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  titleWrap: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  titleText: { fontSize: 17, fontWeight: '800', color: '#193434' },
  subtitleText: { marginTop: 4, fontSize: 12, color: '#64748B', lineHeight: 17 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  err: { color: '#B91C1C', textAlign: 'center', fontSize: 15 },
  retry: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#193434',
    borderRadius: 12,
  },
  retryTxt: { color: '#FFFFFF', fontWeight: '700' },
  readOnlyBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  readOnlyText: { fontSize: 13, color: '#92400E', lineHeight: 18 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#193434' },
  sectionHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 12,
  },
  fieldLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '600',
    color: '#193434',
    backgroundColor: '#FAFAFA',
    marginBottom: 12,
  },
  inputNarrow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '600',
    color: '#193434',
    backgroundColor: '#FAFAFA',
    width: 120,
    marginBottom: 4,
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: '500',
    color: '#193434',
    backgroundColor: '#FAFAFA',
    minHeight: 120,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  warnBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  warnText: { fontSize: 12, color: '#991B1B', lineHeight: 17 },
  amberBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  amberText: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  miniErr: { fontSize: 12, color: '#B91C1C', marginBottom: 8 },
  bankShell: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  bankShellOn: {
    borderColor: '#94CFB7',
    backgroundColor: '#F0FDF4',
  },
  bankShellOff: {
    borderColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bankTitle: { fontSize: 15, fontWeight: '800', color: '#193434' },
  bankSub: { marginTop: 2, fontSize: 12, color: '#64748B', lineHeight: 16 },
  expandBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  expandBtnTxt: { fontSize: 13, fontWeight: '800', color: '#0F766E' },
  bankBody: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  secondaryBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#193434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnOff: { opacity: 0.45 },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E7ECE9',
  },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#193434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnOff: { opacity: 0.7 },
  saveBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    ...androidTextFix,
  },
  secondaryBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
    ...androidTextFix,
  },
});
