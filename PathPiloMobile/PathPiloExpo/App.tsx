import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  Alert,
  Animated,
  Easing,
  Keyboard,
  FlatList,
  ScrollView,
  Dimensions,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  InteractionManager,
  Image,
  Linking,
  Modal,
  StatusBar,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import {
  useSafeAreaInsets,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import {
  NavigationContainer,
  useNavigation,
  useFocusEffect,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { G, Rect, Path, Circle, Ellipse, Line } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './src/api/client';
import { API_CONFIG } from './src/api/config';
import AndroidSafeText from './src/components/AndroidSafeText';
import { flexRowText, flexRowTextSlot } from './src/ui/flexLayout';
import {
  MobileClientsListScreen,
  MobileClientDetailScreen,
} from './src/screens/clients';
import {
  MobileInvoicesListScreen,
  MobileInvoiceDetailScreen,
} from './src/screens/invoices';
import { MobileInvoiceComposerScreen } from './src/screens/invoice-composer';
import { MobileJobComposerScreen } from './src/screens/job-composer';
import { MobileSubscriptionComposerScreen } from './src/screens/subscription-composer';
import {
  MobileServicesListScreen,
  MobileServiceComposerScreen,
  type ServiceRow as MobileServiceRow,
} from './src/screens/services';
import { MobileTeamScreen } from './src/screens/team';
import { MobileTeamInviteScreen } from './src/screens/team-invite';
import { MobileBusinessSettingsScreen } from './src/screens/settings-business';
import { MobileWorkHoursSettingsScreen } from './src/screens/settings-work-hours';
import { MobileInvoiceOptionsSettingsScreen } from './src/screens/settings-invoice-options';
import { MobileNotificationsSettingsScreen } from './src/screens/settings-notifications';
import { User, Company, Job, JobStatus, Service, ServiceStatus, HandoffResponse, HandoffMiniJob } from './src/types';

/** Android: avoid Fabric text measurement clipping; iOS: plain RN Text */
const Text = Platform.OS === 'android' ? AndroidSafeText : RNText;

/** Thin-space suffix: helps Android measure full glyph width (last-letter clip). */
function padAndroidText(value: string): string {
  if (!value) return value;
  return Platform.OS === 'android' ? `${value}\u2009` : value;
}

/** ISO country code → billing currency; mirrors subscription-composer `clientCurrency`. */
function businessCurrencyFromCompany(company: any): string {
  const cc = String(company?.country_code || company?.countryCode || 'DK');
  if (cc === 'SE') return 'SEK';
  if (cc === 'NO') return 'NOK';
  if (cc === 'DE' || cc === 'FR' || cc === 'NL' || cc === 'ES') return 'EUR';
  if (cc === 'GB') return 'GBP';
  if (cc === 'US') return 'USD';
  return 'DKK';
}

function formatBusinessMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '';
  const cur = (currency || 'DKK').toUpperCase();
  try {
    // `currencyDisplay: 'code'` keeps ISO codes (SEK, DKK) instead of narrow regional symbols
    // that Android often clips; `en-GB` gives predictable grouping.
    const formatted = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: cur,
      currencyDisplay: 'code',
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
    return Platform.OS === 'android' ? padAndroidText(formatted) : formatted;
  } catch {
    const fallback = `${Math.round(amount).toLocaleString('en-GB')} ${cur}`;
    return Platform.OS === 'android' ? padAndroidText(fallback) : fallback;
  }
}

/** Consistent spacing between blocks in the job detail sheet (schedule, note, tabs, etc.). */
const JOB_DETAIL_SECTION_GAP = 10;

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Snappy spring used for accordion folds / drawer reveals. */
const SNAPPY_LAYOUT = {
  duration: 220,
  create: { type: 'easeInEaseOut', property: 'opacity' },
  update: { type: 'spring', springDamping: 0.85 },
  delete: { type: 'easeInEaseOut', property: 'opacity' },
} as const;

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

type RootStackParamList = {
  Login: undefined;
  Companies: { user: User };
  CompanyTabs: { company: Company; user: User };
  Clients: { company: Company; user: User };
  ClientDetail: { clientId: number; company: Company; user: User };
  Invoices: { company: Company; user: User };
  InvoiceDetail: { invoiceId: number; company: Company; user: User };
  InvoiceCompose: {
    company: Company;
    user: User;
    presetClientId?: number;
  };
  JobCompose: {
    company: Company;
    user: User;
    scheduledDate: string;
  };
  SubscriptionCompose: {
    company: Company;
    user: User;
    presetClientId?: number;
    editingId?: number;
    initial?: any;
  };
  Services: { company: Company; user: User };
  ServiceCompose: {
    company: Company;
    user: User;
    service?: MobileServiceRow;
  };
  Team: { company: Company; user: User };
  TeamInvite: { company: Company; user: User };
  SettingsUser: { company: Company; user: User };
  SettingsBusiness: { company: Company; user: User };
  SettingsWorkHours: { company: Company; user: User };
  SettingsInvoiceOptions: { company: Company; user: User };
  SettingsNotifications: { company: Company; user: User };
  DayView: {
    date: string;
    company: Company;
    user: User;
    openJobId?: number;
    openAppointmentComposer?: boolean;
  };
  RequestStatus: { company: Company; user: User };
  AdminRequests: {
    company: Company;
    user: User;
    /** Pre-select scope when opening from admin overview rows */
    initialScope?: 'mine' | number;
  };
};

// --- Role helpers -----------------------------------------------------------
// Company membership roles are: 'owner' | 'admin' | 'employee'. Owner + admin
// share the same UI rights in the app, so we collapse them into a single
// boolean. The backend still enforces per-action permissions independently.
//
// Note: GET /api/companies returns `role` (not `user_role`) plus `isOwner`.
// Always resolve through this helper so owners and admins see the right UI.
function isAdminRole(
  company: Company | null | undefined,
  user?: User | null | undefined,
): boolean {
  if (company != null && (company as any).isOwner === true) return true;

  const candidates = [
    (company as any)?.user_role,
    (company as any)?.role,
    (user as any)?.companyRole,
    (user as any)?.user_role,
    user?.role,
  ];

  for (const raw of candidates) {
    const r = String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!r) continue;
    if (
      r === 'owner' ||
      r === 'admin' ||
      r === 'manager' ||
      r === 'company_owner'
    ) {
      return true;
    }
  }
  return false;
}

type CompanyMember = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role?: string | null;
};

function adminInitialsFor(m: CompanyMember | null | undefined): string {
  if (!m) return '?';
  const f = String(m.first_name || '').trim();
  const l = String(m.last_name || '').trim();
  const fi = f.charAt(0).toUpperCase();
  const li = l.charAt(0).toUpperCase();
  if (fi && li) return `${fi}${li}`;
  if (fi) return fi;
  const e = String(m.email || '').trim();
  return e ? e.charAt(0).toUpperCase() : '?';
}

function adminDisplayNameFor(m: CompanyMember | null | undefined): string {
  if (!m) return '';
  const f = String(m.first_name || '').trim();
  const l = String(m.last_name || '').trim();
  if (f && l) return `${f} ${l.charAt(0)}.`;
  if (f) return f;
  return String(m.email || '').split('@')[0] || 'Teammate';
}

/** Short list / row label — never shows email (first + last initial or first name only). */
function adminNameNoEmail(m: CompanyMember | null | undefined): string {
  if (!m) return 'Team member';
  const f = String(m.first_name || '').trim();
  const l = String(m.last_name || '').trim();
  if (f && l) return `${f} ${l.charAt(0)}.`;
  if (f) return f;
  return 'Teammate';
}

/** Calendar appointment row — AdminRequestsScreen + related flows */
type AppointmentRow = {
  id: number;
  user_id: number;
  title: string;
  category: string;
  notes: string | null;
  appointment_date: string;
  /** Inclusive end when set; multi-day blocks use time_mode all_day. */
  end_date?: string | null;
  time_mode: 'all_day' | 'span' | 'hours';
  start_time: string | null;
  end_time: string | null;
  hours_off: number | null;
  kind: 'work' | 'time_off';
  status: 'requested' | 'approved' | 'declined';
  decline_reason: string | null;
};

function appointmentEndIsoStr(a: {
  appointment_date: string;
  end_date?: string | null;
}): string {
  const s = String(a.appointment_date).split('T')[0];
  const e = a.end_date && String(a.end_date).split('T')[0];
  return e && e > s ? e : s;
}

/** YYYY-MM-DD from an API date / datetime string. */
function appointmentDateOnly(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '';
  return String(raw).split('T')[0].split(' ')[0];
}

/** True when local calendar day `dayIso` lies in [appointment_date, end] inclusive. */
function appointmentCoversLocalDay(
  dayIso: string,
  a: { appointment_date: string; end_date?: string | null },
): boolean {
  const start = appointmentDateOnly(a.appointment_date);
  const end = appointmentEndIsoStr(a);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
    return false;
  }
  return dayIso >= start && dayIso <= end;
}

/** Fire `visit` for each YYYY-MM-DD from `fromIso` to `toIso` inclusive (local noon stepping). */
function forEachIsoDayInclusive(
  fromIso: string,
  toIso: string,
  visit: (iso: string) => void,
): void {
  if (fromIso > toIso) return;
  const d = new Date(fromIso + 'T12:00:00');
  const end = new Date(toIso + 'T12:00:00');
  const pad2 = (n: number) => String(n).padStart(2, '0');
  while (d.getTime() <= end.getTime()) {
    visit(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
}

function formatAppointmentRangeTitle(a: AppointmentRow): string {
  const s = String(a.appointment_date).split('T')[0];
  const e = a.end_date && String(a.end_date).split('T')[0];
  if (e && e > s) {
    const n = daysBetween(s, e);
    return `${formatLongDate(s)} – ${formatLongDate(e)} · ${n} day${n === 1 ? '' : 's'}`;
  }
  return formatLongDate(s);
}

// Icon components
const OverviewIcon = ({ color }: { color: string }) => (
  <Svg width="18" height="18" viewBox="0 0 18 18">
    <G transform="translate(-28 -138)">
      <G>
        <Rect x="28.5" y="138.5" width="7" height="7" rx={1.5} fill="none" stroke={color} strokeWidth="1"/>
        <Rect x="28" y="148" width="8" height="8" rx={2} fill={color}/>
        <Rect x="38" y="138" width="8" height="8" rx={2} fill={color}/>
        <Rect x="38.5" y="148.5" width="7" height="7" rx={1.5} fill="none" stroke={color} strokeWidth="1"/>
      </G>
    </G>
  </Svg>
);

const CalendarIcon = ({ color }: { color: string }) => (
  <Svg width="20" height="22" viewBox="0 0 20.306 22">
    <G transform="translate(1.306 1)">
      <Path d="M5,0V4" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <Path d="M13,0V4" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <Rect x="-0.306" y="2" width="18" height="18" rx={2} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
      <Path d="M-0.306,8H17.694" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
    </G>
  </Svg>
);

const TodayIcon = ({ color }: { color: string }) => (
  <Svg width="18" height="21" viewBox="0 0 18 21">
    <Path d="M9,12h3.75M9,15h3.75M9,18h3.75m3,.75H18a2.25,2.25,0,0,0,2.25-2.25V6.108a2.177,2.177,0,0,0-1.976-2.192q-.561-.047-1.123-.08m-5.8,0a2.242,2.242,0,0,0-.1.664.75.75,0,0,0,.75.75h4.5a.75.75,0,0,0,.75-.75,2.25,2.25,0,0,0-.1-.664m-5.8,0A2.251,2.251,0,0,1,13.5,2.25H15a2.25,2.25,0,0,1,2.15,1.586m-5.8,0q-.564.035-1.124.08A2.177,2.177,0,0,0,8.25,6.108V8.25m0,0H4.875A1.125,1.125,0,0,0,3.75,9.375v11.25A1.125,1.125,0,0,0,4.875,21.75h9.75a1.125,1.125,0,0,0,1.125-1.125V9.375A1.125,1.125,0,0,0,14.625,8.25ZM6.75,12h.008v.008H6.75Zm0,3h.008v.008H6.75Zm0,3h.008v.008H6.75Z" transform="translate(-3 -1.5)" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/>
  </Svg>
);

// Job detail icons
const MailIcon = ({ stroke = '#BFD1C5' }: { stroke?: string }) => (
  <Svg width="14.921" height="11.165" viewBox="0 0 14.921 11.165">
    <G transform="translate(0.69 0.5)">
      <Rect width="13.553" height="10.165" rx="2" fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M15.54,7,9.468,10.859a1.313,1.313,0,0,1-1.395,0L2,7" transform="translate(-2 -4.969)" fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const PhoneIcon = ({ stroke = '#BFD1C5' }: { stroke?: string }) => (
  <Svg width="14.466" height="14.493" viewBox="0 0 14.466 14.493">
    <Path d="M15.576,12.1v2.031A1.354,1.354,0,0,1,14.1,15.486a13.4,13.4,0,0,1-5.843-2.078A13.2,13.2,0,0,1,4.2,9.346a13.4,13.4,0,0,1-2.078-5.87A1.354,1.354,0,0,1,3.465,2H5.5A1.354,1.354,0,0,1,6.85,3.164a8.693,8.693,0,0,0,.474,1.9,1.354,1.354,0,0,1-.3,1.429l-.86.86a10.832,10.832,0,0,0,4.062,4.062l.86-.86a1.354,1.354,0,0,1,1.429-.3,8.693,8.693,0,0,0,1.9.474A1.354,1.354,0,0,1,15.576,12.1Z" transform="translate(-1.611 -1.5)" fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
  </Svg>
);

const LocationIcon = () => (
  <Svg width="14.436" height="17.829" viewBox="0 0 14.436 17.829">
    <G transform="translate(0.5 0.5)">
      <Path d="M17.436,8.718c0,4.193-4.651,8.56-6.213,9.908a.84.84,0,0,1-1.009,0C8.651,17.278,4,12.911,4,8.718a6.718,6.718,0,0,1,13.436,0" transform="translate(-4 -2)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Circle cx="2.519" cy="2.519" r="2.519" transform="translate(4.177 4.199)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const TimeIcon = () => (
  <Svg width="16" height="17" viewBox="0 0 16 17">
    <G transform="translate(0.5 0.93)">
      <Ellipse cx="7.5" cy="8" rx="7.5" ry="8" transform="translate(0 -0.43)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M12,6v4.535l3.023,1.512" transform="translate(-4.121 -2.977)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const DateIcon = () => (
  <Svg width="14" height="16.5" viewBox="0 0 14 16.5">
    <G transform="translate(0.34 0.5)">
      <Path d="M8,2V4.95" transform="translate(-4.087 -2)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M16,2V4.95" transform="translate(-6.187 -2)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Rect width="13" height="14" rx="2" transform="translate(0.16 1.5)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
      <Path d="M3,10H15.934" transform="translate(-2.774 -4.1)" fill="none" stroke="#BFD1C5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/>
    </G>
  </Svg>
);

const TimerIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#BFD1C5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="10" x2="14" y1="2" y2="2"/>
    <Line x1="12" x2="15" y1="14" y2="11"/>
    <Circle cx="12" cy="14" r="8"/>
  </Svg>
);

// Small icons used in the job card bottom bar. Match desktop styling.
const CardClockIcon = ({ color = '#64748B' }: { color?: string }) => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 7v5l3 2" />
  </Svg>
);

const CardTasksIcon = ({ color = '#64748B' }: { color?: string }) => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <Path d="M14 3v5h5" />
    <Path d="M9 13h6" />
    <Path d="M9 17h4" />
  </Svg>
);

const CardDurationIcon = ({ color = '#64748B' }: { color?: string }) => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="13" r="8" />
    <Path d="M12 9v4l2.5 2.5" />
    <Path d="M10 2h4" />
  </Svg>
);

// Solid home glyph shown inside the route-start circle badge.
const HomeIcon = ({ color = '#FFFFFF', size = 16 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 3.5 3.25 11H5v8a1 1 0 0 0 1 1h3.5v-6h5v6H18a1 1 0 0 0 1-1v-8h1.75L12 3.5z" />
  </Svg>
);

// Checkered finish flag shown inside the route-end circle badge.
const FlagIcon = ({ color = '#FFFFFF', size = 16 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M5 3a1 1 0 0 1 1 1v1h4V4a1 1 0 0 1 1-1h3v2h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3v-2h-3v2h-4v7a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm5 4v2h4V7h-4zm0 4v2h4v-2h-4zm-4 0v2h4v-2H6zm0-4v2h4V7H6z" />
  </Svg>
);

// Heroicons-style (outline) — matches web CreateJob / jobs menu affordances.
const IconDocumentText = ({ color = '#64748B', size = 22 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
  </Svg>
);

const IconCalendarDays = ({ color = '#64748B', size = 22 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-9h18v9M3 12h3.75m5.25 0h9M9 15h.008v.008H9V15Zm0 3h.008v.008H9V18Zm3-3h.008v.008H12V15Zm0 3h.008v.008H12V18Zm3-6h.008v.008H15V12Zm0 3h.008v.008H15V15Zm0 3h.008v.008H15V18Z" />
  </Svg>
);

// Outline user (matches web UserIcon for “assign employee”).
const IconUserOutline = ({ color = '#64748B', size = 18 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </Svg>
);

const IconPencilSquare = ({ color = '#64748B', size = 18 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
  </Svg>
);

const IconPlusMini = ({ color = '#94A3B8', size = 14 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

// Resolves a user's start/end address using the same rules the web app
// applies: company defaults apply unless the user has explicitly opted
// out via `use_company_default_location = false`. Returns null for
// either side when nothing is configured so callers can hide the row.
async function fetchRouteLocations(userId: number): Promise<{
  enabled: boolean;
  startAddress: string | null;
  endAddress: string | null;
}> {
  try {
    const [companyRes, whRes] = await Promise.all([
      apiClient.get('/companies/profile').catch(() => null),
      apiClient.get(`/work-hours/${userId}`).catch(() => null),
    ]);
    const company = (companyRes as any)?.data?.company;
    const wh = (whRes as any)?.data?.workHours;
    const enabled = !!company?.routeLocationsEnabled;
    if (!enabled) return { enabled: false, startAddress: null, endAddress: null };
    const useDefault = wh?.use_company_default_location !== false;
    const defaultStart: string | null = company?.defaultStartAddress || null;
    const defaultEnd: string | null =
      company?.defaultEndAddress || defaultStart || null;
    const startAddress = useDefault
      ? defaultStart
      : ((wh?.start_address as string) || null);
    const endAddress = useDefault
      ? defaultEnd
      : ((wh?.end_address as string) || (wh?.start_address as string) || null);
    return {
      enabled: true,
      startAddress: startAddress && startAddress.trim() ? startAddress.trim() : null,
      endAddress: endAddress && endAddress.trim() ? endAddress.trim() : null,
    };
  } catch {
    return { enabled: false, startAddress: null, endAddress: null };
  }
}

// -------------------------------------------------------------------
// RouteStopRow: the fixed home/end bookends that frame a user's day.
// Visually distinct from a regular job card — smaller, subdued green
// tint, icon badge on the left, and a "fixed" sub-label so it's clear
// this is a configured location rather than a task to work on. Tap
// opens the address in the device's maps app.
// -------------------------------------------------------------------
function RouteStopRow({
  type,
  address,
}: {
  type: 'start' | 'end';
  address: string;
}) {
  const label = type === 'start' ? 'Start location' : 'End location';
  const openInMaps = () => {
    const q = encodeURIComponent(address);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${q}`
        : `geo:0,0?q=${q}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
    });
  };

  return (
    <TouchableOpacity
      style={styles.routeStopRow}
      onPress={openInMaps}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.routeStopBadge,
          type === 'end' && styles.routeStopBadgeEnd,
        ]}
      >
        {type === 'start' ? (
          <HomeIcon color="#FFFFFF" size={16} />
        ) : (
          <FlagIcon color="#FFFFFF" size={16} />
        )}
      </View>
      <View style={styles.routeStopBody}>
        <Text style={styles.routeStopLabel}>{label}</Text>
        <Text style={styles.routeStopAddress} numberOfLines={1}>
          {address}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function DayAppointmentRow({
  row,
}: {
  row: {
    id: number;
    category: string;
    status: 'requested' | 'approved' | 'declined';
    time_mode: 'all_day' | 'span' | 'hours';
    start_time: string | null;
    end_time: string | null;
    hours_off: number | null;
  };
}) {
  const isPending = row.status === 'requested';
  const label = shortCategoryLabel(row.category);
  // Always show what the time off actually *is* (full day / 09:00–12:00 /
  // 4 h off) — for pending rows we add a "PENDING APPROVAL" hint next to it
  // so it's clear the block isn't active yet but the employee still sees
  // what they asked for.
  const timeSummary =
    row.time_mode === 'all_day'
      ? 'Full day'
      : row.time_mode === 'hours' && row.hours_off != null
        ? `${row.hours_off} h off`
        : row.start_time && row.end_time
          ? `${row.start_time} – ${row.end_time}`
          : null;
  return (
    <View style={[styles.dayApptRow, isPending && styles.dayApptRowPending]}>
      <View style={[styles.dayApptBadge, isPending && styles.dayApptBadgePending]}>
        <Text style={styles.dayApptBadgeText}>{label}</Text>
      </View>
      <View style={flexRowTextSlot}>
        <Text
          style={[
            styles.dayApptDetailText,
            isPending && styles.dayApptDetailTextPending,
            flexRowText,
          ]}
          numberOfLines={3}
        >
          {timeSummary || (isPending ? 'Requested' : 'Approved')}
        </Text>
        {isPending ? (
          <Text style={styles.dayApptStatusHint}>Pending approval</Text>
        ) : null}
      </View>
    </View>
  );
}

function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];
  const buttonScale = useState(new Animated.Value(1))[0];

  useEffect(() => {
    // Fade in and slide up animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    setLoginError('');

    if (!email.trim() || !password) {
      setLoginError('Please enter your email and password.');
      return;
    }

    setIsLoading(true);

    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    try {
      const response = await apiClient.post('/auth/login', { email: email.trim(), password });
      const { user, token } = response.data;

      await AsyncStorage.setItem('authToken', token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      navigation.replace('Companies', { user });
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 400) {
        setLoginError('Incorrect email or password. Please try again.');
      } else if (status === 404) {
        setLoginError('No account found with that email address.');
      } else if (status === 429) {
        setLoginError('Too many attempts. Please wait a moment and try again.');
      } else if (!error.response) {
        setLoginError('Could not connect. Please check your internet connection.');
      } else {
        setLoginError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.loginContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.title}>Welcome to PathPilo</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, !!loginError && styles.inputError]}
            value={email}
            onChangeText={(t) => { setEmail(t); setLoginError(''); }}
            placeholder="Enter your email"
            placeholderTextColor="#19343480"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor="#193434"
            underlineColorAndroid="transparent"
          />
          </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={[styles.passwordContainer, !!loginError && styles.inputError]}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={(t) => { setPassword(t); setLoginError(''); }}
              placeholder="Enter your password"
              placeholderTextColor="#19343480"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor="#193434"
              underlineColorAndroid="transparent"
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setPasswordVisible(!passwordVisible)}
            >
              <Text style={styles.eyeIconText}>
                {passwordVisible ? '🙈' : '👁️'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!!loginError && (
          <View style={styles.loginErrorBox}>
            <Text style={styles.loginErrorText}>{loginError}</Text>
          </View>
        )}

          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.loginButtonText}>
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

function CompaniesScreen({ route, navigation }: any) {
  const { user } = route.params;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  console.log('🏢 CompaniesScreen loaded');
  console.log('👤 User from route:', user);

  useEffect(() => {
    console.log('🔄 useEffect triggered, calling fetchCompanies');
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    console.log('📡 Starting companies fetch...');
    try {
      const token = await AsyncStorage.getItem('authToken');
      console.log('🎫 Retrieved token from storage:', token ? 'Present' : 'Missing');

      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log('✅ Authorization header set');
      }

      console.log('🌐 Making GET /companies request');
      console.log('📡 API Base URL:', apiClient.defaults.baseURL);

      const response = await apiClient.get('/companies');
      console.log('📦 Companies API response:', response);
      console.log('📦 Response status:', response.status);
      console.log('📦 Response data:', response.data);

      setCompanies(response.data.companies);
      console.log('✅ Companies state updated with:', response.data.companies);
      console.log('📊 Companies array length:', response.data.companies.length);
    } catch (error: any) {
      console.error('❌ Fetch companies error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config,
      });
      Alert.alert('Error', 'Failed to load companies');
    } finally {
      console.log('🏁 Setting loading to false');
      setIsLoading(false);
    }
  };

  const handleCompanyPress = async (company: Company) => {
    const raw = company as any;
    // GET /companies returns `role` (membership in this company), not `user_role`.
    // Fill `user_role` so older checks and types stay consistent everywhere.
    const normalized = {
      ...company,
      user_role: String(raw.user_role || raw.role || ''),
    } as Company;

    try {
      // Switch active company — the server re-issues the JWT with
      // activeCompanyId embedded. All subsequent API calls depend on this.
      const res = await apiClient.post('/companies/switch', { company_id: company.id });
      const { token, user: updatedUser } = res.data;
      if (token) {
        await AsyncStorage.setItem('authToken', token);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      navigation.navigate('CompanyTabs', { company: normalized, user: updatedUser || user });
    } catch (err: any) {
      console.error('[CompaniesScreen] switch failed:', err?.response?.data, err?.message);
      // Fall back to navigating anyway — worst case API calls will 400 and
      // show their own empty states, which is still better than being stuck.
      navigation.navigate('CompanyTabs', { company: normalized, user });
    }
  };

  const renderCompany = ({ item }: { item: Company }) => {
    console.log('🎨 Rendering company:', item);
    return (
      <TouchableOpacity
        style={styles.companyContainer}
        onPress={() => handleCompanyPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.companyContent}>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{item.name}</Text>
            <Text style={styles.companyRole}>
              {(item as any).user_role || (item as any).role || ''}
            </Text>
          </View>
          <View style={styles.arrowContainer}>
            <Text style={styles.arrow}>→</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading companies...</Text>
      </View>
    );
  }

  return (
    <View style={styles.companiesContainer}>
      <Text style={styles.companiesTitle}>Select Company</Text>
      <FlatList
        data={companies}
        renderItem={renderCompany}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.companiesList}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// Tab screens
// ---------------------------------------------------------------------------
// OverviewTab
//
// After the user picks a company, this tab branches on their membership
// role: owners and admins get AdminOverview (team-wide requests, day stats);
// employees get EmployeeOverview (personal today + own requests).
// ---------------------------------------------------------------------------

function OverviewTab({ route }: any) {
  const { company, user } = route.params || {};
  const admin = isAdminRole(company, user);

  if (admin) {
    return <AdminOverview company={company} user={user} />;
  }

  return <EmployeeOverview company={company} user={user} />;
}

// ---------------------------------------------------------------------------
// AdminOverview
//
// Route + today cards, book time off, and a single company-wide "team
// requests" notification at the top. Tapping it opens AdminRequestsScreen.
// ---------------------------------------------------------------------------

function AdminOverview({ company, user }: { company: Company; user: User }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [routeSummary, setRouteSummary] = useState<TodayRouteSummary | null>(
    null,
  );
  const [companyPendingCount, setCompanyPendingCount] = useState(0);
  const [timeOffVisible, setTimeOffVisible] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const todayIso = useMemo(() => todayIsoLocal(), []);

  // Refetch whenever this tab is shown again (e.g. after approving requests on
  // AdminRequests) and when refreshTick bumps after booking time off here.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          const token = await AsyncStorage.getItem('authToken');
          if (token) {
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          }

          const [jobsRes, routeRes, reqRes] = await Promise.all([
            apiClient
              .get(`/jobs?start_date=${todayIso}&end_date=${todayIso}`)
              .catch(() => null),
            apiClient
              .get(`/daily-routes/today-summary?date=${todayIso}`)
              .catch(() => null),
            apiClient
              .get('/appointments?status=requested&user_id=all')
              .catch(() => null),
          ]);

          if (!alive) return;

          const allJobs: Job[] = jobsRes?.data?.jobs || [];
          const mine = allJobs.filter(
            (j: any) =>
              j.assigned_user_id === user.id &&
              String(j.status || 'scheduled') !== 'cancelled',
          );
          setJobs(mine);
          setRouteSummary(routeRes?.data || null);

          const pending = (reqRes?.data?.appointments || []).filter(
            (a: any) => a.kind === 'time_off' && a.status === 'requested',
          );
          setCompanyPendingCount(pending.length);
        } catch (err) {
          console.error('[admin-overview] load failed:', err);
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [todayIso, user.id, refreshTick]),
  );

  const taskCount = useMemo(() => {
    let total = 0;
    for (const j of jobs) {
      const services = (j as any).services || [];
      for (const s of services) {
        const status =
          (s.status as ServiceStatus | undefined) ??
          (s.is_completed ? 'completed' : 'scheduled');
        if (status === 'scheduled') total += 1;
      }
      if (!services.length && typeof (j as any).all_service_count === 'number') {
        total += (j as any).all_service_count;
      }
    }
    return total;
  }, [jobs]);

  const workloadMinutes = useMemo(() => {
    if (routeSummary?.totalJobMinutes != null) {
      return routeSummary.totalJobMinutes;
    }
    let total = 0;
    for (const j of jobs) {
      const d = Number((j as any).estimated_duration);
      if (Number.isFinite(d)) total += d;
    }
    return total;
  }, [jobs, routeSummary]);

  const handleOpenToday = () => {
    navigation.navigate('DayView', { date: todayIso, company, user });
  };

  return (
    <View style={styles.overviewContainer}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 100,
          paddingTop: insets.top + 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[
            styles.adminPendingPill,
            companyPendingCount === 0 && styles.adminPendingPillZero,
          ]}
          activeOpacity={0.85}
          onPress={() =>
            navigation.navigate('AdminRequests', { company, user })
          }
        >
          <View
            style={[
              styles.adminPendingPillIcon,
              companyPendingCount === 0 && styles.adminPendingPillIconZero,
            ]}
          >
            <Text style={styles.adminPendingPillIconText}>
              {companyPendingCount === 0 ? '📋' : '🔔'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminPendingPillTitle}>
              {companyPendingCount === 0
                ? 'Team requests'
                : companyPendingCount === 1
                  ? '1 request needs your review'
                  : `${companyPendingCount} requests need your review`}
            </Text>
            <Text style={styles.adminPendingPillSubtitle}>
              {companyPendingCount === 0
                ? 'No pending requests. Tap to manage your team.'
                : 'Tap to approve, edit or decline'}
            </Text>
          </View>
          {companyPendingCount > 0 ? (
            <View style={styles.adminPendingPillCount}>
              <Text style={styles.adminPendingPillCountText}>
                {companyPendingCount}
              </Text>
            </View>
          ) : (
            <Text style={styles.requestsOverviewChevron}>›</Text>
          )}
        </TouchableOpacity>

        <RouteCard
          summary={routeSummary}
          loading={loading}
          onPress={handleOpenToday}
        />
        <TodayCard
          dateIso={todayIso}
          jobCount={jobs.length}
          taskCount={taskCount}
          workloadMinutes={workloadMinutes}
          loading={loading}
          onPress={handleOpenToday}
        />

        <TouchableOpacity
          style={styles.timeOffPrimaryBtn}
          activeOpacity={0.9}
          onPress={() => setTimeOffVisible(true)}
        >
          <View style={styles.timeOffPrimaryBtnIcon}>
            <Text style={styles.timeOffPrimaryBtnIconText}>+</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.timeOffPrimaryBtnTitle}>Book time off</Text>
            <Text style={styles.timeOffPrimaryBtnSubtitle}>
              Holiday, appointments or a full day off
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <TimeOffRequestModal
        visible={timeOffVisible}
        onClose={() => setTimeOffVisible(false)}
        onSubmitted={() => {
          setTimeOffVisible(false);
          setRefreshTick((n) => n + 1);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// EmployeeOverview
//
// Shown to users whose company role is 'employee'. Three building blocks:
//   1. TodayCard     — headline: date, workload, task count, nav to day view.
//   2. RouteCard     — optional; rendered when the admin has planned the day's
//                       route. Shows a Mapbox static-image preview + stats.
//   3. Request time off CTA — opens TimeOffRequestModal. Hidden contract:
//                       always submits with kind='time_off'. Admin can flip it
//                       to 'work' later if needed.
//   + a tiny "Your recent requests" list for quick feedback on what's pending.
// ---------------------------------------------------------------------------

type TodayRouteSummary = {
  hasRoute: boolean;
  date: string;
  stopCount: number;
  totalMinutes: number | null;
  totalKm: number | null;
  totalJobMinutes: number | null;
  // Interactive map data from the backend
  mapboxToken: string | null;
  routeStops: { lat: number; lng: number }[];
  routeGeometry: [number, number][] | null; // [[lng, lat], ...]
  companyCoords: { lat: number; lng: number } | null;
};

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** HH:MM for display (strips seconds from HH:MM:SS or ISO datetimes). */
function formatClockHm(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const tail = (s.includes('T') ? (s.split('T')[1] || s) : s).split('Z')[0];
  const m = tail.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  const hh = String(Number(m[1])).padStart(2, '0');
  return `${hh}:${m[2]}`;
}

/** Job list / detail: "14:30 – 15:00" without seconds. */
function formatJobTimeWindow(
  timeFrom?: string | null,
  timeTo?: string | null,
): string | null {
  const a = formatClockHm(timeFrom ?? undefined);
  const b = formatClockHm(timeTo ?? undefined);
  if (a && b) return `${a} – ${b}`;
  if (a) return a;
  if (b) return b;
  return null;
}

function formatLongDate(iso: string): string {
  // Format as "Tuesday, 21 April" in the device locale. We intentionally
  // skip the year — it's today, the year is implied and adds noise.
  const d = new Date(iso + 'T00:00:00');
  try {
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function minutesToHuman(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(Number(min))) return '—';
  const m = Math.max(0, Math.round(Number(min)));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

/** Job list cards: explicit "min" / "h". null when nothing to show. */
function formatJobListDurationMinutes(
  minutes?: number | string | null,
): string | null {
  if (minutes == null || minutes === '') return null;
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return minutesToHuman(Math.round(n));
}

function EmployeeOverview({ company, user }: { company: Company; user: User }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [routeSummary, setRouteSummary] = useState<TodayRouteSummary | null>(null);
  // Aggregate counts + a compact pending preview on the Overview card.
  const [pendingCount, setPendingCount] = useState(0);
  const [declinedCount, setDeclinedCount] = useState(0);
  const [pendingPreviewRows, setPendingPreviewRows] = useState<AppointmentRow[]>(
    [],
  );
  // "Next upcoming" = the next time-off the user has on their calendar,
  // regardless of whether it's been approved yet. Used to remind the
  // employee of what's next and nudge admins on stale pending requests.
  const [nextUpcoming, setNextUpcoming] = useState<{
    date: string;
    daysUntil: number;
    category: string;
    status: 'requested' | 'approved';
  } | null>(null);
  const [timeOffVisible, setTimeOffVisible] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const todayIso = useMemo(() => todayIsoLocal(), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }

        const [jobsRes, routeRes, reqRes] = await Promise.all([
          apiClient.get(`/jobs?start_date=${todayIso}&end_date=${todayIso}`).catch((e) => {
            console.log('[overview] jobs fetch failed:', e?.response?.status, e?.message);
            return null;
          }),
          apiClient.get(`/daily-routes/today-summary?date=${todayIso}`).catch((e) => {
            console.log('[overview] today-summary fetch failed:', e?.response?.status, e?.response?.data, e?.message);
            return null;
          }),
          // Fetch all statuses (including declined) so the overview pill can
          // reflect them. The employee sees their own only (API enforces it).
          apiClient
            .get(`/appointments?status=all`)
            .catch(() => null),
        ]);

        if (!alive) return;

        // Jobs assigned to this user today, excluding cancelled.
        const allJobs: Job[] = jobsRes?.data?.jobs || [];
        const mine = allJobs.filter(
          (j: any) =>
            j.assigned_user_id === user.id &&
            String(j.status || 'scheduled') !== 'cancelled'
        );
        setJobs(mine);

        console.log('[overview] route summary:', routeRes?.data);
        setRouteSummary(routeRes?.data || null);

        const apps: AppointmentRow[] = (reqRes?.data?.appointments || []).filter(
          (a: any) => a.kind === 'time_off'
        );
        let pending = 0;
        let decl = 0;
        const pendingRows: AppointmentRow[] = [];
        // Candidates for "next upcoming": anything not declined that is on
        // or after today. We pick the earliest date, approved or pending.
        let nextRow: AppointmentRow | null = null;
        for (const a of apps) {
          if (a.status === 'requested') {
            pending += 1;
            pendingRows.push(a);
          }
          else if (a.status === 'declined') decl += 1;
          if (a.status === 'declined') continue;
          const endIso = appointmentEndIsoStr(a);
          if (endIso < todayIso) continue;
          if (!nextRow || a.appointment_date < nextRow.appointment_date) {
            nextRow = a;
          }
        }
        setPendingCount(pending);
        setDeclinedCount(decl);
        pendingRows.sort((a, b) =>
          String(a.appointment_date).localeCompare(String(b.appointment_date)),
        );
        setPendingPreviewRows(pendingRows);
        if (nextRow) {
          const t0 = new Date(todayIso + 'T00:00:00').getTime();
          const t1 = new Date(nextRow.appointment_date + 'T00:00:00').getTime();
          const days = Math.max(0, Math.round((t1 - t0) / 86400000));
          setNextUpcoming({
            date: nextRow.appointment_date,
            daysUntil: days,
            category: nextRow.category,
            status: nextRow.status as 'requested' | 'approved',
          });
        } else {
          setNextUpcoming(null);
        }
      } catch (err) {
        console.error('[overview] load failed:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [todayIso, user.id, refreshTick]);

  const taskCount = useMemo(() => {
    // Total remaining tasks = sum of non-cancelled, non-completed services.
    let total = 0;
    for (const j of jobs) {
      const services = (j as any).services || [];
      for (const s of services) {
        const status =
          (s.status as ServiceStatus | undefined) ??
          (s.is_completed ? 'completed' : 'scheduled');
        if (status === 'scheduled') total += 1;
      }
      // Fallback when services aren't embedded on the list response.
      if (!services.length && typeof (j as any).all_service_count === 'number') {
        total += (j as any).all_service_count;
      }
    }
    return total;
  }, [jobs]);

  const workloadMinutes = useMemo(() => {
    // Prefer the backend-calculated total when we have a saved route,
    // otherwise sum the job-level estimated_duration so the card still
    // works for un-planned days.
    if (routeSummary?.totalJobMinutes != null) {
      return routeSummary.totalJobMinutes;
    }
    let total = 0;
    for (const j of jobs) {
      const d = Number((j as any).estimated_duration);
      if (Number.isFinite(d)) total += d;
    }
    return total;
  }, [jobs, routeSummary]);

  const handleOpenToday = () => {
    navigation.navigate('DayView', { date: todayIso, company, user });
  };

  return (
    <View style={styles.overviewContainer}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 100,
          paddingTop: insets.top + 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Route map — always at the top */}
        <RouteCard
          summary={routeSummary}
          loading={loading}
          onPress={handleOpenToday}
        />

        {/* 2. Today's day overview card */}
        <TodayCard
          dateIso={todayIso}
          jobCount={jobs.length}
          taskCount={taskCount}
          workloadMinutes={workloadMinutes}
          loading={loading}
          onPress={handleOpenToday}
        />

        <View style={styles.requestsHubCard}>
          <TouchableOpacity
            style={styles.timeOffPrimaryBtn}
            activeOpacity={0.9}
            onPress={() => setTimeOffVisible(true)}
          >
            <View style={styles.timeOffPrimaryBtnIcon}>
              <Text style={styles.timeOffPrimaryBtnIconText}>+</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.timeOffPrimaryBtnTitle}>Request time off</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.requestsHubListWrap}>
            {pendingPreviewRows.length ? (
              <View style={styles.requestsHubList}>
                {pendingPreviewRows.map((row) => (
                  <TouchableOpacity
                    key={row.id}
                    style={styles.requestsHubRow}
                    activeOpacity={0.85}
                    onPress={() =>
                      navigation.navigate('RequestStatus', { company, user })
                    }
                  >
                    <View style={styles.requestsHubRowBadge}>
                      <Text style={styles.requestsHubRowBadgeText}>
                        {shortCategoryLabel(row.category)}
                      </Text>
                    </View>
                    <View style={flexRowTextSlot}>
                      <Text
                        style={[styles.requestsHubRowTitle, flexRowText]}
                        numberOfLines={4}
                      >
                        {padAndroidText(formatAppointmentRangeTitle(row))}
                      </Text>
                      <Text style={styles.requestsHubRowSubtitle} numberOfLines={2}>
                        Pending approval
                      </Text>
                    </View>
                    <Text style={styles.requestsHubRowChevron}>›</Text>
                  </TouchableOpacity>
                ))}
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(246,249,247,0)', 'rgba(246,249,247,0.92)', '#F6F9F7']}
                  style={styles.requestsHubFade}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.requestsHubEmptyRow}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('RequestStatus', { company, user })}
              >
                <Text style={styles.requestsHubEmptyText}>
                  No pending requests right now
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      <TimeOffRequestModal
        visible={timeOffVisible}
        onClose={() => setTimeOffVisible(false)}
        onSubmitted={() => {
          setTimeOffVisible(false);
          setRefreshTick((n) => n + 1);
        }}
      />
    </View>
  );
}

// --- TodayCard --------------------------------------------------------------

function TodayCard({
  dateIso,
  jobCount,
  taskCount,
  workloadMinutes,
  loading,
  onPress,
}: {
  dateIso: string;
  jobCount: number;
  taskCount: number;
  workloadMinutes: number;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.todayCard}
      activeOpacity={0.95}
      onPress={onPress}
    >
      <View style={styles.todayCardHeader}>
        <View>
          <Text style={styles.todayCardKicker}>Today</Text>
          <Text style={styles.todayCardDate} numberOfLines={1}>
            {formatLongDate(dateIso)}
          </Text>
        </View>
        <View style={styles.todayCardChevron}>
          <Text style={styles.todayCardChevronText}>›</Text>
        </View>
      </View>

      <View style={styles.todayCardStatsRow}>
        <View style={styles.todayCardStat}>
          <Text style={styles.todayCardStatValue}>
            {loading ? '…' : jobCount}
          </Text>
          <Text style={styles.todayCardStatLabel}>
            {jobCount === 1 ? 'Job' : 'Jobs'}
          </Text>
        </View>
        <View style={styles.todayCardStatDivider} />
        <View style={styles.todayCardStat}>
          <Text style={styles.todayCardStatValue}>
            {loading ? '…' : taskCount}
          </Text>
          <Text style={styles.todayCardStatLabel}>
            {taskCount === 1 ? 'Task' : 'Tasks'}
          </Text>
        </View>
        <View style={styles.todayCardStatDivider} />
        <View style={styles.todayCardStat}>
          <Text style={styles.todayCardStatValue}>
            {loading ? '…' : minutesToHuman(workloadMinutes)}
          </Text>
          <Text style={styles.todayCardStatLabel}>Workload</Text>
        </View>
      </View>

      {!loading && jobCount === 0 ? (
        <Text style={styles.todayCardEmpty}>No jobs scheduled today.</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// --- RouteCard --------------------------------------------------------------
//
// Single component that covers three states:
//   1. Planned route     — renders the Mapbox static image of the stops
//                          with a stats strip (stops / drive time / km).
//   2. No route planned  — renders the darkened-map fallback (centered on
//                          the company address) with an overlay label.
//   3. No map at all     — when no coords are available for either route
//                          or company. Falls back to a soft empty state.
//
// The card is `flex: 1` so it fills the remaining vertical space on the
// Overview screen.

// Build the Mapbox GL JS HTML page that renders inside the WebView.
// All data is embedded directly so no extra requests are needed.
function buildMapHtml(summary: TodayRouteSummary | null): string {
  const token = summary?.mapboxToken ?? '';
  const stops = summary?.routeStops ?? [];
  const geometry = summary?.routeGeometry ?? null;
  const company = summary?.companyCoords ?? null;

  const stopsJson = JSON.stringify(stops);
  const geometryJson = JSON.stringify(geometry);
  const companyJson = JSON.stringify(company);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet">
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{overflow:hidden;background:#e8efef}
    #map{position:absolute;top:0;left:0;right:0;bottom:0}
    .no-token{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,sans-serif;color:#4a6565;font-size:14px;text-align:center;padding:24px;background:#e8efef}
  </style>
</head>
<body>
<div id="map"></div>
<script>
(function(){
  var TOKEN = ${JSON.stringify(token)};
  var STOPS = ${stopsJson};
  var GEOMETRY = ${geometryJson};
  var COMPANY = ${companyJson};

  if (!TOKEN) {
    document.getElementById('map').innerHTML =
      '<div class="no-token">Map unavailable — no Mapbox token configured on the server.</div>';
    return;
  }

  mapboxgl.accessToken = TOKEN;

  // Compute initial bounds from stops, falling back to company coords.
  var bounds = null;
  if (STOPS.length > 0) {
    bounds = STOPS.reduce(function(b, s) {
      return b.extend([s.lng, s.lat]);
    }, new mapboxgl.LngLatBounds([STOPS[0].lng, STOPS[0].lat], [STOPS[0].lng, STOPS[0].lat]));
  }

  var mapOpts = {
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    attributionControl: false,
  };
  if (bounds) {
    mapOpts.bounds = bounds;
    mapOpts.fitBoundsOptions = { padding: 60, maxZoom: 15 };
  } else if (COMPANY) {
    mapOpts.center = [COMPANY.lng, COMPANY.lat];
    mapOpts.zoom = 13;
  } else {
    mapOpts.center = [10.0, 56.0];
    mapOpts.zoom = 6;
  }

  var map = new mapboxgl.Map(mapOpts);
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

  map.on('load', function() {
    var line = GEOMETRY && GEOMETRY.length >= 2 ? GEOMETRY : (STOPS.length >= 2 ? STOPS.map(function(s){ return [s.lng, s.lat]; }) : null);

    if (line) {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: line } }
      });
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route',
        paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.5 } });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route',
        paint: { 'line-color': '#10b981', 'line-width': 4,
          'line-dasharray': GEOMETRY ? [1] : [2, 2] } });
    }

    // House marker helper
    function addHouseMarker(lngLat) {
      var el = document.createElement('div');
      el.style.cssText = 'width:32px;height:32px;border-radius:8px;background:#193434;' +
        'border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);' +
        'display:flex;align-items:center;justify-content:center;font-size:16px;';
      el.textContent = '⌂';
      new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    }

    // If we have road geometry, the first and last points ARE the employee's
    // start/end home address (they were included in the Directions API call
    // when the admin planned the route). Show those as house icons.
    if (GEOMETRY && GEOMETRY.length >= 2) {
      var startPt = GEOMETRY[0];
      var endPt = GEOMETRY[GEOMETRY.length - 1];
      addHouseMarker(startPt);
      // Only draw a second house if start and end are meaningfully different
      var dist = Math.abs(endPt[0] - startPt[0]) + Math.abs(endPt[1] - startPt[1]);
      if (dist > 0.0001) addHouseMarker(endPt);
    } else if (COMPANY) {
      // No saved geometry yet — fall back to company address
      addHouseMarker([COMPANY.lng, COMPANY.lat]);
    }

    // Numbered job markers (1, 2, 3 …)
    STOPS.forEach(function(stop, i) {
      var el = document.createElement('div');
      el.style.cssText = 'width:26px;height:26px;border-radius:50%;background:#10b981;' +
        'border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);' +
        'display:flex;align-items:center;justify-content:center;' +
        'color:white;font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;';
      el.textContent = String(i + 1);
      new mapboxgl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map);
    });
  });
})();
</script>
</body>
</html>`;
}

function RouteCard({
  summary,
  loading,
  onPress,
}: {
  summary: TodayRouteSummary | null;
  loading: boolean;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [fullscreen, setFullscreen] = useState(false);
  const hasRoute = !!summary?.hasRoute;
  const hasMapData = !!(summary?.mapboxToken && (summary.routeStops.length > 0 || summary.companyCoords));

  const mapHtml = useMemo(() => {
    if (!summary) return null;
    return buildMapHtml(summary);
  }, [summary]);

  return (
    <>
      <View style={styles.routeCard}>
        {/* Map area — WebView or placeholder */}
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={hasMapData ? () => setFullscreen(true) : undefined}
          disabled={!hasMapData}
        >
          {mapHtml ? (
            <WebView
              source={{ html: mapHtml }}
              style={styles.routeCardMap}
              scrollEnabled={false}
              bounces={false}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              // Disable touch in card preview — tap opens fullscreen instead
              pointerEvents="none"
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
            />
          ) : (
            <View style={styles.routeCardNoImage}>
              <Text style={styles.routeCardNoImageText}>
                {loading ? 'Loading map…' : 'Could not reach route service'}
              </Text>
            </View>
          )}

          {/* "No route" overlay on top of the map when there are no stops planned */}
          {!hasRoute && hasMapData ? (
            <View style={styles.routeCardOverlay} pointerEvents="none">
              <Text style={styles.routeCardOverlayTitle}>No route planned yet</Text>
              <Text style={styles.routeCardOverlaySubtitle}>
                Your route will appear here once it has been planned.
              </Text>
            </View>
          ) : null}

          {/* Expand hint */}
          {hasMapData ? (
            <View style={styles.routeCardExpandHint} pointerEvents="none">
              <Text style={styles.routeCardExpandHintText}>⛶  Tap to expand</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {/* Stats strip — tap navigates to Day View */}
        {hasRoute ? (
          <TouchableOpacity style={styles.routeCardBody} activeOpacity={0.9} onPress={onPress}>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeCardKicker}>Today's route</Text>
              <Text style={styles.routeCardStats} numberOfLines={1}>
                {summary!.stopCount} stops
                {summary!.totalMinutes != null ? ` · ${minutesToHuman(summary!.totalMinutes)} drive` : ''}
                {summary!.totalKm != null ? ` · ${Math.round(summary!.totalKm)} km` : ''}
              </Text>
            </View>
            <View style={styles.todayCardChevron}>
              <Text style={styles.todayCardChevronText}>›</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Fullscreen interactive map modal */}
      <Modal visible={fullscreen} animationType="slide" statusBarTranslucent onRequestClose={() => setFullscreen(false)}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {mapHtml && (
            <WebView
              source={{ html: mapHtml }}
              style={{ flex: 1 }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
            />
          )}

          {/* Close button */}
          <TouchableOpacity
            style={[styles.mapFullscreenClose, { top: insets.top + 12 }]}
            onPress={() => setFullscreen(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.mapFullscreenCloseText}>✕</Text>
          </TouchableOpacity>

          {/* Stats bar */}
          {hasRoute && (
            <TouchableOpacity
              style={[styles.mapFullscreenBar, { paddingBottom: insets.bottom + 16 }]}
              activeOpacity={0.9}
              onPress={() => { setFullscreen(false); onPress(); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.routeCardKicker}>Today's route</Text>
                <Text style={styles.routeCardStats} numberOfLines={1}>
                  {summary!.stopCount} stops
                  {summary!.totalMinutes != null ? ` · ${minutesToHuman(summary!.totalMinutes)} drive` : ''}
                  {summary!.totalKm != null ? ` · ${Math.round(summary!.totalKm)} km` : ''}
                </Text>
              </View>
              <Text style={[styles.todayCardChevronText, { color: '#fff' }]}>›</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </>
  );
}

// --- Time-off request: shared helpers ---------------------------------------
//
// These three categories are what the user sees — they map to the pre-existing
// server-side category values so the admin web UI keeps working without any
// schema change.
type EmployeeTimeOffCategory = 'holiday' | 'appointment' | 'time_off';

const EMPLOYEE_CATEGORIES: {
  id: EmployeeTimeOffCategory;
  label: string;
  hint: string;
  icon: string;
  // Maps to server-side `category` column (validated set: personal, meeting,
  // sick, vacation, other).
  serverCategory: 'vacation' | 'personal' | 'other';
  // Human-readable title used as the appointment row's `title` on save.
  defaultTitle: string;
}[] = [
  {
    id: 'holiday',
    label: 'Holiday',
    hint: 'A planned day or days off',
    icon: '🏖',
    serverCategory: 'vacation',
    defaultTitle: 'Holiday',
  },
  {
    id: 'appointment',
    label: 'Appointment',
    hint: 'Doctor, dentist, errand…',
    icon: '🦷',
    serverCategory: 'personal',
    defaultTitle: 'Personal appointment',
  },
  {
    id: 'time_off',
    label: 'Time off',
    hint: 'Anything else',
    icon: '🌙',
    serverCategory: 'other',
    defaultTitle: 'Time off',
  },
];

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isoToDate(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

function daysBetween(startIso: string, endIso: string): number {
  // Inclusive count of days, so start === end => 1.
  const a = isoToDate(startIso).getTime();
  const b = isoToDate(endIso).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

// --- InlineRangeCalendar ----------------------------------------------------
//
// Month grid with Mon-first columns. Each row is exactly seven flex columns
// so day cells stay aligned with the weekday header (avoids wrap/rounding
// gaps on the last column).
//
// Selection: first tap picks a day (single-day). Second tap on another day
// sets the inclusive range (works forward or backward). Further taps start
// over from the tapped day. Past days are disabled when `minIso` is set.

function InlineRangeCalendar({
  startIso,
  endIso,
  minIso,
  onChange,
}: {
  startIso: string | null;
  endIso: string | null;
  minIso?: string;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const initialView = useMemo(() => {
    const base = startIso || todayIsoLocal();
    const d = new Date(base + 'T00:00:00');
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [startIso]);
  const [viewMonth, setViewMonth] = useState<Date>(initialView);

  const minDate = minIso ? isoToDate(minIso) : null;

  const goPrevMonth = () => {
    const m = new Date(viewMonth);
    m.setMonth(m.getMonth() - 1);
    setViewMonth(m);
  };
  const goNextMonth = () => {
    const m = new Date(viewMonth);
    m.setMonth(m.getMonth() + 1);
    setViewMonth(m);
  };

  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Mon=0, Sun=6 (ISO order). JS getDay() returns Sun=0, Mon=1, so shift.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;

  const cells: ({ iso: string; day: number; inMonth: true } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ iso, day: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  const handleTap = (iso: string) => {
    if (!startIso || !endIso) {
      onChange(iso, iso);
      return;
    }
    if (startIso === endIso) {
      if (iso === startIso) return;
      const lo = iso < startIso ? iso : startIso;
      const hi = iso < startIso ? startIso : iso;
      onChange(lo, hi);
      return;
    }
    onChange(iso, iso);
  };

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <View style={styles.rangeCalContainer}>
      <View style={styles.rangeCalHeader}>
        <TouchableOpacity
          onPress={goPrevMonth}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.rangeCalNavBtn}
        >
          <Text style={styles.rangeCalNavText}>‹</Text>
        </TouchableOpacity>
        <Text
          style={styles.rangeCalMonthLabel}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {padAndroidText(monthLabel)}
        </Text>
        <TouchableOpacity
          onPress={goNextMonth}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.rangeCalNavBtn}
        >
          <Text style={styles.rangeCalNavText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rangeCalWeekdayRow}>
        {weekdayLabels.map((l, i) => (
          <View key={i} style={styles.rangeCalWeekdayCell}>
            <Text style={styles.rangeCalWeekdayText}>{l}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rangeCalGrid}>
        {rows.map((row, ri) => (
          <View key={`row-${ri}`} style={styles.rangeCalGridRow}>
            {row.map((c, ci) => {
              const cellKey = c ? c.iso : `e-${ri}-${ci}`;
              if (!c) {
                return <View key={cellKey} style={styles.rangeCalCell} />;
              }
              const dCell = isoToDate(c.iso);
              const isPast = minDate ? dCell < minDate : false;
              const isStart = startIso === c.iso;
              const isEnd = endIso === c.iso;
              const inRange =
                startIso && endIso && c.iso > startIso && c.iso < endIso;
              const isSingle =
                startIso && endIso && startIso === endIso && startIso === c.iso;
              const isEdge = isStart || isEnd;
              return (
                <TouchableOpacity
                  key={c.iso}
                  disabled={isPast}
                  onPress={() => handleTap(c.iso)}
                  activeOpacity={0.8}
                  style={[
                    styles.rangeCalCell,
                    inRange && styles.rangeCalCellInRange,
                    isStart && !isSingle && styles.rangeCalCellStart,
                    isEnd && !isSingle && styles.rangeCalCellEnd,
                  ]}
                >
                  <View
                    style={[
                      styles.rangeCalCellInner,
                      isEdge && styles.rangeCalCellInnerEdge,
                      isSingle && styles.rangeCalCellInnerEdge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rangeCalCellText,
                        isPast && styles.rangeCalCellTextPast,
                        inRange && styles.rangeCalCellTextInRange,
                        isEdge && styles.rangeCalCellTextEdge,
                      ]}
                    >
                      {padAndroidText(String(c.day))}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// --- TimeOffRequestModal ----------------------------------------------------
//
// Employee-facing time-off request form.
//   - 3 high-level categories (Holiday / Appointment / Time off) that map to
//     the admin-side server categories (vacation / personal / other).
//   - Inline range calendar for date(s).
//   - Single day ⇒ choice of: Full day | Specific time | Just hours.
//   - Multi-day range ⇒ one request row with end_date (inclusive) and
//     time_mode all_day.
//   - All submissions carry kind='time_off'; the API enforces
//     status='requested' for non-admin callers so the admin sees them as
//     dashed "Request" pills until approved.

type EmployeeTimeMode = 'all_day' | 'span' | 'hours';

function TimeOffRequestModal({
  visible,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<EmployeeTimeOffCategory>('holiday');
  const [startDate, setStartDate] = useState<string | null>(todayIsoLocal());
  const [endDate, setEndDate] = useState<string | null>(todayIsoLocal());
  const [timeMode, setTimeMode] = useState<EmployeeTimeMode>('all_day');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [hoursOff, setHoursOff] = useState('4');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = todayIsoLocal();
  const isSingleDay =
    !!startDate && !!endDate && startDate === endDate;

  useEffect(() => {
    if (visible) {
      setCategory('holiday');
      setStartDate(today);
      setEndDate(today);
      setTimeMode('all_day');
      setStartTime('09:00');
      setEndTime('12:00');
      setHoursOff('4');
      setNotes('');
      setSubmitting(false);
    }
  }, [visible, today]);

  // Multi-day ranges are always treated as full days per the spec. Auto-snap
  // the time mode back to 'all_day' if the user switches to a range after
  // picking specific times.
  useEffect(() => {
    if (!isSingleDay && timeMode !== 'all_day') {
      setTimeMode('all_day');
    }
  }, [isSingleDay, timeMode]);

  const isValid = (() => {
    if (!startDate || !endDate) return false;
    if (endDate < startDate) return false;
    if (timeMode === 'span') {
      if (!/^\d{2}:\d{2}$/.test(startTime)) return false;
      if (!/^\d{2}:\d{2}$/.test(endTime)) return false;
      if (endTime <= startTime) return false;
    }
    if (timeMode === 'hours') {
      const n = Number(hoursOff.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0 || n > 24) return false;
    }
    return true;
  })();

  const dayCount = startDate && endDate ? daysBetween(startDate, endDate) : 0;

  const cat = EMPLOYEE_CATEGORIES.find((c) => c.id === category)!;

  const submit = async () => {
    if (!isValid || submitting || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      const payload: any = {
        title: cat.defaultTitle,
        category: cat.serverCategory,
        kind: 'time_off',
        appointment_date: startDate,
        notes: notes.trim() || null,
      };
      if (!isSingleDay || timeMode === 'all_day') {
        payload.time_mode = 'all_day';
        if (startDate < endDate) {
          payload.end_date = endDate;
        }
      } else if (timeMode === 'span') {
        payload.time_mode = 'span';
        payload.start_time = startTime;
        payload.end_time = endTime;
      } else {
        payload.time_mode = 'hours';
        payload.hours_off = Number(hoursOff.replace(',', '.'));
      }

      await apiClient.post('/appointments', payload);

      const spanDays =
        startDate && endDate && startDate < endDate ? daysBetween(startDate, endDate) : 1;

      Alert.alert(
        'Request sent',
        spanDays === 1
          ? 'Your request has been sent to your manager.'
          : `Your ${spanDays}-day request has been sent to your manager.`,
      );
      onSubmitted();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Could not send your request. Please try again.';
      Alert.alert('Could not send request', String(msg));
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  const rangeSummary = (() => {
    if (!startDate || !endDate) return 'Pick a day';
    if (startDate === endDate) return formatLongDate(startDate);
    return `${formatShortDate(startDate)}–${formatShortDate(endDate)} (${dayCount}d)`;
  })();

  return (
    <View style={styles.timeOffModalRoot}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.timeOffModalBackdrop} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.timeOffModalSheetWrap}
      >
        <View
          style={[
            styles.timeOffModalSheet,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.timeOffModalGrip} />
          <View style={styles.timeOffModalHeader}>
            <Text style={styles.timeOffModalTitle}>Request time off</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <RNText style={styles.timeOffModalCloseText}>{padAndroidText('Close')}</RNText>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Category tiles */}
            <Text style={styles.timeOffLabel}>What is it?</Text>
            <View style={styles.timeOffCatTileRow}>
              {EMPLOYEE_CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCategory(c.id)}
                    activeOpacity={0.85}
                    style={[
                      styles.timeOffCatTile,
                      active && styles.timeOffCatTileActive,
                    ]}
                  >
                    <Text style={styles.timeOffCatTileIcon}>{c.icon}</Text>
                    <RNText
                      style={[
                        styles.timeOffCatTileLabel,
                        active && styles.timeOffCatTileLabelActive,
                      ]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                    >
                      {padAndroidText(c.label)}
                    </RNText>
                    <Text
                      style={[
                        styles.timeOffCatTileHint,
                        active && styles.timeOffCatTileHintActive,
                      ]}
                      numberOfLines={2}
                    >
                      {c.hint}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Date picker */}
            <View style={styles.timeOffSectionHeader}>
              <RNText style={styles.timeOffLabel}>{padAndroidText('When?')}</RNText>
              <RNText
                style={styles.timeOffRangeSummary}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {padAndroidText(rangeSummary)}
              </RNText>
            </View>
            <InlineRangeCalendar
              startIso={startDate}
              endIso={endDate}
              minIso={today}
              onChange={(s, e) => {
                setStartDate(s);
                setEndDate(e);
              }}
            />
            <Text style={styles.timeOffCalendarHint}>
              Tap the first day, then the last day (order does not matter). Tap again to change.
            </Text>

            {/* Time-of-day options only make sense for a single day */}
            {isSingleDay ? (
              <>
                <Text style={[styles.timeOffLabel, { marginTop: 18 }]}>
                  How long?
                </Text>
                <View style={styles.timeOffModeRow}>
                  {([
                    { id: 'all_day', label: 'Full day' },
                    { id: 'span', label: 'Specific time' },
                    { id: 'hours', label: 'Just hours' },
                  ] as { id: EmployeeTimeMode; label: string }[]).map((m) => {
                    const active = timeMode === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        onPress={() => setTimeMode(m.id)}
                        activeOpacity={0.85}
                        style={[
                          styles.timeOffModeChip,
                          active && styles.timeOffModeChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.timeOffModeChipText,
                            active && styles.timeOffModeChipTextActive,
                          ]}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {padAndroidText(m.label)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {timeMode === 'span' ? (
                  <View style={styles.timeOffDateRow}>
                    <View style={styles.timeOffDateCol}>
                      <Text style={styles.timeOffSubLabel}>Start</Text>
                      <TextInput
                        value={startTime}
                        onChangeText={setStartTime}
                        placeholder="HH:MM"
                        placeholderTextColor="#7F9A8E"
                        style={styles.timeOffDateInput}
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={styles.timeOffDateCol}>
                      <Text style={styles.timeOffSubLabel}>End</Text>
                      <TextInput
                        value={endTime}
                        onChangeText={setEndTime}
                        placeholder="HH:MM"
                        placeholderTextColor="#7F9A8E"
                        style={styles.timeOffDateInput}
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                ) : null}

                {timeMode === 'hours' ? (
                  <View>
                    <Text style={styles.timeOffSubLabel}>Hours off</Text>
                    <TextInput
                      value={hoursOff}
                      onChangeText={(v) =>
                        setHoursOff(v.replace(/[^0-9.,]/g, ''))
                      }
                      placeholder="e.g. 2"
                      placeholderTextColor="#7F9A8E"
                      style={styles.timeOffDateInput}
                      keyboardType="numeric"
                    />
                    <View style={styles.timeOffHoursQuickRow}>
                      {['1', '2', '4', '8'].map((h) => (
                        <TouchableOpacity
                          key={h}
                          onPress={() => setHoursOff(h)}
                          style={[
                            styles.timeOffHoursQuickChip,
                            hoursOff === h &&
                              styles.timeOffHoursQuickChipActive,
                          ]}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.timeOffHoursQuickChipText,
                              hoursOff === h &&
                                styles.timeOffHoursQuickChipTextActive,
                            ]}
                          >
                            {h}h
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.timeOffMultiDayInfo}>
                <Text style={styles.timeOffMultiDayInfoText}>
                  Full day off for all {dayCount} selected days.
                </Text>
              </View>
            )}

            <Text style={[styles.timeOffLabel, { marginTop: 18 }]}>
              Note for your manager (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. travelling with family"
              placeholderTextColor="#7F9A8E"
              style={[styles.timeOffDateInput, styles.timeOffNotesInput]}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.timeOffSubmitBtn,
              (!isValid || submitting) && styles.timeOffSubmitBtnDisabled,
            ]}
            onPress={submit}
            disabled={!isValid || submitting}
            activeOpacity={0.9}
          >
            <Text style={styles.timeOffSubmitBtnText}>
              {submitting ? padAndroidText('Sending…') : padAndroidText('Send request')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// --- RequestStatusScreen ----------------------------------------------------
//
// Full-screen history + status board for the employee's own time-off
// submissions. Groups rows into four sections so the employee can scan the
// state of every request at a glance:
//
//   Pending   — request submitted, no decision yet (dashed amber card).
//   Upcoming  — approved and the date hasn't passed.
//   Past      — approved and the date is in the past.
//   Declined  — admin declined. Shows the optional reason and a dismiss
//               button so the row can be removed from the board.

function categoryIconFor(category: string): string {
  switch (category) {
    case 'vacation': return '🏖';
    case 'personal': return '🦷';
    case 'sick': return '🤒';
    case 'meeting': return '📅';
    default: return '🌙';
  }
}

function formatTimeRange(a: AppointmentRow): string {
  const s = String(a.appointment_date).split('T')[0];
  const rangeEnd = a.end_date && String(a.end_date).split('T')[0];
  if (a.time_mode === 'all_day' && rangeEnd && rangeEnd > s) {
    const n = daysBetween(s, rangeEnd);
    return `${n} full day${n === 1 ? '' : 's'}`;
  }
  if (a.time_mode === 'all_day') return 'Full day';
  if (a.time_mode === 'span' && a.start_time && a.end_time) {
    const fa = formatClockHm(a.start_time);
    const fb = formatClockHm(a.end_time);
    if (fa && fb) return `${fa} – ${fb}`;
    return `${a.start_time} – ${a.end_time}`;
  }
  if (a.time_mode === 'hours' && a.hours_off != null) {
    const h = Number(a.hours_off);
    return `${h} h off`;
  }
  return '';
}

function shortCategoryLabel(category: string): string {
  switch (String(category || '').toLowerCase()) {
    case 'vacation':
      return 'Holiday';
    case 'personal':
      return 'Appt';
    case 'sick':
      return 'Sick';
    default:
      return 'Time off';
  }
}

function RequestStatusScreen({ route, navigation }: any) {
  const { user } = route.params || {};
  const insets = useSafeAreaInsets();
  // Upcoming list is the hot-path view and loads immediately.
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  // Past section is hidden by default — the user explicitly requested "past
  // might be a lot, so don't preload unless clicked". We fetch on demand.
  const [pastRows, setPastRows] = useState<AppointmentRow[] | null>(null);
  const [pastLoading, setPastLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const today = todayIsoLocal();

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        // Ask the backend for today-onwards only so we don't drag hundreds
        // of historical rows across the wire. Past is fetched separately
        // when the user opens that section.
        const res = await apiClient.get(
          `/appointments?status=all&from=${today}`,
        );
        if (!alive) return;
        const list: AppointmentRow[] = (res.data?.appointments || []).filter(
          (a: AppointmentRow) =>
            a.kind === 'time_off' && Number(a.user_id) === Number(user.id),
        );
        setRows(list);
      } catch (err) {
        console.warn('[request-status] fetch failed:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id, refreshTick, today]);

  const loadPast = async () => {
    if (pastLoading) return;
    setPastLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      const res = await apiClient.get(
        `/appointments?status=all&to=${today}`,
      );
      const list: AppointmentRow[] = (res.data?.appointments || []).filter(
        (a: AppointmentRow) =>
          a.kind === 'time_off' &&
          Number(a.user_id) === Number(user.id) &&
          appointmentEndIsoStr(a) < today,
      );
      list.sort((a, b) =>
        b.appointment_date.localeCompare(a.appointment_date),
      );
      setPastRows(list);
    } catch (err) {
      console.warn('[request-status] past fetch failed:', err);
      setPastRows([]);
    } finally {
      setPastLoading(false);
    }
  };

  // Upcoming = pending OR approved OR declined that still has a future date.
  // Declined rows in the past fall into the "past" bucket automatically
  // since we filter by date.
  const upcoming = rows
    .filter((r) => appointmentEndIsoStr(r) >= today)
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
  // Pending that are BEFORE today are odd but possible (admin hasn't
  // reviewed them yet). Surface them so the employee can chase it.
  const pendingBacklog = rows.filter(
    (r) => r.status === 'requested' && appointmentEndIsoStr(r) < today,
  );
  const declinedRecent = rows.filter(
    (r) => r.status === 'declined' && appointmentEndIsoStr(r) >= today,
  );

  const cancelRow = (row: AppointmentRow) => {
    const verb =
      row.status === 'requested' ? 'Cancel request' : 'Remove from history';
    const msg =
      row.status === 'requested'
        ? 'Cancel this pending request?'
        : 'Remove this declined request from your history?';
    Alert.alert(verb, msg, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: verb,
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/appointments/${row.id}`);
            setRefreshTick((n) => n + 1);
            setPastRows(null); // invalidate past cache
          } catch (err: any) {
            Alert.alert(
              'Could not remove',
              err?.response?.data?.error || err?.message || 'Please try again.'
            );
          }
        },
      },
    ]);
  };

  const renderCard = (row: AppointmentRow) => {
    const isPending = row.status === 'requested';
    const isApproved = row.status === 'approved';
    const isDeclined = row.status === 'declined';
    const isPast = appointmentEndIsoStr(row) < today;
    // Delete button is only offered for PENDING rows (employee can cancel
    // their own request) and for declined rows that can be dismissed from
    // the history. Approved and past approved rows cannot be deleted from
    // the mobile app — per spec, the employee loses control once admin
    // approves it.
    const canDelete = (isPending || isDeclined) && !isPast;
    // Compute days-until for upcoming rows so the user has a glanceable
    // reminder of how close an approved or pending date is.
    let daysUntilLabel: string | null = null;
    if (!isPast) {
      const t0 = new Date(today + 'T00:00:00').getTime();
      const t1 = new Date(row.appointment_date + 'T00:00:00').getTime();
      const days = Math.max(0, Math.round((t1 - t0) / 86400000));
      daysUntilLabel =
        days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
    }
    return (
      <View
        key={row.id}
        style={[
          styles.reqStatusCard,
          isPending && styles.reqStatusCardPending,
          isDeclined && styles.reqStatusCardDeclined,
        ]}
      >
        <View style={styles.reqStatusCardTop}>
          <Text style={styles.reqStatusCardEmoji}>
            {categoryIconFor(row.category)}
          </Text>
          <View style={flexRowTextSlot}>
            <Text style={[styles.reqStatusCardTitle, flexRowText]} numberOfLines={4}>
              {row.title}
            </Text>
          </View>
          <View
            style={[
              styles.reqStatusCardBadge,
              isApproved
                ? styles.reqStatusCardBadgeApproved
                : isDeclined
                ? styles.reqStatusCardBadgeDeclined
                : styles.reqStatusCardBadgePending,
            ]}
          >
            <RNText
              style={[
                styles.reqStatusCardBadgeText,
                isApproved
                  ? styles.reqStatusCardBadgeTextApproved
                  : isDeclined
                  ? styles.reqStatusCardBadgeTextDeclined
                  : styles.reqStatusCardBadgeTextPending,
              ]}
            >
              {padAndroidText(
                isApproved ? 'Approved' : isDeclined ? 'Declined' : 'Pending',
              )}
            </RNText>
          </View>
        </View>
        <Text style={[styles.reqStatusCardMeta, flexRowText]}>
          {formatAppointmentRangeTitle(row)}
          {(() => {
            const s = String(row.appointment_date).split('T')[0];
            const e = row.end_date && String(row.end_date).split('T')[0];
            if (row.time_mode === 'all_day' && e && e > s) return '';
            const tr = formatTimeRange(row);
            return tr ? `  ·  ${tr}` : '';
          })()}
          {daysUntilLabel ? `  ·  ${daysUntilLabel}` : ''}
        </Text>
        {row.notes ? (
          <Text style={styles.reqStatusCardNotes}>“{row.notes}”</Text>
        ) : null}
        {isDeclined && row.decline_reason ? (
          <View style={styles.reqStatusCardReason}>
            <Text style={styles.reqStatusCardReasonLabel}>
              Reason from your manager
            </Text>
            <Text style={styles.reqStatusCardReasonText}>
              {row.decline_reason}
            </Text>
          </View>
        ) : null}
        {canDelete && (
          <TouchableOpacity
            style={styles.reqStatusCardCancelBtn}
            onPress={() => cancelRow(row)}
            activeOpacity={0.85}
          >
            <Text style={styles.reqStatusCardCancelBtnText}>
              {isPending ? 'Cancel request' : 'Dismiss'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const hasUpcomingContent =
    upcoming.length > 0 || pendingBacklog.length > 0 || declinedRecent.length > 0;

  return (
    <View style={styles.reqStatusScreen}>
      <View style={[styles.reqStatusHeader, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.reqStatusBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.reqStatusBackBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.reqStatusTitle}>Your requests</Text>
      </View>

      <ScrollView
        style={styles.reqStatusScroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? null : !hasUpcomingContent && pastRows === null ? (
          <View style={styles.reqStatusEmpty}>
            <Text style={styles.reqStatusEmptyTitle}>No requests yet</Text>
            <Text style={styles.reqStatusEmptySubtitle}>
              Tap “Request time off” on the overview to submit one.
            </Text>
          </View>
        ) : (
          <>
            {pendingBacklog.length > 0 && (
              <>
                <View style={styles.reqStatusSection}>
                  <Text style={styles.reqStatusSectionTitle}>
                    Waiting for approval
                  </Text>
                </View>
                {pendingBacklog.map(renderCard)}
              </>
            )}
            {upcoming.length > 0 && (
              <>
                <View style={styles.reqStatusSection}>
                  <Text style={styles.reqStatusSectionTitle}>Upcoming</Text>
                </View>
                {upcoming.map(renderCard)}
              </>
            )}
            {declinedRecent.length > 0 && (
              <>
                <View style={styles.reqStatusSection}>
                  <Text style={styles.reqStatusSectionTitle}>Declined</Text>
                </View>
                {declinedRecent.map(renderCard)}
              </>
            )}
            {pastRows !== null && pastRows.length > 0 && (
              <>
                <View style={styles.reqStatusSection}>
                  <Text style={styles.reqStatusSectionTitle}>Past</Text>
                </View>
                {pastRows.map(renderCard)}
              </>
            )}
            {pastRows !== null && pastRows.length === 0 && (
              <View style={styles.reqStatusPastEmpty}>
                <Text style={styles.reqStatusPastEmptyText}>
                  No past requests.
                </Text>
              </View>
            )}
          </>
        )}

        {/* "Show past" is a lazy trigger — we only fetch history when the
            user actually wants to see it. Hides itself after opening. */}
        {pastRows === null && !loading && (
          <TouchableOpacity
            style={styles.reqStatusPastBtn}
            activeOpacity={0.85}
            onPress={loadPast}
            disabled={pastLoading}
          >
            <Text style={styles.reqStatusPastBtnText}>
              {pastLoading ? 'Loading past…' : 'Show past requests'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AdminRequestsScreen
//
// The admin-facing counterpart to RequestStatusScreen. It has two scopes:
//
//   "mine"        — shows the admin's own upcoming appointments. This is
//                   the default landing state.
//   "user:<id>"   — shows a specific employee's time-off rows (all
//                   statuses). Admin can approve, edit-category, or delete.
//
// Users appear in a horizontal slider at the top, alphabetized by first
// name. Each chip carries a small amber badge with that user's pending
// count so the admin can pick the loudest first.
// ---------------------------------------------------------------------------

type AdminRequestsScope = 'mine' | number; // number = user id

function AdminRequestsScreen({ route, navigation }: any) {
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();

  const [members, setMembers] = useState<CompanyMember[]>([]);
  // Key = user_id (number), value = that user's appointment rows. Admin's
  // own rows live under their own id too.
  const [rowsByUser, setRowsByUser] = useState<Record<number, AppointmentRow[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<AdminRequestsScope>(() => {
    const i = route.params?.initialScope;
    if (i === undefined || i === null) return 'mine';
    if (i === 'mine') return 'mine';
    const n = Number(i);
    return Number.isFinite(n) ? n : 'mine';
  });
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const i = route.params?.initialScope;
    if (i === undefined || i === null) return;
    if (i === 'mine') {
      setScope('mine');
      return;
    }
    const n = Number(i);
    if (Number.isFinite(n)) setScope(n);
  }, [route.params?.initialScope]);

  const today = todayIsoLocal();

  const reload = () => setRefreshTick((n) => n + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        // One round-trip for users + one for *all* appointments in the
        // company. Cheap enough for a typical team (<100 employees) and
        // avoids N+1 fetching once the admin starts scrolling the slider.
        const [usersRes, apptRes] = await Promise.all([
          apiClient.get('/users').catch(() => null),
          apiClient.get('/appointments?status=all&user_id=all').catch(() => null),
        ]);
        if (!alive) return;

        const list: CompanyMember[] = (usersRes as any)?.data?.users || [];
        // Alphabetical by first name, case-insensitive. Admin themselves
        // gets surfaced first via the "mine" tab so their position in the
        // slider doesn't matter.
        list.sort((a, b) => {
          const an = String(a.first_name || a.email || '').toLowerCase();
          const bn = String(b.first_name || b.email || '').toLowerCase();
          return an.localeCompare(bn);
        });
        setMembers(list);

        const allAppts: AppointmentRow[] =
          (apptRes as any)?.data?.appointments || [];
        const grouped: Record<number, AppointmentRow[]> = {};
        for (const a of allAppts) {
          if (a.kind !== 'time_off') continue;
          const uid = Number(a.user_id);
          if (!Number.isFinite(uid)) continue;
          if (!grouped[uid]) grouped[uid] = [];
          grouped[uid].push(a);
        }
        setRowsByUser(grouped);
      } catch (err) {
        console.warn('[admin-requests] load failed:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshTick]);

  // --- Actions (approve / decline / delete / edit category) -----------------

  const approveRow = async (row: AppointmentRow) => {
    try {
      await apiClient.post(`/appointments/${row.id}/approve`);
      reload();
    } catch (err: any) {
      Alert.alert(
        'Could not approve',
        err?.response?.data?.error || err?.message || 'Please try again.',
      );
    }
  };

  const declineRow = (row: AppointmentRow) => {
    Alert.prompt?.(
      'Decline request',
      'Optional reason (shown to the employee):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async (reason?: string) => {
            try {
              await apiClient.post(`/appointments/${row.id}/decline`, {
                reason: (reason || '').trim() || undefined,
              });
              reload();
            } catch (err: any) {
              Alert.alert(
                'Could not decline',
                err?.response?.data?.error ||
                  err?.message ||
                  'Please try again.',
              );
            }
          },
        },
      ],
      'plain-text',
    );
    // Android fallback — Alert.prompt is iOS-only. We confirm without a
    // reason there; the backend tolerates a null reason.
    if (Platform.OS !== 'ios') {
      Alert.alert('Decline request', 'Decline this time-off request?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.post(`/appointments/${row.id}/decline`, {});
              reload();
            } catch (err: any) {
              Alert.alert(
                'Could not decline',
                err?.response?.data?.error ||
                  err?.message ||
                  'Please try again.',
              );
            }
          },
        },
      ]);
    }
  };

  const deleteRow = (row: AppointmentRow) => {
    Alert.alert(
      'Delete request',
      'Remove this appointment entirely? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/appointments/${row.id}`);
              reload();
            } catch (err: any) {
              Alert.alert(
                'Could not delete',
                err?.response?.data?.error ||
                  err?.message ||
                  'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  // Inline "edit" is intentionally lightweight — the admin most often wants
  // to adjust the category (e.g. approve as "vacation" instead of "other").
  // Date/time edits are a bigger surface and live on the web platform.
  const editCategory = (row: AppointmentRow) => {
    const options: { label: string; value: string }[] = [
      { label: 'Holiday', value: 'vacation' },
      { label: 'Appointment', value: 'personal' },
      { label: 'Sick', value: 'sick' },
      { label: 'Other', value: 'other' },
    ];
    Alert.alert(
      'Change category',
      `Currently: ${shortCategoryLabel(row.category)}`,
      [
        ...options.map((opt) => ({
          text: opt.label,
          onPress: async () => {
            if (opt.value === row.category) return;
            try {
              await apiClient.patch(`/appointments/${row.id}`, {
                category: opt.value,
              });
              reload();
            } catch (err: any) {
              Alert.alert(
                'Could not update',
                err?.response?.data?.error ||
                  err?.message ||
                  'Please try again.',
              );
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  // --- Derived data ---------------------------------------------------------

  const pendingCountByUser: Record<number, number> = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [uid, list] of Object.entries(rowsByUser)) {
      out[Number(uid)] = list.filter((r) => r.status === 'requested').length;
    }
    return out;
  }, [rowsByUser]);

  // "mine" scope → admin's own upcoming rows (approved + pending), sorted
  // by date. Keeps past appointments out of the default view.
  const mineRows: AppointmentRow[] = useMemo(() => {
    const all = rowsByUser[Number(user.id)] || [];
    return all
      .filter(
        (r) =>
          appointmentEndIsoStr(r) >= today &&
          (r.status === 'approved' || r.status === 'requested'),
      )
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
  }, [rowsByUser, user.id, today]);

  // Per-employee scope → pending first, then upcoming approved, then
  // declined — past stays hidden by default.
  const selectedUserRows: {
    pending: AppointmentRow[];
    upcoming: AppointmentRow[];
    declined: AppointmentRow[];
  } = useMemo(() => {
    if (scope === 'mine')
      return { pending: [], upcoming: [], declined: [] };
    const all = rowsByUser[scope] || [];
    const pending = all
      .filter((r) => r.status === 'requested')
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
    const upcoming = all
      .filter(
        (r) =>
          r.status === 'approved' && appointmentEndIsoStr(r) >= today,
      )
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
    const declined = all
      .filter(
        (r) =>
          r.status === 'declined' && appointmentEndIsoStr(r) >= today,
      )
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
    return { pending, upcoming, declined };
  }, [rowsByUser, scope, today]);

  const otherPendingTotal = useMemo(() => {
    return members
      .filter((m) => Number(m.id) !== Number(user.id))
      .reduce((sum, m) => sum + (pendingCountByUser[Number(m.id)] || 0), 0);
  }, [members, pendingCountByUser, user.id]);

  const selectedScopeLabel = useMemo(() => {
    if (scope === 'mine') return 'You';
    const m = members.find((x) => Number(x.id) === Number(scope));
    return m ? adminDisplayNameFor(m) : 'Teammate';
  }, [scope, members]);

  // --- Rendering helpers ----------------------------------------------------

  const renderScopeOption = (m: CompanyMember | 'mine') => {
    const isMine = m === 'mine';
    const id = isMine ? user.id : (m as CompanyMember).id;
    const active = scope === (isMine ? 'mine' : id);
    const pending = isMine
      ? pendingCountByUser[Number(user.id)] || 0
      : pendingCountByUser[Number(id)] || 0;
    const name = isMine ? 'You' : adminDisplayNameFor(m as CompanyMember);
    const initials = isMine
      ? adminInitialsFor({
          first_name: user.firstName || '',
          last_name: user.lastName || '',
          email: user.email || '',
          id: user.id,
        })
      : adminInitialsFor(m as CompanyMember);
    return (
      <TouchableOpacity
        key={isMine ? 'mine' : id}
        style={[styles.adminReqScopeOption, active && styles.adminReqScopeOptionActive]}
        activeOpacity={0.88}
        onPress={() => {
          setScope(isMine ? 'mine' : id);
          setScopePickerOpen(false);
        }}
      >
        <View
          style={[
            styles.adminReqScopeAvatarCircle,
            isMine && styles.adminReqScopeAvatarCircleMe,
          ]}
        >
          <Text
            style={[
              styles.adminReqScopeInitials,
              isMine && styles.adminReqScopeInitialsMe,
            ]}
          >
            {initials}
          </Text>
        </View>
        <View style={styles.adminReqScopeMain}>
          <Text
            style={[
              styles.adminReqScopeName,
              active && styles.adminReqScopeNameActive,
              flexRowText,
            ]}
            numberOfLines={2}
          >
            {name}
          </Text>
          {!isMine && pending > 0 ? (
            <Text style={styles.adminReqScopeSub}>Needs review</Text>
          ) : (
            <Text style={styles.adminReqScopeSub}>
              {isMine ? 'Your calendar' : 'No pending requests'}
            </Text>
          )}
        </View>
        {pending > 0 ? (
          <View style={styles.adminReqScopeBadge}>
            <Text style={styles.adminReqScopeBadgeText}>{pending}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderRow = (
    row: AppointmentRow,
    opts: { canApprove: boolean; canDecline: boolean; canDelete: boolean },
  ) => {
    const isPending = row.status === 'requested';
    const isApproved = row.status === 'approved';
    const isDeclined = row.status === 'declined';
    const badgeStyle = isApproved
      ? styles.reqStatusCardBadgeApproved
      : isDeclined
        ? styles.reqStatusCardBadgeDeclined
        : styles.reqStatusCardBadgePending;
    const badgeTextStyle = isApproved
      ? styles.reqStatusCardBadgeTextApproved
      : isDeclined
        ? styles.reqStatusCardBadgeTextDeclined
        : styles.reqStatusCardBadgeTextPending;
    return (
      <View
        key={row.id}
        style={[styles.adminReqCard, isPending && styles.adminReqCardPending]}
      >
        <View style={styles.adminReqCardTop}>
          <Text style={styles.adminReqCardEmoji}>
            {categoryIconFor(row.category)}
          </Text>
          <View style={[styles.adminReqCardTitleWrap, flexRowTextSlot]}>
            <Text style={[styles.adminReqCardTitle, flexRowText]} numberOfLines={4}>
              {row.title}
            </Text>
            <Text style={[styles.adminReqCardMeta, flexRowText]} numberOfLines={4}>
              {formatAppointmentRangeTitle(row)}
              {(() => {
                const s = String(row.appointment_date).split('T')[0];
                const e = row.end_date && String(row.end_date).split('T')[0];
                if (row.time_mode === 'all_day' && e && e > s) return '';
                const tr = formatTimeRange(row);
                return tr ? `  ·  ${tr}` : '';
              })()}
            </Text>
          </View>
          <View style={[styles.adminReqCardBadge, badgeStyle]}>
            <RNText style={[styles.adminReqCardBadgeText, badgeTextStyle]}>
              {padAndroidText(
                isApproved ? 'Approved' : isDeclined ? 'Declined' : 'Pending',
              )}
            </RNText>
          </View>
        </View>
        {row.notes ? (
          <Text style={styles.adminReqCardNotes}>“{row.notes}”</Text>
        ) : null}
        {(opts.canApprove || opts.canDecline || opts.canDelete) && (
          <View style={styles.adminReqCardActions}>
            {opts.canApprove && (
              <TouchableOpacity
                style={[styles.adminReqActionBtn, styles.adminReqActionBtnApprove]}
                activeOpacity={0.9}
                onPress={() => approveRow(row)}
              >
                <Text
                  style={[
                    styles.adminReqActionBtnText,
                    styles.adminReqActionBtnTextApprove,
                  ]}
                >
                  Approve
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.adminReqActionBtn}
              activeOpacity={0.9}
              onPress={() => editCategory(row)}
            >
              <Text style={styles.adminReqActionBtnText}>Edit</Text>
            </TouchableOpacity>
            {opts.canDecline && (
              <TouchableOpacity
                style={[styles.adminReqActionBtn, styles.adminReqActionBtnDecline]}
                activeOpacity={0.9}
                onPress={() => declineRow(row)}
              >
                <Text
                  style={[
                    styles.adminReqActionBtnText,
                    styles.adminReqActionBtnTextDecline,
                  ]}
                >
                  Decline
                </Text>
              </TouchableOpacity>
            )}
            {opts.canDelete && !opts.canDecline && (
              <TouchableOpacity
                style={[styles.adminReqActionBtn, styles.adminReqActionBtnDecline]}
                activeOpacity={0.9}
                onPress={() => deleteRow(row)}
              >
                <Text
                  style={[
                    styles.adminReqActionBtnText,
                    styles.adminReqActionBtnTextDecline,
                  ]}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.adminReqScreen}>
      <View style={[styles.adminReqHeader, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.reqStatusBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.reqStatusBackBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.adminReqTitle}>Team requests</Text>
      </View>

      {/* Scope picker: defaults to "You", highlights pending across teammates. */}
      <View style={styles.adminReqScopeWrap}>
        <TouchableOpacity
          style={[
            styles.adminReqScopeTrigger,
            otherPendingTotal > 0 && styles.adminReqScopeTriggerUrgent,
          ]}
          activeOpacity={0.9}
          onPress={() => setScopePickerOpen((v) => !v)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.adminReqScopeLabel}>Viewing requests for</Text>
            <Text style={styles.adminReqScopeValue}>{selectedScopeLabel}</Text>
          </View>
          {otherPendingTotal > 0 ? (
            <View style={styles.adminReqScopeGlobalBadge}>
              <Text style={styles.adminReqScopeGlobalBadgeText}>
                {otherPendingTotal}
              </Text>
            </View>
          ) : null}
          <Text style={styles.adminReqScopeChevron}>
            {scopePickerOpen ? '▴' : '▾'}
          </Text>
        </TouchableOpacity>
        {scopePickerOpen ? (
          <View style={styles.adminReqScopeMenu}>
            <ScrollView
              style={{ maxHeight: 280 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.adminReqScopeMenuContent}
            >
              {renderScopeOption('mine')}
              {members
                .filter((m) => Number(m.id) !== Number(user.id))
                .map((m) => renderScopeOption(m))}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.adminReqList}
        contentContainerStyle={[
          styles.adminReqListContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? null : scope === 'mine' ? (
          mineRows.length === 0 ? (
            <View style={styles.adminReqEmpty}>
              <Text style={styles.adminReqEmptyTitle}>
                Nothing on your calendar
              </Text>
              <Text style={styles.adminReqEmptySubtitle}>
                Your own time off will show up here. Tap a teammate above to
                review their requests.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.adminReqPanelHeader}>
                <Text style={styles.adminReqPanelHeaderText}>
                  Your upcoming
                </Text>
              </View>
              {mineRows.map((row) =>
                renderRow(row, {
                  canApprove: false,
                  canDecline: false,
                  canDelete: true,
                }),
              )}
            </>
          )
        ) : (
          <>
            {selectedUserRows.pending.length === 0 &&
              selectedUserRows.upcoming.length === 0 &&
              selectedUserRows.declined.length === 0 && (
                <View style={styles.adminReqEmpty}>
                  <Text style={styles.adminReqEmptyTitle}>
                    No upcoming requests
                  </Text>
                  <Text style={styles.adminReqEmptySubtitle}>
                    This teammate has nothing coming up. You'll see new
                    requests here the moment they submit one.
                  </Text>
                </View>
              )}
            {selectedUserRows.pending.length > 0 && (
              <>
                <View style={styles.adminReqPanelHeader}>
                  <Text style={styles.adminReqPanelHeaderText}>
                    Waiting for you
                  </Text>
                </View>
                {selectedUserRows.pending.map((row) =>
                  renderRow(row, {
                    canApprove: true,
                    canDecline: true,
                    canDelete: false,
                  }),
                )}
              </>
            )}
            {selectedUserRows.upcoming.length > 0 && (
              <>
                <View style={styles.adminReqPanelHeader}>
                  <Text style={styles.adminReqPanelHeaderText}>Upcoming</Text>
                </View>
                {selectedUserRows.upcoming.map((row) =>
                  renderRow(row, {
                    canApprove: false,
                    canDecline: false,
                    canDelete: true,
                  }),
                )}
              </>
            )}
            {selectedUserRows.declined.length > 0 && (
              <>
                <View style={styles.adminReqPanelHeader}>
                  <Text style={styles.adminReqPanelHeaderText}>Declined</Text>
                </View>
                {selectedUserRows.declined.map((row) =>
                  renderRow(row, {
                    canApprove: true, // admin can still flip to approve
                    canDecline: false,
                    canDelete: true,
                  }),
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CalendarTab({ route }: any) {
  const { company, user } = route.params || {};
  const navigation = useNavigation<any>();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [monthJobs, setMonthJobs] = useState<{ [key: string]: number }>({});
  const [monthJobsWithStatus, setMonthJobsWithStatus] = useState<{ [key: string]: Array<{ status: string }> }>({});
  const [pendingRequestByDate, setPendingRequestByDate] = useState<{ [key: string]: boolean }>({});
  const [approvedFullDayByDate, setApprovedFullDayByDate] = useState<{ [key: string]: boolean }>({});
  const [approvedBadgeByDate, setApprovedBadgeByDate] = useState<{ [key: string]: string }>({});
  const [offWeekdays, setOffWeekdays] = useState<Set<number>>(new Set([0, 6]));
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);

  // Month banner images mapping (months are 0-indexed in JavaScript)
  const monthBanners: { [key: number]: any } = {
    0: require('./assets/images/jan.jpg'),   // January
    1: require('./assets/images/feb.jpg'),   // February
    2: require('./assets/images/mar.jpg'),   // March
    3: require('./assets/images/apr.jpg'),   // April
    4: require('./assets/images/maj.jpg'),   // May
    5: require('./assets/images/jun.jpg'),   // June
    6: require('./assets/images/jul.jpg'),   // July
    7: require('./assets/images/aug.jpg'),   // August
    8: require('./assets/images/sep.jpg'),   // September
    9: require('./assets/images/okt.jpg'),   // October
    10: require('./assets/images/nov.jpg'),  // November
    11: require('./assets/images/dec.jpg'),  // December
  };
  
  // Animation values for slide transition
  const slideAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const isAnimating = useRef(false);
  const currentDateRef = useRef(currentDate);
  
  // Keep ref in sync with state
  useEffect(() => {
    currentDateRef.current = currentDate;
  }, [currentDate]);
  
  // Swipe gesture handler for month navigation
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes when not animating
        if (isAnimating.current) return false;
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderGrant: () => {
        slideAnim.setOffset((slideAnim as any)._value || 0);
        slideAnim.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Constrain movement to screen width
        const maxDrag = screenWidth * 0.8;
        const constrainedDx = Math.max(-maxDrag, Math.min(maxDrag, gestureState.dx));
        slideAnim.setValue(constrainedDx);
      },
      onPanResponderRelease: (_, gestureState) => {
        slideAnim.flattenOffset();
        const swipeThreshold = 50; // Minimum swipe distance
        const velocityThreshold = 0.3; // Minimum swipe velocity
        const shouldSwipe = Math.abs(gestureState.dx) > swipeThreshold || Math.abs(gestureState.vx) > velocityThreshold;
        
        if (shouldSwipe && !isAnimating.current) {
          isAnimating.current = true;
          
          // Determine direction based on dx (displacement) primarily, velocity as secondary
          const isSwipeRight = gestureState.dx > 0;
          const isSwipeLeft = gestureState.dx < 0;
          
          if (isSwipeRight) {
            // Swipe right - go to previous month
            const dateToUse = currentDateRef.current; // Use ref to get current value
            Animated.timing(slideAnim, {
              toValue: screenWidth,
              duration: 300,
              useNativeDriver: true,
            }).start(() => {
              const newDate = new Date(dateToUse.getFullYear(), dateToUse.getMonth() - 1, 1);
              console.log('📅 Swiping right: from', dateToUse.getMonth() + 1, 'to', newDate.getMonth() + 1);
              setCurrentDate(newDate);
              // Wait for React to finish updating before sliding in
              InteractionManager.runAfterInteractions(() => {
                slideAnim.setValue(-screenWidth);
                Animated.timing(slideAnim, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }).start(() => {
                  isAnimating.current = false;
                });
              });
            });
          } else if (isSwipeLeft) {
            // Swipe left - go to next month
            const dateToUse = currentDateRef.current; // Use ref to get current value
            Animated.timing(slideAnim, {
              toValue: -screenWidth,
              duration: 300,
              useNativeDriver: true,
            }).start(() => {
              const newDate = new Date(dateToUse.getFullYear(), dateToUse.getMonth() + 1, 1);
              console.log('📅 Swiping left: from', dateToUse.getMonth() + 1, 'to', newDate.getMonth() + 1);
              setCurrentDate(newDate);
              // Wait for React to finish updating before sliding in
              InteractionManager.runAfterInteractions(() => {
                slideAnim.setValue(screenWidth);
                Animated.timing(slideAnim, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }).start(() => {
                  isAnimating.current = false;
                });
              });
            });
          } else {
            // No clear direction - snap back
            isAnimating.current = false;
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 50,
              friction: 7,
            }).start();
          }
        } else {
          // Snap back to center
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start(() => {
            isAnimating.current = false;
          });
        }
      },
    })
  ).current;
  
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  
  const getWorkDaysInMonth = (year: number, month: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workDays = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workDays++;
      }
    }
    return workDays;
  };
  
  const today = new Date();
  const currentMonthIndex = today.getMonth();
  const currentYear = today.getFullYear();
  
  const selectMonth = (monthIndex: number) => {
    const newDate = new Date(currentDate.getFullYear(), monthIndex, 1);
    setCurrentDate(newDate);
    setShowMonthSelector(false);
  };
  
  const changeYear = (direction: number) => {
    const newDate = new Date(currentDate.getFullYear() + direction, currentDate.getMonth(), 1);
    setCurrentDate(newDate);
  };

  useEffect(() => {
    if (user && user.id) {
      fetchMonthJobs();
    } else {
      console.log('⏳ Waiting for user data...', { user });
    }
  }, [currentDate, user?.id]);

  const fetchMonthJobs = async () => {
    console.log('📅 Starting to fetch month jobs...');
    console.log('👤 User:', user);
    
    if (!user) {
      console.log('❌ No user found, skipping job fetch');
      return;
    }
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      console.log('🎫 Token retrieved:', token ? 'Present' : 'Missing');
      
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      // Format dates as YYYY-MM-DD without timezone conversion issues
      const formatDateString = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      
      const startDate = formatDateString(firstDay);
      const endDate = formatDateString(lastDay);

      console.log('📅 Fetching jobs for:', { year, month: month + 1, startDate, endDate });
      console.log('🌐 API URL:', `${apiClient.defaults.baseURL}/jobs?start_date=${startDate}&end_date=${endDate}`);

      const [jobsRes, appointmentsRes, workHoursRes] = await Promise.all([
        apiClient.get(`/jobs?start_date=${startDate}&end_date=${endDate}`),
        apiClient.get(`/appointments?status=all`).catch(() => null),
        apiClient.get(`/work-hours/${user.id}`).catch(() => null),
      ]);
      const response = jobsRes;
      console.log('📦 API Response:', response);
      console.log('📦 Response status:', response.status);
      console.log('📦 Response data:', response.data);
      
      const allJobs = response.data.jobs || [];
      console.log('📋 Total jobs received:', allJobs.length);
      console.log('📋 Jobs data:', allJobs);
      
      // Filter jobs for logged-in user and track by date with status
      const jobsByDate: { [key: string]: number } = {};
      const jobsByDateWithStatus: { [key: string]: Array<{ status: string }> } = {};
      allJobs.forEach((job: Job) => {
        console.log('🔍 Checking job:', {
          id: job.id,
          assigned_user_id: job.assigned_user_id,
          user_id: user.id,
          scheduled_date: job.scheduled_date,
          status: job.status,
          scheduled_date_type: typeof job.scheduled_date,
          matches: job.assigned_user_id === user.id
        });
        
        // Check if job belongs to user (handle both number and string ID comparison)
        const jobUserId = job.assigned_user_id;
        const currentUserId = user.id;
        const userIdsMatch = jobUserId === currentUserId || 
                            String(jobUserId) === String(currentUserId) ||
                            Number(jobUserId) === Number(currentUserId);
        
        if (userIdsMatch && job.scheduled_date) {
          // Extract date string - just take the YYYY-MM-DD part without timezone conversion
          let dateKey: string;
          if (typeof job.scheduled_date === 'string') {
            // If string, just take the date part (YYYY-MM-DD) - don't parse as Date to avoid timezone shift
            dateKey = job.scheduled_date.split('T')[0].split(' ')[0];
            // Ensure it's in YYYY-MM-DD format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
              console.log('⚠️ Invalid date format:', job.scheduled_date, '→', dateKey);
              return;
            }
            
            jobsByDate[dateKey] = (jobsByDate[dateKey] || 0) + 1;
            if (!jobsByDateWithStatus[dateKey]) {
              jobsByDateWithStatus[dateKey] = [];
            }
            jobsByDateWithStatus[dateKey].push({ status: job.status || 'scheduled' });
            console.log('✅ Added job to date:', dateKey, 'Status:', job.status, 'Original date:', job.scheduled_date, 'Total for date:', jobsByDate[dateKey]);
          }
        } else {
          console.log('❌ Job not matched:', {
            userIdsMatch,
            hasScheduledDate: !!job.scheduled_date
          });
        }
      });
      
      console.log('📊 Jobs by date:', jobsByDate);
      console.log('📊 Jobs by date with status:', jobsByDateWithStatus);
      setMonthJobs(jobsByDate);
      setMonthJobsWithStatus(jobsByDateWithStatus);

      // Build appointment flags for month cells:
      // - pending => top-right orange dot
      // - approved => tiny badge
      // - approved all-day => striped day background
      const pendingByDate: { [key: string]: boolean } = {};
      const approvedFullByDate: { [key: string]: boolean } = {};
      const approvedLabelsByDate: { [key: string]: string } = {};
      const appointments = (appointmentsRes as any)?.data?.appointments || [];
      for (const a of appointments as AppointmentRow[]) {
        if (a.kind !== 'time_off') continue;
        if (Number(a.user_id) !== Number(user.id)) continue;
        const rangeStart = appointmentDateOnly(a.appointment_date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart)) continue;
        const rangeEnd = appointmentEndIsoStr(a);
        const lo = rangeStart > startDate ? rangeStart : startDate;
        const hi = rangeEnd < endDate ? rangeEnd : endDate;
        if (lo > hi) continue;

        if (a.status === 'requested') {
          forEachIsoDayInclusive(lo, hi, (iso) => {
            pendingByDate[iso] = true;
          });
          continue;
        }
        if (a.status === 'approved') {
          forEachIsoDayInclusive(lo, hi, (iso) => {
            if (!approvedLabelsByDate[iso]) {
              approvedLabelsByDate[iso] = shortCategoryLabel(a.category);
            }
            if (a.time_mode === 'all_day') {
              approvedFullByDate[iso] = true;
            }
          });
        }
      }
      setPendingRequestByDate(pendingByDate);
      setApprovedFullDayByDate(approvedFullByDate);
      setApprovedBadgeByDate(approvedLabelsByDate);

      // Treat weekdays with 0 configured hours as complete-off days.
      const wh = (workHoursRes as any)?.data?.workHours || null;
      const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const off = new Set<number>();
      for (let i = 0; i < weekdayKeys.length; i++) {
        const hours = Number(wh?.[`${weekdayKeys[i]}_hours`]);
        if (!Number.isFinite(hours) || hours <= 0) off.add(i);
      }
      setOffWeekdays(off.size ? off : new Set([0, 6]));
      console.log('✅ Month jobs state updated');
      console.log('📊 Final jobs by date object:', jobsByDate);
      console.log('📊 Number of days with jobs:', Object.keys(jobsByDate).length);
    } catch (error: any) {
      console.error('❌ Error fetching month jobs:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
      });
      
      // Show user-friendly error
      if (error.response) {
        console.error(`❌ API Error: ${error.response.status} - ${error.response.statusText}`);
        console.error(`❌ Error data:`, error.response.data);
      } else if (error.request) {
        console.error('❌ Network Error: No response received');
        console.error('❌ Request was made but no response. Is the API server running?');
      } else {
        console.error('❌ Request setup error:', error.message);
      }
      
      setMonthJobs({});
      setPendingRequestByDate({});
      setApprovedFullDayByDate({});
      setApprovedBadgeByDate({});
    }
  };
  
  /** English month name for the banner (locale formatting is separate from device UI language). */
  const getMonthName = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'long' });
  
  const getYear = (date: Date) => {
    return date.getFullYear();
  };
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Get day of week for first day (0 = Sunday, we want Monday = 0)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday becomes 6
    
    const days: (number | null)[] = [];
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    // Add empty cells to complete the last week
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    
    return days;
  };
  
  const days = getDaysInMonth(currentDate);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  
  const todayDate = new Date();
  const isCurrentMonth = todayDate.getMonth() === currentDate.getMonth() && todayDate.getFullYear() === currentDate.getFullYear();
  const currentDay = todayDate.getDate();

  if (showMonthSelector) {
    return (
      <View style={styles.calendarContainer}>
        {/* Year selector */}
        <View style={styles.yearSelectorRow}>
          <TouchableOpacity onPress={() => changeYear(-1)} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.yearSelectorText}>{currentDate.getFullYear()}</Text>
          <TouchableOpacity onPress={() => changeYear(1)} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>›</Text>
          </TouchableOpacity>
        </View>
        
        {/* Month list */}
        <FlatList
          data={months}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.monthListContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const isCurrentMonth = index === currentMonthIndex && currentDate.getFullYear() === currentYear;
            const workDays = getWorkDaysInMonth(currentDate.getFullYear(), index);
            
            return (
              <TouchableOpacity
                style={[
                  styles.monthCard,
                  isCurrentMonth && styles.monthCardActive
                ]}
                onPress={() => selectMonth(index)}
                activeOpacity={0.8}
              >
                <View style={styles.workDaysContainer}>
                  <Text style={[
                    styles.workDaysLabel,
                    isCurrentMonth && styles.workDaysLabelActive
                  ]}>
                    Work days
                  </Text>
                  <Text style={[
                    styles.workDaysNumber,
                    isCurrentMonth && styles.workDaysNumberActive
                  ]}>
                    {workDays}
                  </Text>
                </View>
                <Text style={[
                  styles.monthCardText,
                  isCurrentMonth && styles.monthCardTextActive
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.calendarContainer} {...panResponder.panHandlers}>
      {/* Month/Year Banner with Image - Clickable */}
      <TouchableOpacity 
        style={styles.calendarBanner}
        onPress={() => setShowMonthSelector(true)}
        activeOpacity={0.8}
      >
        <Image 
          source={monthBanners[currentDate.getMonth()]} 
          style={styles.calendarBannerImage}
          resizeMode="cover"
        />
        <View style={styles.calendarBannerOverlay}>
          <Text style={styles.calendarYear}>{getYear(currentDate)}</Text>
          <View style={styles.calendarMonthWrap}>
            <Text style={styles.calendarMonth} numberOfLines={1}>
              {getMonthName(currentDate)}
              {Platform.OS === 'android' ? '\u2009' : ''}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      
      {/* Week day headers */}
      <View style={styles.weekDaysRow}>
        {weekDays.map((day, index) => (
          <View key={index} style={styles.weekDayCell}>
            <Text style={styles.weekDayText}>{day}</Text>
          </View>
        ))}
      </View>
      
      {/* Calendar grid with slide animation */}
      <Animated.View 
        style={[
          styles.calendarGrid,
          {
            transform: [{ translateX: slideAnim }],
          }
        ]}
      >
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.calendarWeekRow}>
            {week.map((day, dayIndex) => {
              if (day === null) {
                return <View key={dayIndex} style={styles.calendarDayCell} />;
              }
              
              // Create date string without timezone conversion (use local date components)
              const year = currentDate.getFullYear();
              const month = currentDate.getMonth();
              const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayOfWeek = new Date(year, month, day).getDay(); // 0=Sun..6=Sat
              
              const jobCount = monthJobs[dateString] || 0;
              const jobsForDate = monthJobsWithStatus[dateString] || [];
              const hasPendingRequest = !!pendingRequestByDate[dateString];
              const approvedBadge = approvedBadgeByDate[dateString] || '';
              const isApprovedFullDay = !!approvedFullDayByDate[dateString];
              const isNoHoursDay = offWeekdays.has(dayOfWeek);
              const showStripedBackground = isNoHoursDay || isApprovedFullDay;
              
              // Group dots into rows of 5
              const dotsPerRow = 5;
              const dotRows: Array<Array<{ status: string }>> = [];
              for (let i = 0; i < jobsForDate.length; i += dotsPerRow) {
                dotRows.push(jobsForDate.slice(i, i + dotsPerRow));
              }

              return (
                <Pressable
                  key={dayIndex}
                  style={styles.calendarDayCell}
                  onPress={() => {
                    if (navigation && company && user) {
                      navigation.navigate('DayView', { date: dateString, company, user });
                    }
                  }}
                  onLongPress={() => {
                    if (navigation && company && user) {
                      setQuickAddDate(dateString);
                    }
                  }}
                  delayLongPress={380}
                >
                  {showStripedBackground && (
                    <View pointerEvents="none" style={styles.calendarDayStripeLayer}>
                      {Array.from({ length: 11 }).map((_, i) => (
                        <View key={`stripe-${i}`} style={[styles.calendarDayStripe, { left: -26 + i * 13 }]} />
                      ))}
                      <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.92)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.calendarDayStripeFade}
                      />
                    </View>
                  )}
                  <View style={styles.calendarDayContent}>
                    <Text style={[
                      styles.calendarDayText,
                      isCurrentMonth && day === currentDay && styles.calendarDayTextCurrent
                    ]}>
                      {day}
                    </Text>

                    {!!approvedBadge && (
                      <View style={styles.calendarApptBadge}>
                        <Text
                          style={styles.calendarApptBadgeText}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.78}
                        >
                          {approvedBadge}
                        </Text>
                      </View>
                    )}
                    
                    {/* Job dots */}
                    {jobCount > 0 && (
                      <View style={styles.jobDotsContainer}>
                        {dotRows.map((row, rowIndex) => (
                          <View key={rowIndex} style={styles.jobDotsRow}>
                            {row.map((job, dotIndex) => {
                              const isCompleted = job.status === 'completed';
                              const isSubCompleted = job.status === 'sub_completed';
                              const isCancelled = job.status === 'cancelled';
                              return (
                                <View
                                  key={dotIndex}
                                  style={[
                                    styles.jobDot,
                                    isCompleted && styles.jobDotCompleted,
                                    isSubCompleted && styles.jobDotSubCompleted,
                                    isCancelled && styles.jobDotCancelled,
                                  ]}
                                />
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  
                  {/* Today indicator at bottom */}
                  {isCurrentMonth && day === currentDay && (
                    <View style={styles.currentDayIndicator} />
                  )}
                  {hasPendingRequest && <View style={styles.calendarPendingDot} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.View>

      <Modal
        visible={!!quickAddDate}
        transparent
        animationType="fade"
        onRequestClose={() => setQuickAddDate(null)}
      >
        <Pressable
          style={styles.calendarQuickAddOverlay}
          onPress={() => setQuickAddDate(null)}
        >
          <Pressable style={styles.calendarQuickAddCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.calendarQuickAddTitle}>
              {quickAddDate ? padAndroidText(quickAddDate) : ''}
            </Text>
            <TouchableOpacity
              style={styles.calendarQuickAddRow}
              activeOpacity={0.85}
              onPress={() => {
                const d = quickAddDate;
                setQuickAddDate(null);
                if (!d || !company || !user) return;
                (navigation as any).navigate?.('JobCompose', {
                  company,
                  user,
                  scheduledDate: d,
                });
              }}
            >
              <RNText style={styles.calendarQuickAddRowText}>{padAndroidText('Add job')}</RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarQuickAddRow}
              activeOpacity={0.85}
              onPress={() => {
                const d = quickAddDate;
                setQuickAddDate(null);
                if (!d || !company || !user) return;
                (navigation as any).navigate?.('DayView', {
                  date: d,
                  company,
                  user,
                  openAppointmentComposer: true,
                });
              }}
            >
              <RNText style={styles.calendarQuickAddRowText}>
                {padAndroidText('Add appointment')}
              </RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarQuickAddCancel}
              onPress={() => setQuickAddDate(null)}
              activeOpacity={0.8}
            >
              <RNText style={styles.calendarQuickAddCancelText}>{padAndroidText('Cancel')}</RNText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      
      {/* Jump calendar to today's date (same month view as device today). */}
      <TouchableOpacity
        style={styles.thisMonthButton}
        onPress={() => {
          setCurrentDate(new Date());
        }}
        activeOpacity={0.7}
      >
        <RNText style={styles.thisMonthButtonText}>{padAndroidText('Show today')}</RNText>
      </TouchableOpacity>
    </View>
  );
}

// -------------------------------------------------------------------
// WeekSelector: horizontal strip of the 7 days of the week containing
// `selectedDate`. Tap a day to jump to it. Swipe left/right on the
// strip to change weeks with a carousel-style animation; the new week
// keeps the same weekday selected (so swiping left on a Monday lands
// on the next Monday), which matches common calendar-app behaviour.
// -------------------------------------------------------------------
function WeekSelector({
  selectedDate,
  onSelectDate,
  jobsByDate,
  containerStyle,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  jobsByDate?: { [iso: string]: Array<{ status: string }> };
  containerStyle?: object;
}) {
  const screenWidth = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimatingRef = useRef(false);

  const parts = selectedDate.split('-').map(Number);
  const selected = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const weekStart = new Date(selected);
  const dow = selected.getDay(); // Sun=0..Sat=6
  const shiftToMon = dow === 0 ? -6 : 1 - dow;
  weekStart.setDate(selected.getDate() + shiftToMon);

  const todayISO = toISO(new Date());
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const iso = toISO(d);
    return {
      iso,
      num: d.getDate(),
      label: labels[i],
      isToday: iso === todayISO,
      isSelected: iso === selectedDate,
    };
  });

  // Stored in a ref so the PanResponder (created once) always sees the
  // latest `selected` date / callback, not a stale closure.
  const shiftWeekRef = useRef((direction: 1 | -1) => {});
  shiftWeekRef.current = (direction: 1 | -1) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    Animated.timing(translateX, {
      toValue: -direction * screenWidth * 0.6,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      const next = new Date(selected);
      next.setDate(selected.getDate() + direction * 7);
      onSelectDate(toISO(next));
      translateX.setValue(direction * screenWidth * 0.6);
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }).start(() => {
        isAnimatingRef.current = false;
      });
    });
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        if (!isAnimatingRef.current) {
          // Rubber-band the drag so it always feels responsive but the
          // pills don't fly offscreen — the carousel snap handles the
          // rest on release.
          translateX.setValue(g.dx * 0.75);
        }
      },
      onPanResponderRelease: (_, g) => {
        const threshold = screenWidth * 0.18;
        if (g.dx < -threshold || g.vx < -0.4) {
          shiftWeekRef.current(1);
        } else if (g.dx > threshold || g.vx > 0.4) {
          shiftWeekRef.current(-1);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View
      style={[styles.weekSelectorContainer, containerStyle]}
      {...pan.panHandlers}
    >
      <Animated.View
        style={[styles.weekSelectorRow, { transform: [{ translateX }] }]}
      >
        {days.map((day) => {
          const dayJobs = (jobsByDate && jobsByDate[day.iso]) || [];
          const visibleJobs = dayJobs.slice(0, 5);
          return (
            <TouchableOpacity
              key={day.iso}
              style={[
                styles.weekSelectorDay,
                day.isSelected && styles.weekSelectorDaySelected,
              ]}
              onPress={() => {
                if (!day.isSelected) onSelectDate(day.iso);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.weekSelectorDayLabel,
                  day.isSelected && styles.weekSelectorDayLabelSelected,
                ]}
              >
                {day.label}
              </Text>
              <Text
                style={[
                  styles.weekSelectorDayNum,
                  day.isSelected && styles.weekSelectorDayNumSelected,
                ]}
              >
                {day.num}
              </Text>
              {/* Fixed-height slot so pills stay aligned whether we show
                  job dots, a "today" indicator, or nothing. */}
              <View style={styles.weekSelectorBottomSlot}>
                {visibleJobs.length > 0 ? (
                  <View style={styles.weekSelectorDotsRow}>
                    {visibleJobs.map((job, idx) => {
                      const status = job.status;
                      const colorStyle = day.isSelected
                        ? status === 'completed'
                          ? styles.weekSelectorDotSelCompleted
                          : status === 'sub_completed'
                          ? styles.weekSelectorDotSelSubCompleted
                          : status === 'cancelled'
                          ? styles.weekSelectorDotSelCancelled
                          : styles.weekSelectorDotSelDefault
                        : status === 'completed'
                        ? styles.weekSelectorDotCompleted
                        : status === 'sub_completed'
                        ? styles.weekSelectorDotSubCompleted
                        : status === 'cancelled'
                        ? styles.weekSelectorDotCancelled
                        : styles.weekSelectorDotDefault;
                      return (
                        <View
                          key={idx}
                          style={[styles.weekSelectorJobDot, colorStyle]}
                        />
                      );
                    })}
                  </View>
                ) : day.isToday && !day.isSelected ? (
                  <View style={styles.weekSelectorTodayDot} />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </View>
  );
}

function TodayTab({ route }: any) {
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  // Used below to hide the Tab navigator's bottom tab bar while the
  // job slideout is open. Without this the sticky "Complete" bar sits
  // 80px above the real screen bottom — workers perceive it as
  // missing because it's not in their thumb zone.
  const navigation = useNavigation<any>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [approvedTimeOff, setApprovedTimeOff] = useState<AppointmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = useState(new Animated.Value(0))[0];

  // Handoff flow state. `handoffVisible` drives the slide-up and
  // `handoffData` holds the payload (previous job, next job, drive
  // time) returned from /jobs/:id/handoff. The two *Busy flags keep
  // the buttons locked while their respective network calls run.
  const [handoffVisible, setHandoffVisible] = useState(false);
  const [handoffData, setHandoffData] = useState<HandoffResponse | null>(null);
  const [isCompletingJob, setIsCompletingJob] = useState(false);
  const [isStartingJob, setIsStartingJob] = useState(false);

  // Month banner images mapping (months are 0-indexed in JavaScript)
  const monthBanners: { [key: number]: any } = {
    0: require('./assets/images/jan.jpg'),   // January
    1: require('./assets/images/feb.jpg'),   // February
    2: require('./assets/images/mar.jpg'),   // March
    3: require('./assets/images/apr.jpg'),   // April
    4: require('./assets/images/maj.jpg'),   // May
    5: require('./assets/images/jun.jpg'),   // June
    6: require('./assets/images/jul.jpg'),   // July
    7: require('./assets/images/aug.jpg'),   // August
    8: require('./assets/images/sep.jpg'),   // September
    9: require('./assets/images/okt.jpg'),   // October
    10: require('./assets/images/nov.jpg'),  // November
    11: require('./assets/images/dec.jpg'),  // December
  };
  
  const screenHeight = Dimensions.get('window').height;
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Bottom-sheet snap points (absolute y of sheet's top edge).
  // Modern single-state sheet: opens fully (top of screen) or closed
  // (off bottom). No halfway peek - cleaner, more decisive UX.
  const SNAP_EXPANDED_Y = 0;
  const SNAP_CLOSED_Y = screenHeight;

  const popupTranslateY = useRef(new Animated.Value(SNAP_CLOSED_Y)).current;
  const currentSnapRef = useRef<number>(SNAP_CLOSED_Y);
  const dragStartY = useRef<number>(SNAP_CLOSED_Y);
  // Gesture delta at the moment the PanResponder took over. Without
  // this offset the panel would visibly jump by that amount.
  const grantDy = useRef(0);
  const [isExpanded, setIsExpanded] = useState(false);
  // Measured height of the rendered panel content. Used to compute how
  // far up the user can drag: the panel may be pulled up until its
  // bottom aligns with the bottom of the screen.
  const [contentHeight, setContentHeight] = useState<number>(screenHeight);
  const contentHeightRef = useRef<number>(screenHeight);

  // Minimum translateY (most negative = panel pulled furthest up).
  // When content is taller than the screen, this lets the user pull
  // up so the content's bottom lands on the screen's bottom edge.
  const getMinY = () => Math.min(0, screenHeight - contentHeightRef.current);

  // Snappy modern spring - tighter than a bouncy iOS sheet, but with a
  // hint of overshoot so the open feels lively rather than mechanical.
  const SHEET_SPRING = {
    useNativeDriver: true,
    stiffness: 360,
    damping: 32,
    mass: 0.85,
    overshootClamping: false,
    restDisplacementThreshold: 0.5,
    restSpeedThreshold: 0.5,
  } as const;

  const animateSheetTo = (target: number, onFinished?: () => void) => {
    currentSnapRef.current = target;
    Animated.spring(popupTranslateY, {
      ...SHEET_SPRING,
      toValue: target,
    }).start(({ finished }) => {
      if (finished) onFinished?.();
    });
  };

  // Closing is intentionally NOT a spring. Users want it gone fast -
  // a single, smooth motion straight off the bottom of the screen
  // with no overshoot or settle.
  const SHEET_CLOSE_DURATION = 240;
  const closeSheet = () => {
    currentSnapRef.current = SNAP_CLOSED_Y;
    Animated.timing(popupTranslateY, {
      toValue: SNAP_CLOSED_Y,
      duration: SHEET_CLOSE_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsPopupVisible(false);
        setSelectedJob(null);
      }
    });
  };

  // Drag-synced values used for smooth header padding + corner
  // flattening as the sheet approaches the top of the screen. These
  // are plain React state (not Animated) because React Native's
  // Animated style validator rejects `paddingTop` for Animated.View
  // even when the backing value is JS-driven - it throws a native-
  // animated-module warning on every frame. A listener on the
  // Track isExpanded for the header insets padding.
  useEffect(() => {
    const id = popupTranslateY.addListener(({ value }) => {
      const expanded = value <= 40;
      setIsExpanded(prev => (prev !== expanded ? expanded : prev));
    });
    return () => { popupTranslateY.removeListener(id); };
  }, []);

  // Hide the bottom tab bar while the slideout is open so the
  // sticky "Complete" button docks at the real screen bottom,
  // in the thumb zone. IMPORTANT: call setOptions on the CURRENT
  // navigation object (the tab navigator), NOT getParent() - the
  // parent is the stack that wraps CompanyTabsScreen and setting
  // tabBarStyle there silently does nothing.
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: isPopupVisible
        ? { display: 'none' as const }
        : styles.tabBar,
    });
    return () => {
      navigation.setOptions({ tabBarStyle: styles.tabBar });
    };
  }, [isPopupVisible, navigation]);

  // The sheet is treated as a single draggable panel. No snapping in
  // the middle - wherever you release, it stays. The only automatic
  // motion is closing when the panel is dragged almost entirely off
  // the bottom of the screen (or flicked hard downward).
  const sheetOnGrant = (_: any, g: any) => {
    popupTranslateY.stopAnimation((v: number) => {
      dragStartY.current = v;
    });
    dragStartY.current = currentSnapRef.current;
    grantDy.current = g.dy;
  };

  // Simple free-movement: clamp to content bounds only.
  const sheetOnMove = (_: any, g: any) => {
    const next = dragStartY.current + (g.dy - grantDy.current);
    const clamped = Math.max(getMinY(), Math.min(SNAP_CLOSED_Y, next));
    popupTranslateY.setValue(clamped);
    currentSnapRef.current = clamped;
  };

  // Momentum projection factor (px per px/ms velocity unit).
  const DECAY_FACTOR = 333;
  const TOP_SNAP_Y = 0;

  const sheetOnRelease = (_: any, g: any) => {
    const raw = dragStartY.current + (g.dy - grantDy.current);
    const minY = getMinY();
    const vy = g.vy;
    const projected = raw + vy * DECAY_FACTOR;

    // Never overscroll past content bottom.
    if (projected < minY) {
      currentSnapRef.current = minY;
      Animated.spring(popupTranslateY, {
        ...SHEET_SPRING, velocity: vy, toValue: minY,
      }).start();
      return;
    }

    // Dismiss thresholds: a clear downward fling, OR the user has
    // dragged the sheet's top below ~22% of the screen. Otherwise
    // spring back to fully expanded - no halfway resting state.
    const dismissY = screenHeight * 0.22;
    if (vy > 0.7 || projected > dismissY) {
      closeSheet();
      return;
    }

    // Otherwise, snap right back to the top (fully expanded). If the
    // user pulled the panel UP past the screen edge to read more
    // content, settle wherever the projection lands, but never below
    // the top snap.
    const target = Math.max(minY, Math.min(TOP_SNAP_Y, projected));
    currentSnapRef.current = target;
    Animated.spring(popupTranslateY, {
      ...SHEET_SPRING, velocity: vy, toValue: target,
    }).start();
  };

  // Single pan responder. The whole panel is draggable from any
  // point on its surface - it's a "move" gesture, not a scroll.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        return Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 4;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: sheetOnGrant,
      onPanResponderMove: sheetOnMove,
      onPanResponderRelease: sheetOnRelease,
      onPanResponderTerminate: sheetOnRelease,
    })
  ).current;

  useEffect(() => {
    fetchTodayJobs();
  }, []);

  // Week-wide job map used to render status dots in the WeekSelector.
  // Refreshes whenever `jobs` changes so dots stay in sync with
  // in-place status updates (complete / cancel / etc.).
  const [weekJobsByDate, setWeekJobsByDate] = useState<{ [iso: string]: Array<{ status: string }> }>({});
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const parts = todayString.split('-').map(Number);
        const sel = new Date(parts[0], parts[1] - 1, parts[2]);
        const dow = sel.getDay();
        const weekStart = new Date(sel);
        weekStart.setDate(sel.getDate() + (dow === 0 ? -6 : 1 - dow));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const toISO = (d: Date) =>
          `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const wk0 = toISO(weekStart);
        const wk1 = toISO(weekEnd);
        const [jobsRes, apptRes] = await Promise.all([
          apiClient.get(`/jobs?start_date=${wk0}&end_date=${wk1}`),
          apiClient.get('/appointments?status=all').catch(() => null),
        ]);
        const allJobs = jobsRes.data?.jobs || [];
        const userJobs = allJobs.filter((j: any) => j.assigned_user_id === user?.id);
        const byDate: { [k: string]: Array<{ status: string }> } = {};
        for (const job of userJobs) {
          if (!job.scheduled_date) continue;
          const key = String(job.scheduled_date).split('T')[0].split(' ')[0];
          if (!byDate[key]) byDate[key] = [];
          byDate[key].push({ status: job.status || 'scheduled' });
        }
        const appointments = (apptRes as any)?.data?.appointments || [];
        for (const a of appointments as AppointmentRow[]) {
          if (a.kind !== 'time_off') continue;
          if (Number(a.user_id) !== Number(user?.id)) continue;
          if (a.status !== 'approved' && a.status !== 'requested') continue;
          const s = appointmentDateOnly(a.appointment_date);
          const e = appointmentEndIsoStr(a);
          const lo = s > wk0 ? s : wk0;
          const hi = e < wk1 ? e : wk1;
          if (lo > hi) continue;
          forEachIsoDayInclusive(lo, hi, (iso) => {
            if (!byDate[iso]) byDate[iso] = [];
            byDate[iso].push({ status: 'time_off' });
          });
        }
        if (!cancelled) setWeekJobsByDate(byDate);
      } catch (e) {
        console.warn('Failed to fetch week jobs', e);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [todayString, jobs, user?.id]);

  // Fixed start/end locations that frame the day's job list. Resolves
  // once per user since addresses are configured per (user, company),
  // not per day.
  const [routeStart, setRouteStart] = useState<string | null>(null);
  const [routeEnd, setRouteEnd] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      const token = await AsyncStorage.getItem('authToken');
      if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const res = await fetchRouteLocations(user.id);
      if (cancelled) return;
      setRouteStart(res.startAddress);
      setRouteEnd(res.endAddress);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleToggleJobCompletion = async (job: Job, e?: any) => {
    if (e) {
      e.stopPropagation();
    }

    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      // "sub_completed" means some tasks completed, some cancelled:
      // the check is shown filled so another tap moves the whole job
      // back to scheduled (same as the web app's behavior).
      const wasCompleted = job.status === 'completed' || job.status === 'sub_completed';
      const newStatus: JobStatus = wasCompleted ? 'scheduled' : 'completed';

      await apiClient.put(`/jobs/${job.id}/status`, {
        status: newStatus,
      });

      setJobs(prevJobs =>
        prevJobs.map(j => j.id === job.id ? { ...j, status: newStatus } : j)
      );

      if (selectedJob && selectedJob.id === job.id) {
        setSelectedJob({ ...selectedJob, status: newStatus });
      }
    } catch (error: any) {
      console.error('Error toggling job completion:', error);
      Alert.alert('Error', 'Failed to update job status. Please try again.');
    }
  };

  useEffect(() => {
    if (isPopupVisible) {
      popupTranslateY.setValue(SNAP_CLOSED_Y);
      currentSnapRef.current = SNAP_CLOSED_Y;
      animateSheetTo(SNAP_EXPANDED_Y);
    }
  }, [isPopupVisible]);

  const closePopup = () => {
    closeSheet();
  };

  const handleJobPress = (job: Job) => {
    console.log('🔵 Job pressed:', job.id);
    setSelectedJob(job);
    setIsPopupVisible(true);
    console.log('🔵 isPopupVisible set to true');
  };

  // Main "Complete" CTA on the sticky bottom bar. Finishes every task
  // that isn't already completed/cancelled, then fetches the handoff
  // payload and slides up the next-job sheet.
  const handleCompleteJob = async () => {
    if (!selectedJob || isCompletingJob) return;
    setIsCompletingJob(true);
    try {
      const { updatedJob, handoff } = await runCompleteAndHandoff(selectedJob);
      if (updatedJob) {
        setSelectedJob(updatedJob);
        setJobs((prev) =>
          prev.map((j) => (j.id === updatedJob.id ? { ...j, ...updatedJob } : j))
        );
      }
      setHandoffData(handoff);
      setHandoffVisible(true);
    } catch (e: any) {
      console.error('Error completing job', e?.response?.data || e.message);
      Alert.alert('Error', 'Could not complete this job. Please try again.');
    } finally {
      setIsCompletingJob(false);
    }
  };

  // "Start job" CTA on the handoff sheet. Fires /start for the next
  // job (optionally sending the on-the-way email), slides everything
  // out of the way and opens the next job's sheet.
  const handleStartNextJob = async (notify: boolean) => {
    const next = handoffData?.next;
    if (!next || isStartingJob) return;
    setIsStartingJob(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      await apiClient.post(`/jobs/${next.id}/start`, {
        notify_customer: !!notify,
      });

      // Resolve the full Job for the next card. Prefer the in-memory
      // list (keeps scroll-pos, avoids a spinner) and fall back to an
      // on-demand fetch when the next job is on a different day we
      // haven't loaded yet.
      let fullNext: Job | null =
        jobs.find((j) => j.id === next.id) || null;
      if (!fullNext) {
        try {
          const r = await apiClient.get(`/jobs/${next.id}`);
          fullNext = r.data?.job || null;
        } catch (e) {
          console.warn('Could not fetch next job details', e);
        }
      }

      // Animate both sheets away, then swap in the next job.
      setHandoffVisible(false);
      closeSheet();

      if (fullNext) {
        setTimeout(() => {
          setSelectedJob(fullNext);
          setIsPopupVisible(true);
        }, 320);
      }
    } catch (e: any) {
      console.error('Error starting next job', e?.response?.data || e.message);
      Alert.alert('Error', 'Could not start the next job. Please try again.');
    } finally {
      setIsStartingJob(false);
    }
  };

  const fetchTodayJobs = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const todayString = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

      const [jobsRes, apptRes] = await Promise.all([
        apiClient.get(`/jobs?start_date=${todayString}&end_date=${todayString}`),
        apiClient.get('/appointments?status=all').catch(() => null),
      ]);
      const allJobs = jobsRes.data.jobs || [];
      
      // Filter jobs for the logged-in user only
      const userJobs = allJobs.filter((job: Job) => job.assigned_user_id === user.id);
      
      setJobs(userJobs);
      const approvedRows: AppointmentRow[] = ((apptRes as any)?.data?.appointments || []).filter(
        (a: AppointmentRow) =>
          a.kind === 'time_off' &&
          Number(a.user_id) === Number(user.id) &&
          (a.status === 'approved' || a.status === 'requested') &&
          appointmentCoversLocalDay(todayString, a),
      );
      approvedRows.sort((a, b) => {
        if (a.status === b.status) return a.id - b.id;
        return a.status === 'requested' ? -1 : 1;
      });
      setApprovedTimeOff(approvedRows);
    } catch (error: any) {
      console.error('Error fetching today jobs:', error);
      Alert.alert('Error', 'Failed to load today\'s jobs');
    } finally {
      setIsLoading(false);
    }
  };


  const handleCopy = (text: string) => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const formatTime = (timeFrom?: string, timeTo?: string) =>
    formatJobTimeWindow(timeFrom, timeTo);

  if (isLoading) {
    return (
      <View style={styles.dayViewContainer}>
        <View style={styles.dayViewLoading}>
          <Text style={styles.loadingText}>Loading today's jobs...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dayViewContainer}>
      {/* Header */}
      <View style={styles.dayViewHeader}>
        <Image 
          source={monthBanners[today.getMonth()]} 
          style={styles.dayViewHeaderImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(61, 213, 122, 0.6)', 'rgba(61, 213, 122, 1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.dayViewHeaderOverlay}
          pointerEvents="box-none"
        >
          <View style={styles.dayViewHeaderContent}>
            <View style={styles.dayViewHeaderLeft}>
              <Text style={styles.dayViewDayName} numberOfLines={2} adjustsFontSizeToFit>
                Today
              </Text>
              <Text style={styles.dayViewDate} numberOfLines={2}>
                {today.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Jobs List */}
      <View style={styles.dayViewJobsWrapper}>
        <WeekSelector
          selectedDate={todayString}
          jobsByDate={weekJobsByDate}
          onSelectDate={(iso) => {
            if (iso === todayString) return;
            navigation.navigate('DayView', { date: iso, company, user });
          }}
        />
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.dayViewJobsList}
          renderItem={({ item }) => {
            const clientName = `${item.name || ''} ${item.last_name || ''}`.trim();
            const address = item.address ? `${item.address}${item.zip_code && item.city ? ' • ' : ''}${item.zip_code || ''} ${item.city || ''}`.trim() : '';
            const timeRange = formatTime(item.scheduled_time_from, item.scheduled_time_to);
            const durationMinutes = (item.estimated_duration && item.estimated_duration > 0)
              ? item.estimated_duration
              : (item.total_duration || 0);
            const duration = formatJobListDurationMinutes(durationMinutes);
            const isCompleted = item.status === 'completed';
            const isSubCompleted = item.status === 'sub_completed';
            const isCancelled = item.status === 'cancelled';
            const taskCount = item.all_service_count ?? item.service_count ?? 0;
            const mutedIconColor = isCompleted
              ? '#5BA878'
              : isSubCompleted
                ? '#B45309'
                : isCancelled
                  ? '#B08383'
                  : '#64748B';

            return (
              <TouchableOpacity
                style={[
                  styles.jobCard,
                  isCompleted && styles.jobCardCompleted,
                  isSubCompleted && styles.jobCardSubCompleted,
                  isCancelled && styles.jobCardCancelled,
                ]}
                activeOpacity={0.7}
                onPress={() => handleJobPress(item)}
              >
                <Text style={styles.jobCardClientName}>{clientName || 'Unknown Client'}</Text>

                {address && (
                  <Text style={styles.jobCardAddress}>{address}</Text>
                )}

                {timeRange && (
                  <View style={styles.jobCardTimeRow}>
                    <View style={styles.jobCardTimeIconWrap}>
                      <CardClockIcon color={mutedIconColor} />
                    </View>
                    <Text style={styles.jobCardTime}>{timeRange}</Text>
                  </View>
                )}

                <View style={styles.jobCardSeparator} />

                <View style={styles.jobCardBar}>
                  <View style={styles.jobCardBarLeft}>
                    <View style={styles.jobCardBarIconWrap}>
                      <CardTasksIcon color={mutedIconColor} />
                    </View>
                    <Text
                      style={styles.jobCardBarTaskText}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {taskCount} task{taskCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {duration && (
                    <View style={styles.jobCardBarRight}>
                      <View style={styles.jobCardBarIconWrap}>
                        <CardDurationIcon color={mutedIconColor} />
                      </View>
                      <Text style={styles.jobCardBarDurationText}>{duration}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.jobCardCheckbox}
                    onPress={(e) => handleToggleJobCompletion(item, e)}
                    activeOpacity={0.7}
                  >
                    {isCompleted ? (
                      <View style={styles.jobCardCheckboxChecked}>
                        <Text style={styles.jobCardCheckmark}>✓</Text>
                      </View>
                    ) : isSubCompleted ? (
                      <View style={styles.jobCardCheckboxSubCompleted}>
                        <Text style={styles.jobCardCheckmark}>✓</Text>
                      </View>
                    ) : isCancelled ? (
                      <View style={styles.jobCardCheckboxCancelled}>
                        <Text style={styles.jobCardCheckmarkCancelled}>✕</Text>
                      </View>
                    ) : (
                      <View style={styles.jobCardCheckboxUnchecked}>
                        <Text style={styles.jobCardCheckmarkUnchecked}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListHeaderComponent={
            jobs.length > 0 ? (
              <View>
                {approvedTimeOff.map((row) => (
                  <DayAppointmentRow key={`today-appt-${row.id}`} row={row} />
                ))}
                {routeStart ? <RouteStopRow type="start" address={routeStart} /> : null}
              </View>
            ) : null
          }
          ListFooterComponent={
            jobs.length > 0 && routeEnd ? (
              <RouteStopRow type="end" address={routeEnd} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.dayViewEmpty}>
              <Text style={styles.dayViewEmptyText}>No jobs scheduled for today</Text>
            </View>
          }
        />
      </View>

      {/* Job detail sheet - hosted in a transparent Modal so it
          always renders above the rest of the app, including the tab
          bar, with a clean status-bar-translucent backdrop. The sheet
          opens directly to the fully expanded state - no halfway
          peek. Drag down or tap the dimmed backdrop to dismiss. */}
      <Modal
        visible={isPopupVisible}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={closePopup}
      >
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.sheetBackdrop,
              {
                opacity: popupTranslateY.interpolate({
                  inputRange: [0, SNAP_CLOSED_Y],
                  outputRange: [0.55, 0],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            <TouchableWithoutFeedback onPress={closePopup}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          </Animated.View>

          {selectedJob && (
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.sheetSurface,
                {
                  height: Math.max(screenHeight + 300, contentHeight + 60),
                  transform: [{ translateY: popupTranslateY }],
                },
              ]}
            >
              <View
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  if (h > 0 && Math.abs(h - contentHeightRef.current) > 1) {
                    contentHeightRef.current = h;
                    setContentHeight(h);
                  }
                }}
              >
                <JobDetailSlideout
                  job={selectedJob}
                  date={todayString}
                  company={company}
                  onClose={closePopup}
                  onCopy={handleCopy}
                  isExpanded={isExpanded}
                  onJobUpdate={(updatedJob) => {
                    setSelectedJob(updatedJob);
                    setJobs(prevJobs =>
                      prevJobs.map(j => j.id === updatedJob.id ? updatedJob : j)
                    );
                  }}
                  onJobDeleted={(jobId) => {
                    setJobs((prev) => prev.filter((j) => j.id !== jobId));
                  }}
                />
              </View>
            </Animated.View>
          )}

          {/* Sticky thumb-zone "Complete" button. Lives outside the
              draggable panel so it's always within thumb reach, no
              matter how far up the sheet is pulled. */}
          <StickyCompleteBar
            visible={isPopupVisible && !handoffVisible}
            job={selectedJob}
            insetsBottom={insets.bottom}
            onPress={handleCompleteJob}
            isBusy={isCompletingJob}
          />

          {/* Next-job handoff sheet - slides up over the job sheet
              after "Complete" is tapped. Stays inside the modal so
              it inherits the fullscreen stacking context. */}
          <HandoffSheet
            visible={handoffVisible}
            data={handoffData}
            onClose={() => setHandoffVisible(false)}
            onStart={handleStartNextJob}
            isStarting={isStartingJob}
          />
        </View>
      </Modal>

      {/* Toast Notification */}
      {toastVisible && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>Copied to clipboard</Text>
        </Animated.View>
      )}
    </View>
  );
}

// Open a street address in whichever map app the device prefers. We
// try the cross-platform geo: / apple-maps URL first and fall back to
// Google Maps which is universally available.
const openInMaps = (address?: string | null) => {
  if (!address) return;
  const encoded = encodeURIComponent(address);
  const primary = Platform.select({
    ios: `http://maps.apple.com/?q=${encoded}`,
    android: `geo:0,0?q=${encoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  })!;
  const fallback = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  Linking.openURL(primary).catch(() => {
    Linking.openURL(fallback).catch(() => {
      /* ignore - nothing else we can do */
    });
  });
};

// Mini arrow glyph used on inline action rows.
const ArrowRightIcon = ({ color = '#193434' }: { color?: string }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12h14M13 5l7 7-7 7"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ChevronLeftIcon = ({ color = '#193434', size = 22 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M15 18l-6-6 6-6"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// Colour tokens for the job status pill. Mirrors the web app's
// computeStatusMeta so the language and palette stay consistent.
const getJobStatusMeta = (
  status: JobStatus | string | undefined
): { label: string; bg: string; fg: string; border: string } | null => {
  switch (status) {
    case 'completed':
      return { label: 'Completed', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' };
    case 'sub_completed':
      return { label: 'Sub completed', bg: '#FFFBEB', fg: '#B45309', border: '#FCD34D' };
    case 'cancelled':
      return { label: 'Cancelled', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' };
    case 'scheduled':
      return { label: 'Scheduled', bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB' };
    default:
      return null;
  }
};

type JobAssigneeOption = {
  id: number;
  first_name: string;
  last_name: string;
};

function formatTeamMemberName(u: JobAssigneeOption | null | undefined): string {
  if (!u) return '';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || `User #${u.id}`;
}

/**
 * Bottom-sheet wrapper around `InlineRangeCalendar` that always returns a
 * single ISO date. The underlying calendar is range-capable, so when the
 * user taps a second day we keep the newer endpoint and discard the older
 * one — gives the job-detail slideout a clean "Set date" experience.
 */
function JobSingleDatePickerSheet({
  visible,
  initialIso,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialIso: string | null;
  onClose: () => void;
  onApply: (iso: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [iso, setIso] = useState<string | null>(initialIso);

  useEffect(() => {
    if (visible) setIso(initialIso);
  }, [visible, initialIso]);

  const handleChange = (s: string | null, e: string | null) => {
    if (s && e && s !== e) {
      setIso(iso === s ? e : s);
      return;
    }
    setIso(s ?? e ?? null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.timePickOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.timePickSheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.timePickGrab} />
          <View style={styles.timePickTitleBlock}>
            <Text style={styles.timePickTitle}>{padAndroidText('Date')}</Text>
            {iso ? (
              <Text style={styles.timePickTitleSummary}>
                {padAndroidText(
                  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                )}
              </Text>
            ) : null}
          </View>
          <ScrollView
            style={{ maxHeight: 460 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <InlineRangeCalendar
              startIso={iso}
              endIso={iso}
              onChange={handleChange}
            />
          </ScrollView>
          <View style={styles.timePickActions}>
            <TouchableOpacity onPress={onClose} style={styles.timePickClearBtn}>
              <View style={styles.timePickActionTextWrap}>
                <Text style={styles.timePickClearText} numberOfLines={1}>
                  {padAndroidText('Cancel')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (iso) {
                  onApply(iso);
                  onClose();
                }
              }}
              style={[
                styles.timePickApplyBtn,
                !iso && styles.timePickApplyBtnDisabled,
              ]}
              activeOpacity={0.88}
              disabled={!iso}
            >
              <View style={styles.timePickActionTextWrap}>
                <Text style={styles.timePickApplyText} numberOfLines={1}>
                  {padAndroidText('Use date')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Bottom-sheet picker for choosing which company member a job is assigned
 * to. Loads team members lazily on first open and mirrors the row layout
 * we use elsewhere in the app (job composer's assign list).
 */
function JobAssigneePickerSheet({
  visible,
  currentAssigneeId,
  onClose,
  onApply,
}: {
  visible: boolean;
  currentAssigneeId: number | null | undefined;
  onClose: () => void;
  onApply: (userId: number, user: JobAssigneeOption) => void;
}) {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<JobAssigneeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(
    currentAssigneeId ?? null,
  );

  useEffect(() => {
    if (visible) setPendingId(currentAssigneeId ?? null);
  }, [visible, currentAssigneeId]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        const res = await apiClient.get('/users');
        if (cancelled) return;
        const list: JobAssigneeOption[] = ((res as any)?.data?.users || []).map(
          (u: any) => ({
            id: Number(u.id),
            first_name: u.first_name || '',
            last_name: u.last_name || '',
          }),
        );
        setUsers(list);
      } catch (e: any) {
        if (cancelled) return;
        setError(
          e?.response?.data?.error || e?.message || 'Could not load members.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const apply = () => {
    if (pendingId == null) return;
    const picked = users.find((u) => u.id === pendingId);
    if (!picked) return;
    onApply(pendingId, picked);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.timePickOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.timePickSheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.timePickGrab} />
          <View style={styles.timePickTitleBlock}>
            <Text style={styles.timePickTitle}>
              {padAndroidText('Assigned to')}
            </Text>
            <Text style={styles.timePickTitleSummary}>
              {padAndroidText('Pick a team member')}
            </Text>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color="#193434" />
            </View>
          ) : error ? (
            <View style={{ paddingVertical: 16 }}>
              <Text style={styles.secureNoteError}>{error}</Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 360 }}
              showsVerticalScrollIndicator={false}
            >
              {users.length === 0 ? (
                <Text style={styles.jobDetailNoTasks}>No members found.</Text>
              ) : (
                users.map((u, i) => {
                  const on = u.id === pendingId;
                  return (
                    <TouchableOpacity
                      key={u.id}
                      onPress={() => setPendingId(u.id)}
                      activeOpacity={0.85}
                      style={[
                        styles.assigneeRow,
                        i > 0 && styles.assigneeRowBorder,
                        on && styles.assigneeRowOn,
                      ]}
                    >
                      <View style={flexRowTextSlot}>
                        <Text
                          style={[
                            styles.assigneeRowText,
                            on && styles.assigneeRowTextOn,
                            flexRowText,
                          ]}
                          numberOfLines={1}
                        >
                          {padAndroidText(formatTeamMemberName(u))}
                        </Text>
                      </View>
                      {on ? (
                        <Text style={styles.assigneeRowCheck}>{'✓'}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}

          <View style={styles.timePickActions}>
            <TouchableOpacity onPress={onClose} style={styles.timePickClearBtn}>
              <View style={styles.timePickActionTextWrap}>
                <Text style={styles.timePickClearText} numberOfLines={1}>
                  {padAndroidText('Cancel')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={apply}
              style={[
                styles.timePickApplyBtn,
                (pendingId == null || pendingId === currentAssigneeId) &&
                  styles.timePickApplyBtnDisabled,
              ]}
              activeOpacity={0.88}
              disabled={
                pendingId == null || pendingId === currentAssigneeId
              }
            >
              <View style={styles.timePickActionTextWrap}>
                <Text style={styles.timePickApplyText} numberOfLines={1}>
                  {padAndroidText('Assign')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function JobDetailSlideout({ job, date, company, onClose, onCopy, isExpanded, onJobUpdate, onJobDeleted, scrollViewRef, scrollOffsetYRef }: { job: Job & { timeline?: Array<{ id?: number; description?: string; message?: string; created_at: string; user_id?: number; action?: string }> }; date: string; company?: Company | any; onClose: () => void; onCopy: (text: string) => void; isExpanded?: boolean; onJobUpdate?: (updatedJob: Job) => void; onJobDeleted?: (jobId: number) => void; scrollViewRef?: React.RefObject<ScrollView | null>; scrollOffsetYRef?: React.MutableRefObject<number> }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const billingCurrency = businessCurrencyFromCompany(company);
  const tabBodyMaxHeight = Math.max(200, Math.floor(windowHeight * 0.42));
  const historyScrollRef = useRef<ScrollView>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [jobDeleteBusy, setJobDeleteBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'history'>('tasks');
  const [taskPending, setTaskPending] = useState<Record<number, boolean>>({});
  const noteInputRef = useRef<TextInput>(null);
  const noteInputContainerRef = useRef<View>(null);

  // --- Inline editing (time / date / assignee / job note) --------------------
  // Admins can change any of these by tapping the chip. Non-admin members
  // still see the same values, just non-tappable.
  const canEditJob = isAdminRole(company);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [savingField, setSavingField] = useState<
    'time' | 'date' | 'assignee' | 'note' | null
  >(null);

  // Inline edit state for the job-level note (the `job.note` field — not
  // the timeline entries below, which already have their own composer).
  const [editingJobNote, setEditingJobNote] = useState(false);
  const [jobNoteDraft, setJobNoteDraft] = useState('');

  // Optimistic assignee label so the chip updates instantly. Falls back to
  // the team-user list when the new id matches a known member, otherwise
  // we just show "Assigned" until the next refresh.
  const [assigneeLabelOverride, setAssigneeLabelOverride] = useState<
    string | null
  >(null);
  const [teamLookup, setTeamLookup] = useState<Record<number, JobAssigneeOption>>(
    {},
  );

  // Fetch the team list once (only when this user can reassign) so the
  // assignee chip can show a real name without waiting for the picker to
  // open. Failures fall back gracefully to the user id.
  useEffect(() => {
    if (!canEditJob) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        const res = await apiClient.get('/users');
        if (cancelled) return;
        const map: Record<number, JobAssigneeOption> = {};
        ((res as any)?.data?.users || []).forEach((u: any) => {
          const id = Number(u.id);
          if (!Number.isFinite(id)) return;
          map[id] = {
            id,
            first_name: u.first_name || '',
            last_name: u.last_name || '',
          };
        });
        setTeamLookup(map);
      } catch {
        // Swallow — chip will just show the user id when name is unknown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canEditJob]);

  // Treat "sub_completed" (the job has a mix of completed + cancelled
  // tasks but no pending ones) the same as completed for toggling and
  // for the header check button - same behavior as the web app.
  const isCompleted = job.status === 'completed' || job.status === 'sub_completed';
  
  // Scroll input into view when keyboard appears
  useEffect(() => {
    if (!showNoteInput) return;
    
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => {
          scrollViewRef?.current?.scrollToEnd({ animated: true });
          historyScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    const timeout = setTimeout(() => {
      scrollViewRef?.current?.scrollToEnd({ animated: true });
      historyScrollRef.current?.scrollToEnd({ animated: true });
    }, 200);

    return () => {
      keyboardDidShowListener.remove();
      clearTimeout(timeout);
    };
  }, [showNoteInput, scrollViewRef]);
  
  const clientName = `${job.name || ''} ${job.last_name || ''}`.trim();
  const clientType = job.is_company ? 'Company' : 'Person';
  const address = job.address ? `${job.address}${job.zip_code && job.city ? ' • ' : ''}${job.zip_code || ''} ${job.city || ''}`.trim() : '';
  
  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = dayNames[date.getDay()];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${dayName}, ${month} ${day}, ${year}`;
  };

  const formatTime = (timeFrom?: string, timeTo?: string) =>
    formatJobTimeWindow(timeFrom, timeTo) ?? 'Not set';

  const formatPrice = (price?: number | string | null) => {
    if (price == null) return '';
    const numPrice = typeof price === 'string' ? parseFloat(price) : Number(price);
    if (isNaN(numPrice) || numPrice === 0) return '';
    return formatBusinessMoney(numPrice, billingCurrency);
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    onCopy(text);
  };

  const services = job.services || [];
  // Recompute from the live services array so the counts stay in sync
  // with task-level toggles without waiting for a full refetch.
  const getServiceStatus = (s: Service): ServiceStatus =>
    (s.status as ServiceStatus | undefined) ??
    (s.is_completed ? 'completed' : 'scheduled');
  const completedCount = services.filter(s => getServiceStatus(s) === 'completed').length;
  const cancelledCount = services.filter(s => getServiceStatus(s) === 'cancelled').length;
  const totalTasks = services.length || job.total_tasks || 0;
  const totalDuration = job.total_duration || 0;
  const taskTotalDurationLabel =
    Number(totalDuration) > 0
      ? formatJobListDurationMinutes(totalDuration)
      : null;
  // Prefer the live sum from the services array so the total stays
  // accurate after tasks are toggled. Fall back to the job-level field
  // only when there are no services loaded yet.
  const totalPrice = services.length > 0
    ? services.reduce((sum, s) => {
        const p = s.price == null ? 0 : (typeof s.price === 'string' ? parseFloat(s.price) : Number(s.price));
        return sum + (isNaN(p) ? 0 : p);
      }, 0)
    : Number(job.total_price) || 0;

  const formattedTime = formatTime(job.scheduled_time_from, job.scheduled_time_to);
  const formattedDate = formatFullDate(date);
  const rawJobNote = job.note ?? job.notes;
  const jobNoteText =
    typeof rawJobNote === 'string' ? rawJobNote.trim() : '';

  // Derive the job's status locally from the tasks - matches the
  // server's computeAndUpdateJobStatus so the UI is snappy after a
  // task toggle even before the response returns.
  const deriveJobStatus = (nextServices: Service[]): JobStatus => {
    if (nextServices.length === 0) return 'scheduled';
    const statuses = nextServices.map(getServiceStatus);
    const allCompleted = statuses.every(s => s === 'completed');
    const allCancelled = statuses.every(s => s === 'cancelled');
    const hasCompleted = statuses.some(s => s === 'completed');
    const hasCancelled = statuses.some(s => s === 'cancelled');
    if (allCompleted) return 'completed';
    if (allCancelled) return 'cancelled';
    if (hasCompleted && hasCancelled) return 'sub_completed';
    return 'scheduled';
  };

  const ensureAuthHeader = async () => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  };

  // Toggle a single task between completed and scheduled. Canceled
  // tasks are resurrected as completed (first click from cancel) to
  // match the web app's behavior.
  const handleToggleTaskStatus = async (service: Service) => {
    if (taskPending[service.id]) return;
    const current = getServiceStatus(service);
    const next: ServiceStatus = current === 'completed' ? 'scheduled' : 'completed';
    setTaskPending(prev => ({ ...prev, [service.id]: true }));

    // Optimistic update so the check/ring reacts instantly.
    const optimisticServices = services.map(s =>
      s.id === service.id
        ? { ...s, status: next, is_completed: next === 'completed' }
        : s
    );
    onJobUpdate?.({
      ...job,
      services: optimisticServices,
      status: deriveJobStatus(optimisticServices),
    });

    try {
      await ensureAuthHeader();
      const res = await apiClient.put(
        `/jobs/${job.id}/services/${service.id}/status`,
        { status: next }
      );
      const serverJob = res.data?.job;
      if (serverJob && onJobUpdate) {
        // Prefer the server job (it carries the authoritative status,
        // updated totals and timeline hooks). Fall back to keeping the
        // services we already have if the server didn't return them.
        onJobUpdate({
          ...job,
          ...serverJob,
          services: serverJob.services || optimisticServices,
        });
      }
    } catch (error: any) {
      console.error('Error toggling task status:', error);
      Alert.alert('Error', 'Failed to update task. Please try again.');
      // Roll back
      onJobUpdate?.({ ...job, services });
    } finally {
      setTaskPending(prev => {
        const copy = { ...prev };
        delete copy[service.id];
        return copy;
      });
    }
  };

  // Cancel a task (or undo a cancel back to scheduled). Separate from
  // the checkbox so canceled tasks can be resurrected to either state
  // without extra taps.
  const handleCancelTask = async (service: Service) => {
    if (taskPending[service.id]) return;
    const current = getServiceStatus(service);
    const next: ServiceStatus = current === 'cancelled' ? 'scheduled' : 'cancelled';
    setTaskPending(prev => ({ ...prev, [service.id]: true }));

    const optimisticServices = services.map(s =>
      s.id === service.id
        ? { ...s, status: next, is_completed: false }
        : s
    );
    onJobUpdate?.({
      ...job,
      services: optimisticServices,
      status: deriveJobStatus(optimisticServices),
    });

    try {
      await ensureAuthHeader();
      const res = await apiClient.put(
        `/jobs/${job.id}/services/${service.id}/status`,
        { status: next }
      );
      const serverJob = res.data?.job;
      if (serverJob && onJobUpdate) {
        onJobUpdate({
          ...job,
          ...serverJob,
          services: serverJob.services || optimisticServices,
        });
      }
    } catch (error: any) {
      console.error('Error cancelling task:', error);
      Alert.alert('Error', 'Failed to update task. Please try again.');
      onJobUpdate?.({ ...job, services });
    } finally {
      setTaskPending(prev => {
        const copy = { ...prev };
        delete copy[service.id];
        return copy;
      });
    }
  };

  const handleToggleComplete = async () => {
    try {
      await ensureAuthHeader();
      // sub_completed counts as "already completed" for the purposes of
      // the big header check - another tap moves the whole job back to
      // scheduled (matching the web app).
      const newStatus: JobStatus = isCompleted ? 'scheduled' : 'completed';
      await apiClient.put(`/jobs/${job.id}/status`, { status: newStatus });

      // The bulk endpoint updates every task's status too, so reflect
      // that locally for the instant-feedback case.
      const newServices = services.map(s => ({
        ...s,
        status: newStatus as ServiceStatus,
        is_completed: newStatus === 'completed',
      }));

      if (onJobUpdate) {
        onJobUpdate({ ...job, status: newStatus, services: newServices });
      }
    } catch (error: any) {
      console.error('Error toggling job completion:', error);
      Alert.alert('Error', 'Failed to update job status. Please try again.');
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Job',
      'Are you sure you want to cancel this job?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes', 
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('authToken');
              if (token) {
                apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
              }
              
              await apiClient.put(`/jobs/${job.id}/status`, {
                status: 'cancelled',
              });
              
              if (onJobUpdate) {
                onJobUpdate({ ...job, status: 'cancelled' });
              }
              
              setShowOptionsMenu(false);
            } catch (error: any) {
              console.error('Error cancelling job:', error);
              Alert.alert('Error', 'Failed to cancel job. Please try again.');
            }
          }
        },
      ]
    );
  };

  const handleDeleteJob = () => {
    setShowOptionsMenu(false);
    Alert.alert(
      'Delete this job?',
      'This permanently removes the job from your schedule. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (jobDeleteBusy) return;
            setJobDeleteBusy(true);
            try {
              await ensureAuthHeader();
              await apiClient.delete(`/jobs/${job.id}`);
              onJobDeleted?.(job.id);
              onClose();
            } catch (error: any) {
              console.error('Error deleting job:', error);
              const msg =
                error?.response?.data?.error ||
                error?.message ||
                'Could not delete the job. Please try again.';
              Alert.alert('Could not delete', String(msg));
            } finally {
              setJobDeleteBusy(false);
            }
          },
        },
      ],
    );
  };

  // Re-pull the job after a write so totals, times and the timeline all
  // stay in sync with the server. Falls back to a local merge if the GET
  // happens to fail so the slideout still reflects the edit.
  const refreshJob = useCallback(
    async (fallback: Partial<Job> = {}) => {
      try {
        const res = await apiClient.get(`/jobs/${job.id}`);
        const fresh = res?.data?.job;
        if (fresh && onJobUpdate) {
          onJobUpdate({ ...job, ...fresh });
          return;
        }
      } catch (err: any) {
        // Soft failure: surface the edit locally even if the refresh request
        // got rejected (e.g. transient network blip).
        console.warn('Job refresh failed:', err?.message || err);
      }
      if (onJobUpdate) onJobUpdate({ ...job, ...fallback });
    },
    [job, onJobUpdate],
  );

  const handleSaveTime = async (from: string, to: string) => {
    if (savingField) return;
    setSavingField('time');
    try {
      await ensureAuthHeader();
      await apiClient.put(`/jobs/${job.id}/time`, {
        scheduled_time_from: from || null,
        scheduled_time_to: to || null,
      });
      await refreshJob({
        scheduled_time_from: from || undefined,
        scheduled_time_to: to || undefined,
      });
    } catch (error: any) {
      console.error('Error updating job time:', error);
      Alert.alert('Error', 'Could not update the job time. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveDate = async (newIso: string) => {
    if (savingField) return;
    if (!newIso || newIso === appointmentDateOnly(job.scheduled_date)) return;
    setSavingField('date');
    try {
      await ensureAuthHeader();
      await apiClient.put(`/jobs/${job.id}/move`, { new_date: newIso });
      await refreshJob({ scheduled_date: newIso });
    } catch (error: any) {
      console.error('Error moving job date:', error);
      Alert.alert('Error', 'Could not change the job date. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveAssignee = async (
    userId: number,
    picked: JobAssigneeOption,
  ) => {
    if (savingField) return;
    if (userId === job.assigned_user_id) return;
    setSavingField('assignee');
    setAssigneeLabelOverride(formatTeamMemberName(picked));
    try {
      await ensureAuthHeader();
      await apiClient.put(`/jobs/${job.id}/assignee`, {
        assigned_user_id: userId,
      });
      await refreshJob({ assigned_user_id: userId });
    } catch (error: any) {
      console.error('Error reassigning job:', error);
      Alert.alert(
        'Error',
        'Could not change the assigned member. Please try again.',
      );
      setAssigneeLabelOverride(null);
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveJobNote = async () => {
    if (savingField) return;
    const trimmed = jobNoteDraft.trim();
    const current = typeof rawJobNote === 'string' ? rawJobNote.trim() : '';
    if (trimmed === current) {
      setEditingJobNote(false);
      return;
    }
    setSavingField('note');
    try {
      await ensureAuthHeader();
      await apiClient.put(`/jobs/${job.id}`, {
        note: trimmed.length === 0 ? null : trimmed,
      });
      await refreshJob({ note: trimmed.length === 0 ? null : trimmed });
      setEditingJobNote(false);
    } catch (error: any) {
      console.error('Error saving job note:', error);
      Alert.alert('Error', 'Could not save the note. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  // Friendly label for the assignee chip. Prefer the explicit "we just
  // saved this" name, then the cached team lookup, then the server name
  // we may have already received on the job, finally a tasteful fallback.
  const assignedUserLabel = useMemo(() => {
    if (assigneeLabelOverride) return assigneeLabelOverride;
    const id = job.assigned_user_id;
    if (id == null) return 'Unassigned';
    const fromLookup = teamLookup[id];
    if (fromLookup) return formatTeamMemberName(fromLookup);
    const anyJob = job as any;
    const fn =
      anyJob.assigned_user_first_name || anyJob.assignee_first_name || '';
    const ln =
      anyJob.assigned_user_last_name || anyJob.assignee_last_name || '';
    const combined = `${fn} ${ln}`.trim();
    if (combined) return combined;
    return `User #${id}`;
  }, [assigneeLabelOverride, job, teamLookup]);

  const streetLine = job.address || '';
  const cityLine = [job.zip_code, job.city].filter(Boolean).join(' ').trim();
  const fullAddress = [streetLine, cityLine].filter(Boolean).join(', ');
  useEffect(() => {
    setActiveTab('tasks');
    setAssigneeLabelOverride(null);
    setEditingJobNote(false);
    setJobNoteDraft('');
  }, [job.id]);

  return (
    <View style={styles.jobDetailContainer}>
      <View
        style={[
          styles.jobDetailHeader,
          isExpanded ? { paddingTop: insets.top + 28 } : null,
        ]}
      >
        <View style={styles.sheetHandleInHeader}>
          <View style={styles.sheetHandleBarInHeader} />
        </View>

        <View style={styles.jobDetailNavRow}>
          <TouchableOpacity
            style={styles.jobDetailIconButton}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronLeftIcon color="#193434" size={22} />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {(() => {
            const meta = getJobStatusMeta(job.status);
            if (!meta) return <View style={{ minWidth: 1 }} />;
            return (
              <View
                style={[
                  styles.jobDetailStatusPill,
                  { backgroundColor: meta.bg, borderColor: meta.border },
                ]}
              >
                <Text style={[styles.jobDetailStatusPillText, { color: meta.fg }]}>
                  {padAndroidText(meta.label)}
                </Text>
              </View>
            );
          })()}
        </View>

        <View style={styles.jobDetailHeroCard}>
          <View style={styles.jobDetailHeroOptionsWrap}>
            <TouchableOpacity
              style={styles.jobDetailHeroOptionBtn}
              onPress={() => setShowOptionsMenu(!showOptionsMenu)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.optionsIconHero}>
                <View style={styles.optionsDotHero} />
                <View style={styles.optionsDotHero} />
                <View style={styles.optionsDotHero} />
              </View>
            </TouchableOpacity>
            {showOptionsMenu ? (
              <View style={styles.optionsMenuHero} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.optionsMenuItem}
                  onPress={handleCancel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionsMenuText}>Cancel job</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionsMenuItem, styles.optionsMenuItemDangerTop]}
                  onPress={handleDeleteJob}
                  activeOpacity={0.7}
                  disabled={jobDeleteBusy}
                >
                  <Text style={styles.optionsMenuTextDanger}>
                    {jobDeleteBusy ? 'Deleting…' : 'Delete job'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <Text style={styles.jobDetailClientTypeAboveName}>
            {padAndroidText(clientType)}
          </Text>

          <TouchableOpacity onPress={() => handleCopy(clientName)} activeOpacity={0.7}>
            <Text style={styles.jobDetailClientNameHero}>{clientName || 'Unknown Client'}</Text>
          </TouchableOpacity>

          {(job.client_phone || job.client_email) ? (
            <View style={styles.jobDetailContactInlineRow}>
              {job.client_phone ? (
                <TouchableOpacity
                  style={styles.jobDetailContactHalf}
                  onPress={() => Linking.openURL(`tel:${job.client_phone}`)}
                  onLongPress={() => handleCopy(job.client_phone!)}
                  activeOpacity={0.8}
                >
                  <View style={styles.jobDetailContactHalfIcon}>
                    <PhoneIcon stroke="#D1FAE5" />
                  </View>
                  <Text
                    style={styles.jobDetailContactHalfText}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {job.client_phone}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {job.client_email ? (
                <TouchableOpacity
                  style={styles.jobDetailContactHalf}
                  onPress={() => Linking.openURL(`mailto:${job.client_email}`)}
                  onLongPress={() => handleCopy(job.client_email!)}
                  activeOpacity={0.8}
                >
                  <View style={styles.jobDetailContactHalfIcon}>
                    <MailIcon stroke="#D1FAE5" />
                  </View>
                  <Text
                    style={styles.jobDetailContactHalfText}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {job.client_email}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* White content area. Everything here is "scrolled" by
          dragging the whole panel up. */}
      <View style={styles.jobDetailContent}>
        {/* Time / date row - compact side-by-side chips. Admins can tap
            either chip to open the matching picker. Non-admin members
            still see the same values, just non-interactive. */}
        <View style={styles.scheduleRow}>
          <TouchableOpacity
            style={[
              styles.scheduleChip,
              canEditJob && styles.scheduleChipEditable,
            ]}
            activeOpacity={canEditJob ? 0.7 : 1}
            disabled={!canEditJob || savingField === 'time'}
            onPress={() => setTimePickerOpen(true)}
          >
            <View style={styles.scheduleChipIcon}>
              <TimeIcon />
            </View>
            <View style={styles.scheduleChipText}>
              <Text style={styles.scheduleChipLabel}>Time</Text>
              <Text
                style={styles.scheduleChipValue}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {savingField === 'time' ? 'Saving…' : formattedTime}
              </Text>
            </View>
            {canEditJob ? (
              <Text style={styles.scheduleChipChevron}>{'›'}</Text>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.scheduleChip,
              canEditJob && styles.scheduleChipEditable,
            ]}
            activeOpacity={canEditJob ? 0.7 : 1}
            disabled={!canEditJob || savingField === 'date'}
            onPress={() => setDatePickerOpen(true)}
          >
            <View style={styles.scheduleChipIcon}>
              <DateIcon />
            </View>
            <View style={styles.scheduleChipText}>
              <Text style={styles.scheduleChipLabel}>Date</Text>
              <Text
                style={styles.scheduleChipValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {savingField === 'date' ? 'Saving…' : formattedDate}
              </Text>
            </View>
            {canEditJob ? (
              <Text style={styles.scheduleChipChevron}>{'›'}</Text>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Assigned to. Always visible so the team knows who's on the
            job. Admins can tap to reassign; everyone else sees a
            read-only chip. */}
        <TouchableOpacity
          style={[
            styles.assigneeChip,
            canEditJob && styles.scheduleChipEditable,
          ]}
          activeOpacity={canEditJob ? 0.7 : 1}
          disabled={!canEditJob || savingField === 'assignee'}
          onPress={() => setAssigneePickerOpen(true)}
        >
          <View style={styles.scheduleChipIcon}>
            <Text style={styles.assigneeChipIconGlyph}>👤</Text>
          </View>
          <View style={[styles.scheduleChipText, flexRowTextSlot]}>
            <Text style={styles.scheduleChipLabel}>Assigned to</Text>
            <Text
              style={[styles.scheduleChipValue, flexRowText]}
              numberOfLines={2}
            >
              {savingField === 'assignee' ? 'Saving…' : assignedUserLabel}
            </Text>
          </View>
          {canEditJob ? (
            <Text style={styles.scheduleChipChevron}>{'›'}</Text>
          ) : null}
        </TouchableOpacity>

        {/* Job-level note (plain text on the job), not client secure notes.
            Admins can tap "Edit" to inline-edit; members see the read-only
            card with long-press to copy. When the note is empty we show an
            "Add note" CTA for admins so the field is discoverable. */}
        {editingJobNote ? (
          <View style={styles.secureNoteCard}>
            <View style={styles.secureNoteHeader}>
              <View style={styles.secureNoteIcon}>
                <Text style={styles.secureNoteIconText}>📝</Text>
              </View>
              <View style={flexRowTextSlot}>
                <Text style={[styles.secureNoteTitle, flexRowText]}>
                  Job note
                </Text>
                <Text
                  style={[styles.secureNoteSubtitle, flexRowText]}
                  numberOfLines={2}
                >
                  Visible to everyone on this job
                </Text>
              </View>
            </View>
            <TextInput
              value={jobNoteDraft}
              onChangeText={setJobNoteDraft}
              placeholder="Add a note for this job"
              placeholderTextColor="#94A3B8"
              multiline
              textAlignVertical="top"
              style={[
                styles.secureNoteInput,
                { marginTop: JOB_DETAIL_SECTION_GAP },
              ]}
            />
            <View style={styles.secureNoteActions}>
              <TouchableOpacity
                onPress={() => {
                  setEditingJobNote(false);
                  setJobNoteDraft('');
                }}
                style={styles.secureNoteCancelBtn}
                disabled={savingField === 'note'}
              >
                <Text style={styles.secureNoteCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveJobNote}
                style={[
                  styles.secureNoteSaveBtn,
                  savingField === 'note' && styles.secureNoteSaveBtnDisabled,
                ]}
                disabled={savingField === 'note'}
              >
                <Text style={styles.secureNoteSaveBtnText}>
                  {savingField === 'note' ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : jobNoteText ? (
          <TouchableOpacity
            style={styles.secureNoteCard}
            onLongPress={() => handleCopy(jobNoteText)}
            activeOpacity={1}
          >
            <View style={styles.secureNoteHeader}>
              <View style={styles.secureNoteIcon}>
                <Text style={styles.secureNoteIconText}>📝</Text>
              </View>
              <View style={flexRowTextSlot}>
                <Text style={[styles.secureNoteTitle, flexRowText]}>
                  Job note
                </Text>
                <Text
                  style={[styles.secureNoteSubtitle, flexRowText]}
                  numberOfLines={2}
                >
                  Saved with this job · long-press to copy
                </Text>
              </View>
              {canEditJob ? (
                <TouchableOpacity
                  onPress={() => {
                    setJobNoteDraft(jobNoteText);
                    setEditingJobNote(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.secureNoteEditBtn}
                >
                  <Text style={styles.secureNoteEditBtnText}>Edit</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={[styles.secureNoteBody, { marginTop: JOB_DETAIL_SECTION_GAP }]}>
              {jobNoteText}
            </Text>
          </TouchableOpacity>
        ) : canEditJob ? (
          <TouchableOpacity
            style={[styles.secureNoteCard, styles.secureNoteCardEmpty]}
            activeOpacity={0.85}
            onPress={() => {
              setJobNoteDraft('');
              setEditingJobNote(true);
            }}
          >
            <View style={styles.secureNoteHeader}>
              <View style={styles.secureNoteIcon}>
                <Text style={styles.secureNoteIconText}>📝</Text>
              </View>
              <View style={flexRowTextSlot}>
                <Text style={[styles.secureNoteTitle, flexRowText]}>
                  Add a job note
                </Text>
                <Text
                  style={[styles.secureNoteSubtitle, flexRowText]}
                  numberOfLines={2}
                >
                  Visible to everyone on this job
                </Text>
              </View>
              <Text style={styles.scheduleChipChevron}>{'›'}</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.jobDetailTabsWrap}>
          <TouchableOpacity
            style={[styles.jobDetailTabButton, activeTab === 'tasks' && styles.jobDetailTabButtonOn]}
            onPress={() => setActiveTab('tasks')}
            activeOpacity={0.85}
          >
            <Text style={[styles.jobDetailTabText, activeTab === 'tasks' && styles.jobDetailTabTextOn]}>
              {padAndroidText('Tasks')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.jobDetailTabButton, activeTab === 'history' && styles.jobDetailTabButtonOn]}
            onPress={() => setActiveTab('history')}
            activeOpacity={0.85}
          >
            <Text style={[styles.jobDetailTabText, activeTab === 'history' && styles.jobDetailTabTextOn]}>
              {padAndroidText('History')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'tasks' ? (
        <ScrollView
          style={[styles.jobDetailTabScroll, { maxHeight: tabBodyMaxHeight }]}
          contentContainerStyle={styles.jobDetailTabScrollContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
        <View style={styles.jobDetailTasksSection}>
          {services.length > 0 ? (
            <View style={styles.jobDetailTasksList}>
              {services.map((item, idx) => {
                const status = getServiceStatus(item);
                const isTaskCompleted = status === 'completed';
                const isTaskCancelled = status === 'cancelled';
                const pending = !!taskPending[item.id];
                const isLast = idx === services.length - 1;
                const metaParts: string[] = [];
                const dur =
                  formatJobListDurationMinutes(item.duration_minutes) ?? '0 min';
                if (dur && dur !== '0 min') metaParts.push(dur);
                const price = formatPrice(item.price);
                if (price) metaParts.push(price);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.taskRow,
                      !isLast && styles.taskRowDivider,
                      isTaskCancelled && styles.taskRowCancelled,
                    ]}
                    onPress={() => handleToggleTaskStatus(item)}
                    activeOpacity={0.6}
                    disabled={pending}
                  >
                    <View
                      style={[
                        styles.taskCheckbox,
                        isTaskCompleted && styles.taskCheckboxDone,
                        isTaskCancelled && styles.taskCheckboxCancelled,
                      ]}
                    >
                      {isTaskCompleted ? (
                        <Text style={styles.taskCheckmark}>✓</Text>
                      ) : isTaskCancelled ? (
                        <Text style={styles.taskCancelMark}>–</Text>
                      ) : null}
                    </View>
                    <View style={styles.taskBody}>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.taskName,
                          isTaskCompleted && styles.taskNameDone,
                          isTaskCancelled && styles.taskNameCancelled,
                        ]}
                      >
                        {item.service_name || 'Task'}
                      </Text>
                      {metaParts.length > 0 && (
                        <Text
                          style={[
                            styles.taskMeta,
                            isTaskCancelled && styles.taskMetaCancelled,
                          ]}
                        >
                          {metaParts.join(' · ')}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.taskSkipButton}
                      onPress={() => handleCancelTask(item)}
                      activeOpacity={0.5}
                      disabled={pending}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Text style={styles.taskSkipButtonText}>
                        {padAndroidText(isTaskCancelled ? 'Undo' : 'Cancel')}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.jobDetailNoTasks}>No tasks assigned</Text>
          )}

          {/* One-line total footer — intentionally small so it doesn't
              dominate a section that only has one or two rows. */}
          {services.length > 0 && (
            <View style={styles.taskTotalLine}>
              <Text style={styles.taskTotalText}>
                Total
                {taskTotalDurationLabel ? ` · ${taskTotalDurationLabel}` : ''}
              </Text>
              <Text style={styles.taskTotalPrice}>
                {formatPrice(totalPrice)}
              </Text>
            </View>
          )}
        </View>
        </ScrollView>
        ) : null}

        {activeTab === 'history' ? (
        <ScrollView
          ref={historyScrollRef}
          style={[styles.jobDetailTabScroll, { maxHeight: tabBodyMaxHeight }]}
          contentContainerStyle={styles.jobDetailTabScrollContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
        <View style={styles.jobDetailTimelineSection}>
          {job.timeline && job.timeline.length > 0 ? (
            <View style={styles.timelineContainer}>
              {job.timeline.map((item: any, index: number) => (
                <View key={item.id || index} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    {index < (job.timeline?.length || 0) - 1 && <View style={styles.timelineLine} />}
                    <View style={styles.timelineDot} />
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineText}>{item.description || item.message || 'Update'}</Text>
                    {item.created_at && (
                      <Text style={styles.timelineDate}>
                        {new Date(item.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.jobDetailNoTasks}>No timeline entries yet</Text>
          )}
          
          {/* Add note — intentionally a subtle text link. It lives
              under the timeline and is a low-priority action, so it
              matches the indent of the entries and uses muted tint
              rather than the branded green CTA color. */}
          {!showNoteInput && (
            <TouchableOpacity
              style={styles.addNoteLink}
              onPress={() => setShowNoteInput(true)}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.addNoteLinkPlus}>+</Text>
              <Text style={styles.addNoteLinkText}>Add note</Text>
            </TouchableOpacity>
          )}
          
          {/* Note Input */}
          {showNoteInput && (
            <View ref={noteInputContainerRef} style={styles.noteInputContainer}>
              <TextInput
                ref={noteInputRef}
                style={styles.noteInput}
                placeholder="Write your note here..."
                placeholderTextColor="#999"
                multiline
                value={noteText}
                onChangeText={setNoteText}
                autoFocus
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef?.current?.scrollToEnd({ animated: true });
                    historyScrollRef.current?.scrollToEnd({ animated: true });
                  }, 300);
                }}
              />
              <View style={styles.noteInputActions}>
                <TouchableOpacity
                  style={styles.noteIconButton}
                  onPress={() => {
                    setShowNoteInput(false);
                    setNoteText('');
                  }}
                >
                  <Text style={styles.noteCancelIcon}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.noteIconButton, styles.noteSaveIconButton, isSavingNote && styles.noteSaveButtonDisabled]}
                  onPress={async () => {
                    if (!noteText.trim() || isSavingNote) return;
                    
                    setIsSavingNote(true);
                    try {
                      const token = await AsyncStorage.getItem('authToken');
                      if (token) {
                        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                      }
                      
                      // Add note to timeline via API
                      const response = await apiClient.post(`/jobs/${job.id}/notes`, {
                        content: noteText.trim(),
                      });
                      
                      // Refresh job data
                      const jobResponse = await apiClient.get(`/jobs/${job.id}`);
                      const updatedJob = jobResponse.data.job;
                      
                      if (onJobUpdate) {
                        onJobUpdate(updatedJob);
                      }
                      
                      setShowNoteInput(false);
                      setNoteText('');
                    } catch (error: any) {
                      console.error('Error adding note:', error);
                      Alert.alert('Error', 'Failed to add note. Please try again.');
                    } finally {
                      setIsSavingNote(false);
                    }
                  }}
                  disabled={isSavingNote || !noteText.trim()}
                >
                  <Text style={styles.noteSaveIcon}>✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        </ScrollView>
        ) : null}
      </View>

      <MobileJobTimePickerModal
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        initialFrom={job.scheduled_time_from || ''}
        initialTo={job.scheduled_time_to || ''}
        onApply={(from, to) => {
          handleSaveTime(from, to);
        }}
      />

      <JobSingleDatePickerSheet
        visible={datePickerOpen}
        initialIso={appointmentDateOnly(job.scheduled_date) || date || null}
        onClose={() => setDatePickerOpen(false)}
        onApply={(iso) => {
          handleSaveDate(iso);
        }}
      />

      <JobAssigneePickerSheet
        visible={assigneePickerOpen}
        currentAssigneeId={job.assigned_user_id}
        onClose={() => setAssigneePickerOpen(false)}
        onApply={(id, picked) => {
          handleSaveAssignee(id, picked);
        }}
      />
    </View>
  );
}

// Small car glyph used in the drive-time badge between the two job
// cards on the handoff sheet. Keeps the illustration purely vector so
// it looks sharp on every device.
const CarIcon = ({ color = '#193434' }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14m-14 0v5a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1m10 0v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-5"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx={7.5} cy={14.5} r={1} fill={color} />
    <Circle cx={16.5} cy={14.5} r={1} fill={color} />
  </Svg>
);

// Format a driving duration in seconds as "12 min" / "1h 5m".
const formatDriveDuration = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

// Format a distance in meters as "2.4 km" / "540 m".
const formatDriveDistance = (meters?: number | null) => {
  if (!meters || meters <= 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
};

const formatMiniJobAddress = (j: HandoffMiniJob | null | undefined) => {
  if (!j) return '';
  const street = j.address || '';
  const tail = [j.zip_code, j.city].filter(Boolean).join(' ').trim();
  return [street, tail].filter(Boolean).join(', ');
};

const formatMiniJobName = (j: HandoffMiniJob | null | undefined) => {
  if (!j) return '';
  return `${j.client_first_name || ''} ${j.client_last_name || ''}`.trim() ||
    'Unnamed client';
};

// Drops in over the job sheet after the user hits "Complete". Shows
// the previous job, the next one, a simple route illustration with
// the estimated drive time, and two actions: notify client + start.
function HandoffSheet({
  visible,
  data,
  onClose,
  onStart,
  isStarting,
}: {
  visible: boolean;
  data: HandoffResponse | null;
  onClose: () => void;
  onStart: (notify: boolean) => void;
  isStarting: boolean;
}) {
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const [notify, setNotify] = useState(false);
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const knobX = useRef(new Animated.Value(0)).current;

  // Slide up / down whenever visibility changes. Uses a quick spring
  // for opens and a short timing for closes, matching the main sheet.
  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        stiffness: 260,
        damping: 32,
        mass: 1,
        overshootClamping: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, screenHeight, translateY]);

  // Reset the notify toggle whenever the sheet opens fresh, so the
  // worker opts in deliberately every time.
  useEffect(() => {
    if (visible) {
      setNotify(false);
      knobX.setValue(0);
    }
  }, [visible, knobX]);

  useEffect(() => {
    Animated.spring(knobX, {
      toValue: notify ? 20 : 0,
      useNativeDriver: true,
      stiffness: 320,
      damping: 24,
      mass: 0.7,
    }).start();
  }, [notify, knobX]);

  // Lets the user flick the sheet down to close it, with the same
  // feel as the main job sheet.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.9) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 30,
          }).start();
        }
      },
    })
  ).current;

  const current = data?.current ?? null;
  const next = data?.next ?? null;
  const drive = data?.drive ?? null;
  const nextUpTime =
    next &&
    formatJobTimeWindow(next.scheduled_time_from, next.scheduled_time_to);

  if (!visible && !data) return null;

  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.handoffOverlay,
          {
            opacity: translateY.interpolate({
              inputRange: [0, screenHeight],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.handoffSurface,
          {
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.handoffHandle} />

        <View style={styles.handoffTitleRow}>
          <Text style={styles.handoffTitle}>
            {next ? 'On to the next one' : 'All wrapped up'}
          </Text>
          <TouchableOpacity
            style={styles.handoffCloseBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.handoffCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Previous job - dimmed because the worker just finished it */}
        {current && (
          <View style={[styles.handoffJobCard, styles.handoffJobCardDone]}>
            <View
              style={[styles.handoffJobCardDot, styles.handoffJobCardDotDone]}
            />
            <View style={styles.handoffJobCardBody}>
              <Text style={styles.handoffJobCardLabel}>Just completed</Text>
              <Text style={styles.handoffJobCardName}>
                {formatMiniJobName(current)}
              </Text>
              <Text
                style={styles.handoffJobCardAddress}
                numberOfLines={1}
              >
                {formatMiniJobAddress(current)}
              </Text>
            </View>
          </View>
        )}

        {next && (
          <>
            {/* Route illustration: dashed vertical line with a drive
                badge floating in the middle. */}
            <View style={styles.handoffRoute}>
              <View
                style={[styles.handoffRouteLine, { height: 16 }]}
              />
              <View style={styles.handoffRouteBadge}>
                <CarIcon />
                <Text style={styles.handoffRouteBadgeText}>
                  {drive ? formatDriveDuration(drive.duration_seconds) : '—'}
                </Text>
                {drive?.distance_meters ? (
                  <Text style={styles.handoffRouteBadgeSub}>
                    · {formatDriveDistance(drive.distance_meters)}
                  </Text>
                ) : (
                  <Text style={styles.handoffRouteBadgeSub}>
                    · drive
                  </Text>
                )}
              </View>
              <View
                style={[styles.handoffRouteLine, { height: 16 }]}
              />
            </View>

            {/* Next job card */}
            <View style={styles.handoffJobCard}>
              <View
                style={[styles.handoffJobCardDot, styles.handoffJobCardDotNext]}
              />
              <View style={styles.handoffJobCardBody}>
                <Text style={styles.handoffJobCardLabel}>Up next</Text>
                <Text style={styles.handoffJobCardName}>
                  {formatMiniJobName(next)}
                </Text>
                <Text
                  style={styles.handoffJobCardAddress}
                  numberOfLines={1}
                >
                  {formatMiniJobAddress(next)}
                </Text>
                {nextUpTime ? (
                  <Text style={styles.handoffJobCardTime}>{nextUpTime}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.handoffActions}>
              {/* Notify client toggle - when on, the server will send
                  an "on the way" email to the next client after the
                  job is started. */}
              <TouchableOpacity
                onPress={() => setNotify((v) => !v)}
                activeOpacity={0.85}
                style={[
                  styles.handoffNotifyRow,
                  notify && styles.handoffNotifyRowActive,
                ]}
              >
                <View style={styles.handoffNotifyInfo}>
                  <Text
                    style={[
                      styles.handoffNotifyTitle,
                      notify && styles.handoffNotifyTitleActive,
                    ]}
                  >
                    Notify client
                  </Text>
                  <Text style={styles.handoffNotifySub}>
                    {next.client_email
                      ? `Send "${formatMiniJobName(next).split(' ')[0] ||
                          'them'}" an on-the-way email`
                      : 'No email on file - nothing will be sent'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.handoffNotifySwitch,
                    notify && styles.handoffNotifySwitchActive,
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.handoffNotifyKnob,
                      { transform: [{ translateX: knobX }] },
                    ]}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onStart(notify && !!next.client_email)}
                activeOpacity={0.9}
                disabled={isStarting}
                style={[
                  styles.handoffStartButton,
                  isStarting && styles.handoffStartButtonDisabled,
                ]}
              >
                <Text style={styles.handoffStartButtonText}>
                  {isStarting ? 'Starting…' : 'Start job'}
                </Text>
                <ArrowRightIcon color="#ffffff" />
              </TouchableOpacity>
            </View>
          </>
        )}

        {!next && (
          <View style={[styles.handoffDoneCard, { marginTop: 12 }]}>
            <Text style={styles.handoffDoneEmoji}>🎉</Text>
            <Text style={styles.handoffDoneText}>
              That was the last job for this day. Nice work!
            </Text>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.9}
              style={[
                styles.handoffStartButton,
                { marginTop: 16, alignSelf: 'stretch' },
              ]}
            >
              <Text style={styles.handoffStartButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </>
  );
}

// Reusable sticky action bar that hangs at the very bottom of the
// screen whenever the job sheet is open. Tapping "Complete" bulk-
// completes every scheduled task on the job and the caller is in
// charge of fetching the handoff data + opening the HandoffSheet.
function StickyCompleteBar({
  visible,
  job,
  insetsBottom,
  onPress,
  isBusy,
}: {
  visible: boolean;
  job: Job | null;
  insetsBottom: number;
  onPress: () => void;
  isBusy: boolean;
}) {
  const translateY = useRef(new Animated.Value(140)).current;
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : 140,
      useNativeDriver: true,
      stiffness: 300,
      damping: 30,
      mass: 0.9,
    }).start();
  }, [visible, translateY]);

  if (!job) return null;
  const streetLine = job.address || '';
  const cityLine = [job.zip_code, job.city].filter(Boolean).join(' ').trim();
  const fullAddress = [streetLine, cityLine].filter(Boolean).join(', ');

  // Figure out how many tasks are still pending so we can (1) disable
  // the button when there's nothing to do and (2) give the label a
  // little extra context.
  const services = job.services || [];
  const pendingCount = services.filter(
    (s) =>
      ((s.status as ServiceStatus | undefined) ??
        (s.is_completed ? 'completed' : 'scheduled')) === 'scheduled'
  ).length;
  const nothingLeft = pendingCount === 0;

  const primaryLabel = nothingLeft
    ? 'All done'
    : isBusy
    ? 'Completing…'
    : pendingCount === services.length
    ? 'Complete job'
    : `Complete ${pendingCount} remaining`;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.stickyActionBar,
        {
          paddingBottom: insetsBottom + 10,
          transform: [{ translateY }],
        },
      ]}
    >
      {fullAddress ? (
        <TouchableOpacity
          style={styles.stickyAddressCard}
          onPress={() => openInMaps(fullAddress)}
          activeOpacity={0.82}
        >
          <View style={styles.stickyAddressPin}>
            <LocationIcon />
          </View>
          <View style={styles.stickyAddressBody}>
            <Text style={styles.stickyAddressTitle} numberOfLines={1}>
              {streetLine || cityLine}
            </Text>
            {streetLine && cityLine ? (
              <Text style={styles.stickyAddressSub} numberOfLines={1}>
                {cityLine}
              </Text>
            ) : null}
          </View>
          <View style={styles.stickyAddressAction}>
            <Text style={styles.stickyAddressActionText}>Open maps</Text>
            <ArrowRightIcon color="#047857" />
          </View>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[
          styles.stickyCompleteButton,
          (isBusy || nothingLeft) && styles.stickyCompleteButtonDisabled,
        ]}
        onPress={onPress}
        disabled={isBusy || nothingLeft}
        activeOpacity={0.9}
      >
        <View style={styles.stickyCompleteButtonTextCol}>
          <Text style={styles.stickyCompleteButtonText}>{primaryLabel}</Text>
          {!nothingLeft && !isBusy && (
            <Text style={styles.stickyCompleteButtonSubtitle}>
              Continue to next job
            </Text>
          )}
        </View>
        <View style={styles.stickyCompleteButtonIcon}>
          <Text style={styles.stickyCompleteButtonCheck}>
            {nothingLeft ? '✓' : '→'}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Shared helper used by both TodayTab and DayViewScreen to complete
// every remaining task on a job and fetch the handoff data for the
// next one. Returns the handoff response so the caller can show the
// HandoffSheet.
async function runCompleteAndHandoff(
  job: Job
): Promise<{ updatedJob: Job | null; handoff: HandoffResponse }> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  const completeRes = await apiClient.post(
    `/jobs/${job.id}/complete-remaining`
  );
  const updatedJob = completeRes.data?.job || null;

  const handoffRes = await apiClient.get(`/jobs/${job.id}/handoff`);
  const handoff: HandoffResponse = handoffRes.data;

  return { updatedJob, handoff };
}

// --- Day view: add job / appointment (same APIs as web, mobile-first UI) -----

type MobileClientPick = {
  id: number;
  name: string;
  last_name?: string | null;
  client_type?: string;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  email?: string | null;
};

type MobileServicePick = {
  id: number;
  title: string;
  price: number | string | null;
  duration_minutes: number;
};

type SelectedJobService = MobileServicePick & {
  customPrice: string;
  customDuration: string;
};

type TeamUserRow = {
  id: number;
  first_name: string;
  last_name: string;
};

type ApptCategoryMobile = 'personal' | 'meeting' | 'sick' | 'vacation' | 'other';

function formatClientLine(c: MobileClientPick): string {
  if (String(c.client_type || '').toLowerCase() === 'company') {
    return (c.name || '').trim() || 'Company';
  }
  return `${c.name || ''} ${c.last_name || ''}`.trim() || 'Client';
}

function clientSubline(c: MobileClientPick): string {
  if (c.address && c.city) return `${c.address}, ${c.city}`;
  if (c.address) return String(c.address);
  return 'No address';
}

function clientMatchesQuery(c: MobileClientPick, q: string): boolean {
  const blob = [
    formatClientLine(c),
    c.address,
    c.zip_code,
    c.city,
    c.email,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return blob.includes(q);
}

/** Higher score = better match for ordering the picker while typing. */
function clientRelevanceScore(c: MobileClientPick, q: string): number {
  const qt = q.trim().toLowerCase();
  if (!qt) return 0;
  const name = formatClientLine(c).toLowerCase();
  if (name === qt) return 1_000_000;
  if (name.startsWith(qt)) return 500_000 + Math.max(0, 300 - name.length);
  const at = name.indexOf(qt);
  if (at >= 0) return 200_000 - at * 80 + qt.length * 20;
  if (!clientMatchesQuery(c, qt)) return -1;
  const blob = [
    formatClientLine(c),
    c.address,
    c.zip_code,
    c.city,
    c.email,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const idx = blob.indexOf(qt);
  return idx >= 0 ? 80_000 - idx : -1;
}

function rankClientsForPicker(clients: MobileClientPick[], q: string): MobileClientPick[] {
  const qt = q.trim().toLowerCase();
  if (!qt) {
    return [...clients]
      .sort((a, b) => formatClientLine(a).localeCompare(formatClientLine(b)))
      .slice(0, 50);
  }
  return clients
    .map((c) => ({ c, s: clientRelevanceScore(c, qt) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c)
    .slice(0, 60);
}

function serviceRelevanceScore(s: MobileServicePick, q: string): number {
  const qt = q.trim().toLowerCase();
  if (!qt) return 0;
  const t = (s.title || '').toLowerCase();
  if (t === qt) return 1_000_000;
  if (t.startsWith(qt)) return 500_000;
  const at = t.indexOf(qt);
  return at >= 0 ? 200_000 - at * 60 : -1;
}

function rankServicesForPicker(
  services: MobileServicePick[],
  q: string,
  excludeIds: Set<number>,
): MobileServicePick[] {
  const qt = q.trim().toLowerCase();
  const pool = services.filter((s) => !excludeIds.has(s.id));
  if (!qt) {
    return [...pool]
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      .slice(0, 40);
  }
  return pool
    .map((s) => ({ s, sc: serviceRelevanceScore(s, qt) }))
    .filter((x) => x.sc >= 0)
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.s)
    .slice(0, 40);
}

type ClientSecureNoteRow = {
  id: number;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

function serviceToSelected(s: MobileServicePick): SelectedJobService {
  const raw = typeof s.price === 'string' ? parseFloat(s.price) : Number(s.price);
  const p = Number.isFinite(raw) ? raw : 0;
  const d = Number(s.duration_minutes) || 0;
  return {
    ...s,
    customPrice: String(Math.round(p * 100) / 100),
    customDuration: String(d),
  };
}

/** 30-minute steps, same grid as web `TimePicker` (00:00 … 23:30). */
const HALF_HOUR_TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function hhmmToMinutes(t: string): number {
  const p = String(t || '').trim().split(':');
  if (p.length < 2) return -1;
  const h = parseInt(p[0], 10);
  const m = parseInt(p[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

type TimeAccordionSection = 'single' | 'from' | 'to' | null;

/**
 * Single grid of 30-minute time options.
 *
 * Pulled out of the picker body so each accordion step renders the same grid
 * with its own selection / disabled rules.
 */
function TimeGrid({
  selected,
  onSelect,
  isDisabled,
}: {
  selected: string;
  onSelect: (t: string) => void;
  isDisabled?: (t: string) => boolean;
}) {
  return (
    <View style={styles.timePickGrid}>
      {HALF_HOUR_TIME_SLOTS.map((t) => {
        const on = selected === t;
        const disabled = isDisabled ? isDisabled(t) : false;
        return (
          <TouchableOpacity
            key={t}
            disabled={disabled}
            style={[
              styles.timePickCell,
              !disabled && on && styles.timePickCellOn,
              disabled && styles.timePickCellDisabled,
            ]}
            onPress={() => onSelect(t)}
            activeOpacity={0.8}
          >
            <View style={styles.timePickCellTextWrap}>
              <Text
                style={[
                  styles.timePickCellText,
                  !disabled && on && styles.timePickCellTextOn,
                  disabled && styles.timePickCellTextDisabled,
                ]}
                numberOfLines={1}
              >
                {padAndroidText(t)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Header row used inside the accordion.
 * Always tappable so the user can re-open a closed step.
 */
/**
 * Two-line header: label + chevron on the first row; time(s) on the second
 * full-width row so Android never ellipsizes `07:00` inside a tight flex row.
 */
function TimeAccordionHeader({
  label,
  value,
  open,
  onPress,
}: {
  label: string;
  value: string;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.timeAccordionHeader, open && styles.timeAccordionHeaderOn]}
    >
      <View style={styles.timeAccordionHeaderTopRow}>
        <Text
          style={[
            styles.timeAccordionHeaderLabel,
            open && styles.timeAccordionHeaderLabelOn,
          ]}
          numberOfLines={1}
        >
          {padAndroidText(label)}
        </Text>
        <Text
          style={[
            styles.timeAccordionHeaderChevron,
            open && styles.timeAccordionHeaderChevronOn,
          ]}
        >
          {open ? '▾' : '▸'}
        </Text>
      </View>
      <Text
        style={[
          styles.timeAccordionHeaderValueBlock,
          open && styles.timeAccordionHeaderValueBlockOn,
          !value && styles.timeAccordionHeaderValueEmpty,
        ]}
        numberOfLines={2}
      >
        {padAndroidText(value || 'Choose')}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Time picker: Single / Time range live in the tab row (same as web).
 * Accordion applies only to the time grid steps (Time, or From → To).
 */
function MobileJobTimePickerModal({
  visible,
  onClose,
  initialFrom,
  initialTo,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  initialFrom: string;
  initialTo: string;
  onApply: (from: string, to: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [pendingFrom, setPendingFrom] = useState('');
  const [pendingTo, setPendingTo] = useState('');
  const [openSection, setOpenSection] = useState<TimeAccordionSection>('single');

  useEffect(() => {
    if (!visible) return;
    const tf = String(initialFrom || '').trim();
    const tt = String(initialTo || '').trim();
    setPendingFrom(tf);
    setPendingTo(tt);
    const initialMode: 'single' | 'range' = tt ? 'range' : 'single';
    setMode(initialMode);
    // Land on the first unfinished step so re-opening the picker continues the flow.
    if (!tf && !tt) {
      setOpenSection(initialMode === 'single' ? 'single' : 'from');
    } else if (initialMode === 'range' && tf && !tt) {
      setOpenSection('to');
    } else {
      setOpenSection(null);
    }
  }, [visible, initialFrom, initialTo]);

  const animateNext = (next: TimeAccordionSection) => {
    LayoutAnimation.configureNext(SNAPPY_LAYOUT);
    setOpenSection(next);
  };

  const pickMode = (next: 'single' | 'range') => {
    LayoutAnimation.configureNext(SNAPPY_LAYOUT);
    setMode(next);
    if (next === 'single') {
      setPendingTo('');
      setOpenSection('single');
    } else {
      if (pendingFrom && !pendingTo) {
        const idx = HALF_HOUR_TIME_SLOTS.indexOf(pendingFrom);
        const slotAfter =
          idx >= 0 && idx < HALF_HOUR_TIME_SLOTS.length - 1
            ? HALF_HOUR_TIME_SLOTS[idx + 1]
            : pendingFrom;
        setPendingTo(slotAfter);
      }
      setOpenSection(pendingFrom ? 'to' : 'from');
    }
  };

  const pickSingle = (t: string) => {
    LayoutAnimation.configureNext(SNAPPY_LAYOUT);
    setPendingFrom(t);
    setPendingTo('');
    setOpenSection(null);
  };

  const pickFrom = (t: string) => {
    LayoutAnimation.configureNext(SNAPPY_LAYOUT);
    setPendingFrom(t);
    // If the existing 'to' is no longer after the new 'from', clear it.
    if (pendingTo && hhmmToMinutes(pendingTo) <= hhmmToMinutes(t)) {
      setPendingTo('');
    }
    setOpenSection('to');
  };

  const pickTo = (t: string) => {
    LayoutAnimation.configureNext(SNAPPY_LAYOUT);
    setPendingTo(t);
    setOpenSection(null);
  };

  const apply = () => {
    const tf = pendingFrom.trim();
    const tt = pendingTo.trim();
    if (mode === 'single') {
      if (!tf) {
        animateNext('single');
        Alert.alert('Time', 'Choose a time from the grid.');
        return;
      }
      onApply(tf, '');
      onClose();
      return;
    }
    if (!tf) {
      animateNext('from');
      return;
    }
    if (!tt) {
      animateNext('to');
      return;
    }
    if (hhmmToMinutes(tt) <= hhmmToMinutes(tf)) {
      Alert.alert('Time range', 'End time must be after start time.');
      animateNext('to');
      return;
    }
    onApply(tf, tt);
    onClose();
  };

  const clearAll = () => {
    LayoutAnimation.configureNext(SNAPPY_LAYOUT);
    setPendingFrom('');
    setPendingTo('');
    setOpenSection(mode === 'single' ? 'single' : 'from');
  };

  const fromMin = hhmmToMinutes(pendingFrom);

  const summaryValue =
    mode === 'single'
      ? pendingFrom
      : pendingFrom && pendingTo
        ? `${pendingFrom} – ${pendingTo}`
        : pendingFrom || '';

  const canApply =
    mode === 'single'
      ? !!pendingFrom
      : !!pendingFrom &&
        !!pendingTo &&
        hhmmToMinutes(pendingTo) > hhmmToMinutes(pendingFrom);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.timePickOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.timePickSheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.timePickGrab} />
          <View style={styles.timePickTitleBlock}>
            <Text style={styles.timePickTitle}>{padAndroidText('Time')}</Text>
            {summaryValue ? (
              <Text style={styles.timePickTitleSummary}>
                {padAndroidText(summaryValue)}
              </Text>
            ) : null}
          </View>

          <View style={styles.timePickTabRow}>
            <TouchableOpacity
              style={[
                styles.timePickTab,
                mode === 'single' && styles.timePickTabOn,
              ]}
              onPress={() => pickMode('single')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.timePickTabText,
                  mode === 'single' && styles.timePickTabTextOn,
                ]}
                numberOfLines={2}
              >
                Single time
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.timePickTab,
                mode === 'range' && styles.timePickTabOn,
              ]}
              onPress={() => pickMode('range')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.timePickTabText,
                  mode === 'range' && styles.timePickTabTextOn,
                ]}
                numberOfLines={2}
              >
                Time range
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: 460 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {mode === 'single' ? (
              <>
                <TimeAccordionHeader
                  label="Time"
                  value={pendingFrom}
                  open={openSection === 'single'}
                  onPress={() =>
                    animateNext(openSection === 'single' ? null : 'single')
                  }
                />
                {openSection === 'single' ? (
                  <View style={styles.timeAccordionBody}>
                    <TimeGrid selected={pendingFrom} onSelect={pickSingle} />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <TimeAccordionHeader
                  label="From"
                  value={pendingFrom}
                  open={openSection === 'from'}
                  onPress={() =>
                    animateNext(openSection === 'from' ? null : 'from')
                  }
                />
                {openSection === 'from' ? (
                  <View style={styles.timeAccordionBody}>
                    <TimeGrid selected={pendingFrom} onSelect={pickFrom} />
                  </View>
                ) : null}

                <TimeAccordionHeader
                  label="To"
                  value={pendingTo}
                  open={openSection === 'to'}
                  onPress={() =>
                    animateNext(openSection === 'to' ? null : 'to')
                  }
                />
                {openSection === 'to' ? (
                  <View style={styles.timeAccordionBody}>
                    <TimeGrid
                      selected={pendingTo}
                      onSelect={pickTo}
                      isDisabled={(t) => {
                        if (!pendingFrom) return true;
                        return hhmmToMinutes(t) <= fromMin;
                      }}
                    />
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          <View style={styles.timePickActions}>
            <TouchableOpacity onPress={clearAll} style={styles.timePickClearBtn}>
              <View style={styles.timePickActionTextWrap}>
                <Text style={styles.timePickClearText} numberOfLines={1}>
                  {padAndroidText('Clear')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={apply}
              style={[
                styles.timePickApplyBtn,
                !canApply && styles.timePickApplyBtnDisabled,
              ]}
              activeOpacity={0.88}
              disabled={!canApply}
            >
              <View style={styles.timePickActionTextWrap}>
                <Text style={styles.timePickApplyText} numberOfLines={1}>
                  {padAndroidText('Use time')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DayViewAddPickerModal({
  visible,
  onClose,
  onAddJob,
  onAddAppointment,
  isAdmin,
}: {
  visible: boolean;
  onClose: () => void;
  onAddJob: () => void;
  onAddAppointment: () => void;
  isAdmin: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.dayAddPickerRoot}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.dayAddPickerCard,
            { marginBottom: Math.max(insets.bottom, 16) + 72 },
          ]}
        >
          <Text style={styles.dayAddPickerTitle}>Add to this day</Text>
          <TouchableOpacity
            style={styles.dayAddPickerRow}
            onPress={() => {
              onClose();
              onAddJob();
            }}
            activeOpacity={0.75}
          >
            <View style={styles.dayAddPickerIconWrap}>
              <IconDocumentText color="#475569" size={22} />
            </View>
            <Text style={styles.dayAddPickerRowText}>Add job</Text>
          </TouchableOpacity>
          <View style={styles.dayAddPickerDivider} />
          <TouchableOpacity
            style={styles.dayAddPickerRow}
            onPress={() => {
              onClose();
              onAddAppointment();
            }}
            activeOpacity={0.75}
          >
            <View style={styles.dayAddPickerIconWrap}>
              <IconCalendarDays color="#475569" size={22} />
            </View>
            <Text style={styles.dayAddPickerRowText}>
              {isAdmin ? 'Add appointment' : 'Request appointment'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function MobileCreateJobModal({
  visible,
  onClose,
  scheduledDate,
  company,
  user,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  scheduledDate: string;
  company: Company;
  user: User;
  onCreated: () => void;
}) {
  const insets = useSafeAreaInsets();
  const admin = isAdminRole(company, user);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<MobileClientPick[]>([]);
  const [services, setServices] = useState<MobileServicePick[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUserRow[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<MobileClientPick | null>(null);
  const [selectedServices, setSelectedServices] = useState<SelectedJobService[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [assigneeId, setAssigneeId] = useState<number>(user.id);
  const [showAssignList, setShowAssignList] = useState(false);
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [note, setNote] = useState('');
  const [clientSecureNotes, setClientSecureNotes] = useState<ClientSecureNoteRow[]>([]);
  const [loadingClientNotes, setLoadingClientNotes] = useState(false);
  /** Highlights which saved client note text is currently in the job note field. */
  const [jobNoteFromSecureId, setJobNoteFromSecureId] = useState<number | null>(null);
  const [clientSearchFocused, setClientSearchFocused] = useState(false);
  const [serviceSearchFocused, setServiceSearchFocused] = useState(false);
  const clientSearchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serviceSearchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showAssignChip = admin && teamUsers.length > 1;
  const canCreate =
    !!selectedClient && selectedServices.length > 0 && !saving && !loading;

  useEffect(() => {
    if (!visible) return;
    setClientSearch('');
    setServiceSearch('');
    setSelectedClient(null);
    setSelectedServices([]);
    setAssigneeId(user.id);
    setShowAssignList(false);
    setShowTimePickerModal(false);
    setShowNoteEditor(false);
    setTimeFrom('');
    setTimeTo('');
    setNote('');
    setClientSecureNotes([]);
    setJobNoteFromSecureId(null);
    setClientSearchFocused(false);
    setServiceSearchFocused(false);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const [cRes, sRes, uRes] = await Promise.all([
          apiClient.get('/clients'),
          apiClient.get('/services'),
          apiClient.get('/users').catch(() => ({ data: { users: [] } })),
        ]);
        if (cancelled) return;
        setClients((cRes.data?.clients || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          last_name: c.last_name,
          client_type: c.client_type,
          address: c.address ?? null,
          zip_code: c.zip_code ?? null,
          city: c.city ?? null,
          email: c.email ?? null,
        })));
        setServices((sRes.data?.services || []).map((s: any) => ({
          id: s.id,
          title: s.title || s.name || 'Service',
          price: s.price,
          duration_minutes: Number(s.duration_minutes) || 0,
        })));
        const rawUsers = (uRes as any)?.data?.users || [];
        setTeamUsers(
          rawUsers.map((u: any) => ({
            id: u.id,
            first_name: u.first_name || '',
            last_name: u.last_name || '',
          })),
        );
      } catch (e) {
        console.warn('MobileCreateJobModal load', e);
        Alert.alert('Error', 'Could not load data for this form.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, user.id]);

  useEffect(() => {
    return () => {
      if (clientSearchBlurTimer.current) clearTimeout(clientSearchBlurTimer.current);
      if (serviceSearchBlurTimer.current) clearTimeout(serviceSearchBlurTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible || !selectedClient) {
      setClientSecureNotes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingClientNotes(true);
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const res = await apiClient.get(`/clients/${selectedClient.id}/secure-notes`);
        if (!cancelled) {
          const raw = res.data?.notes || [];
          setClientSecureNotes(
            raw.map((n: any) => ({
              id: n.id,
              note: n.note ?? '',
              createdAt: n.createdAt,
              updatedAt: n.updatedAt,
            })),
          );
        }
      } catch {
        if (!cancelled) setClientSecureNotes([]);
      } finally {
        if (!cancelled) setLoadingClientNotes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, selectedClient?.id]);

  const clientQuery = clientSearch;
  const rankedClients = useMemo(
    () => rankClientsForPicker(clients, clientQuery),
    [clients, clientQuery],
  );
  const showClientPicker =
    !selectedClient &&
    clientSearchFocused &&
    (rankedClients.length > 0 || clientQuery.trim().length > 0);

  const serviceQuery = serviceSearch;
  const selectedServiceIds = useMemo(
    () => new Set(selectedServices.map((x) => x.id)),
    [selectedServices],
  );
  const rankedServicePicks = useMemo(
    () => rankServicesForPicker(services, serviceQuery, selectedServiceIds),
    [services, serviceQuery, selectedServiceIds],
  );
  const showServicePicker =
    !!selectedClient &&
    serviceSearchFocused &&
    (rankedServicePicks.length > 0 || serviceQuery.trim().length > 0);

  const assigneeName = useMemo(() => {
    const u = teamUsers.find((x) => x.id === assigneeId);
    if (!u) return 'Employee';
    return `${u.first_name} ${u.last_name}`.trim();
  }, [teamUsers, assigneeId]);

  const addServiceFromSearch = (s: MobileServicePick) => {
    setSelectedServices((prev) => {
      if (prev.some((x) => x.id === s.id)) return prev;
      return [...prev, serviceToSelected(s)];
    });
    setServiceSearch('');
  };

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

  const submit = async () => {
    if (!selectedClient || selectedServices.length === 0 || saving) return;
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const tf = timeFrom.trim();
      const tt = timeTo.trim();
      const timeRe = /^\d{2}:\d{2}$/;
      if (tf && !timeRe.test(tf)) {
        Alert.alert('Check time', 'Use HH:MM for start time (e.g. 09:00).');
        setSaving(false);
        return;
      }
      if (tt && !timeRe.test(tt)) {
        Alert.alert('Check time', 'Use HH:MM for end time (e.g. 11:00).');
        setSaving(false);
        return;
      }
      await apiClient.post('/jobs', {
        title: '',
        client_id: selectedClient.id,
        assigned_user_id: assigneeId,
        scheduled_date: scheduledDate,
        scheduled_time_from: tf || null,
        scheduled_time_to: tt || null,
        note: note.trim() || null,
        services: selectedServices.map((s) => ({
          service_id: s.id,
          custom_price: parseFloat(s.customPrice) || 0,
          custom_duration: parseInt(s.customDuration, 10) || 0,
        })),
      });
      Alert.alert('Job created', 'The job has been added to this day.');
      onCreated();
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Could not create the job.';
      Alert.alert('Error', String(msg));
    } finally {
      setSaving(false);
    }
  };

  const timeSummaryLabel =
    timeFrom && timeTo
      ? `${timeFrom} – ${timeTo}`
      : timeFrom
        ? timeFrom
        : 'Add time';

  return (
    <>
    <Modal
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
    >
      <KeyboardAvoidingView
        style={styles.createJobModalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.createJobModalHeaderCompact, { paddingTop: insets.top + 6 }]}>
          <View style={styles.createJobModalDateBarWrap}>
            <Text
              style={styles.createJobModalDateBar}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {formatLongDate(scheduledDate)}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.createJobModalHeaderSideBtn}>
            <View style={styles.createJobHeaderBtnLabelWrap}>
              <Text style={styles.createJobModalCancel} numberOfLines={1}>
                {padAndroidText('Cancel')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={styles.createJobModalLoading}>
            <ActivityIndicator size="large" color="#193434" />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: insets.bottom + 100,
              }}
              keyboardShouldPersistTaps="handled"
            >
            <Text style={styles.createModalSectionLabel}>Client</Text>
            {selectedClient ? (
              <View style={styles.createClientPill}>
                <View style={styles.createClientPillTextCol}>
                  <Text style={styles.createClientPillText} numberOfLines={1}>
                    {formatClientLine(selectedClient)}
                  </Text>
                  <Text style={styles.createClientPillSub} numberOfLines={1}>
                    {clientSubline(selectedClient)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedClient(null)}
                  style={styles.createClientPillChangeBtn}
                >
                  <Text style={styles.createClientPillChange} numberOfLines={1}>
                    {padAndroidText('Change')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={[styles.createModalInput, styles.createModalInputClientSearch]}
                  placeholder="Choose a client — type to search"
                  placeholderTextColor="#94A3B8"
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  onFocus={() => {
                    if (clientSearchBlurTimer.current) {
                      clearTimeout(clientSearchBlurTimer.current);
                      clientSearchBlurTimer.current = null;
                    }
                    setClientSearchFocused(true);
                  }}
                  onBlur={() => {
                    clientSearchBlurTimer.current = setTimeout(() => {
                      setClientSearchFocused(false);
                      clientSearchBlurTimer.current = null;
                    }, 220);
                  }}
                />
                {showClientPicker && rankedClients.length === 0 ? (
                  <Text style={styles.createDropdownHint}>
                    {clientQuery.trim().length > 0
                      ? 'No clients match.'
                      : clients.length === 0
                        ? 'No clients yet.'
                        : ''}
                  </Text>
                ) : showClientPicker ? (
                  <View style={styles.createClientList}>
                    {rankedClients.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.createClientRow}
                        onPress={() => {
                          if (clientSearchBlurTimer.current) {
                            clearTimeout(clientSearchBlurTimer.current);
                            clientSearchBlurTimer.current = null;
                          }
                          setSelectedClient(c);
                          setClientSearch('');
                          setClientSearchFocused(false);
                        }}
                      >
                        <Text style={styles.createClientRowText}>{formatClientLine(c)}</Text>
                        <Text style={styles.createClientRowSub}>{clientSubline(c)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            )}

            <Text style={[styles.createModalSectionLabel, { marginTop: 20 }]}>
              Services
            </Text>
            {!selectedClient ? (
              <Text style={styles.createDropdownHint}>Select a client first.</Text>
            ) : (
              <>
                <TextInput
                  style={styles.createModalInput}
                  placeholder="Search services to add…"
                  placeholderTextColor="#94A3B8"
                  value={serviceSearch}
                  onChangeText={setServiceSearch}
                  onFocus={() => {
                    if (serviceSearchBlurTimer.current) {
                      clearTimeout(serviceSearchBlurTimer.current);
                      serviceSearchBlurTimer.current = null;
                    }
                    setServiceSearchFocused(true);
                  }}
                  onBlur={() => {
                    serviceSearchBlurTimer.current = setTimeout(() => {
                      setServiceSearchFocused(false);
                      serviceSearchBlurTimer.current = null;
                    }, 220);
                  }}
                />
                {showServicePicker && rankedServicePicks.length === 0 ? (
                  <Text style={styles.createDropdownHint}>
                    No matching services, or all are already added.
                  </Text>
                ) : showServicePicker ? (
                  <View style={styles.createClientList}>
                    {rankedServicePicks.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.createClientRow}
                        onPress={() => {
                          if (serviceSearchBlurTimer.current) {
                            clearTimeout(serviceSearchBlurTimer.current);
                            serviceSearchBlurTimer.current = null;
                          }
                          addServiceFromSearch(s);
                          setServiceSearchFocused(false);
                        }}
                      >
                        <Text style={styles.createClientRowText}>{s.title}</Text>
                        <Text style={styles.createClientRowSub}>
                          {typeof s.price === 'string'
                            ? parseFloat(s.price)
                            : Number(s.price) || 0}{' '}
                          kr · {s.duration_minutes} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            )}

            {selectedServices.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                {selectedServices.map((s) => (
                  <View key={s.id} style={styles.createSelectedSvcCard}>
                    <View style={styles.createSelectedSvcInlineRow}>
                      <Text
                        style={styles.createSelectedSvcTitle}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {s.title}
                      </Text>
                      <View style={styles.createSelectedSvcInputsRight}>
                        <Text style={styles.createSelectedSvcMetaLabel} numberOfLines={1}>
                          {padAndroidText('Price')}
                        </Text>
                        <TextInput
                          style={styles.createSelectedSvcMetaInputPrice}
                          keyboardType="decimal-pad"
                          value={s.customPrice}
                          onChangeText={(t) => updateSvcField(s.id, 'customPrice', t)}
                        />
                        <Text style={styles.createSelectedSvcMetaLabel} numberOfLines={1}>
                          {padAndroidText('min')}
                        </Text>
                        <TextInput
                          style={styles.createSelectedSvcMetaInputMin}
                          keyboardType="number-pad"
                          value={s.customDuration}
                          onChangeText={(t) => updateSvcField(s.id, 'customDuration', t)}
                        />
                        <TouchableOpacity
                          onPress={() => removeService(s.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.createSelectedSvcRemoveBtn}
                        >
                          <Text style={styles.createSelectedSvcRemove}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {selectedClient ? (
              <>
                <Text style={[styles.createModalSectionLabel, { marginTop: 20 }]}>
                  Options
                </Text>
                <View style={styles.createJobPillRow}>
                  {showAssignChip ? (
                    <TouchableOpacity
                      style={[
                        styles.createJobPill,
                        showAssignList && styles.createJobPillActive,
                      ]}
                      onPress={() => {
                        setShowAssignList((v) => !v);
                        setShowTimePickerModal(false);
                        setShowNoteEditor(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <IconUserOutline
                        color={showAssignList ? '#FFFFFF' : '#64748B'}
                        size={18}
                      />
                      <View style={styles.createJobPillLabelWrap}>
                        <Text
                          style={[
                            styles.createJobPillText,
                            showAssignList && styles.createJobPillTextOn,
                          ]}
                          numberOfLines={1}
                        >
                          {padAndroidText(assigneeName)}
                        </Text>
                      </View>
                      <IconPlusMini color={showAssignList ? '#E2E8F0' : '#94A3B8'} size={13} />
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.createJobPill,
                      (timeFrom || timeTo) ? styles.createJobPillFilled : null,
                      showTimePickerModal && styles.createJobPillActive,
                    ]}
                    onPress={() => {
                      setShowTimePickerModal(true);
                      setShowAssignList(false);
                      setShowNoteEditor(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <CardClockIcon
                      color={showTimePickerModal ? '#FFFFFF' : '#64748B'}
                    />
                    <View style={styles.createJobPillLabelWrap}>
                      <Text
                        style={[
                          styles.createJobPillText,
                          showTimePickerModal && styles.createJobPillTextOn,
                        ]}
                        numberOfLines={1}
                      >
                        {padAndroidText(timeSummaryLabel)}
                      </Text>
                    </View>
                    {!(timeFrom || timeTo) ? (
                      <IconPlusMini
                        color={showTimePickerModal ? '#E2E8F0' : '#94A3B8'}
                        size={13}
                      />
                    ) : null}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.createJobPill,
                      note.trim() ? styles.createJobPillFilled : null,
                      showNoteEditor && styles.createJobPillActive,
                    ]}
                    onPress={() => {
                      setShowNoteEditor((v) => !v);
                      setShowAssignList(false);
                      setShowTimePickerModal(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <IconPencilSquare color={showNoteEditor ? '#FFFFFF' : '#64748B'} size={18} />
                    <View style={styles.createJobPillLabelWrap}>
                      <Text
                        style={[
                          styles.createJobPillText,
                          showNoteEditor && styles.createJobPillTextOn,
                        ]}
                        numberOfLines={1}
                      >
                        {padAndroidText(note.trim() ? 'Note' : 'Add note')}
                      </Text>
                    </View>
                    {!note.trim() ? (
                      <IconPlusMini color={showNoteEditor ? '#E2E8F0' : '#94A3B8'} size={13} />
                    ) : null}
                  </TouchableOpacity>
                </View>

                {showAssignList && showAssignChip ? (
                  <View style={styles.createAssignList}>
                    {teamUsers.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.createAssignRow}
                        onPress={() => {
                          setAssigneeId(u.id);
                          setShowAssignList(false);
                        }}
                      >
                        <Text style={styles.createAssignRowText}>
                          {u.first_name} {u.last_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {showNoteEditor ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.createNoteFieldLabel}>
                      Client saved notes (encrypted)
                    </Text>
                    <Text style={styles.createNoteFieldHint}>
                      From the client profile — tap to put on this job. Edit below if needed.
                    </Text>
                    {loadingClientNotes ? (
                      <ActivityIndicator
                        style={{ marginTop: 12 }}
                        color="#193434"
                      />
                    ) : clientSecureNotes.length === 0 ? (
                      <Text style={[styles.createDropdownHint, { marginTop: 8 }]}>
                        No saved standard notes for this client yet.
                      </Text>
                    ) : (
                      <View style={styles.createSavedNotePickList}>
                        {clientSecureNotes.map((row) => (
                          <TouchableOpacity
                            key={row.id}
                            style={[
                              styles.createSavedNotePickRow,
                              jobNoteFromSecureId === row.id &&
                                styles.createSavedNotePickRowOn,
                            ]}
                            onPress={() => {
                              setNote(row.note);
                              setJobNoteFromSecureId(row.id);
                            }}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={styles.createSavedNotePickText}
                              numberOfLines={4}
                            >
                              {row.note}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <Text style={[styles.createNoteFieldLabel, { marginTop: 14 }]}>
                      Job note
                    </Text>
                    <Text style={styles.createNoteFieldHint}>
                      Plain text on this job only.
                    </Text>
                    <TextInput
                      style={[
                        styles.createModalInput,
                        styles.createModalInputMultiline,
                        { marginTop: 6 },
                      ]}
                      placeholder="Optional — visible on the job…"
                      placeholderTextColor="#94A3B8"
                      value={note}
                      onChangeText={(t) => {
                        setNote(t);
                        setJobNoteFromSecureId(null);
                      }}
                      multiline
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            </ScrollView>
            <View
              style={[
                styles.createJobFooter,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.createJobFooterBtn,
                  !canCreate && styles.createJobFooterBtnDisabled,
                ]}
                onPress={submit}
                disabled={!canCreate}
                activeOpacity={0.88}
              >
                <Text
                  style={[
                    styles.createJobFooterBtnText,
                    !canCreate && styles.createJobFooterBtnTextDisabled,
                  ]}
                >
                  {saving ? 'Creating…' : 'Create job'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
    <MobileJobTimePickerModal
      visible={visible && showTimePickerModal}
      onClose={() => setShowTimePickerModal(false)}
      initialFrom={timeFrom}
      initialTo={timeTo}
      onApply={(from, to) => {
        setTimeFrom(from);
        setTimeTo(to);
      }}
    />
    </>
  );
}

const APPT_CATEGORY_OPTIONS_MOBILE: {
  value: ApptCategoryMobile;
  label: string;
}[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'sick', label: 'Sick' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'other', label: 'Other' },
];

function MobileCreateWorkAppointmentModal({
  visible,
  onClose,
  appointmentDate,
  userId,
  isAdmin,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  appointmentDate: string;
  userId: number;
  isAdmin: boolean;
  onCreated: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ApptCategoryMobile>('personal');
  const [timeMode, setTimeMode] = useState<'all_day' | 'span' | 'hours'>('span');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [hoursOff, setHoursOff] = useState('1');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setCategory('personal');
    setTimeMode('span');
    setStartTime('09:00');
    setEndTime('10:00');
    setHoursOff('1');
    setNotes('');
    setSaving(false);
  }, [visible]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    if (timeMode === 'span') {
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
        Alert.alert('Check times', 'Use HH:MM for start and end.');
        return;
      }
      if (startTime >= endTime) {
        Alert.alert('Check times', 'End must be after start.');
        return;
      }
    }
    if (timeMode === 'hours') {
      const n = Number(String(hoursOff).replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0 || n > 24) {
        Alert.alert('Check hours', 'Hours must be between 0 and 24.');
        return;
      }
    }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const payload: Record<string, unknown> = {
        user_id: userId,
        title: trimmed,
        category,
        notes: notes.trim() || null,
        appointment_date: appointmentDate,
        time_mode: timeMode,
        start_time: timeMode === 'span' ? startTime : null,
        end_time: timeMode === 'span' ? endTime : null,
        hours_off: timeMode === 'hours' ? Number(String(hoursOff).replace(',', '.')) : null,
      };
      if (isAdmin) payload.kind = 'work';
      await apiClient.post('/appointments', payload);
      Alert.alert(
        isAdmin ? 'Appointment created' : 'Request sent',
        isAdmin
          ? 'The appointment has been added.'
          : 'Your manager will see this request.',
      );
      onCreated();
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Could not save the appointment.';
      Alert.alert('Error', String(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#F6F9F7' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.createJobModalHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.createJobModalHeaderSideBtn}>
            <View style={styles.createJobHeaderBtnLabelWrap}>
              <Text style={styles.createJobModalCancel} numberOfLines={1}>
                {padAndroidText('Cancel')}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.createJobModalTitleWrap}>
            <Text style={styles.createJobModalTitleCentered} numberOfLines={2}>
              {isAdmin ? 'New appointment' : 'Request appointment'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={submit}
            disabled={saving || !title.trim()}
            hitSlop={12}
            style={styles.createJobModalHeaderSideBtn}
          >
            <Text
              style={[
                styles.createJobModalSave,
                (!title.trim() || saving) && styles.createJobModalSaveDisabled,
              ]}
            >
              {saving ? 'Saving…' : isAdmin ? 'Create' : 'Submit'}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.createJobModalDateHint}>Date: {appointmentDate}</Text>
          <Text style={styles.createModalSectionLabel}>Title</Text>
          <TextInput
            style={styles.createModalInput}
            placeholder="e.g. Dentist, Team meeting…"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.createModalSectionLabel, { marginTop: 16 }]}>Category</Text>
          <View style={styles.createApptCatRow}>
            {APPT_CATEGORY_OPTIONS_MOBILE.map((opt) => {
              const on = category === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.createApptCatChip, on && styles.createApptCatChipOn]}
                  onPress={() => setCategory(opt.value)}
                >
                  <Text style={[styles.createApptCatChipText, on && styles.createApptCatChipTextOn]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.createModalSectionLabel, { marginTop: 16 }]}>When</Text>
          <View style={styles.createTimeModeRow}>
            {(['all_day', 'span', 'hours'] as const).map((m) => {
              const on = timeMode === m;
              const label = m === 'all_day' ? 'All day' : m === 'span' ? 'Time range' : 'Hours';
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.createTimeModeChip, on && styles.createTimeModeChipOn]}
                  onPress={() => setTimeMode(m)}
                >
                  <Text style={[styles.createTimeModeChipText, on && styles.createTimeModeChipTextOn]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {timeMode === 'span' ? (
            <View style={styles.createTimeRow}>
              <TextInput
                style={[styles.createModalInput, styles.createTimeInput]}
                placeholder="09:00"
                placeholderTextColor="#94A3B8"
                value={startTime}
                onChangeText={setStartTime}
              />
              <TextInput
                style={[styles.createModalInput, styles.createTimeInput]}
                placeholder="10:00"
                placeholderTextColor="#94A3B8"
                value={endTime}
                onChangeText={setEndTime}
              />
            </View>
          ) : null}
          {timeMode === 'hours' ? (
            <TextInput
              style={styles.createModalInput}
              placeholder="Hours off (e.g. 2.5)"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={hoursOff}
              onChangeText={setHoursOff}
            />
          ) : null}

          <Text style={[styles.createModalSectionLabel, { marginTop: 16 }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.createModalInput, styles.createModalInputMultiline]}
            placeholder="Details…"
            placeholderTextColor="#94A3B8"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DayViewScreen({ route, navigation }: any) {
  const { date, company, user, openJobId, openAppointmentComposer } =
    route.params || {};
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [approvedTimeOff, setApprovedTimeOff] = useState<AppointmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingJobDetails, setIsLoadingJobDetails] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isSlideoutVisible, setIsSlideoutVisible] = useState(false);
  const screenHeight = Dimensions.get('window').height;

  // Handoff flow state: `handoffData` is the payload from the server
  // (current + next job + drive time), `handoffVisible` drives the
  // sheet animation, and `isCompletingJob` / `isStartingJob` lock the
  // respective CTAs while network calls are in flight.
  const [handoffVisible, setHandoffVisible] = useState(false);
  const [handoffData, setHandoffData] = useState<HandoffResponse | null>(null);
  const [isCompletingJob, setIsCompletingJob] = useState(false);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [createApptOpen, setCreateApptOpen] = useState(false);
  const adminUser = isAdminRole(company, user);

  // Month banner images mapping (months are 0-indexed in JavaScript)
  const monthBanners: { [key: number]: any } = {
    0: require('./assets/images/jan.jpg'),   // January
    1: require('./assets/images/feb.jpg'),   // February
    2: require('./assets/images/mar.jpg'),   // March
    3: require('./assets/images/apr.jpg'),   // April
    4: require('./assets/images/maj.jpg'),   // May
    5: require('./assets/images/jun.jpg'),   // June
    6: require('./assets/images/jul.jpg'),   // July
    7: require('./assets/images/aug.jpg'),   // August
    8: require('./assets/images/sep.jpg'),   // September
    9: require('./assets/images/okt.jpg'),   // October
    10: require('./assets/images/nov.jpg'),  // November
    11: require('./assets/images/dec.jpg'),  // December
  };
  
  // Bottom-sheet snap points expressed as absolute translateY values.
  // Modern single-state sheet: opens fully (top of screen) or closed
  // (off bottom). No halfway peek state - just click and the panel
  // takes over the screen, then drag down to dismiss.
  const SNAP_EXPANDED_Y = 0;
  const SNAP_CLOSED_Y = screenHeight;

  const slideoutTranslateY = useRef(new Animated.Value(SNAP_CLOSED_Y)).current;
  const keyboardOffsetY = useRef(new Animated.Value(0)).current;
  const currentSnapRef = useRef<number>(SNAP_CLOSED_Y);
  const dragStartY = useRef<number>(SNAP_CLOSED_Y);
  const grantDy = useRef(0);
  const openedJobFromNavRef = useRef<number | null>(null);

  // Collapsing header: as the list scrolls up, the banner text fades
  // and parallaxes slightly while the list moves over the banner to
  // "take it over". Sizes picked to roughly match the old fixed banner.
  const HEADER_HEIGHT = 180;
  const HEADER_OVERLAP = 20; // how much the rounded panel covers the banner at rest
  const scrollY = useRef(new Animated.Value(0)).current;
  const bannerTextOpacity = scrollY.interpolate({
    inputRange: [0, 70],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const bannerTextTranslate = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -24],
    extrapolate: 'clamp',
  });
  const bannerOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_HEIGHT - HEADER_OVERLAP - 20, HEADER_HEIGHT - HEADER_OVERLAP],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const bannerTranslate = scrollY.interpolate({
    inputRange: [0, HEADER_HEIGHT],
    outputRange: [0, -HEADER_HEIGHT * 0.35],
    extrapolate: 'clamp',
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = useState(new Animated.Value(0))[0];
  // Measured height of the rendered panel content. Used to compute how
  // far up the user can drag: the panel may be pulled up until its
  // bottom aligns with the bottom of the screen.
  const [contentHeight, setContentHeight] = useState<number>(screenHeight);
  const contentHeightRef = useRef<number>(screenHeight);

  const getMinY = () => Math.min(0, screenHeight - contentHeightRef.current);

  // Snappy modern spring - tighter than a bouncy iOS sheet, but with
  // a hint of overshoot so the open feels lively rather than mechanical.
  const SHEET_SPRING = {
    useNativeDriver: true,
    stiffness: 360,
    damping: 32,
    mass: 0.85,
    overshootClamping: false,
    restDisplacementThreshold: 0.5,
    restSpeedThreshold: 0.5,
  } as const;

  const animateSheetTo = (target: number, onFinished?: () => void) => {
    currentSnapRef.current = target;
    Animated.spring(slideoutTranslateY, {
      ...SHEET_SPRING,
      toValue: target,
    }).start(({ finished }) => {
      if (finished) onFinished?.();
    });
  };

  // Closing uses a fast, single-motion timing animation - no spring
  // overshoot, no settle. The sheet just slides off the bottom.
  const SHEET_CLOSE_DURATION = 240;
  const closeSheet = () => {
    currentSnapRef.current = SNAP_CLOSED_Y;
    Animated.timing(slideoutTranslateY, {
      toValue: SNAP_CLOSED_Y,
      duration: SHEET_CLOSE_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsSlideoutVisible(false);
        setSelectedJob(null);
      }
    });
  };

  useEffect(() => {
    const id = slideoutTranslateY.addListener(({ value }) => {
      const expanded = value <= 40;
      setIsExpanded(prev => (prev !== expanded ? expanded : prev));
    });
    return () => { slideoutTranslateY.removeListener(id); };
  }, []);

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        const keyboardHeight = event.endCoordinates?.height || 0;
        Animated.timing(keyboardOffsetY, {
          toValue: -(keyboardHeight + 80),
          duration: event.duration || 250,
          useNativeDriver: true,
        }).start();
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (event) => {
        Animated.timing(keyboardOffsetY, {
          toValue: 0,
          duration: event.duration || 250,
          useNativeDriver: true,
        }).start();
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  useEffect(() => {
    fetchDayJobs();
  }, [date]);

  useEffect(() => {
    openedJobFromNavRef.current = null;
  }, [date]);

  useEffect(() => {
    if (!openAppointmentComposer) return;
    setCreateApptOpen(true);
    const t = setTimeout(() => {
      navigation.setParams?.({ openAppointmentComposer: undefined });
    }, 0);
    return () => clearTimeout(t);
  }, [openAppointmentComposer, navigation]);

  // Refetch whenever DayView regains focus (e.g. after the JobCompose stack
  // screen closes). Skip the very first focus so we don't double-fetch with
  // the date effect above on initial mount.
  useEffect(() => {
    const skipFirstRef = { value: true };
    const unsub = navigation?.addListener?.('focus', () => {
      if (skipFirstRef.value) {
        skipFirstRef.value = false;
        return;
      }
      fetchDayJobs();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [navigation]);

  // Week-wide job map used to render status dots in the WeekSelector.
  const [weekJobsByDate, setWeekJobsByDate] = useState<{ [iso: string]: Array<{ status: string }> }>({});
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const parts = date.split('-').map(Number);
        const sel = new Date(parts[0], parts[1] - 1, parts[2]);
        const dow = sel.getDay();
        const weekStart = new Date(sel);
        weekStart.setDate(sel.getDate() + (dow === 0 ? -6 : 1 - dow));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const toISO = (d: Date) =>
          `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const wk0 = toISO(weekStart);
        const wk1 = toISO(weekEnd);
        const [jobsRes, apptRes] = await Promise.all([
          apiClient.get(`/jobs?start_date=${wk0}&end_date=${wk1}`),
          apiClient.get('/appointments?status=all').catch(() => null),
        ]);
        const allJobs = jobsRes.data?.jobs || [];
        const userJobs = allJobs.filter((j: any) => j.assigned_user_id === user?.id);
        const byDate: { [k: string]: Array<{ status: string }> } = {};
        for (const job of userJobs) {
          if (!job.scheduled_date) continue;
          const key = String(job.scheduled_date).split('T')[0].split(' ')[0];
          if (!byDate[key]) byDate[key] = [];
          byDate[key].push({ status: job.status || 'scheduled' });
        }
        const appointments = (apptRes as any)?.data?.appointments || [];
        for (const a of appointments as AppointmentRow[]) {
          if (a.kind !== 'time_off') continue;
          if (Number(a.user_id) !== Number(user?.id)) continue;
          if (a.status !== 'approved' && a.status !== 'requested') continue;
          const s = appointmentDateOnly(a.appointment_date);
          const e = appointmentEndIsoStr(a);
          const lo = s > wk0 ? s : wk0;
          const hi = e < wk1 ? e : wk1;
          if (lo > hi) continue;
          forEachIsoDayInclusive(lo, hi, (iso) => {
            if (!byDate[iso]) byDate[iso] = [];
            byDate[iso].push({ status: 'time_off' });
          });
        }
        if (!cancelled) setWeekJobsByDate(byDate);
      } catch (e) {
        console.warn('Failed to fetch week jobs', e);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [date, jobs, user?.id]);

  // Fixed start/end locations shown as bookends around the day's jobs.
  const [routeStart, setRouteStart] = useState<string | null>(null);
  const [routeEnd, setRouteEnd] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      const token = await AsyncStorage.getItem('authToken');
      if (token) apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const res = await fetchRouteLocations(user.id);
      if (cancelled) return;
      setRouteStart(res.startAddress);
      setRouteEnd(res.endAddress);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (isSlideoutVisible) {
      slideoutTranslateY.setValue(SNAP_CLOSED_Y);
      currentSnapRef.current = SNAP_CLOSED_Y;
      animateSheetTo(SNAP_EXPANDED_Y);
    }
  }, [isSlideoutVisible]);

  // Draggable panel. Binary close behavior: either snaps back to the
  // starting position (top or peek) or closes outright.
  const DECAY_FACTOR = 333;
  const TOP_SNAP_Y = 0;

  const sheetOnGrant = (_: any, g: any) => {
    slideoutTranslateY.stopAnimation((v: number) => {
      dragStartY.current = v;
    });
    dragStartY.current = currentSnapRef.current;
    grantDy.current = g.dy;
  };

  const sheetOnMove = (_: any, g: any) => {
    const next = dragStartY.current + (g.dy - grantDy.current);
    const clamped = Math.max(getMinY(), Math.min(SNAP_CLOSED_Y, next));
    slideoutTranslateY.setValue(clamped);
    currentSnapRef.current = clamped;
  };

  const sheetOnRelease = (_: any, g: any) => {
    const raw = dragStartY.current + (g.dy - grantDy.current);
    const minY = getMinY();
    const vy = g.vy;
    const projected = raw + vy * DECAY_FACTOR;

    if (projected < minY) {
      currentSnapRef.current = minY;
      Animated.spring(slideoutTranslateY, {
        ...SHEET_SPRING, velocity: vy, toValue: minY,
      }).start();
      return;
    }

    // Dismiss thresholds: a clear downward fling, OR the user has
    // dragged the sheet's top below ~22% of the screen. Otherwise
    // spring back to fully expanded - no halfway resting state.
    const dismissY = screenHeight * 0.22;
    if (vy > 0.7 || projected > dismissY) {
      closeSheet();
      return;
    }

    // Otherwise, settle wherever the projection lands inside the
    // [minY, TOP] band so users can still pull the panel UP past the
    // top to read more content if it's taller than the screen.
    const target = Math.max(minY, Math.min(TOP_SNAP_Y, projected));
    currentSnapRef.current = target;
    Animated.spring(slideoutTranslateY, {
      ...SHEET_SPRING, velocity: vy, toValue: target,
    }).start();
  };


  // Single pan responder. The whole panel is draggable from any point
  // on its surface - it's a "move" gesture, not a scroll.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        return Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 4;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: sheetOnGrant,
      onPanResponderMove: sheetOnMove,
      onPanResponderRelease: sheetOnRelease,
      onPanResponderTerminate: sheetOnRelease,
    })
  ).current;

  const handleJobPress = async (job: Job) => {
    setIsLoadingJobDetails(true);
    setSelectedJob(job);
    setIsSlideoutVisible(true);
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      console.log('📞 Fetching job details for job ID:', job.id);
      const response = await apiClient.get(`/jobs/${job.id}`);
      console.log('✅ Job details response:', response.data);
      const fullJob = response.data.job;
      setSelectedJob(fullJob);
    } catch (error: any) {
      console.error('❌ Error fetching job details:', error);
      Alert.alert('Error', `Failed to load job details: ${error.response?.status || 'Unknown error'}`);
    } finally {
      setIsLoadingJobDetails(false);
    }
  };

  useEffect(() => {
    if (!openJobId || !jobs.length) return;
    const nid = Number(openJobId);
    if (!Number.isFinite(nid) || openedJobFromNavRef.current === nid) return;
    const j = jobs.find((x: Job) => x.id === nid);
    if (j) {
      openedJobFromNavRef.current = nid;
      void handleJobPress(j);
      setTimeout(() => {
        navigation.setParams?.({ openJobId: undefined });
      }, 0);
    }
  }, [openJobId, jobs, navigation]);

  const closeSlideout = () => {
    closeSheet();
  };

  // Main "Complete" CTA on the sticky bottom bar. Finishes every task
  // that isn't already completed/cancelled, then fetches the handoff
  // payload and slides up the next-job sheet.
  const handleCompleteJob = async () => {
    if (!selectedJob || isCompletingJob) return;
    setIsCompletingJob(true);
    try {
      const { updatedJob, handoff } = await runCompleteAndHandoff(selectedJob);
      if (updatedJob) {
        setSelectedJob(updatedJob);
        setJobs((prev) =>
          prev.map((j) => (j.id === updatedJob.id ? { ...j, ...updatedJob } : j))
        );
      }
      setHandoffData(handoff);
      setHandoffVisible(true);
    } catch (e: any) {
      console.error('Error completing job', e?.response?.data || e.message);
      Alert.alert('Error', 'Could not complete this job. Please try again.');
    } finally {
      setIsCompletingJob(false);
    }
  };

  // "Start job" CTA on the handoff sheet. Fires /start for the next
  // job (optionally sending the on-the-way email), slides everything
  // away and opens the next job's sheet.
  const handleStartNextJob = async (notify: boolean) => {
    const next = handoffData?.next;
    if (!next || isStartingJob) return;
    setIsStartingJob(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      await apiClient.post(`/jobs/${next.id}/start`, {
        notify_customer: !!notify,
      });

      const stub: Job | null =
        jobs.find((j) => j.id === next.id) || null;

      setHandoffVisible(false);
      closeSheet();

      // Reopen the sheet on the next job after both close animations
      // finish. handleJobPress fetches the full job payload (services,
      // timeline, notes) so the slideout renders everything the worker
      // needs without a stale intermediate frame.
      setTimeout(() => {
        if (stub) {
          handleJobPress(stub);
        } else {
          handleJobPress({ id: next.id } as Job);
        }
      }, 320);
    } catch (e: any) {
      console.error('Error starting next job', e?.response?.data || e.message);
      Alert.alert('Error', 'Could not start the next job. Please try again.');
    } finally {
      setIsStartingJob(false);
    }
  };

  const handleCopy = (text: string) => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const handleToggleJobCompletion = async (job: Job, e?: any) => {
    if (e) {
      e.stopPropagation();
    }

    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      // "sub_completed" means some tasks completed, some cancelled:
      // the check is shown filled so another tap moves the whole job
      // back to scheduled (same as the web app's behavior).
      const wasCompleted = job.status === 'completed' || job.status === 'sub_completed';
      const newStatus: JobStatus = wasCompleted ? 'scheduled' : 'completed';

      await apiClient.put(`/jobs/${job.id}/status`, {
        status: newStatus,
      });

      setJobs(prevJobs =>
        prevJobs.map(j => j.id === job.id ? { ...j, status: newStatus } : j)
      );

      if (selectedJob && selectedJob.id === job.id) {
        setSelectedJob({ ...selectedJob, status: newStatus });
      }
    } catch (error: any) {
      console.error('Error toggling job completion:', error);
      Alert.alert('Error', 'Failed to update job status. Please try again.');
    }
  };

  const fetchDayJobs = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      const [jobsRes, apptRes] = await Promise.all([
        apiClient.get(`/jobs?start_date=${date}&end_date=${date}`),
        apiClient.get('/appointments?status=all').catch(() => null),
      ]);
      const allJobs = jobsRes.data.jobs || [];
      
      // Filter jobs for the logged-in user only
      const userJobs = allJobs.filter((job: Job) => job.assigned_user_id === user.id);
      
      setJobs(userJobs);
      const approvedRows: AppointmentRow[] = ((apptRes as any)?.data?.appointments || []).filter(
        (a: AppointmentRow) =>
          a.kind === 'time_off' &&
          Number(a.user_id) === Number(user.id) &&
          (a.status === 'approved' || a.status === 'requested') &&
          appointmentCoversLocalDay(date, a),
      );
      approvedRows.sort((a, b) => {
        if (a.status === b.status) return a.id - b.id;
        return a.status === 'requested' ? -1 : 1;
      });
      setApprovedTimeOff(approvedRows);
    } catch (error: any) {
      console.error('Error fetching day jobs:', error);
      Alert.alert('Error', 'Failed to load jobs for this day');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    // Add time to avoid timezone issues when parsing YYYY-MM-DD format
    const date = new Date(dateString + 'T00:00:00');
    // Use toLocaleDateString to get the full weekday name (avoids any manual array issues)
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return { dayName, formatted: `${day}/${month}/${year}` };
  };

  const formatTime = (timeFrom?: string, timeTo?: string) =>
    formatJobTimeWindow(timeFrom, timeTo);

  // Get month index from date string (format: YYYY-MM-DD)
  const getMonthFromDate = (dateString: string): number => {
    const dateObj = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
    return dateObj.getMonth();
  };

  const { dayName, formatted } = formatDate(date);

  if (isLoading) {
    return (
      <View style={styles.dayViewContainer}>
        <View style={styles.dayViewHeader}>
          <Image 
            source={monthBanners[getMonthFromDate(date)]} 
            style={styles.dayViewHeaderImage}
            resizeMode="cover"
          />
          <View style={styles.dayViewHeaderOverlay}>
            <View style={styles.dayViewHeaderContent}>
              <View style={styles.dayViewHeaderLeft}>
                <Text style={styles.dayViewDayName} numberOfLines={2} adjustsFontSizeToFit>
                  {dayName}
                </Text>
                <Text style={styles.dayViewDate} numberOfLines={1}>
                  {formatted}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.dayViewLoading}>
          <Text style={styles.loadingText}>Loading jobs...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dayViewContainer}>
      {/* Banner — absolutely positioned at the BOTTOM layer (zIndex 0).
          The list sits above it (zIndex 1) with a transparent paddingTop
          that lets the banner show through at rest, and covers it as
          the user scrolls. pointerEvents="none" so scroll gestures
          started over the banner pass through to the list. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dayViewHeader,
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: HEADER_HEIGHT,
            minHeight: HEADER_HEIGHT,
            paddingTop: 0,
            zIndex: 0,
            elevation: 0,
            opacity: bannerOpacity,
            transform: [{ translateY: bannerTranslate }],
          },
        ]}
      >
        <Image
          source={monthBanners[getMonthFromDate(date)]}
          style={styles.dayViewHeaderImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(61, 213, 122, 0.6)', 'rgba(61, 213, 122, 1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.dayViewHeaderOverlay}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.dayViewHeaderContent,
              {
                opacity: bannerTextOpacity,
                transform: [{ translateY: bannerTextTranslate }],
              },
            ]}
          >
            <View style={styles.dayViewHeaderLeft}>
              <Text style={styles.dayViewDayName} numberOfLines={2} adjustsFontSizeToFit>
                {dayName}
              </Text>
              <Text style={styles.dayViewDate} numberOfLines={1}>
                {formatted}
              </Text>
            </View>
          </Animated.View>
        </LinearGradient>
      </Animated.View>

      {/* Collapsing-header scroll list. The top `paddingTop` leaves a
          transparent window above the first content row so the banner
          shows through; scrolling pulls the rounded panel up over the
          banner. Each row is wrapped in a solid-bg strip so cards
          don't reveal the banner through inter-row gaps. */}
      <Animated.FlatList
        data={jobs}
        keyExtractor={(item: any) => item.id.toString()}
        style={{ flex: 1, zIndex: 1, elevation: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={[
          styles.dayViewJobsList,
          { padding: 0, paddingTop: HEADER_HEIGHT - HEADER_OVERLAP, paddingBottom: 120 },
        ]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.dayViewScrollHeader}>
            <WeekSelector
              selectedDate={date}
              jobsByDate={weekJobsByDate}
              onSelectDate={(iso) => {
                if (iso !== date) navigation.setParams({ date: iso });
              }}
            />
            {approvedTimeOff.map((row) => (
              <View key={`day-appt-${row.id}`} style={styles.dayViewListStripPadded}>
                <DayAppointmentRow row={row} />
              </View>
            ))}
            {jobs.length > 0 && routeStart ? (
              <View style={styles.dayViewListStripPadded}>
                <RouteStopRow type="start" address={routeStart} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }: any) => {
            const clientName = `${item.name || ''} ${item.last_name || ''}`.trim();
            const address = item.address ? `${item.address}${item.zip_code && item.city ? ' • ' : ''}${item.zip_code || ''} ${item.city || ''}`.trim() : '';
            const timeRange = formatTime(item.scheduled_time_from, item.scheduled_time_to);
            const durationMinutes = (item.estimated_duration && item.estimated_duration > 0)
              ? item.estimated_duration
              : (item.total_duration || 0);
            const duration = formatJobListDurationMinutes(durationMinutes);
            const isCompleted = item.status === 'completed';
            const isSubCompleted = item.status === 'sub_completed';
            const isCancelled = item.status === 'cancelled';
            const taskCount = item.all_service_count ?? item.service_count ?? 0;
            const mutedIconColor = isCompleted
              ? '#5BA878'
              : isSubCompleted
                ? '#B45309'
                : isCancelled
                  ? '#B08383'
                  : '#64748B';

            return (
              <View style={styles.dayViewListStripPadded}>
                <TouchableOpacity
                  style={[
                    styles.jobCard,
                    isCompleted && styles.jobCardCompleted,
                    isSubCompleted && styles.jobCardSubCompleted,
                    isCancelled && styles.jobCardCancelled,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleJobPress(item)}
                >
                  <Text style={styles.jobCardClientName}>{clientName || 'Unknown Client'}</Text>

                  {address && (
                    <Text style={styles.jobCardAddress}>{address}</Text>
                  )}

                  {timeRange && (
                    <View style={styles.jobCardTimeRow}>
                      <View style={styles.jobCardTimeIconWrap}>
                        <CardClockIcon color={mutedIconColor} />
                      </View>
                      <Text style={styles.jobCardTime}>{timeRange}</Text>
                    </View>
                  )}

                  <View style={styles.jobCardSeparator} />

                  <View style={styles.jobCardBar}>
                    <View style={styles.jobCardBarLeft}>
                      <View style={styles.jobCardBarIconWrap}>
                        <CardTasksIcon color={mutedIconColor} />
                      </View>
                      <Text
                        style={styles.jobCardBarTaskText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {taskCount} task{taskCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {duration && (
                      <View style={styles.jobCardBarRight}>
                        <View style={styles.jobCardBarIconWrap}>
                          <CardDurationIcon color={mutedIconColor} />
                        </View>
                        <Text style={styles.jobCardBarDurationText}>{duration}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.jobCardCheckbox}
                      onPress={(e) => handleToggleJobCompletion(item, e)}
                      activeOpacity={0.7}
                    >
                      {isCompleted ? (
                        <View style={styles.jobCardCheckboxChecked}>
                          <Text style={styles.jobCardCheckmark}>✓</Text>
                        </View>
                      ) : isSubCompleted ? (
                        <View style={styles.jobCardCheckboxSubCompleted}>
                          <Text style={styles.jobCardCheckmark}>✓</Text>
                        </View>
                      ) : isCancelled ? (
                        <View style={styles.jobCardCheckboxCancelled}>
                          <Text style={styles.jobCardCheckmarkCancelled}>✕</Text>
                        </View>
                      ) : (
                        <View style={styles.jobCardCheckboxUnchecked}>
                          <Text style={styles.jobCardCheckmarkUnchecked}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
          ListFooterComponent={
            jobs.length > 0 && routeEnd ? (
              <View style={styles.dayViewListStripPadded}>
                <RouteStopRow type="end" address={routeEnd} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={[styles.dayViewEmpty, styles.dayViewListStripPadded]}>
              <Text style={styles.dayViewEmptyText}>No jobs scheduled for this day</Text>
            </View>
          }
        />

      {/* Job detail sheet - hosted in a transparent Modal so it
          always renders above the rest of the app, including the
          collapsing banner and the day list, with a clean status-bar
          translucent backdrop. Opens directly to the fully expanded
          state - no halfway peek. Drag down or tap the backdrop to
          dismiss. */}
      <Modal
        visible={isSlideoutVisible}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={closeSlideout}
      >
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.sheetBackdrop,
              {
                opacity: slideoutTranslateY.interpolate({
                  inputRange: [0, SNAP_CLOSED_Y],
                  outputRange: [0.55, 0],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            <TouchableWithoutFeedback onPress={closeSlideout}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          </Animated.View>

          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.sheetSurface,
              {
                height: Math.max(screenHeight + 300, contentHeight + 60),
                transform: [
                  { translateY: slideoutTranslateY },
                  { translateY: keyboardOffsetY },
                ],
              },
            ]}
          >
            {isLoadingJobDetails ? (
              <View style={styles.slideoutLoading}>
                <Text style={styles.loadingText}>Loading job details...</Text>
              </View>
            ) : selectedJob ? (
              <View
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  if (h > 0 && Math.abs(h - contentHeightRef.current) > 1) {
                    contentHeightRef.current = h;
                    setContentHeight(h);
                  }
                }}
              >
                <JobDetailSlideout
                  job={selectedJob}
                  date={date}
                  company={company}
                  onClose={closeSlideout}
                  onCopy={handleCopy}
                  isExpanded={isExpanded}
                  onJobUpdate={(updatedJob) => {
                    setSelectedJob(updatedJob);
                    setJobs(prevJobs =>
                      prevJobs.map(j => j.id === updatedJob.id ? updatedJob : j)
                    );
                  }}
                  onJobDeleted={(jobId) => {
                    setJobs((prev) => prev.filter((j) => j.id !== jobId));
                  }}
                />
              </View>
            ) : null}
          </Animated.View>

          {/* Sticky thumb-zone "Complete" button. Lives outside the
              draggable panel so it's always within thumb reach, no
              matter how far up the sheet is pulled. */}
          <StickyCompleteBar
            visible={isSlideoutVisible && !handoffVisible && !isLoadingJobDetails}
            job={selectedJob}
            insetsBottom={insets.bottom}
            onPress={handleCompleteJob}
            isBusy={isCompletingJob}
          />

          {/* Next-job handoff sheet - slides up over the job sheet
              after "Complete" is tapped. Stays inside the modal so
              it inherits the fullscreen stacking context. */}
          <HandoffSheet
            visible={handoffVisible}
            data={handoffData}
            onClose={() => setHandoffVisible(false)}
            onStart={handleStartNextJob}
            isStarting={isStartingJob}
          />
        </View>
      </Modal>

      <DayViewAddPickerModal
        visible={addMenuVisible}
        onClose={() => setAddMenuVisible(false)}
        isAdmin={adminUser}
        onAddJob={() => {
          setAddMenuVisible(false);
          navigation.navigate('JobCompose', {
            company,
            user,
            scheduledDate: date,
          });
        }}
        onAddAppointment={() => setCreateApptOpen(true)}
      />
      <MobileCreateWorkAppointmentModal
        visible={createApptOpen}
        onClose={() => setCreateApptOpen(false)}
        appointmentDate={date}
        userId={user.id}
        isAdmin={adminUser}
        onCreated={() => {
          fetchDayJobs();
        }}
      />

      {/* Bottom navigation: quick actions for this day (replaces global tabs here). */}
      {company && user && !isSlideoutVisible && (
        <View style={styles.bottomNavContainer}>
          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() =>
              navigation.navigate('CompanyTabs', {
                company,
                user,
                initialTab: 'Calender',
              })
            }
            activeOpacity={0.75}
          >
            <ArrowLeftIcon color="#193434" />
            <Text style={styles.bottomNavLabel} numberOfLines={2}>
              Back
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() =>
              navigation.navigate('JobCompose', {
                company,
                user,
                scheduledDate: date,
              })
            }
            activeOpacity={0.75}
          >
            <IconDocumentText color="#193434" size={20} />
            <Text style={styles.bottomNavLabel} numberOfLines={2}>
              Add job
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() => setCreateApptOpen(true)}
            activeOpacity={0.75}
          >
            <IconCalendarDays color="#193434" size={20} />
            <Text style={styles.bottomNavLabel} numberOfLines={2}>
              Add event
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Toast Notification */}
      {toastVisible && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>Copied to clipboard</Text>
        </Animated.View>
      )}
    </View>
  );
}

// --- Lightweight global app header ----------------------------------------
//
// Sits above the bottom-tab navigator, scoped to the company tabs (Overview,
// Calender, Today). DayView screens have their own date header so we do not
// double-stack chrome there.
//
// Left: company name (truncates).  Right: burger button that opens the
// settings drawer.

function BurgerIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M3 6h18M3 12h18M3 18h18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChevronRightIcon({ color = '#94A3B8' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ArrowLeftIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
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
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function MobileAppHeader({
  companyName,
  onMenuPress,
}: {
  companyName: string;
  onMenuPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.appHeader, { paddingTop: insets.top + 6 }]}>
      <View style={styles.appHeaderInner}>
        <View style={styles.appHeaderCompanyWrap}>
          <Text style={styles.appHeaderCompany} numberOfLines={1}>
            {padAndroidText(companyName || 'PathPilo')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onMenuPress}
          style={styles.appHeaderMenuBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <BurgerIcon />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Settings drawer -------------------------------------------------------
//
// One drawer that hosts an internal "page stack" (menu → sub-page).  Each
// transition uses a snappy translateX so the user keeps spatial context: menu
// slides out left while the sub-page slides in from the right.
//
// Sub-pages mirror the web SettingsSidebar groups (Account / Company /
// Add-ons) by name, but each is reskinned for thumb-friendly mobile use.

type SettingsPage =
  | 'menu'
  | 'user'
  | 'business'
  | 'work-hours'
  | 'leads-form'
  | 'invoice-options'
  | 'notifications'
  | 'billing'
  | 'extensions';

type SettingsItem = {
  key: SettingsPage;
  label: string;
  description: string;
};

type SettingsGroup = {
  label: string;
  items: SettingsItem[];
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'Account',
    items: [
      {
        key: 'user',
        label: 'User',
        description: 'Your profile and language',
      },
    ],
  },
  {
    label: 'Company',
    items: [
      {
        key: 'business',
        label: 'Business',
        description: 'Company info, address, branding',
      },
      {
        key: 'work-hours',
        label: 'Work hours',
        description: 'Weekly availability per day',
      },
      {
        key: 'leads-form',
        label: 'Lead form',
        description: 'Public booking form',
      },
      {
        key: 'invoice-options',
        label: 'Invoice options',
        description: 'Defaults, terms, numbering',
      },
      {
        key: 'notifications',
        label: 'Notifications',
        description: 'What we email and to whom',
      },
      {
        key: 'billing',
        label: 'Plan & billing',
        description: 'PathPilo subscription',
      },
    ],
  },
  {
    label: 'Add-ons',
    items: [
      {
        key: 'extensions',
        label: 'Extensions',
        description: 'Optional integrations',
      },
    ],
  },
];

/** Same order as web sidebar: company-scoped paths under `/{slug}/…`. */
const MAIN_DRAWER_NAV: { label: string; description: string; segment: string }[] =
  [
    {
      label: 'Clients',
      description: 'People & companies you work with',
      segment: 'clients',
    },
    {
      label: 'Services',
      description: 'What you sell and how long it takes',
      segment: 'services',
    },
    {
      label: 'Invoices',
      description: 'Quotes, invoices, and payments',
      segment: 'invoices',
    },
    {
      label: 'Team',
      description: 'Users and access for this company',
      segment: 'team',
    },
  ];

function SettingsRow({
  label,
  description,
  onPress,
  badge,
}: {
  label: string;
  description: string;
  onPress: () => void;
  /** Small pill next to the title (e.g. Coming soon). */
  badge?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.settingsRow}
      activeOpacity={0.75}
    >
      <View style={styles.settingsRowText}>
        <View style={styles.settingsRowTitleRow}>
          <Text
            style={[styles.settingsRowLabel, { flex: 1, minWidth: 0 }]}
            numberOfLines={1}
          >
            {padAndroidText(label)}
          </Text>
          {badge ? (
            <View style={styles.settingsRowBadge}>
              <Text style={styles.settingsRowBadgeText} numberOfLines={1}>
                {padAndroidText(badge)}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.settingsRowDescription} numberOfLines={2}>
          {padAndroidText(description)}
        </Text>
      </View>
      <ChevronRightIcon />
    </TouchableOpacity>
  );
}

function SettingsSectionHeader({ children }: { children: string }) {
  return (
    <Text style={styles.settingsGroupLabel} numberOfLines={1}>
      {padAndroidText(children)}
    </Text>
  );
}

/** Same host derivation as `ManageOnWebCard` / main-menu web links. */
function getWebAppOrigin(): string | null {
  // Prefer an explicit web origin; the API server (port 8000) and the Next.js
  // app (port 3000 in dev) are separate hosts, so we can't just strip "/api"
  // off the API base URL.
  const explicit = String(API_CONFIG?.WEB_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const apiBase = String((apiClient as any)?.defaults?.baseURL || '');
  const stripped = apiBase.replace(/\/api\/?$/, '');
  // Best-effort: rewrite the dev API port (8000) to the Next.js dev port (3000).
  return stripped.replace(/:8000(\b|$)/, ':3000$1') || null;
}

function openWebPath(webPath: string): Promise<void> {
  const host = getWebAppOrigin();
  if (!host) {
    Alert.alert('Cannot open', 'Web URL is not configured.');
    return Promise.resolve();
  }
  const url = `${host}${webPath.startsWith('/') ? '' : '/'}${webPath}`;
  return Linking.openURL(url).catch(() => {
    Alert.alert('Cannot open', 'Could not open the page.');
  });
}

/**
 * Generic “Manage on web” card shown on settings pages whose form surface
 * is too large to make sense as a mobile-first edit experience yet.
 *
 * The mobile companion still gets value: it shows the section name, a short
 * description of what lives there, and a one-tap link to the matching web
 * page so the user does not have to dig.
 */
function ManageOnWebCard({
  title,
  description,
  webPath,
}: {
  title: string;
  description: string;
  webPath: string;
}) {
  const onOpen = () => {
    void openWebPath(webPath);
  };
  return (
    <View style={styles.settingsCard}>
      <Text style={styles.settingsCardTitle}>{padAndroidText(title)}</Text>
      <Text style={styles.settingsCardDescription}>
        {padAndroidText(description)}
      </Text>
      <TouchableOpacity
        onPress={onOpen}
        style={styles.settingsCardCta}
        activeOpacity={0.85}
      >
        <Text style={styles.settingsCardCtaText} numberOfLines={1}>
          {padAndroidText('Open on web')}
        </Text>
      </TouchableOpacity>
      <Text style={styles.settingsCardHint}>
        Full mobile editor coming in a follow-up update.
      </Text>
    </View>
  );
}

// --- User settings page (fully wired) -------------------------------------
//
// The user profile is small enough that it makes sense to fully port to
// mobile. It edits the same fields as the web settings page (`/settings/user`)
// and uses the shared `/user/profile` PUT endpoint.
function MobileUserSettingsPage({
  user,
  company,
}: {
  user: User;
  company: Company;
}) {
  const initialLanguage =
    ((user as any)?.languageCode === 'da' ? 'da' : 'en') as 'en' | 'da';
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [languageCode, setLanguageCode] = useState<'en' | 'da'>(initialLanguage);
  const [baseline, setBaseline] = useState<{
    firstName: string;
    lastName: string;
    languageCode: 'en' | 'da';
  }>({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    languageCode: initialLanguage,
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const roleLabel = String(
    (company as any)?.user_role ||
      (company as any)?.role ||
      (user as any)?.user_role ||
      (user as any)?.companyRole ||
      (user as any)?.role ||
      '',
  )
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const dirty =
    firstName !== baseline.firstName ||
    lastName !== baseline.lastName ||
    languageCode !== baseline.languageCode;

  useEffect(() => {
    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        const res = await apiClient.get('/user/profile');
        const p = res?.data?.user;
        if (!p) return;
        const nextFirst = String(p.firstName || '');
        const nextLast = String(p.lastName || '');
        const nextLang = (String(p.languageCode || 'en').toLowerCase() === 'da'
          ? 'da'
          : 'en') as 'en' | 'da';
        setFirstName(nextFirst);
        setLastName(nextLast);
        setLanguageCode(nextLang);
        setBaseline({
          firstName: nextFirst,
          lastName: nextLast,
          languageCode: nextLang,
        });
      } catch {
        // Keep optimistic local values if profile fetch fails.
      } finally {
        setLoadingProfile(false);
      }
    };
    void loadProfile();
  }, []);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      await apiClient.put('/user/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: user.email,
        languageCode,
      });
      setBaseline({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        languageCode,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e: any) {
      Alert.alert(
        'Could not save',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.settingsPageBody}>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsCardTitle}>{padAndroidText('Profile')}</Text>
        <Text style={styles.settingsCardDescription}>
          {padAndroidText('How your name appears in PathPilo.')}
        </Text>

        <View style={styles.settingsField}>
          <Text style={styles.settingsFieldLabel}>
            {padAndroidText('First name')}
          </Text>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            style={styles.settingsInput}
            placeholder="First name"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <View style={styles.settingsField}>
          <Text style={styles.settingsFieldLabel}>
            {padAndroidText('Last name')}
          </Text>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            style={styles.settingsInput}
            placeholder="Last name"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <View style={styles.settingsField}>
          <Text style={styles.settingsFieldLabel}>
            {padAndroidText('Email')}
          </Text>
          <Text style={styles.settingsReadonly}>
            {padAndroidText(user?.email || '—')}
          </Text>
          <Text style={styles.settingsHint}>
            {padAndroidText('Email is managed on the web for now.')}
          </Text>
        </View>

        <View style={styles.settingsField}>
          <Text style={styles.settingsFieldLabel}>
            {padAndroidText('Company')}
          </Text>
          <Text style={styles.settingsReadonly}>
            {padAndroidText(company?.name || '—')}
          </Text>
        </View>

        <View style={styles.settingsField}>
          <Text style={styles.settingsFieldLabel}>
            {padAndroidText('Company role')}
          </Text>
          <Text style={styles.settingsReadonly}>
            {padAndroidText(roleLabel || '—')}
          </Text>
          <Text style={styles.settingsHint}>
            {padAndroidText('Role can only be changed on the web by an owner/admin.')}
          </Text>
        </View>

        <View style={styles.settingsField}>
          <Text style={styles.settingsFieldLabel}>
            {padAndroidText('Language')}
          </Text>
          <View style={styles.settingsToggleRow}>
            {(['en', 'da'] as const).map((code) => {
              const on = languageCode === code;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => setLanguageCode(code)}
                  style={[
                    styles.settingsToggleBtn,
                    on && styles.settingsToggleBtnOn,
                  ]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.settingsToggleBtnText,
                      on && styles.settingsToggleBtnTextOn,
                    ]}
                    numberOfLines={1}
                  >
                    {padAndroidText(code === 'en' ? 'English' : 'Dansk')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          onPress={onSave}
          disabled={!dirty || saving}
          activeOpacity={0.88}
          style={[
            styles.settingsSaveBtn,
            (!dirty || saving) && styles.settingsSaveBtnDisabled,
            dirty && !saving && styles.settingsSaveBtnActive,
          ]}
        >
          <RNText
            style={[
              styles.settingsSaveBtnText,
              dirty && !saving
                ? styles.settingsSaveBtnTextActive
                : styles.settingsSaveBtnTextDisabled,
            ]}
            allowFontScaling={false}
          >
            {padAndroidText(
              loadingProfile
                ? 'Loading profile…'
                : saving
                  ? 'Saving…'
                  : saved
                    ? 'Saved ✓'
                    : 'Save changes',
            )}
          </RNText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MobileUserSettingsScreen(props: any) {
  const { route, navigation } = props;
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.settingsStandaloneRoot, { paddingTop: insets.top + 6 }]}>
      <View style={styles.settingsStandaloneHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.settingsStandaloneBackBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.settingsStandaloneBackTxt}>
            {padAndroidText('Back')}
          </Text>
        </TouchableOpacity>
        <Text style={styles.settingsStandaloneTitle} numberOfLines={1}>
          {padAndroidText('User')}
        </Text>
        <View style={styles.settingsStandaloneBackBtn} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <MobileUserSettingsPage user={user} company={company} />
      </ScrollView>
    </View>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;

type DrawerMenuTab = 'main' | 'settings';

function MobileSettingsDrawer({
  visible,
  onClose,
  company,
  user,
  onLogout,
  onNavigateToClients,
  onNavigateToServices,
  onNavigateToInvoices,
  onNavigateToTeam,
  onNavigateToUserSettings,
  onNavigateToBusinessSettings,
  onNavigateToWorkHoursSettings,
  onNavigateToInvoiceOptionsSettings,
  onNavigateToNotificationsSettings,
}: {
  visible: boolean;
  onClose: () => void;
  company: Company;
  user: User;
  onLogout: () => void;
  /** Native Clients stack (list → detail); desktop parity without leaving the app. */
  onNavigateToClients?: () => void;
  onNavigateToServices?: () => void;
  onNavigateToTeam?: () => void;
  onNavigateToUserSettings?: () => void;
  /** Native Invoices stack (list → detail → status / payments). */
  onNavigateToInvoices?: () => void;
  /** Native Business settings (company profile, logo, URL). */
  onNavigateToBusinessSettings?: () => void;
  /** Native default work hours (company template for new employees). */
  onNavigateToWorkHoursSettings?: () => void;
  /** Native invoice defaults + bank transfer (same APIs as desktop). */
  onNavigateToInvoiceOptionsSettings?: () => void;
  /** Native messages / notifications (email-templates API). */
  onNavigateToNotificationsSettings?: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Page stack inside the drawer. We keep this lightweight — at most one
  // sub-page is on screen at a time, and the drawer always starts back on the
  // menu when it re-opens.
  const [page, setPage] = useState<SettingsPage>('menu');
  /** Top-level split: workspace links vs settings (default: main). */
  const [menuTab, setMenuTab] = useState<DrawerMenuTab>('main');
  // Stays true while the close animation is still playing so users see the
  // drawer slide out instead of vanishing.
  const [mounted, setMounted] = useState(visible);
  const slideX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const subSlideX = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setMenuTab('main');
      setPage('menu');
      subSlideX.setValue(SCREEN_WIDTH);
      Animated.spring(slideX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 180,
        mass: 0.7,
      }).start();
    } else {
      Animated.spring(slideX, {
        toValue: SCREEN_WIDTH,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
        mass: 0.7,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, slideX, subSlideX]);

  const goToSub = (next: SettingsPage) => {
    setPage(next);
    Animated.spring(subSlideX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
      mass: 0.7,
    }).start();
  };

  const goBackToMenu = () => {
    Animated.spring(subSlideX, {
      toValue: SCREEN_WIDTH,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
      mass: 0.7,
    }).start(() => setPage('menu'));
  };

  const switchDrawerTab = (next: DrawerMenuTab) => {
    LayoutAnimation.configureNext(SNAPPY_LAYOUT);
    setMenuTab(next);
    setPage('menu');
    subSlideX.setValue(SCREEN_WIDTH);
  };

  if (!mounted) return null;

  const subTitle =
    SETTINGS_GROUPS.flatMap((g) => g.items).find((i) => i.key === page)?.label ||
    'Settings';

  const renderSubPage = () => {
    switch (page) {
      case 'user':
        return null;
      case 'business':
        return null;
      case 'work-hours':
        return null;
      case 'leads-form':
        return (
          <View style={styles.settingsPageBody}>
            <ManageOnWebCard
              title="Lead form"
              description="Configure your public booking form."
              webPath={`/${company?.slug || ''}/settings/leads-form`}
            />
          </View>
        );
      case 'invoice-options':
        return null;
      case 'notifications':
        return null;
      case 'billing':
        return (
          <View style={styles.settingsPageBody}>
            <ManageOnWebCard
              title="Plan & billing"
              description="Manage the PathPilo subscription that bills your company."
              webPath={`/${company?.slug || ''}/settings/billing`}
            />
          </View>
        );
      case 'extensions':
        return (
          <View style={styles.settingsPageBody}>
            <ManageOnWebCard
              title="Extensions"
              description="Optional integrations bolted on top of PathPilo."
              webPath={`/${company?.slug || ''}/settings/extensions`}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Scrim */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[
            styles.settingsDrawerScrim,
            {
              opacity: slideX.interpolate({
                inputRange: [0, SCREEN_WIDTH],
                outputRange: [0.45, 0],
              }),
            },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.settingsDrawer,
          {
            transform: [{ translateX: slideX }],
            paddingTop: insets.top + 6,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Drawer header (menu mode) */}
        <View style={styles.settingsDrawerHeader}>
          <Text style={styles.settingsDrawerTitle} numberOfLines={1}>
            {padAndroidText('Menu')}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.settingsDrawerHeaderBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <CloseIcon />
          </TouchableOpacity>
        </View>

        <View style={styles.drawerTabRow}>
          <TouchableOpacity
            style={[
              styles.drawerTab,
              menuTab === 'main' && styles.drawerTabOn,
            ]}
            onPress={() => switchDrawerTab('main')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.drawerTabText,
                menuTab === 'main' && styles.drawerTabTextOn,
              ]}
              numberOfLines={1}
            >
              {padAndroidText('Main')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.drawerTab,
              menuTab === 'settings' && styles.drawerTabOn,
            ]}
            onPress={() => switchDrawerTab('settings')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.drawerTabText,
                menuTab === 'settings' && styles.drawerTabTextOn,
              ]}
              numberOfLines={1}
            >
              {padAndroidText('Settings')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Menu list */}
        <ScrollView
          style={styles.settingsDrawerScroll}
          contentContainerStyle={styles.settingsDrawerScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.settingsAccountCard}>
            <Text style={styles.settingsAccountName} numberOfLines={1}>
              {padAndroidText(
                `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
                  user?.email ||
                  'Signed in',
              )}
            </Text>
            <Text style={styles.settingsAccountCompany} numberOfLines={1}>
              {padAndroidText(company?.name || '')}
            </Text>
          </View>

          {menuTab === 'main' ? (
            <View>
              <SettingsSectionHeader>Workspace</SettingsSectionHeader>
              <View style={styles.settingsGroupCard}>
                {MAIN_DRAWER_NAV.map((item, i) => (
                  <View key={item.segment}>
                    <SettingsRow
                      label={item.label}
                      description={item.description}
                      onPress={() => {
                        if (item.segment === 'clients' && onNavigateToClients) {
                          onNavigateToClients();
                          return;
                        }
                        if (item.segment === 'services' && onNavigateToServices) {
                          onNavigateToServices();
                          return;
                        }
                        if (item.segment === 'invoices' && onNavigateToInvoices) {
                          onNavigateToInvoices();
                          return;
                        }
                        if (item.segment === 'team' && onNavigateToTeam) {
                          onNavigateToTeam();
                          return;
                        }
                        const slug = company?.slug || '';
                        if (!slug) {
                          Alert.alert('Company', 'No company slug available.');
                          return;
                        }
                        void openWebPath(
                          `/${slug}/${item.segment}`,
                        ).then(() => onClose());
                      }}
                    />
                    {i < MAIN_DRAWER_NAV.length - 1 ? (
                      <View style={styles.settingsRowSeparator} />
                    ) : null}
                  </View>
                ))}
              </View>
              <Text style={styles.settingsVersionText}>PathPilo · mobile</Text>
            </View>
          ) : (
            <>
              {SETTINGS_GROUPS.map((group, idx) => (
                <View key={group.label} style={idx > 0 ? { marginTop: 18 } : null}>
                  <SettingsSectionHeader>{group.label}</SettingsSectionHeader>
                  <View style={styles.settingsGroupCard}>
                    {group.items.map((item, i) => (
                      <View key={item.key}>
                        <SettingsRow
                          label={item.label}
                          description={item.description}
                          badge={
                            item.key === 'leads-form' ? 'Coming soon' : undefined
                          }
                          onPress={() => {
                            if (
                              item.key === 'user' &&
                              onNavigateToUserSettings
                            ) {
                              onClose();
                              onNavigateToUserSettings();
                              return;
                            }
                            if (
                              item.key === 'business' &&
                              onNavigateToBusinessSettings
                            ) {
                              onClose();
                              onNavigateToBusinessSettings();
                              return;
                            }
                            if (
                              item.key === 'work-hours' &&
                              onNavigateToWorkHoursSettings
                            ) {
                              onClose();
                              onNavigateToWorkHoursSettings();
                              return;
                            }
                            if (
                              item.key === 'invoice-options' &&
                              onNavigateToInvoiceOptionsSettings
                            ) {
                              onClose();
                              onNavigateToInvoiceOptionsSettings();
                              return;
                            }
                            if (
                              item.key === 'notifications' &&
                              onNavigateToNotificationsSettings
                            ) {
                              onClose();
                              onNavigateToNotificationsSettings();
                              return;
                            }
                            goToSub(item.key);
                          }}
                        />
                        {i < group.items.length - 1 ? (
                          <View style={styles.settingsRowSeparator} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              <TouchableOpacity
                onPress={onLogout}
                style={styles.settingsLogoutBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.settingsLogoutBtnText} numberOfLines={1}>
                  {padAndroidText('Log out')}
                </Text>
              </TouchableOpacity>

              <Text style={styles.settingsVersionText}>PathPilo · mobile</Text>
            </>
          )}
        </ScrollView>

        {/* Sub-page overlay (slides over the menu) */}
        {menuTab === 'settings' && page !== 'menu' ? (
          <Animated.View
            style={[
              styles.settingsSubPage,
              {
                paddingTop: insets.top + 6,
                paddingBottom: insets.bottom,
                transform: [{ translateX: subSlideX }],
              },
            ]}
          >
            <View style={styles.settingsDrawerHeader}>
              <TouchableOpacity
                onPress={goBackToMenu}
                style={styles.settingsDrawerHeaderBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ArrowLeftIcon />
              </TouchableOpacity>
              <Text style={styles.settingsDrawerTitle} numberOfLines={1}>
                {padAndroidText(subTitle)}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.settingsDrawerHeaderBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <CloseIcon />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.settingsDrawerScroll}
              contentContainerStyle={styles.settingsDrawerScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderSubPage()}
            </ScrollView>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function CompanyTabsScreen({ route }: any) {
  const { company, user, initialTab } = route.params || {};
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onLogout = async () => {
    setDrawerOpen(false);
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('user');
    } catch {
      // best effort — proceed even if storage is unavailable
    }
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  // The header already consumes the top safe-area inset, so child screens
  // (Overview / Calender / Today) should treat top inset as zero. We override
  // the safe-area context for the tab subtree only — the drawer + status
  // overlays still see the real device insets.
  const tabBodyInsets = useMemo(
    () => ({ top: 0, bottom: insets.bottom, left: insets.left, right: insets.right }),
    [insets.bottom, insets.left, insets.right],
  );

  return (
    <View style={styles.companyShellRoot}>
      <MobileAppHeader
        companyName={company?.name || ''}
        onMenuPress={() => setDrawerOpen(true)}
      />
      <SafeAreaInsetsContext.Provider value={tabBodyInsets}>
      <View style={styles.companyShellBody}>
        <Tab.Navigator
          initialRouteName={initialTab || 'Overview'}
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: '#3DD57A',
            tabBarInactiveTintColor: '#193434',
            tabBarIcon: ({ color }) => {
              if (route.name === 'Overview') {
                return <OverviewIcon color={color} />;
              } else if (route.name === 'Calender') {
                return <CalendarIcon color={color} />;
              } else if (route.name === 'Today') {
                return <TodayIcon color={color} />;
              }
              return null;
            },
            tabBarLabel: ({ focused, color }) => (
              <View style={styles.tabLabelContainer}>
                <Text style={[styles.tabLabel, { color }]}>{route.name === 'Today' ? 'Today' : route.name}</Text>
                {focused && <View style={styles.activeIndicator} />}
              </View>
            ),
          })}
        >
          <Tab.Screen
            name="Overview"
            component={OverviewTab}
            initialParams={{ company, user }}
          />
          <Tab.Screen
            name="Calender"
            component={CalendarTab}
            initialParams={{ company, user }}
          />
          <Tab.Screen
            name="Today"
            component={TodayTab}
            initialParams={{ company, user }}
          />
        </Tab.Navigator>
      </View>
      </SafeAreaInsetsContext.Provider>
      <MobileSettingsDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        company={company}
        user={user}
        onLogout={onLogout}
        onNavigateToClients={() => {
          setDrawerOpen(false);
          navigation.navigate('Clients', { company, user });
        }}
        onNavigateToServices={() => {
          setDrawerOpen(false);
          navigation.navigate('Services', { company, user });
        }}
        onNavigateToInvoices={() => {
          setDrawerOpen(false);
          navigation.navigate('Invoices', { company, user });
        }}
        onNavigateToTeam={() => {
          setDrawerOpen(false);
          navigation.navigate('Team', { company, user });
        }}
        onNavigateToUserSettings={() => {
          setDrawerOpen(false);
          navigation.navigate('SettingsUser', { company, user });
        }}
        onNavigateToBusinessSettings={() => {
          setDrawerOpen(false);
          navigation.navigate('SettingsBusiness', { company, user });
        }}
        onNavigateToWorkHoursSettings={() => {
          setDrawerOpen(false);
          navigation.navigate('SettingsWorkHours', { company, user });
        }}
        onNavigateToInvoiceOptionsSettings={() => {
          setDrawerOpen(false);
          navigation.navigate('SettingsInvoiceOptions', { company, user });
        }}
        onNavigateToNotificationsSettings={() => {
          setDrawerOpen(false);
          navigation.navigate('SettingsNotifications', { company, user });
        }}
      />
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Companies" component={CompaniesScreen} />
        <Stack.Screen name="CompanyTabs" component={CompanyTabsScreen} />
        <Stack.Screen
          name="Clients"
          component={MobileClientsListScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ClientDetail"
          component={MobileClientDetailScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Invoices"
          component={MobileInvoicesListScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="InvoiceDetail"
          component={MobileInvoiceDetailScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="InvoiceCompose"
          component={MobileInvoiceComposerScreen as any}
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="JobCompose"
          component={MobileJobComposerScreen as any}
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="SubscriptionCompose"
          component={MobileSubscriptionComposerScreen as any}
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Services"
          component={MobileServicesListScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ServiceCompose"
          component={MobileServiceComposerScreen as any}
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Team"
          component={MobileTeamScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TeamInvite"
          component={MobileTeamInviteScreen as any}
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="SettingsUser"
          component={MobileUserSettingsScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SettingsBusiness"
          component={MobileBusinessSettingsScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SettingsWorkHours"
          component={MobileWorkHoursSettingsScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SettingsInvoiceOptions"
          component={MobileInvoiceOptionsSettingsScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SettingsNotifications"
          component={MobileNotificationsSettingsScreen as any}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen 
          name="DayView" 
          component={DayViewScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="RequestStatus"
          component={RequestStatusScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminRequests"
          component={AdminRequestsScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  // Login screen styles
  container: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginContainer: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#193434',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#193434',
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#19343420',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#193434',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: '#19343420',
    borderRadius: 12,
    padding: 16,
    paddingRight: 50, // Make room for eye icon
    fontSize: 16,
    color: '#193434',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 4,
  },
  eyeIconText: {
    fontSize: 16,
  },
  inputError: {
    borderColor: '#E53935',
    borderWidth: 1.5,
  },
  loginErrorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  loginErrorText: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#3DD57A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#3DD57A',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.1,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordText: {
    color: '#193434',
    fontSize: 14,
    opacity: 0.7,
  },

  // Companies screen styles
  companiesContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  companiesTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#193434',
    textAlign: 'center',
    marginBottom: 30,
  },
  companiesList: {
    paddingBottom: 20,
  },
  companyContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  companyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 4,
  },
  companyRole: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
    textTransform: 'capitalize',
  },
  arrowContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    fontSize: 20,
    color: '#193434',
    opacity: 0.5,
  },

  // Loading styles
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#193434',
    opacity: 0.7,
  },

  // Company overview styles
  overviewContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  headerContainer: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  headerCompany: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#193434',
    marginBottom: 4,
  },
  headerUser: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
  },
  headerIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  iconText: {
    fontSize: 24,
  },
  contentPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 16,
    color: '#193434',
    opacity: 0.6,
    textAlign: 'center',
  },

  // Tab bar styles
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 0,
    height: 80,
    paddingTop: 10,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },

  // --- App shell + lightweight header --------------------------------------
  companyShellRoot: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  companyShellBody: {
    flex: 1,
  },
  appHeader: {
    backgroundColor: '#F6F9F7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7ECE9',
  },
  appHeaderInner: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  appHeaderCompanyWrap: {
    flex: 1,
    minWidth: 0,
  },
  appHeaderCompany: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
  },
  appHeaderMenuBtn: {
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F4',
  },

  // --- Settings drawer -----------------------------------------------------
  settingsDrawerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  settingsDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#F6F9F7',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  settingsDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  drawerTabRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  drawerTab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerTabOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  drawerTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  drawerTabTextOn: {
    color: '#193434',
  },
  settingsDrawerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
  },
  settingsDrawerHeaderBtn: {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsDrawerScroll: {
    flex: 1,
  },
  settingsDrawerScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  settingsAccountCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  settingsAccountName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
  },
  settingsAccountCompany: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  settingsGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  settingsGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingsRowText: {
    flex: 1,
    minWidth: 0,
  },
  settingsRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  settingsRowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
  },
  settingsRowBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    flexShrink: 0,
  },
  settingsRowBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.2,
  },
  settingsRowDescription: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
  },
  settingsRowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginLeft: 16,
  },
  settingsLogoutBtn: {
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settingsLogoutBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#B91C1C',
  },
  settingsVersionText: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
  },
  settingsSubPage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F6F9F7',
  },
  settingsPageBody: {
    paddingTop: 4,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
  },
  settingsCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
  },
  settingsCardDescription: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  settingsCardCta: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#193434',
    alignItems: 'center',
  },
  settingsCardCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  settingsCardHint: {
    marginTop: 10,
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
  settingsField: {
    marginTop: 12,
  },
  settingsFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  settingsInput: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: '#193434',
    backgroundColor: '#F8FAFC',
  },
  settingsReadonly: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: '#475569',
    backgroundColor: '#F1F5F9',
  },
  settingsHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#94A3B8',
  },
  settingsToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  settingsToggleBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsToggleBtnOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  settingsToggleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  settingsToggleBtnTextOn: {
    color: '#FFFFFF',
  },
  settingsSaveBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  settingsSaveBtnActive: {
    backgroundColor: '#3DD57A',
  },
  settingsSaveBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  settingsSaveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsSaveBtnTextActive: {
    color: '#FFFFFF',
  },
  settingsSaveBtnTextDisabled: {
    color: '#64748B',
  },
  settingsStandaloneRoot: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  settingsStandaloneHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  settingsStandaloneBackBtn: {
    width: 72,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsStandaloneBackTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F766E',
  },
  settingsStandaloneTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
  },
  tabContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPlaceholderText: {
    fontSize: 18,
    color: '#193434',
    opacity: 0.5,
  },
  tabLabelContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  tabLabel: {
    fontSize: 12,
  },
  activeIndicator: {
    width: 40,
    height: 3,
    backgroundColor: '#3DD57A',
    borderRadius: 2,
    marginTop: 6,
  },

  // Calendar styles
  calendarContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  calendarBanner: {
    position: 'relative',
    height: 120,
    borderRadius: 16,
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 16,
    overflow: 'hidden',
  },
  calendarBannerImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  calendarBannerOverlay: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  calendarYear: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
    textAlign: 'center',
  },
  /** Full-width row so month Text measures against banner width, not a zero-width flex child (Android clip). */
  calendarMonthWrap: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  calendarMonth: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    width: '100%',
    includeFontPadding: false,
  },
  weekDaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 12,
    color: '#193434',
    opacity: 0.6,
    fontWeight: '500',
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  calendarGrid: {
    flex: 1,
    paddingHorizontal: 8,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarDayCell: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#fff',
    marginHorizontal: 2,
    marginVertical: 2,
    borderRadius: 8,
    minHeight: 84,
    position: 'relative',
    overflow: 'hidden',
  },
  calendarDayStripeLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 0,
  },
  calendarDayStripe: {
    position: 'absolute',
    top: -22,
    width: 4,
    height: '170%',
    backgroundColor: 'rgba(25, 52, 52, 0.1)',
    transform: [{ rotate: '-45deg' }],
  },
  calendarDayStripeFade: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  calendarDayContent: {
    flex: 1,
    padding: 6,
    justifyContent: 'space-between',
    zIndex: 3,
  },
  calendarDayText: {
    fontSize: 14,
    color: '#193434',
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  calendarDayTextCurrent: {
    color: '#193434',
    fontWeight: 'bold',
  },
  currentDayIndicator: {
    position: 'absolute',
    bottom: -3,
    left: '50%',
    marginLeft: -15,
    width: 30,
    height: 6,
    backgroundColor: '#3DD57A',
    borderRadius: 3,
  },
  jobDotsContainer: {
    marginTop: 4,
    alignItems: 'flex-start',
    width: '100%',
  },
  jobDotsRow: {
    flexDirection: 'row',
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  jobDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#193434',
    opacity: 0.4,
    marginRight: 3,
    marginBottom: 1,
  },
  jobDotCompleted: {
    backgroundColor: '#3DD57A',
    opacity: 1,
  },
  jobDotSubCompleted: {
    backgroundColor: '#F59E0B',
    opacity: 1,
  },
  jobDotCancelled: {
    backgroundColor: '#FF6B6B',
    opacity: 1,
  },
  calendarPendingDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#F59E0B',
    zIndex: 3,
  },
  calendarApptBadge: {
    alignSelf: 'stretch',
    marginTop: 1,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: '#193434',
  },
  calendarApptBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Approved time-off on the day view should feel like an active block —
  // neutral (white/grey) like a job card, not a hero banner.
  dayApptRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.10)',
    borderLeftWidth: 4,
    borderLeftColor: '#4A6565',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  // Pending: warm orange, dashed-ish feel to imply "not yet scheduled".
  dayApptRowPending: {
    backgroundColor: '#FFF7E6',
    borderColor: '#F59E0B',
    borderLeftColor: '#F59E0B',
  },
  dayApptBadge: {
    backgroundColor: '#193434',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dayApptBadgePending: {
    backgroundColor: '#B45309',
  },
  dayApptBadgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '700',
  },
  dayApptDetailText: {
    flex: 1,
    color: '#193434',
    fontSize: 13,
    fontWeight: '600',
  },
  dayApptDetailTextPending: {
    color: '#8A4D00',
    fontWeight: '700',
  },
  dayApptStatusHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    textTransform: 'uppercase',
  },

  // Month selector styles
  yearSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginBottom: 8,
  },
  yearArrow: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  yearArrowText: {
    fontSize: 24,
    color: '#193434',
    fontWeight: '300',
  },
  yearSelectorText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#193434',
    minWidth: 80,
    textAlign: 'center',
  },
  monthListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  monthCard: {
    backgroundColor: '#193434',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
    minHeight: 90,
    position: 'relative',
  },
  monthCardActive: {
    backgroundColor: '#3DD57A',
  },
  monthCardText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  monthCardTextActive: {
    color: '#fff',
  },
  workDaysContainer: {
    position: 'absolute',
    top: 16,
    right: 20,
    alignItems: 'flex-end',
  },
  workDaysLabel: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.7,
    marginBottom: 2,
  },
  workDaysLabelActive: {
    opacity: 0.9,
  },
  workDaysNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  workDaysNumberActive: {
    color: '#fff',
  },
  thisMonthButton: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 16,
    marginBottom: 20,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thisMonthButtonText: {
    color: '#193434',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  calendarQuickAddOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calendarQuickAddCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
  },
  calendarQuickAddTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
    marginBottom: 14,
    textAlign: 'center',
  },
  calendarQuickAddRow: {
    backgroundColor: '#F0F4F2',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },
  calendarQuickAddRowText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F3C2A',
    textAlign: 'center',
  },
  calendarQuickAddCancel: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  calendarQuickAddCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },

  // Day view styles
  dayViewContainer: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  dayViewJobsWrapper: {
    backgroundColor: '#F6F9F7',
    width: '100%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginTop: -20,
    paddingTop: 20,
  },
  dayViewHeader: {
    position: 'relative',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 100,
    paddingBottom: 12,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    width: '100%',
    overflow: 'hidden',
    minHeight: 180,
    justifyContent: 'center',
  },
  dayViewHeaderImage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  dayViewHeaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  dayViewHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dayViewHeaderLeft: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 12,
  },
  dayViewDayName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
    paddingHorizontal: 12,
    width: '100%',
    maxWidth: '100%',
  },
  dayViewDate: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    paddingHorizontal: 12,
    width: '100%',
    maxWidth: '100%',
  },
  dayViewHeaderRight: {
    width: 100,
    height: 60,
  },
  dayViewJobsList: {
    padding: 16,
    paddingBottom: 100, // Space for bottom navigation
    backgroundColor: 'transparent',
  },
  // Rounded panel at the top of the scrolling list. Slides up over
  // the absolute banner as the user scrolls, creating the "list takes
  // over the banner" effect.
  dayViewScrollHeader: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 6,
    paddingBottom: 4,
  },
  dayViewAddBelowWeek: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  dayViewAddBtn: {
    flexShrink: 0,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
  },
  dayViewAddBtnText: {
    color: '#0F766E',
    fontSize: 16,
    fontWeight: '700',
  },
  dayAddPickerRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  dayAddPickerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '88%',
    maxWidth: 340,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  dayAddPickerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  dayAddPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dayAddPickerIconWrap: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  dayAddPickerRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
  },
  dayAddPickerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginLeft: 16,
  },
  createJobModalRoot: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F6F9F7',
  },
  createJobModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F6F9F7',
  },
  createJobModalHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F6F9F7',
  },
  /** `minWidth: 0` lets the date ellipsize instead of painting over the Cancel control (Android). */
  createJobModalDateBarWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  createJobModalDateBar: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
  },
  createJobModalHeaderSideBtn: {
    flexShrink: 0,
  },
  createJobHeaderBtnLabelWrap: {
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  createJobModalTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  createJobModalTitleCentered: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    textAlign: 'center',
  },
  createJobModalCancel: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  createJobModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
  },
  createJobModalSave: {
    fontSize: 16,
    color: '#0F766E',
    fontWeight: '700',
  },
  createJobModalSaveDisabled: {
    color: '#94A3B8',
  },
  createJobModalDateHint: {
    fontSize: 13,
    color: '#64748B',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  createJobModalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createJobFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F6F9F7',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  createJobFooterBtn: {
    backgroundColor: '#3DD57A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#193434',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createJobFooterBtnDisabled: {
    backgroundColor: '#CBD5E1',
    borderColor: '#CBD5E1',
  },
  createJobFooterBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  createJobFooterBtnTextDisabled: {
    color: '#64748B',
  },
  createNoteFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
  },
  createNoteFieldHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  createModalSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
    marginBottom: 8,
  },
  createModalInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#193434',
  },
  /** Client search only: ~20% taller than default `createModalInput`. */
  createModalInputClientSearch: {
    paddingVertical: 15,
    minHeight: 54,
  },
  createModalInputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  createClientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 8,
  },
  createClientPillTextCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 4,
  },
  createClientPillText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
  },
  createClientPillChangeBtn: {
    flexShrink: 0,
    paddingVertical: 4,
    paddingLeft: 8,
  },
  createClientPillChange: {
    fontSize: 15,
    fontWeight: '600',
    color: '#047857',
  },
  createClientList: {
    maxHeight: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  createClientRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  createClientRowText: {
    fontSize: 15,
    color: '#193434',
  },
  createServiceChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  createServiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '48%',
  },
  createServiceChipOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  createServiceChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  createServiceChipTextOn: {
    color: '#FFFFFF',
  },
  createTimeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  createTimeInput: {
    flex: 1,
  },
  createApptCatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  createApptCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  createApptCatChipOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  createApptCatChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  createApptCatChipTextOn: {
    color: '#FFFFFF',
  },
  createTimeModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  createTimeModeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  createTimeModeChipOn: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  createTimeModeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  createTimeModeChipTextOn: {
    color: '#FFFFFF',
  },
  createClientPillSub: {
    fontSize: 13,
    color: '#047857',
    marginTop: 2,
  },
  createClientRowSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  createDropdownHint: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 18,
  },
  createSelectedSvcCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  createSelectedSvcInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  createSelectedSvcTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
    lineHeight: 18,
  },
  createSelectedSvcInputsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
    gap: 6,
  },
  createSelectedSvcRemoveBtn: {
    marginLeft: 2,
  },
  createSelectedSvcRemove: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  createSelectedSvcMetaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  createSelectedSvcMetaInputPrice: {
    width: 64,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: '#193434',
    backgroundColor: '#F8FAFC',
    textAlign: 'right',
  },
  createSelectedSvcMetaInputMin: {
    width: 52,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 14,
    color: '#193434',
    backgroundColor: '#F8FAFC',
    textAlign: 'right',
  },
  createSavedNotePickList: {
    marginTop: 8,
    gap: 8,
  },
  createSavedNotePickRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  createSavedNotePickRowOn: {
    borderColor: '#193434',
    backgroundColor: '#F1F5F9',
  },
  createSavedNotePickText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  createJobPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  createJobPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '100%',
  },
  createJobPillLabelWrap: {
    minWidth: 0,
    flexShrink: 1,
    flexGrow: 1,
    justifyContent: 'center',
  },
  createJobPillFilled: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
  },
  createJobPillActive: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  createJobPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  createJobPillTextOn: {
    color: '#FFFFFF',
  },
  createAssignList: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    maxHeight: 200,
  },
  createAssignRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  createAssignRowText: {
    fontSize: 15,
    color: '#193434',
    fontWeight: '500',
  },
  createTimeReveal: {
    marginTop: 12,
  },
  createClearLink: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F766E',
  },
  // Row wrapper that gives job cards / route-stop rows a solid
  // background strip. Without this, inter-card gaps would let the
  // banner bleed through while the list is sliding over it.
  dayViewListStripPadded: {
    backgroundColor: '#F6F9F7',
    paddingHorizontal: 16,
  },
  dayViewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayViewEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  dayViewEmptyText: {
    fontSize: 16,
    color: '#193434',
    opacity: 0.5,
  },

  // Route stop row — fixed start/end bookends around the day's jobs.
  // Smaller + softer than a job card so workers instantly read it as
  // "this is where the day begins/ends", not as a task to complete.
  routeStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8F4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EEE7',
    borderStyle: 'dashed',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  routeStopBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#3DD57A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#3DD57A',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  routeStopBadgeEnd: {
    backgroundColor: '#193434',
    shadowColor: '#193434',
  },
  routeStopBody: {
    flex: 1,
    minWidth: 0,
  },
  routeStopLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#193434',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  routeStopAddress: {
    fontSize: 13,
    color: '#466666',
  },

  // Job card styles
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F8F4',
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  jobCardCompleted: {
    backgroundColor: '#F4FBF6',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(61, 213, 122, 0.55)',
  },
  jobCardSubCompleted: {
    // "Sub completed": some tasks done, some cancelled. Amber tint
    // matches the web app's computeStatusMeta colors.
    backgroundColor: '#FFFCF5',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(245, 158, 11, 0.55)',
  },
  jobCardCancelled: {
    backgroundColor: '#FFFAFA',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255, 107, 107, 0.55)',
  },
  jobCardBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobCardBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  jobCardClientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#193434',
    marginBottom: 6,
  },
  jobCardAddress: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
    marginBottom: 8,
  },
  jobCardTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  jobCardTimeIconWrap: {
    width: 16,
    height: 16,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  jobCardTime: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.7,
    flexShrink: 0,
  },
  jobCardSeparator: {
    height: 1,
    backgroundColor: '#193434',
    opacity: 0.1,
    marginBottom: 12,
  },
  jobCardBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobCardBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  jobCardBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  jobCardBarIconWrap: {
    width: 16,
    height: 16,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  jobCardBarTaskText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
  },
  jobCardBarDurationText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 0,
  },
  jobCardCheckbox: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckboxChecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3DD57A',
    borderWidth: 2,
    borderColor: '#3DD57A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckboxSubCompleted: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    borderWidth: 2,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckboxCancelled: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
    borderWidth: 2,
    borderColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckboxUnchecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobCardCheckmarkUnchecked: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobCardCheckmarkCancelled: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Job detail slideout styles
  slideoutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  slideoutOuterContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    zIndex: 1001,
  },
  // Sheet surface: full-screen height, driven by translateY. translateY is
  // the absolute y-position of the sheet's top edge.
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    // Must sit above the day-view FlatList (zIndex 1) so the dim
    // overlay is visible when a job is tapped.
    zIndex: 10,
    elevation: 10,
  },
  sheetSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#F6F9F7',
    // Above the backdrop + list. StickyCompleteBar lives on top of
    // this surface so it stays interactable without extra stacking.
    zIndex: 11,
    elevation: 18,
    // Larger rounded corners give the panel a more modern,
    // iOS-style appearance. The header is transparent so there is
    // nothing to clip; the background colour respects the radius
    // without needing overflow:hidden (which kills Android touch
    // events when the panel is taller than the screen).
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  // Transparent overlay covering the top of the sheet so the drag
  // handle area always wins pan gestures, even on Android where the
  // native ScrollView would otherwise absorb them. Stops short of the
  // right edge to keep the header's action buttons tappable.
  sheetDragZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 140,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  slideoutInnerContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    width: '100%',
    height: 'auto',
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  slideoutInnerContainerExpanded: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  bottomSheetBackground: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  bottomSheetIndicator: {
    backgroundColor: '#193434',
    opacity: 0.3,
    width: 40,
    height: 4,
  },
  jobDetailSlideout: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '85%',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: -2,
      height: 0,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  popupContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1001,
  },
  jobDetailSlideoutBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1001,
    overflow: 'hidden',
  },
  jobDetailSlideoutExpanded: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'visible',
  },
  dragHandleContainer: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F9F7',
    zIndex: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#193434',
    opacity: 0.3,
    borderRadius: 2,
  },
  sheetHandle: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#193434',
    opacity: 0.5,
    borderRadius: 2,
  },
  sheetContent: {
    flex: 1,
  },
  sheetContentContainer: {
    paddingBottom: 40,
  },
  slideoutLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  jobDetailContainer: {
    backgroundColor: '#F6F9F7',
    position: 'relative',
    // Don't add overflow:hidden here - the parent sheetSurface
    // handles the rounded top corners via border radius + bg colour.
    // overflow:hidden on a panel that is taller than the screen
    // breaks Android touch event delivery on the parts visible inside
    // the screen.
  },
  jobDetailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  jobDetailTopRowPills: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  jobDetailActionButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsIcon: {
    width: 20,
    height: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  optionsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#193434',
    opacity: 0.7,
    marginVertical: 1.5,
  },
  completeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.8,
  },
  completeIconActive: {
    backgroundColor: '#3DD57A',
    borderColor: '#3DD57A',
    opacity: 1,
  },
  completeCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  completeCheckmarkActive: {
    opacity: 1,
  },
  optionsMenu: {
    position: 'absolute',
    top: 72,
    left: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 20,
  },
  optionsMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionsMenuText: {
    fontSize: 14,
    color: '#193434',
    fontWeight: '500',
  },
  optionsMenuItemDangerTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  optionsMenuTextDanger: {
    fontSize: 14,
    color: '#B91C1C',
    fontWeight: '700',
  },
  jobDetailCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobDetailCloseText: {
    fontSize: 18,
    color: '#193434',
    fontWeight: 'bold',
  },
  jobDetailHeader: {
    backgroundColor: 'transparent',
    paddingTop: 12,
    paddingBottom: JOB_DETAIL_SECTION_GAP,
    paddingHorizontal: JOB_DETAIL_SECTION_GAP,
    position: 'relative',
    zIndex: 2,
  },
  jobDetailNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: JOB_DETAIL_SECTION_GAP,
  },
  jobDetailHeaderExpanded: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 8,
  },
  sheetHandleInHeader: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sheetHandleBarInHeader: {
    width: 44,
    height: 5,
    backgroundColor: '#193434',
    opacity: 0.18,
    borderRadius: 999,
  },
  jobDetailClientName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#193434',
    marginTop: 4,
    marginBottom: 8,
  },
  jobDetailClientType: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#193434',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  jobDetailClientTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#193434',
    paddingRight: 2,
  },
  jobDetailSeparator: {
    height: 1,
    backgroundColor: '#fff',
    opacity: 0.3,
    marginBottom: 16,
  },
  jobDetailContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  jobDetailIconWrapper: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 16,
    height: 16,
  },
  jobDetailContactIcon: {
    fontSize: 16,
    marginRight: 16,
    width: 15,
    height: 12,
  },
  jobDetailContactText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  jobDetailContent: {
    padding: JOB_DETAIL_SECTION_GAP,
    // Extra bottom padding so the last timeline entry / "Add note"
    // link clears the floating sticky Complete bar when the sheet is
    // pulled fully up.
    paddingBottom: 140,
  },
  jobDetailSection: {
    marginBottom: 24,
  },
  jobDetailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 0,
  },
  jobDetailInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  jobDetailInfoIcon: {
    fontSize: 18,
    marginRight: 16,
    marginTop: 2,
    width: 16,
    height: 18,
  },
  jobDetailInfoText: {
    fontSize: 14,
    color: '#193434',
    flex: 1,
    lineHeight: 20,
  },
  jobDetailTasksSection: {
    marginTop: 0,
    marginBottom: 8,
  },
  jobDetailTabScroll: {
    flexGrow: 0,
  },
  jobDetailTabScrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  jobDetailTasksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobDetailTasksTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTasksCount: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.6,
  },
  jobDetailTaskItemContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    padding: 16,
  },
  jobDetailTaskItemContainerCancelled: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  jobDetailTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTaskCheckbox: {
    marginRight: 12,
    padding: 4,
  },
  jobDetailTaskCheckboxChecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3DD57A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobDetailTaskCheckboxUnchecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobDetailTaskCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobDetailTaskCheckmarkUnchecked: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 'bold',
  },
  jobDetailTaskNameCancelled: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  jobDetailTaskMetaCancelled: {
    textDecorationLine: 'line-through',
    color: '#b91c1c',
    opacity: 0.7,
  },
  jobDetailTaskCancelButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  jobDetailTaskCancelText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  jobDetailStatusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  jobDetailStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  jobDetailStatusPillText: {
    fontSize: 12,
    fontWeight: '600',
    paddingRight: 2,
  },

  // Contact chips under the client name in the header. Tap to call /
  // email directly, long-press to copy.
  contactChipRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(25,52,52,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.15)',
    flexShrink: 1,
  },
  contactChipPrimary: {
    backgroundColor: 'rgba(34,139,88,0.12)',
    borderColor: 'rgba(34,139,88,0.35)',
  },
  contactChipText: {
    color: '#193434',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    flexShrink: 1,
  },
  jobDetailTopRowRedesigned: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: JOB_DETAIL_SECTION_GAP,
  },
  jobDetailIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF3F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobDetailIconButtonText: {
    fontSize: 18,
    color: '#193434',
    fontWeight: '700',
    lineHeight: 20,
  },
  jobDetailHeroCard: {
    backgroundColor: '#193434',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingRight: 20,
    alignItems: 'stretch',
    position: 'relative',
  },
  jobDetailHeroOptionsWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 6,
    alignItems: 'flex-end',
  },
  jobDetailHeroOptionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsIconHero: {
    width: 20,
    height: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  optionsDotHero: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(236,253,245,0.92)',
    marginVertical: 1.5,
  },
  optionsMenuHero: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    minWidth: 148,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  jobDetailHeroPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  jobDetailClientTypeHero: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  jobDetailClientTypeHeroText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ECFDF5',
  },
  jobDetailClientTypeAboveName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3DD57A',
    marginBottom: 4,
    textAlign: 'left',
    alignSelf: 'flex-start',
    paddingRight: 40,
  },
  jobDetailClientNameHero: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  jobDetailContactPlainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: JOB_DETAIL_SECTION_GAP,
    gap: JOB_DETAIL_SECTION_GAP,
    alignSelf: 'stretch',
  },
  jobDetailContactPlainIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobDetailContactPlainText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#ECFDF5',
    minWidth: 0,
  },
  jobDetailContactInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: JOB_DETAIL_SECTION_GAP,
    gap: 6,
  },
  jobDetailContactHalf: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  jobDetailContactHalfIcon: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobDetailContactHalfText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    color: '#ECFDF5',
  },
  contactChipRowCentered: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  contactChipHero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  contactChipPrimaryHero: {
    backgroundColor: 'rgba(61,213,122,0.18)',
    borderColor: 'rgba(61,213,122,0.45)',
  },
  contactChipTextHero: {
    color: '#ECFDF5',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
    maxWidth: 190,
  },
  jobDetailTabsWrap: {
    flexDirection: 'row',
    marginTop: JOB_DETAIL_SECTION_GAP,
    marginBottom: JOB_DETAIL_SECTION_GAP,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  jobDetailTabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  jobDetailTabButtonOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 2,
    elevation: 1,
  },
  jobDetailTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  jobDetailTabTextOn: {
    color: '#193434',
  },

  // Big address card - first thing in the white content area.
  addressCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  addressCardIconCol: {
    marginRight: 12,
  },
  addressCardPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressCardBody: {
    flex: 1,
  },
  addressCardStreet: {
    fontSize: 17,
    fontWeight: '600',
    color: '#193434',
  },
  addressCardCity: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  addressCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  addressCardActionText: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },

  // Note-style card (job note under schedule, or client secure notes elsewhere). Same width as the
  // surrounding job detail surface; a calm, low-contrast background keeps it
  // distinct from the green address card without screaming.
  secureNoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    padding: JOB_DETAIL_SECTION_GAP,
    marginBottom: JOB_DETAIL_SECTION_GAP,
  },
  secureNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secureNoteIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#E8F0EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  secureNoteIconText: {
    fontSize: 14,
  },
  secureNoteTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
  },
  secureNoteSubtitle: {
    fontSize: 11,
    color: '#5E7A70',
    marginTop: 1,
  },
  secureNoteEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F0F5F2',
  },
  secureNoteEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2A554A',
  },
  secureNoteBody: {
    marginTop: 8,
    fontSize: 14,
    color: '#193434',
    lineHeight: 20,
  },
  secureNoteListItem: {
    backgroundColor: '#F6F9F7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    padding: 12,
  },
  secureNoteMeta: {
    marginTop: 6,
    fontSize: 10,
    color: '#7A9388',
  },
  secureNoteItemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  secureNoteItemActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  secureNoteItemActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2A554A',
  },
  secureNoteItemDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  secureNoteHelper: {
    marginTop: 6,
    fontSize: 12,
    color: '#7A9388',
  },
  secureNoteInput: {
    minHeight: 88,
    backgroundColor: '#F6F9F7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#193434',
  },
  secureNoteError: {
    marginTop: 6,
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },
  secureNoteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  secureNoteCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
  },
  secureNoteCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5E7A70',
  },
  secureNoteSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0F3C2A',
  },
  secureNoteSaveBtnDisabled: {
    opacity: 0.6,
  },
  secureNoteSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Small time / date chips below the address card.
  scheduleRow: {
    flexDirection: 'row',
    marginBottom: JOB_DETAIL_SECTION_GAP,
    gap: JOB_DETAIL_SECTION_GAP,
  },
  scheduleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scheduleChipIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  scheduleChipText: {
    flex: 1,
  },
  scheduleChipLabel: {
    fontSize: 11,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  scheduleChipValue: {
    fontSize: 14,
    color: '#193434',
    fontWeight: '600',
    marginTop: 2,
  },
  // Visual hint that a schedule/assignee chip is tappable. Subtle border
  // so it still sits inside the white surface, paired with a chevron on
  // the trailing edge.
  scheduleChipEditable: {
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
  },
  scheduleChipChevron: {
    fontSize: 20,
    color: '#94A3B8',
    paddingLeft: 6,
    fontWeight: '600',
  },
  // Assignee chip (one full-width row beneath the time/date chips). Same
  // surface treatment so the three fields read as a single group.
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: JOB_DETAIL_SECTION_GAP,
  },
  assigneeChipIconGlyph: {
    fontSize: 16,
  },
  secureNoteCardEmpty: {
    borderStyle: 'dashed',
    borderColor: 'rgba(25,52,52,0.18)',
  },
  // Rows inside the assignee picker bottom sheet. Mirrors the job
  // composer's assign list so the experience is familiar.
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  assigneeRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  assigneeRowOn: {
    backgroundColor: '#F0F5F2',
  },
  assigneeRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#193434',
  },
  assigneeRowTextOn: {
    color: '#0F766E',
  },
  assigneeRowCheck: {
    fontSize: 16,
    color: '#0F766E',
    fontWeight: '800',
    marginLeft: 12,
  },

  // Sticky bottom action bar. Lives in the parent View (not the
  // sheet) so it always floats within thumb reach. High elevation +
  // zIndex make sure it sits above the draggable sheet on Android,
  // where render order alone isn't always enough once the sheet
  // picks up its own implicit layer.
  stickyActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(246, 249, 247, 0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(25, 52, 52, 0.08)',
    zIndex: 100,
    elevation: 16,
  },
  stickyAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.1)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  stickyAddressPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stickyAddressBody: {
    flex: 1,
    minWidth: 0,
  },
  stickyAddressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
  },
  stickyAddressSub: {
    marginTop: 1,
    fontSize: 12,
    color: '#64748B',
  },
  stickyAddressAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  stickyAddressActionText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 4,
  },
  stickyCompleteButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F5132',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  stickyCompleteButtonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0.15,
  },
  stickyCompleteButtonTextCol: {
    flex: 1,
  },
  stickyCompleteButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  stickyCompleteButtonSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  stickyCompleteButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyCompleteButtonCheck: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },

  // Handoff sheet — overlay that slides over the job sheet after
  // completing. Slightly smaller, rounded, with its own surface.
  handoffOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 22, 22, 0.45)',
    // Above the day-view list (zIndex 1) and the job sheet (zIndex 11).
    zIndex: 20,
    elevation: 20,
  },
  handoffSurface: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 16,
    zIndex: 21,
    elevation: 21,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  handoffHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(25,52,52,0.25)',
    marginBottom: 14,
  },
  handoffTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  handoffTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#193434',
  },
  handoffCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffCloseText: {
    color: '#193434',
    fontSize: 14,
    fontWeight: '700',
  },
  handoffJobCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  handoffJobCardDone: {
    opacity: 0.6,
  },
  handoffJobCardDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  handoffJobCardDotDone: {
    backgroundColor: '#3DD57A',
  },
  handoffJobCardDotNext: {
    backgroundColor: '#193434',
  },
  handoffJobCardBody: {
    flex: 1,
  },
  handoffJobCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  handoffJobCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    marginTop: 2,
  },
  handoffJobCardAddress: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  handoffJobCardTime: {
    fontSize: 13,
    color: '#047857',
    marginTop: 4,
    fontWeight: '600',
  },

  // Route illustration between the two cards.
  handoffRoute: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handoffRouteLine: {
    width: 2,
    backgroundColor: '#C7D2CF',
    alignSelf: 'center',
  },
  handoffRouteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  handoffRouteBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
    marginLeft: 6,
  },
  handoffRouteBadgeSub: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 6,
  },

  // Action area: notify toggle + start button.
  handoffActions: {
    paddingTop: 16,
  },
  handoffNotifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  handoffNotifyRowActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  handoffNotifyInfo: {
    flex: 1,
    marginRight: 12,
  },
  handoffNotifyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#193434',
  },
  handoffNotifyTitleActive: {
    color: '#047857',
  },
  handoffNotifySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  handoffNotifySwitch: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    padding: 2,
    justifyContent: 'center',
  },
  handoffNotifySwitchActive: {
    backgroundColor: '#3DD57A',
  },
  handoffNotifyKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  handoffStartButton: {
    backgroundColor: '#3DD57A',
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  handoffStartButtonDisabled: {
    opacity: 0.5,
  },
  handoffStartButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    marginRight: 8,
  },
  handoffDoneCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  handoffDoneEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  handoffDoneText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#065F46',
    textAlign: 'center',
  },
  jobDetailTaskContent: {
    flex: 1,
  },
  jobDetailTaskName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#193434',
    marginBottom: 4,
  },
  jobDetailTaskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTaskMetaText: {
    fontSize: 13,
    color: '#193434',
    opacity: 0.6,
  },
  jobDetailNoTasks: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.5,
    textAlign: 'center',
    paddingVertical: 20,
  },
  jobDetailTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  jobDetailTotalLeft: {
    flex: 1,
  },
  jobDetailTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#193434',
    marginBottom: 4,
  },
  jobDetailTotalTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobDetailTotalTimeIcon: {
    marginRight: 10,
    width: 16,
    height: 16,
  },
  jobDetailTotalTime: {
    fontSize: 13,
    color: '#193434',
    opacity: 0.7,
  },
  jobDetailTotalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3DD57A',
  },

  // Bottom navigation (for DayView and other screens)
  bottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 0,
    height: 80,
    paddingTop: 10,
    paddingBottom: 20,
    flexDirection: 'row',
    zIndex: 5,
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bottomNavLabel: {
    fontSize: 12,
    color: '#193434',
    marginTop: 4,
  },
  jobDetailTimelineSection: {
    marginTop: 0,
    // No paddingHorizontal - matches jobDetailTasksSection (padding comes from jobDetailContent)
  },
  timelineContainer: {
    marginTop: 0,
    paddingLeft: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    position: 'relative',
    // No paddingLeft/Right - matches task item structure (padding comes from jobDetailContent)
  },
  timelineLeft: {
    width: 20,
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 9,
    top: 12,
    bottom: -16,
    width: 2,
    backgroundColor: '#BFD1C5',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#193434',
    borderWidth: 2,
    borderColor: '#F6F9F7',
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: -4,
  },
  timelineText: {
    fontSize: 14,
    color: '#193434',
    lineHeight: 20,
    marginBottom: 4,
  },
  timelineDate: {
    fontSize: 12,
    color: '#193434',
    opacity: 0.6,
  },
  addNoteButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#3DD57A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 16,
    marginLeft: 20,
    minWidth: 120,
  },
  addNoteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  // Muted text-link style used under the timeline. Left-aligned with
  // the rest of the section content so it reads like a quiet "add"
  // action rather than a primary CTA.
  addNoteLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingRight: 8,
  },
  addNoteLinkPlus: {
    fontSize: 18,
    fontWeight: '500',
    color: '#64748B',
    marginRight: 8,
    lineHeight: 18,
  },
  addNoteLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  // Compact task list — single card with dividers between rows. Large
  // hit area on every row (entire row toggles status) and an explicit
  // "Skip" secondary control on the right.
  jobDetailTasksList: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(25, 52, 52, 0.06)',
    overflow: 'hidden',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 60,
  },
  taskRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(25, 52, 52, 0.06)',
  },
  taskRowCancelled: {
    backgroundColor: '#FAFAFA',
  },
  taskCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginRight: 12,
  },
  taskCheckboxDone: {
    borderColor: '#3DD57A',
    backgroundColor: '#3DD57A',
  },
  taskCheckboxCancelled: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  taskCheckmark: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 16,
  },
  taskCancelMark: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 16,
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  taskName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#193434',
  },
  taskNameDone: {
    color: '#64748B',
  },
  taskNameCancelled: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
  },
  taskMetaCancelled: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  taskSkipButton: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'center',
  },
  taskSkipButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    flexShrink: 0,
  },
  // Slim one-line total footer. Deliberately subtle — most jobs have
  // one or two tasks and a large "Total" block feels oversized.
  taskTotalLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: JOB_DETAIL_SECTION_GAP,
    paddingHorizontal: 4,
    gap: 8,
  },
  taskTotalText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    flex: 1,
    minWidth: 0,
  },
  taskTotalPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
    flexShrink: 0,
    textAlign: 'right',
  },
  noteInputContainer: {
    marginTop: 16,
    paddingHorizontal: 20, // Match timeline section padding
    // No background - just spacing
  },
  noteInput: {
    minHeight: 100,
    fontSize: 14,
    color: '#193434',
    textAlignVertical: 'top',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    // Width matches timeline content (full width minus paddingHorizontal: 20)
  },
  noteInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  noteIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteSaveIconButton: {
    backgroundColor: '#3DD57A',
  },
  noteSaveButtonDisabled: {
    opacity: 0.6,
  },
  noteCancelIcon: {
    color: '#193434',
    fontSize: 20,
    fontWeight: 'bold',
  },
  noteSaveIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    marginLeft: -100,
    width: 200,
    backgroundColor: '#193434',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 10,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  // Week selector shown above the jobs list in TodayTab / DayViewScreen
  weekSelectorContainer: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  timePickOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  timePickSheet: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  timePickGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  timePickTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
  },
  timePickSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  timePickTabRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  timePickTab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickTabOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  timePickTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  timePickTabTextOn: {
    color: '#193434',
  },
  timePickSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  timePickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  /** Min width so HH:MM is not clipped in narrow % cells on Android. */
  timePickCell: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 82,
    maxWidth: '25%',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickCellTextWrap: {
    width: '100%',
    alignItems: 'center',
  },
  timePickCellOn: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  timePickCellDisabled: {
    opacity: 0.35,
  },
  timePickCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    width: '100%',
  },
  timePickCellTextOn: {
    color: '#FFFFFF',
  },
  timePickCellTextDisabled: {
    color: '#94A3B8',
  },
  timePickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  timePickClearBtn: {
    flexShrink: 0,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  timePickActionTextWrap: {
    alignItems: 'center',
  },
  timePickClearText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  timePickApplyBtn: {
    flexShrink: 0,
    backgroundColor: '#3DD57A',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#193434',
  },
  timePickApplyText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  timePickApplyBtnDisabled: {
    backgroundColor: '#CBD5E1',
    borderColor: '#CBD5E1',
  },
  timePickTitleBlock: {
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  timePickTitleSummary: {
    marginTop: 4,
    width: '100%',
    fontSize: 16,
    fontWeight: '700',
    color: '#0F766E',
    textAlign: 'center',
  },
  timeAccordionHeader: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  timeAccordionHeaderOn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#0F766E',
  },
  timeAccordionHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  timeAccordionHeaderLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  timeAccordionHeaderLabelOn: {
    color: '#0F766E',
  },
  timeAccordionHeaderValueBlock: {
    width: '100%',
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
  },
  timeAccordionHeaderValueBlockOn: {
    color: '#0F766E',
  },
  timeAccordionHeaderValueEmpty: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  timeAccordionHeaderChevron: {
    flexShrink: 0,
    fontSize: 14,
    color: '#94A3B8',
    paddingLeft: 4,
  },
  timeAccordionHeaderChevronOn: {
    color: '#0F766E',
  },
  timeAccordionBody: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  weekSelectorRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  weekSelectorDay: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECE9',
    overflow: 'visible',
  },
  weekSelectorDaySelected: {
    backgroundColor: '#3DD57A',
    borderColor: '#3DD57A',
    shadowColor: '#3DD57A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  weekSelectorDayLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
    paddingHorizontal: 4,
    textAlign: 'center',
    width: '100%',
  },
  weekSelectorDayLabelSelected: {
    color: '#FFFFFF',
  },
  weekSelectorDayNum: {
    fontSize: 18,
    fontWeight: '600',
    color: '#193434',
    paddingHorizontal: 4,
    textAlign: 'center',
    width: '100%',
  },
  weekSelectorDayNumSelected: {
    color: '#FFFFFF',
  },
  // Reserves a consistent vertical slot under the day number so pills
  // have the same height whether they show job dots, a today dot, or
  // nothing.
  weekSelectorBottomSlot: {
    height: 8,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekSelectorTodayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3DD57A',
  },
  weekSelectorDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekSelectorJobDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 1.5,
  },
  // Colours on an unselected (white) pill — mirror the month-calendar
  // job dots so the two screens match.
  weekSelectorDotDefault: {
    backgroundColor: '#193434',
    opacity: 0.45,
  },
  weekSelectorDotCompleted: {
    backgroundColor: '#3DD57A',
  },
  weekSelectorDotSubCompleted: {
    backgroundColor: '#F59E0B',
  },
  weekSelectorDotCancelled: {
    backgroundColor: '#FF6B6B',
  },
  // Colours on a selected (green) pill — use light/white variants so
  // the dots stay visible against the green background.
  weekSelectorDotSelDefault: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  weekSelectorDotSelCompleted: {
    backgroundColor: '#FFFFFF',
  },
  weekSelectorDotSelSubCompleted: {
    backgroundColor: '#FDE68A',
  },
  weekSelectorDotSelCancelled: {
    backgroundColor: '#FECACA',
  },

  // -------------------------------------------------------------------------
  // Employee Overview screen
  // -------------------------------------------------------------------------
  overviewScrollContent: {
    paddingHorizontal: 20,
  },
  overviewBodyFlex: {
    flex: 1,
    paddingHorizontal: 20,
  },
  overviewHeader: {
    marginBottom: 16,
  },
  overviewHeaderHello: {
    fontSize: 14,
    color: '#193434',
    opacity: 0.65,
    marginBottom: 2,
  },
  overviewHeaderCompany: {
    fontSize: 22,
    fontWeight: '700',
    color: '#193434',
  },

  // TodayCard
  todayCard: {
    backgroundColor: '#193434',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  todayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  todayCardKicker: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  todayCardDate: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  todayCardChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCardChevronText: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '600',
    marginTop: -2,
  },
  todayCardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayCardStat: {
    flex: 1,
    alignItems: 'flex-start',
  },
  todayCardStatValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  todayCardStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  todayCardStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 12,
  },
  todayCardEmpty: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 14,
  },

  // RouteCard — fixed height card sitting at the top of the overview scroll.
  routeCard: {
    height: 260,
    backgroundColor: '#CBD5D5',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  routeCardMap: {
    flex: 1,
    backgroundColor: '#e8efef',
  },
  routeCardExpandHint: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  routeCardExpandHintText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  routeCardNoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E8EFEF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  routeCardNoImageText: {
    color: '#4A6565',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  mapFullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  mapFullscreenImage: {
    width: '100%',
    height: '100%',
  },
  mapFullscreenClose: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFullscreenCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  mapFullscreenBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(15,27,27,0.88)',
  },
  routeCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 18, 18, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  routeCardOverlayTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  routeCardOverlaySubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 260,
  },
  routeCardBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(15, 27, 27, 0.82)',
  },
  routeCardKicker: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  routeCardStats: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Request time-off primary button
  requestsHubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
  },
  timeOffPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    shadowColor: '#0F5132',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  timeOffPrimaryBtnIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  timeOffPrimaryBtnIconText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: -2,
  },
  timeOffPrimaryBtnTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  timeOffPrimaryBtnSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  requestsHubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  requestsHubSeeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F0F5F2',
  },
  requestsHubSeeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2A554A',
  },
  requestsHubSeeAllChevron: {
    fontSize: 16,
    color: '#2A554A',
    marginLeft: 2,
    marginTop: -1,
  },
  requestsHubListWrap: {
    marginTop: 10,
  },
  requestsHubList: {
    maxHeight: 132,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#F6F9F7',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    position: 'relative',
  },
  requestsHubRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(25,52,52,0.07)',
  },
  requestsHubRowBadge: {
    backgroundColor: '#B45309',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 10,
  },
  requestsHubRowBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  requestsHubRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
  },
  requestsHubRowSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A16207',
    marginTop: 1,
  },
  requestsHubRowChevron: {
    fontSize: 20,
    color: '#7A9388',
    marginLeft: 8,
    fontWeight: '300',
  },
  requestsHubFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 34,
  },
  requestsHubEmptyRow: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    backgroundColor: '#F6F9F7',
  },
  requestsHubEmptyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5E7A70',
  },

  // My requests block
  myRequestsBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.06)',
  },
  myRequestsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
    marginBottom: 10,
  },
  myRequestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(25,52,52,0.06)',
  },
  myRequestsRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#193434',
  },
  myRequestsRowDate: {
    fontSize: 12,
    color: '#5E7A70',
    marginTop: 2,
  },
  myRequestsStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 10,
  },
  myRequestsStatusPending: {
    backgroundColor: '#FEF3C7',
  },
  myRequestsStatusApproved: {
    backgroundColor: '#D1FAE5',
  },
  myRequestsStatusDeclined: {
    backgroundColor: '#FEE2E2',
  },
  myRequestsStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  myRequestsStatusTextPending: {
    color: '#92400E',
  },
  myRequestsStatusTextApproved: {
    color: '#065F46',
  },
  myRequestsStatusTextDeclined: {
    color: '#991B1B',
  },

  // -------------------------------------------------------------------------
  // TimeOffRequestModal
  // -------------------------------------------------------------------------
  timeOffModalRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
  },
  timeOffModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 22, 22, 0.45)',
  },
  timeOffModalSheetWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  timeOffModalSheet: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: 'stretch',
    // Definite height gives the inner ScrollView (flex: 1) a resolved parent
    // size — without it RN collapses the scroll area to zero and only the
    // bottom submit button ends up visible.
    height: '90%',
  },
  timeOffModalGrip: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(25,52,52,0.18)',
    marginBottom: 10,
  },
  timeOffModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  timeOffModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#193434',
  },
  timeOffModalCloseText: {
    fontSize: 14,
    color: '#5E7A70',
    fontWeight: '500',
    minWidth: 52,
    textAlign: 'right',
    paddingLeft: 8,
  },
  timeOffLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
    marginTop: 10,
    marginBottom: 8,
  },
  timeOffSubLabel: {
    fontSize: 12,
    color: '#5E7A70',
    fontWeight: '500',
    marginBottom: 6,
  },
  timeOffCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 6,
  },
  timeOffCategoryChip: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  timeOffCategoryChipActive: {
    // active state is painted on the inner surface below; this
    // wrapper only handles layout.
  },
  timeOffCategoryChipLabel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
  },
  timeOffCategoryChipLabelActive: {
    backgroundColor: '#0F3C2A',
    borderColor: '#0F3C2A',
    color: '#FFFFFF',
  },
  timeOffCategoryChipHint: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    fontSize: 12,
    color: '#5E7A70',
    fontWeight: '500',
  },
  timeOffCategoryChipHintActive: {
    backgroundColor: '#0F3C2A',
    borderColor: '#0F3C2A',
    color: 'rgba(255,255,255,0.75)',
  },
  timeOffDateRow: {
    flexDirection: 'row',
    marginHorizontal: -6,
    marginBottom: 6,
  },
  timeOffDateCol: {
    flex: 1,
    paddingHorizontal: 6,
  },
  timeOffDateInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#193434',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
  },
  timeOffNotesInput: {
    minHeight: 80,
    paddingVertical: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  timeOffAllDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
  },
  timeOffAllDayHint: {
    fontSize: 12,
    color: '#5E7A70',
    fontWeight: '500',
    marginTop: 2,
  },
  timeOffToggle: {
    width: 44,
    height: 26,
    borderRadius: 14,
    backgroundColor: '#D1D5DB',
    padding: 3,
    justifyContent: 'center',
  },
  timeOffToggleOn: {
    backgroundColor: '#10B981',
  },
  timeOffToggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  timeOffToggleKnobOn: {
    alignSelf: 'flex-end',
  },
  timeOffSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginTop: 12,
  },
  timeOffSubmitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  timeOffSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },

  // --- New time-off UI (category tiles, inline calendar, modes, info) ------
  timeOffCatTileRow: {
    flexDirection: 'row',
    marginHorizontal: -5,
    marginBottom: 6,
  },
  timeOffCatTile: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  timeOffCatTileActive: {
    backgroundColor: '#0F3C2A',
    borderColor: '#0F3C2A',
  },
  timeOffCatTileIcon: {
    fontSize: 26,
    marginBottom: 4,
  },
  timeOffCatTileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
    textAlign: 'center',
  },
  timeOffCatTileLabelActive: {
    color: '#FFFFFF',
  },
  timeOffCatTileHint: {
    fontSize: 10,
    color: '#5E7A70',
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 13,
    width: '100%',
  },
  timeOffCatTileHintActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  timeOffSectionHeader: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginTop: 14,
    gap: 6,
  },
  timeOffRangeSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F3C2A',
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  timeOffCalendarHint: {
    fontSize: 11,
    color: '#5E7A70',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  timeOffModeRow: {
    flexDirection: 'row',
    backgroundColor: '#E8EEEB',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  timeOffModeChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeOffModeChipActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F3C2A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  timeOffModeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5E7A70',
    textAlign: 'center',
    width: '100%',
    lineHeight: 14,
  },
  timeOffModeChipTextActive: {
    color: '#0F3C2A',
  },
  timeOffHoursQuickRow: {
    flexDirection: 'row',
    marginTop: 10,
    marginHorizontal: -4,
  },
  timeOffHoursQuickChip: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    alignItems: 'center',
  },
  timeOffHoursQuickChipActive: {
    backgroundColor: '#0F3C2A',
    borderColor: '#0F3C2A',
  },
  timeOffHoursQuickChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#193434',
  },
  timeOffHoursQuickChipTextActive: {
    color: '#FFFFFF',
  },
  timeOffMultiDayInfo: {
    backgroundColor: '#E8EEEB',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  timeOffMultiDayInfoText: {
    fontSize: 12,
    color: '#0F3C2A',
    fontWeight: '500',
    textAlign: 'center',
  },

  // --- InlineRangeCalendar --------------------------------------------------
  rangeCalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
  },
  rangeCalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  rangeCalNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4F2',
  },
  rangeCalNavText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F3C2A',
    marginTop: -2,
  },
  rangeCalMonthLabel: {
    flex: 1,
    marginHorizontal: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
    textTransform: 'capitalize',
    textAlign: 'center',
    lineHeight: 18,
  },
  rangeCalWeekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 2,
  },
  rangeCalWeekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  rangeCalWeekdayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7F9A8E',
  },
  rangeCalGrid: {
    paddingHorizontal: 2,
  },
  rangeCalGridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rangeCalCell: {
    flex: 1,
    minWidth: 0,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeCalCellInRange: {
    backgroundColor: '#E7F4EE',
  },
  rangeCalCellStart: {
    backgroundColor: '#E7F4EE',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  rangeCalCellEnd: {
    backgroundColor: '#E7F4EE',
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
  },
  rangeCalCellInner: {
    width: '100%',
    maxWidth: 40,
    aspectRatio: 1,
    maxHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  rangeCalCellInnerEdge: {
    backgroundColor: '#0F3C2A',
  },
  rangeCalCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#193434',
    textAlign: 'center',
    minWidth: 22,
    lineHeight: 16,
  },
  rangeCalCellTextPast: {
    color: '#C4D3CC',
  },
  rangeCalCellTextInRange: {
    color: '#0F3C2A',
  },
  rangeCalCellTextEdge: {
    color: '#FFFFFF',
  },

  // --- Requests overview pill on EmployeeOverview --------------------------
  requestsOverviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
  },
  requestsOverviewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E7F4EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  requestsOverviewIconText: {
    fontSize: 18,
  },
  requestsOverviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
  },
  requestsOverviewCounts: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5E7A70',
    marginTop: 2,
  },
  requestsOverviewChevron: {
    fontSize: 22,
    color: '#5E7A70',
    marginLeft: 8,
    fontWeight: '300',
  },
  requestsOverviewPendingDot: {
    marginLeft: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },

  // --- RequestStatusScreen --------------------------------------------------
  reqStatusScreen: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  reqStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  reqStatusBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.08)',
    marginRight: 10,
  },
  reqStatusBackBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F3C2A',
    marginTop: -2,
  },
  reqStatusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#193434',
    flex: 1,
  },
  reqStatusScroll: {
    flex: 1,
  },
  reqStatusSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  reqStatusSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5E7A70',
    textTransform: 'uppercase',
  },
  reqStatusEmpty: {
    padding: 30,
    alignItems: 'center',
  },
  reqStatusEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    marginBottom: 6,
  },
  reqStatusEmptySubtitle: {
    fontSize: 13,
    color: '#5E7A70',
    textAlign: 'center',
  },
  reqStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.06)',
  },
  reqStatusCardPending: {
    borderStyle: 'dashed',
    borderColor: '#F59E0B',
  },
  reqStatusCardDeclined: {
    backgroundColor: '#FDF4F4',
  },
  reqStatusCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reqStatusCardEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  reqStatusCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
  },
  reqStatusCardBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    flexShrink: 0,
  },
  reqStatusCardBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  reqStatusCardBadgeApproved: {
    backgroundColor: '#D1FAE5',
  },
  reqStatusCardBadgeDeclined: {
    backgroundColor: '#FEE2E2',
  },
  reqStatusCardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  reqStatusCardBadgeTextPending: {
    color: '#92400E',
  },
  reqStatusCardBadgeTextApproved: {
    color: '#065F46',
  },
  reqStatusCardBadgeTextDeclined: {
    color: '#991B1B',
  },
  reqStatusCardMeta: {
    fontSize: 13,
    color: '#5E7A70',
    marginTop: 6,
    fontWeight: '500',
  },
  reqStatusCardNotes: {
    fontSize: 13,
    color: '#193434',
    marginTop: 6,
    fontStyle: 'italic',
  },
  reqStatusCardReason: {
    marginTop: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
  },
  reqStatusCardReasonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  reqStatusCardReasonText: {
    fontSize: 13,
    color: '#7F1D1D',
  },
  reqStatusCardCancelBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.25)',
  },
  reqStatusCardCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  // "Show past" CTA at the very bottom of the RequestStatusScreen — lazy
  // trigger, removes itself after tapping.
  reqStatusPastBtn: {
    marginTop: 24,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.10)',
    alignItems: 'center',
  },
  reqStatusPastBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#193434',
  },
  reqStatusPastEmpty: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  reqStatusPastEmptyText: {
    fontSize: 12,
    color: '#5E7A70',
    fontStyle: 'italic',
  },

  // ======================================================================
  // Admin overview + AdminRequestsScreen
  // ======================================================================

  // Admin-only "N pending requests" pill shown on the overview. Amber tint
  // to signal "action needed" — more eye-catching than the employee pill
  // because admins *must* do something about these.
  adminPendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  adminPendingPillZero: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(25,52,52,0.08)',
  },
  adminPendingPillIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  adminPendingPillIconZero: {
    backgroundColor: '#E7F4EE',
  },
  adminPendingPillIconText: {
    fontSize: 20,
  },
  adminPendingPillTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#193434',
  },
  adminPendingPillSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5E7A70',
    marginTop: 2,
  },
  adminPendingPillCount: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  adminPendingPillCountText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // AdminRequestsScreen — overall container
  adminReqScreen: {
    flex: 1,
    backgroundColor: '#F6F9F7',
  },
  adminReqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  adminReqTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#193434',
    flex: 1,
  },
  adminReqScopeWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  adminReqScopeTrigger: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.10)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adminReqScopeTriggerUrgent: {
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  adminReqScopeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5E7A70',
    textTransform: 'uppercase',
  },
  adminReqScopeValue: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
  },
  adminReqScopeGlobalBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminReqScopeGlobalBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  adminReqScopeChevron: {
    fontSize: 16,
    color: '#193434',
    fontWeight: '800',
  },
  adminReqScopeMenu: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.10)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  adminReqScopeMenuContent: {
    paddingVertical: 6,
  },
  adminReqScopeOption: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adminReqScopeOptionActive: {
    backgroundColor: '#EEF7F2',
  },
  adminReqScopeAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F4EE',
  },
  adminReqScopeAvatarCircleMe: {
    backgroundColor: '#193434',
  },
  adminReqScopeInitials: {
    fontSize: 14,
    fontWeight: '800',
    color: '#193434',
  },
  adminReqScopeInitialsMe: {
    color: '#FFFFFF',
  },
  adminReqScopeMain: {
    flex: 1,
    minWidth: 0,
  },
  adminReqScopeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#193434',
  },
  adminReqScopeNameActive: {
    fontWeight: '800',
  },
  adminReqScopeSub: {
    marginTop: 2,
    fontSize: 12,
    color: '#5E7A70',
  },
  adminReqScopeBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminReqScopeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  // List content
  adminReqList: {
    flex: 1,
  },
  adminReqListContent: {
    paddingBottom: 40,
  },
  adminReqEmpty: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
  },
  adminReqEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
    marginBottom: 6,
  },
  adminReqEmptySubtitle: {
    fontSize: 13,
    color: '#5E7A70',
    textAlign: 'center',
  },
  adminReqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.06)',
  },
  adminReqCardPending: {
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
  },
  adminReqCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminReqCardEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  adminReqCardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  adminReqCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#193434',
  },
  adminReqCardMeta: {
    fontSize: 12,
    color: '#5E7A70',
    marginTop: 2,
  },
  adminReqCardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  adminReqCardBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  adminReqCardNotes: {
    marginTop: 8,
    fontSize: 13,
    color: '#193434',
    fontStyle: 'italic',
  },
  adminReqCardActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  adminReqActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(25,52,52,0.10)',
    backgroundColor: '#FFFFFF',
  },
  adminReqActionBtnApprove: {
    backgroundColor: '#193434',
    borderColor: '#193434',
  },
  adminReqActionBtnDecline: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(185,28,28,0.25)',
  },
  adminReqActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#193434',
  },
  adminReqActionBtnTextApprove: {
    color: '#FFFFFF',
  },
  adminReqActionBtnTextDecline: {
    color: '#B91C1C',
  },
  adminReqPanelHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  adminReqPanelHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5E7A70',
    textTransform: 'uppercase',
  },
});
