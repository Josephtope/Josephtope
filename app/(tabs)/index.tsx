import { ScrollView, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, MetricCard, ModeBanner, SectionHeader, StatusPill } from "@/components/ui/ops-primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

const activity = [
  { time: "9:42 AM", title: "Sheet sync completed", detail: "24 rows checked · 3 need review", tone: "success" as const },
  { time: "9:20 AM", title: "Approval guard enabled", detail: "Manual review remains required before sending", tone: "warning" as const },
  { time: "Yesterday", title: "Reply detected", detail: "Northstar Labs · thread ready to review", tone: "info" as const },
];

export default function CommandCenterScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<"dry-run" | "manual">("dry-run");
  const [controlNotice, setControlNotice] = useState("");
  const controlQuery = trpc.runControls.status.useQuery(undefined, { enabled: isAuthenticated });
  const controlMutation = trpc.runControls.update.useMutation();

  useEffect(() => {
    if (controlQuery.data) setMode(controlQuery.data.dryRun ? "dry-run" : "manual");
  }, [controlQuery.data]);

  const updateControls = async (patch: { dryRun?: boolean; paused?: boolean; killSwitch?: boolean }) => {
    if (!isAuthenticated) {
      setControlNotice("Sign in from Senders before changing workspace controls.");
      return;
    }
    const next = await controlMutation.mutateAsync(patch);
    setMode(next.dryRun ? "dry-run" : "manual");
    setControlNotice(next.killSwitch ? "Kill switch active: new jobs are blocked." : next.paused ? "Workspace paused: no new jobs will start." : "Workspace controls updated.");
    await controlQuery.refetch();
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 28 }}>
        <View className="mb-5 flex-row items-start justify-between">
          <View className="flex-1 pr-4">
            <View className="mb-2 flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.success }} />
              <Text className="text-xs font-bold uppercase tracking-widest text-muted">Operations / Today</Text>
            </View>
            <Text className="text-3xl font-bold tracking-tight text-foreground">Good morning, Alex</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">Your outreach workspace is quiet, healthy, and waiting for review.</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface">
            <IconSymbol name="shield.checkered" size={22} color={colors.primary} />
          </View>
        </View>

        <View className="mb-5 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.success}18` }}>
              <IconSymbol name="link" size={17} color={colors.success} />
            </View>
            <View>
              <Text className="text-sm font-bold text-foreground">Gmail + Sheets connected</Text>
              <Text className="mt-0.5 text-xs text-muted">alex@northstar.studio · synced 2m ago</Text>
            </View>
          </View>
          <StatusPill tone="success" label="Online" />
        </View>

        <View className="mb-5 gap-3">
          <ModeBanner mode={mode} onPress={() => updateControls({ dryRun: mode !== "dry-run" })} />
          <View className="flex-row gap-2"><View className="flex-1"><ActionButton label={controlQuery.data?.paused ? "Resume jobs" : "Pause jobs"} variant="secondary" icon={controlQuery.data?.paused ? "arrow.clockwise" : "pause.fill"} onPress={() => updateControls({ paused: !controlQuery.data?.paused })} /></View><View className="flex-1"><ActionButton label={controlQuery.data?.killSwitch ? "Clear kill switch" : "Kill switch"} variant="danger" icon="shield.checkered" onPress={() => updateControls({ killSwitch: !controlQuery.data?.killSwitch })} /></View></View>
          {controlNotice ? <Text className="px-1 text-xs leading-4" style={{ color: colors.warning }}>{controlNotice}</Text> : null}
          <View className="flex-row items-center gap-2 px-1">
            <IconSymbol name="shield.checkered" size={14} color={colors.muted} />
            <Text className="flex-1 text-xs leading-4 text-muted">Live sends stay locked until you explicitly enable them in Settings.</Text>
          </View>
        </View>

        <SectionHeader title="Today at a glance" action="View queue" />
        <View className="mb-6 flex-row gap-3">
          <MetricCard label="Pending review" value="18" detail="6 need attention" icon="tray.full.fill" tone="warning" />
          <MetricCard label="Sent today" value="0" detail="Dry run protected" icon="paperplane.fill" tone="info" />
        </View>
        <View className="mb-6 flex-row gap-3">
          <MetricCard label="Verified" value="42" detail="92% data quality" icon="chart.bar.fill" tone="success" />
          <MetricCard label="Failed" value="2" detail="Both are retryable" icon="exclamationmark.triangle.fill" tone="error" />
        </View>

        <View className="mb-6 rounded-3xl border border-border bg-surface p-4">
          <SectionHeader title="Next best action" />
          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.primary}18` }}>
              <IconSymbol name="square.and.pencil" size={18} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-foreground">Review your first 3 leads</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">Check the company, recipient, and rendered template before approving any work.</Text>
              <View className="mt-4 flex-row gap-2">
                <View className="flex-1"><ActionButton label="Open queue" icon="arrow.up.right" onPress={() => router.push("/queue")} /></View>
                <View className="flex-1"><ActionButton label="Preview template" variant="secondary" icon="square.and.pencil" onPress={() => router.push("/compose")} /></View>
              </View>
            </View>
          </View>
        </View>

        <SectionHeader title="Recent activity" action="See all" />
        <View className="overflow-hidden rounded-3xl border border-border bg-surface">
          {activity.map((item, index) => {
            const toneColor = item.tone === "success" ? colors.success : item.tone === "warning" ? colors.warning : colors.primary;
            return (
              <View key={item.title} className={`flex-row items-start gap-3 px-4 py-4 ${index < activity.length - 1 ? "border-b border-border" : ""}`}>
                <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${toneColor}18` }}>
                  <IconSymbol name={item.tone === "success" ? "checkmark" : item.tone === "warning" ? "pause.fill" : "bubble.left.and.bubble.right.fill"} size={15} color={toneColor} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-bold text-foreground">{item.title}</Text>
                    <Text className="text-xs text-muted">{item.time}</Text>
                  </View>
                  <Text className="mt-1 text-xs leading-4 text-muted">{item.detail}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View className="mt-6 flex-row items-start gap-2 px-1">
          <IconSymbol name="shield.checkered" size={14} color={colors.muted} />
          <Text className="flex-1 text-xs leading-4 text-muted">Responsible by default: no open-tracking claims, no bypassing blocked sources, and no message leaves this workspace without an explicit approval path.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
