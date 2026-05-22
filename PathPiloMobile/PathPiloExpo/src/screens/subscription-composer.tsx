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

const TIME_RE = /^\d{2}:\d{2}$/;

async function ensureAuthHeader(): Promise<void> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

// --- formatting ----------------------------------------------------------

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
  if (!minutes || !Number.isFinite(minutes)) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtFullDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function fmtIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function todayIso(): string {
  return fmtIsoDay(new Date());
}

const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const WEEKDAY_SHORT_CHIPS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAY_TINY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Mirrors the platform's calculateFirstOccurrence / calculateFirstMonthlyOccurrence.
function buildWeeklyForecast(
  startingDate: string,
  dayOfWeek: number,
  intervalWeeks: number,
  count = 12,
): Date[] {
  if (!startingDate) return [];
  const [y, m, d] = startingDate.split('-').map(Number);
  if (!y || !m || !d) return [];
  const start = new Date(y, m - 1, d);
  const daysToAdd = (dayOfWeek - start.getDay() + 7) % 7;
  const base = new Date(start);
  base.setDate(start.getDate() + daysToAdd);
  const dates: Date[] = [];
  const cur = new Date(base);
  for (let i = 0; i < count; i++) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + intervalWeeks * 7);
  }
  return dates;
}

function buildMonthlyForecast(
  startingDate: string,
  dayOfMonth: number,
  intervalMonths: number,
  count = 12,
): Date[] {
  if (!startingDate || !dayOfMonth) return [];
  const [y, m, d] = startingDate.split('-').map(Number);
  if (!y || !m || !d) return [];
  let baseYear = y;
  let baseMonth = m - 1;
  if (dayOfMonth < d) {
    baseMonth += 1;
    if (baseMonth > 11) {
      baseMonth = 0;
      baseYear++;
    }
  }
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const totalMonths = baseMonth + i * intervalMonths;
    const yr = baseYear + Math.floor(totalMonths / 12);
    const mo = totalMonths % 12;
    const lastDay = new Date(yr, mo + 1, 0).getDate();
    dates.push(new Date(yr, mo, Math.min(dayOfMonth, lastDay)));
  }
  return dates;
}

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

