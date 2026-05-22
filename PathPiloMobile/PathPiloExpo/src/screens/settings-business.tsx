import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
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
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import { API_CONFIG } from '../api/config';
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

function apiOrigin(): string {
  return String(API_CONFIG.BASE_URL || '').replace(/\/api\/?$/, '');
}

function publicUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiOrigin();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

type CompanyProfile = {
  id: number;
  name: string;
  slug: string;
  country: string;
  countryCode: string;
  timezone: string;
  effectiveTimezone?: string;
  cvrNumber: string;
  address: string;
  city: string;
  zipCode: string;
  email: string;
  phone: string;
  website: string;
  logoUrl: string;
  defaultStartAddress: string;
  defaultEndAddress: string;
  routeLocationsEnabled: boolean;
};

const COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: 'DK', name: 'Denmark' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DE', name: 'Germany' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
];

const COUNTRY_NAME: Record<string, string> = Object.fromEntries(
  COUNTRY_OPTIONS.map((c) => [c.code, c.name]),
);

function countryLabels(code: string): {
  postal: string;
  companyNo: string;
} {
  const c = String(code || 'DK').toUpperCase();
  if (c === 'SE' || c === 'NO')
    return { postal: 'Postcode', companyNo: 'Org.nr' };
  if (c === 'DE') return { postal: 'PLZ', companyNo: 'USt-IdNr.' };
  if (c === 'GB') return { postal: 'Postcode', companyNo: 'Company number' };
  if (c === 'US') return { postal: 'ZIP code', companyNo: 'EIN' };
  return { postal: 'Postal code', companyNo: 'CVR number' };
}

const DEFAULT_TZ_BY_COUNTRY: Record<string, string> = {
  DK: 'Europe/Copenhagen',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  DE: 'Europe/Berlin',
  GB: 'Europe/London',
  US: 'America/New_York',
};

