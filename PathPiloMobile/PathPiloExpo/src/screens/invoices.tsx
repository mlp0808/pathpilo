import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  RefreshControl,
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
import { API_CONFIG } from '../api/config';
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
  update: { type: 'spring', springDamping: 0.82 },
} as const;

async function ensureAuthHeader(): Promise<void> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

function webOrigin(): string | null {
  // Prefer the explicit Next.js web origin from config; the API (port 8000)
  // and the web app (port 3000 in dev) are separate processes so we can't
  // simply trim "/api" off the API base URL.
  const explicit = String(API_CONFIG?.WEB_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const apiBase = String((apiClient as any)?.defaults?.baseURL || '');
  const stripped = apiBase.replace(/\/api\/?$/, '');
  return stripped.replace(/:8000(\b|$)/, ':3000$1') || null;
}

function openWeb(path: string) {
  const host = webOrigin();
  if (!host) {
    Alert.alert('Cannot open', 'Web URL is not configured.');
    return;
  }
  const url = `${host}${path.startsWith('/') ? '' : '/'}${path}`;
  Linking.openURL(url).catch(() =>
    Alert.alert('Cannot open', 'Could not open the page.'),
  );
}

// --- helpers --------------------------------------------------------------

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeForPreset(
  preset: DatePresetId,
): { from: string; to: string } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'all':
      return null;
    case 'today':
      return { from: ymd(today), to: ymd(today) };
    case 'last7': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: ymd(start), to: ymd(today) };
    }
    case 'last30': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: ymd(start), to: ymd(today) };
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: ymd(start), to: ymd(today) };
    }
    case 'lastMonth': {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastPrev = new Date(firstThis);
      lastPrev.setDate(0);
      const firstPrev = new Date(
        lastPrev.getFullYear(),
        lastPrev.getMonth(),
        1,
      );
      return { from: ymd(firstPrev), to: ymd(lastPrev) };
    }
    case 'thisYear': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: ymd(start), to: ymd(today) };
    }
    default:
      return null;
  }
}

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtMoney(amount: number | string | undefined, currency?: string): string {
  if (amount === undefined || amount === null) return '—';
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(n)) return '—';
  const cur = currency || 'DKK';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

// --- icons (kept tiny so the module stays self-contained) ----------------

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

function PlusIcon({ color = '#FFFFFF' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2.4}
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

function CloseIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M6 6l12 12M6 18L18 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function FilterIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M4 6h16M7 12h10M10 18h4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// --- types ----------------------------------------------------------------

type DatePresetId =
  | 'all'
  | 'today'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear';

const DATE_PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisYear', label: 'This year' },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
  { value: 'credited', label: 'Credited' },
];

type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overpaid'
  | 'overdue'
  | 'cancelled'
  | 'credited';

const STATUS_VISUAL: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  draft: { bg: '#F1F5F9', fg: '#475569', label: 'Draft' },
  sent: { bg: '#FEF3C7', fg: '#92400E', label: 'Sent' },
  overdue: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Overdue' },
  paid: { bg: '#DCFCE7', fg: '#166534', label: 'Paid' },
  overpaid: { bg: '#DCFCE7', fg: '#166534', label: 'Overpaid' },
  credited: { bg: '#E0E7FF', fg: '#3730A3', label: 'Credited' },
  cancelled: { bg: '#E0E7FF', fg: '#3730A3', label: 'Credited' },
};

function statusVisual(status: string | undefined) {
  return STATUS_VISUAL[status || 'draft'] || STATUS_VISUAL.draft;
}

export type InvoiceListRow = {
  id: number;
  invoice_number: string | null;
  invoice_number_display?: string | null;
  title: string | null;
  client_id: number;
  client_name: string;
  client_last_name?: string | null;
  issue_date?: string;
  due_date: string | null;
  total: string | number;
  currency: string;
  status: InvoiceStatus | string;
  created_at: string;
};

type ClientLite = {
  id: number;
  name: string;
  last_name: string | null;
};

// --- list screen ----------------------------------------------------------

