import { Pressable, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

type StatusTone = "success" | "warning" | "error" | "info";

const statusConfig = {
  success: { label: "Healthy", icon: "checkmark.circle.fill" as const },
  warning: { label: "Attention", icon: "exclamationmark.triangle.fill" as const },
  error: { label: "Blocked", icon: "exclamationmark.triangle.fill" as const },
  info: { label: "Ready", icon: "link" as const },
};

export function StatusPill({ tone, label }: { tone: StatusTone; label?: string }) {
  const colors = useColors();
  const toneColor = tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "error" ? colors.error : colors.primary;
  const config = statusConfig[tone];
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-border px-2.5 py-1" style={{ backgroundColor: `${toneColor}18` }} accessibilityLabel={`${label ?? config.label} status`}>
      <IconSymbol name={config.icon} size={13} color={toneColor} />
      <Text numberOfLines={1} className="text-xs font-semibold" style={{ color: toneColor }}>{label ?? config.label}</Text>
    </View>
  );
}

export function MetricCard({ label, value, detail, icon, tone = "info", onPress }: { label: string; value: string; detail: string; icon: "chart.bar.fill" | "tray.full.fill" | "paperplane.fill" | "exclamationmark.triangle.fill"; tone?: StatusTone; onPress?: () => void }) {
  const colors = useColors();
  const accent = tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "error" ? colors.error : colors.primary;
  const content = (
    <View className="min-w-[150px] flex-1 rounded-3xl border border-border bg-surface p-4">
      <View className="mb-4 flex-row items-center justify-between">
        <View className="h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundColor: `${accent}18` }}>
          <IconSymbol name={icon} size={18} color={accent} />
        </View>
        {onPress ? <IconSymbol name="chevron.right" size={16} color={colors.muted} /> : null}
      </View>
      <Text className="text-2xl font-bold text-foreground">{value}</Text>
      <Text className="mt-1 text-sm font-medium text-foreground">{label}</Text>
      <Text className="mt-1 text-xs leading-4 text-muted">{detail}</Text>
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1, flex: 1 }]}>{content}</Pressable>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-base font-bold text-foreground">{title}</Text>
      {action ? <Pressable onPress={onAction} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><Text className="text-sm font-semibold" style={{ color: colors.primary }}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function ActionButton({ label, icon, variant = "primary", onPress }: { label: string; icon?: "arrow.up.right" | "pause.fill" | "arrow.clockwise" | "plus" | "checkmark" | "square.and.pencil" | "shield.checkered"; variant?: "primary" | "secondary" | "danger"; onPress?: () => void }) {
  const colors = useColors();
  const background = variant === "primary" ? colors.primary : variant === "danger" ? `${colors.error}20` : colors.surface;
  const foreground = variant === "primary" ? colors.background : variant === "danger" ? colors.error : colors.foreground;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ backgroundColor: background, borderColor: variant === "primary" ? colors.primary : colors.border, opacity: pressed ? 0.82 : 1 }]} className="flex-row items-center justify-center gap-2 rounded-2xl border px-4 py-3">
      {icon ? <IconSymbol name={icon} size={16} color={foreground} /> : null}
      <Text className="text-sm font-bold" style={{ color: foreground }}>{label}</Text>
    </Pressable>
  );
}

export function ModeBanner({ mode, onPress }: { mode: "dry-run" | "manual"; onPress?: () => void }) {
  const colors = useColors();
  const isDryRun = mode === "dry-run";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }]} className="flex-row items-center gap-3 rounded-2xl border border-warning bg-warning/10 px-4 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.warning}20` }}>
        <IconSymbol name={isDryRun ? "shield.checkered" : "pause.fill"} size={18} color={colors.warning} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-foreground">{isDryRun ? "Dry run is on" : "Manual approval is on"}</Text>
        <Text className="mt-0.5 text-xs leading-4 text-muted">{isDryRun ? "No live messages can be sent from this workspace." : "Every eligible message waits for your approval."}</Text>
      </View>
      <IconSymbol name="chevron.right" size={16} color={colors.warning} />
    </Pressable>
  );
}
