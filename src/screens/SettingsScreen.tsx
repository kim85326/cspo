import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { updateDevicePrefs, type DevicePrefs } from "@/data/devicePrefs";
import { lockUnavailableMessage, authFailureMessage } from "@/domain/appLock";
import { useDevicePrefs } from "@/hooks/useDevicePrefs";
import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { authenticate, biometricsSupported, deviceAuthLevel } from "@/native/biometrics";
import {
  getNotificationPermission,
  notificationsSupported,
  openNotificationSettings,
  requestNotificationPermission,
  type NotificationPermission,
} from "@/native/notifications";
import { DISCLAIMER_TEXT } from "@/ui/DisclaimerGate";
import { useHaptics } from "@/ui/haptics";
import { Icon, type IconName } from "@/ui/Icon";
import { Card, Notice, surfaceStyles } from "@/ui/Surface";
import { colors, fonts, iconSize, pressedOpacity, radius, space, touchTarget, type } from "@/ui/theme";
import { VersionBadge } from "@/ui/VersionBadge";

/**
 * 設定頁（「設定」分頁，標題在 src/app/(tabs)/_layout.tsx）。對應 docs/stories/013-disclaimer.md（常駐免責聲明）、
 * 020-pro-plan-lock.md（方案狀態與 Demo 開關，由功能開關 proPlan 控制，預設關閉）、
 * 034-local-notifications.md（三種通知的開關，功能開關 notifications）、
 * 035-app-lock.md（打開 app 時要驗證，功能開關 biometricLock）。後兩者網頁版不顯示。
 * Google 登入入口之後也會放這裡。
 */