export function MobileInvoicesListScreen(props: any) {
  const { route, navigation } = props;
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePresetId>('all');
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [clientId, setClientId] = useState<number | null>(null);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [companyDefaultCurrency, setCompanyDefaultCurrency] =
    useState<string>('DKK');

  const fetchClients = useCallback(async () => {
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/clients');
      setClients(res.data?.clients || []);
    } catch {
      setClients([]);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setError('');
    try {
      await ensureAuthHeader();
      const range = rangeForPreset(datePreset);
      const params: Record<string, string> = {};
      if (range) {
        params.dateFrom = range.from;
        params.dateTo = range.to;
      }
      if (statuses.size > 0) {
        params.status = [...statuses].sort().join(',');
      }
      if (clientId != null) params.clientId = String(clientId);
      const res = await apiClient.get('/invoices', { params });
      setInvoices(res.data?.invoices || []);
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e?.message || 'Could not load invoices',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [datePreset, statuses, clientId]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAuthHeader();
        const r = await apiClient.get('/clients/invoice-defaults');
        const c = String(r.data?.defaultCurrency || '').trim();
        if (!cancelled && c) setCompanyDefaultCurrency(c);
      } catch {
        /* keep DKK */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchInvoices();
  }, [fetchInvoices]);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const s = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const number = (inv.invoice_number_display || inv.invoice_number || '')
        .toString()
        .toLowerCase();
      const title = (inv.title || '').toLowerCase();
      const clientFull = `${inv.client_name || ''} ${inv.client_last_name || ''}`
        .toLowerCase();
      return (
        number.includes(s) ||
        title.includes(s) ||
        clientFull.includes(s) ||
        String(inv.id).includes(s)
      );
    });
  }, [invoices, search]);

  const totals = useMemo(() => {
    let outstanding = 0;
    let paid = 0;
    let count = invoices.length;
    let currency = companyDefaultCurrency;
    for (const inv of invoices) {
      const n = Number(inv.total) || 0;
      currency = inv.currency || currency;
      if (inv.status === 'paid' || inv.status === 'overpaid') paid += n;
      else if (inv.status === 'sent' || inv.status === 'overdue') outstanding += n;
    }
    return { outstanding, paid, count, currency };
  }, [invoices, companyDefaultCurrency]);

  const activeFilterCount =
    (datePreset === 'all' ? 0 : 1) +
    (statuses.size > 0 ? 1 : 0) +
    (clientId != null ? 1 : 0);

  const setFilter = (next: () => void) => {
    LayoutAnimation.configureNext(SNAPPY);
    next();
  };

  const renderItem = ({ item }: { item: InvoiceListRow }) => {
    const s = statusVisual(String(item.status || 'draft'));
    const number = item.invoice_number_display || item.invoice_number || `#${item.id}`;
    const clientFull = `${item.client_name || ''}${
      item.client_last_name ? ' ' + item.client_last_name : ''
    }`.trim();
    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('InvoiceDetail', {
            invoiceId: item.id,
            company,
            user,
          })
        }
        activeOpacity={0.75}
        style={styles.invRow}
      >
        <View style={styles.invRowTopLine}>
          <Text style={styles.invNumber} numberOfLines={1}>
            {padAndroidText(String(number))}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
            <Text style={[styles.statusPillText, { color: s.fg }]} numberOfLines={1}>
              {padAndroidText(s.label)}
            </Text>
          </View>
        </View>
        {item.title ? (
          <Text style={styles.invTitle} numberOfLines={1}>
            {padAndroidText(item.title)}
          </Text>
        ) : null}
        <Text style={styles.invClient} numberOfLines={1}>
          {padAndroidText(clientFull || '—')}
        </Text>
        <View style={styles.invRowBottomLine}>
          <Text style={styles.invMeta} numberOfLines={1}>
            {padAndroidText(
              [
                fmtDate(item.issue_date),
                item.due_date ? `Due ${fmtDate(item.due_date)}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
            )}
          </Text>
          <Text style={styles.invTotal} numberOfLines={1}>
            {padAndroidText(fmtMoney(item.total, item.currency))}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screenRoot, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.titleText}>{padAndroidText('Invoices')}</Text>
          <Text style={styles.subtitleText}>
            {padAndroidText(
              `${totals.count} · ${fmtMoney(totals.outstanding, totals.currency)} outstanding`,
            )}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() =>
            navigation.navigate('InvoiceCompose', { company, user })
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.newBtn}>
            <PlusIcon />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search number, title, client…"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={12}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => setFiltersOpen(true)}
          style={[
            styles.filterBtn,
            activeFilterCount > 0 && styles.filterBtnActive,
          ]}
          activeOpacity={0.85}
        >
          <FilterIcon color={activeFilterCount > 0 ? '#FFFFFF' : '#193434'} />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>
                {padAndroidText(String(activeFilterCount))}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{padAndroidText(error)}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              fetchInvoices();
            }}
          >
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
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            filtered.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchInvoices();
              }}
              tintColor="#193434"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {padAndroidText(
                  search || activeFilterCount > 0
                    ? 'No matching invoices'
                    : 'No invoices yet',
                )}
              </Text>
              <Text style={styles.emptySub}>
                {padAndroidText(
                  search || activeFilterCount > 0
                    ? 'Try clearing filters or widening the date range.'
                    : 'Create one from a completed job on the web app.',
                )}
              </Text>
            </View>
          }
        />
      )}

      <InvoiceFiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        datePreset={datePreset}
        statuses={statuses}
        clientId={clientId}
        clients={clients}
        onApply={({ datePreset: dp, statuses: st, clientId: cid }) => {
          setFilter(() => {
            setDatePreset(dp);
            setStatuses(st);
            setClientId(cid);
          });
          setFiltersOpen(false);
        }}
        onClear={() => {
          setFilter(() => {
            setDatePreset('all');
            setStatuses(new Set());
            setClientId(null);
          });
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

// --- filters sheet --------------------------------------------------------

function InvoiceFiltersSheet({
  visible,
  onClose,
  datePreset,
  statuses,
  clientId,
  clients,
  onApply,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  datePreset: DatePresetId;
  statuses: Set<string>;
  clientId: number | null;
  clients: ClientLite[];
  onApply: (next: {
    datePreset: DatePresetId;
    statuses: Set<string>;
    clientId: number | null;
  }) => void;
  onClear: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [localPreset, setLocalPreset] = useState<DatePresetId>(datePreset);
  const [localStatuses, setLocalStatuses] = useState<Set<string>>(new Set(statuses));
  const [localClientId, setLocalClientId] = useState<number | null>(clientId);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    if (visible) {
      setLocalPreset(datePreset);
      setLocalStatuses(new Set(statuses));
      setLocalClientId(clientId);
      setClientSearch('');
    }
  }, [visible, datePreset, statuses, clientId]);

  const toggleStatus = (v: string) => {
    setLocalStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const filteredClients = useMemo(() => {
    const s = clientSearch.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter((c) =>
      `${c.name || ''} ${c.last_name || ''}`.toLowerCase().includes(s),
    );
  }, [clients, clientSearch]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.sheetGrab} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{padAndroidText('Filters')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <CloseIcon />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ maxHeight: 540 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetSection}>{padAndroidText('Period')}</Text>
            <View style={styles.chipWrap}>
              {DATE_PRESETS.map((p) => {
                const on = p.id === localPreset;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setLocalPreset(p.id)}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.chipText, on && styles.chipTextOn]}
                      numberOfLines={1}
                    >
                      {padAndroidText(p.label)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sheetSection}>{padAndroidText('Status')}</Text>
            <View style={styles.chipWrap}>
              {STATUS_FILTERS.map((row) => {
                const on = localStatuses.has(row.value);
                const v = statusVisual(row.value);
                return (
                  <TouchableOpacity
                    key={row.value}
                    onPress={() => toggleStatus(row.value)}
                    style={[
                      styles.chip,
                      on && {
                        backgroundColor: v.bg,
                        borderColor: v.bg,
                      },
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        on && { color: v.fg },
                      ]}
                      numberOfLines={1}
                    >
                      {padAndroidText(row.label)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sheetSection}>{padAndroidText('Client')}</Text>
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={clientSearch}
                onChangeText={setClientSearch}
                placeholder="Search clients…"
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
              />
            </View>
            <View style={{ marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setLocalClientId(null)}
                style={[
                  styles.clientRow,
                  localClientId == null && styles.clientRowOn,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.clientRowText,
                    localClientId == null && styles.clientRowTextOn,
                  ]}
                  numberOfLines={1}
                >
                  {padAndroidText('All clients')}
                </Text>
                {localClientId == null ? (
                  <View style={styles.clientCheck}>
                    <CheckIcon color="#FFFFFF" />
                  </View>
                ) : null}
              </TouchableOpacity>
              {filteredClients.slice(0, 50).map((c) => {
                const on = localClientId === c.id;
                const name = `${c.name || ''}${c.last_name ? ' ' + c.last_name : ''}`.trim();
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setLocalClientId(c.id)}
                    style={[styles.clientRow, on && styles.clientRowOn]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.clientRowText,
                        on && styles.clientRowTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      {padAndroidText(name || '—')}
                    </Text>
                    {on ? (
                      <View style={styles.clientCheck}>
                        <CheckIcon color="#FFFFFF" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              {clients.length > 50 ? (
                <Text style={styles.muted}>
                  {padAndroidText('Showing first 50 — refine your search.')}
                </Text>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.sheetActions}>
            <TouchableOpacity
              onPress={onClear}
              style={styles.sheetClearBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetClearText}>
                {padAndroidText('Clear all')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                onApply({
                  datePreset: localPreset,
                  statuses: localStatuses,
                  clientId: localClientId,
                })
              }
              style={styles.sheetApplyBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetApplyText}>
                {padAndroidText('Apply')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- detail screen --------------------------------------------------------

type InvoiceItem = {
  id: number;
  description?: string | null;
  custom_title?: string | null;
  service_title?: string | null;
  quantity?: number | string;
  price?: number | string | null;
  unit_price?: number | string | null;
  total?: number | string | null;
};

type InvoiceTransaction = {
  id: number;
  type: 'charge' | 'payment';
  amount: number;
  description?: string | null;
  payment_source?: string | null;
  transaction_date: string;
};

type InvoiceFull = {
  id: number;
  invoice_number: string | null;
  invoice_number_display?: string | null;
  title: string | null;
  status: InvoiceStatus | string;
  issue_date: string | null;
  due_date: string | null;
  total: number | string;
  subtotal?: number | string;
  tax_total?: number | string;
  currency: string;
  client_id: number;
  client_name?: string | null;
  client_last_name?: string | null;
  client_email?: string | null;
  payment_terms?: string | null;
  items: InvoiceItem[];
  transactions: InvoiceTransaction[];
  balance: number;
  created_by_name?: string | null;
};

const PAYMENT_SOURCES: { value: string; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobilepay', label: 'MobilePay' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

export function MobileInvoiceDetailScreen(props: any) {
  const { route, navigation } = props;
  const { invoiceId, company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const [invoice, setInvoice] = useState<InvoiceFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'summary' | 'items' | 'history'>('summary');

  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      await ensureAuthHeader();
      const res = await apiClient.get(`/invoices/${invoiceId}`);
      setInvoice(res.data?.invoice || null);
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e?.message || 'Could not load invoice',
      );
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const status = String(invoice?.status || 'draft');
  const sv = statusVisual(status);
  const numberDisplay =
    invoice?.invoice_number_display ||
    invoice?.invoice_number ||
    (invoice ? `#${invoice.id}` : '—');
  const clientFull = invoice
    ? `${invoice.client_name || ''}${invoice.client_last_name ? ' ' + invoice.client_last_name : ''}`.trim()
    : '';
  const total = Number(invoice?.total) || 0;
  const balance = Number(invoice?.balance ?? total);

  const updateStatus = async (
    next: InvoiceStatus,
    extra?: { paid_at?: string; paid_amount?: number; payment_source?: string },
  ) => {
    try {
      await ensureAuthHeader();
      const res = await apiClient.put(`/invoices/${invoiceId}/status`, {
        status: next,
        ...(extra || {}),
      });
      // Re-load so transactions / balance reflect any auto-actions on the server.
      await load();
      return res.data;
    } catch (e: any) {
      Alert.alert(
        'Could not update status',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
      throw e;
    }
  };

  const recordPayment = async (input: {
    amount: number;
    payment_source: string;
    description?: string;
    transaction_date: string;
  }) => {
    try {
      await ensureAuthHeader();
      await apiClient.post(`/invoices/${invoiceId}/transactions`, {
        type: 'payment',
        amount: input.amount,
        payment_source: input.payment_source,
        description: input.description || '',
        transaction_date: input.transaction_date,
      });
      await load();
    } catch (e: any) {
      Alert.alert(
        'Could not log payment',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
      throw e;
    }
  };

  const onMarkSent = async () => {
    try {
      await updateStatus('sent');
    } catch {
      /* handled */
    }
  };

  const onCopyOnlineLink = async () => {
    try {
      await ensureAuthHeader();
      const res = await apiClient.post(`/invoices/${invoiceId}/online-link`);
      const url: string = res.data?.url || '';
      if (!url) {
        Alert.alert('Online link', 'Could not generate the online invoice link.');
        return;
      }
      // Open via system share so user can copy / send. Linking.openURL won't
      // copy, so route through Share if available; otherwise just show it.
      Alert.alert('Online invoice link', url, [
        { text: 'Open', onPress: () => Linking.openURL(url) },
        { text: 'OK', style: 'cancel' },
      ]);
    } catch (e: any) {
      Alert.alert(
        'Online link',
        e?.response?.data?.error || e?.message || 'Could not generate link.',
      );
    }
  };

  const onOpenPdf = () => {
    const host = webOrigin();
    if (!host || !invoice) return;
    // Server returns a redirect/stream — Android & iOS browsers can render PDFs.
    const tokenUrl = `${host}/api/invoices/${invoice.id}/pdf`;
    Linking.openURL(tokenUrl).catch(() =>
      Alert.alert('Cannot open', 'Could not open the PDF.'),
    );
  };

  const onOpenWebEditor = () => {
    if (!company?.slug || !invoice) return;
    openWeb(`/${company.slug}/invoices/${invoice.id}/edit`);
  };

  return (
    <View style={[styles.screenRoot, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.titleText} numberOfLines={1}>
            {padAndroidText(String(numberDisplay))}
          </Text>
          {clientFull ? (
            <Text style={styles.subtitleText} numberOfLines={1}>
              {padAndroidText(clientFull)}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setActionsOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.menuDots}>
            <View style={styles.menuDot} />
            <View style={styles.menuDot} />
            <View style={styles.menuDot} />
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#193434" />
        </View>
      ) : error || !invoice ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {padAndroidText(error || 'Not found')}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            <Text style={styles.retryBtnText}>{padAndroidText('Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.detailScroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View
              style={[styles.heroPill, { backgroundColor: sv.bg }]}
            >
              <Text style={[styles.heroPillText, { color: sv.fg }]}>
                {padAndroidText(sv.label)}
              </Text>
            </View>
            <Text style={styles.heroAmount}>
              {padAndroidText(fmtMoney(total, invoice.currency))}
            </Text>
            <Text style={styles.heroBalance}>
              {padAndroidText(
                balance > 0
                  ? `${fmtMoney(balance, invoice.currency)} outstanding`
                  : balance < 0
                    ? `${fmtMoney(Math.abs(balance), invoice.currency)} overpaid`
                    : 'Balance settled',
              )}
            </Text>

            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaCell}>
                <Text style={styles.heroMetaLbl}>{padAndroidText('Issued')}</Text>
                <RNText
                  style={styles.heroMetaVal}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {padAndroidText(fmtDate(invoice.issue_date))}
                </RNText>
              </View>
              <View style={styles.heroMetaSep} />
              <View style={styles.heroMetaCell}>
                <Text style={styles.heroMetaLbl}>{padAndroidText('Due')}</Text>
                <RNText
                  style={styles.heroMetaVal}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {padAndroidText(fmtDate(invoice.due_date))}
                </RNText>
              </View>
            </View>
          </View>

          <View style={styles.tabBar}>
            {(['summary', 'items', 'history'] as const).map((id) => {
              const on = tab === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.tabItem, on && styles.tabItemOn]}
                  onPress={() => {
                    LayoutAnimation.configureNext(SNAPPY);
                    setTab(id);
                  }}
                >
                  <Text
                    style={[styles.tabItemText, on && styles.tabItemTextOn]}
                  >
                    {padAndroidText(
                      id === 'summary'
                        ? 'Summary'
                        : id === 'items'
                          ? 'Items'
                          : 'History',
                    )}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {tab === 'summary' ? (
            <InvoiceSummaryTab invoice={invoice} />
          ) : tab === 'items' ? (
            <InvoiceItemsTab invoice={invoice} />
          ) : (
            <InvoiceHistoryTab invoice={invoice} />
          )}
        </ScrollView>
      )}

      {/* Sticky action bar */}
      {!loading && invoice ? (
        <View
          style={[
            styles.actionBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          {status === 'draft' ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnGhost]}
                onPress={onOpenWebEditor}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnGhostText}>
                  {padAndroidText('Edit')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={onMarkSent}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnPrimaryText}>
                  {padAndroidText('Mark sent')}
                </Text>
              </TouchableOpacity>
            </>
          ) : status === 'paid' || status === 'overpaid' ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnGhost]}
                onPress={onOpenPdf}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnGhostText}>
                  {padAndroidText('Open PDF')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnGhost]}
                onPress={onCopyOnlineLink}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnGhostText}>
                  {padAndroidText('Online link')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnGhost]}
                onPress={() => setStatusSheetOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnGhostText}>
                  {padAndroidText('Status')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => setPaymentSheetOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnPrimaryText}>
                  {padAndroidText('Log payment')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}

      <RecordPaymentSheet
        visible={paymentSheetOpen}
        onClose={() => setPaymentSheetOpen(false)}
        suggestedAmount={Math.max(balance, 0)}
        currency={invoice?.currency || 'DKK'}
        onSubmit={async (payload) => {
          await recordPayment(payload);
          setPaymentSheetOpen(false);
        }}
      />

      <StatusSheet
        visible={statusSheetOpen}
        currentStatus={status}
        onClose={() => setStatusSheetOpen(false)}
        onPick={async (next) => {
          if (next === 'paid') {
            setStatusSheetOpen(false);
            setPaymentSheetOpen(true);
            return;
          }
          await updateStatus(next as InvoiceStatus);
          setStatusSheetOpen(false);
        }}
      />

      <ActionsSheet
        visible={actionsOpen}
        invoice={invoice}
        onClose={() => setActionsOpen(false)}
        onPdf={onOpenPdf}
        onOnlineLink={onCopyOnlineLink}
        onWebEdit={onOpenWebEditor}
        onWebView={() => {
          if (!company?.slug || !invoice) return;
          openWeb(`/${company.slug}/invoices/${invoice.id}`);
        }}
        onChangeStatus={() => {
          setActionsOpen(false);
          setStatusSheetOpen(true);
        }}
        onLogPayment={() => {
          setActionsOpen(false);
          setPaymentSheetOpen(true);
        }}
        onCredit={async () => {
          setActionsOpen(false);
          if (!invoice) return;
          Alert.alert(
            'Credit invoice',
            'Mark this invoice as credited? This is shown to your team and clients.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Credit',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await updateStatus('credited');
                  } catch {
                    /* handled in updateStatus */
                  }
                },
              },
            ],
          );
        }}
      />
    </View>
  );
}

