import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { apiClient } from '../api/client';
import AndroidSafeText from '../components/AndroidSafeText';
import {
  androidPillTextFix,
  androidTextFix,
  padAndroidText,
} from '../ui/androidText';
import type { Company, User } from '../types';

const Text = Platform.OS === 'android' ? AndroidSafeText : RNText;

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

export type ClientListRow = {
  id: number;
  client_type: 'person' | 'company';
  name: string;
  last_name: string | null;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  created_at?: string;
  job_count?: number | string;
  last_job_date?: string | null;
  // Set server-side when a client has been anonymized ("right to be
  // forgotten"). The row is kept so jobs/invoices stay consistent; the UI
  // can decide to label it as a deleted client.
  deleted_at?: string | null;
};

/** Snapshot passed into create/edit sheet (create ignores `id` for new clients). */
type ClientEditSource = ClientListRow & {
  company_number?: string | null;
};

function getInitials(name: string, lastName?: string | null) {
  const first = name?.[0]?.toUpperCase() || '';
  const last = lastName?.[0]?.toUpperCase() || '';
  return first + (last || '');
}

const AVATAR_BG = ['#BFD1C5', '#d4e8dc', '#e8f0ec', '#c5d8cc', '#dceae2'];

function avatarBg(id: number) {
  return AVATAR_BG[Math.abs(id) % AVATAR_BG.length];
}

