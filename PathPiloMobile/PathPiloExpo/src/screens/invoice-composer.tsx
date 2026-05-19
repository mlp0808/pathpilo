import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
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

const Text = Platform.OS === 'android' ? AndroidSafeText : RNText;

function padAndroidText(value: string): string {
  if (!value) return value;
  return Platform.OS === 'android' ? `${value}\u2009` : value;
}

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

const SCREEN_WIDTH = Dimensions.get('window').width;

async function ensureAuthHeader(): Promise<void> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'DKK',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || 'DKK'}`;
  }
}

function fmtDate(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// --- icons ----------------------------------------------------------------

function BackIcon({ color = '#193434' }: { color?: string }) {
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

function CloseIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M6 6l12 12M6 18L18 6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CheckIcon({ color = '#FFFFFF' }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ChevronIcon({ open, color = '#94A3B8' }: { open?: boolean; color?: string }) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
    >
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// --- types ----------------------------------------------------------------

type ClientLite = {
  id: number;
  name: string | null;
  last_name: string | null;
  email?: string | null;
  phone?: string | null;
};

type CompletedJob = {
  id: number;
  title: string | null;
  client_id: number | null;
  status?: string;
  invoice_id?: number | null;
  total_price?: number | string | null;
  service_count?: number | string;
  updated_at?: string | null;
  created_at?: string | null;
  scheduled_date?: string | null;
};

type PaymentOption = {
  provider: string;
  title: string;
  description: string;
};

type Step = 'client' | 'jobs' | 'details';

function clientFullName(c: ClientLite | null | undefined): string {
  if (!c) return '—';
  return [c.name, c.last_name].filter(Boolean).join(' ').trim() || '—';
}

// =========================================================================
// Composer screen
// =========================================================================

export function MobileInvoiceComposerScreen(props: any) {
  const { route, navigation } = props;
  const { company, user, presetClientId } = route.params || {};
  const insets = useSafeAreaInsets();

  // ── Step state ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(presetClientId ? 'jobs' : 'client');
  const stepX = useRef(new Animated.Value(0)).current;

  const goToStep = useCallback(
    (next: Step, direction: 'forward' | 'back' = 'forward') => {
      const startFrom = direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH;
      stepX.setValue(startFrom);
      setStep(next);
      Animated.spring(stepX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 180,
        mass: 0.7,
      }).start();
    },
    [stepX],
  );

  const tryClose = () => {
    if (submitting) return;
    if (step !== 'client' || selectedClientId != null || selectedJobIds.size > 0) {
      Alert.alert(
        'Discard invoice?',
        'You will lose your progress.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } else {
      navigation.goBack();
    }
  };

  // ── Client picker ────────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(
    typeof presetClientId === 'number' ? presetClientId : null,
  );

  // ── Completed jobs ───────────────────────────────────────────────────────
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState('');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [jobDiscounts, setJobDiscounts] = useState<Record<string, number>>({});

  // ── Form / defaults ──────────────────────────────────────────────────────
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [numberingConfigured, setNumberingConfigured] = useState(true);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [paymentMethodOn, setPaymentMethodOn] = useState<Record<string, boolean>>({});

  const [title, setTitle] = useState('Invoice');
  const [issueDate, setIssueDate] = useState<string>(ymd(new Date()));
  const [dueDays, setDueDays] = useState<number>(30);
  const [taxRate, setTaxRate] = useState<number>(25);
  const [currency, setCurrency] = useState<string>('DKK');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [description, setDescription] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // --- data loading ------------------------------------------------------

  const loadClients = useCallback(async () => {
    setClientsError('');
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/clients');
      setClients(res.data?.clients || []);
    } catch (e: any) {
      setClientsError(
        e?.response?.data?.error || e?.message || 'Failed to load clients',
      );
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, []);

  const loadCompletedJobs = useCallback(async () => {
    setJobsError('');
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/jobs', {
        params: { status: 'completed' },
      });
      setCompletedJobs(res.data?.jobs || []);
    } catch (e: any) {
      setJobsError(
        e?.response?.data?.error || e?.message || 'Failed to load jobs',
      );
      setCompletedJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadDefaults = useCallback(async () => {
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/companies/invoice-defaults');
      const d = res.data?.defaults;
      if (d) {
        const savedTerms =
          typeof d.invoiceDefaultPaymentTerms === 'string'
            ? d.invoiceDefaultPaymentTerms.trim()
            : '';
        if (savedTerms) setPaymentTerms((prev) => (prev ? prev : savedTerms));
        const due = Number(d.invoiceDefaultDueDays);
        if (Number.isFinite(due) && due >= 0) setDueDays(due);
        const nextNumber = Number(d.invoiceNextNumber) || 0;
        const maxIssued = Number(d.maxNumericInvoice) || 0;
        const realityConfigured = nextNumber > 1 || maxIssued > 0;
        const configured = realityConfigured
          ? true
          : typeof d.invoiceNumberingConfigured === 'boolean'
            ? d.invoiceNumberingConfigured
            : nextNumber === 0;
        setNumberingConfigured(configured);
      }
    } catch {
      /* optional */
    } finally {
      setDefaultsLoaded(true);
    }
  }, []);

  const loadPaymentOptions = useCallback(async () => {
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/integrations');
      const all = Array.isArray(res.data?.integrations)
        ? res.data.integrations
        : [];
      const active: PaymentOption[] = all
        .filter(
          (opt: any) =>
            opt?.enabled === true &&
            Array.isArray(opt?.capabilities) &&
            opt.capabilities.includes('invoice_payment'),
        )
        .map((opt: any) => ({
          provider: String(opt.provider),
          title: opt.title || opt.provider,
          description: opt.description || '',
        }));
      setPaymentOptions(active);
      setPaymentMethodOn(
        active.reduce<Record<string, boolean>>((acc, opt) => {
          acc[opt.provider] = true;
          return acc;
        }, {}),
      );
    } catch {
      setPaymentOptions([]);
    } finally {
      setPaymentLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadClients();
    loadCompletedJobs();
    loadDefaults();
    loadPaymentOptions();
  }, [loadClients, loadCompletedJobs, loadDefaults, loadPaymentOptions]);

  // Apply company country currency on first defaults load if needed.
  useEffect(() => {
    const cc = (company?.country_code || company?.countryCode || 'DK') as string;
    if (cc === 'SE') setCurrency('SEK');
    else if (cc === 'NO') setCurrency('NOK');
    else if (cc === 'DE' || cc === 'FR' || cc === 'NL' || cc === 'ES') {
      setCurrency('EUR');
    } else if (cc === 'GB') setCurrency('GBP');
    else if (cc === 'US') setCurrency('USD');
    else setCurrency('DKK');
    if (cc === 'GB') setTaxRate(20);
    else if (cc === 'US') setTaxRate(0);
    else setTaxRate(25);
  }, [company]);

  // --- derived data ------------------------------------------------------

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const full = clientFullName(c).toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return full.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [clients, clientSearch]);

  const invoiceableCountByClient = useMemo(() => {
    const map = new Map<number, number>();
    for (const j of completedJobs) {
      if (j.invoice_id) continue;
      if (j.status !== 'completed' && j.status !== 'sub_completed') continue;
      if (j.client_id == null) continue;
      map.set(j.client_id, (map.get(j.client_id) || 0) + 1);
    }
    return map;
  }, [completedJobs]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId],
  );

  const clientInvoiceableJobs = useMemo(() => {
    if (selectedClientId == null) return [] as CompletedJob[];
    return completedJobs
      .filter((j) => j.client_id === selectedClientId)
      .filter((j) => !j.invoice_id)
      .filter((j) => j.status === 'completed' || j.status === 'sub_completed');
  }, [completedJobs, selectedClientId]);

  const selectedJobs = useMemo(
    () => clientInvoiceableJobs.filter((j) => selectedJobIds.has(j.id)),
    [clientInvoiceableJobs, selectedJobIds],
  );

  const subtotal = useMemo(() => {
    return selectedJobs.reduce((sum, job) => {
      const discount = jobDiscounts[String(job.id)] ?? 0;
      const total = Number(job.total_price) || 0;
      return sum + Math.max(0, total - discount);
    }, 0);
  }, [selectedJobs, jobDiscounts]);

  const taxAmount = useMemo(() => subtotal * (taxRate / 100), [subtotal, taxRate]);
  const grandTotal = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount]);

  const dueDate = useMemo(() => {
    const d = new Date(issueDate);
    if (Number.isNaN(d.getTime())) return issueDate;
    d.setDate(d.getDate() + dueDays);
    return ymd(d);
  }, [issueDate, dueDays]);

  const enabledMethodsForSubmit = useMemo(
    () =>
      paymentOptions
        .filter((opt) => paymentMethodOn[opt.provider])
        .map((opt) => opt.provider),
    [paymentOptions, paymentMethodOn],
  );

  // --- handlers ---------------------------------------------------------

  const pickClient = (id: number) => {
    setSelectedClientId(id);
    setSelectedJobIds(new Set());
    setJobDiscounts({});
    setClientSearch('');
    goToStep('jobs', 'forward');
  };

  const toggleJob = (id: number) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePaymentMethod = (provider: string) => {
    setPaymentMethodOn((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const setDiscount = (jobId: number, value: number) => {
    setJobDiscounts((prev) => ({
      ...prev,
      [String(jobId)]: Math.max(0, value),
    }));
  };

  const onContinueFromJobs = () => {
    if (selectedJobs.length === 0) {
      Alert.alert(
        'Pick at least one job',
        'Add a completed job to continue.',
      );
      return;
    }
    goToStep('details', 'forward');
  };

  const submit = async () => {
    if (!selectedClientId) return;
    if (selectedJobs.length === 0) return;
    if (!numberingConfigured) {
      Alert.alert(
        'Set up invoice numbering',
        'Configure your invoice number start in Settings → Invoice options on the web before creating an invoice.',
      );
      return;
    }
    if (paymentOptions.length === 0) {
      Alert.alert(
        'No payment options',
        'Activate at least one payment option in Settings → Invoice options before creating an invoice.',
      );
      return;
    }
    if (enabledMethodsForSubmit.length === 0) {
      Alert.alert(
        'Pick a payment option',
        'Enable at least one payment option for this invoice.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await ensureAuthHeader();
      const payload = {
        job_ids: selectedJobs.map((j) => j.id),
        title: (title || 'Invoice').slice(0, 30),
        issue_date: issueDate,
        due_date: dueDate,
        due_days: dueDays,
        tax_rate: taxRate,
        currency,
        payment_terms: paymentTerms,
        notes: '',
        description: description.trim(),
        reference_text: referenceText.trim(),
        discounts: jobDiscounts,
        enabled_payment_methods: enabledMethodsForSubmit,
      };
      const res = await apiClient.post(
        `/clients/${selectedClientId}/invoices`,
        payload,
      );
      const newId = res?.data?.invoice?.id;
      if (newId) {
        // Replace the composer so back goes to the invoices list, not back into the form.
        navigation.replace('InvoiceDetail', {
          invoiceId: newId,
          company,
          user,
        });
      } else {
        Alert.alert('Created', 'Invoice was created.');
        navigation.goBack();
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        'Could not create the invoice. Please try again.';
      Alert.alert('Could not create', msg);
    } finally {
      setSubmitting(false);
    }
  };

  // --- render -----------------------------------------------------------

  const stepIdx = step === 'client' ? 0 : step === 'jobs' ? 1 : 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={tryClose}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <CloseIcon />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.titleText}>{padAndroidText('New invoice')}</Text>
          {selectedClient ? (
            <Text style={styles.subtitleText} numberOfLines={1}>
              {padAndroidText(clientFullName(selectedClient))}
            </Text>
          ) : null}
        </View>
        <View style={styles.iconBtn} />
      </View>

      <Stepper step={stepIdx} />

      <Animated.View
        style={[
          styles.stepContainer,
          { transform: [{ translateX: stepX }] },
        ]}
      >
        {step === 'client' ? (
          <ClientStep
            clients={filteredClients}
            countByClient={invoiceableCountByClient}
            loading={clientsLoading}
            error={clientsError}
            search={clientSearch}
            onSearch={setClientSearch}
            onPick={pickClient}
            onRetry={() => {
              setClientsLoading(true);
              loadClients();
            }}
            insets={insets}
          />
        ) : null}

        {step === 'jobs' ? (
          <JobsStep
            client={selectedClient}
            jobs={clientInvoiceableJobs}
            selected={selectedJobIds}
            discounts={jobDiscounts}
            currency={currency}
            loading={jobsLoading}
            error={jobsError}
            onToggle={toggleJob}
            onSetDiscount={setDiscount}
            onChangeClient={() => goToStep('client', 'back')}
            onRetry={() => {
              setJobsLoading(true);
              loadCompletedJobs();
            }}
            insets={insets}
          />
        ) : null}

        {step === 'details' ? (
          <DetailsStep
            currency={currency}
            title={title}
            issueDate={issueDate}
            dueDays={dueDays}
            dueDate={dueDate}
            taxRate={taxRate}
            paymentTerms={paymentTerms}
            description={description}
            referenceText={referenceText}
            paymentOptions={paymentOptions}
            paymentLoaded={paymentLoaded}
            paymentMethodOn={paymentMethodOn}
            advancedOpen={advancedOpen}
            onTitle={setTitle}
            onIssueDate={setIssueDate}
            onDueDays={setDueDays}
            onTaxRate={setTaxRate}
            onPaymentTerms={setPaymentTerms}
            onDescription={setDescription}
            onReferenceText={setReferenceText}
            onTogglePaymentMethod={togglePaymentMethod}
            onToggleAdvanced={() => {
              LayoutAnimation.configureNext(SNAPPY);
              setAdvancedOpen((v) => !v);
            }}
            selectedJobs={selectedJobs}
            jobDiscounts={jobDiscounts}
            onSetDiscount={setDiscount}
            subtotal={subtotal}
            taxAmount={taxAmount}
            grandTotal={grandTotal}
            insets={insets}
            numberingConfigured={numberingConfigured}
          />
        ) : null}
      </Animated.View>

      {/* Sticky action bar */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {step === 'jobs' ? (
          <TouchableOpacity
            onPress={() => goToStep('client', 'back')}
            style={[styles.btn, styles.btnGhost]}
            activeOpacity={0.85}
            disabled={submitting}
          >
            <Text style={styles.btnGhostText}>{padAndroidText('Back')}</Text>
          </TouchableOpacity>
        ) : null}

        {step === 'details' ? (
          <TouchableOpacity
            onPress={() => goToStep('jobs', 'back')}
            style={[styles.btn, styles.btnGhost]}
            activeOpacity={0.85}
            disabled={submitting}
          >
            <Text style={styles.btnGhostText}>{padAndroidText('Back')}</Text>
          </TouchableOpacity>
        ) : null}

        {step === 'client' ? (
          <View style={styles.actionBarSpacer}>
            <Text style={styles.actionBarHint} numberOfLines={1}>
              {padAndroidText('Pick a client to continue')}
            </Text>
          </View>
        ) : step === 'jobs' ? (
          <TouchableOpacity
            onPress={onContinueFromJobs}
            style={[
              styles.btn,
              styles.btnPrimary,
              selectedJobs.length === 0 && styles.btnDisabled,
            ]}
            activeOpacity={0.85}
            disabled={selectedJobs.length === 0}
          >
            <Text style={styles.btnPrimaryText}>
              {padAndroidText(
                selectedJobs.length === 0
                  ? 'Pick a job'
                  : `Continue · ${fmtMoney(subtotal, currency)}`,
              )}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={submit}
            style={[
              styles.btn,
              styles.btnPrimary,
              submitting && { opacity: 0.7 },
            ]}
            activeOpacity={0.85}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.btnPrimaryText}>
                {padAndroidText(`Create · ${fmtMoney(grandTotal, currency)}`)}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// =========================================================================
// Stepper
// =========================================================================

function Stepper({ step }: { step: number }) {
  const labels = ['Client', 'Jobs', 'Details'];
  return (
    <View style={styles.stepperWrap}>
      {labels.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <React.Fragment key={label}>
            <View style={styles.stepNode}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}
              >
                {done ? (
                  <CheckIcon />
                ) : (
                  <Text
                    style={[
                      styles.stepDotText,
                      active && styles.stepDotTextActive,
                    ]}
                  >
                    {padAndroidText(String(i + 1))}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  active && styles.stepLabelActive,
                  done && styles.stepLabelDone,
                ]}
                numberOfLines={1}
              >
                {padAndroidText(label)}
              </Text>
            </View>
            {i < labels.length - 1 ? (
              <View
                style={[
                  styles.stepLine,
                  i < step && styles.stepLineDone,
                ]}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// =========================================================================
// Step 1 · Client
// =========================================================================

function ClientStep({
  clients,
  countByClient,
  loading,
  error,
  search,
  onSearch,
  onPick,
  onRetry,
  insets,
}: {
  clients: ClientLite[];
  countByClient: Map<number, number>;
  loading: boolean;
  error: string;
  search: string;
  onSearch: (s: string) => void;
  onPick: (id: number) => void;
  onRetry: () => void;
  insets: { bottom: number };
}) {
  return (
    <View style={styles.stepBody}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{padAndroidText('Choose client')}</Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'Pick who this invoice is for. Clients with completed jobs ready to invoice show a green badge.',
          )}
        </Text>
      </View>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="Search clients…"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{padAndroidText(error)}</Text>
          <TouchableOpacity onPress={onRetry}>
            <Text style={styles.errorRetry}>{padAndroidText('Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#193434" />
        </View>
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 120 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const count = countByClient.get(item.id) || 0;
            return (
              <TouchableOpacity
                style={styles.clientCard}
                onPress={() => onPick(item.id)}
                activeOpacity={0.8}
              >
                <View style={styles.clientAvatar}>
                  <Text style={styles.clientAvatarText}>
                    {padAndroidText(
                      `${(item.name?.[0] || '').toUpperCase()}${(item.last_name?.[0] || '').toUpperCase() || ''}`,
                    )}
                  </Text>
                </View>
                <View style={styles.clientCardMain}>
                  <Text style={styles.clientCardName} numberOfLines={1}>
                    {padAndroidText(clientFullName(item))}
                  </Text>
                  {item.email ? (
                    <Text style={styles.clientCardSub} numberOfLines={1}>
                      {padAndroidText(item.email)}
                    </Text>
                  ) : null}
                </View>
                {count > 0 ? (
                  <View style={styles.jobBadge}>
                    <Text style={styles.jobBadgeText}>
                      {padAndroidText(`${count} ready`)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {padAndroidText('No matching clients')}
              </Text>
              <Text style={styles.emptySub}>
                {padAndroidText('Try a different search term.')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// =========================================================================
// Step 2 · Jobs
// =========================================================================

function JobsStep({
  client,
  jobs,
  selected,
  discounts,
  currency,
  loading,
  error,
  onToggle,
  onSetDiscount,
  onChangeClient,
  onRetry,
  insets,
}: {
  client: ClientLite | null;
  jobs: CompletedJob[];
  selected: Set<number>;
  discounts: Record<string, number>;
  currency: string;
  loading: boolean;
  error: string;
  onToggle: (id: number) => void;
  onSetDiscount: (id: number, value: number) => void;
  onChangeClient: () => void;
  onRetry: () => void;
  insets: { bottom: number };
}) {
  return (
    <View style={styles.stepBody}>
      <View style={styles.stepHeader}>
        <View style={styles.clientPill}>
          <View style={styles.clientPillAvatar}>
            <Text style={styles.clientPillAvatarText}>
              {padAndroidText(
                `${(client?.name?.[0] || '').toUpperCase()}${(client?.last_name?.[0] || '').toUpperCase() || ''}`,
              )}
            </Text>
          </View>
          <Text style={styles.clientPillName} numberOfLines={1}>
            {padAndroidText(clientFullName(client))}
          </Text>
          <TouchableOpacity onPress={onChangeClient} hitSlop={10}>
            <Text style={styles.clientPillChange}>
              {padAndroidText('Change')}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.stepTitle}>
          {padAndroidText('Add completed jobs')}
        </Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'Pick the jobs to invoice. Tap a job to add it; tap again to remove. You can also apply a per-job discount.',
          )}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{padAndroidText(error)}</Text>
          <TouchableOpacity onPress={onRetry}>
            <Text style={styles.errorRetry}>{padAndroidText('Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#193434" />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => String(j.id)}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 120 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <JobRow
              job={item}
              currency={currency}
              checked={selected.has(item.id)}
              discount={discounts[String(item.id)] || 0}
              onToggle={() => onToggle(item.id)}
              onSetDiscount={(v) => onSetDiscount(item.id, v)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {padAndroidText('No completed jobs')}
              </Text>
              <Text style={styles.emptySub}>
                {padAndroidText(
                  'Mark a job as completed first, then come back to invoice it.',
                )}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function JobRow({
  job,
  currency,
  checked,
  discount,
  onToggle,
  onSetDiscount,
}: {
  job: CompletedJob;
  currency: string;
  checked: boolean;
  discount: number;
  onToggle: () => void;
  onSetDiscount: (value: number) => void;
}) {
  const [showDiscount, setShowDiscount] = useState(discount > 0);
  const total = Number(job.total_price) || 0;
  const lineNet = Math.max(0, total - discount);
  const completedAt = job.updated_at || job.created_at || job.scheduled_date || '';
  const sc = Number(job.service_count) || 0;

  return (
    <View style={[styles.jobCard, checked && styles.jobCardOn]}>
      <TouchableOpacity
        style={styles.jobRowMain}
        onPress={onToggle}
        activeOpacity={0.85}
      >
        <View
          style={[styles.checkbox, checked && styles.checkboxOn]}
        >
          {checked ? <CheckIcon /> : null}
        </View>
        <View style={styles.jobRowText}>
          <Text style={styles.jobTitle} numberOfLines={2}>
            {padAndroidText(job.title || `Job #${job.id}`)}
          </Text>
          <Text style={styles.jobMeta} numberOfLines={1}>
            {padAndroidText(
              [
                fmtDate(completedAt),
                sc ? `${sc} ${sc === 1 ? 'task' : 'tasks'}` : null,
                job.status === 'sub_completed' ? 'Partial' : null,
              ]
                .filter(Boolean)
                .join(' · '),
            )}
          </Text>
        </View>
        <View style={styles.jobAmountWrap}>
          <Text
            style={[
              styles.jobAmount,
              discount > 0 && styles.jobAmountStriked,
            ]}
            numberOfLines={1}
          >
            {padAndroidText(fmtMoney(total, currency))}
          </Text>
          {discount > 0 ? (
            <Text style={styles.jobAmountNet} numberOfLines={1}>
              {padAndroidText(fmtMoney(lineNet, currency))}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {checked ? (
        <View style={styles.jobDiscountRow}>
          {!showDiscount ? (
            <TouchableOpacity
              onPress={() => setShowDiscount(true)}
              hitSlop={10}
            >
              <Text style={styles.jobDiscountAdd}>
                {padAndroidText('+ Add discount')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.discountFieldRow}>
              <Text style={styles.discountLbl}>
                {padAndroidText('Discount')}
              </Text>
              <View style={styles.discountInputWrap}>
                <Text style={styles.discountCurrency}>
                  {padAndroidText(currency)}
                </Text>
                <TextInput
                  value={discount > 0 ? String(discount) : ''}
                  onChangeText={(t) => {
                    const cleaned = t.replace(',', '.');
                    const n = parseFloat(cleaned);
                    onSetDiscount(Number.isFinite(n) ? n : 0);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor="#94A3B8"
                  style={styles.discountInput}
                />
              </View>
              {discount > 0 ? (
                <TouchableOpacity
                  hitSlop={10}
                  onPress={() => {
                    onSetDiscount(0);
                    setShowDiscount(false);
                  }}
                >
                  <Text style={styles.discountClear}>
                    {padAndroidText('Clear')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

// =========================================================================
// Step 3 · Details
// =========================================================================

function DetailsStep({
  currency,
  title,
  issueDate,
  dueDays,
  dueDate,
  taxRate,
  paymentTerms,
  description,
  referenceText,
  paymentOptions,
  paymentLoaded,
  paymentMethodOn,
  advancedOpen,
  onTitle,
  onIssueDate,
  onDueDays,
  onTaxRate,
  onPaymentTerms,
  onDescription,
  onReferenceText,
  onTogglePaymentMethod,
  onToggleAdvanced,
  selectedJobs,
  jobDiscounts,
  onSetDiscount,
  subtotal,
  taxAmount,
  grandTotal,
  insets,
  numberingConfigured,
}: {
  currency: string;
  title: string;
  issueDate: string;
  dueDays: number;
  dueDate: string;
  taxRate: number;
  paymentTerms: string;
  description: string;
  referenceText: string;
  paymentOptions: PaymentOption[];
  paymentLoaded: boolean;
  paymentMethodOn: Record<string, boolean>;
  advancedOpen: boolean;
  onTitle: (v: string) => void;
  onIssueDate: (v: string) => void;
  onDueDays: (v: number) => void;
  onTaxRate: (v: number) => void;
  onPaymentTerms: (v: string) => void;
  onDescription: (v: string) => void;
  onReferenceText: (v: string) => void;
  onTogglePaymentMethod: (provider: string) => void;
  onToggleAdvanced: () => void;
  selectedJobs: CompletedJob[];
  jobDiscounts: Record<string, number>;
  onSetDiscount: (jobId: number, value: number) => void;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  insets: { bottom: number };
  numberingConfigured: boolean;
}) {
  const dueOptions = [7, 14, 21, 30, 45, 60];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={20}
    >
      <ScrollView
        style={styles.stepBody}
        contentContainerStyle={[
          styles.detailsScroll,
          { paddingBottom: 140 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!numberingConfigured ? (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeText}>
              {padAndroidText(
                'Set up your invoice number start in Settings → Invoice options on the web before creating your first invoice.',
              )}
            </Text>
          </View>
        ) : null}

        {/* Summary card */}
        <View style={styles.totalsCard}>
          <Text style={styles.totalsLbl}>{padAndroidText('Total')}</Text>
          <Text style={styles.totalsValue}>
            {padAndroidText(fmtMoney(grandTotal, currency))}
          </Text>
          <View style={styles.totalsBreakdown}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLbl}>
                {padAndroidText('Subtotal')}
              </Text>
              <Text style={styles.totalsRowVal}>
                {padAndroidText(fmtMoney(subtotal, currency))}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLbl}>
                {padAndroidText(`Tax · ${taxRate}%`)}
              </Text>
              <Text style={styles.totalsRowVal}>
                {padAndroidText(fmtMoney(taxAmount, currency))}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{padAndroidText('Invoice')}</Text>
        <View style={styles.formCard}>
          <FieldRow label="Title">
            <TextInput
              value={title}
              onChangeText={onTitle}
              placeholder="Invoice"
              placeholderTextColor="#94A3B8"
              style={styles.textField}
              maxLength={30}
            />
          </FieldRow>

          <View style={styles.fieldDivider} />

          <FieldRow label="Issue date">
            <TextInput
              value={issueDate}
              onChangeText={onIssueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={styles.textField}
              autoCapitalize="none"
            />
          </FieldRow>

          <View style={styles.fieldDivider} />

          <FieldRow label="Due in">
            <View style={styles.dueChipRow}>
              {dueOptions.map((d) => {
                const on = d === dueDays;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => onDueDays(d)}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        on && styles.chipTextOn,
                      ]}
                    >
                      {padAndroidText(`${d}d`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.fieldHint}>
              {padAndroidText(`Due ${fmtDate(dueDate)}`)}
            </Text>
          </FieldRow>
        </View>

        <Text style={styles.sectionTitle}>
          {padAndroidText('Line items')}
        </Text>
        <View style={styles.formCard}>
          {selectedJobs.map((j, idx) => {
            const total = Number(j.total_price) || 0;
            const discount = jobDiscounts[String(j.id)] || 0;
            const net = Math.max(0, total - discount);
            return (
              <View
                key={j.id}
                style={[styles.lineItem, idx > 0 && styles.lineItemBorder]}
              >
                <View style={styles.lineItemMain}>
                  <Text style={styles.lineItemTitle} numberOfLines={1}>
                    {padAndroidText(j.title || `Job #${j.id}`)}
                  </Text>
                  {discount > 0 ? (
                    <Text style={styles.lineItemMeta}>
                      {padAndroidText(
                        `${fmtMoney(total, currency)} − ${fmtMoney(discount, currency)} discount`,
                      )}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.lineItemAmount}>
                  {padAndroidText(fmtMoney(net, currency))}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>
          {padAndroidText('Payment options')}
        </Text>
        <View style={styles.formCard}>
          {!paymentLoaded ? (
            <ActivityIndicator color="#193434" style={{ paddingVertical: 8 }} />
          ) : paymentOptions.length === 0 ? (
            <Text style={styles.muted}>
              {padAndroidText(
                'No payment options enabled. Activate one in Settings → Invoice options on the web.',
              )}
            </Text>
          ) : (
            paymentOptions.map((opt, idx) => {
              const on = !!paymentMethodOn[opt.provider];
              return (
                <View
                  key={opt.provider}
                  style={[
                    styles.payRow,
                    idx > 0 && styles.payRowBorder,
                  ]}
                >
                  <View style={styles.payRowMain}>
                    <Text style={styles.payTitle}>
                      {padAndroidText(opt.title)}
                    </Text>
                    {opt.description ? (
                      <Text style={styles.payDesc} numberOfLines={2}>
                        {padAndroidText(opt.description)}
                      </Text>
                    ) : null}
                  </View>
                  <Toggle
                    value={on}
                    onValueChange={() => onTogglePaymentMethod(opt.provider)}
                  />
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={onToggleAdvanced}
          activeOpacity={0.85}
        >
          <Text style={styles.advancedToggleText}>
            {padAndroidText(
              advancedOpen ? 'Hide advanced options' : 'Show advanced options',
            )}
          </Text>
          <ChevronIcon open={advancedOpen} color="#475569" />
        </TouchableOpacity>

        {advancedOpen ? (
          <>
            <Text style={styles.sectionTitle}>
              {padAndroidText('Advanced')}
            </Text>
            <View style={styles.formCard}>
              <FieldRow label="Tax rate (%)">
                <TextInput
                  value={String(taxRate)}
                  onChangeText={(t) => {
                    const n = parseFloat(t.replace(',', '.'));
                    onTaxRate(Number.isFinite(n) ? n : 0);
                  }}
                  keyboardType="decimal-pad"
                  style={styles.textField}
                />
              </FieldRow>

              <View style={styles.fieldDivider} />

              <FieldRow label="Description">
                <TextInput
                  value={description}
                  onChangeText={onDescription}
                  placeholder="Optional description shown on the invoice"
                  placeholderTextColor="#94A3B8"
                  style={[styles.textField, { minHeight: 64 }]}
                  multiline
                />
              </FieldRow>

              <View style={styles.fieldDivider} />

              <FieldRow label="Reference / PO">
                <TextInput
                  value={referenceText}
                  onChangeText={onReferenceText}
                  placeholder="Optional reference"
                  placeholderTextColor="#94A3B8"
                  style={styles.textField}
                />
              </FieldRow>

              <View style={styles.fieldDivider} />

              <FieldRow label="Payment terms">
                <TextInput
                  value={paymentTerms}
                  onChangeText={onPaymentTerms}
                  placeholder="Net 30 days from invoice date…"
                  placeholderTextColor="#94A3B8"
                  style={[styles.textField, { minHeight: 80 }]}
                  multiline
                />
              </FieldRow>
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// =========================================================================
// Small components
// =========================================================================

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLbl}>{padAndroidText(label)}</Text>
      <View style={styles.fieldBody}>{children}</View>
    </View>
  );
}

function Toggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: () => void;
}) {
  const tx = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(tx, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      damping: 18,
      stiffness: 220,
      mass: 0.6,
    }).start();
  }, [value, tx]);
  const bg = tx.interpolate({
    inputRange: [0, 1],
    outputRange: ['#CBD5E1', '#3DD57A'],
  });
  const knobX = tx.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onValueChange}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: bg }]}>
        <Animated.View
          style={[styles.toggleKnob, { transform: [{ translateX: knobX }] }]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

// =========================================================================
// Styles
// =========================================================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F9F7' },
  centered: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: '#F6F9F7',
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  titleText: { fontSize: 17, fontWeight: '800', color: '#193434' },
  subtitleText: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 220,
  },

  // stepper
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 14,
  },
  stepNode: { alignItems: 'center', justifyContent: 'center', minWidth: 70 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: '#193434' },
  stepDotDone: { backgroundColor: '#3DD57A' },
  stepDotText: { fontSize: 12, fontWeight: '800', color: '#94A3B8' },
  stepDotTextActive: { color: '#FFFFFF' },
  stepLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  stepLabelActive: { color: '#193434' },
  stepLabelDone: { color: '#0F766E' },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 6,
    marginBottom: 18,
    borderRadius: 1,
  },
  stepLineDone: { backgroundColor: '#3DD57A' },

  stepContainer: { flex: 1 },
  stepBody: { flex: 1 },
  stepHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#193434' },
  stepSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
  },

  searchWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 44,
  },
  searchIcon: { fontSize: 16, color: '#94A3B8', marginRight: 8 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: '#193434',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },

  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 13, color: '#B91C1C' },
  errorRetry: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    textDecorationLine: 'underline',
  },

  noticeBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noticeText: { fontSize: 13, color: '#92400E', lineHeight: 18 },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },

  // client list
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 12,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6F2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: { fontSize: 14, fontWeight: '800', color: '#0F766E' },
  clientCardMain: { flex: 1, minWidth: 0 },
  clientCardName: { fontSize: 15, fontWeight: '700', color: '#193434' },
  clientCardSub: { marginTop: 2, fontSize: 12, color: '#64748B' },
  jobBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  jobBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  emptyBox: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 18 },

  // jobs step
  clientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 8,
    alignSelf: 'flex-start',
  },
  clientPillAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E6F2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientPillAvatarText: { fontSize: 11, fontWeight: '800', color: '#0F766E' },
  clientPillName: { fontSize: 13, fontWeight: '700', color: '#193434' },
  clientPillChange: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
    paddingHorizontal: 8,
  },

  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  jobCardOn: {
    borderColor: '#3DD57A',
    backgroundColor: '#F2FBF6',
  },
  jobRowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxOn: {
    backgroundColor: '#3DD57A',
    borderColor: '#3DD57A',
  },
  jobRowText: { flex: 1, minWidth: 0 },
  jobTitle: { fontSize: 15, fontWeight: '700', color: '#193434' },
  jobMeta: { marginTop: 2, fontSize: 12, color: '#64748B' },
  jobAmountWrap: { alignItems: 'flex-end' },
  jobAmount: { fontSize: 14, fontWeight: '800', color: '#193434' },
  jobAmountStriked: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  jobAmountNet: { marginTop: 2, fontSize: 14, fontWeight: '800', color: '#193434' },

  jobDiscountRow: { marginTop: 10 },
  jobDiscountAdd: { fontSize: 13, fontWeight: '700', color: '#0F766E' },
  discountFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  discountLbl: { fontSize: 12, color: '#475569', fontWeight: '700' },
  discountInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    minHeight: 38,
  },
  discountCurrency: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginRight: 6,
  },
  discountInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
    paddingVertical: 6,
  },
  discountClear: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },

  // details step
  detailsScroll: { paddingHorizontal: 16, paddingTop: 4 },
  totalsCard: {
    backgroundColor: '#193434',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
  },
  totalsLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94CFB7',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  totalsValue: { fontSize: 30, fontWeight: '800', color: '#FFFFFF' },
  totalsBreakdown: {
    width: '100%',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
    gap: 4,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalsRowLbl: { fontSize: 13, color: '#BFD1C5' },
  totalsRowVal: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  fieldRow: { paddingVertical: 12 },
  fieldLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  fieldBody: {},
  fieldHint: { marginTop: 6, fontSize: 12, color: '#64748B' },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E7ECE9',
  },

  textField: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: '#193434',
    backgroundColor: '#FFFFFF',
  },

  dueChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipOn: { backgroundColor: '#193434', borderColor: '#193434' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  chipTextOn: { color: '#FFFFFF' },

  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  lineItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  lineItemMain: { flex: 1, minWidth: 0 },
  lineItemTitle: { fontSize: 14, fontWeight: '700', color: '#193434' },
  lineItemMeta: { marginTop: 2, fontSize: 12, color: '#64748B' },
  lineItemAmount: { fontSize: 14, fontWeight: '800', color: '#193434' },

  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  payRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  payRowMain: { flex: 1, minWidth: 0 },
  payTitle: { fontSize: 14, fontWeight: '700', color: '#193434' },
  payDesc: { marginTop: 2, fontSize: 12, color: '#64748B' },

  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  advancedToggleText: { fontSize: 13, fontWeight: '700', color: '#475569' },

  muted: { fontSize: 13, color: '#94A3B8', paddingVertical: 6 },

  // bottom action bar
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E7ECE9',
    gap: 10,
  },
  actionBarSpacer: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBarHint: { fontSize: 13, color: '#94A3B8' },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#193434' },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  btnGhost: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flex: 0.55,
  },
  btnGhostText: { color: '#193434', fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#CBD5E1' },
});