// --- detail tabs ----------------------------------------------------------

function InvoiceSummaryTab({ invoice }: { invoice: InvoiceFull }) {
  const subtotal =
    invoice.subtotal != null
      ? Number(invoice.subtotal) || 0
      : (invoice.items || []).reduce((acc, it) => {
          const qty = Number(it.quantity ?? 1) || 1;
          const price = Number(it.unit_price ?? it.price ?? 0) || 0;
          return acc + qty * price;
        }, 0);
  const tax = Number(invoice.tax_total) || 0;
  const total = Number(invoice.total) || 0;
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{padAndroidText('Totals')}</Text>
      <SumRow label="Subtotal" value={fmtMoney(subtotal, invoice.currency)} />
      {tax > 0 ? (
        <SumRow label="Tax" value={fmtMoney(tax, invoice.currency)} />
      ) : null}
      <View style={styles.sumDivider} />
      <SumRow
        label="Total"
        value={fmtMoney(total, invoice.currency)}
        bold
      />
      <SumRow
        label="Balance"
        value={fmtMoney(invoice.balance ?? total, invoice.currency)}
      />

      {invoice.title || invoice.payment_terms ? (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
            {padAndroidText('Details')}
          </Text>
          {invoice.title ? (
            <DetailRow label="Title" value={invoice.title} />
          ) : null}
          {invoice.payment_terms ? (
            <DetailRow
              label="Payment terms"
              value={invoice.payment_terms}
              long
            />
          ) : null}
        </>
      ) : null}

      {invoice.client_email ? (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
            {padAndroidText('Customer')}
          </Text>
          <TouchableOpacity
            onPress={() =>
              invoice.client_email
                ? Linking.openURL(`mailto:${invoice.client_email}`)
                : null
            }
          >
            <DetailRow label="Email" value={invoice.client_email} />
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

function InvoiceItemsTab({ invoice }: { invoice: InvoiceFull }) {
  if (!invoice.items || invoice.items.length === 0) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.muted}>{padAndroidText('No line items.')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.sectionCard}>
      {invoice.items.map((it, idx) => {
        const title =
          it.custom_title ||
          it.service_title ||
          it.description ||
          `Item #${it.id}`;
        const qty = Number(it.quantity ?? 1) || 1;
        const unit = Number(it.unit_price ?? it.price ?? 0) || 0;
        const lineTotal =
          it.total != null ? Number(it.total) || 0 : qty * unit;
        return (
          <View
            key={it.id}
            style={[
              styles.itemRow,
              idx > 0 && styles.itemRowBorder,
            ]}
          >
            <View style={styles.itemRowMain}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {padAndroidText(title)}
              </Text>
              <Text style={styles.itemMeta}>
                {padAndroidText(
                  `${qty} × ${fmtMoney(unit, invoice.currency)}`,
                )}
              </Text>
            </View>
            <Text style={styles.itemTotal}>
              {padAndroidText(fmtMoney(lineTotal, invoice.currency))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function InvoiceHistoryTab({ invoice }: { invoice: InvoiceFull }) {
  const txns = invoice.transactions || [];
  if (txns.length === 0) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.muted}>{padAndroidText('No payments or charges yet.')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.sectionCard}>
      {txns.map((t, idx) => {
        const isPayment = t.type === 'payment';
        return (
          <View
            key={t.id}
            style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}
          >
            <View
              style={[
                styles.txnDot,
                isPayment ? styles.txnDotPayment : styles.txnDotCharge,
              ]}
            />
            <View style={styles.itemRowMain}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {padAndroidText(
                  t.description ||
                    (isPayment ? 'Payment received' : 'Charge'),
                )}
              </Text>
              <Text style={styles.itemMeta} numberOfLines={1}>
                {padAndroidText(
                  [
                    fmtDate(t.transaction_date),
                    isPayment ? t.payment_source || 'payment' : 'charge',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                )}
              </Text>
            </View>
            <Text
              style={[
                styles.itemTotal,
                {
                  color: isPayment ? '#166534' : '#B91C1C',
                },
              ]}
            >
              {padAndroidText(
                `${isPayment ? '−' : '+'}${fmtMoney(t.amount, invoice.currency)}`,
              )}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SumRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLbl, bold && styles.sumLblBold]}>
        {padAndroidText(label)}
      </Text>
      <Text style={[styles.sumVal, bold && styles.sumValBold]}>
        {padAndroidText(value)}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  long,
}: {
  label: string;
  value: string;
  long?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLbl}>{padAndroidText(label)}</Text>
      <Text
        style={styles.detailVal}
        selectable
        numberOfLines={long ? undefined : 2}
      >
        {padAndroidText(value)}
      </Text>
    </View>
  );
}

// --- record payment sheet -------------------------------------------------

function RecordPaymentSheet({
  visible,
  onClose,
  suggestedAmount,
  currency,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  suggestedAmount: number;
  currency: string;
  onSubmit: (payload: {
    amount: number;
    payment_source: string;
    description?: string;
    transaction_date: string;
  }) => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('bank_transfer');
  const [note, setNote] = useState('');
  const [date, setDate] = useState<string>(ymd(new Date()));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '');
      setSource('bank_transfer');
      setNote('');
      setDate(ymd(new Date()));
      setSubmitting(false);
    }
  }, [visible, suggestedAmount]);

  const submit = async () => {
    const num = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) {
      Alert.alert('Amount', 'Enter a positive amount.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        amount: num,
        payment_source: source,
        description: note,
        transaction_date: date,
      });
    } catch {
      /* handled */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetOverlay}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.sheetGrab} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {padAndroidText('Log payment')}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <CloseIcon />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>{padAndroidText('Amount')}</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.amountCurrency}>{padAndroidText(currency)}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0,00"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
              {padAndroidText('Payment date')}
            </Text>
            <View style={styles.dateChipRow}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
              ].map((opt) => {
                const dToday = new Date();
                if (opt.id === 'yesterday') dToday.setDate(dToday.getDate() - 1);
                const value = ymd(dToday);
                const on = date === value;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => setDate(value)}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.chipText, on && styles.chipTextOn]}
                      numberOfLines={1}
                    >
                      {padAndroidText(opt.label)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={styles.textField}
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
              {padAndroidText('Method')}
            </Text>
            <View style={styles.chipWrap}>
              {PAYMENT_SOURCES.map((p) => {
                const on = source === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => setSource(p.value)}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.chipText, on && styles.chipTextOn]}
                      numberOfLines={1}
                    >
                      {padAndroidText(p.label)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
              {padAndroidText('Note (optional)')}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Reference or comment"
              placeholderTextColor="#94A3B8"
              style={[styles.textField, { minHeight: 60 }]}
              multiline
            />
          </ScrollView>

          <View style={styles.sheetActions}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.sheetClearBtn}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetClearText}>{padAndroidText('Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              style={[
                styles.sheetApplyBtn,
                submitting && { opacity: 0.6 },
              ]}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.sheetApplyText}>
                {padAndroidText(submitting ? 'Saving…' : 'Save payment')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- status / actions sheets --------------------------------------------

function StatusSheet({
  visible,
  currentStatus,
  onClose,
  onPick,
}: {
  visible: boolean;
  currentStatus: string;
  onClose: () => void;
  onPick: (next: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const choices: { value: string; label: string; description?: string }[] = [
    { value: 'draft', label: 'Draft', description: 'Working on the invoice' },
    { value: 'sent', label: 'Sent', description: 'Issued and awaiting payment' },
    { value: 'paid', label: 'Paid', description: 'Will open “Log payment”' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'credited', label: 'Credited', description: 'Voided / refunded' },
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.sheetGrab} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{padAndroidText('Change status')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <CloseIcon />
            </TouchableOpacity>
          </View>

          <View>
            {choices.map((c, idx) => {
              const on = c.value === currentStatus;
              const sv = statusVisual(c.value);
              return (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => onPick(c.value)}
                  style={[
                    styles.statusChoice,
                    idx > 0 && styles.statusChoiceBorder,
                  ]}
                  activeOpacity={0.85}
                >
                  <View style={[styles.statusBullet, { backgroundColor: sv.bg }]}>
                    <View
                      style={[styles.statusBulletInner, { backgroundColor: sv.fg }]}
                    />
                  </View>
                  <View style={styles.statusChoiceMain}>
                    <Text style={styles.statusChoiceLabel}>
                      {padAndroidText(c.label)}
                    </Text>
                    {c.description ? (
                      <Text style={styles.statusChoiceDesc} numberOfLines={1}>
                        {padAndroidText(c.description)}
                      </Text>
                    ) : null}
                  </View>
                  {on ? (
                    <View style={styles.clientCheck}>
                      <CheckIcon />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActionsSheet({
  visible,
  invoice,
  onClose,
  onPdf,
  onOnlineLink,
  onWebEdit,
  onWebView,
  onChangeStatus,
  onLogPayment,
  onCredit,
}: {
  visible: boolean;
  invoice: InvoiceFull | null;
  onClose: () => void;
  onPdf: () => void;
  onOnlineLink: () => void;
  onWebEdit: () => void;
  onWebView: () => void;
  onChangeStatus: () => void;
  onLogPayment: () => void;
  onCredit: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!invoice) return null;
  const status = String(invoice.status || 'draft');
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.sheetGrab} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{padAndroidText('Actions')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <CloseIcon />
            </TouchableOpacity>
          </View>

          <ActionRow
            label="Open PDF"
            onPress={() => {
              onClose();
              onPdf();
            }}
          />
          <ActionRow
            label="Online invoice link"
            onPress={() => {
              onClose();
              onOnlineLink();
            }}
          />
          <ActionRow label="Change status" onPress={onChangeStatus} />
          {status !== 'paid' && status !== 'overpaid' && status !== 'credited' ? (
            <ActionRow label="Log payment" onPress={onLogPayment} />
          ) : null}
          <ActionRow label="View on web" onPress={() => { onClose(); onWebView(); }} />
          {status === 'draft' ? (
            <ActionRow label="Edit on web" onPress={() => { onClose(); onWebEdit(); }} />
          ) : null}
          {status !== 'credited' && status !== 'cancelled' ? (
            <ActionRow
              label="Credit invoice"
              onPress={onCredit}
              destructive
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ActionRow({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text
        style={[
          styles.actionRowText,
          destructive && styles.actionRowTextDestructive,
        ]}
      >
        {padAndroidText(label)}
      </Text>
    </TouchableOpacity>
  );
}

// --- styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: '#F6F9F7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7ECE9',
    backgroundColor: '#F6F9F7',
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#193434',
  },
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  titleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
  },
  subtitleText: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
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
  searchClear: { fontSize: 14, color: '#94A3B8', padding: 4 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBtnActive: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#3DD57A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F6F9F7',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#193434',
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
  errorRetry: { fontSize: 13, fontWeight: '700', color: '#B91C1C', textDecorationLine: 'underline' },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#193434',
    borderRadius: 12,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },

  invRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 4,
  },
  invRowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  invNumber: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '800',
    color: '#193434',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  invTitle: { fontSize: 14, color: '#334155', marginTop: 2 },
  invClient: { fontSize: 13, color: '#64748B', marginTop: 1 },
  invRowBottomLine: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  invMeta: { flex: 1, minWidth: 0, fontSize: 12, color: '#94A3B8' },
  invTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
    flexShrink: 0,
    maxWidth: '52%',
    textAlign: 'right',
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

  // sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7ECE9',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#193434' },
  sheetSection: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    marginRight: 0,
  },
  chipOn: { backgroundColor: '#193434', borderColor: '#193434' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  chipTextOn: { color: '#FFFFFF' },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  clientRowOn: { backgroundColor: '#E6F2EC', borderColor: '#3DD57A' },
  clientRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#193434' },
  clientRowTextOn: { color: '#0F766E' },
  clientCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3DD57A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 4 },
  sheetActions: {
    flexDirection: 'row',
    paddingTop: 12,
    gap: 10,
  },
  sheetClearBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetClearText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  sheetApplyBtn: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#193434',
  },
  sheetApplyText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  // detail
  detailScroll: { flex: 1 },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 22,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECE9',
    alignItems: 'center',
  },
  heroPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroAmount: { fontSize: 30, fontWeight: '800', color: '#193434' },
  heroBalance: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  heroMetaRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  heroMetaCell: { flex: 1, alignItems: 'center' },
  heroMetaSep: { width: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0' },
  heroMetaLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  heroMetaVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
    textAlign: 'center',
    width: '100%',
  },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
  },
  tabItem: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  tabItemOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tabItemText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  tabItemTextOn: { color: '#193434' },

  sectionCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECE9',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  sumLbl: { fontSize: 14, color: '#475569' },
  sumLblBold: { fontWeight: '800', color: '#193434' },
  sumVal: { fontSize: 14, fontWeight: '700', color: '#193434' },
  sumValBold: { fontSize: 16, fontWeight: '800' },
  sumDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },

  detailRow: { paddingVertical: 6 },
  detailLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailVal: { fontSize: 15, color: '#193434', fontWeight: '600' },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  itemRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  itemRowMain: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#193434' },
  itemMeta: { marginTop: 4, fontSize: 12, color: '#64748B' },
  itemTotal: { fontSize: 14, fontWeight: '800', color: '#193434' },

  txnDot: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  txnDotPayment: { backgroundColor: '#3DD57A' },
  txnDotCharge: { backgroundColor: '#F87171' },

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
  actionBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: '#193434' },
  actionBtnPrimaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: 6,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    flexShrink: 1,
    textAlign: 'center',
  },
  actionBtnGhost: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionBtnGhostText: { color: '#193434', fontWeight: '700', fontSize: 15 },

  menuDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
  },
  menuDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#193434' },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  textField: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: '#193434',
    backgroundColor: '#FFFFFF',
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
  },
  amountCurrency: {
    fontSize: 16,
    fontWeight: '800',
    color: '#475569',
    marginRight: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#193434',
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  dateChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },

  // status sheet
  statusChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  statusChoiceBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E7ECE9',
  },
  statusBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBulletInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusChoiceMain: { flex: 1, minWidth: 0 },
  statusChoiceLabel: { fontSize: 15, fontWeight: '700', color: '#193434' },
  statusChoiceDesc: { marginTop: 2, fontSize: 12, color: '#64748B' },

  actionRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E7ECE9',
  },
  actionRowText: { fontSize: 15, fontWeight: '700', color: '#193434' },
  actionRowTextDestructive: { color: '#B91C1C' },
});
