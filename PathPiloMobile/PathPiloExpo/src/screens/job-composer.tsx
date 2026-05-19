import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
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
import {
  ServiceCreateSheet,
  type InlineServiceCreateResult,
} from '../components/ServiceCreateSheet';
import { ClientCreateSheet } from './clients';
import { JobTimePickerModal } from '../components/JobTimePickerModal';

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

function fmtMinutes(minutes: number): string {
  if (!minutes || !Number.isFinite(minutes)) return '0\u00A0min';
  if (minutes < 60) return `${Math.round(minutes)}\u00A0min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (m === 0) return `${h}\u00A0h`;
  return `${h}\u00A0h\u00A0${m}\u00A0m`;
}

function fmtLongDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const TIME_RE = /^\d{2}:\d{2}$/;

// --- icons ----------------------------------------------------------------

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

function ChevronIcon({
  open,
  color = '#94A3B8',
}: {
  open?: boolean;
  color?: string;
}) {
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

function CrossSmall({ color = '#94A3B8' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M6 6l12 12M6 18L18 6"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// --- types ----------------------------------------------------------------

type ClientPick = {
  id: number;
  name: string;
  last_name?: string | null;
  client_type?: string;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  email?: string | null;
};

function clientRowToPick(c: any): ClientPick {
  return {
    id: c.id,
    name: c.name,
    last_name: c.last_name,
    client_type: c.client_type,
    address: c.address ?? null,
    zip_code: c.zip_code ?? null,
    city: c.city ?? null,
    email: c.email ?? null,
  };
}

type ServicePick = {
  id: number;
  title: string;
  price: number | string | null;
  duration_minutes: number;
};

type SelectedService = ServicePick & {
  customPrice: string;
  customDuration: string;
  /** Ad-hoc: only on this job (`custom_title`). Negative `id` is client-side only. */
  source?: 'adhoc';
};

type TeamUser = {
  id: number;
  first_name: string;
  last_name: string;
};

type ClientSecureNote = {
  id: number;
  note: string;
};

type Step = 'client' | 'services' | 'details';

function clientFullLine(c: ClientPick | null | undefined): string {
  if (!c) return '—';
  if (String(c.client_type || '').toLowerCase() === 'company') {
    return (c.name || '').trim() || 'Company';
  }
  return `${c.name || ''} ${c.last_name || ''}`.trim() || 'Client';
}

function clientAddressLine(c: ClientPick | null | undefined): string {
  if (!c) return '';
  if (c.address && c.city) return `${c.address}, ${c.city}`;
  if (c.address) return String(c.address);
  return '';
}

function serviceToSelected(s: ServicePick): SelectedService {
  const raw = typeof s.price === 'string' ? parseFloat(s.price) : Number(s.price);
  const p = Number.isFinite(raw) ? raw : 0;
  const d = Number(s.duration_minutes) || 0;
  return {
    ...s,
    customPrice: String(Math.round(p * 100) / 100),
    customDuration: String(d),
  };
}

function clientCurrency(company: any): string {
  const cc = String(company?.country_code || company?.countryCode || 'DK');
  if (cc === 'SE') return 'SEK';
  if (cc === 'NO') return 'NOK';
  if (cc === 'DE' || cc === 'FR' || cc === 'NL' || cc === 'ES') return 'EUR';
  if (cc === 'GB') return 'GBP';
  if (cc === 'US') return 'USD';
  return 'DKK';
}

function isAdminRole(company: any): boolean {
  const role = String(company?.user_role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

// =========================================================================
// Composer screen
// =========================================================================

export function MobileJobComposerScreen(props: any) {
  const { route, navigation } = props;
  const { company, user, scheduledDate } = route.params || {};
  const insets = useSafeAreaInsets();
  const admin = isAdminRole(company);
  const currency = clientCurrency(company);

  // ── Step state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('client');
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

  // ── Data ───────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientPick[]>([]);
  const [services, setServices] = useState<ServicePick[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // ── Selections ─────────────────────────────────────────────────────────
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientPick | null>(null);

  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  const [assigneeId, setAssigneeId] = useState<number>(user?.id);
  const [showAssignList, setShowAssignList] = useState(false);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [note, setNote] = useState('');

  const [secureNotes, setSecureNotes] = useState<ClientSecureNote[]>([]);
  const [loadingSecureNotes, setLoadingSecureNotes] = useState(false);
  const [savedNoteFromId, setSavedNoteFromId] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const tempServiceIdRef = useRef(0);

  // ── Loading ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      await ensureAuthHeader();
      const [cRes, sRes, uRes] = await Promise.all([
        apiClient.get('/clients'),
        apiClient.get('/services'),
        apiClient.get('/users').catch(() => ({ data: { users: [] } })),
      ]);
      setClients((cRes.data?.clients || []).map(clientRowToPick));
      setServices(
        (sRes.data?.services || []).map((s: any) => ({
          id: s.id,
          title: s.title || s.name || 'Service',
          price: s.price,
          duration_minutes: Number(s.duration_minutes) || 0,
        })),
      );
      setTeamUsers(
        ((uRes as any)?.data?.users || []).map((u: any) => ({
          id: u.id,
          first_name: u.first_name || '',
          last_name: u.last_name || '',
        })),
      );
    } catch (e: any) {
      setLoadError(
        e?.response?.data?.error || e?.message || 'Could not load data.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Pull this client's secure notes once selected
  useEffect(() => {
    if (!selectedClient) {
      setSecureNotes([]);
      setSavedNoteFromId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSecureNotes(true);
      try {
        await ensureAuthHeader();
        const res = await apiClient.get(
          `/clients/${selectedClient.id}/secure-notes`,
        );
        if (cancelled) return;
        const raw = res.data?.notes || [];
        setSecureNotes(
          raw.map((n: any) => ({ id: n.id, note: String(n.note ?? '') })),
        );
      } catch {
        if (!cancelled) setSecureNotes([]);
      } finally {
        if (!cancelled) setLoadingSecureNotes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClient]);

  // ── Derived ────────────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) {
      return [...clients]
        .sort((a, b) =>
          clientFullLine(a).localeCompare(clientFullLine(b)),
        )
        .slice(0, 60);
    }
    return clients
      .filter((c) =>
        [
          clientFullLine(c),
          c.address,
          c.zip_code,
          c.city,
          c.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 60);
  }, [clients, clientSearch]);

  const selectedServiceIds = useMemo(
    () => new Set(selectedServices.map((x) => x.id)),
    [selectedServices],
  );

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    const pool = services.filter((s) => !selectedServiceIds.has(s.id));
    if (!q) {
      return [...pool]
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        .slice(0, 40);
    }
    return pool
      .filter((s) => (s.title || '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [services, serviceSearch, selectedServiceIds]);

  const subtotal = useMemo(
    () =>
      selectedServices.reduce((acc, s) => {
        const p = parseFloat(s.customPrice.replace(',', '.'));
        return acc + (Number.isFinite(p) ? p : 0);
      }, 0),
    [selectedServices],
  );

  const totalDuration = useMemo(
    () =>
      selectedServices.reduce((acc, s) => {
        const d = parseInt(s.customDuration, 10);
        return acc + (Number.isFinite(d) ? d : 0);
      }, 0),
    [selectedServices],
  );

  const assigneeName = useMemo(() => {
    const u = teamUsers.find((x) => x.id === assigneeId);
    if (!u) return 'You';
    return `${u.first_name} ${u.last_name}`.trim() || 'Employee';
  }, [teamUsers, assigneeId]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const pickClient = (c: ClientPick) => {
    setSelectedClient(c);
    setClientSearch('');
    goToStep('services', 'forward');
  };

  const onInlineClientCreated = useCallback(
    async (clientId: number) => {
      setCreateClientOpen(false);
      try {
        await ensureAuthHeader();
        const res = await apiClient.get(`/clients/${clientId}`);
        const row = res.data?.client;
        if (!row) {
          await loadAll();
          return;
        }
        const pick = clientRowToPick(row);
        setClients((prev) => {
          const rest = prev.filter((p) => p.id !== pick.id);
          return [pick, ...rest];
        });
        setSelectedClient(pick);
        setClientSearch('');
        goToStep('services', 'forward');
      } catch (e: any) {
        const msg =
          e?.response?.data?.error ||
          e?.message ||
          'Client was created but could not be loaded.';
        Alert.alert('Could not select client', msg);
        await loadAll();
      }
    },
    [loadAll, goToStep],
  );

  const addService = useCallback((s: ServicePick) => {
    setSelectedServices((prev) => {
      if (prev.some((x) => x.id === s.id)) return prev;
      return [...prev, serviceToSelected(s)];
    });
    setServiceSearch('');
  }, []);

  const handleInlineServiceCreated = useCallback(
    (r: InlineServiceCreateResult) => {
      if (r.kind === 'catalog') {
        setServices((prev) => {
          if (prev.some((x) => x.id === r.service.id)) {
            return prev.map((x) => (x.id === r.service.id ? r.service : x));
          }
          return [...prev, r.service].sort((a, b) =>
            (a.title || '').localeCompare(b.title || ''),
          );
        });
        addService(r.service);
        return;
      }
      tempServiceIdRef.current -= 1;
      const id = tempServiceIdRef.current;
      const row: SelectedService = {
        id,
        title: r.title,
        price: r.price,
        duration_minutes: r.durationMinutes,
        customPrice: String(Math.round(r.price * 100) / 100),
        customDuration: String(r.durationMinutes),
        source: 'adhoc',
      };
      setSelectedServices((prev) => [...prev, row]);
      setServiceSearch('');
    },
    [addService],
  );

  const removeService = (id: number) => {
    setSelectedServices((prev) => prev.filter((x) => x.id !== id));
  };

  const updateSvcField = (
    id: number,
    field: 'customPrice' | 'customDuration',
    value: string,
  ) => {
    setSelectedServices((prev) =>
      prev.map((x) => (x.id === id ? { ...x, [field]: value } : x)),
    );
  };

  const tryClose = () => {
    if (submitting) return;
    if (createServiceOpen) {
      setCreateServiceOpen(false);
      return;
    }
    if (createClientOpen) {
      setCreateClientOpen(false);
      return;
    }
    if (
      selectedClient ||
      selectedServices.length > 0 ||
      timeFrom ||
      timeTo ||
      note.trim()
    ) {
      Alert.alert('Discard job?', 'You will lose your progress.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ]);
    } else {
      navigation.goBack();
    }
  };

  const onContinueFromServices = () => {
    if (selectedServices.length === 0) {
      Alert.alert('Pick at least one service', 'Add a service to continue.');
      return;
    }
    goToStep('details', 'forward');
  };

  const submit = async () => {
    if (!selectedClient || selectedServices.length === 0 || submitting) return;
    const tf = timeFrom.trim();
    const tt = timeTo.trim();
    if (tf && !TIME_RE.test(tf)) {
      Alert.alert('Check time', 'Use HH:MM for start time (e.g. 09:00).');
      return;
    }
    if (tt && !TIME_RE.test(tt)) {
      Alert.alert('Check time', 'Use HH:MM for end time (e.g. 11:00).');
      return;
    }
    setSubmitting(true);
    try {
      await ensureAuthHeader();
      await apiClient.post('/jobs', {
        title: '',
        client_id: selectedClient.id,
        assigned_user_id: assigneeId,
        scheduled_date: scheduledDate,
        scheduled_time_from: tf || null,
        scheduled_time_to: tt || null,
        note: note.trim() || null,
        services: selectedServices.map((s) => {
          const custom_price =
            parseFloat(s.customPrice.replace(',', '.')) || 0;
          const custom_duration =
            parseInt(s.customDuration, 10) || 0;
          if (s.source === 'adhoc' || s.id < 0) {
            return {
              custom_title: s.title,
              custom_price,
              custom_duration,
            };
          }
          return {
            service_id: s.id,
            custom_price,
            custom_duration,
          };
        }),
      });
      navigation.goBack();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        'Could not create the job. Please try again.';
      Alert.alert('Could not create', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const stepIdx = step === 'client' ? 0 : step === 'services' ? 1 : 2;

  // ── Render ─────────────────────────────────────────────────────────────
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
          <Text style={styles.titleText}>{padAndroidText('New job')}</Text>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {padAndroidText(fmtLongDate(scheduledDate || ''))}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <Stepper step={stepIdx} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#193434" />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{padAndroidText(loadError)}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              loadAll();
            }}
          >
            <Text style={styles.retryBtnText}>{padAndroidText('Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.stepContainer,
            { transform: [{ translateX: stepX }] },
          ]}
        >
          {step === 'client' ? (
            <ClientStep
              clients={filteredClients}
              search={clientSearch}
              onSearch={setClientSearch}
              onPick={pickClient}
              onCreateNew={() => setCreateClientOpen(true)}
              insets={insets}
            />
          ) : null}

          {step === 'services' ? (
            <ServicesStep
              client={selectedClient}
              services={filteredServices}
              selected={selectedServices}
              search={serviceSearch}
              currency={currency}
              onSearch={setServiceSearch}
              onAdd={addService}
              onCreateNew={() => setCreateServiceOpen(true)}
              onRemove={removeService}
              onUpdateField={updateSvcField}
              onChangeClient={() => goToStep('client', 'back')}
              insets={insets}
            />
          ) : null}

          {step === 'details' ? (
            <DetailsStep
              client={selectedClient}
              currency={currency}
              admin={admin}
              teamUsers={teamUsers}
              assigneeId={assigneeId}
              assigneeName={assigneeName}
              showAssignList={showAssignList}
              onToggleAssignList={() => {
                LayoutAnimation.configureNext(SNAPPY);
                setShowAssignList((v) => !v);
              }}
              onPickAssignee={(id) => {
                setAssigneeId(id);
                LayoutAnimation.configureNext(SNAPPY);
                setShowAssignList(false);
              }}
              timeFrom={timeFrom}
              timeTo={timeTo}
              onTimeFrom={setTimeFrom}
              onTimeTo={setTimeTo}
              note={note}
              onNote={(v) => {
                setNote(v);
                if (savedNoteFromId != null) setSavedNoteFromId(null);
              }}
              secureNotes={secureNotes}
              loadingSecureNotes={loadingSecureNotes}
              savedNoteFromId={savedNoteFromId}
              onUseSavedNote={(n) => {
                setNote(n.note);
                setSavedNoteFromId(n.id);
              }}
              selectedServices={selectedServices}
              onPatchServiceLine={(id, patch) => {
                setSelectedServices((prev) =>
                  prev.map((x) => (x.id === id ? { ...x, ...patch } : x)),
                );
              }}
              subtotal={subtotal}
              totalDuration={totalDuration}
              insets={insets}
            />
          ) : null}
        </Animated.View>
      )}

      {/* Sticky action bar */}
      {!loading && !loadError ? (
        <View
          style={[
            styles.actionBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          {step === 'services' ? (
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
              onPress={() => goToStep('services', 'back')}
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
          ) : step === 'services' ? (
            <TouchableOpacity
              onPress={onContinueFromServices}
              style={[
                styles.btn,
                styles.btnPrimary,
                selectedServices.length === 0 && styles.btnDisabled,
              ]}
              activeOpacity={0.85}
              disabled={selectedServices.length === 0}
            >
              <Text style={styles.btnPrimaryText}>
                {padAndroidText(
                  selectedServices.length === 0
                    ? 'Add a service'
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
                <View style={styles.btnPrimaryInner}>
                  <CheckIcon color="#FFFFFF" />
                  <RNText
                    style={styles.btnPrimaryText}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {padAndroidText(
                      `Create job · ${fmtMoney(subtotal, currency)}`,
                    )}
                  </RNText>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <ClientCreateSheet
        visible={createClientOpen}
        onClose={() => setCreateClientOpen(false)}
        onCreated={onInlineClientCreated}
      />
      <ServiceCreateSheet
        visible={createServiceOpen}
        scope="job"
        insets={{ top: insets.top, bottom: insets.bottom }}
        onClose={() => setCreateServiceOpen(false)}
        onComplete={handleInlineServiceCreated}
      />
    </View>
  );
}

// =========================================================================
// Stepper
// =========================================================================

function Stepper({ step }: { step: number }) {
  const labels = ['Client', 'Services', 'Details'];
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
                style={[styles.stepLine, i < step && styles.stepLineDone]}
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
  search,
  onSearch,
  onPick,
  onCreateNew,
  insets,
}: {
  clients: ClientPick[];
  search: string;
  onSearch: (s: string) => void;
  onPick: (c: ClientPick) => void;
  onCreateNew?: () => void;
  insets: { bottom: number };
}) {
  return (
    <View style={styles.stepBody}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{padAndroidText('Choose client')}</Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'Pick who this job is for. Type to search by name, address, or email.',
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

      <FlatList
        data={clients}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 120 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          onCreateNew ? (
            <TouchableOpacity
              style={styles.newClientBtn}
              onPress={onCreateNew}
              activeOpacity={0.85}
            >
              <RNText style={styles.newClientBtnPlus}>+</RNText>
              <RNText
                style={styles.newClientBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {padAndroidText('New client')}
              </RNText>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => {
          const initials = `${(item.name?.[0] || '').toUpperCase()}${(item.last_name?.[0] || '').toUpperCase() || ''}`;
          const sub = clientAddressLine(item) || item.email || '';
          return (
            <TouchableOpacity
              style={styles.clientCard}
              onPress={() => onPick(item)}
              activeOpacity={0.8}
            >
              <View style={styles.clientAvatar}>
                <Text style={styles.clientAvatarText}>
                  {padAndroidText(initials || '·')}
                </Text>
              </View>
              <View style={styles.clientCardMain}>
                <Text style={styles.clientCardName} numberOfLines={1}>
                  {padAndroidText(clientFullLine(item))}
                </Text>
                {sub ? (
                  <Text style={styles.clientCardSub} numberOfLines={1}>
                    {padAndroidText(sub)}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {padAndroidText('No matching clients')}
            </Text>
            <Text style={styles.emptySub}>
              {padAndroidText(
                onCreateNew
                  ? 'Try a different search, or create a new client above.'
                  : 'Try a different search term.',
              )}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// =========================================================================
// Step 2 · Services
// =========================================================================

function ServicesStep({
  client,
  services,
  selected,
  search,
  currency,
  onSearch,
  onAdd,
  onCreateNew,
  onRemove,
  onUpdateField,
  onChangeClient,
  insets,
}: {
  client: ClientPick | null;
  services: ServicePick[];
  selected: SelectedService[];
  search: string;
  currency: string;
  onSearch: (s: string) => void;
  onAdd: (s: ServicePick) => void;
  onCreateNew?: () => void;
  onRemove: (id: number) => void;
  onUpdateField: (
    id: number,
    field: 'customPrice' | 'customDuration',
    value: string,
  ) => void;
  onChangeClient: () => void;
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
            {padAndroidText(clientFullLine(client))}
          </Text>
          <TouchableOpacity onPress={onChangeClient} hitSlop={10}>
            <RNText style={styles.clientPillChange}>
              {padAndroidText('Change')}
            </RNText>
          </TouchableOpacity>
        </View>
        <Text style={styles.stepTitle}>{padAndroidText('Add services')}</Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'Pick what gets done. Tap to add — adjust price or duration on each one if needed.',
          )}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 130 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onCreateNew ? (
          <TouchableOpacity
            style={styles.newClientBtn}
            onPress={onCreateNew}
            activeOpacity={0.85}
          >
            <RNText style={styles.newClientBtnPlus}>+</RNText>
            <RNText
              style={styles.newClientBtnText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {padAndroidText('New service')}
            </RNText>
          </TouchableOpacity>
        ) : null}

        {/* Selected services list */}
        {selected.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
              {padAndroidText('Selected')}
            </Text>
            {selected.map((s) => (
              <SelectedServiceRow
                key={s.id}
                service={s}
                currency={currency}
                onRemove={() => onRemove(s.id)}
                onUpdate={(field, value) => onUpdateField(s.id, field, value)}
              />
            ))}
          </>
        ) : null}

        {/* Search bar */}
        <Text
          style={[
            styles.sectionTitle,
            { marginTop: selected.length > 0 ? 14 : 0 },
          ]}
        >
          {padAndroidText('Add a service')}
        </Text>
        <View style={[styles.searchWrap, { marginHorizontal: 0 }]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={onSearch}
            placeholder="Search services…"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        <View style={styles.servicePickerCard}>
          {services.length === 0 ? (
            <Text style={styles.muted}>
              {padAndroidText(
                search.trim()
                  ? 'No services match.'
                  : selected.length > 0
                    ? 'No more services to add.'
                    : 'No services found yet.',
              )}
            </Text>
          ) : (
            services.map((s, idx) => {
              const price = Number(
                typeof s.price === 'string' ? parseFloat(s.price) : s.price,
              );
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.serviceRow,
                    idx > 0 && styles.serviceRowBorder,
                  ]}
                  onPress={() => onAdd(s)}
                  activeOpacity={0.85}
                >
                  <View style={styles.serviceRowMain}>
                    <Text style={styles.serviceTitle} numberOfLines={1}>
                      {padAndroidText(s.title)}
                    </Text>
                    <Text style={styles.serviceMeta} numberOfLines={1}>
                      {padAndroidText(
                        `${fmtMinutes(s.duration_minutes)} · ${fmtMoney(
                          Number.isFinite(price) ? price : 0,
                          currency,
                        )}`,
                      )}
                    </Text>
                  </View>
                  <View style={styles.serviceAddBtn}>
                    <Text
                      style={styles.serviceAddText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {padAndroidText('+ Add')}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SelectedServiceRow({
  service,
  currency,
  onRemove,
  onUpdate,
}: {
  service: SelectedService;
  currency: string;
  onRemove: () => void;
  onUpdate: (field: 'customPrice' | 'customDuration', value: string) => void;
}) {
  return (
    <View style={styles.selectedSvcCard}>
      <View style={styles.selectedSvcHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.selectedSvcTitle} numberOfLines={1}>
            {padAndroidText(service.title)}
          </Text>
          {service.source === 'adhoc' || service.id < 0 ? (
            <Text style={styles.selectedSvcAdhocTag}>
              {padAndroidText('This job only')}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={10} style={styles.removeChip}>
          <CrossSmall color="#B91C1C" />
        </TouchableOpacity>
      </View>
      <View style={styles.selectedSvcFieldRow}>
        <View style={styles.selectedSvcFieldCell}>
          <Text style={styles.selectedSvcLbl}>{padAndroidText('Price')}</Text>
          <View style={styles.numFieldWrap}>
            <Text style={styles.numFieldPrefix}>{padAndroidText(currency)}</Text>
            <TextInput
              value={service.customPrice}
              onChangeText={(t) => onUpdate('customPrice', t)}
              keyboardType="decimal-pad"
              style={styles.numFieldInput}
              placeholder="0,00"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>
        <View style={styles.selectedSvcFieldCell}>
          <Text style={styles.selectedSvcLbl}>
            {padAndroidText('Duration')}
          </Text>
          <View style={styles.numFieldWrap}>
            <TextInput
              value={service.customDuration}
              onChangeText={(t) =>
                onUpdate('customDuration', t.replace(/[^0-9]/g, ''))
              }
              keyboardType="number-pad"
              style={styles.numFieldInput}
              placeholder="0"
              placeholderTextColor="#94A3B8"
            />
            <RNText style={styles.numFieldSuffix}>{padAndroidText('min')}</RNText>
          </View>
        </View>
      </View>
    </View>
  );
}

// =========================================================================
// Step 3 · Details
// =========================================================================

function DetailsStep({
  client,
  currency,
  admin,
  teamUsers,
  assigneeId,
  assigneeName,
  showAssignList,
  onToggleAssignList,
  onPickAssignee,
  timeFrom,
  timeTo,
  onTimeFrom,
  onTimeTo,
  note,
  onNote,
  secureNotes,
  loadingSecureNotes,
  savedNoteFromId,
  onUseSavedNote,
  selectedServices,
  onPatchServiceLine,
  subtotal,
  totalDuration,
  insets,
}: {
  client: ClientPick | null;
  currency: string;
  admin: boolean;
  teamUsers: TeamUser[];
  assigneeId: number;
  assigneeName: string;
  showAssignList: boolean;
  onToggleAssignList: () => void;
  onPickAssignee: (id: number) => void;
  timeFrom: string;
  timeTo: string;
  onTimeFrom: (v: string) => void;
  onTimeTo: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
  secureNotes: ClientSecureNote[];
  loadingSecureNotes: boolean;
  savedNoteFromId: number | null;
  onUseSavedNote: (n: ClientSecureNote) => void;
  selectedServices: SelectedService[];
  onPatchServiceLine: (
    id: number,
    patch: { customPrice: string; customDuration: string },
  ) => void;
  subtotal: number;
  totalDuration: number;
  insets: { bottom: number };
}) {
  const showAssignChip = admin && teamUsers.length > 1;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editService, setEditService] = useState<SelectedService | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editDuration, setEditDuration] = useState('');

  useEffect(() => {
    if (editService) {
      setEditPrice(editService.customPrice);
      setEditDuration(editService.customDuration);
    }
  }, [editService]);
  const timeSummary = useMemo(() => {
    if (timeFrom && timeTo) return `${timeFrom} – ${timeTo}`;
    if (timeFrom) return timeFrom;
    return 'Anytime that day';
  }, [timeFrom, timeTo]);
  const hasTime = !!(timeFrom || timeTo);

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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Totals card */}
        <View style={styles.totalsCard}>
          <Text style={styles.totalsLbl}>{padAndroidText('Job total')}</Text>
          <RNText
            style={styles.totalsValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {padAndroidText(fmtMoney(subtotal, currency))}
          </RNText>
          <View style={styles.totalsBreakdown}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLbl}>
                {padAndroidText('Services')}
              </Text>
              <Text style={styles.totalsRowVal}>
                {padAndroidText(
                  String(selectedServices.length) +
                    (selectedServices.length === 1 ? ' service' : ' services'),
                )}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLbl}>
                {padAndroidText('Estimated duration')}
              </Text>
              <RNText
                style={styles.totalsRowVal}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {fmtMinutes(totalDuration)}
              </RNText>
            </View>
          </View>
        </View>

        {/* Time */}
        <Text style={styles.sectionTitle}>{padAndroidText('Time')}</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setPickerOpen(true)}
          style={styles.timePickerTrigger}
        >
          <View style={styles.timePickerTriggerMain}>
            <Text style={styles.timePickerTriggerLbl}>
              {padAndroidText(hasTime ? 'Scheduled time' : 'No time set')}
            </Text>
            <Text
              style={[
                styles.timePickerTriggerValue,
                !hasTime && styles.timePickerTriggerValueEmpty,
              ]}
              numberOfLines={1}
            >
              {padAndroidText(timeSummary)}
            </Text>
          </View>
          {hasTime ? (
            <TouchableOpacity
              onPress={() => {
                onTimeFrom('');
                onTimeTo('');
              }}
              hitSlop={10}
              style={styles.timePickerClearBtn}
            >
              <Text style={styles.timePickerClearText}>
                {padAndroidText('Clear')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.timePickerOpenBtn}>
              <RNText
                style={styles.timePickerOpenBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                Set time
              </RNText>
            </View>
          )}
        </TouchableOpacity>

        {/* Assignee (admins only) */}
        {showAssignChip ? (
          <>
            <Text style={styles.sectionTitle}>
              {padAndroidText('Assigned to')}
            </Text>
            <View style={styles.formCard}>
              <TouchableOpacity
                style={styles.assignSummaryRow}
                onPress={onToggleAssignList}
                activeOpacity={0.85}
              >
                <Text style={styles.assignName}>
                  {padAndroidText(assigneeName)}
                </Text>
                <ChevronIcon open={showAssignList} color="#475569" />
              </TouchableOpacity>
              {showAssignList ? (
                <View style={styles.assignList}>
                  {teamUsers.map((u, i) => {
                    const on = u.id === assigneeId;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => onPickAssignee(u.id)}
                        style={[
                          styles.assignRow,
                          i > 0 && styles.assignRowBorder,
                          on && styles.assignRowOn,
                        ]}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.assignRowText,
                            on && styles.assignRowTextOn,
                          ]}
                          numberOfLines={1}
                        >
                          {padAndroidText(
                            `${u.first_name} ${u.last_name}`.trim() ||
                              `User #${u.id}`,
                          )}
                        </Text>
                        {on ? (
                          <View style={styles.assignCheck}>
                            <CheckIcon />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Note */}
        <Text style={styles.sectionTitle}>{padAndroidText('Note')}</Text>
        <View style={styles.formCard}>
          <TextInput
            value={note}
            onChangeText={onNote}
            placeholder="Add a note for this job (optional)"
            placeholderTextColor="#94A3B8"
            style={[styles.textField, { minHeight: 96 }]}
            multiline
            textAlignVertical="top"
          />
          {loadingSecureNotes ? (
            <ActivityIndicator
              style={{ paddingVertical: 8 }}
              color="#193434"
            />
          ) : secureNotes.length > 0 ? (
            <>
              <Text
                style={[styles.fieldLbl, { marginTop: 12, marginBottom: 6 }]}
              >
                {padAndroidText('Saved notes for this client')}
              </Text>
              {secureNotes.map((n) => {
                const used = n.id === savedNoteFromId;
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => onUseSavedNote(n)}
                    style={[
                      styles.secureNoteRow,
                      used && styles.secureNoteRowOn,
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.secureNoteText,
                        used && styles.secureNoteTextOn,
                      ]}
                      numberOfLines={2}
                    >
                      {padAndroidText(n.note || '—')}
                    </Text>
                    {used ? (
                      <View style={styles.assignCheck}>
                        <CheckIcon />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
        </View>

        {/* Line items recap */}
        <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>
          {padAndroidText('Services for this job')}
        </Text>
        <Text style={styles.sectionHint}>
          {padAndroidText('Tap a service to edit price or duration for this job.')}
        </Text>
        <View style={styles.formCard}>
          {selectedServices.map((s, idx) => {
            const p = parseFloat(s.customPrice.replace(',', '.'));
            const d = parseInt(s.customDuration, 10);
            return (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.75}
                onPress={() => setEditService(s)}
                style={[styles.lineItem, idx > 0 && styles.lineItemBorder]}
              >
                <View style={styles.lineItemMain}>
                  <Text style={styles.lineItemTitle} numberOfLines={1}>
                    {padAndroidText(s.title)}
                  </Text>
                  <RNText style={styles.lineItemMeta} numberOfLines={2}>
                    {`${fmtMinutes(Number.isFinite(d) ? d : 0)} · ${fmtMoney(
                      Number.isFinite(p) ? p : 0,
                      currency,
                    )}`}
                  </RNText>
                </View>
                <Text style={styles.lineItemAmount}>
                  {padAndroidText(
                    fmtMoney(Number.isFinite(p) ? p : 0, currency),
                  )}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={editService != null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditService(null)}
      >
        <View style={styles.editLineModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setEditService(null)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editLineModalCenter}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.editLineModalCard,
                { marginBottom: 20 + insets.bottom },
              ]}
            >
              <Text style={styles.editLineModalTitle} numberOfLines={2}>
                {editService ? padAndroidText(editService.title) : ''}
              </Text>
              <Text style={styles.editLineModalHint}>
                {padAndroidText(
                  'Price and duration apply only to this job.',
                )}
              </Text>
              <Text style={styles.fieldLbl}>
                {padAndroidText('Price')}
              </Text>
              <TextInput
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#94A3B8"
                style={styles.textField}
              />
              <Text style={[styles.fieldLbl, { marginTop: 12 }]}>
                {padAndroidText('Duration (minutes)')}
              </Text>
              <TextInput
                value={editDuration}
                onChangeText={(t) =>
                  setEditDuration(t.replace(/[^0-9]/g, ''))
                }
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#94A3B8"
                style={styles.textField}
              />
              <View style={styles.editLineModalActions}>
                <TouchableOpacity
                  style={[
                    styles.editLineModalBtn,
                    styles.editLineModalBtnGhost,
                  ]}
                  onPress={() => setEditService(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.editLineModalBtnGhostText}>
                    {padAndroidText('Cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.editLineModalBtn,
                    styles.editLineModalBtnPrimary,
                  ]}
                  onPress={() => {
                    if (!editService) return;
                    const p = parseFloat(
                      String(editPrice).replace(',', '.'),
                    );
                    const d = parseInt(String(editDuration), 10);
                    if (!Number.isFinite(p) || p < 0) {
                      Alert.alert('Check price', 'Enter a valid price.');
                      return;
                    }
                    if (!Number.isFinite(d) || d < 1) {
                      Alert.alert(
                        'Check duration',
                        'Enter duration in whole minutes (at least 1).',
                      );
                      return;
                    }
                    const rounded =
                      Math.round(p * 100) % 100 === 0
                        ? String(Math.round(p))
                        : String(Math.round(p * 100) / 100);
                    onPatchServiceLine(editService.id, {
                      customPrice: rounded,
                      customDuration: String(d),
                    });
                    setEditService(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.editLineModalBtnPrimaryText}>
                    {padAndroidText('Save')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <JobTimePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialFrom={timeFrom}
        initialTo={timeTo}
        onApply={(from, to) => {
          onTimeFrom(from);
          onTimeTo(to);
        }}
      />
    </KeyboardAvoidingView>
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
    maxWidth: 240,
  },

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

  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#193434',
    borderRadius: 12,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  errorText: { fontSize: 14, color: '#B91C1C', textAlign: 'center' },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },

  newClientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F0F5F2',
    borderWidth: 1,
    borderColor: '#BFD1C5',
  },
  newClientBtnPlus: {
    fontSize: 22,
    fontWeight: '800',
    color: '#193434',
    lineHeight: 24,
  },
  newClientBtnText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
  },

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

  emptyBox: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },

  // services step
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
    paddingHorizontal: 10,
    flexShrink: 0,
    includeFontPadding: false,
  } as any,

  selectedSvcCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3DD57A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  selectedSvcHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedSvcTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
  },
  selectedSvcAdhocTag: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  removeChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSvcFieldRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  selectedSvcFieldCell: { flex: 1 },
  selectedSvcLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  numFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    minHeight: 40,
  },
  numFieldPrefix: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginRight: 6,
  },
  numFieldSuffix: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginLeft: 6,
  },
  numFieldInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },

  servicePickerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  serviceRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  serviceRowMain: { flex: 1, minWidth: 0, paddingRight: 4 },
  serviceTitle: { fontSize: 14, fontWeight: '700', color: '#193434' },
  serviceMeta: { marginTop: 2, fontSize: 12, color: '#64748B' },
  serviceAddBtn: {
    flexShrink: 0,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#E6F2EC',
  },
  serviceAddText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
    textAlign: 'center',
    includeFontPadding: false,
    ...(Platform.OS === 'android'
      ? ({ textBreakStrategy: 'simple' } as const)
      : {}),
  },

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
  totalsValue: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 8,
    includeFontPadding: false,
  } as any,
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
  totalsRowLbl: {
    fontSize: 13,
    color: '#BFD1C5',
    flex: 1,
    minWidth: 0,
  },
  totalsRowVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    flexShrink: 0,
    marginLeft: 10,
    textAlign: 'right',
    maxWidth: '46%',
    paddingRight: 2,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 10,
    lineHeight: 16,
  },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },

  fieldLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.4,
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

  timePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    gap: 10,
  },
  timePickerTriggerMain: { flex: 1, minWidth: 0 },
  timePickerTriggerLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 2,
    letterSpacing: 0.4,
  },
  timePickerTriggerValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
  },
  timePickerTriggerValueEmpty: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  timePickerOpenBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#193434',
    minWidth: 128,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerOpenBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    includeFontPadding: false,
  } as any,
  timePickerClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
  },
  timePickerClearText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
  },

  assignSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  assignName: { fontSize: 15, fontWeight: '700', color: '#193434' },
  assignList: { marginTop: 8 },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  assignRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  assignRowOn: {},
  assignRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#193434',
  },
  assignRowTextOn: { fontWeight: '800' },
  assignCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3DD57A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secureNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    gap: 8,
  },
  secureNoteRowOn: {
    backgroundColor: '#E6F2EC',
    borderColor: '#3DD57A',
  },
  secureNoteText: { flex: 1, fontSize: 13, color: '#475569' },
  secureNoteTextOn: { color: '#0F766E', fontWeight: '700' },

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
  lineItemAmount: { fontSize: 14, fontWeight: '800', color: '#193434', flexShrink: 0 },

  editLineModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
  },
  editLineModalCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  editLineModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E7ECE9',
  },
  editLineModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
  },
  editLineModalHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 17,
  },
  editLineModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  editLineModalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLineModalBtnPrimary: { backgroundColor: '#193434' },
  editLineModalBtnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  editLineModalBtnGhost: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editLineModalBtnGhostText: {
    color: '#193434',
    fontWeight: '700',
    fontSize: 15,
  },

  muted: { fontSize: 13, color: '#94A3B8', paddingVertical: 8 },

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
  btnPrimaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: 8,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    flexShrink: 1,
    textAlign: 'center',
    includeFontPadding: false,
  } as any,
  btnGhost: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flex: 0.55,
  },
  btnGhostText: { color: '#193434', fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#CBD5E1' },
});