function BuildingIcon({ color = '#193434', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18M6 12h4m4 0h4m-8 4h4m4 0h4M6 8h4m4 0h4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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

function businessCurrencyFromCompany(company: Company | null | undefined): string {
  const cc = String((company as any)?.country_code || 'DK');
  if (cc === 'SE') return 'SEK';
  if (cc === 'NO') return 'NOK';
  if (cc === 'DE' || cc === 'FR' || cc === 'NL' || cc === 'ES') return 'EUR';
  if (cc === 'GB') return 'GBP';
  if (cc === 'US') return 'USD';
  return 'DKK';
}

/** Matches web clients list filtering. */
const SCREEN_H = Dimensions.get('window').height;
const CREATE_SHEET_SPRING = {
  stiffness: 380,
  damping: 28,
  mass: 0.85,
  overshootClamping: true,
  useNativeDriver: true,
} as const;

function PlusIconFab({ color = '#FFFFFF' }: { color?: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function fieldsFromMapboxFeature(f: any): {
  address: string;
  zip: string;
  city: string;
} {
  const num = f?.address != null ? String(f.address).trim() : '';
  const streetName = String(f?.text || '').trim();
  const line1 = [num, streetName].filter(Boolean).join(' ').trim();
  let zip = '';
  let city = '';
  const ctx = Array.isArray(f?.context) ? f.context : [];
  for (const c of ctx) {
    const id = String(c?.id || '');
    if (id.startsWith('postcode.')) {
      zip = String(c.text || '').trim();
    }
    if (
      id.startsWith('place.') ||
      id.startsWith('locality.') ||
      id.startsWith('district.')
    ) {
      if (!city) city = String(c.text || '').trim();
    }
  }
  const fallbackLine =
    String(f?.place_name || '')
      .split(',')[0]
      ?.trim() || '';
  const address = line1 || fallbackLine;
  return { address, zip, city };
}

export function ClientCreateSheet({
  visible,
  onClose,
  onCreated,
  editingClient = null,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (clientId: number) => void;
  editingClient?: ClientEditSource | null;
  onSaved?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [clientType, setClientType] = useState<'person' | 'company'>('person');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [companyNumber, setCompanyNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressSuggest, setAddressSuggest] = useState<any[]>([]);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressFetchPending, setAddressFetchPending] = useState(false);
  const addressSkipBlurRef = useRef(false);
  const isEdit = !!(editingClient && editingClient.id);

  const reset = useCallback(() => {
    setClientType('person');
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setZip('');
    setCity('');
    setCompanyNumber('');
    setSaving(false);
    setAddressFocused(false);
    setAddressSuggest([]);
    setAddressSearchLoading(false);
    setAddressFetchPending(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      slideY.setValue(SCREEN_H);
      fade.setValue(0);
      return;
    }
    if (editingClient) {
      setClientType(editingClient.client_type);
      setFirstName(editingClient.name || '');
      setLastName(editingClient.last_name || '');
      setPhone(editingClient.phone || '');
      setEmail(editingClient.email || '');
      setAddress(editingClient.address || '');
      setZip(editingClient.zip_code || '');
      setCity(editingClient.city || '');
      setCompanyNumber(String(editingClient.company_number || ''));
    } else {
      reset();
    }
    slideY.setValue(SCREEN_H * 0.4);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, ...CREATE_SHEET_SPRING }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, editingClient, reset, slideY, fade]);

  useEffect(() => {
    const q = address.trim();
    if (q.length < 3) {
      setAddressSuggest([]);
      setAddressSearchLoading(false);
      setAddressFetchPending(false);
      return;
    }
    setAddressFetchPending(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      setAddressSearchLoading(true);
      try {
        await ensureAuthHeader();
        const res = await apiClient.get('/clients/geocode/suggest', {
          params: { q },
        });
        if (!cancelled) {
          setAddressSuggest(
            Array.isArray(res.data?.features) ? res.data.features : [],
          );
        }
      } catch {
        if (!cancelled) setAddressSuggest([]);
      } finally {
        if (!cancelled) setAddressSearchLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [address]);

  const pickMapboxFeature = useCallback((feature: any) => {
    const { address: a, zip: z, city: c } = fieldsFromMapboxFeature(feature);
    setAddress(a);
    setZip(z);
    setCity(c);
    setAddressSuggest([]);
  }, []);

  const animateClose = useCallback(
    (then?: () => void) => {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(slideY, {
          toValue: SCREEN_H,
          stiffness: 320,
          damping: 32,
          mass: 1,
          overshootClamping: true,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) then?.();
      });
    },
    [fade, slideY],
  );

  const handleClose = () => {
    animateClose(onClose);
  };

  const canSave =
    firstName.trim().length > 0 &&
    (clientType === 'company' || lastName.trim().length > 0);

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await ensureAuthHeader();
      const payload: Record<string, unknown> = {
        name: firstName.trim(),
        last_name: clientType === 'person' ? lastName.trim() : null,
        client_type: clientType,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        zip_code: zip.trim() || null,
        city: city.trim() || null,
        company_number:
          clientType === 'company' ? companyNumber.trim() || null : null,
      };
      if (isEdit && editingClient?.id) {
        await apiClient.put(`/clients/${editingClient.id}`, payload);
        setSaving(false);
        animateClose(() => {
          onSaved?.();
        });
      } else {
        const res = await apiClient.post('/clients', payload);
        const id = res.data?.client?.id;
        if (!id) throw new Error('No client id returned');
        setSaving(false);
        animateClose(() => {
          onCreated(Number(id));
        });
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || 'Could not save client';
      Alert.alert(isEdit ? 'Could not save changes' : 'Could not create client', String(msg));
      setSaving(false);
    }
  };

  if (!visible) return null;

  const backdropOpacity = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.52],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.createModalRoot}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.createModalBackdrop, { opacity: backdropOpacity }]}
          />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.createModalKav}
        >
          <Animated.View
            style={[
              styles.createSheet,
              {
                paddingBottom: insets.bottom + 16,
                transform: [{ translateY: slideY }],
              },
            ]}
          >
            <View style={styles.createSheetGrip} />
            <View style={styles.createSheetHeader}>
              <Text style={styles.createSheetTitle}>
                {padAndroidText(isEdit ? 'Edit client' : 'New client')}
              </Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12}>
                <Text style={styles.createSheetClose}>{padAndroidText('Close')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.createSheetIntro}>
              {padAndroidText(
                isEdit
                  ? 'Update details for this client. Changes sync everywhere.'
                  : 'Add someone you work with. You can edit full details anytime.',
              )}
            </Text>

            <View style={styles.createTypeRow}>
              {(['person', 'company'] as const).map((t) => {
                const on = clientType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.createTypeChip, on && styles.createTypeChipOn]}
                    onPress={() => setClientType(t)}
                    activeOpacity={0.88}
                  >
                    <RNText
                      style={[styles.createTypeChipText, on && styles.createTypeChipTextOn]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {t === 'person' ? 'Person' : 'Company'}
                    </RNText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.createFormScroll}
            >
              <Text style={styles.createFieldLabel}>
                {padAndroidText(clientType === 'person' ? 'First name' : 'Company name')}
              </Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder={clientType === 'person' ? 'e.g. Anna' : 'e.g. Acme ApS'}
                placeholderTextColor="#94A3B8"
                style={styles.createInput}
                autoCapitalize="words"
              />
              {clientType === 'person' ? (
                <>
                  <Text style={styles.createFieldLabel}>{padAndroidText('Last name')}</Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="e.g. Nielsen"
                    placeholderTextColor="#94A3B8"
                    style={styles.createInput}
                    autoCapitalize="words"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.createFieldLabel}>
                    {padAndroidText('Company number (optional)')}
                  </Text>
                  <TextInput
                    value={companyNumber}
                    onChangeText={setCompanyNumber}
                    placeholder="e.g. CVR 12345678"
                    placeholderTextColor="#94A3B8"
                    style={styles.createInput}
                    keyboardType="default"
                    autoCapitalize="characters"
                  />
                </>
              )}

              <Text style={styles.createFieldLabel}>{padAndroidText('Phone (optional)')}</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+45 …"
                placeholderTextColor="#94A3B8"
                style={styles.createInput}
                keyboardType="phone-pad"
              />
              <Text style={styles.createFieldLabel}>{padAndroidText('Email (optional)')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@company.dk"
                placeholderTextColor="#94A3B8"
                style={styles.createInput}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={styles.createFieldLabel}>{padAndroidText('Address (optional)')}</Text>
              <View style={styles.addressFieldWrap}>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  onFocus={() => setAddressFocused(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (!addressSkipBlurRef.current) {
                        setAddressFocused(false);
                      }
                      addressSkipBlurRef.current = false;
                    }, 220);
                  }}
                  placeholder="Start typing — address search"
                  placeholderTextColor="#94A3B8"
                  style={[styles.createInput, styles.createInputAddress]}
                  autoCorrect={false}
                />
                {(addressSearchLoading || addressFetchPending) &&
                address.trim().length >= 3 ? (
                  <View style={styles.addressSearchLoading}>
                    <ActivityIndicator size="small" color="#5E7A70" />
                  </View>
                ) : null}
                {addressFocused &&
                address.trim().length >= 3 &&
                addressSuggest.length > 0 ? (
                  <View style={styles.addressSuggestList}>
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {addressSuggest.map((f, idx) => {
                        const label = String(f?.place_name || f?.text || '').trim();
                        if (!label) return null;
                        return (
                          <TouchableOpacity
                            key={`${f?.id || label}-${idx}`}
                            style={[
                              styles.addressSuggestRow,
                              idx > 0 && styles.addressSuggestRowBorder,
                            ]}
                            activeOpacity={0.75}
                            onPressIn={() => {
                              addressSkipBlurRef.current = true;
                            }}
                            onPress={() => {
                              pickMapboxFeature(f);
                              setAddressFocused(false);
                            }}
                          >
                            <Text style={styles.addressSuggestText} numberOfLines={2}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
              <View style={styles.createRow2}>
                <View style={styles.createRow2Col}>
                  <Text style={styles.createFieldLabel}>{padAndroidText('Zip')}</Text>
                  <TextInput
                    value={zip}
                    onChangeText={setZip}
                    placeholder="1234"
                    placeholderTextColor="#94A3B8"
                    style={styles.createInput}
                  />
                </View>
                <View style={styles.createRow2Col}>
                  <Text style={styles.createFieldLabel}>{padAndroidText('City')}</Text>
                  <TextInput
                    value={city}
                    onChangeText={setCity}
                    placeholder="Copenhagen"
                    placeholderTextColor="#94A3B8"
                    style={styles.createInput}
                  />
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.createSaveBtn, (!canSave || saving) && styles.createSaveBtnDisabled]}
              onPress={submit}
              disabled={!canSave || saving}
              activeOpacity={0.9}
            >
              <Text style={styles.createSaveBtnText}>
                {saving
                  ? padAndroidText(isEdit ? 'Saving…' : 'Creating…')
                  : padAndroidText(isEdit ? 'Save changes' : 'Create client')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function filterClients(
  clients: ClientListRow[],
  searchTerm: string,
  filterType: 'all' | 'person' | 'company',
): ClientListRow[] {
  let list = clients;
  if (filterType !== 'all') {
    list = list.filter((c) => c.client_type === filterType);
  }
  if (!searchTerm.trim()) return list;
  const s = searchTerm.toLowerCase().replace(/\s+/g, '');
  return list.filter((c) => {
    const fullName = `${c.name}${c.last_name ? ' ' + c.last_name : ''}`.toLowerCase();
    const phone = (c.phone || '').replace(/\s+/g, '').toLowerCase();
    return (
      fullName.includes(searchTerm.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.includes(s) ||
      (c.city || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
}

export function MobileClientsListScreen(props: any) {
  const { route, navigation } = props;
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<ClientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'person' | 'company'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const fabScale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.spring(fabScale, {
      toValue: 1,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [fabScale]);

  const load = useCallback(async () => {
    setError('');
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/clients');
      setClients(res.data?.clients || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not load clients');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const filtered = useMemo(
    () => filterClients(clients, searchTerm, filterType),
    [clients, searchTerm, filterType],
  );

  const personCount = useMemo(
    () => clients.filter((c) => c.client_type === 'person').length,
    [clients],
  );
  const companyCount = useMemo(
    () => clients.filter((c) => c.client_type === 'company').length,
    [clients],
  );

  const setFilter = (t: 'all' | 'person' | 'company') => {
    LayoutAnimation.configureNext(SNAPPY);
    setFilterType(t);
  };

  const renderItem = ({ item, index }: { item: ClientListRow; index: number }) => {
    const fullName = `${item.name}${item.last_name ? ' ' + item.last_name : ''}`;
    const location = [item.address, item.city].filter(Boolean).join(', ');
    const initials = getInitials(item.name, item.last_name);
    return (
      <TouchableOpacity
        style={[styles.listRow, index > 0 && styles.listRowBorder]}
        activeOpacity={0.72}
        onPress={() =>
          navigation.navigate('ClientDetail', {
            clientId: item.id,
            company,
            user,
          })
        }
      >
        <View
          style={[
            styles.avatar,
            { backgroundColor: avatarBg(item.id) },
          ]}
        >
          {item.client_type === 'company' ? (
            <BuildingIcon size={22} />
          ) : (
            <Text style={styles.avatarText}>{padAndroidText(initials)}</Text>
          )}
        </View>
        <View style={styles.listRowMain}>
          <View style={styles.listRowTitleRow}>
            <Text style={styles.listRowName} numberOfLines={2}>
              {padAndroidText(fullName)}
            </Text>
            {item.client_type === 'company' ? (
              <View style={styles.typePill}>
                <RNText style={styles.typePillText}>
                  {padAndroidText('Company')}
                </RNText>
              </View>
            ) : (
              <View style={styles.typePill}>
                <RNText style={styles.typePillText}>
                  {padAndroidText('Person')}
                </RNText>
              </View>
            )}
          </View>
          {location ? (
            <Text style={styles.listRowMeta} numberOfLines={1}>
              {padAndroidText(location)}
            </Text>
          ) : null}
          {item.phone || item.email ? (
            <Text style={styles.listRowContact} numberOfLines={1}>
              {padAndroidText(
                [item.phone, item.email].filter(Boolean).join(' · '),
              )}
            </Text>
          ) : null}
        </View>
        <Text style={styles.listChevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const openCreate = () => {
    Animated.sequence([
      Animated.spring(fabScale, {
        toValue: 0.9,
        friction: 4,
        tension: 400,
        useNativeDriver: true,
      }),
      Animated.spring(fabScale, {
        toValue: 1,
        friction: 6,
        tension: 280,
        useNativeDriver: true,
      }),
    ]).start(() => setCreateOpen(true));
  };

  return (
    <View style={[styles.screenRoot, { paddingTop: insets.top }]}>
      <View style={styles.clientsToolbar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeftIcon />
        </TouchableOpacity>
        <View style={styles.toolbarTitleWrap}>
          <RNText style={styles.clientsTitle}>{padAndroidText('Clients')}</RNText>
          {!loading ? (
            <Text style={styles.clientsSubtitle}>
              {padAndroidText(
                clients.length === 1
                  ? `${clients.length} client`
                  : `${clients.length} clients`,
              )}
            </Text>
          ) : null}
        </View>
        <View style={styles.backBtnSpacer} />
      </View>

      <View style={styles.filtersSearchBlock}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsScroll}
        >
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'all' && styles.filterChipOn]}
            onPress={() => setFilter('all')}
          >
            <RNText
              style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextOn]}
            >
              {padAndroidText(`All (${clients.length})`)}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'person' && styles.filterChipOn]}
            onPress={() => setFilter('person')}
          >
            <RNText
              style={[styles.filterChipText, filterType === 'person' && styles.filterChipTextOn]}
            >
              {padAndroidText(`People (${personCount})`)}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'company' && styles.filterChipOn]}
            onPress={() => setFilter('company')}
          >
            <RNText
              style={[
                styles.filterChipText,
                filterType === 'company' && styles.filterChipTextOn,
              ]}
            >
              {padAndroidText(`Company (${companyCount})`)}
            </RNText>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search name, email, phone, city…"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchTerm.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchTerm('')} hitSlop={12}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{padAndroidText(error)}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
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
            !loading && styles.listContentWithFab,
            filtered.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor="#193434"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {padAndroidText(searchTerm ? 'No matches' : 'No clients yet')}
              </Text>
              <Text style={styles.emptySub}>
                {padAndroidText(
                  searchTerm
                    ? 'Try a different search or filter.'
                    : 'Add clients on the web app to see them here.',
                )}
              </Text>
            </View>
          }
        />
      )}

      {!loading ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.fabWrap,
            {
              bottom: Math.max(insets.bottom, 10) + 56,
              transform: [{ scale: fabScale }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.fabBtn}
            onPress={openCreate}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Add new client"
          >
            <View style={styles.fabIconWrap}>
              <PlusIconFab />
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <ClientCreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(clientId) => {
          setCreateOpen(false);
          load();
          navigation.navigate('ClientDetail', {
            clientId,
            company,
            user,
          });
        }}
      />
    </View>
  );
}

type ClientDetail = ClientListRow & {
  company_number?: string | null;
  country?: string | null;
  billing_address?: string | null;
  billing_zip_code?: string | null;
  billing_city?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  ean_number?: string | null;
  job_count?: number | string;
  last_job_date?: string | null;
  total_spent?: number | string | null;
};

type JobRow = {
  id: number;
  title?: string;
  scheduled_date?: string;
  status?: string;
  scheduled_time_from?: string | null;
  scheduled_time_to?: string | null;
};

type SubscriptionRow = {
  id: number;
  title?: string | null;
  client_id: number;
  assigned_user_id?: number | null;
  starting_date?: string | null;
  next_occurrence_date?: string | null;
  recurrence_type?: 'weekly' | 'monthly';
  day_of_week?: number | null;
  day_of_month?: number | null;
  interval_value?: number | null;
  scheduled_time_from?: string | null;
  scheduled_time_to?: string | null;
  note?: string | null;
  is_active?: boolean;
  paused_at?: string | null;
  service_count?: number | string;
  total_price?: number | string;
  services?: Array<any>;
};

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function ordinalDay(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function recurrenceLabel(s: SubscriptionRow): string {
  const interval = Math.max(1, Number(s.interval_value || 1));
  if (s.recurrence_type === 'weekly') {
    const dn = WEEKDAY_NAMES[Number(s.day_of_week || 0)] || 'day';
    if (interval === 1) return `Every ${dn}`;
    return `Every ${interval} weeks · ${dn}`;
  }
  if (s.recurrence_type === 'monthly') {
    const dom = Number(s.day_of_month || 1);
    if (interval === 1) return `Monthly · ${ordinalDay(dom)}`;
    return `Every ${interval} months · ${ordinalDay(dom)}`;
  }
  return 'Recurring';
}

export function MobileClientDetailScreen(props: any) {
  const { route, navigation } = props;
  const { clientId, company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);
  const [busySubId, setBusySubId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'jobs' | 'subscriptions'>(
    'overview',
  );
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientDeleting, setClientDeleting] = useState(false);

  const loadClient = useCallback(async () => {
    setError('');
    try {
      await ensureAuthHeader();
      const res = await apiClient.get(`/clients/${clientId}`);
      setClient(res.data?.client || null);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not load client');
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      await ensureAuthHeader();
      const res = await apiClient.get(`/clients/${clientId}/jobs`);
      setJobs(res.data?.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [clientId]);

  const loadSubscriptions = useCallback(async () => {
    setSubsLoading(true);
    try {
      await ensureAuthHeader();
      const res = await apiClient.get(`/clients/${clientId}/subscriptions`);
      const list: SubscriptionRow[] = res.data?.subscriptions || [];
      setSubscriptions(list);
    } catch {
      setSubscriptions([]);
    } finally {
      setSubsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    loadClient();
    loadJobs();
    loadSubscriptions();
  }, [loadClient, loadJobs, loadSubscriptions]);

  // Refresh subscriptions when screen regains focus (e.g. coming back from composer)
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      loadSubscriptions();
      loadJobs();
    });
    return unsubscribe;
  }, [navigation, loadSubscriptions, loadJobs]);

  const togglePause = useCallback(
    async (sub: SubscriptionRow) => {
      if (busySubId) return;
      const isPaused = !!sub.paused_at;
      setBusySubId(sub.id);
      // Optimistic update
      setSubscriptions((list) =>
        list.map((row) =>
          row.id === sub.id
            ? {
                ...row,
                paused_at: isPaused ? null : new Date().toISOString(),
              }
            : row,
        ),
      );
      try {
        await ensureAuthHeader();
        await apiClient.patch(`/subscriptions/${sub.id}/pause`, {
          paused: !isPaused,
        });
        loadSubscriptions();
      } catch (e: any) {
        Alert.alert(
          'Could not update',
          e?.response?.data?.error || e?.message || 'Try again.',
        );
        loadSubscriptions();
      } finally {
        setBusySubId(null);
      }
    },
    [busySubId, loadSubscriptions],
  );

  const removeSubscription = useCallback(
    (sub: SubscriptionRow) => {
      if (busySubId) return;
      Alert.alert(
        'Delete subscription?',
        'Future visits are removed and the subscription disappears from this client. Already completed or invoiced jobs are kept.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setBusySubId(sub.id);
              try {
                await ensureAuthHeader();
                await apiClient.delete(`/subscriptions/${sub.id}`);
                LayoutAnimation.configureNext(SNAPPY);
                setSubscriptions((list) =>
                  list.filter((row) => row.id !== sub.id),
                );
              } catch (e: any) {
                Alert.alert(
                  'Could not delete',
                  e?.response?.data?.error || e?.message || 'Try again.',
                );
              } finally {
                setBusySubId(null);
              }
            },
          },
        ],
      );
    },
    [busySubId],
  );

  // Server-side this clears all personal data and sets `deleted_at`, while
  // keeping the row + foreign keys so jobs and invoices stay consistent.
  // We surface that explicitly in the prompt so the user knows nothing in
  // their books will disappear.
  const removeClient = useCallback(() => {
    if (clientDeleting) return;
    const step1 =
      'All personal data and every encrypted client note for this client will be permanently deleted.\n\nJobs and subscriptions stay linked. Issued invoices are unchanged (they keep their own snapshot).\n\nThis cannot be undone.';
    Alert.alert('Remove all client data?', step1, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Final confirmation',
            'Tap below only if you are sure. All notes and contact details will be gone forever (except invoice PDFs/data already on issued invoices).',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove permanently',
                style: 'destructive',
                onPress: async () => {
                  setClientDeleting(true);
                  try {
                    await ensureAuthHeader();
                    await apiClient.delete(`/clients/${clientId}`);
                    setClientMenuOpen(false);
                    navigation.goBack();
                  } catch (e: any) {
                    Alert.alert(
                      'Could not remove',
                      e?.response?.data?.error || e?.message || 'Try again.',
                    );
                  } finally {
                    setClientDeleting(false);
                  }
                },
              },
            ],
          );
        },
      },
    ]);
  }, [clientDeleting, clientId, navigation]);

  const openComposer = useCallback(
    (sub?: SubscriptionRow) => {
      if (!company || !user) return;
      navigation.navigate('SubscriptionCompose', {
        company,
        user,
        presetClientId: clientId,
        editingId: sub?.id,
        initial: sub
          ? {
              id: sub.id,
              title: sub.title,
              client_id: sub.client_id,
              assigned_user_id: sub.assigned_user_id ?? null,
              starting_date: sub.starting_date,
              recurrence_type: sub.recurrence_type,
              day_of_week: sub.day_of_week ?? null,
              day_of_month: sub.day_of_month ?? null,
              interval_value: sub.interval_value ?? null,
              scheduled_time_from: sub.scheduled_time_from ?? null,
              scheduled_time_to: sub.scheduled_time_to ?? null,
              note: sub.note ?? null,
              services: Array.isArray(sub.services) ? sub.services : [],
            }
          : undefined,
      });
    },
    [company, user, clientId, navigation],
  );

  const displayName = client
    ? `${client.name}${client.last_name ? ' ' + client.last_name : ''}`
    : '';

  const totalSpent = client?.total_spent != null ? Number(client.total_spent) : 0;
  const jobCount = client?.job_count != null ? Number(client.job_count) : 0;

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(n) ? n : 0);

  const fmtDate = (d?: string | null) => {
    if (!d) return null;
    try {
      const x = new Date(d);
      if (Number.isNaN(x.getTime())) return d;
      return x.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const jobDateIso = (job: JobRow) => {
    const raw = job.scheduled_date || '';
    return raw.split('T')[0];
  };

  const InfoBlock = ({
    label,
    value,
    mono,
  }: {
    label: string;
    value?: string | null;
    mono?: boolean;
  }) => {
    if (!value) return null;
    return (
      <View style={styles.infoBlock}>
        <Text style={styles.infoLabel}>{padAndroidText(label)}</Text>
        <Text
          style={[styles.infoValue, mono && styles.infoValueMono]}
          selectable
        >
          {padAndroidText(value)}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.screenRoot, { paddingTop: insets.top }]}>
      <View style={styles.clientsToolbar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeftIcon />
        </TouchableOpacity>
        <View style={styles.toolbarTitleWrap} />
        {!loading && client && !error ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => !clientDeleting && setClientMenuOpen((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={clientDeleting}
            accessibilityRole="button"
            accessibilityLabel="Client options"
          >
            {clientDeleting ? (
              <ActivityIndicator size="small" color="#193434" />
            ) : (
              <RNText style={styles.toolbarMoreIcon}>⋯</RNText>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtnSpacer} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#193434" />
        </View>
      ) : error || !client ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{padAndroidText(error || 'Not found')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); loadClient(); }}>
            <Text style={styles.retryBtnText}>{padAndroidText('Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.detailScroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => setClientMenuOpen(false)}
        >
          <View style={styles.heroCard}>
            <View
              style={[styles.heroAvatar, { backgroundColor: avatarBg(client.id) }]}
            >
              {client.client_type === 'company' ? (
                <BuildingIcon size={36} />
              ) : (
                <Text style={styles.heroAvatarText}>
                  {padAndroidText(getInitials(client.name, client.last_name))}
                </Text>
              )}
            </View>
            <Text style={styles.heroName}>{padAndroidText(displayName)}</Text>
            <View style={styles.heroBadgeRow}>
              <View style={styles.typePill}>
                <RNText style={styles.typePillText}>
                  {padAndroidText(
                    client.client_type === 'company' ? 'Company' : 'Person',
                  )}
                </RNText>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={styles.statVal}>{padAndroidText(String(jobCount))}</Text>
                <Text style={styles.statLbl}>{padAndroidText('Jobs')}</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statCell}>
                <Text style={styles.statValSmall}>{padAndroidText(fmtMoney(totalSpent))}</Text>
                <Text style={styles.statLbl}>{padAndroidText('Completed')}</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statCell}>
                <Text style={styles.statValSmall}>
                  {padAndroidText(fmtDate(client.last_job_date) || '—')}
                </Text>
                <Text style={styles.statLbl}>{padAndroidText('Last job')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, tab === 'overview' && styles.tabItemOn]}
              onPress={() => {
                setClientMenuOpen(false);
                LayoutAnimation.configureNext(SNAPPY);
                setTab('overview');
              }}
            >
              <RNText
                style={[styles.tabItemText, tab === 'overview' && styles.tabItemTextOn]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {padAndroidText('Overview')}
              </RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, tab === 'jobs' && styles.tabItemOn]}
              onPress={() => {
                setClientMenuOpen(false);
                LayoutAnimation.configureNext(SNAPPY);
                setTab('jobs');
              }}
            >
              <RNText
                style={[styles.tabItemText, tab === 'jobs' && styles.tabItemTextOn]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {padAndroidText('Jobs')}
              </RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                tab === 'subscriptions' && styles.tabItemOn,
              ]}
              onPress={() => {
                setClientMenuOpen(false);
                LayoutAnimation.configureNext(SNAPPY);
                setTab('subscriptions');
              }}
            >
              <RNText
                style={[
                  styles.tabItemText,
                  tab === 'subscriptions' && styles.tabItemTextOn,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {padAndroidText(
                  subscriptions.length > 0
                    ? `Subs (${subscriptions.length})`
                    : 'Subs',
                )}
              </RNText>
            </TouchableOpacity>
          </View>

          {tab === 'overview' ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{padAndroidText('Contact')}</Text>
              {client.phone ? (
                <TouchableOpacity
                  onPress={() => {
                    const p = client.phone;
                    if (p) void Linking.openURL(`tel:${p.replace(/\s/g, '')}`);
                  }}
                >
                  <InfoBlock label="Phone" value={client.phone} />
                </TouchableOpacity>
              ) : null}
              {client.email ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${client.email}`)}
                >
                  <InfoBlock label="Email" value={client.email} />
                </TouchableOpacity>
              ) : null}
              {!client.phone && !client.email ? (
                <Text style={styles.muted}>{padAndroidText('No contact on file')}</Text>
              ) : null}

              {client.client_type === 'company' && client.company_number ? (
                <InfoBlock label="Company number" value={client.company_number} mono />
              ) : null}

              <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
                {padAndroidText('Address')}
              </Text>
              <InfoBlock
                label="Street"
                value={
                  [client.address, client.zip_code, client.city].filter(Boolean).join(', ') ||
                  null
                }
              />
              {client.country ? (
                <InfoBlock label="Country" value={client.country} />
              ) : null}

              {(client.billing_address ||
                client.billing_city ||
                client.billing_email) && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
                    {padAndroidText('Billing')}
                  </Text>
                  <InfoBlock
                    label="Billing address"
                    value={
                      [
                        client.billing_address,
                        client.billing_zip_code,
                        client.billing_city,
                      ]
                        .filter(Boolean)
                        .join(', ') || null
                    }
                  />
                  <InfoBlock label="Billing email" value={client.billing_email} />
                  <InfoBlock label="Billing phone" value={client.billing_phone} />
                  <InfoBlock label="EAN" value={client.ean_number} />
                </>
              )}
            </View>
          ) : tab === 'jobs' ? (
            <View style={styles.sectionCard}>
              {jobsLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color="#193434" />
              ) : jobs.length === 0 ? (
                <Text style={styles.muted}>{padAndroidText('No active jobs')}</Text>
              ) : (
                jobs.map((job, idx) => (
                  <TouchableOpacity
                    key={job.id}
                    style={[styles.jobRow, idx > 0 && styles.jobRowBorder]}
                    activeOpacity={0.75}
                    onPress={() => {
                      const iso = jobDateIso(job);
                      if (iso && company && user) {
                        navigation.navigate('DayView', {
                          date: iso,
                          company,
                          user,
                          openJobId: job.id,
                        });
                      }
                    }}
                  >
                    <View style={styles.jobRowMain}>
                      <Text style={styles.jobTitle} numberOfLines={2}>
                        {padAndroidText(job.title || `Job #${job.id}`)}
                      </Text>
                      <Text style={styles.jobMeta}>
                        {padAndroidText(
                          [
                            fmtDate(job.scheduled_date),
                            job.scheduled_time_from,
                            job.status,
                          ]
                            .filter(Boolean)
                            .join(' · '),
                        )}
                      </Text>
                    </View>
                    <Text style={styles.listChevron}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : (
            <SubscriptionsTab
              loading={subsLoading}
              subscriptions={subscriptions}
              busySubId={busySubId}
              onCreate={() => openComposer()}
              onEdit={(sub) => openComposer(sub)}
              onTogglePause={togglePause}
              onDelete={removeSubscription}
              fmtDate={fmtDate}
            />
          )}
        </ScrollView>
      )}
      <Modal
        visible={clientMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClientMenuOpen(false)}
      >
        <View style={styles.clientMenuModalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setClientMenuOpen(false)}
          />
          <View
            style={[
              styles.clientToolbarMenuCard,
              { top: insets.top + 52, right: 10 },
            ]}
          >
            <TouchableOpacity
              style={styles.clientToolbarMenuItem}
              onPress={() => {
                setClientMenuOpen(false);
                setEditSheetOpen(true);
              }}
            >
              <RNText style={styles.clientToolbarMenuItemText}>
                {padAndroidText('Edit client')}
              </RNText>
            </TouchableOpacity>
            <View style={styles.clientToolbarMenuSep} />
            <TouchableOpacity
              style={styles.clientToolbarMenuItem}
              onPress={() => {
                setClientMenuOpen(false);
                removeClient();
              }}
              disabled={clientDeleting}
            >
              <RNText
                style={[
                  styles.clientToolbarMenuItemText,
                  styles.clientToolbarMenuItemDanger,
                ]}
              >
                {padAndroidText('Remove personal data')}
              </RNText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {client && !loading && !error ? (
        <ClientCreateSheet
          visible={editSheetOpen}
          onClose={() => setEditSheetOpen(false)}
          onCreated={() => {}}
          editingClient={client}
          onSaved={() => {
            setEditSheetOpen(false);
            loadClient();
          }}
        />
      ) : null}
    </View>
  );
}

