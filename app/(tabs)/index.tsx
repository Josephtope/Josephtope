import { ScrollView, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, MetricCard, ModeBanner, SectionHeader, StatusPill } from "@/components/ui/ops-primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

function formatEventTitle(eventType: string) {
  return eventType.replace(/_/g, " " ).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatEventTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function CommandCenterScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<"dry-run" | "manual">("dry-run");
  const [controlNotice, setControlNotice] = useState("");
  const controlQuery = trpc.runControls.status.useQuery(undefined, { enabled: isAuthenticated });
  const controlMutation = trpc.runControls.update.useMutation();
  const leadsQuery = trpc.leads.list.useQuery({}, { enabled: isAuthenticated });
  const connectionsQuery = trpc.googleConnections.list.useQuery(undefined, { enabled: isAuthenticated });
  const auditQuery = trpc.sendJobs.audit.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (controlQuery.data) setMode(controlQuery.data.dryRun ? "dry-run" : "manual");
  }, [controlQuery.data]);

  const leads = leadsQuery.data ?? [];
  const connections = connectionsQuery.data ?? [];
  const auditEvents = auditQuery.data ?? [];
  const counts = useMemo(() => ({
    pending: leads.filter((lead) => lead.status === "needs_review").length,
    verified: leads.filter((lead) => lead.status === "verified").length,
    failed: leads.filter((lead) => lead.status === "failed").length,
  }), [leads]);
  const sentToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return auditEvents.filter((event) => {
      const type = event.eventType.toLowerCase();
      const created = event.createdAt ? new Date(event.createdAt).getTime() : 0;
      return created >= start.getTime() && /(sent|completed)/.test(type);
    }).length;
  }, [auditEvents]);
  const recentActivity = useMemo(() => [...auditEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3), [auditEvents]);
  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "there";
  const connection = connections[0];

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
            <Text className="text-3xl font-bold tracking-tight text-foreground">Good morning, {firstName}</Text>
            <Text className="mt-1 text-sm leading-5 text-muted">Live workspace status from your connected account.</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface"><IconSymbol name="shield.checkered" size={22} color={colors.primary} /></View>
        </View>

        <View className="mb-5 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${connection ? colors.success : colors.warning}18` }}><IconSymbol name="link" size={17} color={connection ? colors.success : colors.warning} /></View>
            <View>
              <Text className="text-sm font-bold text-foreground">{connection ? "Google sender connected" : "Google sender not connected"}</Text>
              <Text className="mt-0.5 text-xs text-muted">{connection ? connection.email : "Connect an account from Senders to load live data."}</Text>
            </View>
          </View>
          <StatusPill tone={connection ? "success" : "warning"} label={connection ? "Online" : "Required"} />
        </View>

        <View className="mb-5 gap-3">
          <ModeBanner mode={mode} onPress={() => updateControls({ dryRun: mode !== "dry-run" })} />
          <View className="flex-row gap-2"><View className="flex-1"><ActionButton label={controlQuery.data?.paused ? "Resume jobs" : "Pause jobs"} variant="secondary" icon={controlQuery.data?.paused ? "arrow.clockwise" : "pause.fill"} onPress={() => updateControls({ paused: !controlQuery.data?.paused })} /></View><View className="flex-1"><ActionButton label={controlQuery.data?.killSwitch ? "Clear kill switch" : "Kill switch"} variant="danger" icon="shield.checkered" onPress={() => updateControls({ killSwitch: !controlQuery.data?.killSwitch })} /></View></View>
          {controlNotice ? <Text className="px-1 text-xs leading-4" style={{ color: colors.warning }}>{controlNotice}</Text> : null}
          <View className="flex-row items-center gap-2 px-1"><IconSymbol name="shield.checkered" size={14} color={colors.muted} /><Text className="flex-1 text-xs leading-4 text-muted">Live sends stay locked until you explicitly enable them in Settings.</Text></View>
        </View>

        <SectionHeader title="Today at a glance" action="View queue" />
        <View className="mb-6 flex-row gap-3">
          <MetricCard label="Pending review" value={String(counts.pending)} detail={isAuthenticated ? "From your lead queue" : "Sign in to load live data"} icon="tray.full.fill" tone="warning" />
          <MetricCard label="Sent today" value={String(sentToday)} detail={sentToday ? "Recorded in audit log" : "No completed sends recorded"} icon="paperplane.fill" tone="info" />
        </View>
        <View className="mb-6 flex-row gap-3">
          <MetricCard label="Verified" value={String(counts.verified)} detail="From your lead queue" icon="chart.bar.fill" tone="success" />
          <MetricCard label="Failed" value={String(counts.failed)} detail={counts.failed ? "Review required" : "No failed leads"} icon="exclamationmark.triangle.fill" tone="error" />
        </View>

        <View className="mb-6 rounded-3xl border border-border bg-surface p-4">
          <SectionHeader title="Next best action" />
          <View className="flex-row items-start gap-3"><View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.primary}18` }}><IconSymbol name="square.and.pencil" size={18} color={colors.primary} /></View><View className="flex-1"><Text className="text-base font-bold text-foreground">{counts.pending ? `Review ${Math.min(counts.pending, 3)} lead${counts.pending === 1 ? "" : "s"}` : "Connect Google to begin"}</Text><Text className="mt-1 text-sm leading-5 text-muted">{counts.pending ? "Check the company, recipient, and rendered template before approving any work." : "Your workspace will show live queue actions after a sender and permitted Sheet are connected."}</Text><View className="mt-4 flex-row gap-2"><View className="flex-1"><ActionButton label="Open queue" icon="arrow.up.right" onPress={() => router.push("/queue")} /></View><View className="flex-1"><ActionButton label="Open senders" variant="secondary" icon="link" onPress={() => router.push("/senders")} /></View></View></View></View>
        </View>

        <SectionHeader title="Recent activity" action="See all" />
        <View className="overflow-hidden rounded-3xl border border-border bg-surface">
          {recentActivity.length ? recentActivity.map((item, index) => <View key={item.id} className={`flex-row items-start gap-3 px-4 py-4 ${index < recentActivity.length - 1 ? "border-b border-border" : ""}`}><View className="mt-0.5 h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.primary}18` }}><IconSymbol name="checkmark" size={15} color={colors.primary} /></View><View className="flex-1"><View className="flex-row items-center justify-between gap-2"><Text className="flex-1 text-sm font-bold text-foreground">{formatEventTitle(item.eventType)}</Text><Text className="text-xs text-muted">{formatEventTime(item.createdAt)}</Text></View><Text className="mt-1 text-xs leading-4 text-muted">{item.detail || "Recorded in your workspace audit log."}</Text></View></View>) : <View className="items-center px-5 py-8"><Text className="text-sm font-bold text-foreground">No activity recorded yet</Text><Text className="mt-1 text-center text-xs leading-4 text-muted">Live actions will appear here after you connect a sender or review a lead.</Text></View>}
        </View>

        <View className="mt-6 flex-row items-start gap-2 px-1"><IconSymbol name="shield.checkered" size={14} color={colors.muted} /><Text className="flex-1 text-xs leading-4 text-muted">Responsible by default: no open-tracking claims, no bypassing blocked sources, and no message leaves this workspace without an explicit approval path.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}