const EXTRA_TZ: Record<string, { value: string; label: string }[]> = {
  US: [
    { value: 'America/New_York', label: 'Eastern (New York)' },
    { value: 'America/Chicago', label: 'Central (Chicago)' },
    { value: 'America/Denver', label: 'Mountain (Denver)' },
    { value: 'America/Phoenix', label: 'Arizona (Phoenix)' },
    { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
    { value: 'America/Anchorage', label: 'Alaska' },
    { value: 'Pacific/Honolulu', label: 'Hawaii' },
  ],
  CA: [
    { value: 'America/Toronto', label: 'Eastern (Toronto)' },
    { value: 'America/Winnipeg', label: 'Central (Winnipeg)' },
    { value: 'America/Edmonton', label: 'Mountain (Edmonton)' },
    { value: 'America/Vancouver', label: 'Pacific (Vancouver)' },
  ],
};

function defaultTzForCountry(cc: string): string {
  return DEFAULT_TZ_BY_COUNTRY[String(cc || 'DK').toUpperCase()] || 'Europe/Copenhagen';
}

function suggestedTimezones(cc: string): { value: string; label: string }[] {
  const c = String(cc || 'DK').toUpperCase();
  const extra = EXTRA_TZ[c];
  if (extra?.length) return extra;
  const v = defaultTzForCountry(c);
  return [{ value: v, label: v.replace(/\//g, ' / ').replace(/_/g, ' ') }];
}

function allIanaTimezones(): string[] {
  try {
    const IntlAny = Intl as { supportedValuesOf?: (k: string) => string[] };
    if (typeof IntlAny.supportedValuesOf === 'function') {
      return IntlAny.supportedValuesOf('timeZone');
    }
  } catch {
    /* ignore */
  }
  return [];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function ChevronDownIcon({ color = '#64748B' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
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

function isCompanyOwner(company: any, user?: any): boolean {
  const r = String(
    company?.user_role ||
      company?.role ||
      user?.user_role ||
      user?.companyRole ||
      user?.role ||
      '',
  ).toLowerCase();
  return r === 'owner';
}

export function MobileBusinessSettingsScreen(props: any) {
  const { route, navigation } = props;
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const owner = isCompanyOwner(company, user);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [form, setForm] = useState<CompanyProfile | null>(null);

  const [countryOpen, setCountryOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
  const [tzFilter, setTzFilter] = useState('');

  const [slugInput, setSlugInput] = useState('');
  const [slugStatus, setSlugStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugWarning, setSlugWarning] = useState(false);
  const slugDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [logoBusy, setLogoBusy] = useState(false);
  const [baselineForm, setBaselineForm] = useState<CompanyProfile | null>(null);

  const labels = useMemo(
    () => countryLabels(form?.countryCode || 'DK'),
    [form?.countryCode],
  );

  const suggestedTz = useMemo(
    () => suggestedTimezones(form?.countryCode || 'DK'),
    [form?.countryCode],
  );

  const allZones = useMemo(() => {
    const sug = new Set(suggestedTz.map((s) => s.value));
    return allIanaTimezones().filter((z) => !sug.has(z)).sort();
  }, [suggestedTz]);

  const filteredZones = useMemo(() => {
    const q = tzFilter.trim().toLowerCase();
    if (!q) return allZones.slice(0, 80);
    return allZones.filter((z) => z.toLowerCase().includes(q)).slice(0, 200);
  }, [allZones, tzFilter]);

  const load = useCallback(async () => {
    setLoadError('');
    setLoading(true);
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/companies/profile');
      const c = (res as any)?.data?.company;
      if (!c) throw new Error('No company data');
      const next: CompanyProfile = {
        id: Number(c.id) || 0,
        name: String(c.name || ''),
        slug: String(c.slug || ''),
        country: String(c.country || ''),
        countryCode: String(c.countryCode || 'DK'),
        timezone:
          String(c.timezone || c.effectiveTimezone || '') ||
          defaultTzForCountry(c.countryCode || 'DK'),
        cvrNumber: String(c.cvrNumber || ''),
        address: String(c.address || ''),
        city: String(c.city || ''),
        zipCode: String(c.zipCode || ''),
        email: String(c.email || ''),
        phone: String(c.phone || ''),
        website: String(c.website || ''),
        logoUrl: String(c.logoUrl || ''),
        defaultStartAddress: String(c.defaultStartAddress || ''),
        defaultEndAddress: String(c.defaultEndAddress || ''),
        routeLocationsEnabled: c.routeLocationsEnabled !== false,
      };
      if (!next.country) {
        next.country = COUNTRY_NAME[next.countryCode] || '';
      }
      setForm(next);
      setBaselineForm(next);
      setSlugInput(next.slug);
      setSlugStatus('idle');
      setSlugWarning(false);
    } catch (e: any) {
      setLoadError(
        e?.response?.data?.error ||
          e?.message ||
          'Could not load business settings.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const checkSlug = useCallback(
    (raw: string) => {
      if (slugDebounce.current) clearTimeout(slugDebounce.current);
      const normalized = slugify(raw);
      if (!normalized || normalized.length < 2) {
        setSlugStatus(normalized.length === 0 ? 'idle' : 'invalid');
        return;
      }
      if (form && normalized === form.slug) {
        setSlugStatus('idle');
        return;
      }
      setSlugStatus('checking');
      slugDebounce.current = setTimeout(async () => {
        try {
          await ensureAuthHeader();
          const res = await apiClient.get('/companies/check-slug', {
            params: { slug: normalized, excludeId: form?.id },
          });
          const available = Boolean((res as any)?.data?.available);
          setSlugStatus(available ? 'available' : 'taken');
        } catch {
          setSlugStatus('idle');
        }
      }, 400);
    },
    [form],
  );

  useEffect(() => {
    if (!owner || !form) return;
    checkSlug(slugInput);
    return () => {
      if (slugDebounce.current) clearTimeout(slugDebounce.current);
    };
  }, [slugInput, owner, form?.id, form?.slug, checkSlug]);

  const updateField = (patch: Partial<CompanyProfile>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const onPickCountry = (code: string) => {
    LayoutAnimation.configureNext(SNAPPY);
    const name = COUNTRY_NAME[code] || '';
    const tz = defaultTzForCountry(code);
    updateField({
      countryCode: code,
      country: name,
      timezone: tz,
    });
    setCountryOpen(false);
  };

  const onPickTimezone = (tz: string) => {
    LayoutAnimation.configureNext(SNAPPY);
    updateField({ timezone: tz });
    setTzOpen(false);
    setTzFilter('');
  };

  const profileDirty = useMemo(() => {
    if (!form || !baselineForm) return false;
    return JSON.stringify(form) !== JSON.stringify(baselineForm);
  }, [form, baselineForm]);

  const saveProfile = async () => {
    if (!form || saving) return;
    setSaving(true);
    setSavedFlash(false);
    try {
      await ensureAuthHeader();
      await apiClient.put('/companies/profile', {
        name: form.name.trim(),
        country: form.country.trim(),
        countryCode: form.countryCode,
        timezone: form.timezone,
        cvrNumber: form.cvrNumber.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        zipCode: form.zipCode.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.website.trim(),
        defaultStartAddress: form.defaultStartAddress.trim(),
        defaultEndAddress: form.defaultEndAddress.trim(),
        routeLocationsEnabled: form.routeLocationsEnabled,
      });
      setBaselineForm(form);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e: any) {
      Alert.alert(
        'Could not save',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async () => {
    if (logoBusy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photos',
        'Please allow photo library access to upload a company logo.',
      );
      return;
    }
    setLogoBusy(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // Avoid forcing crop UI; on some Android devices it can get stuck
        // and hide the accept action.
        allowsEditing: false,
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      const token = await AsyncStorage.getItem('authToken');
      const uri = asset.uri;
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'svg'
              ? 'image/svg+xml'
              : 'image/jpeg';
      const body = new FormData();
      body.append('logo', {
        uri,
        name: `logo.${ext === 'svg' ? 'svg' : ext === 'webp' ? 'webp' : ext === 'png' ? 'png' : 'jpg'}`,
        type: mime,
      } as any);

      const res = await fetch(`${apiOrigin()}/api/companies/profile/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      if (data.logoUrl) {
        updateField({ logoUrl: String(data.logoUrl) });
      }
    } catch (e: any) {
      Alert.alert('Logo', e?.message || 'Could not upload logo.');
    } finally {
      setLogoBusy(false);
    }
  };

  const deleteLogo = async () => {
    if (!form?.logoUrl || logoBusy) return;
    Alert.alert('Remove logo?', 'Invoices will no longer show this image.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setLogoBusy(true);
          try {
            await ensureAuthHeader();
            await apiClient.delete('/companies/profile/logo');
            updateField({ logoUrl: '' });
          } catch (e: any) {
            Alert.alert(
              'Could not remove',
              e?.response?.data?.error || e?.message || 'Try again.',
            );
          } finally {
            setLogoBusy(false);
          }
        },
      },
    ]);
  };

  const slugChanged =
    form && slugify(slugInput) !== form.slug && slugify(slugInput).length >= 2;
  const slugFlowReady = Boolean(
    slugChanged && slugStatus === 'available',
  );

  const saveSlug = async () => {
    if (!form || !owner || slugSaving) return;
    const normalized = slugify(slugInput);
    if (!normalized || normalized.length < 2) {
      Alert.alert('Invalid URL', 'Use at least 2 characters, letters, numbers and dashes only.');
      return;
    }
    if (normalized === form.slug) {
      Alert.alert('No change', 'That is already your workspace URL.');
      return;
    }
    if (slugStatus === 'taken') {
      Alert.alert('Taken', 'That URL is already in use. Pick another.');
      return;
    }
    setSlugSaving(true);
    try {
      await ensureAuthHeader();
      const res = await apiClient.patch('/companies/slug', { slug: normalized });
      const data = (res as any)?.data;
      const token = data?.token;
      if (token) {
        await AsyncStorage.setItem('authToken', token);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      const apiUser = data?.user;
      const nextSlug = String(data?.slug || normalized);
      const mergedUser = apiUser
        ? {
            ...user,
            id: apiUser.id ?? user?.id,
            firstName: apiUser.firstName ?? user?.firstName,
            lastName: apiUser.lastName ?? user?.lastName,
            email: apiUser.email ?? user?.email,
            role: apiUser.role ?? user?.role,
            companyId: apiUser.companyId ?? user?.companyId,
            companyName: apiUser.companyName ?? user?.companyName,
            ...(apiUser as object),
          }
        : user;
      const mergedCompany = {
        ...company,
        slug: nextSlug,
        name: apiUser?.companyName || company?.name || form.name,
      };
      updateField({ slug: nextSlug });
      setSlugInput(nextSlug);
      setSlugWarning(false);
      setSlugStatus('idle');
      navigation.navigate({
        name: 'CompanyTabs',
        params: { user: mergedUser, company: mergedCompany },
        merge: true,
      } as any);
      Alert.alert('URL updated', 'Your workspace link has been changed.');
    } catch (e: any) {
      Alert.alert(
        'Could not update URL',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
    } finally {
      setSlugSaving(false);
    }
  };

  const previewCard = form ? (
    <View style={styles.hero}>
      <Text style={styles.heroKicker}>{padAndroidText('Company')}</Text>
      <Text style={styles.heroTitle} numberOfLines={2}>
        {padAndroidText(form.name || '—')}
      </Text>
      <Text style={styles.heroMeta} numberOfLines={1}>
        {padAndroidText(
          `${form.slug} · ${form.countryCode} · ${form.timezone}`,
        )}
      </Text>
    </View>
  ) : null;

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
          <Text style={styles.titleText}>{padAndroidText('Business')}</Text>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {padAndroidText('Company info, address & branding')}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
        ) : form ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: 120 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {previewCard}

            <Text style={styles.sectionLabel}>
              {padAndroidText('Company details')}
            </Text>
            <View style={styles.card}>
              <Text style={styles.fieldLbl}>{padAndroidText('Country')}</Text>
              <TouchableOpacity
                style={styles.selectRow}
                onPress={() => setCountryOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.selectText} numberOfLines={1}>
                  {padAndroidText(
                    `${COUNTRY_NAME[form.countryCode] || form.country} (${form.countryCode})`,
                  )}
                </Text>
                <ChevronDownIcon />
              </TouchableOpacity>

              <Text style={[styles.fieldLbl, { marginTop: 14 }]}>
                {padAndroidText('Time zone')}
              </Text>
              <TouchableOpacity
                style={styles.selectRow}
                onPress={() => setTzOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.selectText} numberOfLines={2}>
                  {padAndroidText(form.timezone)}
                </Text>
                <ChevronDownIcon />
              </TouchableOpacity>
              <Text style={styles.hint}>
                {padAndroidText(
                  'Used for scheduling and automated emails.',
                )}
              </Text>

              <Field
                label={padAndroidText('Company name')}
                value={form.name}
                onChange={(v) => updateField({ name: v })}
                placeholder="Acme ApS"
              />
              <Field
                label={padAndroidText(labels.companyNo)}
                value={form.cvrNumber}
                onChange={(v) => updateField({ cvrNumber: v })}
                placeholder=""
              />
              <Field
                label={padAndroidText('Country name')}
                value={form.country}
                onChange={(v) => updateField({ country: v })}
                placeholder=""
              />
              <Field
                label={padAndroidText('City')}
                value={form.city}
                onChange={(v) => updateField({ city: v })}
                placeholder=""
              />
              <Field
                label={padAndroidText('Address')}
                value={form.address}
                onChange={(v) => updateField({ address: v })}
                placeholder=""
                multiline
              />
              <Field
                label={padAndroidText(labels.postal)}
                value={form.zipCode}
                onChange={(v) => updateField({ zipCode: v })}
                placeholder=""
              />
            </View>

            <Text style={styles.sectionLabel}>
              {padAndroidText('On invoices')}
            </Text>
            <View style={styles.card}>
              <Text style={styles.hintBox}>
                {padAndroidText(
                  'Shown on every invoice. Leave blank to hide a line.',
                )}
              </Text>
              <Field
                label={padAndroidText('Contact email')}
                value={form.email}
                onChange={(v) => updateField({ email: v })}
                placeholder="hello@company.com"
                keyboardType="email-address"
              />
              <Field
                label={padAndroidText('Contact phone')}
                value={form.phone}
                onChange={(v) => updateField({ phone: v })}
                placeholder="+45 12 34 56 78"
                keyboardType="phone-pad"
              />
              <Field
                label={padAndroidText('Website')}
                value={form.website}
                onChange={(v) => updateField({ website: v })}
                placeholder="https://"
                keyboardType="url"
              />
            </View>

            <Text style={styles.sectionLabel}>
              {padAndroidText('Routes')}
            </Text>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>
                    {padAndroidText('Start & end locations')}
                  </Text>
                  <Text style={styles.hint}>
                    {padAndroidText(
                      'Let employees set route start/end (e.g. home). Planner uses defaults below if they do not.',
                    )}
                  </Text>
                </View>
                <Switch
                  value={form.routeLocationsEnabled}
                  onValueChange={(v) => {
                    LayoutAnimation.configureNext(SNAPPY);
                    updateField({ routeLocationsEnabled: v });
                  }}
                  trackColor={{ false: '#CBD5E1', true: '#94CFB7' }}
                  thumbColor={
                    form.routeLocationsEnabled ? '#193434' : '#f4f3f4'
                  }
                />
              </View>
              {form.routeLocationsEnabled ? (
                <>
                  <Field
                    label={padAndroidText('Default start address')}
                    value={form.defaultStartAddress}
                    onChange={(v) =>
                      updateField({ defaultStartAddress: v })
                    }
                    placeholder="Street, city"
                    multiline
                  />
                  <Field
                    label={padAndroidText('Default end address')}
                    value={form.defaultEndAddress}
                    onChange={(v) =>
                      updateField({ defaultEndAddress: v })
                    }
                    placeholder="Optional — empty uses start"
                    multiline
                  />
                </>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>
              {padAndroidText('Company logo')}
            </Text>
            <View style={styles.card}>
              <View style={styles.logoRow}>
                <View style={styles.logoBox}>
                  {form.logoUrl ? (
                    <Image
                      source={{ uri: publicUrl(form.logoUrl) }}
                      style={styles.logoImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.logoEmpty}>
                      {padAndroidText('No logo')}
                    </Text>
                  )}
                </View>
                <View style={styles.logoActions}>
                  <TouchableOpacity
                    style={styles.logoBtn}
                    onPress={pickLogo}
                    disabled={logoBusy}
                  >
                    {logoBusy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <RNText style={styles.logoBtnTxt} allowFontScaling={false}>
                        {padAndroidText(
                          form.logoUrl ? 'Replace' : 'Upload',
                        )}
                      </RNText>
                    )}
                  </TouchableOpacity>
                  {form.logoUrl ? (
                    <TouchableOpacity
                      style={styles.logoBtnGhost}
                      onPress={deleteLogo}
                      disabled={logoBusy}
                    >
                      <RNText style={styles.logoBtnGhostTxt} allowFontScaling={false}>
                        {padAndroidText('Remove')}
                      </RNText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <Text style={styles.hint}>
                {padAndroidText('PNG, JPG, WEBP or SVG — max 4 MB.')}
              </Text>
            </View>

            {owner ? (
              <>
                <Text style={styles.sectionLabel}>
                  {padAndroidText('Workspace URL')}
                </Text>
                <View style={styles.card}>
                  <Text style={styles.monoHint} selectable>
                    {padAndroidText(`…/${form.slug}/`)}
                  </Text>
                  <Text style={styles.fieldLbl}>
                    {padAndroidText('New slug')}
                  </Text>
                  <TextInput
                    value={slugInput}
                    onChangeText={(t) => {
                      setSlugInput(t);
                      setSlugWarning(false);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={form.slug}
                    style={[
                      styles.input,
                      slugStatus === 'taken' || slugStatus === 'invalid'
                        ? styles.inputErr
                        : null,
                    ]}
                  />
                  {slugStatus === 'checking' ? (
                    <ActivityIndicator
                      style={{ marginTop: 8 }}
                      color="#193434"
                    />
                  ) : (
                    <Text style={styles.slugStatus}>
                      {slugStatus === 'available'
                        ? padAndroidText('Available')
                        : slugStatus === 'taken'
                          ? padAndroidText('Already taken')
                          : slugStatus === 'invalid'
                            ? padAndroidText('Invalid — use letters, numbers, dashes (min 2)')
                            : slugify(slugInput) === form.slug
                              ? padAndroidText('Current URL')
                              : ' '}
                    </Text>
                  )}
                  {!slugWarning && slugChanged ? (
                    <TouchableOpacity
                      style={styles.slugCta}
                      onPress={() => setSlugWarning(true)}
                      disabled={!slugFlowReady}
                    >
                      <Text style={styles.slugCtaTxt}>
                        {padAndroidText('Change workspace URL')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {slugWarning ? (
                    <View style={styles.warnBox}>
                      <Text style={styles.warnTitle}>
                        {padAndroidText('Are you sure?')}
                      </Text>
                      <Text style={styles.warnBody}>
                        {padAndroidText(
                          'Old bookmarks and shared links will stop working. There is no automatic redirect.',
                        )}
                      </Text>
                      <View style={styles.warnRow}>
                        <TouchableOpacity
                          style={styles.warnCancel}
                          onPress={() => setSlugWarning(false)}
                        >
                          <Text style={styles.warnCancelTxt}>
                            {padAndroidText('Cancel')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.warnGo,
                            !slugFlowReady && styles.warnGoOff,
                          ]}
                          onPress={saveSlug}
                          disabled={!slugFlowReady || slugSaving}
                        >
                          {slugSaving ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <Text style={styles.warnGoTxt}>
                              {padAndroidText('Change it')}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              </>
            ) : (
              <Text style={styles.ownerOnly}>
                {padAndroidText(
                  'Only the company owner can change the workspace URL.',
                )}
              </Text>
            )}
          </ScrollView>
        ) : null}

        {!loading && !loadError && form ? (
          <View
            style={[
              styles.stickyBar,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.saveBtn,
                !profileDirty && styles.saveBtnIdle,
                (saving || !profileDirty) && styles.saveBtnOff,
              ]}
              onPress={saveProfile}
              disabled={saving || !profileDirty}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <RNText
                  style={[
                    styles.saveBtnTxt,
                    profileDirty ? styles.saveBtnTxtOn : styles.saveBtnTxtIdle,
                  ]}
                  allowFontScaling={false}
                >
                  {padAndroidText(
                    savedFlash ? 'Saved ✓' : 'Save changes',
                  )}
                </RNText>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={countryOpen} animationType="slide" transparent>
        <View style={styles.modalScrim}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>{padAndroidText('Country')}</Text>
            <FlatList
              data={COUNTRY_OPTIONS}
              keyExtractor={(i) => i.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => onPickCountry(item.code)}
                >
                  <Text style={styles.modalRowTxt}>
                    {padAndroidText(`${item.name} (${item.code})`)}
                  </Text>
                  {form?.countryCode === item.code ? (
                    <Text style={styles.modalCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setCountryOpen(false)}
            >
              <Text style={styles.modalCloseTxt}>
                {padAndroidText('Close')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={tzOpen} animationType="slide" transparent>
        <View style={styles.modalScrim}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16, maxHeight: '88%' }]}>
            <Text style={styles.modalTitle}>{padAndroidText('Time zone')}</Text>
            <Text style={styles.fieldLbl}>{padAndroidText('Suggested')}</Text>
            {suggestedTz.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.modalRow}
                onPress={() => onPickTimezone(opt.value)}
              >
                <Text style={styles.modalRowTxt}>{padAndroidText(opt.label)}</Text>
                {form?.timezone === opt.value ? (
                  <Text style={styles.modalCheck}>✓</Text>
                ) : null}
              </TouchableOpacity>
            ))}
            <Text style={[styles.fieldLbl, { marginTop: 12 }]}>
              {padAndroidText('All zones')}
            </Text>
            <TextInput
              value={tzFilter}
              onChangeText={setTzFilter}
              placeholder="Search…"
              placeholderTextColor="#94A3B8"
              style={styles.tzSearch}
            />
            <FlatList
              style={{ maxHeight: 320 }}
              data={filteredZones}
              keyExtractor={(z) => z}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: z }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => onPickTimezone(z)}
                >
                  <Text style={styles.modalRowSmall}>{padAndroidText(z)}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.hint}>
                  {padAndroidText('Type to search time zones.')}
                </Text>
              }
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => {
                setTzOpen(false);
                setTzFilter('');
              }}
            >
              <Text style={styles.modalCloseTxt}>
                {padAndroidText('Close')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url';
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={[styles.input, multiline && { minHeight: 72, textAlignVertical: 'top' }]}
        multiline={!!multiline}
        keyboardType={keyboardType || 'default'}
      />
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
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  titleText: { fontSize: 17, fontWeight: '800', color: '#193434' },
  subtitleText: { marginTop: 2, fontSize: 12, color: '#64748B' },
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
  hero: {
    backgroundColor: '#193434',
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94CFB7',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: { marginTop: 8, fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  heroMeta: { marginTop: 8, fontSize: 12, color: '#CBD5E1' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#193434' },
  fieldLbl: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  hint: { fontSize: 12, color: '#94A3B8', lineHeight: 17, marginTop: 4 },
  hintBox: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#193434',
    backgroundColor: '#FAFAFA',
  },
  inputErr: { borderColor: '#F87171' },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#FAFAFA',
  },
  selectText: { flex: 1, fontSize: 15, color: '#193434', marginRight: 8 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  flex1: { flex: 1, minWidth: 0 },
  logoRow: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  logoBox: {
    width: 100,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: { width: '100%', height: '100%' },
  logoEmpty: { fontSize: 12, color: '#94A3B8', paddingHorizontal: 8, textAlign: 'center' },
  logoActions: { flex: 1, minWidth: 136, gap: 8, justifyContent: 'center' },
  logoBtn: {
    backgroundColor: '#193434',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  logoBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    ...androidTextFix,
  },
  logoBtnGhost: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
  },
  logoBtnGhostTxt: {
    color: '#B91C1C',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    ...androidTextFix,
  },
  monoHint: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#475569',
    marginBottom: 10,
  },
  slugStatus: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#64748B' },
  slugCta: {
    marginTop: 12,
    backgroundColor: '#193434',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  slugCtaTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  warnBox: {
    marginTop: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
  },
  warnTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  warnBody: { marginTop: 6, fontSize: 13, color: '#A16207', lineHeight: 18 },
  warnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  warnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    alignItems: 'center',
  },
  warnCancelTxt: { fontWeight: '700', color: '#92400E' },
  warnGo: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
  },
  warnGoOff: { opacity: 0.45 },
  warnGoTxt: { fontWeight: '800', color: '#FFFFFF' },
  ownerOnly: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
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
    backgroundColor: '#3DD57A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnIdle: {
    backgroundColor: '#CBD5E1',
  },
  saveBtnOff: { opacity: 0.7 },
  saveBtnTxt: {
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    ...androidTextFix,
  },
  saveBtnTxtOn: { color: '#FFFFFF' },
  saveBtnTxtIdle: { color: '#64748B' },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#193434',
    marginBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7ECE9',
  },
  modalRowTxt: { flex: 1, fontSize: 16, color: '#193434', fontWeight: '600' },
  modalRowSmall: { flex: 1, fontSize: 14, color: '#475569' },
  modalCheck: { fontSize: 16, color: '#0F766E', fontWeight: '800' },
  modalClose: { marginTop: 12, paddingVertical: 14, alignItems: 'center' },
  modalCloseTxt: { fontSize: 16, fontWeight: '700', color: '#193434' },
  tzSearch: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
});