export default function SettingsScreen() {
  const { pro, demoUnlocked, setDemoUnlocked } = useProStatus();
  const features = useFeatures();
  const showPro = features.proPlan;
  const haptics = useHaptics();

  return (
    <ScrollView style={surfaceStyles.screen} contentContainerStyle={[surfaceStyles.screenContent, styles.content]}>
      {showPro ? (
        <Section title="方案">
          <Card style={styles.listCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看 Pro 方案"
              testID="button-open-pro"
              onPress={() => router.push("/pro")}
              style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
            >
              <RowIcon name="crown" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} testID="current-plan">
                  目前方案：{pro ? "Pro（Demo 解鎖）" : "Free"}
                </Text>
                <Text style={styles.rowSub}>查看 Pro 方案</Text>
              </View>
              <Icon name="chevronRight" size={iconSize.sm} color={colors.mutedForeground} />
            </Pressable>
          </Card>
        </Section>
      ) : null}

      <Section title="自動記帳">
        <Card style={styles.listCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="定期定額設定"
            testID="button-open-dca"
            onPress={() => router.push("/dca")}
            style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
          >
            <RowIcon name="calendar" />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>定期定額</Text>
              <Text style={styles.rowSub}>每月扣款日自動記上一筆定期定額買入。</Text>
            </View>
            <Icon name="chevronRight" size={iconSize.sm} color={colors.mutedForeground} />
          </Pressable>
        </Card>
      </Section>

      {features.notifications && notificationsSupported ? <NotificationSection /> : null}

      {features.biometricLock && biometricsSupported ? <AppLockSection /> : null}

      <Section title="免責聲明">
        <Card testID="settings-disclaimer" style={styles.disclaimer}>
          <RowIcon name="shield" />
          <Text style={styles.bodyText}>{DISCLAIMER_TEXT}</Text>
        </Card>
      </Section>

      {showPro ? (
        <Section title="展示用">
          <Card style={styles.listCard}>
            <View style={styles.listRow}>
              <RowIcon name="lock" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Demo：解鎖所有 Pro 功能</Text>
                <Text style={styles.rowSub}>只為了展示，不會收費；關掉就恢復成 Free。</Text>
              </View>
              <Switch
                accessibilityLabel="Demo：解鎖所有 Pro 功能"
                testID="switch-pro-demo"
                value={demoUnlocked}
                onValueChange={(value) => {
                  haptics.toggle();
                  void setDemoUnlocked(value);
                }}
                trackColor={{ true: colors.secondary, false: colors.border }}
                thumbColor={colors.card}
              />
            </View>
          </Card>
        </Section>
      ) : null}

      <VersionBadge />
    </ScrollView>
  );
}

type NotificationPref = "closeSummary" | "dividendReminder" | "dcaReminder";

const NOTIFICATION_ROWS: { key: NotificationPref; icon: IconName; title: string; sub: string }[] = [
  {
    key: "closeSummary",
    icon: "trendingUp",
    title: "收盤損益",
    sub: "交易日 14:30 收盤後，通知今天賺賠多少與總報酬。手機沒讓 app 在背景執行時，改成 19:00 提醒你打開看。",
  },
  { key: "dividendReminder", icon: "coins", title: "除息提醒", sub: "持有的股票除息日前一天早上 9 點提醒。" },
  { key: "dcaReminder", icon: "calendar", title: "定期定額扣款", sub: "扣款日當天早上 9 點提醒。" },
];

/**
 * 通知（Story 034）：三種通知各自開關。第一次打開任何一個時才跟系統要通知權限；
 * 被拒絕（或之前拒絕過、系統不再詢問）時開關維持關閉，顯示「前往系統設定」。
 */
function NotificationSection() {
  const prefs = useDevicePrefs();
  const haptics = useHaptics();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [denied, setDenied] = useState(false);

  // 從系統設定回來時重新檢查權限
  useEffect(() => {
    let active = true;
    const check = () =>
      void getNotificationPermission().then((value) => {
        if (!active) return;
        setPermission(value);
        if (value === "granted") setDenied(false);
      });
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const toggle = async (key: NotificationPref, value: boolean) => {
    haptics.toggle();
    if (!value) {
      await updateDevicePrefs({ [key]: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result !== "granted") {
      setDenied(true);
      return;
    }
    setDenied(false);
    await updateDevicePrefs({ [key]: true });
  };

  const anyOn = !!prefs && NOTIFICATION_ROWS.some((row) => prefs[row.key]);
  const blocked = denied || (anyOn && permission === "blocked");

  return (
    <Section title="通知">
      {blocked ? (
        <Notice
          tone="warning"
          title="通知權限被關閉了"
          message="要收到通知，請到系統設定裡允許「賺了嗎」傳送通知，再回來打開開關。"
          action={{ label: "前往系統設定", onPress: () => void openNotificationSettings() }}
          testID="notification-permission-denied"
          alert
        />
      ) : null}
      <Card style={styles.listCard}>
        {NOTIFICATION_ROWS.map((row, index) => (
          <SwitchRow
            key={row.key}
            icon={row.icon}
            title={row.title}
            sub={row.sub}
            testID={`switch-notify-${row.key}`}
            value={!!prefs?.[row.key] && permission !== "blocked"}
            disabled={prefs === null}
            divider={index > 0}
            onChange={(value) => void toggle(row.key, value)}
          />
        ))}
      </Card>
      <Text style={styles.footnote}>
        通知只在這支手機上排程，不會上傳任何資料。系統為了省電可能晚幾分鐘才跳出；休市日不另外判斷。
      </Text>
    </Section>
  );
}

/**
 * 打開 app 時要驗證（Story 035）。打開前先確認手機有設定螢幕鎖，並驗證一次是本人；
 * 手機什麼都沒設定就不讓打開，說明原因。
 */
function AppLockSection() {
  const prefs = useDevicePrefs();
  const haptics = useHaptics();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (value: boolean) => {
    haptics.toggle();
    setMessage(null);
    if (!value) {
      await updateDevicePrefs({ biometricLock: false });
      return;
    }
    setBusy(true);
    try {
      const unavailable = lockUnavailableMessage(await deviceAuthLevel());
      if (unavailable) {
        setMessage(unavailable);
        return;
      }
      const result = await authenticate("確認是你本人，才能開啟驗證");
      if (!result.ok) {
        setMessage(authFailureMessage(result.reason));
        return;
      }
      await updateDevicePrefs({ biometricLock: true } satisfies Partial<DevicePrefs>);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="安全">
      {message ? <Notice tone="error" message={message} testID="app-lock-setting-error" alert /> : null}
      <Card style={styles.listCard}>
        <SwitchRow
          icon="lock"
          title="打開 app 時要驗證"
          sub="打開 app、或離開超過 1 分鐘再回來時，要用指紋、臉部或手機的螢幕鎖密碼解鎖。"
          testID="switch-app-lock"
          value={!!prefs?.biometricLock}
          disabled={prefs === null || busy}
          onChange={(value) => void toggle(value)}
        />
      </Card>
    </Section>
  );
}

function SwitchRow({
  icon,
  title,
  sub,
  testID,
  value,
  disabled,
  divider = false,
  onChange,
}: {
  icon: IconName;
  title: string;
  sub: string;
  testID: string;
  value: boolean;
  disabled: boolean;
  divider?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.listRow, divider && styles.divider]}>
      <RowIcon name={icon} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        testID={testID}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: colors.secondary, false: colors.border }}
        thumbColor={colors.card}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RowIcon({ name }: { name: IconName }) {
  return (
    <View style={styles.rowIcon}>
      <Icon name={name} size={iconSize.md} color={colors.secondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.sm },
  sectionTitle: { ...type.overline, color: colors.mutedForeground, marginLeft: space.xs },
  listCard: { padding: 0, gap: 0 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm + space.xs,
    minHeight: touchTarget + space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md - 2,
    backgroundColor: colors.secondarySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...type.bodyStrong, color: colors.foreground },
  rowSub: { ...type.label, fontFamily: fonts.regular, color: colors.mutedForeground },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: space.sm + space.xs },
  bodyText: { ...type.body, flex: 1, color: colors.foreground, lineHeight: 26 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footnote: { ...type.caption, color: colors.subtleForeground, marginHorizontal: space.xs },
  pressed: { opacity: pressedOpacity },
});
