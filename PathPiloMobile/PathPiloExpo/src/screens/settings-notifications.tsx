import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
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

type TemplateRow = { subject: string; message: string };
type AutomationRow = {
  enabled: boolean;
  lead_value: number;
  lead_unit: 'minutes' | 'hours';
};

/** Matches API `DEFAULT_AUTOMATIONS` + optional SMS rows from DB. */
const AUTOMATION_DEFAULTS: Record<string, AutomationRow> = {
  email_job_created: { enabled: false, lead_value: 5, lead_unit: 'minutes' },
  email_job_reminder: { enabled: false, lead_value: 24, lead_unit: 'hours' },
  email_invoice_due_reminder: { enabled: false, lead_value: 48, lead_unit: 'hours' },
  sms_day_before: { enabled: false, lead_value: 24, lead_unit: 'hours' },
  sms_on_the_way: { enabled: false, lead_value: 1, lead_unit: 'hours' },
};

const AUTOMATION_TO_TEMPLATE: Record<string, string> = {
  email_job_created: 'job_created_confirmation',
  email_job_reminder: 'job_day_reminder',
  email_invoice_due_reminder: 'invoice_due_reminder',
};

const TEMPLATE_KEYS_FOR_SAVE = [
  'job_created_confirmation',
  'job_day_reminder',
  'invoice_due_reminder',
  'change_date',
  'change_time',
  'change_employee',
  'cancel_job',
  'send_invoice',
] as const;

const PERSONALIZATION_TAGS = [
  '{Client name}',
  '{Client first name}',
  '{Job date}',
  '{Company name}',
  '{invoice_number}',
  '{Job time from}',
  '{Job time to}',
];

function isAdminRole(company: any): boolean {
  const r = String(company?.user_role || '').toLowerCase();
  // Some tokens / company payloads use broader admin-like labels.
  // Treat only explicit employee role as read-only on mobile settings.
  return r !== 'employee';
}

function isLegacyAutomatedOpeningMessage(raw: string | undefined): boolean {
  const text = String(raw || '').trim();
  if (!text) return false;
  if (
    text.includes('Hi {Client first name}') &&
    (text.includes('{Job services}') || text.includes('Services:')) &&
    (text.includes('{Job total price}') || text.includes('Total:'))
  ) {
    return true;
  }
  if (text.includes('Time: {Job time range}') && text.includes('Address: {Job address}')) {
    return true;
  }
  if (
    text.includes('Reminder: we are scheduled to visit you') &&
    (text.includes('{Job services}') || text.includes('Services:'))
  ) {
    return true;
  }
  return false;
}

const OPENING_FALLBACK: Record<string, string> = {
  email_job_created: 'Your appointment is booked. Here is a summary of the details.',
  email_job_reminder:
    'We look forward to seeing you. Here is a summary of your appointment.',
  email_invoice_due_reminder:
    'This is a friendly reminder that payment is coming due. You can view and pay using the link in the email.',
};

function normalizeAutomationOpeningMessage(autoKey: string, message: string): string {
  if (
    autoKey !== 'email_job_created' &&
    autoKey !== 'email_job_reminder' &&
    autoKey !== 'email_invoice_due_reminder'
  ) {
    return message;
  }
  if (!isLegacyAutomatedOpeningMessage(message)) return message;
  return OPENING_FALLBACK[autoKey] || message;
}