function CalendarIcon({ color = '#0F766E' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M7 4v3m10-3v3M4 9.5h16M5 7h14a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ChevronArrow({
  dir,
  color = '#193434',
}: {
  dir: 'left' | 'right';
  color?: string;
}) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'}
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
  source?: 'adhoc';
};

type TeamUser = {
  id: number;
  first_name: string;
  last_name: string;
};

type RecurringJobService = {
  id?: number;
  service_id?: number | null;
  custom_title?: string | null;
  custom_price?: number | string | null;
  custom_duration_minutes?: number | string | null;
  title?: string | null;
};

type SubscriptionDraft = {
  id: number;
  title?: string | null;
  client_id: number;
  assigned_user_id?: number | null;
  starting_date?: string;
  recurrence_type?: 'weekly' | 'monthly';
  day_of_week?: number | null;
  day_of_month?: number | null;
  interval_value?: number | null;
  scheduled_time_from?: string | null;
  scheduled_time_to?: string | null;
  note?: string | null;
  services?: RecurringJobService[];
};

type Step = 'client' | 'services' | 'schedule' | 'details';

const STEP_LABELS: Record<Step, string> = {
  client: 'Client',
  services: 'Services',
  schedule: 'Schedule',
  details: 'Details',
};
const STEP_ORDER: Step[] = ['client', 'services', 'schedule', 'details'];

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

export function MobileSubscriptionComposerScreen(props: any) {
  const { route, navigation } = props;
  const {
    company,
    user,
    presetClientId,
    editingId,
    initial,
  }: {
    company: any;
    user: any;
    presetClientId?: number;
    editingId?: number;
    initial?: SubscriptionDraft;
  } = route.params || {};

  const insets = useSafeAreaInsets();
  const admin = isAdminRole(company);
  const currency = clientCurrency(company);

  const isEditing = Boolean(editingId);
  const lockClient = Boolean(presetClientId || editingId);

  // ── Step state ─────────────────────────────────────────────────────────
  const initialStep: Step = lockClient ? 'services' : 'client';
  const [step, setStep] = useState<Step>(initialStep);
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
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>(
    [],
  );

  const [title, setTitle] = useState<string>('');
  const titleAutoRef = useRef<string>('');

  // schedule
  const [startingDate, setStartingDate] = useState<string>(todayIso());
  const [recurrenceType, setRecurrenceType] = useState<'weekly' | 'monthly'>(
    'weekly',
  );
  const [dayOfWeek, setDayOfWeek] = useState<number>(new Date().getDay());
  const [intervalWeeks, setIntervalWeeks] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(
    Math.min(new Date().getDate(), 28),
  );
  const [intervalMonths, setIntervalMonths] = useState<number>(1);

  // calendar popup
  const [pickerOpen, setPickerOpen] = useState(false);

  // details
  const [assigneeId, setAssigneeId] = useState<number | null>(user?.id ?? null);
  const [showAssignList, setShowAssignList] = useState(false);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [note, setNote] = useState('');
  const [timePickerOpen, setTimePickerOpen] = useState(false);

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

      const clientList: ClientPick[] = (cRes.data?.clients || []).map(
        clientRowToPick,
      );
      setClients(clientList);

      const serviceList: ServicePick[] = (sRes.data?.services || [])
        .filter((s: any) => !s.archived_at)
        .map((s: any) => ({
          id: s.id,
          title: s.title || s.name || 'Service',
          price: s.price,
          duration_minutes: Number(s.duration_minutes) || 0,
        }));
      setServices(serviceList);

      setTeamUsers(
        ((uRes as any)?.data?.users || []).map((u: any) => ({
          id: u.id,
          first_name: u.first_name || '',
          last_name: u.last_name || '',
        })),
      );

      // Pre-fill client when locked
      if (presetClientId) {
        const found = clientList.find((c) => c.id === Number(presetClientId));
        if (found) setSelectedClient(found);
      }
      if (initial && initial.client_id) {
        const found = clientList.find((c) => c.id === Number(initial.client_id));
        if (found) setSelectedClient(found);
      }
      // Pre-fill services when editing
      if (initial?.services && Array.isArray(initial.services)) {
        const mapped: SelectedService[] = initial.services
          .filter((row) => Number(row.service_id))
          .map((row) => {
            const baseService = serviceList.find(
              (s) => s.id === Number(row.service_id),
            );
            const fallback: ServicePick = baseService || {
              id: Number(row.service_id) || 0,
              title:
                row.title ||
                row.custom_title ||
                `Service #${row.service_id}`,
              price: row.custom_price ?? 0,
              duration_minutes: Number(row.custom_duration_minutes) || 0,
            };
            const customPrice = String(
              row.custom_price != null
                ? Number(row.custom_price)
                : Number(fallback.price) || 0,
            );
            const customDuration = String(
              row.custom_duration_minutes != null
                ? Number(row.custom_duration_minutes)
                : fallback.duration_minutes || 0,
            );
            return { ...fallback, customPrice, customDuration };
          });
        setSelectedServices(mapped);
      }
      // Pre-fill the rest when editing
      if (initial) {
        setTitle(String(initial.title || ''));
        if (initial.starting_date) {
          const isoDay = String(initial.starting_date).split('T')[0];
          setStartingDate(isoDay);
        }
        if (initial.recurrence_type) {
          setRecurrenceType(initial.recurrence_type);
        }
        if (initial.day_of_week != null) setDayOfWeek(Number(initial.day_of_week));
        if (initial.day_of_month != null) {
          setDayOfMonth(Number(initial.day_of_month));
        }
        if (initial.interval_value != null) {
          if (initial.recurrence_type === 'monthly') {
            setIntervalMonths(Number(initial.interval_value) || 1);
          } else {
            setIntervalWeeks(Number(initial.interval_value) || 1);
          }
        }
        if (initial.scheduled_time_from) {
          setTimeFrom(
            String(initial.scheduled_time_from).slice(0, 5) || '',
          );
        }
        if (initial.scheduled_time_to) {
          setTimeTo(String(initial.scheduled_time_to).slice(0, 5) || '');
        }
        if (initial.note) setNote(String(initial.note));
        if (initial.assigned_user_id != null) {
          setAssigneeId(Number(initial.assigned_user_id));
        }
      }
    } catch (e: any) {
      setLoadError(
        e?.response?.data?.error || e?.message || 'Could not load data.',
      );
    } finally {
      setLoading(false);
    }
  }, [presetClientId, initial]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Derived ────────────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) {
      return [...clients]
        .sort((a, b) => clientFullLine(a).localeCompare(clientFullLine(b)))
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

  const visitsPerYear = useMemo(() => {
    if (recurrenceType === 'weekly') {
      const i = Math.max(1, intervalWeeks);
      return Math.round(52 / i);
    }
    const i = Math.max(1, intervalMonths);
    return Math.round(12 / i);
  }, [recurrenceType, intervalWeeks, intervalMonths]);

  const revenuePerYear = useMemo(
    () => subtotal * visitsPerYear,
    [subtotal, visitsPerYear],
  );

  const forecastDates = useMemo(() => {
    if (recurrenceType === 'weekly') {
      return buildWeeklyForecast(
        startingDate,
        dayOfWeek,
        Math.max(1, intervalWeeks),
        12,
      );
    }
    return buildMonthlyForecast(
      startingDate,
      dayOfMonth,
      Math.max(1, intervalMonths),
      12,
    );
  }, [
    recurrenceType,
    startingDate,
    dayOfWeek,
    intervalWeeks,
    dayOfMonth,
    intervalMonths,
  ]);

  const recurrencePreview = useMemo(() => {
    if (recurrenceType === 'weekly') {
      const dayName = WEEKDAY_LONG[dayOfWeek] || 'day';
      if (intervalWeeks === 1) return `Every ${dayName}`;
      return `Every ${intervalWeeks} weeks · ${dayName}`;
    }
    if (intervalMonths === 1) return `Monthly on the ${ordinal(dayOfMonth)}`;
    return `Every ${intervalMonths} months · ${ordinal(dayOfMonth)}`;
  }, [recurrenceType, dayOfWeek, intervalWeeks, dayOfMonth, intervalMonths]);

  const assigneeName = useMemo(() => {
    if (assigneeId == null) return 'Unassigned';
    const u = teamUsers.find((x) => x.id === assigneeId);
    if (!u) return 'You';
    return `${u.first_name} ${u.last_name}`.trim() || 'Employee';
  }, [teamUsers, assigneeId]);

  // Auto-suggest a title once we have a client
  useEffect(() => {
    if (!selectedClient || isEditing) return;
    const suggestion = `Recurring · ${clientFullLine(selectedClient)}`;
    if (!title.trim() || title === titleAutoRef.current) {
      setTitle(suggestion);
      titleAutoRef.current = suggestion;
    }
  }, [selectedClient, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

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
      !isEditing &&
      (selectedClient ||
        selectedServices.length > 0 ||
        timeFrom ||
        timeTo ||
        note.trim() ||
        title.trim().length > titleAutoRef.current.length)
    ) {
      Alert.alert('Discard subscription?', 'You will lose your progress.', [
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
    goToStep('schedule', 'forward');
  };

  const onContinueFromSchedule = () => {
    if (!startingDate) {
      Alert.alert('Pick a starting date', 'Select when this should begin.');
      return;
    }
    goToStep('details', 'forward');
  };

  const submit = async () => {
    if (!selectedClient || selectedServices.length === 0 || submitting) return;
    if (!title.trim()) {
      Alert.alert('Add a title', 'Subscriptions need a name to identify them.');
      return;
    }
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

    const payload: any = {
      title: title.trim(),
      client_id: selectedClient.id,
      assigned_user_id: assigneeId ?? null,
      starting_date: startingDate,
      recurrence_type: recurrenceType,
      day_of_week: recurrenceType === 'weekly' ? dayOfWeek : null,
      day_of_month: recurrenceType === 'monthly' ? dayOfMonth : null,
      interval_value:
        recurrenceType === 'weekly'
          ? Math.max(1, intervalWeeks)
          : Math.max(1, intervalMonths),
      scheduled_time_from: tf || null,
      scheduled_time_to: tt || null,
      note: note.trim() || null,
      services: selectedServices.map((s) => {
        const custom_price =
          parseFloat(s.customPrice.replace(',', '.')) || 0;
        const custom_duration = parseInt(s.customDuration, 10) || 0;
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
    };

    setSubmitting(true);
    try {
      await ensureAuthHeader();
      if (isEditing && editingId) {
        await apiClient.put(`/subscriptions/${editingId}`, payload);
      } else {
        await apiClient.post('/subscriptions', payload);
      }
      navigation.goBack();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        'Could not save the subscription. Please try again.';
      Alert.alert('Could not save', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const stepIdx = STEP_ORDER.indexOf(step);

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
          <Text style={styles.titleText}>
            {padAndroidText(isEditing ? 'Edit subscription' : 'New subscription')}
          </Text>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {padAndroidText(recurrencePreview)}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <Stepper
        step={stepIdx}
        labels={STEP_ORDER.map((k) => STEP_LABELS[k])}
        skipped={lockClient ? [0] : []}
      />

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
              onChangeClient={
                lockClient ? null : () => goToStep('client', 'back')
              }
              insets={insets}
            />
          ) : null}

          {step === 'schedule' ? (
            <ScheduleStep
              startingDate={startingDate}
              onPickDate={() => setPickerOpen(true)}
              recurrenceType={recurrenceType}
              onRecurrenceType={(t) => {
                LayoutAnimation.configureNext(SNAPPY);
                setRecurrenceType(t);
              }}
              dayOfWeek={dayOfWeek}
              onDayOfWeek={(d) => setDayOfWeek(d)}
              intervalWeeks={intervalWeeks}
              onIntervalWeeks={(n) => setIntervalWeeks(n)}
              dayOfMonth={dayOfMonth}
              onDayOfMonth={(d) => setDayOfMonth(d)}
              intervalMonths={intervalMonths}
              onIntervalMonths={(n) => setIntervalMonths(n)}
              recurrencePreview={recurrencePreview}
              forecastDates={forecastDates}
              currency={currency}
              pricePerVisit={subtotal}
              durationPerVisit={totalDuration}
              visitsPerYear={visitsPerYear}
              revenuePerYear={revenuePerYear}
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
              title={title}
              onTitle={setTitle}
              timeFrom={timeFrom}
              timeTo={timeTo}
              onOpenTimePicker={() => setTimePickerOpen(true)}
              onClearTime={() => {
                setTimeFrom('');
                setTimeTo('');
              }}
              note={note}
              onNote={setNote}
              selectedServices={selectedServices}
              subtotal={subtotal}
              totalDuration={totalDuration}
              recurrencePreview={recurrencePreview}
              startingDate={startingDate}
              forecastDates={forecastDates}
              visitsPerYear={visitsPerYear}
              revenuePerYear={revenuePerYear}
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
          {step === 'services' && !lockClient ? (
            <TouchableOpacity
              onPress={() => goToStep('client', 'back')}
              style={[styles.btn, styles.btnGhost]}
              activeOpacity={0.85}
              disabled={submitting}
            >
              <RNText style={styles.btnGhostText}>{padAndroidText('Back')}</RNText>
            </TouchableOpacity>
          ) : null}
          {step === 'schedule' ? (
            <TouchableOpacity
              onPress={() => goToStep('services', 'back')}
              style={[styles.btn, styles.btnGhost]}
              activeOpacity={0.85}
              disabled={submitting}
            >
              <RNText style={styles.btnGhostText}>{padAndroidText('Back')}</RNText>
            </TouchableOpacity>
          ) : null}
          {step === 'details' ? (
            <TouchableOpacity
              onPress={() => goToStep('schedule', 'back')}
              style={[styles.btn, styles.btnGhost]}
              activeOpacity={0.85}
              disabled={submitting}
            >
              <RNText style={styles.btnGhostText}>{padAndroidText('Back')}</RNText>
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
              <RNText style={styles.btnPrimaryText}>
                {padAndroidText(
                  selectedServices.length === 0
                    ? 'Add a service'
                    : `Continue · ${fmtMoney(subtotal, currency)}`,
                )}
              </RNText>
            </TouchableOpacity>
          ) : step === 'schedule' ? (
            <TouchableOpacity
              onPress={onContinueFromSchedule}
              style={[styles.btn, styles.btnPrimary]}
              activeOpacity={0.85}
            >
              <RNText style={styles.btnPrimaryText}>
                {padAndroidText('Continue')}
              </RNText>
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
                      isEditing
                        ? `Save · ${fmtMoney(subtotal, currency)}`
                        : `Create subscription · ${fmtMoney(subtotal, currency)}`,
                    )}
                  </RNText>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Date picker modal */}
      <CalendarPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={startingDate}
        onPick={(iso) => {
          setStartingDate(iso);
          // also adjust day-of-week/day-of-month defaults to match picked date
          const [y, m, d] = iso.split('-').map(Number);
          if (y && m && d) {
            const picked = new Date(y, m - 1, d);
            setDayOfWeek(picked.getDay());
            setDayOfMonth(Math.min(picked.getDate(), 28));
          }
          setPickerOpen(false);
        }}
      />

      {/* Time picker reuse */}
      <JobTimePickerModal
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        initialFrom={timeFrom}
        initialTo={timeTo}
        onApply={(from, to) => {
          setTimeFrom(from);
          setTimeTo(to);
        }}
      />

      <ServiceCreateSheet
        visible={createServiceOpen}
        scope="subscription"
        insets={{ top: insets.top, bottom: insets.bottom }}
        onClose={() => setCreateServiceOpen(false)}
        onComplete={handleInlineServiceCreated}
      />

      {!lockClient ? (
        <ClientCreateSheet
          visible={createClientOpen}
          onClose={() => setCreateClientOpen(false)}
          onCreated={onInlineClientCreated}
        />
      ) : null}
    </View>
  );
}

// =========================================================================
// Stepper
// =========================================================================

function Stepper({
  step,
  labels,
  skipped = [],
}: {
  step: number;
  labels: string[];
  skipped?: number[];
}) {
  return (
    <View style={styles.stepperWrap}>
      {labels.map((label, i) => {
        const done = i < step || skipped.includes(i);
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
            'Pick who this subscription is for. Type to search by name, address, or email.',
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
  onChangeClient: null | (() => void);
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
          {onChangeClient ? (
            <TouchableOpacity onPress={onChangeClient} hitSlop={10}>
              <Text style={styles.clientPillChange}>
                {padAndroidText('Change')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.stepTitle}>{padAndroidText('Add services')}</Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'Pick what gets done at every visit. Tap to add — adjust price or duration on each one if needed.',
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
                    <RNText style={styles.serviceAddText}>
                      {padAndroidText('+ Add')}
                    </RNText>
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
              {padAndroidText('This subscription only')}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={10}
          style={styles.removeChip}
        >
          <CrossSmall color="#B91C1C" />
        </TouchableOpacity>
      </View>
      <View style={styles.selectedSvcFieldRow}>
        <View style={styles.selectedSvcFieldCell}>
          <Text style={styles.selectedSvcLbl}>{padAndroidText('Price')}</Text>
          <View style={styles.numFieldWrap}>
            <Text style={styles.numFieldPrefix}>
              {padAndroidText(currency)}
            </Text>
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
            <Text style={styles.numFieldSuffix}>{padAndroidText('min')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// =========================================================================
// Step 3 · Schedule
// =========================================================================

function ScheduleStep({
  startingDate,
  onPickDate,
  recurrenceType,
  onRecurrenceType,
  dayOfWeek,
  onDayOfWeek,
  intervalWeeks,
  onIntervalWeeks,
  dayOfMonth,
  onDayOfMonth,
  intervalMonths,
  onIntervalMonths,
  recurrencePreview,
  forecastDates,
  currency,
  pricePerVisit,
  durationPerVisit,
  visitsPerYear,
  revenuePerYear,
  insets,
}: {
  startingDate: string;
  onPickDate: () => void;
  recurrenceType: 'weekly' | 'monthly';
  onRecurrenceType: (t: 'weekly' | 'monthly') => void;
  dayOfWeek: number;
  onDayOfWeek: (n: number) => void;
  intervalWeeks: number;
  onIntervalWeeks: (n: number) => void;
  dayOfMonth: number;
  onDayOfMonth: (n: number) => void;
  intervalMonths: number;
  onIntervalMonths: (n: number) => void;
  recurrencePreview: string;
  forecastDates: Date[];
  currency: string;
  pricePerVisit: number;
  durationPerVisit: number;
  visitsPerYear: number;
  revenuePerYear: number;
  insets: { bottom: number };
}) {
  const startDateObj = useMemo(() => {
    const [y, m, d] = startingDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, [startingDate]);

  return (
    <ScrollView
      style={styles.stepBody}
      contentContainerStyle={[
        styles.detailsScroll,
        { paddingBottom: 140 + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{padAndroidText('Set the cadence')}</Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'Pick how often this should run. We’ll generate jobs on schedule.',
          )}
        </Text>
      </View>

      {/* Starting date */}
      <Text style={styles.sectionTitle}>{padAndroidText('Starting date')}</Text>
      <TouchableOpacity
        style={styles.bigPicker}
        activeOpacity={0.85}
        onPress={onPickDate}
      >
        <View style={styles.bigPickerIconWrap}>
          <CalendarIcon />
        </View>
        <View style={styles.bigPickerMain}>
          <Text style={styles.bigPickerLbl}>
            {padAndroidText('First occurrence on or after')}
          </Text>
          <Text style={styles.bigPickerVal} numberOfLines={1}>
            {padAndroidText(
              startDateObj ? fmtFullDate(startDateObj) : 'Pick a date',
            )}
          </Text>
        </View>
        <View style={styles.bigPickerCta}>
          <Text style={styles.bigPickerCtaText}>
            {padAndroidText('Change')}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Recurrence type */}
      <Text style={styles.sectionTitle}>{padAndroidText('Repeats')}</Text>
      <View style={styles.recRow}>
        {(['weekly', 'monthly'] as const).map((t) => {
          const on = recurrenceType === t;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.recChip, on && styles.recChipOn]}
              onPress={() => onRecurrenceType(t)}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.recChipText, on && styles.recChipTextOn]}
              >
                {padAndroidText(t === 'weekly' ? 'Weekly' : 'Monthly')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Weekly controls */}
      {recurrenceType === 'weekly' ? (
        <>
          <Text style={styles.sectionTitle}>
            {padAndroidText('Day of week')}
          </Text>
          <View style={styles.dowRow}>
            {WEEKDAY_SHORT_CHIPS.map((label, idx) => {
              const on = dayOfWeek === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.dowChip, on && styles.dowChipOn]}
                  onPress={() => onDayOfWeek(idx)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.dowChipText, on && styles.dowChipTextOn]}
                  >
                    {padAndroidText(label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>
            {padAndroidText('Repeat every')}
          </Text>
          {/*
            3×2 grid: 1, 2, 3, 4, 6 + custom weeks cell. Mirrors the new web
            SchedulePanel (`btnChoice`) — preset chips for the common cadences
            and a single number input for anything else. Custom is "active"
            (dark) whenever the current value is not one of the presets.
          */}
          <View style={styles.intervalGrid}>
            {[1, 2, 3, 4, 6].map((n) => {
              const on = intervalWeeks === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.intervalCell, on && styles.intervalCellOn]}
                  onPress={() => onIntervalWeeks(n)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.intervalCellText,
                      on && styles.intervalCellTextOn,
                    ]}
                  >
                    {padAndroidText(n === 1 ? 'Weekly' : `${n} wks`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {(() => {
              const presets = [1, 2, 3, 4, 6];
              const isCustom = !presets.includes(intervalWeeks);
              return (
                <View
                  style={[
                    styles.intervalCell,
                    styles.intervalCellCustom,
                    isCustom && styles.intervalCellOn,
                  ]}
                >
                  <TextInput
                    style={[
                      styles.intervalCellInput,
                      isCustom && styles.intervalCellInputOn,
                    ]}
                    value={isCustom ? String(intervalWeeks) : ''}
                    onChangeText={(t) => {
                      const digits = t.replace(/[^0-9]/g, '');
                      if (!digits) return;
                      const n = Math.max(1, Math.min(52, parseInt(digits, 10)));
                      onIntervalWeeks(n);
                    }}
                    keyboardType="number-pad"
                    placeholder="N"
                    placeholderTextColor="#94A3B8"
                    maxLength={2}
                  />
                  <Text
                    style={[
                      styles.intervalCellSuffix,
                      isCustom && styles.intervalCellTextOn,
                    ]}
                  >
                    {padAndroidText('wks')}
                  </Text>
                </View>
              );
            })()}
          </View>
        </>
      ) : null}

      {/* Monthly controls */}
      {recurrenceType === 'monthly' ? (
        <>
          <Text style={styles.sectionTitle}>
            {padAndroidText('Day of month')}
          </Text>
          <View style={styles.domGrid}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
              const on = dayOfMonth === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.domChip, on && styles.domChipOn]}
                  onPress={() => onDayOfMonth(d)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.domChipText, on && styles.domChipTextOn]}
                  >
                    {padAndroidText(String(d))}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {padAndroidText(
              'Limited to 1–28 to ensure it works in every month (e.g. February).',
            )}
          </Text>

          {/*
            Monthly cadence: simplified to a single number input. The web
            version dropped the [1, 2, 3] / Quarterly / Yearly presets in
            favour of "Repeat every N months" because the presets covered
            barely any real-world cases. Default value is 1 (every month);
            anything 1–24 is accepted.
          */}
          <Text style={styles.sectionTitle}>
            {padAndroidText('Repeat every')}
          </Text>
          <View style={styles.monthIntervalRow}>
            <TextInput
              style={styles.monthIntervalInput}
              value={String(intervalMonths || 1)}
              onChangeText={(t) => {
                const digits = t.replace(/[^0-9]/g, '');
                if (!digits) { onIntervalMonths(1); return; }
                const n = Math.max(1, Math.min(24, parseInt(digits, 10)));
                onIntervalMonths(n);
              }}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
            />
            <Text style={styles.monthIntervalSuffix}>
              {padAndroidText(intervalMonths === 1 ? 'month' : 'months')}
            </Text>
          </View>
          <Text style={styles.hint}>
            {padAndroidText(
              'Enter how many months between visits. 1 = every month, 2 = every other month, 3 = quarterly, etc.',
            )}
          </Text>
        </>
      ) : null}

      {/* Preview card */}
      <View style={styles.previewCard}>
        <Text style={styles.previewKicker}>
          {padAndroidText('Schedule preview')}
        </Text>
        <Text style={styles.previewTitle}>
          {padAndroidText(recurrencePreview)}
        </Text>
        {startDateObj ? (
          <Text style={styles.previewSub}>
            {padAndroidText(`Starting ${fmtFullDate(startDateObj)}`)}
          </Text>
        ) : null}
        {pricePerVisit > 0 ? (
          <View style={styles.previewStats}>
            <View style={styles.previewStatCell}>
              <Text style={styles.previewStatVal}>
                {padAndroidText(fmtMoney(pricePerVisit, currency))}
              </Text>
              <Text style={styles.previewStatLbl}>
                {padAndroidText('per visit')}
              </Text>
            </View>
            <View style={styles.previewStatSep} />
            <View style={styles.previewStatCell}>
              <Text style={styles.previewStatVal}>
                {padAndroidText(`~${visitsPerYear}×`)}
              </Text>
              <Text style={styles.previewStatLbl}>
                {padAndroidText('per year')}
              </Text>
            </View>
            <View style={styles.previewStatSep} />
            <View style={styles.previewStatCell}>
              <Text style={styles.previewStatVal}>
                {padAndroidText(fmtMoney(revenuePerYear, currency))}
              </Text>
              <Text style={styles.previewStatLbl}>
                {padAndroidText('annually')}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Forecast */}
      {forecastDates.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {padAndroidText(`Next ${forecastDates.length} occurrences`)}
          </Text>
          <View style={styles.forecastCard}>
            {forecastDates.map((d, i) => {
              const isNext = i === 0;
              return (
                <View
                  key={`${d.toISOString()}-${i}`}
                  style={[styles.forecastRow, isNext && styles.forecastRowNext]}
                >
                  <View
                    style={[
                      styles.forecastDateBox,
                      isNext && styles.forecastDateBoxNext,
                    ]}
                  >
                    <Text
                      style={[
                        styles.forecastMonth,
                        isNext && styles.forecastMonthNext,
                      ]}
                    >
                      {padAndroidText(
                        d
                          .toLocaleDateString('en-GB', { month: 'short' })
                          .toUpperCase(),
                      )}
                    </Text>
                    <Text
                      style={[
                        styles.forecastDay,
                        isNext && styles.forecastDayNext,
                      ]}
                    >
                      {padAndroidText(String(d.getDate()))}
                    </Text>
                  </View>
                  <View style={styles.forecastMain}>
                    <Text
                      style={[
                        styles.forecastTitle,
                        isNext && styles.forecastTitleNext,
                      ]}
                      numberOfLines={1}
                    >
                      {padAndroidText(WEEKDAY_LONG[d.getDay()] || '—')}
                    </Text>
                    <Text style={styles.forecastSub} numberOfLines={1}>
                      {padAndroidText(fmtShortDate(d))}
                    </Text>
                  </View>
                  {isNext ? (
                    <View style={styles.forecastBadge}>
                      <Text style={styles.forecastBadgeText}>
                        {padAndroidText('Next')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

// =========================================================================
// Step 4 · Details
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
  title,
  onTitle,
  timeFrom,
  timeTo,
  onOpenTimePicker,
  onClearTime,
  note,
  onNote,
  selectedServices,
  subtotal,
  totalDuration,
  recurrencePreview,
  startingDate,
  forecastDates,
  visitsPerYear,
  revenuePerYear,
  insets,
}: {
  client: ClientPick | null;
  currency: string;
  admin: boolean;
  teamUsers: TeamUser[];
  assigneeId: number | null;
  assigneeName: string;
  showAssignList: boolean;
  onToggleAssignList: () => void;
  onPickAssignee: (id: number | null) => void;
  title: string;
  onTitle: (v: string) => void;
  timeFrom: string;
  timeTo: string;
  onOpenTimePicker: () => void;
  onClearTime: () => void;
  note: string;
  onNote: (v: string) => void;
  selectedServices: SelectedService[];
  subtotal: number;
  totalDuration: number;
  recurrencePreview: string;
  startingDate: string;
  forecastDates: Date[];
  visitsPerYear: number;
  revenuePerYear: number;
  insets: { bottom: number };
}) {
  const showAssignChip = admin && teamUsers.length > 1;
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
          <Text style={styles.totalsLbl}>
            {padAndroidText('Per visit')}
          </Text>
          <Text style={styles.totalsValue}>
            {padAndroidText(fmtMoney(subtotal, currency))}
          </Text>
          <Text style={styles.totalsBadge} numberOfLines={1}>
            {padAndroidText(recurrencePreview)}
          </Text>
          <View style={styles.totalsBreakdown}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLbl}>
                {padAndroidText('Annual value')}
              </Text>
              <Text style={styles.totalsRowVal}>
                {padAndroidText(fmtMoney(revenuePerYear, currency))}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLbl}>
                {padAndroidText('Visits per year')}
              </Text>
              <Text style={styles.totalsRowVal}>
                {padAndroidText(`~${visitsPerYear}`)}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLbl}>
                {padAndroidText('Time per visit')}
              </Text>
              <Text style={styles.totalsRowVal}>
                {padAndroidText(fmtMinutes(totalDuration))}
              </Text>
            </View>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.sectionTitle}>
          {padAndroidText('Subscription title')}
        </Text>
        <View style={styles.formCard}>
          <TextInput
            value={title}
            onChangeText={onTitle}
            placeholder="e.g. Weekly cleaning"
            placeholderTextColor="#94A3B8"
            style={styles.textField}
            returnKeyType="done"
          />
          <Text style={styles.hint}>
            {padAndroidText(
              'Shown on internal lists. Does not appear on the customer\u2019s invoice.',
            )}
          </Text>
        </View>

        {/* Time */}
        <Text style={styles.sectionTitle}>{padAndroidText('Time of day')}</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onOpenTimePicker}
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
              onPress={onClearTime}
              hitSlop={10}
              style={styles.timePickerClearBtn}
            >
              <Text style={styles.timePickerClearText}>
                {padAndroidText('Clear')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.timePickerOpenBtn}>
              <Text style={styles.timePickerOpenBtnText}>
                {padAndroidText('Set time')}
              </Text>
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
                  <TouchableOpacity
                    onPress={() => onPickAssignee(null)}
                    style={[
                      styles.assignRow,
                      assigneeId == null && styles.assignRowOn,
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.assignRowText,
                        assigneeId == null && styles.assignRowTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      {padAndroidText('Unassigned')}
                    </Text>
                    {assigneeId == null ? (
                      <View style={styles.assignCheck}>
                        <CheckIcon />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  {teamUsers.map((u) => {
                    const on = u.id === assigneeId;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => onPickAssignee(u.id)}
                        style={[
                          styles.assignRow,
                          styles.assignRowBorder,
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
              <Text style={styles.hint}>
                {padAndroidText(
                  'Leaving this unassigned means jobs are created without an owner — assign them later from the calendar.',
                )}
              </Text>
            </View>
          </>
        ) : null}

        {/* Note */}
        <Text style={styles.sectionTitle}>
          {padAndroidText('Internal note')}
        </Text>
        <View style={styles.formCard}>
          <TextInput
            value={note}
            onChangeText={onNote}
            placeholder="Add a note shown on every generated job (optional)"
            placeholderTextColor="#94A3B8"
            style={[styles.textField, { minHeight: 96 }]}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Line items recap */}
        <Text style={styles.sectionTitle}>
          {padAndroidText('Services per visit')}
        </Text>
        <View style={styles.formCard}>
          {selectedServices.map((s, idx) => {
            const p = parseFloat(s.customPrice.replace(',', '.'));
            const d = parseInt(s.customDuration, 10);
            return (
              <View
                key={s.id}
                style={[styles.lineItem, idx > 0 && styles.lineItemBorder]}
              >
                <View style={styles.lineItemMain}>
                  <Text style={styles.lineItemTitle} numberOfLines={1}>
                    {padAndroidText(s.title)}
                  </Text>
                  <Text style={styles.lineItemMeta}>
                    {padAndroidText(
                      `${fmtMinutes(Number.isFinite(d) ? d : 0)} · ${fmtMoney(
                        Number.isFinite(p) ? p : 0,
                        currency,
                      )}`,
                    )}
                  </Text>
                </View>
                <Text style={styles.lineItemAmount}>
                  {padAndroidText(
                    fmtMoney(Number.isFinite(p) ? p : 0, currency),
                  )}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Forecast preview */}
        {forecastDates.length > 0 ? (
          <View style={styles.miniForecast}>
            <Text style={styles.miniForecastKicker}>
              {padAndroidText('Upcoming visits')}
            </Text>
            {forecastDates.slice(0, 4).map((d, i) => (
              <View
                key={`${d.toISOString()}-${i}`}
                style={[
                  styles.miniForecastRow,
                  i > 0 && styles.miniForecastRowBorder,
                ]}
              >
                <Text style={styles.miniForecastDate}>
                  {padAndroidText(fmtShortDate(d))}
                </Text>
                <Text style={styles.miniForecastDow}>
                  {padAndroidText(WEEKDAY_LONG[d.getDay()] || '—')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// =========================================================================
// Inline calendar picker modal (snappy month grid)
// =========================================================================

function CalendarPickerModal({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onPick: (iso: string) => void;
}) {
  const initialDate = useMemo(() => {
    const [y, m, d] = (value || todayIso()).split('-').map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  useEffect(() => {
    if (visible) {
      setViewYear(initialDate.getFullYear());
      setViewMonth(initialDate.getMonth());
    }
  }, [visible, initialDate]);

  const goPrev = () => {
    LayoutAnimation.configureNext(SNAPPY);
    let m = viewMonth - 1;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y--;
    }
    setViewMonth(m);
    setViewYear(y);
  };
  const goNext = () => {
    LayoutAnimation.configureNext(SNAPPY);
    let m = viewMonth + 1;
    let y = viewYear;
    if (m > 11) {
      m = 0;
      y++;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const grid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lead = firstDay.getDay(); // 0 = Sunday
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number; muted: boolean } | null> =
      [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) {
      cells.push({
        iso: fmtIsoDay(new Date(viewYear, viewMonth, d)),
        day: d,
        muted: false,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  if (!visible) return null;

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    'en-GB',
    {
      month: 'long',
      year: 'numeric',
    },
  );

  return (
    <View style={styles.modalScrim}>
      <View style={styles.modalSheet}>
        <View style={styles.calHeader}>
          <TouchableOpacity onPress={goPrev} hitSlop={12} style={styles.calNav}>
            <ChevronArrow dir="left" />
          </TouchableOpacity>
          <Text style={styles.calMonthLbl}>{padAndroidText(monthLabel)}</Text>
          <TouchableOpacity onPress={goNext} hitSlop={12} style={styles.calNav}>
            <ChevronArrow dir="right" />
          </TouchableOpacity>
        </View>

        <View style={styles.calWeekdayRow}>
          {WEEKDAY_TINY.map((d, i) => (
            <Text key={`${d}-${i}`} style={styles.calWeekday}>
              {padAndroidText(d)}
            </Text>
          ))}
        </View>

        <View style={styles.calGrid}>
          {grid.map((cell, idx) => {
            if (!cell) {
              return <View key={idx} style={styles.calCell} />;
            }
            const on = cell.iso === value;
            return (
              <TouchableOpacity
                key={cell.iso}
                style={[styles.calCell, on && styles.calCellOn]}
                onPress={() => onPick(cell.iso)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.calDayText,
                    on && styles.calDayTextOn,
                  ]}
                >
                  {padAndroidText(String(cell.day))}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.calActions}>
          <TouchableOpacity
            onPress={() => onPick(todayIso())}
            style={[styles.btn, styles.btnGhost, { flex: 0.6 }]}
            activeOpacity={0.85}
          >
            <RNText style={styles.btnGhostText}>{padAndroidText('Today')}</RNText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.btn, styles.btnPrimary]}
            activeOpacity={0.85}
          >
            <RNText style={styles.btnPrimaryText}>{padAndroidText('Done')}</RNText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  stepNode: { alignItems: 'center', justifyContent: 'center', minWidth: 60 },
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
    marginHorizontal: 4,
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
    paddingHorizontal: 8,
    lineHeight: 18,
    includeFontPadding: false,
  },

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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedSvcTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
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
  serviceRowMain: { flex: 1, minWidth: 0 },
  serviceTitle: { fontSize: 14, fontWeight: '700', color: '#193434' },
  serviceMeta: { marginTop: 2, fontSize: 12, color: '#64748B' },
  serviceAddBtn: {
    minWidth: 78,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E6F2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceAddText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
    lineHeight: 16,
    textAlign: 'center',
    includeFontPadding: false,
  },

  // schedule
  detailsScroll: { paddingHorizontal: 16, paddingTop: 4 },
  bigPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  bigPickerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E6F2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPickerMain: { flex: 1, minWidth: 0 },
  bigPickerLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 2,
    letterSpacing: 0.4,
  },
  bigPickerVal: { fontSize: 16, fontWeight: '800', color: '#193434' },
  bigPickerCta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#193434',
  },
  bigPickerCtaText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  recRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  recChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  recChipOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  recChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    lineHeight: 19,
    includeFontPadding: false,
  },
  recChipTextOn: { color: '#FFFFFF' },

  dowRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  dowChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  dowChipOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  dowChipText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  dowChipTextOn: { color: '#FFFFFF' },

  intervalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  // New 3×2 grid cells (1, 2, 3 / 4, 6, custom). Each cell takes exactly a
  // third of the row width so the layout stays balanced; the custom cell
  // hosts a number input + suffix instead of a static label.
  intervalCell: {
    width: '31.5%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 38,
  },
  intervalCellOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  intervalCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    lineHeight: 18,
    includeFontPadding: false,
  },
  intervalCellTextOn: { color: '#FFFFFF' },
  intervalCellCustom: {
    paddingHorizontal: 6,
  },
  intervalCellInput: {
    minWidth: 28,
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
    textAlign: 'center',
    paddingVertical: 0,
    padding: 0,
  },
  intervalCellInputOn: { color: '#FFFFFF' },
  intervalCellSuffix: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },

  // Monthly "Repeat every" — single number input row, deliberately spacious
  // so phone-thumbs can land on it without zooming.
  monthIntervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  monthIntervalInput: {
    minWidth: 56,
    fontSize: 18,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  monthIntervalSuffix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },

  domGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  domChip: {
    width: '13.2%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  domChipOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  domChipText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  domChipTextOn: { color: '#FFFFFF' },

  hint: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
    marginBottom: 8,
    marginTop: 4,
  },

  previewCard: {
    backgroundColor: '#E6F2EC',
    borderColor: '#94CFB7',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginVertical: 8,
  },
  previewKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  previewTitle: { fontSize: 18, fontWeight: '800', color: '#0F766E' },
  previewSub: { marginTop: 4, fontSize: 13, color: '#0F766E' },
  previewStats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#94CFB7',
  },
  previewStatCell: {
    flex: 1,
    alignItems: 'center',
  },
  previewStatVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
    textAlign: 'center',
  },
  previewStatLbl: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
    opacity: 0.8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewStatSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#94CFB7',
  },

  forecastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingVertical: 4,
    marginBottom: 14,
  },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  forecastRowNext: {
    backgroundColor: '#F0FDF4',
  },
  forecastDateBox: {
    width: 44,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  forecastDateBoxNext: {
    backgroundColor: '#3DD57A',
  },
  forecastMonth: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  forecastMonthNext: { color: '#FFFFFF' },
  forecastDay: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: '#193434',
  },
  forecastDayNext: { color: '#FFFFFF' },
  forecastMain: { flex: 1, minWidth: 0 },
  forecastTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
  },
  forecastTitleNext: { color: '#0F766E' },
  forecastSub: { marginTop: 2, fontSize: 12, color: '#64748B' },
  forecastBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#193434',
  },
  forecastBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // details step
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
  totalsBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    color: '#94CFB7',
    overflow: 'hidden',
  },
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
    paddingVertical: 12,
    marginBottom: 14,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#193434',
  },
  timePickerOpenBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
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

  miniForecast: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  miniForecastKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingTop: 8,
    paddingBottom: 4,
  },
  miniForecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  miniForecastRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  miniForecastDate: { fontSize: 13, fontWeight: '700', color: '#193434' },
  miniForecastDow: { fontSize: 12, color: '#64748B' },

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
    alignItems: 'stretch',
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
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  btnGhost: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flex: 0.55,
  },
  btnGhostText: {
    color: '#193434',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  btnDisabled: { backgroundColor: '#CBD5E1' },
  selectedSvcAdhocTag: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },

  // calendar modal
  modalScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  calNav: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthLbl: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: '#193434',
  },
  calWeekdayRow: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 4,
  },
  calWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calCellOn: {
    backgroundColor: '#193434',
  },
  calDayText: { fontSize: 14, fontWeight: '700', color: '#193434' },
  calDayTextOn: { color: '#FFFFFF' },
  calActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
});