function SubscriptionsTab({
  loading,
  subscriptions,
  busySubId,
  onCreate,
  onEdit,
  onTogglePause,
  onDelete,
  fmtDate,
}: {
  loading: boolean;
  subscriptions: SubscriptionRow[];
  busySubId: number | null;
  onCreate: () => void;
  onEdit: (sub: SubscriptionRow) => void;
  onTogglePause: (sub: SubscriptionRow) => void;
  onDelete: (sub: SubscriptionRow) => void;
  fmtDate: (d?: string | null) => string | null;
}) {
  const [menuForId, setMenuForId] = useState<number | null>(null);

  const closeMenu = () => setMenuForId(null);

  return (
    <View style={styles.subsWrap}>
      <View style={styles.subsHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subsHeaderTitle}>
            {padAndroidText('Subscriptions')}
          </Text>
          <Text style={styles.subsHeaderHint}>
            {padAndroidText(
              'Auto-generate recurring jobs for this client. Pause anytime.',
            )}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onCreate}
          style={styles.subsAddBtn}
          activeOpacity={0.85}
        >
          <RNText style={styles.subsAddBtnText}>{padAndroidText('+')}</RNText>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.subsCenter}>
          <ActivityIndicator color="#193434" />
        </View>
      ) : subscriptions.length === 0 ? (
        <View style={styles.subsEmptyCard}>
          <Text style={styles.subsEmptyTitle}>
            {padAndroidText('No subscriptions yet')}
          </Text>
          <Text style={styles.subsEmptyText}>
            {padAndroidText(
              'Create a subscription to set up recurring jobs at the cadence you want.',
            )}
          </Text>
          <TouchableOpacity
            onPress={onCreate}
            style={styles.subsCreateCta}
            activeOpacity={0.85}
          >
            <RNText
              style={styles.subsCreateCtaText}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {padAndroidText('Create a subscription')}
            </RNText>
          </TouchableOpacity>
        </View>
      ) : (
        subscriptions.map((sub) => {
          const isPaused = !!sub.paused_at;
          const isInactive = sub.is_active === false;
          const next = sub.next_occurrence_date;
          const time = sub.scheduled_time_from
            ? `${String(sub.scheduled_time_from).slice(0, 5)}${sub.scheduled_time_to ? '–' + String(sub.scheduled_time_to).slice(0, 5) : ''}`
            : null;
          const serviceCount = Number(sub.service_count || 0);
          const totalPrice = Number(sub.total_price || 0);
          const busy = busySubId === sub.id;

          return (
            <View key={sub.id} style={styles.subCard}>
              <View style={styles.subCardTop}>
                <Text style={styles.subCardTitle} numberOfLines={1}>
                  {padAndroidText(sub.title || 'Subscription')}
                </Text>
                {isInactive ? (
                  <View style={[styles.subBadge, styles.subBadgeNeutral]}>
                    <Text style={styles.subBadgeText}>
                      {padAndroidText('Stopped')}
                    </Text>
                </View>
                ) : isPaused ? (
                  <View style={[styles.subBadge, styles.subBadgePaused]}>
                    <Text style={styles.subBadgeText}>
                      {padAndroidText('Paused')}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.subBadge, styles.subBadgeActive]}>
                    <Text style={styles.subBadgeText}>
                      {padAndroidText('Active')}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() =>
                    setMenuForId((id) => (id === sub.id ? null : sub.id))
                  }
                  style={styles.subMenuBtn}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <RNText style={styles.subMenuBtnText}>{padAndroidText('⋯')}</RNText>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => onEdit(sub)}
                activeOpacity={0.85}
                style={styles.subCardMain}
              >
                <Text style={styles.subCardCadence} numberOfLines={1}>
                  {padAndroidText(recurrenceLabel(sub))}
                </Text>
                <View style={styles.subCardMetaRow}>
                  {next ? (
                    <Text style={styles.subCardMetaPart}>
                      {padAndroidText(`Next ${fmtDate(next)}`)}
                    </Text>
                  ) : null}
                  {time ? (
                    <Text style={styles.subCardMetaPart}>
                      {padAndroidText(time)}
                    </Text>
                  ) : null}
                  {serviceCount > 0 ? (
                    <Text style={styles.subCardMetaPart}>
                      {padAndroidText(
                        serviceCount === 1
                          ? '1 service'
                          : `${serviceCount} services`,
                      )}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              {menuForId === sub.id ? (
                <View style={styles.subMenu}>
                  {!isInactive ? (
                    <TouchableOpacity
                      onPress={() => {
                        closeMenu();
                        onTogglePause(sub);
                      }}
                      style={styles.subMenuItem}
                      activeOpacity={0.85}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#193434" />
                      ) : (
                        <RNText style={styles.subMenuItemText}>
                          {padAndroidText(isPaused ? 'Resume' : 'Pause')}
                        </RNText>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => {
                      closeMenu();
                      onEdit(sub);
                    }}
                    style={[styles.subMenuItem, styles.subMenuItemBorder]}
                    activeOpacity={0.85}
                    disabled={busy}
                  >
                    <RNText style={styles.subMenuItemText}>{padAndroidText('Edit')}</RNText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      closeMenu();
                      onDelete(sub);
                    }}
                    style={[styles.subMenuItem, styles.subMenuItemBorder]}
                    activeOpacity={0.85}
                    disabled={busy}
                  >
                    <RNText style={styles.subMenuItemDangerText}>{padAndroidText('Delete')}</RNText>
                  </TouchableOpacity>
                </View>
              ) : null}

              {totalPrice > 0 ? (
                <Text style={styles.subCardTotal}>
                  {padAndroidText(
                    `Worth ${new Intl.NumberFormat('da-DK', {
                      style: 'currency',
                      currency: 'DKK',
                      maximumFractionDigits: 0,
                    }).format(totalPrice)} per visit`,
                  )}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    position: 'relative',
  },
  fabWrap: {
    position: 'absolute',
    right: 18,
    zIndex: 20,
    elevation: 14,
    shadowColor: '#0F3C2A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  fabBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#193434',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(61,213,122,0.45)',
  },
  fabIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  createModalBackdrop: {
    backgroundColor: '#0B1816',
  },
  createModalKav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  createSheet: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: SCREEN_H * 0.9,
    borderTopWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
  },
  createSheetGrip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(25,52,52,0.15)',
    marginBottom: 12,
  },
  createSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  createSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#193434',
  },
  createSheetClose: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5E7A70',
  },
  createSheetIntro: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 16,
  },
  createTypeRow: {
    flexDirection: 'row',
    backgroundColor: '#E8EEEB',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    gap: 4,
  },
  createTypeChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTypeChipOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  createTypeChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    width: '100%',
  },
  createTypeChipTextOn: {
    color: '#193434',
  },
  createFormScroll: {
    maxHeight: SCREEN_H * 0.42,
    marginBottom: 12,
  },
  createFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#193434',
    marginBottom: 6,
    marginTop: 4,
  },
  createInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.1)',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: '#193434',
    marginBottom: 4,
  },
  createInputAddress: {
    paddingRight: 44,
  },
  addressFieldWrap: {
    position: 'relative',
    zIndex: 6,
    marginBottom: 0,
  },
  addressSearchLoading: {
    position: 'absolute',
    right: 12,
    top: Platform.OS === 'ios' ? 13 : 11,
  },
  addressSuggestList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.12)',
    marginTop: 6,
    marginBottom: 8,
    maxHeight: 220,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#0F3C2A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  addressSuggestRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addressSuggestRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  addressSuggestText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#193434',
    lineHeight: 20,
  },
  createRow2: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  createRow2Col: {
    flex: 1,
    minWidth: 0,
  },
  createSaveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  createSaveBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  createSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
    ...(Platform.OS === 'android'
      ? ({ textBreakStrategy: 'simple' } as const)
      : {}),
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  clientsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7ECE9',
    backgroundColor: '#F6F9F7',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: {
    width: 44,
  },
  toolbarMoreIcon: {
    fontSize: 22,
    fontWeight: '800',
    color: '#193434',
    lineHeight: 26,
    textAlign: 'center',
    includeFontPadding: false,
  },
  clientMenuModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  clientToolbarMenuCard: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 176,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  clientToolbarMenuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  clientToolbarMenuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
  },
  clientToolbarMenuItemDanger: {
    color: '#b91c1c',
  },
  clientToolbarMenuSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  toolbarTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  clientsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
    ...androidTextFix,
  },
  clientsSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  editWebBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#E7ECE9',
  },
  editWebBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
  },
  filtersSearchBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  filterChipsScroll: {
    gap: 8,
    paddingBottom: 10,
    alignItems: 'center',
  },
  filterChip: {
    minWidth: 116,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  filterChipOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  filterChipText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    ...androidTextFix,
  },
  filterChipTextOn: {
    color: '#FFFFFF',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchIcon: {
    fontSize: 16,
    color: '#94A3B8',
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: '#193434',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  searchClear: {
    fontSize: 14,
    color: '#94A3B8',
    padding: 4,
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
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#B91C1C',
  },
  errorRetry: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    textDecorationLine: 'underline',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listContentWithFab: {
    paddingBottom: 100,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E7ECE9',
  },
  listRowBorder: {},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
  },
  listRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listRowName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    lineHeight: 22,
  },
  typePill: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    overflow: 'visible',
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    ...androidPillTextFix,
  },
  listRowMeta: {
    marginTop: 3,
    fontSize: 12,
    color: '#64748B',
  },
  listRowContact: {
    marginTop: 3,
    fontSize: 12,
    color: '#94A3B8',
  },
  listChevron: {
    fontSize: 22,
    color: '#CBD5E1',
    marginLeft: 6,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
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
  },
  detailScroll: {
    flex: 1,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECE9',
    alignItems: 'center',
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroAvatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#193434',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  heroBadgeRow: {
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 18,
    width: '100%',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  statSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
  },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#193434',
  },
  statValSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
    textAlign: 'center',
  },
  statLbl: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabItemOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tabItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    lineHeight: 20,
  },
  tabItemTextOn: {
    color: '#193434',
  },
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
  infoBlock: {
    marginBottom: 14,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#193434',
  },
  infoValueMono: {},
  muted: {
    fontSize: 14,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  jobRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  jobRowMain: {
    flex: 1,
    minWidth: 0,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
  },
  jobMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#193434',
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  subsWrap: {
    paddingHorizontal: 16,
    marginTop: 14,
  },
  subsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  subsHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
  },
  subsHeaderHint: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  subsAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: '#193434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subsAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: -1,
  },
  subsCenter: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subsEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: 'center',
  },
  subsEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
    marginBottom: 6,
  },
  subsEmptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
  },
  subsCreateCta: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#193434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subsCreateCtaText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    width: '100%',
  },
  subCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  subCardMain: {},
  subCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subMenuBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subMenuBtnText: {
    color: '#475569',
    fontSize: 18,
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  subCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
  },
  subBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  subBadgeActive: { backgroundColor: '#DCFCE7' },
  subBadgePaused: { backgroundColor: '#FEF3C7' },
  subBadgeNeutral: { backgroundColor: '#E2E8F0' },
  subBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  subCardCadence: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  subCardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 8,
  },
  subCardMetaPart: {
    fontSize: 12,
    color: '#64748B',
  },
  subMenu: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  subMenuItem: {
    minHeight: 42,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subMenuItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  subMenuItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
    lineHeight: 20,
  },
  subMenuItemDangerText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B91C1C',
    lineHeight: 20,
  },
  subCardTotal: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