/** Factory defaults for “Reset” inside the editor (matches api-server seed copy). */
const FACTORY_TEMPLATE_DEFAULTS: Record<string, TemplateRow> = {
  job_created_confirmation: {
    subject: 'Your booking with {Company name} is confirmed for {Job date}',
    message: OPENING_FALLBACK.email_job_created,
  },
  job_day_reminder: {
    subject: 'Reminder: We are coming on {Job date}',
    message: OPENING_FALLBACK.email_job_reminder,
  },
  invoice_due_reminder: {
    subject: 'Reminder: Invoice {invoice_number}',
    message: OPENING_FALLBACK.email_invoice_due_reminder,
  },
  change_date: {
    subject: 'Your appointment — new date: {Job new date}',
    message:
      'Dear {Client name},\n\nYour appointment with {Company name} has been rescheduled.\n\n• Previous date: {Job old date}\n• New date: {Job new date}\n{Job time detail}\n\nIf the new date does not work for you, reply to this email and we will help.\n\nBest regards,\n{Company name}',
  },
  change_time: {
    subject: 'Updated time for your job on {Job date}',
    message:
      'Hi {Client first name},\n\nThe time for your scheduled job has changed.\n\nPrevious time: {Job old time from} - {Job old time to}\nNew time: {Job new time from} - {Job new time to}\nDate: {Job date}\n\nThank you for your understanding.\n\nBest regards,\n{Company name}',
  },
  change_employee: {
    subject: 'Update: your assigned team member has changed',
    message:
      'Hi {Client first name},\n\nYour appointment will now be handled by {Employee new name}.\n\nPrevious team member: {Employee old name}\nNew team member: {Employee new name}\n\nIf you have questions, please reply to this email.\n\nBest regards,\n{Company name}',
  },
  cancel_job: {
    subject: 'Your job on {Job date} has been cancelled',
    message:
      'Hi {Client first name},\n\nWe are sorry, but your scheduled job on {Job date} has been cancelled.\n\nOriginal time: {Job time from} - {Job time to}\nServices: {Job services}\n\nPlease contact us if you want to rebook.\n\nBest regards,\n{Company name}',
  },
  send_invoice: {
    subject: 'Invoice {invoice_number} from {Company name}',
    message:
      'Hi {Client first name},\n\nYour invoice is ready. Open the e-invoice from the email to view details and payment options.\n\nBest regards,\n{Company name}',
  },
};

const AUTOMATION_UI: {
  key: string;
  title: string;
  subtitle: string;
  channel: 'email' | 'sms';
}[] = [
  {
    key: 'email_job_created',
    title: 'Booking confirmation',
    subtitle: 'Email after a job is created',
    channel: 'email',
  },
  {
    key: 'email_job_reminder',
    title: 'Day-before email',
    subtitle: 'Reminder before the visit',
    channel: 'email',
  },
  {
    key: 'email_invoice_due_reminder',
    title: 'Invoice due reminder',
    subtitle: 'Email before due date if unpaid',
    channel: 'email',
  },
  {
    key: 'sms_day_before',
    title: 'SMS day-before',
    subtitle: 'Text reminder before the job day',
    channel: 'sms',
  },
  {
    key: 'sms_on_the_way',
    title: 'SMS on the way',
    subtitle: 'When route status is “on the way”',
    channel: 'sms',
  },
];

const MANUAL_UI: { templateKey: string; title: string; subtitle: string }[] = [
  {
    templateKey: 'change_date',
    title: 'Date changed',
    subtitle: 'When you reschedule to another day',
  },
  {
    templateKey: 'change_time',
    title: 'Time updated',
    subtitle: 'When the visit time changes',
  },
  {
    templateKey: 'change_employee',
    title: 'Employee changed',
    subtitle: 'When the assigned person changes',
  },
  {
    templateKey: 'cancel_job',
    title: 'Job cancelled',
    subtitle: 'When a visit is cancelled',
  },
  {
    templateKey: 'send_invoice',
    title: 'Send invoice',
    subtitle: 'First invoice email to the client',
  },
];

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

