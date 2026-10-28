import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
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
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, EmptyState, Notice, SkeletonCard, surfaceStyles } from "@/ui/Surface";
import { cardSurface, colors, fonts, fontSize, iconSize, pressedOpacity, space, touchTarget, type } from "@/ui/theme";

const DCA_NEW_HREF = "/dca/new";
const editDcaHref = (id: string) => ({ pathname: "/dca/[id]", params: { id } }) as const;

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
      <View style={[surfaceStyles.screen, surfaceStyles.screenContent]}>
        <Stack.Screen options={{ title: "定期定額" }} />
        <SkeletonCard lines={3} />
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
    <ScrollView
      style={surfaceStyles.screen}
      contentContainerStyle={[surfaceStyles.screenContent, { paddingBottom: space.xl + insets.bottom }]}
    >
      <Stack.Screen options={{ title: "定期定額" }} />

      <Text style={styles.intro}>
        每月扣款日以當天收盤價自動記上一筆買入；遇到假日順延到下一個交易日。App 打開時會補上之前漏掉的期數。
      </Text>

      {rules.length === 0 ? (
        <Card testID="dca-empty">
          <EmptyState icon="calendar" title="還沒有定期定額" message="設定好之後，每個月不用再手動記帳。" />
        </Card>
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

      {error ? <Notice tone="error" alert message={error} /> : null}

      {reachedLimit ? (
        <View style={styles.limit} testID="dca-limit">
          <Notice tone="warning" message={`Free 方案可以設定 ${FREE_DCA_RULE_LIMIT} 條定期定額，升級 Pro 不限條數。`} />
          {showPlan ? (
            <Button label="查看 Pro 方案" icon="crown" variant="secondary" onPress={() => router.push("/pro")} />
          ) : null}
        </View>
      ) : (
        <Button label="新增定期定額" icon="plus" testID="button-add-dca" onPress={() => router.push(DCA_NEW_HREF)} />
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
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Icon name="chevronRight" size={iconSize.sm} color={colors.mutedForeground} />
          </View>
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
  intro: { ...type.label, fontFamily: fonts.regular, color: colors.mutedForeground, lineHeight: 22 },
  card: { ...cardSurface, padding: space.md, gap: space.sm },
  limit: { gap: space.sm },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  cardMain: { flex: 1, gap: space.xs, minHeight: touchTarget },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  cardTitle: { ...type.bodyStrong, color: colors.foreground },
  cardSub: { ...type.label, fontFamily: fonts.regular, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  toggle: { alignItems: "center", gap: space.xs },
  status: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.secondary },
  statusMuted: { color: colors.mutedForeground },
  footnote: { ...type.caption, color: colors.mutedForeground, lineHeight: 19 },
  pressed: { opacity: pressedOpacity },
});
