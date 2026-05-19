import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
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

const SCREEN_WIDTH = Dimensions.get('window').width;

async function ensureAuthHeader(): Promise<void> {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function CheckBigIcon({ color = '#0F766E' }: { color?: string }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24">
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function PersonIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M16 14a4 4 0 10-8 0M12 11a3 3 0 100-6 3 3 0 000 6zM4 21a8 8 0 0116 0"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ShieldIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M9 12.5l2 2 4-4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function CopyIcon({ color = '#0F766E' }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ShareIcon({ color = '#193434' }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"
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

type Role = 'employee' | 'manager';
type Step = 'role' | 'details' | 'success';

const ROLE_OPTIONS: {
  key: Role;
  label: string;
  description: string;
  Icon: (props: { color?: string }) => React.ReactElement;
}[] = [
  {
    key: 'employee',
    label: 'Employee',
    description:
      'Can see and complete their assigned jobs and routes for the day.',
    Icon: PersonIcon,
  },
  {
    key: 'manager',
    label: 'Manager',
    description:
      'Can manage clients, services, jobs, invoices, and the team for this company.',
    Icon: ShieldIcon,
  },
];

function roleLabel(r: Role): string {
  return r === 'manager' ? 'Manager' : 'Employee';
}

function roleColor(r: Role): { bg: string; fg: string } {
  if (r === 'manager') return { bg: '#F5E8FF', fg: '#6B21A8' };
  return { bg: '#E6F2EC', fg: '#166534' };
}

// =========================================================================
// Composer screen
// =========================================================================

export function MobileTeamInviteScreen(props: any) {
  const { route, navigation } = props;
  const { company } = route.params || {};
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('role');
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

  const [role, setRole] = useState<Role>('employee');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Filled in after submit, used by the success step
  const [invitationUrl, setInvitationUrl] = useState('');
  const [invitationEmail, setInvitationEmail] = useState('');
  const [invitationRole, setInvitationRole] = useState<Role>('employee');

  const [copySuccess, setCopySuccess] = useState(false);

  const validEmail = useMemo(() => EMAIL_RE.test(email.trim()), [email]);

  const tryClose = () => {
    if (submitting) return;
    if (step === 'success') {
      navigation.goBack();
      return;
    }
    if (email.trim() || role !== 'employee') {
      Alert.alert('Discard invitation?', 'You will lose your progress.', [
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

  const submit = async () => {
    if (!validEmail || submitting) return;
    setSubmitting(true);
    setServerError('');
    try {
      await ensureAuthHeader();
      const trimmed = email.trim();
      // Send the invitation
      await apiClient.post(`/companies/${company?.id}/invite`, {
        email: trimmed,
        role,
      });
      // Re-fetch invitations to grab the new invitation URL & token
      const listRes = await apiClient
        .get(`/companies/${company?.id}/invitations`)
        .catch(() => ({ data: { invitations: [] } }));
      const invitations = (((listRes as any)?.data?.invitations || []) as any[]).map(
        (n: any) => ({
          id: Number(n.id),
          email: String(n.email || ''),
          role: String(n.role || 'employee'),
          invitationUrl: String(n.invitationUrl || n.invitation_url || ''),
        }),
      );
      const match = invitations.find(
        (x) => x.email.toLowerCase() === trimmed.toLowerCase(),
      );
      setInvitationEmail(trimmed);
      setInvitationRole(role);
      setInvitationUrl(match?.invitationUrl || '');
      goToStep('success', 'forward');
    } catch (e: any) {
      setServerError(
        e?.response?.data?.error ||
          e?.message ||
          'Could not send the invitation. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setRole('employee');
    setEmail('');
    setServerError('');
    setInvitationUrl('');
    setInvitationEmail('');
    setCopySuccess(false);
    goToStep('role', 'back');
  };

  const copyLink = async () => {
    if (!invitationUrl) return;
    try {
      await Clipboard.setStringAsync(invitationUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1800);
    } catch {
      Alert.alert('Could not copy', 'Please try again.');
    }
  };

  const shareLink = async () => {
    if (!invitationUrl) return;
    try {
      await Share.share({
        message: `Join ${company?.name || 'our team'} on PathPilo: ${invitationUrl}`,
        url: invitationUrl,
      });
    } catch {
      // user cancelled — silent
    }
  };

  const stepIdx = step === 'role' ? 0 : step === 'details' ? 1 : 2;

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
          <Text style={styles.titleText}>
            {padAndroidText(
              step === 'success' ? 'Invitation sent' : 'Invite a teammate',
            )}
          </Text>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {padAndroidText(
              step === 'success'
                ? `${invitationEmail} · ${roleLabel(invitationRole)}`
                : `For ${company?.name || 'this company'}`,
            )}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <Stepper step={stepIdx} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={20}
      >
        <Animated.View
          style={[
            styles.stepContainer,
            { transform: [{ translateX: stepX }] },
          ]}
        >
          {step === 'role' ? (
            <RoleStep
              role={role}
              onPick={(r) => setRole(r)}
              insets={insets}
            />
          ) : null}

          {step === 'details' ? (
            <DetailsStep
              role={role}
              email={email}
              onEmail={(t) => {
                setEmail(t);
                if (serverError) setServerError('');
              }}
              error={serverError}
              insets={insets}
            />
          ) : null}

          {step === 'success' ? (
            <SuccessStep
              email={invitationEmail}
              role={invitationRole}
              invitationUrl={invitationUrl}
              copySuccess={copySuccess}
              onCopy={copyLink}
              onShare={shareLink}
              insets={insets}
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
          {step === 'role' ? (
            <TouchableOpacity
              onPress={() => goToStep('details', 'forward')}
              style={[styles.btn, styles.btnPrimary]}
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>
                {padAndroidText(`Continue · ${roleLabel(role)}`)}
              </Text>
            </TouchableOpacity>
          ) : null}

          {step === 'details' ? (
            <>
              <TouchableOpacity
                onPress={() => goToStep('role', 'back')}
                style={[styles.btn, styles.btnGhost]}
                activeOpacity={0.85}
                disabled={submitting}
              >
                <Text style={styles.btnGhostText}>
                  {padAndroidText('Back')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  (!validEmail || submitting) && styles.btnDisabled,
                ]}
                activeOpacity={0.85}
                disabled={!validEmail || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    {padAndroidText('Send invitation')}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {step === 'success' ? (
            <>
              <TouchableOpacity
                onPress={restart}
                style={[styles.btn, styles.btnGhost]}
                activeOpacity={0.85}
              >
                <Text style={styles.btnGhostText}>
                  {padAndroidText('Invite another')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={[styles.btn, styles.btnPrimary]}
                activeOpacity={0.85}
              >
                <Text style={styles.btnPrimaryText}>
                  {padAndroidText('Done')}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// =========================================================================
// Stepper
// =========================================================================

function Stepper({ step }: { step: number }) {
  const labels = ['Role', 'Details', 'Sent'];
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
// Step 1 · Role
// =========================================================================

function RoleStep({
  role,
  onPick,
  insets,
}: {
  role: Role;
  onPick: (r: Role) => void;
  insets: { bottom: number };
}) {
  return (
    <ScrollView
      style={styles.stepBody}
      contentContainerStyle={[
        styles.stepScroll,
        { paddingBottom: 130 + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{padAndroidText('Pick a role')}</Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'What should this teammate be able to do? You can change it later from their profile.',
          )}
        </Text>
      </View>

      {ROLE_OPTIONS.map((opt) => {
        const on = role === opt.key;
        const colors = roleColor(opt.key);
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.roleCard, on && styles.roleCardOn]}
            onPress={() => onPick(opt.key)}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.roleIconWrap,
                { backgroundColor: colors.bg },
              ]}
            >
              <opt.Icon color={colors.fg} />
            </View>
            <View style={styles.roleMain}>
              <View style={styles.roleHeaderRow}>
                <Text style={styles.roleLabel}>
                  {padAndroidText(opt.label)}
                </Text>
                <View
                  style={[
                    styles.roleRadio,
                    on && styles.roleRadioOn,
                  ]}
                >
                  {on ? <CheckIcon /> : null}
                </View>
              </View>
              <Text style={styles.roleDescription}>
                {padAndroidText(opt.description)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// =========================================================================
// Step 2 · Details
// =========================================================================

function DetailsStep({
  role,
  email,
  onEmail,
  error,
  insets,
}: {
  role: Role;
  email: string;
  onEmail: (t: string) => void;
  error: string;
  insets: { bottom: number };
}) {
  const colors = roleColor(role);
  const previewEmail = email.trim() || 'their.email@example.com';
  return (
    <ScrollView
      style={styles.stepBody}
      contentContainerStyle={[
        styles.stepScroll,
        { paddingBottom: 130 + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Preview card */}
      <View style={styles.previewCard}>
        <Text style={styles.previewLbl}>{padAndroidText('Sending to')}</Text>
        <Text
          style={[
            styles.previewEmail,
            !email.trim() && styles.previewEmailEmpty,
          ]}
          numberOfLines={1}
        >
          {padAndroidText(previewEmail)}
        </Text>
        <View style={styles.previewMetaRow}>
          <View
            style={[
              styles.previewRolePill,
              { backgroundColor: colors.bg },
            ]}
          >
            <Text
              style={[styles.previewRolePillText, { color: colors.fg }]}
            >
              {padAndroidText(roleLabel(role))}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>
          {padAndroidText('Their email')}
        </Text>
        <Text style={styles.stepSubtitle}>
          {padAndroidText(
            'They\u2019ll get a link to join. They\u2019ll need to sign up if they don\u2019t already have an account.',
          )}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{padAndroidText(error)}</Text>
        </View>
      ) : null}

      <Text style={styles.fieldLbl}>{padAndroidText('Email address')}</Text>
      <View style={styles.formCard}>
        <TextInput
          value={email}
          onChangeText={onEmail}
          placeholder="employee@email.com"
          placeholderTextColor="#94A3B8"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="send"
          style={styles.textField}
        />
      </View>
    </ScrollView>
  );
}

// =========================================================================
// Step 3 · Success
// =========================================================================

function SuccessStep({
  email,
  role,
  invitationUrl,
  copySuccess,
  onCopy,
  onShare,
  insets,
}: {
  email: string;
  role: Role;
  invitationUrl: string;
  copySuccess: boolean;
  onCopy: () => void;
  onShare: () => void;
  insets: { bottom: number };
}) {
  const colors = roleColor(role);
  return (
    <ScrollView
      style={styles.stepBody}
      contentContainerStyle={[
        styles.stepScroll,
        { paddingBottom: 130 + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.successCard}>
        <View style={styles.successCheck}>
          <CheckBigIcon />
        </View>
        <Text style={styles.successTitle}>
          {padAndroidText('Invitation sent')}
        </Text>
        <Text style={styles.successEmail} numberOfLines={1}>
          {padAndroidText(email)}
        </Text>
        <View
          style={[
            styles.previewRolePill,
            { backgroundColor: colors.bg, marginTop: 6 },
          ]}
        >
          <Text style={[styles.previewRolePillText, { color: colors.fg }]}>
            {padAndroidText(roleLabel(role))}
          </Text>
        </View>
      </View>

      <Text style={styles.fieldLbl}>
        {padAndroidText('Direct invitation link')}
      </Text>
      {invitationUrl ? (
        <View style={styles.linkCard}>
          <Text style={styles.linkText} numberOfLines={2}>
            {padAndroidText(invitationUrl)}
          </Text>
        </View>
      ) : (
        <View style={styles.linkCard}>
          <Text style={styles.linkPlaceholder} numberOfLines={2}>
            {padAndroidText(
              'The invitation email is on its way. The link will appear in the team list once available.',
            )}
          </Text>
        </View>
      )}

      <View style={styles.successActionsRow}>
        <TouchableOpacity
          onPress={onCopy}
          activeOpacity={0.85}
          style={[
            styles.successActionBtn,
            !invitationUrl && styles.successActionBtnDisabled,
            copySuccess && styles.successActionBtnOn,
          ]}
          disabled={!invitationUrl}
        >
          {copySuccess ? <CheckIcon color="#0F766E" /> : <CopyIcon />}
          <Text
            style={[
              styles.successActionBtnText,
              copySuccess && { color: '#0F766E' },
            ]}
          >
            {padAndroidText(copySuccess ? 'Copied' : 'Copy link')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onShare}
          activeOpacity={0.85}
          style={[
            styles.successActionBtn,
            !invitationUrl && styles.successActionBtnDisabled,
          ]}
          disabled={!invitationUrl}
        >
          <ShareIcon color="#193434" />
          <Text style={styles.successActionBtnText}>
            {padAndroidText('Share')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.successHintCard}>
        <Text style={styles.successHintTitle}>
          {padAndroidText('What happens next?')}
        </Text>
        <Text style={styles.successHintBody}>
          {padAndroidText(
            'They\u2019ll receive an email with the invitation link. Once they sign up or log in, they\u2019ll automatically join this company.',
          )}
        </Text>
      </View>
    </ScrollView>
  );
}

// =========================================================================
// Styles
// =========================================================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F9F7' },

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
    maxWidth: 260,
  },

  // Stepper
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
  stepScroll: { paddingHorizontal: 16, paddingTop: 4 },
  stepHeader: { paddingTop: 4, paddingBottom: 12 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#193434' },
  stepSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
  },

  // role cards
  roleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  roleCardOn: {
    borderColor: '#193434',
    backgroundColor: '#FFFFFF',
  },
  roleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleMain: { flex: 1, minWidth: 0 },
  roleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  roleLabel: { fontSize: 16, fontWeight: '800', color: '#193434' },
  roleDescription: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  roleRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleRadioOn: {
    backgroundColor: '#3DD57A',
    borderColor: '#3DD57A',
  },

  // preview card (details + success)
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
  previewEmail: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  previewEmailEmpty: { color: '#94CFB7', fontWeight: '600' },
  previewMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  previewRolePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  previewRolePillText: { fontSize: 12, fontWeight: '800' },

  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBannerText: { color: '#B91C1C', fontSize: 13, fontWeight: '700' },

  fieldLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.4,
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
    fontSize: 16,
    color: '#193434',
    backgroundColor: '#FFFFFF',
  },

  // success card
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E7ECE9',
  },
  successCheck: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E6F2EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
  },
  successEmail: {
    marginTop: 4,
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
  },

  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  linkText: {
    fontSize: 12,
    color: '#475569',
    fontVariant: ['tabular-nums'],
  },
  linkPlaceholder: { fontSize: 13, color: '#94A3B8', lineHeight: 18 },

  successActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  successActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  successActionBtnDisabled: { opacity: 0.5 },
  successActionBtnOn: {
    backgroundColor: '#E6F2EC',
    borderColor: '#3DD57A',
  },
  successActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#193434',
  },

  successHintCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  successHintTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#193434',
    marginBottom: 4,
  },
  successHintBody: { fontSize: 13, color: '#64748B', lineHeight: 19 },

  // bottom action bar
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
