import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
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

function isAdminRole(company: any): boolean {
  const role = String(company?.user_role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

function isOwnerRole(role: string): boolean {
  const r = String(role || '').toLowerCase();
  return r === 'owner' || r === 'company-owner';
}

function fmtJoined(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getInitials(first?: string, last?: string): string {
  const a = first?.[0]?.toUpperCase() || '';
  const b = last?.[0]?.toUpperCase() || '';
  return (a + b).trim() || '·';
}

function avatarColorForId(id: number): { bg: string; fg: string } {
  const palette = [
    { bg: '#E6F2EC', fg: '#0F766E' },
    { bg: '#E0E7FF', fg: '#3730A3' },
    { bg: '#FEF3C7', fg: '#92400E' },
    { bg: '#FCE7F3', fg: '#9D174D' },
    { bg: '#DBEAFE', fg: '#1E40AF' },
    { bg: '#FAE8FF', fg: '#86198F' },
  ];
  const idx = Math.abs(id) % palette.length;
  return palette[idx];
}

type RoleKey = 'owner' | 'manager' | 'employee';

function roleBadge(role: string): {
  key: RoleKey;
  label: string;
  bg: string;
  fg: string;
} {
  const r = String(role || '').toLowerCase();
  if (r === 'owner' || r === 'company-owner') {
    return {
      key: 'owner',
      label: 'Owner',
      bg: '#F5E8FF',
      fg: '#6B21A8',
    };
  }
  if (r === 'manager') {
    return {
      key: 'manager',
      label: 'Manager',
      bg: '#E6F2EC',
      fg: '#0F766E',
    };
  }
  return {
    key: 'employee',
    label: 'Employee',
    bg: '#E6F2EC',
    fg: '#166534',
  };
}

// --- icons ----------------------------------------------------------------

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

function ClockIcon({ color = '#92400E' }: { color?: string }) {
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
        d="M5 12h.01M12 12h.01M19 12h.01"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CopyIcon({ color = '#0F766E' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
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

function ResendIcon({ color = '#475569' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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

function TrashIcon({ color = '#B91C1C' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ShareIcon({ color = '#475569' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
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

type TeamUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  created_at?: string;
};

type PendingInvitation = {
  id: number;
  email: string;
  role: string;
  invitationUrl: string;
  status: 'pending';
};

// =========================================================================
// Team screen
// =========================================================================

export function MobileTeamScreen(props: any) {
  const { route, navigation } = props;
  const { company, user } = route.params || {};
  const insets = useSafeAreaInsets();
  const admin = isAdminRole(company);

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [pending, setPending] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'management' | 'employees'>(
    'employees',
  );
  const [actionForUser, setActionForUser] = useState<TeamUser | null>(null);

  const openInvite = useCallback(() => {
    navigation?.navigate?.('TeamInvite', { company, user });
  }, [navigation, company, user]);

  // Per-row in-flight states for optimistic feedback
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resendSuccessId, setResendSuccessId] = useState<number | null>(null);
  const [removingInviteId, setRemovingInviteId] = useState<number | null>(null);
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);
  const [copySuccessId, setCopySuccessId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      await ensureAuthHeader();
      const [uRes, iRes] = await Promise.all([
        apiClient.get('/users'),
        apiClient
          .get(`/companies/${company?.id}/invitations`)
          .catch(() => ({ data: { invitations: [] } })),
      ]);
      const uList = ((uRes as any)?.data?.users || []) as TeamUser[];
      const iList = (((iRes as any)?.data?.invitations || []) as any[]).map(
        (n: any) => ({
          id: Number(n.id),
          email: String(n.email || ''),
          role: String(n.role || 'employee'),
          invitationUrl: String(n.invitationUrl || n.invitation_url || ''),
          status: 'pending' as const,
        }),
      );
      setUsers(uList);
      setPending(iList);
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e?.message || 'Failed to load the team.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh on focus (e.g. after returning from a settings screen)
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

  const managementUsers = useMemo(
    () => users.filter((u) => isOwnerRole(u.role) || u.role === 'manager'),
    [users],
  );
  const employeeUsers = useMemo(
    () => users.filter((u) => u.role === 'employee'),
    [users],
  );
  const employeePending = useMemo(
    () => pending.filter((p) => p.role === 'employee'),
    [pending],
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onCopyLink = async (inv: PendingInvitation) => {
    try {
      await Clipboard.setStringAsync(inv.invitationUrl);
      setCopySuccessId(inv.id);
      setTimeout(() => setCopySuccessId((v) => (v === inv.id ? null : v)), 1800);
    } catch {
      Alert.alert('Could not copy', 'Please try again.');
    }
  };

  const onShareLink = async (inv: PendingInvitation) => {
    try {
      await Share.share({
        message: `Join ${company?.name || 'our team'} on PathPilo: ${inv.invitationUrl}`,
        url: inv.invitationUrl,
      });
    } catch {
      // user cancelled — silent
    }
  };

  const onResend = async (inv: PendingInvitation) => {
    setResendingId(inv.id);
    try {
      await ensureAuthHeader();
      await apiClient.post(
        `/companies/${company?.id}/invitations/${inv.id}/resend`,
      );
      setResendSuccessId(inv.id);
      setTimeout(
        () =>
          setResendSuccessId((v) => (v === inv.id ? null : v)),
        2200,
      );
    } catch (e: any) {
      Alert.alert(
        'Could not resend',
        e?.response?.data?.error || e?.message || 'Please try again.',
      );
    } finally {
      setResendingId(null);
    }
  };

  const onRemoveInvite = async (inv: PendingInvitation) => {
    Alert.alert(
      'Remove invitation?',
      `Remove the pending invitation for ${inv.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingInviteId(inv.id);
            try {
              await ensureAuthHeader();
              await apiClient.delete(
                `/companies/${company?.id}/invitations/${inv.id}`,
              );
              LayoutAnimation.configureNext(SNAPPY);
              setPending((prev) => prev.filter((x) => x.id !== inv.id));
            } catch (e: any) {
              Alert.alert(
                'Could not remove',
                e?.response?.data?.error ||
                  e?.message ||
                  'Please try again.',
              );
            } finally {
              setRemovingInviteId(null);
            }
          },
        },
      ],
    );
  };

  const onRemoveUser = (u: TeamUser) => {
    setActionForUser(null);
    Alert.alert(
      'Remove from company?',
      `${u.first_name} ${u.last_name} will lose access to this company.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingUserId(u.id);
            try {
              await ensureAuthHeader();
              await apiClient.delete(`/users/${u.id}`);
              LayoutAnimation.configureNext(SNAPPY);
              setUsers((prev) => prev.filter((x) => x.id !== u.id));
            } catch (e: any) {
              Alert.alert(
                'Could not remove',
                e?.response?.data?.error ||
                  e?.message ||
                  'Please try again.',
              );
            } finally {
              setRemovingUserId(null);
            }
          },
        },
      ],
    );
  };

  const onInvited = () => {
    // Re-fetch so the new pending invitation includes its server-side
    // invitationUrl, expiry, and other fields.
    LayoutAnimation.configureNext(SNAPPY);
    load();
  };

  const switchTab = (tab: 'management' | 'employees') => {
    if (tab === activeTab) return;
    LayoutAnimation.configureNext(SNAPPY);
    setActiveTab(tab);
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
          <Text style={styles.titleText}>{padAndroidText('Team')}</Text>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {padAndroidText(
              `${users.length} ${users.length === 1 ? 'member' : 'members'}` +
                (employeePending.length > 0
                  ? ` · ${employeePending.length} pending`
                  : ''),
            )}
          </Text>
        </View>
        {admin ? (
          <TouchableOpacity
            onPress={openInvite}
            style={styles.addPill}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.85}
          >
            <PlusIcon color="#FFFFFF" />
            <Text style={styles.addPillText}>{padAndroidText('Add')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {/* Segmented tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'employees' && styles.tabOn]}
          onPress={() => switchTab('employees')}
          activeOpacity={0.85}
        >
          <Text
            style={[styles.tabText, activeTab === 'employees' && styles.tabTextOn]}
            numberOfLines={1}
          >
            {padAndroidText(`Employees · ${employeeUsers.length}`)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'management' && styles.tabOn]}
          onPress={() => switchTab('management')}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'management' && styles.tabTextOn,
            ]}
            numberOfLines={1}
          >
            {padAndroidText(`Management · ${managementUsers.length}`)}
          </Text>
        </TouchableOpacity>
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
        <ScrollView
          style={{ flex: 1 }}
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
        >
          {activeTab === 'employees' ? (
            <>
              {/* Pending invitations */}
              {employeePending.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>
                    {padAndroidText(
                      `Pending · ${employeePending.length}`,
                    )}
                  </Text>
                  {employeePending.map((inv) => (
                    <PendingCard
                      key={`p-${inv.id}`}
                      inv={inv}
                      copySuccess={copySuccessId === inv.id}
                      resending={resendingId === inv.id}
                      resendSuccess={resendSuccessId === inv.id}
                      removing={removingInviteId === inv.id}
                      onCopy={() => onCopyLink(inv)}
                      onShare={() => onShareLink(inv)}
                      onResend={() => onResend(inv)}
                      onRemove={() => onRemoveInvite(inv)}
                    />
                  ))}
                </>
              ) : null}

              {/* Active employees */}
              {employeeUsers.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>
                    {padAndroidText(`Active · ${employeeUsers.length}`)}
                  </Text>
                  {employeeUsers.map((u) => (
                    <UserCard
                      key={u.id}
                      teamUser={u}
                      isSelf={u.id === user?.id}
                      removing={removingUserId === u.id}
                      canManage={admin}
                      onMore={() => setActionForUser(u)}
                    />
                  ))}
                </>
              ) : null}

              {/* Empty state for employees tab */}
              {employeeUsers.length === 0 && employeePending.length === 0 ? (
                <EmptyState
                  title="No employees yet"
                  subtitle="Invite your first employee to assign jobs and routes."
                  ctaLabel={admin ? 'Invite an employee' : undefined}
                  onCta={admin ? openInvite : undefined}
                />
              ) : null}
            </>
          ) : (
            <>
              {managementUsers.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>
                    {padAndroidText('Owners and managers')}
                  </Text>
                  {managementUsers.map((u) => (
                    <UserCard
                      key={u.id}
                      teamUser={u}
                      isSelf={u.id === user?.id}
                      removing={removingUserId === u.id}
                      canManage={admin && !isOwnerRole(u.role)}
                      onMore={() => setActionForUser(u)}
                    />
                  ))}
                </>
              ) : (
                <EmptyState
                  title="No managers yet"
                  subtitle="Owners and managers can administrate this company."
                />
              )}
            </>
          )}
        </ScrollView>
      )}

      <UserActionSheet
        user={actionForUser}
        isSelf={actionForUser?.id === user?.id}
        onClose={() => setActionForUser(null)}
        onRemove={(u) => onRemoveUser(u)}
      />
    </View>
  );
}

// =========================================================================
// User card
// =========================================================================

function UserCard({
  teamUser,
  isSelf,
  removing,
  canManage,
  onMore,
}: {
  teamUser: TeamUser;
  isSelf: boolean;
  removing: boolean;
  canManage: boolean;
  onMore: () => void;
}) {
  const badge = roleBadge(teamUser.role);
  const colors = avatarColorForId(teamUser.id);
  const owner = isOwnerRole(teamUser.role);
  return (
    <View style={[styles.userCard, removing && { opacity: 0.6 }]}>
      <View style={[styles.avatar, { backgroundColor: colors.bg }]}>
        <Text style={[styles.avatarText, { color: colors.fg }]}>
          {padAndroidText(getInitials(teamUser.first_name, teamUser.last_name))}
        </Text>
      </View>
      <View style={styles.userMain}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1}>
            {padAndroidText(
              `${teamUser.first_name || ''} ${teamUser.last_name || ''}`.trim() ||
                'Unnamed',
            )}
          </Text>
          {isSelf ? (
            <View style={styles.youPill}>
              <Text style={styles.youPillText}>{padAndroidText('You')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.userEmail} numberOfLines={1}>
          {padAndroidText(teamUser.email || '')}
        </Text>
        <View style={styles.userMetaRow}>
          <View style={[styles.rolePill, { backgroundColor: badge.bg }]}>
            <Text style={[styles.rolePillText, { color: badge.fg }]}>
              {padAndroidText(badge.label)}
            </Text>
          </View>
          {teamUser.created_at ? (
            <Text style={styles.userJoined} numberOfLines={1}>
              {padAndroidText(`Joined ${fmtJoined(teamUser.created_at)}`)}
            </Text>
          ) : null}
        </View>
      </View>
      {canManage && !owner && !isSelf ? (
        <TouchableOpacity
          onPress={onMore}
          hitSlop={10}
          style={styles.moreBtn}
          disabled={removing}
        >
          {removing ? (
            <ActivityIndicator color="#94A3B8" size="small" />
          ) : (
            <MoreIcon />
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// =========================================================================
// Pending invitation card
// =========================================================================

function PendingCard({
  inv,
  copySuccess,
  resending,
  resendSuccess,
  removing,
  onCopy,
  onShare,
  onResend,
  onRemove,
}: {
  inv: PendingInvitation;
  copySuccess: boolean;
  resending: boolean;
  resendSuccess: boolean;
  removing: boolean;
  onCopy: () => void;
  onShare: () => void;
  onResend: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.pendingCard, removing && { opacity: 0.6 }]}>
      <View style={styles.pendingHeaderRow}>
        <View style={styles.pendingAvatar}>
          <ClockIcon />
        </View>
        <View style={styles.pendingMain}>
          <Text style={styles.pendingEmail} numberOfLines={1}>
            {padAndroidText(inv.email)}
          </Text>
          <Text style={styles.pendingHint}>
            {padAndroidText('Awaiting signup')}
          </Text>
        </View>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>
            {padAndroidText('Pending')}
          </Text>
        </View>
      </View>

      <View style={styles.pendingLinkRow}>
        <Text style={styles.pendingLink} numberOfLines={1}>
          {padAndroidText(inv.invitationUrl)}
        </Text>
        <TouchableOpacity
          onPress={onCopy}
          activeOpacity={0.85}
          style={[
            styles.pendingActionPill,
            copySuccess && styles.pendingActionPillOn,
          ]}
        >
          {copySuccess ? (
            <CheckIcon color="#0F766E" />
          ) : (
            <CopyIcon color="#0F766E" />
          )}
          <Text style={styles.pendingActionPillText}>
            {padAndroidText(copySuccess ? 'Copied' : 'Copy')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.pendingActionsRow}>
        <TouchableOpacity
          onPress={onShare}
          activeOpacity={0.85}
          style={styles.pendingActionGhost}
        >
          <ShareIcon />
          <Text style={styles.pendingActionGhostText}>
            {padAndroidText('Share')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onResend}
          activeOpacity={0.85}
          style={[
            styles.pendingActionGhost,
            resendSuccess && { backgroundColor: '#E6F2EC' },
          ]}
          disabled={resending}
        >
          {resending ? (
            <ActivityIndicator color="#475569" size="small" />
          ) : resendSuccess ? (
            <CheckIcon color="#0F766E" />
          ) : (
            <ResendIcon />
          )}
          <Text
            style={[
              styles.pendingActionGhostText,
              resendSuccess && { color: '#0F766E' },
            ]}
          >
            {padAndroidText(resendSuccess ? 'Sent' : 'Resend')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onRemove}
          activeOpacity={0.85}
          style={styles.pendingActionDanger}
          disabled={removing}
        >
          {removing ? (
            <ActivityIndicator color="#B91C1C" size="small" />
          ) : (
            <TrashIcon />
          )}
          <Text style={styles.pendingActionDangerText}>
            {padAndroidText('Remove')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// =========================================================================
// Empty state
// =========================================================================

function EmptyState({
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyTitle}>{padAndroidText(title)}</Text>
      <Text style={styles.emptySub}>{padAndroidText(subtitle)}</Text>
      {ctaLabel && onCta ? (
        <TouchableOpacity
          style={styles.emptyAddBtn}
          onPress={onCta}
          activeOpacity={0.85}
        >
          <PlusIcon />
          <Text style={styles.emptyAddBtnText}>{padAndroidText(ctaLabel)}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// =========================================================================
// Invite sheet
// =========================================================================

function InviteSheet({
  visible,
  onClose,
  companyId,
  onInvited,
}: {
  visible: boolean;
  onClose: () => void;
  companyId?: number;
  onInvited: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setEmail('');
      setError('');
      setSubmitting(false);
    }
  }, [visible]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter an email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('That email looks invalid.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await ensureAuthHeader();
      await apiClient.post(`/companies/${companyId}/invite`, {
        email: trimmed,
        role: 'employee',
      });
      onInvited();
      onClose();
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          e?.message ||
          'Could not send the invitation.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
          keyboardVerticalOffset={20}
        >
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.sheetGrab} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {padAndroidText('Invite an employee')}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <CloseIcon />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSubtitle}>
              {padAndroidText(
                'They\u2019ll receive an email link to join this company.',
              )}
            </Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  {padAndroidText(error)}
                </Text>
              </View>
            ) : null}

            <Text style={styles.fieldLbl}>{padAndroidText('Email')}</Text>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError('');
              }}
              placeholder="employee@email.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={submit}
              style={styles.textField}
              editable={!submitting}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.btn, styles.btnGhost]}
                activeOpacity={0.85}
                disabled={submitting}
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
                  (!email.trim() || submitting) && styles.btnDisabled,
                ]}
                activeOpacity={0.85}
                disabled={!email.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    {padAndroidText('Send invitation')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// =========================================================================
// User action sheet (kebab menu)
// =========================================================================

function UserActionSheet({
  user,
  isSelf,
  onClose,
  onRemove,
}: {
  user: TeamUser | null;
  isSelf: boolean;
  onClose: () => void;
  onRemove: (u: TeamUser) => void;
}) {
  const insets = useSafeAreaInsets();
  const visible = !!user;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
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
            styles.actionSheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.sheetGrab} />
          {user ? (
            <View style={styles.actionSheetUserRow}>
              <View
                style={[
                  styles.avatar,
                  styles.avatarSheet,
                  { backgroundColor: avatarColorForId(user.id).bg },
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    { color: avatarColorForId(user.id).fg },
                  ]}
                >
                  {padAndroidText(
                    getInitials(user.first_name, user.last_name),
                  )}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.actionSheetName} numberOfLines={1}>
                  {padAndroidText(
                    `${user.first_name || ''} ${user.last_name || ''}`.trim(),
                  )}
                </Text>
                <Text style={styles.actionSheetEmail} numberOfLines={1}>
                  {padAndroidText(user.email || '')}
                </Text>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.actionRow,
              (isSelf || (user && isOwnerRole(user.role))) && { opacity: 0.4 },
            ]}
            activeOpacity={0.85}
            disabled={isSelf || (!!user && isOwnerRole(user.role))}
            onPress={() => user && onRemove(user)}
          >
            <View style={styles.actionRowIconWrap}>
              <TrashIcon />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionRowText}>
                {padAndroidText('Remove from company')}
              </Text>
              <Text style={styles.actionRowHint} numberOfLines={2}>
                {padAndroidText(
                  isSelf
                    ? 'You cannot remove yourself.'
                    : user && isOwnerRole(user.role)
                      ? 'Owners cannot be removed.'
                      : 'Revokes access to this workspace.',
                )}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onClose}
            style={[styles.btn, styles.btnGhost, { marginTop: 8 }]}
            activeOpacity={0.85}
          >
            <Text style={styles.btnGhostText}>{padAndroidText('Cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  titleText: { fontSize: 17, fontWeight: '800', color: '#193434' },
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
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#193434',
    marginRight: 8,
  },
  addPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextOn: { color: '#193434' },

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
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  // user card
  userCard: {
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSheet: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { fontSize: 14, fontWeight: '800' },
  userMain: { flex: 1, minWidth: 0 },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  userName: { fontSize: 15, fontWeight: '800', color: '#193434' },
  youPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  youPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.4,
  },
  userEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  rolePillText: { fontSize: 11, fontWeight: '800' },
  userJoined: { fontSize: 11, color: '#94A3B8' },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // pending card
  pendingCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pendingAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingMain: { flex: 1, minWidth: 0 },
  pendingEmail: { fontSize: 14, fontWeight: '800', color: '#193434' },
  pendingHint: { fontSize: 12, color: '#92400E', marginTop: 2 },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '800', color: '#92400E' },

  pendingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pendingLink: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: '#475569',
    fontVariant: ['tabular-nums'],
  },
  pendingActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E6F2EC',
  },
  pendingActionPillOn: { backgroundColor: '#D1FAE5' },
  pendingActionPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
  },

  pendingActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  pendingActionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pendingActionGhostText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  pendingActionDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  pendingActionDangerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },

  // empty
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

  // sheet (invite + action sheet)
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#193434' },
  sheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
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
  textField: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 15,
    color: '#193434',
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },

  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
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

  actionSheet: {
    backgroundColor: '#F6F9F7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  actionSheetUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 6,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7ECE9',
  },
  actionSheetName: { fontSize: 15, fontWeight: '800', color: '#193434' },
  actionSheetEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 8,
  },
  actionRowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowText: { fontSize: 14, fontWeight: '800', color: '#B91C1C' },
  actionRowHint: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
});