function timingHint(autoKey: string): string {
  if (autoKey === 'email_job_created') {
    return 'Minutes after the job is created. Skipped if the job is cancelled before send.';
  }
  if (autoKey === 'email_job_reminder' || autoKey === 'email_invoice_due_reminder') {
    return 'Hours before midnight on the job or due date. Decimals allowed (e.g. 2.5).';
  }
  if (autoKey === 'sms_day_before' || autoKey === 'sms_on_the_way') {
    return 'Hours offset for this automation. SMS wording is edited on the web app.';
  }
  return '';
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function MobileNotificationsSettingsScreen(props: any) {
  const { route, navigation } = props;
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const canEdit = isAdminRole(company);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [templates, setTemplates] = useState<Record<string, TemplateRow>>({});
  const [automations, setAutomations] = useState<Record<string, AutomationRow>>({});
  const [repliesToEmail, setRepliesToEmail] = useState('');
  const [snapshot, setSnapshot] = useState<{
    templates: Record<string, TemplateRow>;
    automations: Record<string, AutomationRow>;
    repliesToEmail: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const [editor, setEditor] = useState<
    | null
    | { kind: 'automation'; autoKey: string }
    | { kind: 'manual'; templateKey: string }
  >(null);

  const applyPayload = useCallback((data: any) => {
    const rawT = data?.templates && typeof data.templates === 'object' ? data.templates : {};
    const mergedT: Record<string, TemplateRow> = {};
    for (const k of TEMPLATE_KEYS_FOR_SAVE) {
      const row = rawT[k];
      mergedT[k] = {
        subject: typeof row?.subject === 'string' ? row.subject : '',
        message: typeof row?.message === 'string' ? row.message : '',
      };
    }
    const rawA =
      data?.automationSettings && typeof data.automationSettings === 'object'
        ? data.automationSettings
        : {};
    const mergedA: Record<string, AutomationRow> = {};
    for (const k of Object.keys(AUTOMATION_DEFAULTS)) {
      const row = rawA[k] as any;
      const base = AUTOMATION_DEFAULTS[k];
      const lv = Number(row?.lead_value ?? row?.leadValue);
      const lu = row?.lead_unit ?? row?.leadUnit;
      mergedA[k] = {
        enabled: typeof row?.enabled === 'boolean' ? row.enabled : base.enabled,
        lead_value: Number.isFinite(lv) ? lv : base.lead_value,
        lead_unit:
          lu === 'minutes' || lu === 'hours' ? lu : base.lead_unit,
      };
    }
    const reply =
      typeof data?.repliesToEmail === 'string' && data.repliesToEmail.trim()
        ? data.repliesToEmail.trim()
        : String(user?.email || '').trim();

    setTemplates(mergedT);
    setAutomations(mergedA);
    setRepliesToEmail(reply);
    setSnapshot({
      templates: deepClone(mergedT),
      automations: deepClone(mergedA),
      repliesToEmail: reply,
    });
  }, [user?.email]);

  const load = useCallback(async () => {
    setLoadError('');
    setLoading(true);
    try {
      await ensureAuthHeader();
      const res = await apiClient.get('/email-templates');
      applyPayload(res.data);
    } catch (e: any) {
      setLoadError(
        String(e?.response?.data?.error || e?.message || 'Failed to load messages'),
      );
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!snapshot) return false;
    return (
      JSON.stringify(templates) !== JSON.stringify(snapshot.templates) ||
      JSON.stringify(automations) !== JSON.stringify(snapshot.automations) ||
      repliesToEmail.trim() !== snapshot.repliesToEmail.trim()
    );
  }, [templates, automations, repliesToEmail, snapshot]);

  const save = async () => {
    if (!canEdit || saving) return;
    const trimmedReply = repliesToEmail.trim();
    if (trimmedReply) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedReply);
      if (!ok) {
        Alert.alert('Reply-to email', 'Enter a valid email or leave empty for owner default.');
        return;
      }
    }
    setSaving(true);
    setSavedFlash(false);
    try {
      await ensureAuthHeader();
      const templatesPayload: Record<string, { subject: string; message: string }> = {};
      for (const k of TEMPLATE_KEYS_FOR_SAVE) {
        const row = templates[k] || { subject: '', message: '' };
        let message = row.message || '';
        const autoKey = Object.keys(AUTOMATION_TO_TEMPLATE).find(
          (a) => AUTOMATION_TO_TEMPLATE[a] === k,
        );
        if (autoKey) {
          message = normalizeAutomationOpeningMessage(autoKey, message);
        }
        templatesPayload[k] = { subject: row.subject || '', message };
      }
      const autoOut: Record<string, AutomationRow> = {};
      for (const k of Object.keys(AUTOMATION_DEFAULTS)) {
        autoOut[k] = {
          ...AUTOMATION_DEFAULTS[k],
          ...(automations[k] || {}),
        };
      }
      autoOut.email_job_created = {
        ...autoOut.email_job_created,
        lead_unit: 'minutes',
        lead_value: Math.max(
          1,
          Math.round(Number(autoOut.email_job_created.lead_value) || 1),
        ),
      };
      await apiClient.put('/email-templates', {
        templates: templatesPayload,
        automationSettings: autoOut,
        repliesToEmail: trimmedReply,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      const refresh = await apiClient.get('/email-templates');
      applyPayload(refresh.data);
    } catch (e: any) {
      Alert.alert(
        'Could not save',
        String(e?.response?.data?.error || e?.message || 'Please try again.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () => setEditor(null);

  const openAutomationEditor = (autoKey: string) => {
    LayoutAnimation.configureNext(SNAPPY);
    setEditor({ kind: 'automation', autoKey });
  };

  const openManualEditor = (templateKey: string) => {
    LayoutAnimation.configureNext(SNAPPY);
    setEditor({ kind: 'manual', templateKey });
  };

  const renderEditor = () => {
    if (!editor) return null;
    if (editor.kind === 'manual') {
      const { templateKey } = editor;
      const row = templates[templateKey] || { subject: '', message: '' };
      return (
        <Modal
          visible
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
          onRequestClose={closeEditor}
        >
          <KeyboardAvoidingView
            style={styles.modalRoot}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 12) }]}>
              <TouchableOpacity onPress={closeEditor} style={styles.modalCloseHit}>
                <Text style={styles.modalCloseTxt}>{padAndroidText('Close')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {padAndroidText(MANUAL_UI.find((m) => m.templateKey === templateKey)?.title || '')}
              </Text>
              <View style={styles.modalCloseHit} />
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 24 + insets.bottom,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalHint}>
                {padAndroidText(
                  MANUAL_UI.find((m) => m.templateKey === templateKey)?.subtitle || '',
                )}
              </Text>
              <Text style={styles.fieldCap}>{padAndroidText('Subject')}</Text>
              <TextInput
                value={row.subject}
                onChangeText={(t) =>
                  setTemplates((prev) => ({
                    ...prev,
                    [templateKey]: { ...prev[templateKey], subject: t, message: row.message },
                  }))
                }
                editable={canEdit}
                style={styles.input}
                placeholder="Subject line"
              />
              <Text style={styles.fieldCap}>{padAndroidText('Message')}</Text>
              <TextInput
                value={row.message}
                onChangeText={(t) =>
                  setTemplates((prev) => ({
                    ...prev,
                    [templateKey]: { ...prev[templateKey], subject: row.subject, message: t },
                  }))
                }
                editable={canEdit}
                multiline
                textAlignVertical="top"
                style={styles.textarea}
              />
              {canEdit ? (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    const d = FACTORY_TEMPLATE_DEFAULTS[templateKey];
                    if (!d) return;
                    setTemplates((prev) => ({
                      ...prev,
                      [templateKey]: { subject: d.subject, message: d.message },
                    }));
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={styles.secondaryBtnTxt}>
                    {padAndroidText('Reset to default text')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      );
    }

    const { autoKey } = editor;
    const meta = AUTOMATION_UI.find((a) => a.key === autoKey);
    const auto = automations[autoKey] || AUTOMATION_DEFAULTS[autoKey];
    const tplKey = AUTOMATION_TO_TEMPLATE[autoKey];
    const tpl = tplKey ? templates[tplKey] || { subject: '', message: '' } : null;
    const isEmailAutomation =
      meta?.channel === 'email' &&
      (autoKey === 'email_job_created' ||
        autoKey === 'email_job_reminder' ||
        autoKey === 'email_invoice_due_reminder');

    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 12) }]}>
            <TouchableOpacity onPress={closeEditor} style={styles.modalCloseHit}>
              <Text style={styles.modalCloseTxt}>{padAndroidText('Close')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {padAndroidText(meta?.title || '')}
            </Text>
            <View style={styles.modalCloseHit} />
          </View>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 32 + insets.bottom,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalHint}>{padAndroidText(meta?.subtitle || '')}</Text>

            <View style={styles.switchRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.switchLabel}>{padAndroidText('Automation')}</Text>
                <Text style={styles.switchHelp}>
                  {padAndroidText('When off, nothing is sent for this flow.')}
                </Text>
              </View>
              <Switch
                value={auto.enabled}
                onValueChange={(v) => {
                  LayoutAnimation.configureNext(SNAPPY);
                  setAutomations((prev) => ({
                    ...prev,
                    [autoKey]: { ...prev[autoKey], enabled: v },
                  }));
                }}
                disabled={!canEdit}
                trackColor={{ false: '#CBD5E1', true: '#94CFB7' }}
                thumbColor={auto.enabled ? '#193434' : '#F1F5F9'}
              />
            </View>

            <Text style={styles.fieldCap}>{padAndroidText('Send timing')}</Text>
            <View style={styles.timingRow}>
              <TextInput
                value={String(auto.lead_value)}
                onChangeText={(raw) => {
                  setAutomations((p) => {
                    const base = p[autoKey] || AUTOMATION_DEFAULTS[autoKey];
                    if (!raw) {
                      return { ...p, [autoKey]: { ...base, lead_value: 0 } };
                    }
                    const next =
                      autoKey === 'email_job_created'
                        ? Math.max(1, parseInt(raw.replace(/\D/g, '') || '1', 10))
                        : parseFloat(raw.replace(',', '.'));
                    if (!Number.isFinite(next)) return p;
                    return {
                      ...p,
                      [autoKey]: { ...base, lead_value: next },
                    };
                  });
                }}
                editable={canEdit}
                keyboardType={
                  autoKey === 'email_job_created' ? 'number-pad' : 'decimal-pad'
                }
                style={styles.timingInput}
              />
              <Text style={styles.timingUnit}>
                {padAndroidText(
                  autoKey === 'email_job_created'
                    ? 'minutes'
                    : auto.lead_unit === 'minutes'
                      ? 'minutes'
                      : 'hours',
                )}
              </Text>
            </View>
            <Text style={styles.timingHint}>{padAndroidText(timingHint(autoKey))}</Text>

            {isEmailAutomation && tpl && tplKey ? (
              <>
                <Text style={[styles.fieldCap, { marginTop: 16 }]}>
                  {padAndroidText('Subject')}
                </Text>
                <TextInput
                  value={tpl.subject}
                  onChangeText={(t) =>
                    setTemplates((prev) => ({
                      ...prev,
                      [tplKey]: { subject: t, message: prev[tplKey]?.message || '' },
                    }))
                  }
                  editable={canEdit}
                  style={styles.input}
                />
                <Text style={styles.fieldCap}>{padAndroidText('Opening message')}</Text>
                <Text style={styles.smallMuted}>
                  {padAndroidText(
                    'Short line under the greeting; full layout is built when sending.',
                  )}
                </Text>
                <TextInput
                  value={normalizeAutomationOpeningMessage(autoKey, tpl.message)}
                  onChangeText={(t) =>
                    setTemplates((prev) => ({
                      ...prev,
                      [tplKey]: { subject: prev[tplKey]?.subject || '', message: t },
                    }))
                  }
                  editable={canEdit}
                  multiline
                  textAlignVertical="top"
                  style={styles.textareaShort}
                />
              </>
            ) : null}

            {meta?.channel === 'sms' ? (
              <View style={styles.smsNote}>
                <Text style={styles.smsNoteTxt}>
                  {padAndroidText(
                    'SMS copy is still edited from the web Messages page. Here you can turn the automation on or off and adjust timing.',
                  )}
                </Text>
              </View>
            ) : null}

            {canEdit && tplKey ? (
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 16 }]}
                onPress={() => {
                  const d = FACTORY_TEMPLATE_DEFAULTS[tplKey];
                  if (!d) return;
                  setTemplates((prev) => ({
                    ...prev,
                    [tplKey]: { subject: d.subject, message: d.message },
                  }));
                  setAutomations((prev) => ({
                    ...prev,
                    [autoKey]: {
                      ...AUTOMATION_DEFAULTS[autoKey],
                      enabled: prev[autoKey]?.enabled ?? false,
                    },
                  }));
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.secondaryBtnTxt}>
                  {padAndroidText('Reset template & timing')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
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
          <Text style={styles.titleText}>{padAndroidText('Messages')}</Text>
          <Text style={styles.subtitleText} numberOfLines={2}>
            {padAndroidText(
              'Emails and SMS your clients receive — same settings as on the web.',
            )}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            LayoutAnimation.configureNext(SNAPPY);
            void load();
          }}
          style={styles.iconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.reloadTxt}>{padAndroidText('Reload')}</Text>
        </TouchableOpacity>
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
                    'Only owners and admins can edit message settings.',
                  )}
                </Text>
              </View>
            ) : null}

            <View style={styles.hero}>
              <Text style={styles.heroKicker}>{padAndroidText('Inbox')}</Text>
              <Text style={styles.heroTitle}>{padAndroidText('Reply-to')}</Text>
              <Text style={styles.heroMeta}>
                {padAndroidText(
                  'Where customer replies to notification emails are delivered.',
                )}
              </Text>
              <TextInput
                value={repliesToEmail}
                onChangeText={setRepliesToEmail}
                editable={canEdit}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="owner@company.com"
                placeholderTextColor="#94A3B8"
                style={styles.heroInput}
              />
            </View>

            <Text style={styles.sectionHeading}>{padAndroidText('Automated')}</Text>
            {AUTOMATION_UI.map((item) => {
              const auto = automations[item.key] || AUTOMATION_DEFAULTS[item.key];
              const tplKey = AUTOMATION_TO_TEMPLATE[item.key];
              const preview = tplKey ? templates[tplKey]?.subject || '—' : '';
              const unitShort =
                item.key === 'email_job_created' || auto.lead_unit === 'minutes'
                  ? 'min'
                  : 'h';
              return (
                <Pressable
                  key={item.key}
                  onPress={() => openAutomationEditor(item.key)}
                  style={({ pressed }) => [
                    styles.card,
                    auto.enabled ? styles.cardOn : styles.cardOff,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.channelPill,
                        item.channel === 'email' ? styles.pillEmail : styles.pillSms,
                      ]}
                    >
                      <Text
                        style={[
                          styles.channelPillTxt,
                          item.channel === 'sms' && styles.channelPillTxtSms,
                        ]}
                      >
                        {padAndroidText(item.channel.toUpperCase())}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusDot,
                        auto.enabled ? styles.statusOn : styles.statusOff,
                      ]}
                    />
                  </View>
                  <Text style={styles.cardTitle}>{padAndroidText(item.title)}</Text>
                  <Text style={styles.cardSub}>{padAndroidText(item.subtitle)}</Text>
                  <Text style={styles.cardMeta}>
                    {padAndroidText(
                      `${auto.enabled ? 'On' : 'Off'} · ${auto.lead_value} ${unitShort}`,
                    )}
                  </Text>
                  {item.channel === 'email' && tplKey ? (
                    <Text style={styles.cardPreview} numberOfLines={1}>
                      {padAndroidText(preview)}
                    </Text>
                  ) : null}
                  <Text style={styles.cardTap}>{padAndroidText('Tap to edit')}</Text>
                </Pressable>
              );
            })}

            <Text style={styles.sectionHeading}>{padAndroidText('Manual templates')}</Text>
            {MANUAL_UI.map((item) => {
              const row = templates[item.templateKey] || { subject: '', message: '' };
              return (
                <Pressable
                  key={item.templateKey}
                  onPress={() => openManualEditor(item.templateKey)}
                  style={({ pressed }) => [
                    styles.card,
                    styles.cardOff,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <View style={[styles.channelPill, styles.pillEmail]}>
                      <Text style={styles.channelPillTxt}>{padAndroidText('EMAIL')}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{padAndroidText(item.title)}</Text>
                  <Text style={styles.cardSub}>{padAndroidText(item.subtitle)}</Text>
                  <Text style={styles.cardPreview} numberOfLines={2}>
                    {padAndroidText(row.message || row.subject || '—')}
                  </Text>
                  <Text style={styles.cardTap}>{padAndroidText('Tap to edit')}</Text>
                </Pressable>
              );
            })}

            <TouchableOpacity
              onPress={() => {
                LayoutAnimation.configureNext(SNAPPY);
                setTagsExpanded((e) => !e);
              }}
              style={styles.tagsToggle}
              activeOpacity={0.85}
            >
              <Text style={styles.tagsToggleTxt}>
                {padAndroidText(tagsExpanded ? 'Hide tags' : 'Personalization tags')}
              </Text>
            </TouchableOpacity>
            {tagsExpanded ? (
              <View style={styles.tagsBox}>
                <Text style={styles.tagsHelp}>
                  {padAndroidText('Use in subjects and bodies — replaced when sending.')}
                </Text>
                <View style={styles.tagWrap}>
                  {PERSONALIZATION_TAGS.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagChipTxt}>{padAndroidText(tag)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {canEdit ? (
            <View
              style={[
                styles.stickyBar,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <TouchableOpacity
                style={[styles.saveBtn, (saving || !dirty) && styles.saveBtnOff]}
                onPress={save}
                disabled={saving || !dirty}
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

      {renderEditor()}
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
  iconBtn: { minWidth: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  titleWrap: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  titleText: { fontSize: 17, fontWeight: '800', color: '#193434' },
  subtitleText: { marginTop: 4, fontSize: 12, color: '#64748B', lineHeight: 17 },
  reloadTxt: { fontSize: 13, fontWeight: '800', color: '#0F766E' },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
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
    marginBottom: 12,
  },
  readOnlyText: { fontSize: 13, color: '#92400E', lineHeight: 18 },
  hero: {
    backgroundColor: '#193434',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94CFB7',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: { marginTop: 6, fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  heroMeta: { marginTop: 6, fontSize: 12, color: '#CBD5E1', lineHeight: 17 },
  heroInput: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  cardOn: {
    borderColor: '#94CFB7',
    backgroundColor: '#F8FFFC',
  },
  cardOff: { borderColor: '#E7ECE9' },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  channelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillEmail: { backgroundColor: '#DBEAFE' },
  pillSms: { backgroundColor: '#EDE9FE' },
  channelPillTxt: { fontSize: 10, fontWeight: '800', color: '#1E3A8A' },
  channelPillTxtSms: { color: '#5B21B6' },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOn: { backgroundColor: '#22C55E' },
  statusOff: { backgroundColor: '#CBD5E1' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#193434' },
  cardSub: { marginTop: 4, fontSize: 12, color: '#64748B', lineHeight: 17 },
  cardMeta: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#0F766E' },
  cardPreview: { marginTop: 6, fontSize: 12, color: '#94A3B8' },
  cardTap: { marginTop: 8, fontSize: 12, fontWeight: '800', color: '#193434' },
  tagsToggle: { alignSelf: 'flex-start', marginTop: 8, marginBottom: 6, paddingVertical: 6 },
  tagsToggleTxt: { fontSize: 14, fontWeight: '800', color: '#0F766E' },
  tagsBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 12,
    marginBottom: 16,
  },
  tagsHelp: { fontSize: 12, color: '#1E40AF', marginBottom: 10, lineHeight: 17 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tagChipTxt: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#1E3A8A' },
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
  saveBtnOff: { opacity: 0.5 },
  saveBtnTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  modalRoot: { flex: 1, backgroundColor: '#F6F9F7' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modalCloseHit: { width: 72, paddingVertical: 8 },
  modalCloseTxt: { fontSize: 16, fontWeight: '700', color: '#0F766E' },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: '#193434',
  },
  modalScroll: { flex: 1 },
  modalHint: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 14 },
  fieldCap: {
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
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#193434',
    minHeight: 200,
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  textareaShort: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#193434',
    minHeight: 88,
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  switchLabel: { fontSize: 15, fontWeight: '700', color: '#193434' },
  switchHelp: { marginTop: 4, fontSize: 12, color: '#64748B', lineHeight: 16 },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timingInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '700',
    color: '#193434',
    backgroundColor: '#FFFFFF',
  },
  timingUnit: { fontSize: 13, fontWeight: '800', color: '#64748B', width: 72 },
  timingHint: { marginTop: 8, fontSize: 12, color: '#94A3B8', lineHeight: 17 },
  smallMuted: { fontSize: 11, color: '#94A3B8', marginBottom: 6, lineHeight: 15 },
  smsNote: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  smsNoteTxt: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  secondaryBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#193434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnTxt: { fontSize: 15, fontWeight: '800', color: '#193434' },
});
