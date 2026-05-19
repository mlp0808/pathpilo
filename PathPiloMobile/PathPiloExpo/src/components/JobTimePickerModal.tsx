import React, { useEffect, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AndroidSafeText from './AndroidSafeText';

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

const SNAPPY_LAYOUT = {
  duration: 220,
  update: { type: 'spring', springDamping: 0.85 },
} as const;

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
 * Header row used inside the accordion. Two-line: label + chevron on the
 * first row; selected time on the second full-width row so Android never
 * ellipsizes `07:00` inside a tight flex row.
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
 *
 * The header is "folded out" initially. Selecting a time auto-collapses
 * that step and opens the next one (in range mode), giving the polished
 * accordion flow you saw in the previous job creation modal.
 */
export function JobTimePickerModal({
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
                {padAndroidText('Single time')}
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
                {padAndroidText('Time range')}
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

export default JobTimePickerModal;

const styles = StyleSheet.create({
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
  timePickTitleBlock: {
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  timePickTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#193434',
    textAlign: 'center',
  },
  timePickTitleSummary: {
    marginTop: 4,
    width: '100%',
    fontSize: 16,
    fontWeight: '700',
    color: '#0F766E',
    textAlign: 'center',
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
});
