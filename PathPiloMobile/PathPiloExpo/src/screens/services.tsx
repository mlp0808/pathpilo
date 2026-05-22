import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
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
import AndroidSafeText from '../components/AndroidSafeText';
import {
  androidTextFix,
  fmtMoneyDisplay,
  padAndroidText,
} from '../ui/androidText';

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

function clientCurrency(company: any): string {
  const cc = String(company?.country_code || company?.countryCode || 'DK');
  if (cc === 'SE') return 'SEK';
  if (cc === 'NO') return 'NOK';
  if (cc === 'DE' || cc === 'FR' || cc === 'NL' || cc === 'ES') return 'EUR';
  if (cc === 'GB') return 'GBP';
  if (cc === 'US') return 'USD';
  return 'DKK';
}

function fmtDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}

// --- icons ----------------------------------------------------------------

function CloseIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M6 6l12 12M6 18L18 6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
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

function PlusIcon({ color = '#FFFFFF' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ClockIcon({ color = '#0F766E' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function MoreIcon({ color = '#94A3B8' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M9 18l6-6-6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function TrashIcon({ color = '#B91C1C' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6M10 11v6M14 11v6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// --- types ----------------------------------------------------------------

export type ServiceRow = {
  id: number;
  title: string;
  price: number | string;
  duration_minutes: number;
  bookkeeping_account?: string | null;
  usage_count?: number | string;
  created_at?: string | null;
  updated_at?: string | null;
};

// =========================================================================
// List screen
// =========================================================================

export function MobileServicesListScreen(props: any) {
  const { route, navigation } = props;
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const currency = clientCurrency(company);

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/services');
      const list = (res.data?.services || []).map((s: any) => ({
        id: Number(s.id),
        title: s.title || s.name || 'Service',
        price:
          typeof s.price === 'string' ? parseFloat(s.price) || 0 : Number(s.price) || 0,
        duration_minutes: Number(s.duration_minutes) || 0,
        bookkeeping_account: s.bookkeeping_account ?? null,
        usage_count:
          typeof s.usage_count === 'string'
            ? parseInt(s.usage_count, 10) || 0
            : Number(s.usage_count) || 0,
        created_at: s.created_at ?? null,
        updated_at: s.updated_at ?? null,
      })) as ServiceRow[];
      setServices(list);
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e?.message || 'Failed to load services',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh whenever the screen regains focus (after Compose closes)
  useEffect(() => {
    const skipFirst = { v: true };
    const unsub = navigation?.addListener?.('focus', () => {
      if (skipFirst.v) {
        skipFirst.v = false;
        return;
      }
      load();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [navigation, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.title.toLowerCase().includes(q));
  }, [services, search]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onAdd = () => {
    navigation.navigate('ServiceCompose', { company, user });
  };

  const onOpen = (svc: ServiceRow) => {
    navigation.navigate('ServiceCompose', { company, user, service: svc });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeftIcon />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.titleText}>{padAndroidText('Services')}</Text>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {padAndroidText(
              services.length === 1
                ? '1 service'
                : `${services.length} services`,
            )}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onAdd}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.addBtn}>
            <PlusIcon />
          </View>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search services…"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#193434" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{padAndroidText(error)}</Text>
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
        <FlatList
          data={filtered}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 32 + insets.bottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#193434"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {padAndroidText(
                  search ? 'No services match' : 'No services yet',
                )}
              </Text>
              <Text style={styles.emptySub}>
                {padAndroidText(
                  search
                    ? 'Try a different search term.'
                    : 'Add your first service to start scheduling jobs and invoicing.',
                )}
              </Text>
              {!search ? (
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={onAdd}
                  activeOpacity={0.85}
                >
                  <PlusIcon />
                  <Text style={styles.emptyAddBtnText}>
                    {padAndroidText('Add a service')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const usage = Number(item.usage_count) || 0;
            const priceNum =
              typeof item.price === 'string'
                ? parseFloat(item.price) || 0
                : Number(item.price) || 0;
            return (
              <TouchableOpacity
                style={styles.serviceCard}
                onPress={() => onOpen(item)}
                activeOpacity={0.85}
              >
                <View style={styles.serviceMain}>
                  <Text style={styles.serviceTitle} numberOfLines={1}>
                    {padAndroidText(item.title)}
                  </Text>
                  <View style={styles.serviceMetaRow}>
                    <View style={styles.metaPill}>
                      <ClockIcon />
                      <Text style={styles.metaPillText}>
                        {padAndroidText(fmtDuration(item.duration_minutes))}
                      </Text>
                    </View>
                    {usage > 0 ? (
                      <View style={styles.metaPillSubtle}>
                        <Text style={styles.metaPillSubtleText}>
                          {padAndroidText(
                            `${usage} ${usage === 1 ? 'use' : 'uses'}`,
                          )}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.servicePriceCol}>
                  <Text style={styles.servicePrice}>
                    {padAndroidText(fmtMoneyDisplay(priceNum, currency))}
                  </Text>
                  <View style={styles.serviceChevron}>
                    <MoreIcon />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

// =========================================================================
// Composer screen (add or edit)
// =========================================================================

export function MobileServiceComposerScreen(props: any) {
  const { route, navigation } = props;
  const { company, user, service } = route.params || {};
  const insets = useSafeAreaInsets();
  const currency = clientCurrency(company);

  const isEdit = !!service;
  const usageCount = Number(service?.usage_count) || 0;

  const initialMinutes = Number(service?.duration_minutes) || 0;
  const initialHours = Math.floor(initialMinutes / 60);
  const initialMins = Math.round(initialMinutes - initialHours * 60);

  const initialPrice =
    service != null
      ? typeof service.price === 'string'
        ? service.price
        : String(Number.isFinite(Number(service.price)) ? Number(service.price) : 0)
      : '';

  const [title, setTitle] = useState(String(service?.title || ''));
  const [price, setPrice] = useState(initialPrice);
  const [hours, setHours] = useState(
    isEdit ? String(initialHours) : '',
  );
  const [minutes, setMinutes] = useState(
    isEdit ? String(initialMins) : '',
  );
  const [bookkeeping, setBookkeeping] = useState(
    String(service?.bookkeeping_account || ''),
  );
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(service?.bookkeeping_account),
  );
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const totalMinutes = useMemo(() => {
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const safeH = Number.isFinite(h) ? Math.max(0, h) : 0;
    const safeM = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
    return safeH * 60 + safeM;
  }, [hours, minutes]);

  const priceNum = useMemo(() => {
    const n = parseFloat(price.replace(',', '.'));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [price]);

  const dirty = useMemo(() => {
    if (!isEdit) {
      return (
        title.trim() ||
        price.trim() ||
        hours.trim() ||
        minutes.trim() ||
        bookkeeping.trim()
      );
    }
    return (
      String(service?.title || '') !== title ||
      String(initialPrice) !== price ||
      Number(service?.duration_minutes || 0) !== totalMinutes ||
      String(service?.bookkeeping_account || '') !== bookkeeping
    );
  }, [
    isEdit,
    service,
    initialPrice,
    title,
    price,
    hours,
    minutes,
    bookkeeping,
    totalMinutes,
  ]);

  const canSave =
    title.trim().length > 0 &&
    price.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    totalMinutes > 0;

  const tryClose = () => {
    if (submitting || deleting) return;
    if (dirty) {
      Alert.alert(
        isEdit ? 'Discard changes?' : 'Discard service?',
        'You will lose your unsaved changes.',
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

  const submit = async () => {
    if (!canSave || submitting || deleting) return;
    if (!title.trim()) {
      Alert.alert('Missing title', 'Add a service title to continue.');
      return;
    }
    if (totalMinutes <= 0) {
      Alert.alert(
        'Add a duration',
        'Set how long this service usually takes (minimum 1 minute).',
      );
      return;
    }
    setSubmitting(true);
    try {
      await ensureAuthHeader();
      const payload: Record<string, any> = {
        title: title.trim(),
        price: priceNum,
        duration_minutes: totalMinutes,
        bookkeeping_account: bookkeeping.trim() || null,
      };
      if (isEdit) {
        await apiClient.put(`/services/${service.id}`, payload);
      } else {
        await apiClient.post('/services', payload);
      }
      navigation.goBack();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        (isEdit ? 'Could not update the service.' : 'Could not create the service.');
      Alert.alert('Error', String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  // Archiving keeps the service row so the title/price still resolve on
  // older jobs and invoices that reference it. The service simply disappears
  // from the active catalog (GET /services filters archived rows out).
  const onArchive = () => {
    if (!isEdit || deleting || submitting) return;
    const hint =
      usageCount > 0
        ? `Used by ${usageCount} ${usageCount === 1 ? 'job' : 'jobs'}. Those jobs and any invoices keep showing the current title and price. The service is just hidden from new jobs.`
        : 'It will be hidden from new jobs. You can still see it on past jobs and invoices.';
    Alert.alert(
      'Archive service?',
      hint,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await ensureAuthHeader();
              await apiClient.delete(`/services/${service.id}`);
              navigation.goBack();
            } catch (e: any) {
              const msg =
                e?.response?.data?.error ||
                e?.message ||
                'Could not archive the service.';
              Alert.alert('Error', String(msg));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={tryClose}
          style={styles.iconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <CloseIcon />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <RNText style={styles.titleText}>
            {padAndroidText(isEdit ? 'Edit service' : 'New service')}
          </RNText>
          {isEdit ? (
            <Text style={styles.subtitleText} numberOfLines={1}>
              {padAndroidText(
                usageCount > 0
                  ? `${usageCount} ${usageCount === 1 ? 'use' : 'uses'} · update affects future jobs`
                  : 'Update or remove this service',
              )}
            </Text>
          ) : (
            <Text style={styles.subtitleText} numberOfLines={1}>
              {padAndroidText('Add a default price and duration')}
            </Text>
          )}
        </View>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.composerScroll,
            { paddingBottom: 140 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Preview card */}
          <View style={styles.previewCard}>
            <Text style={styles.previewLbl}>{padAndroidText('Preview')}</Text>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {padAndroidText(title.trim() || 'New service')}
            </Text>
            <View style={styles.previewMetaRow}>
              <View style={styles.previewPill}>
                <Text style={styles.previewPillText}>
                  {padAndroidText(fmtMoneyDisplay(priceNum, currency))}
                </Text>
              </View>
              <View style={styles.previewPillSoft}>
                <Text style={styles.previewPillSoftText}>
                  {padAndroidText(fmtDuration(totalMinutes))}
                </Text>
              </View>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.sectionTitle}>{padAndroidText('Title')}</Text>
          <View style={styles.formCard}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Window cleaning"
              placeholderTextColor="#94A3B8"
              style={styles.textField}
              autoCapitalize="sentences"
              returnKeyType="next"
            />
          </View>

          {/* Price */}
          <Text style={styles.sectionTitle}>{padAndroidText('Price')}</Text>
          <View style={styles.formCard}>
            <View style={styles.numFieldWrap}>
              <Text style={styles.numFieldPrefix}>
                {padAndroidText(currency)}
              </Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0,00"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                style={styles.numFieldInput}
              />
            </View>
            <Text style={styles.fieldHint}>
              {padAndroidText(
                'Standard price for this service. You can override it on each job.',
              )}
            </Text>
          </View>

          {/* Duration */}
          <Text style={styles.sectionTitle}>
            {padAndroidText('Duration')}
          </Text>
          <View style={styles.formCard}>
            <View style={styles.timeFieldRow}>
              <View style={styles.timeFieldCell}>
                <Text style={styles.fieldLbl}>{padAndroidText('Hours')}</Text>
                <View style={styles.numFieldWrap}>
                  <TextInput
                    value={hours}
                    onChangeText={(t) => setHours(t.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    style={styles.numFieldInput}
                  />
                  <Text style={styles.numFieldSuffix}>
                    {padAndroidText('h')}
                  </Text>
                </View>
              </View>
              <View style={styles.timeFieldCell}>
                <Text style={styles.fieldLbl}>
                  {padAndroidText('Minutes')}
                </Text>
                <View style={styles.numFieldWrap}>
                  <TextInput
                    value={minutes}
                    onChangeText={(t) => {
                      let v = t.replace(/[^0-9]/g, '');
                      if (v.length > 0) {
                        const n = Math.min(59, parseInt(v, 10) || 0);
                        v = String(n);
                      }
                      setMinutes(v);
                    }}
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    style={styles.numFieldInput}
                  />
                  <Text style={styles.numFieldSuffix}>
                    {padAndroidText('min')}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.quickRow}>
              {[
                { label: '15 min', m: 15 },
                { label: '30 min', m: 30 },
                { label: '45 min', m: 45 },
                { label: '1h', m: 60 },
                { label: '1h 30', m: 90 },
                { label: '2h', m: 120 },
                { label: '3h', m: 180 },
              ].map((q) => {
                const on = totalMinutes === q.m;
                return (
                  <TouchableOpacity
                    key={q.label}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => {
                      setHours(String(Math.floor(q.m / 60)));
                      setMinutes(String(q.m % 60));
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.chipText, on && styles.chipTextOn]}
                      numberOfLines={1}
                    >
                      {padAndroidText(q.label)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Advanced */}
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => {
              LayoutAnimation.configureNext(SNAPPY);
              setShowAdvanced((v) => !v);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.advancedToggleText}>
              {padAndroidText(
                showAdvanced ? 'Hide advanced' : 'Advanced (bookkeeping)',
              )}
            </Text>
            <Text style={styles.advancedToggleHint}>
              {padAndroidText(showAdvanced ? '−' : '+')}
            </Text>
          </TouchableOpacity>

          {showAdvanced ? (
            <View style={styles.formCard}>
              <Text style={styles.fieldLbl}>
                {padAndroidText('Bookkeeping account')}
              </Text>
              <TextInput
                value={bookkeeping}
                onChangeText={(t) => setBookkeeping(t.slice(0, 32))}
                placeholder="e.g. 1010"
                placeholderTextColor="#94A3B8"
                style={styles.textField}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Text style={styles.fieldHint}>
                {padAndroidText(
                  'Account code from your chart of accounts (e-conomic, Dinero, Billy…). Only used when exporting to bookkeeping.',
                )}
              </Text>
            </View>
          ) : null}

          {/* Archive button — edit mode only. Archiving is now safe even
             when the service is used elsewhere; past jobs keep their
             reference to the same row. */}
          {isEdit ? (
            <TouchableOpacity
              style={[
                styles.deleteRow,
                deleting && { opacity: 0.6 },
              ]}
              onPress={onArchive}
              activeOpacity={0.85}
              disabled={deleting || submitting}
            >
              <View style={styles.deleteIconWrap}>
                <TrashIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deleteText}>
                  {padAndroidText(
                    deleting ? 'Archiving…' : 'Archive this service',
                  )}
                </Text>
                <Text style={styles.deleteHint} numberOfLines={2}>
                  {padAndroidText(
                    usageCount > 0
                      ? `Hidden from new jobs — ${usageCount} past ${usageCount === 1 ? 'job keeps' : 'jobs keep'} their copy`
                      : 'Hidden from new jobs — past jobs keep their copy',
                  )}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        {/* Sticky action bar */}
        <View
          style={[
            styles.actionBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <TouchableOpacity
            onPress={tryClose}
            style={[styles.btn, styles.btnGhost]}
            activeOpacity={0.85}
            disabled={submitting || deleting}
          >
            <Text style={styles.btnGhostText}>
              {padAndroidText('Cancel')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={submit}
            style={[
              styles.btn,
              styles.btnPrimary,
              !canSave && styles.btnDisabled,
              submitting && { opacity: 0.7 },
            ]}
            activeOpacity={0.85}
            disabled={!canSave || submitting || deleting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.btnPrimaryInner}>
                <RNText style={styles.btnPrimaryText}>
                  {padAndroidText(isEdit ? 'Save changes' : 'Create service')}
                </RNText>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 24,
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
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
    ...androidTextFix,
  },
  subtitleText: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 260,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#193434',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchWrap: {
    marginHorizontal: 16,
    marginTop: 6,
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
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
    lineHeight: 20,
  },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },

  // service row card
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 10,
  },
  serviceMain: { flex: 1, minWidth: 0, paddingRight: 6 },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
  },
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F2EC',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  metaPillText: { fontSize: 11, fontWeight: '700', color: '#0F766E' },
  metaPillSubtle: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaPillSubtleText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  servicePriceCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  servicePrice: { fontSize: 15, fontWeight: '800', color: '#193434' },
  serviceChevron: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
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
    maxWidth: 280,
  },
  emptyAddBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#193434',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  emptyAddBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  // composer
  composerScroll: { paddingHorizontal: 16, paddingTop: 6 },
  previewCard: {
    backgroundColor: '#193434',
    borderRadius: 18,
    padding: 22,
    marginBottom: 18,
  },
  previewLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94CFB7',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  previewTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  previewMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  previewPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  previewPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#193434',
  },
  previewPillSoft: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  previewPillSoftText: { fontSize: 13, fontWeight: '700', color: '#E6F2EC' },

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
  fieldLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  fieldHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
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
  numFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    minHeight: 44,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },

  timeFieldRow: { flexDirection: 'row', gap: 10 },
  timeFieldCell: { flex: 1 },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipOn: { backgroundColor: '#193434', borderColor: '#193434' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  chipTextOn: { color: '#FFFFFF' },

  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  advancedToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  advancedToggleHint: {
    fontSize: 18,
    fontWeight: '800',
    color: '#94A3B8',
  },

  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 14,
    gap: 12,
  },
  deleteIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 14, fontWeight: '800', color: '#B91C1C' },
  deleteHint: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E7ECE9',
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#193434', flex: 1 },
  btnPrimaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 12,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    ...androidTextFix,
  },
  btnGhost: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flex: 0.55,
  },
  btnGhostText: { color: '#193434', fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#CBD5E1' },
});
