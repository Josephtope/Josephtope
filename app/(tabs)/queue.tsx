import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, SectionHeader, StatusPill } from "@/components/ui/ops-primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { leadStatusLabel, leadStatusTone, matchesLeadSearch } from "@/lib/lead-domain";

type Filter = "All" | "Needs review" | "Verified" | "Suppressed";
const statusForFilter: Record<Exclude<Filter, "All">, "needs_review" | "verified" | "suppressed"> = { "Needs review": "needs_review", Verified: "verified", Suppressed: "suppressed" };

export default function QueueScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [annotation, setAnnotation] = useState("");
  const input = filter === "All" ? {} : { status: statusForFilter[filter] };
  const leadQuery = trpc.leads.list.useQuery(input, { enabled: isAuthenticated });
  const syncQuery = trpc.leadSync.status.useQuery(undefined, { enabled: isAuthenticated });
  const suppressMutation = trpc.leads.suppress.useMutation();
  const verifyMutation = trpc.leads.verify.useMutation();
  const bulkReviewMutation = trpc.leads.bulkReview.useMutation();
  const annotateMutation = trpc.leads.annotate.useMutation();
  const syncMutation = trpc.leadSync.request.useMutation();
  const leads = leadQuery.data ?? [];
  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => matchesLeadSearch(lead, term));
  }, [leads, search]);

  const selectLead = (id: number, diagnostics: string | null) => {
    setSelectedId(id);
    setAnnotation(diagnostics ?? "");
  };

  const handleSuppress = async () => {
    if (!selectedLead) return;
    await suppressMutation.mutateAsync({ id: selectedLead.id, reason: "Suppressed by operator review", version: selectedLead.version });
    await leadQuery.refetch();
    setSelectedId(null);
  };

  const handleVerify = async () => {
    if (!selectedLead) return;
    await verifyMutation.mutateAsync({ id: selectedLead.id, version: selectedLead.version });
    await leadQuery.refetch();
    setSelectedId(null);
  };

  const toggleSelected = (id: number) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const handleBulkReview = async (action: "verify" | "suppress") => {
    if (!selectedIds.length) return;
    await bulkReviewMutation.mutateAsync({ ids: selectedIds, action, note: "Bulk review decision by operator" });
    setSelectedIds([]);
    await leadQuery.refetch();
  };

  const handleAnnotate = async () => {
    if (!selectedLead) return;
    await annotateMutation.mutateAsync({ id: selectedLead.id, diagnostics: annotation, version: selectedLead.version });
    await leadQuery.refetch();
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View className="flex-1 pt-4">
        <View className="mb-5 flex-row items-start justify-between"><View><Text className="text-xs font-bold uppercase tracking-widest text-muted">Workspace</Text><Text className="mt-1 text-3xl font-bold text-foreground">Lead queue</Text><Text className="mt-1 text-sm leading-5 text-muted">Review before anything can move forward.</Text></View><View className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"><IconSymbol name="tray.full.fill" size={20} color={colors.primary} /></View></View>

        <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3"><IconSymbol name="magnifyingglass" size={17} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} className="flex-1 text-sm text-foreground" placeholder="Search companies or emails" placeholderTextColor={colors.muted} returnKeyType="search" /><IconSymbol name="slider.horizontal.3" size={17} color={colors.primary} /></View>
        <View className="mb-4 flex-row gap-2">{(["All", "Needs review", "Verified", "Suppressed"] as const).map((item) => { const selected = filter === item; return <Pressable key={item} onPress={() => setFilter(item)} style={({ pressed }) => [{ backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.75 : 1 }]} className="rounded-full border px-3 py-2"><Text className="text-xs font-bold" style={{ color: selected ? colors.background : colors.muted }}>{item}</Text></Pressable>; })}</View>

        <View className="mb-3 flex-row items-center justify-between"><Text className="text-sm font-semibold text-foreground">{isAuthenticated ? `${filtered.length} visible leads` : "Sign in to load leads"}</Text><View className="flex-row items-center gap-3"><Pressable onPress={() => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map((lead) => lead.id))} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><Text className="text-xs font-bold" style={{ color: colors.primary }}>{selectedIds.length === filtered.length && filtered.length ? "Clear selection" : "Select all"}</Text></Pressable><Pressable onPress={() => leadQuery.refetch()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><Text className="text-xs font-bold" style={{ color: colors.primary }}>Refresh</Text></Pressable></View></View>

        {selectedIds.length ? <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-primary px-3 py-3" style={{ backgroundColor: `${colors.primary}10` }}><Text className="flex-1 text-xs font-bold text-foreground">{selectedIds.length} selected</Text><Pressable onPress={() => handleBulkReview("verify")}><Text className="text-xs font-bold" style={{ color: colors.success }}>Verify</Text></Pressable><Pressable onPress={() => handleBulkReview("suppress")}><Text className="text-xs font-bold" style={{ color: colors.error }}>Suppress</Text></Pressable></View> : null}

        {isAuthenticated ? <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-warning px-3 py-3" style={{ backgroundColor: `${colors.warning}10` }}><IconSymbol name="clock.fill" size={15} color={colors.warning} /><View className="flex-1"><Text className="text-xs font-bold text-foreground">{syncQuery.data?.state === "configuration_required" ? "Sheets sync needs setup" : "Sync status"}</Text><Text className="mt-0.5 text-xs leading-4 text-muted">{syncQuery.data?.message ?? "Checking the latest synchronization state…"}</Text></View><Pressable onPress={() => syncMutation.mutate()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><Text className="text-xs font-bold" style={{ color: colors.warning }}>Check</Text></Pressable></View> : null}

        <FlatList data={filtered} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28, gap: 10 }} renderItem={({ item }) => <Pressable onPress={() => selectLead(item.id, item.diagnostics)} onLongPress={() => toggleSelected(item.id)} style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1 }]} className="rounded-3xl border border-border bg-surface p-4"><View className="flex-row items-start gap-3"><Pressable onPress={() => toggleSelected(item.id)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, { backgroundColor: selectedIds.includes(item.id) ? colors.primary : colors.background }]} className="h-6 w-6 items-center justify-center rounded-lg border border-border"><Text className="text-xs font-bold" style={{ color: selectedIds.includes(item.id) ? colors.background : colors.muted }}>{selectedIds.includes(item.id) ? "✓" : ""}</Text></Pressable><View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.primary}18` }}><Text className="text-sm font-bold" style={{ color: colors.primary }}>{item.company.slice(0, 2).toUpperCase()}</Text></View><View className="flex-1"><View className="flex-row items-start justify-between gap-2"><Text className="flex-1 text-base font-bold text-foreground">{item.company}</Text><StatusPill tone={leadStatusTone(item.status)} label={leadStatusLabel(item.status)} /></View><Text className="mt-1 text-sm text-muted">{item.email}</Text><View className="mt-3 flex-row items-center justify-between gap-2"><Text className="flex-1 text-xs text-muted">{item.sourceName ?? "Unassigned source"}{item.batch ? ` · Batch ${item.batch}` : ""}</Text><Text className="text-xs font-medium text-foreground">{item.diagnostics ?? "Tap to review"}</Text></View></View></View></Pressable>} ListEmptyComponent={<View className="items-center rounded-3xl border border-dashed border-border px-6 py-12"><IconSymbol name={isAuthenticated ? "tray.full.fill" : "shield.checkered"} size={28} color={isAuthenticated ? colors.primary : colors.warning} /><Text className="mt-3 text-base font-bold text-foreground">{isAuthenticated ? "No leads in this view" : "Authentication required"}</Text><Text className="mt-1 text-center text-sm leading-5 text-muted">{isAuthenticated ? "Import a permitted Sheet projection or wait for the next approved sync. No placeholder leads are shown." : "Sign in from Senders before loading user-owned lead data."}</Text></View>} />

        {selectedLead ? <View className="mt-3 rounded-3xl border border-border bg-surface p-4"><View className="flex-row items-center justify-between"><View><Text className="text-base font-bold text-foreground">Review {selectedLead.company}</Text><Text className="mt-1 text-xs text-muted">Version {selectedLead.version} · row {selectedLead.sheetRow ?? "not mapped"}</Text></View><Pressable onPress={() => setSelectedId(null)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><IconSymbol name="chevron.right" size={16} color={colors.muted} /></Pressable></View><TextInput value={annotation} onChangeText={setAnnotation} multiline className="mt-3 min-h-[70px] rounded-2xl border border-border px-3 py-3 text-sm text-foreground" placeholder="Add a review note or diagnostic" placeholderTextColor={colors.muted} textAlignVertical="top" /><View className="mt-3 flex-row gap-2"><View className="flex-1"><ActionButton label="Save note" icon="checkmark" onPress={handleAnnotate} /></View><View className="flex-1"><ActionButton label="Verify" onPress={handleVerify} /></View><View className="flex-1"><ActionButton label="Suppress" variant="danger" onPress={handleSuppress} /></View></View></View> : null}
      </View>
    </ScreenContainer>
  );
}
