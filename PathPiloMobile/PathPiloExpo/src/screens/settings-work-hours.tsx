import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

async function ensureAuthHeader(): Promise<void> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

type WorkHoursMode = 'fixed' | 'flexible';
type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

type DaySchedule = {
  start: string;
  end: string;
  breakMinutes: number;
  hours: number;
  off: boolean;
};

const WEEKDAYS: { key: Weekday; label: string; short: string }[] = [
  { key: 'monday', label: 'Monday', short: 'M' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tu' },
  { key: 'wednesday', label: 'Wednesday', short: 'W' },
  { key: 'thursday', label: 'Thursday', short: 'Th' },
  { key: 'friday', label: 'Friday', short: 'F' },
  { key: 'saturday', label: 'Saturday', short: 'Sa' },
  { key: 'sunday', label: 'Sunday', short: 'Su' },
];

const DEFAULT_SCHEDULE: Record<Weekday, DaySchedule> = {
  monday: { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  tuesday: { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  wednesday: { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  thursday: { start: '08:00', end: '16:00', breakMinutes: 30, hours: 7.5, off: false },
  friday: { start: '08:00', end: '15:30', breakMinutes: 30, hours: 7.0, off: false },
  saturday: { start: '08:00', end: '16:00', breakMinutes: 0, hours: 0, off: true },
  sunday: { start: '08:00', end: '16:00', breakMinutes: 0, hours: 0, off: true },
};

const HALF_HOUR_TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function computeNetHours(start: string, end: string, breakMinutes: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = end.split(':').map((x) => parseInt(x, 10));
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;
  const mins = eh * 60 + em - (sh * 60 + sm) - (breakMinutes || 0);
  return Math.max(0, mins / 60);
}

function parseTimeSlice(v: unknown, fallback: string): string {
  if (v == null || v === '') return fallback;
  const s = String(v);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function mapRowToSchedule(row: Record<string, unknown>): {
  mode: WorkHoursMode;
  schedule: Record<Weekday, DaySchedule>;
} {
  const mode: WorkHoursMode =
    String(row.work_hours_mode || '').toLowerCase() === 'flexible'
      ? 'flexible'
      : 'fixed';
  const next: Record<Weekday, DaySchedule> = { ...DEFAULT_SCHEDULE };
  for (const { key } of WEEKDAYS) {
    const rawHours = row[`${key}_hours`];
    const hours =
      rawHours != null && rawHours !== ''
        ? parseFloat(String(rawHours))
        : DEFAULT_SCHEDULE[key].hours;
    const start = parseTimeSlice(
      row[`${key}_start`],
      DEFAULT_SCHEDULE[key].start || '08:00',
    );
    const end = parseTimeSlice(row[`${key}_end`], DEFAULT_SCHEDULE[key].end || '16:00');
    const brk =
      row[`${key}_break_minutes`] != null
        ? Number(row[`${key}_break_minutes`])
        : DEFAULT_SCHEDULE[key].breakMinutes;
    next[key] = {
      start: start || '08:00',
      end: end || '16:00',
      breakMinutes: Number.isFinite(brk) ? brk : 0,
      hours: Number.isFinite(hours) ? hours : 0,
      off:
        mode === 'flexible'
          ? !hours
          : computeNetHours(start || '08:00', end || '16:00', brk || 0) === 0,
    };
  }
  return { mode, schedule: next };
}

function isAdminRole(company: any): boolean {
  const r = String(company?.user_role || '').toLowerCase();
  // Some tokens / company payloads use broader admin-like labels.
  // Treat only explicit employee role as read-only on mobile settings.
  return r !== 'employee';
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

export function MobileWorkHoursSettingsScreen(props: any) {
  const { route, navigation } = props;
  const { company } = route.params || {};
  const insets = useSafeAreaInsets();
  const canEdit = isAdminRole(company);

  const [mode, setMode] = useState<WorkHoursMode>('fixed');
  const [schedule, setSchedule] =
    useState<Record<Weekday, DaySchedule>>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [timePick, setTimePick] = useState<{
    day: Weekday;
    field: 'start' | 'end';
  } | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    setLoading(true);
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/company-defaults/work-hours');
      const row = (res as any)?.data?.defaults || {};
      const mapped = mapRowToSchedule(row as Record<string, unknown>);
      setMode(mapped.mode);
      setSchedule(mapped.schedule);
    } catch (e: any) {
      setLoadError(
        e?.response?.data?.error ||
          e?.message ||
          'Could not load work hours.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setDay = (key: Weekday, patch: Partial<DaySchedule>) => {
    if (!canEdit) return;
    LayoutAnimation.configureNext(SNAPPY);
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const toggleDayOff = (key: Weekday) => {
    if (!canEdit) return;
    const d = schedule[key];
    if (d.off) {
      const def = DEFAULT_SCHEDULE[key];
      if (mode === 'flexible') {
        setDay(key, {
          off: false,
          hours: d.hours > 0 ? d.hours : 7.5,
        });
      } else {
        setDay(key, {
          off: false,
          start: d.start || def.start,
          end: d.end || def.end,
          breakMinutes: def.breakMinutes,
        });
      }
    } else {
      setDay(key, { off: true });
    }
  };

  const copyMondayToWeekdays = () => {
    if (!canEdit) return;
    LayoutAnimation.configureNext(SNAPPY);
    setSchedule((prev) => {
      const mon = prev.monday;
      const next = { ...prev };
      for (const key of ['tuesday', 'wednesday', 'thursday', 'friday'] as Weekday[]) {
        next[key] = { ...mon };
      }
      return next;
    });
  };

  const totalWeek = useMemo(() => {
    let total = 0;
    for (const { key } of WEEKDAYS) {
      const d = schedule[key];
      if (d.off) continue;
      total += mode === 'fixed' ? computeNetHours(d.start, d.end, d.breakMinutes) : d.hours;
    }
    return total;
  }, [schedule, mode]);

  const save = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setSavedFlash(false);
    try {
      await ensureAuthHeader();
      const payload: Record<string, unknown> = { work_hours_mode: mode };
      for (const { key } of WEEKDAYS) {
        const d = schedule[key];
        if (mode === 'fixed') {
          payload[`${key}_start`] = d.off ? null : d.start;
          payload[`${key}_end`] = d.off ? null : d.end;
          payload[`${key}_break_minutes`] = d.off ? 0 : Math.max(0, d.breakMinutes || 0);
          payload[`${key}_hours`] = d.off
            ? 0
            : computeNetHours(d.start, d.end, d.breakMinutes);
        } else {
          payload[`${key}_hours`] = d.off ? 0 : Math.max(0, d.hours || 0);
          payload[`${key}_start`] = null;
          payload[`${key}_end`] = null;
          payload[`${key}_break_minutes`] = 0;
        }
      }
      await apiClient.put('/company-defaults/work-hours', payload);
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

  const currentPickValue =
    timePick != null ? schedule[timePick.day][timePick.field] : '';

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
          <Text style={styles.titleText}>{padAndroidText('Work hours')}</Text>
          <Text style={styles.subtitleText} numberOfLines={2}>
            {padAndroidText(
              'Default schedule for new employees. Existing team members keep their own.',
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
              { paddingBottom: 120 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!canEdit ? (
              <View style={styles.readOnlyBanner}>
                <Text style={styles.readOnlyText}>
                  {padAndroidText(
                    'Only owners and admins can edit company defaults. You can still view the schedule.',
                  )}
                </Text>
              </View>
            ) : null}

            <View style={styles.hero}>
              <Text style={styles.heroKicker}>{padAndroidText('Weekly total')}</Text>
              <Text style={styles.heroBig}>
                {padAndroidText(`${totalWeek.toFixed(1)} h`)}
              </Text>
              <Text style={styles.heroMeta}>
                {padAndroidText(
                  mode === 'fixed'
                    ? 'Fixed: same start and end each day.'
                    : 'Flexible: daily hour budget, no fixed clock.',
                )}
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.segment}>
                <TouchableOpacity
                  style={[styles.segBtn, mode === 'fixed' && styles.segBtnOn]}
                  onPress={() => {
                    if (!canEdit) return;
                    LayoutAnimation.configureNext(SNAPPY);
                    setMode('fixed');
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.segTxt, mode === 'fixed' && styles.segTxtOn]}
                    numberOfLines={1}
                  >
                    {padAndroidText('Fixed hours')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segBtn, mode === 'flexible' && styles.segBtnOn]}
                  onPress={() => {
                    if (!canEdit) return;
                    LayoutAnimation.configureNext(SNAPPY);
                    setMode('flexible');
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.segTxt,
                      mode === 'flexible' && styles.segTxtOn,
                    ]}
                    numberOfLines={1}
                  >
                    {padAndroidText('Flexible hours')}
                  </Text>
                </TouchableOpacity>
              </View>

              {canEdit ? (
                <TouchableOpacity
                  style={styles.copyLink}
                  onPress={copyMondayToWeekdays}
                  activeOpacity={0.85}
                >
                  <Text style={styles.copyLinkTxt}>
                    {padAndroidText('Copy Monday → Tue–Fri')}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.hintBox}>
                <Text style={styles.hint}>
                  {padAndroidText(
                    mode === 'fixed'
                      ? 'Best when everyone starts and ends around the same time — helps route planning.'
                      : 'Best for contractors: a daily hours target without fixed clock-in times.',
                  )}
                </Text>
              </View>

              {WEEKDAYS.map(({ key, label, short }) => {
                const d = schedule[key];
                const netH =
                  mode === 'fixed'
                    ? computeNetHours(d.start, d.end, d.breakMinutes)
                    : d.hours;
                return (
                  <View
                    key={key}
                    style={[
                      styles.dayShell,
                      d.off && styles.dayShellOff,
                      Platform.OS === 'ios' && styles.dayShellShadowIos,
                      Platform.OS === 'android' && styles.dayShellShadowAndroid,
                    ]}
                  >
                    <View
                      style={[
                        styles.dayStrip,
                        d.off ? styles.dayStripOff : styles.dayStripOn,
                      ]}
                    />
                    <View style={styles.dayInner}>
                      <View style={styles.dayTopRow}>
                        <View style={styles.dayLeft}>
                          <View
                            style={[
                              styles.dayAvatar,
                              d.off && styles.dayAvatarOff,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayAvatarTxt,
                                d.off && styles.dayAvatarTxtOff,
                              ]}
                              numberOfLines={1}
                            >
                              {padAndroidText(short)}
                            </Text>
                          </View>
                          <View style={styles.dayTitleCol}>
                            <Text
                              style={[styles.dayName, d.off && styles.dayNameOff]}
                              numberOfLines={1}
                            >
                              {padAndroidText(label)}
                            </Text>
                            {d.off ? (
                              <Text style={styles.dayMetaMuted} numberOfLines={1}>
                                {padAndroidText('No work scheduled')}
                              </Text>
                            ) : mode === 'fixed' ? (
                              <Text style={styles.dayMeta} numberOfLines={1}>
                                {padAndroidText(
                                  `${d.start} → ${d.end} · ${d.breakMinutes} min break`,
                                )}
                              </Text>
                            ) : (
                              <Text style={styles.dayMeta} numberOfLines={1}>
                                {padAndroidText(`${d.hours} h daily target`)}
                              </Text>
                            )}
                          </View>
                        </View>
                        <View style={styles.dayRight}>
                          {!d.off ? (
                            <View style={styles.netChip}>
                              <Text style={styles.netChipTxt} numberOfLines={1}>
                                {padAndroidText(`${netH.toFixed(1)} h net`)}
                              </Text>
                            </View>
                          ) : null}
                          <TouchableOpacity
                            onPress={() => toggleDayOff(key)}
                            disabled={!canEdit}
                            style={[
                              styles.pill,
                              d.off ? styles.pillOff : styles.pillOn,
                            ]}
                            activeOpacity={0.85}
                          >
                            <Text
                              style={[
                                styles.pillTxt,
                                d.off ? styles.pillTxtOff : styles.pillTxtOn,
                              ]}
                              numberOfLines={1}
                            >
                              {padAndroidText(d.off ? 'Off' : 'Working')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {!d.off && mode === 'fixed' ? (
                        <View style={styles.dayFieldsPanel}>
                          <View style={styles.timePairRow}>
                            <View style={styles.timeBlock}>
                              <Text style={styles.fieldCap}>
                                {padAndroidText('Start')}
                              </Text>
                              <TouchableOpacity
                                style={styles.timePill}
                                disabled={!canEdit}
                                onPress={() =>
                                  setTimePick({ day: key, field: 'start' })
                                }
                                activeOpacity={0.85}
                              >
                                <Text style={styles.timePillTxt}>
                                  {padAndroidText(d.start)}
                                </Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={styles.timeArrow}>→</Text>
                            <View style={styles.timeBlock}>
                              <Text style={styles.fieldCap}>
                                {padAndroidText('End')}
                              </Text>
                              <TouchableOpacity
                                style={styles.timePill}
                                disabled={!canEdit}
                                onPress={() =>
                                  setTimePick({ day: key, field: 'end' })
                                }
                                activeOpacity={0.85}
                              >
                                <Text style={styles.timePillTxt}>
                                  {padAndroidText(d.end)}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={styles.breakInline}>
                            <Text style={styles.fieldCap}>
                              {padAndroidText('Break')}
                            </Text>
                            <TextInput
                              value={String(d.breakMinutes)}
                              onChangeText={(t) => {
                                const n = Math.max(
                                  0,
                                  Math.min(
                                    480,
                                    parseInt(t.replace(/\D/g, '') || '0', 10) ||
                                      0,
                                  ),
                                );
                                setDay(key, { breakMinutes: n });
                              }}
                              editable={canEdit}
                              keyboardType="number-pad"
                              style={styles.breakInputNew}
                            />
                            <Text style={styles.breakUnit}>
                              {padAndroidText('min')}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {!d.off && mode === 'flexible' ? (
                        <View style={styles.dayFieldsPanel}>
                          <View style={styles.flexRowNew}>
                            <Text style={styles.fieldCap}>
                              {padAndroidText('Hours per day')}
                            </Text>
                            <View style={styles.hoursRow}>
                              <TextInput
                                value={String(d.hours)}
                                onChangeText={(t) => {
                                  const n = Math.max(
                                    0,
                                    Math.min(
                                      24,
                                      parseFloat(t.replace(',', '.')) || 0,
                                    ),
                                  );
                                  setDay(key, { hours: Math.round(n * 2) / 2 });
                                }}
                                editable={canEdit}
                                keyboardType="decimal-pad"
                                style={styles.hoursInputNew}
                              />
                              <Text style={styles.hoursUnit}>h</Text>
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
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
                style={[styles.saveBtn, saving && styles.saveBtnOff]}
                onPress={save}
                disabled={saving}
                activeOpacity={0.88}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnTxt}>
                    {padAndroidText(savedFlash ? 'Saved ✓' : 'Save changes')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}

      <Modal
        visible={timePick != null}
        animationType="slide"
        transparent
        onRequestClose={() => setTimePick(null)}
      >
        <View style={styles.modalScrim}>
          <View style={[styles.timeSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>
              {padAndroidText(
                timePick
                  ? `${WEEKDAYS.find((w) => w.key === timePick.day)?.label} · ${
                      timePick.field === 'start' ? 'Start' : 'End'
                    }`
                  : '',
              )}
            </Text>
            <ScrollView
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.timeGrid}>
                {HALF_HOUR_TIME_SLOTS.map((t) => {
                  const on = t === currentPickValue;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.timeCell, on && styles.timeCellOn]}
                      onPress={() => {
                        if (!timePick) return;
                        setDay(timePick.day, { [timePick.field]: t });
                        setTimePick(null);
                      }}
                    >
                      <Text
                        style={[styles.timeCellTxt, on && styles.timeCellTxtOn]}
                      >
                        {padAndroidText(t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setTimePick(null)}
            >
              <Text style={styles.modalCloseTxt}>{padAndroidText('Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  hero: {
    backgroundColor: '#193434',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94CFB7',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroBig: { marginTop: 8, fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  heroMeta: { marginTop: 8, fontSize: 13, color: '#CBD5E1', lineHeight: 18 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    padding: 14,
    marginBottom: 16,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  segBtnOn: { backgroundColor: '#FFFFFF' },
  segTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  segTxtOn: { color: '#193434' },
  copyLink: { alignSelf: 'flex-start', marginBottom: 10 },
  copyLinkTxt: { fontSize: 13, fontWeight: '800', color: '#0F766E' },
  hintBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
  },
  hint: { fontSize: 12, color: '#64748B', lineHeight: 17 },
  dayShell: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dayShellOff: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  dayShellShadowIos: {
    shadowColor: '#193434',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
  },
  dayShellShadowAndroid: {
    elevation: 2,
  },
  dayStrip: { width: 5 },
  dayStripOn: { backgroundColor: '#0F766E' },
  dayStripOff: { backgroundColor: '#CBD5E1' },
  dayInner: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dayTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  dayLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  dayAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E6F2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayAvatarOff: { backgroundColor: '#E2E8F0' },
  dayAvatarTxt: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F766E',
  },
  dayAvatarTxtOff: { color: '#64748B' },
  dayTitleCol: { flex: 1, minWidth: 0 },
  dayName: { fontSize: 16, fontWeight: '800', color: '#193434' },
  dayNameOff: { color: '#94A3B8' },
  dayMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 16,
  },
  dayMetaMuted: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 16,
  },
  dayRight: { alignItems: 'flex-end', gap: 8 },
  netChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E6F2EC',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  netChipTxt: { fontSize: 11, fontWeight: '800', color: '#166534' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillOn: { backgroundColor: '#E6F2EC' },
  pillOff: { backgroundColor: '#E2E8F0' },
  pillTxt: { fontSize: 12, fontWeight: '800' },
  pillTxtOn: { color: '#166534' },
  pillTxtOff: { color: '#64748B' },
  dayFieldsPanel: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    gap: 12,
  },
  timePairRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  timeBlock: { flex: 1, minWidth: 0 },
  fieldCap: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timePill: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  timePillTxt: { fontSize: 16, fontWeight: '800', color: '#193434' },
  timeArrow: {
    paddingBottom: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  breakInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  breakInputNew: {
    width: 68,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: '800',
    color: '#193434',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  breakUnit: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  flexRowNew: { gap: 8 },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  hoursInputNew: {
    width: 88,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '800',
    color: '#193434',
    backgroundColor: '#F8FAFC',
  },
  hoursUnit: { fontSize: 15, fontWeight: '800', color: '#64748B' },
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
  saveBtnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  timeSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#193434',
    marginBottom: 12,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  timeCell: {
    width: '22%',
    maxWidth: 88,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  timeCellOn: { backgroundColor: '#193434' },
  timeCellTxt: { fontSize: 13, fontWeight: '700', color: '#475569' },
  timeCellTxtOn: { color: '#FFFFFF' },
  modalClose: { paddingVertical: 14, alignItems: 'center' },
  modalCloseTxt: { fontSize: 16, fontWeight: '700', color: '#64748B' },
});
