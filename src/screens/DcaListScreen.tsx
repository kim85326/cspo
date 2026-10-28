import { router, Stack, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { stockDirectory as defaultStockDirectory } from "@/data";
import { dcaRulesOf, dcaTransactionsOf, setDcaRuleEnabledById } from "@/data/dcaRules";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { StockDirectory } from "@/data/StockDirectory";
import { formatIsoDate } from "@/domain/buyDate";
import { activeDcaRuleIds, FREE_DCA_RULE_LIMIT } from "@/domain/dca";
import type { DcaRule, Ledger } from "@/domain/ledgerTypes";
import type { StockInfo } from "@/domain/types";
import { useDcaPlan } from "@/hooks/useDcaPlan";
import { useLedger } from "@/hooks/useLedger";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

const DCA_NEW_HREF = "/dca/new" as Href;
const editDcaHref = (id: string) => ({ pathname: "/dca/[id]", params: { id } }) as unknown as Href;

type Props = {
  /** 測試與畫面開發傳記憶體版；預設 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  stockDirectory?: StockDirectory;
};

/**
 * 定期定額規則列表（P2-02，docs/stories/024）。路由入口 src/app/dca/index.tsx，從設定頁進來。
 * - 每條規則：證券、每月扣款日、金額、啟用／暫停開關、已自動產生幾筆。
 * - Free 方案（proPlan 開關打開且不是 Pro）只能有 1 條規則；多出來的（Pro 到期留下的）保留但不再自動產生。
 */
export default function DcaListScreen({ repository, stockDirectory = defaultStockDirectory }: Props) {
  const insets = useSafeAreaInsets();
  const { ledger, repository: repo } = useLedger(repository);
  const { unlimited, showPlan } = useDcaPlan();
  const names = useStockNames(stockDirectory);
  const [error, setError] = useState<string | null>(null);

  if (!ledger) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Stack.Screen options={{ title: "定期定額" }} />
        <ActivityIndicator color={colors.primary} accessibilityLabel="載入中" />
      </View>
    );
  }

  const rules = [...dcaRulesOf(ledger)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const active = activeDcaRuleIds(rules, unlimited);
  const reachedLimit = !unlimited && rules.length >= FREE_DCA_RULE_LIMIT;

  const toggle = async (rule: DcaRule, enabled: boolean) => {
    setError(null);
    const result = await setDcaRuleEnabledById(repo, rule.id, enabled);
    if (!result.ok) setError(result.error.message);
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}>
      <Stack.Screen options={{ title: "定期定額" }} />

      <Text style={styles.intro}>
        每月扣款日以當天收盤價自動記上一筆買入；遇到假日順延到下一個交易日。App 打開時會補上之前漏掉的期數。
      </Text>

      {rules.length === 0 ? (
        <View style={styles.card} testID="dca-empty">
          <Text style={styles.body}>還沒有定期定額。設定好之後，每個月不用再手動記帳。</Text>
        </View>
      ) : (
        rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            ledger={ledger}
            name={names[rule.symbol]}
            locked={!active.has(rule.id)}
            onToggle={(enabled) => void toggle(rule, enabled)}
          />
        ))
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {reachedLimit ? (
        <View style={[styles.card, styles.limitCard]} testID="dca-limit">
          <Text style={styles.body}>
            Free 方案可以設定 {FREE_DCA_RULE_LIMIT} 條定期定額，升級 Pro 不限條數。
          </Text>
          {showPlan ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看 Pro 方案"
              onPress={() => router.push("/pro" as Href)}
              style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            >
              <Text style={styles.outlineButtonText}>查看 Pro 方案</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新增定期定額"
          testID="button-add-dca"
          onPress={() => router.push(DCA_NEW_HREF)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>＋ 新增定期定額</Text>
        </Pressable>
      )}

      <Text style={styles.footnote}>
        自動記上的交易會標示「定期定額」，可以在持股明細裡改成券商實際成交的價格與股數。刪掉某一期的交易後不會再自動補回。
      </Text>
    </ScrollView>
  );
}

type CardProps = {
  rule: DcaRule;
  ledger: Ledger;
  name?: string;
  /** Free 方案超過條數：保留但不自動產生 */
  locked: boolean;
  onToggle: (enabled: boolean) => void;
};

function RuleCard({ rule, ledger, name, locked, onToggle }: CardProps) {
  const generated = dcaTransactionsOf(ledger, rule.id);
  const title = name ? `${rule.symbol} ${name}` : rule.symbol;
  const schedule = `每月 ${rule.dayOfMonth} 日 · ${rule.amount.toLocaleString("zh-TW")} 元`;
  const status = locked ? "Free 方案未啟用" : rule.enabled ? "啟用中" : "已暫停";
  const period = rule.endDate
    ? `${formatIsoDate(rule.startDate)} 起至 ${formatIsoDate(rule.endDate)}`
    : `${formatIsoDate(rule.startDate)} 起`;

  return (
    <View style={styles.card} testID={`dca-rule-${rule.id}`}>
      <View style={styles.cardHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}，${schedule}，${status}，編輯這條定期定額`}
          onPress={() => router.push(editDcaHref(rule.id))}
          style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
        >
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSub}>{schedule}</Text>
          <Text style={styles.cardSub}>{period}</Text>
        </Pressable>
        <View style={styles.toggle}>
          <Switch
            accessibilityLabel={`${title} 定期定額${rule.enabled ? "啟用中，點一下暫停" : "已暫停，點一下恢復"}`}
            testID={`switch-dca-${rule.id}`}
            value={rule.enabled}
            disabled={locked}
            onValueChange={onToggle}
            trackColor={{ true: colors.secondary, false: colors.border }}
            thumbColor={colors.card}
          />
          <Text style={[styles.status, (locked || !rule.enabled) && styles.statusMuted]}>{status}</Text>
        </View>
      </View>
      <Text style={styles.cardSub} testID={`dca-generated-${rule.id}`}>
        {generated.length > 0
          ? `已自動記上 ${generated.length} 筆，最近一筆 ${formatIsoDate(generated[0].tradeDate)}`
          : "還沒有自動記上的交易"}
      </Text>
    </View>
  );
}

/** 代號 → 名稱；清單載不到就只顯示代號 */
function useStockNames(stockDirectory: StockDirectory): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    stockDirectory
      .getAll()
      .then((list: StockInfo[]) => {
        if (active) setNames(Object.fromEntries(list.map((s) => [s.symbol, s.name])));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [stockDirectory]);
  return names;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  intro: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, lineHeight: fontSize.sm * 1.6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  limitCard: { backgroundColor: colors.accentSurface, borderColor: colors.accentSurface },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  cardMain: { flex: 1, gap: space.xs, minHeight: touchTarget },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.foreground },
  cardSub: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  toggle: { alignItems: "center", gap: space.xs },
  status: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.secondary },
  statusMuted: { color: colors.mutedForeground },
  body: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.foreground, lineHeight: fontSize.md * 1.6 },
  error: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.destructive },
  footnote: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, lineHeight: fontSize.xs * 1.6 },
  primaryButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onPrimary },
  outlineButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.primary },
  pressed: { opacity: 0.85 },
});
