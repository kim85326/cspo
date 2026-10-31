import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, Text, View } from "react-native";
import {
  authFailureMessage,
  shouldRelock,
  type AuthResult,
  type DeviceAuthLevel,
} from "@/domain/appLock";
import { useDevicePrefs, useLaunchDevicePrefs } from "@/hooks/useDevicePrefs";
import { useFeatures } from "@/hooks/useFeatures";
import {
  authenticate as defaultAuthenticate,
  biometricsSupported,
  deviceAuthLevel as defaultDeviceAuthLevel,
} from "@/native/biometrics";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { colors, iconSize, radius, space, type } from "./theme";

type Props = {
  /** 測試用：換掉 expo-local-authentication */
  deviceAuthLevel?: () => Promise<DeviceAuthLevel>;
  authenticate?: (promptMessage: string) => Promise<AuthResult>;
  now?: () => number;
};

/** launch：還在 app 啟動那次（依啟動時的設定決定鎖不鎖）；之後由解鎖、重新上鎖改變 */
type Status = "launch" | "locked" | "unlocked";

const PROMPT = "解鎖「賺了嗎」";

/**
 * 打開 app 時要驗證（Story 035），放在根 layout。
 * 設定頁開了「打開 app 時要驗證」：app 啟動時、以及切到背景超過 1 分鐘再回來時，整個畫面蓋上鎖定畫面，
 * 自動跳出指紋／臉部驗證；失敗或取消可以按「解鎖」重試，系統的驗證框裡也能改輸入裝置密碼。
 * 手機什麼螢幕鎖都沒設定（設定之後才拿掉的）：說明無法驗證，讓使用者繼續使用，不把人鎖在外面。
 * 功能開關 biometricLock 關閉、或網頁版：什麼都不做。
 */
export function AppLockGate({
  deviceAuthLevel = defaultDeviceAuthLevel,
  authenticate = defaultAuthenticate,
  now = Date.now,
}: Props) {
  const featureOn = useFeatures().biometricLock && biometricsSupported;
  const prefs = useDevicePrefs();
  // 啟動時要不要鎖看「app 啟動時讀到的值」：在設定頁剛打開開關不會立刻鎖住
  const launch = useLaunchDevicePrefs();
  const lockOn = featureOn && prefs?.biometricLock === true;

  const [status, setStatus] = useState<Status>("launch");
  const [message, setMessage] = useState<string | null>(null);
  const [noSecurity, setNoSecurity] = useState(false);
  const [busy, setBusy] = useState(false);
  const authenticating = useRef(false);
  const backgroundAt = useRef<number | null>(null);

  const lockedAtLaunch = status === "launch" && launch?.biometricLock === true;
  const locked = featureOn && (status === "locked" || lockedAtLaunch);
  // 讀完手機裡的設定前先蓋住，避免記帳資料閃一下
  const checking = featureOn && status === "launch" && launch === null;

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if ((await deviceAuthLevel()) === "none") {
        setNoSecurity(true);
        setMessage(authFailureMessage("notAvailable"));
        return;
      }
      const result = await authenticate(PROMPT);
      if (result.ok) {
        setStatus("unlocked");
        setNoSecurity(false);
      } else {
        setMessage(authFailureMessage(result.reason));
        if (result.reason === "notAvailable") setNoSecurity(true);
      }
    } finally {
      authenticating.current = false;
      setBusy(false);
    }
  }, [deviceAuthLevel, authenticate]);

  // app 啟動時要鎖：自動跳出驗證
  useEffect(() => {
    if (featureOn && lockedAtLaunch) void unlock();
  }, [featureOn, lockedAtLaunch, unlock]);

  // 從背景回來超過 1 分鐘：重新上鎖。驗證途中（Android 改輸入裝置密碼會開另一個畫面）的切換不算
  useEffect(() => {
    if (!lockOn) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (authenticating.current) return;
      if (state === "background") {
        backgroundAt.current = now();
      } else if (state === "active") {
        const relock = shouldRelock(backgroundAt.current, now());
        backgroundAt.current = null;
        if (relock) {
          setStatus("locked");
          void unlock();
        }
      }
    });
    return () => subscription.remove();
  }, [lockOn, now, unlock]);

  if (!locked && !checking) return null;

  return (
    <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.screen} testID="app-lock">
        {locked ? (
          <View style={styles.body}>
            <View style={styles.iconWrap}>
              <Icon name="lock" size={iconSize.lg + space.sm} color={colors.gold} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              賺了嗎已上鎖
            </Text>
            <Text style={styles.sub}>用指紋、臉部或手機的螢幕鎖密碼解鎖。</Text>
            {message ? (
              <Text style={styles.message} accessibilityRole="alert" testID="app-lock-message">
                {message}
              </Text>
            ) : null}
            {noSecurity ? (
              <Button
                label="繼續使用"
                testID="button-lock-continue"
                accessibilityHint="這支手機無法驗證，直接進入 app"
                onPress={() => setStatus("unlocked")}
                style={styles.button}
              />
            ) : (
              <Button
                label={busy ? "驗證中…" : "解鎖"}
                icon="lock"
                testID="button-unlock"
                disabled={busy}
                onPress={() => void unlock()}
                style={styles.button}
              />
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  body: { alignItems: "center", gap: space.sm + space.xs, maxWidth: 360, width: "100%" },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.brandDeep,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  title: { ...type.title, color: colors.onBrand },
  sub: { ...type.body, color: colors.onBrandMuted, textAlign: "center" },
  message: { ...type.label, color: colors.onBrand, textAlign: "center" },
  button: { alignSelf: "stretch", marginTop: space.md },
});
