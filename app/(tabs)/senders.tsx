import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";
import { startOAuthLogin } from "@/constants/oauth";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, SectionHeader, StatusPill } from "@/components/ui/ops-primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";

const permissionRows = [
  { label: "Send messages", scope: "gmail.send", icon: "paperplane.fill" as const },
  { label: "Read reply metadata", scope: "gmail.metadata", icon: "bubble.left.and.bubble.right.fill" as const },
  { label: "Sync selected Sheet", scope: "spreadsheets", icon: "tray.full.fill" as const },
];

export default function SendersScreen() {
  const colors = useColors();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [notice, setNotice] = useState("");
  const connectionsQuery = trpc.googleConnections.list.useQuery(undefined, { enabled: isAuthenticated });
  const beginConnection = trpc.googleConnections.begin.useMutation();
  const bindSheet = trpc.googleConnections.bindSheet.useMutation();
  const createTestSheet = trpc.googleConnections.createTestSheet.useMutation();
  const importSheet = trpc.leadSync.import.useMutation();
  const params = useLocalSearchParams<{ google?: string }>();
  const connections = connectionsQuery.data ?? [];
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetTab, setSheetTab] = useState("Sheet1");

  useEffect(() => {
    if (params.google === "connected") {
      setNotice("Google account connected securely. Tokens are encrypted on the server.");
      if (isAuthenticated) void connectionsQuery.refetch();
    }
  }, [params.google, isAuthenticated]);

  const handleLogin = async () => {
    try {
      setNotice("Opening secure sign-in…");
      await startOAuthLogin();
    } catch (error) {
      setNotice(error instanceof Error ? `Sign-in failed: ${error.message}` : `Sign-in failed: ${String(error)}`);
    }
  };

  const handleConnect = async () => {
    if (!isAuthenticated) {
      await handleLogin();
      return;
    }
    const result = await beginConnection.mutateAsync();
    setNotice(result.message);
    await Linking.openURL(result.url);
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 32 }}>
        <View className="mb-5 flex-row items-start justify-between"><View><Text className="text-xs font-bold uppercase tracking-widest text-muted">Workspace</Text><Text className="mt-1 text-3xl font-bold text-foreground">Senders</Text><Text className="mt-1 text-sm leading-5 text-muted">Identity first. Connections stay isolated.</Text></View><View className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"><IconSymbol name="person.2.fill" size={20} color={colors.primary} /></View></View>

        <View className="mb-5 rounded-3xl border border-border bg-surface p-4">
          <View className="flex-row items-start gap-3"><View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.primary}18` }}><IconSymbol name="shield.checkered" size={18} color={colors.primary} /></View><View className="flex-1"><Text className="text-base font-bold text-foreground">App identity</Text>{authLoading ? <Text className="mt-1 text-sm text-muted">Checking your secure session…</Text> : isAuthenticated ? <><Text className="mt-1 text-sm text-foreground">{user?.name ?? "Signed-in operator"}</Text><Text className="mt-0.5 text-xs text-muted">{user?.email ?? "Authenticated workspace"}</Text></> : <Text className="mt-1 text-sm leading-5 text-muted">Sign in before connecting Gmail or Google Sheets. Your app identity is separate from each Google mailbox.</Text>}</View><StatusPill tone={isAuthenticated ? "success" : "warning"} label={isAuthenticated ? "Signed in" : "Required"} /></View>
          {!isAuthenticated ? <View className="mt-4"><ActionButton label="Sign in securely" icon="arrow.up.right" onPress={handleLogin} /></View> : null}
        </View>

        <SectionHeader title="Google connections" action="Refresh" onAction={() => connectionsQuery.refetch()} />
        {connections.length === 0 ? <View className="mb-5 items-center rounded-3xl border border-dashed border-border px-6 py-8"><View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.primary}18` }}><IconSymbol name="link" size={22} color={colors.primary} /></View><Text className="mt-3 text-base font-bold text-foreground">No Google connection yet</Text><Text className="mt-1 text-center text-sm leading-5 text-muted">Connect one Gmail and Sheets identity. Multiple sender accounts can be added later without sharing tokens or settings.</Text><View className="mt-4 w-full"><ActionButton label={isAuthenticated ? "Connect Google account" : "Sign in to connect"} icon="plus" onPress={handleConnect} /></View></View> : connections.map((connection) => <View key={connection.id} className="mb-3 rounded-3xl border border-border bg-surface p-4"><View className="flex-row items-center justify-between"><View><Text className="text-base font-bold text-foreground">{connection.displayName ?? "Google sender"}</Text><Text className="mt-1 text-sm text-muted">{connection.email}</Text></View><StatusPill tone={connection.status === "active" ? "success" : "warning"} label={connection.status === "active" ? "Active" : "Action needed"} /></View><Text className="mt-4 text-xs font-bold uppercase tracking-widest text-muted">Controlled Sheet import</Text><Text className="mt-1 text-xs leading-4 text-muted">Create a private test Sheet with exactly one safe example row, or paste an existing Sheet ID.</Text><View className="mt-3"><ActionButton label={createTestSheet.isPending ? "Creating test Sheet…" : "Create test Sheet"} icon="plus" onPress={async () => { try { const result = await createTestSheet.mutateAsync({ connectionId: connection.id }); setSpreadsheetId(result.spreadsheetId); setSheetTab(result.sheetTab); setNotice(`Created ${result.title}. Review it in Google Sheets, then bind and import the single controlled row.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Test Sheet creation failed."); } }} /></View><TextInput value={spreadsheetId} onChangeText={setSpreadsheetId} placeholder="Paste spreadsheet ID" placeholderTextColor={colors.muted} className="mt-2 rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" autoCapitalize="none" /><TextInput value={sheetTab} onChangeText={setSheetTab} placeholder="Sheet tab" placeholderTextColor={colors.muted} className="mt-2 rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" /><View className="mt-3"><ActionButton label={bindSheet.isPending ? "Checking Sheet…" : "Bind Sheet"} icon="arrow.up.right" onPress={async () => { try { const result = await bindSheet.mutateAsync({ connectionId: connection.id, spreadsheetId, sheetTab }); setNotice(`Sheet verified: ${result.preview.title} · ${result.preview.totalRows} data rows. No rows imported yet.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Sheet binding failed."); } }} /></View><View className="mt-2"><ActionButton label={importSheet.isPending ? "Importing…" : "Import controlled rows"} icon="square.and.pencil" onPress={async () => { try { const result = await importSheet.mutateAsync({ connectionId: connection.id, spreadsheetId, sheetTab }); setNotice(`Import complete: ${result.inserted} new leads, ${result.duplicates} duplicates, ${result.failedRows} invalid rows.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Import failed."); } }} /></View><View className="mt-4 flex-row items-center justify-between"><Text className="text-xs text-muted">Bound tab: {connection.sheetTab ?? "Not bound"}</Text><Pressable onPress={() => setNotice("Disconnect and revoke is available from Google Account permissions.")} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><Text className="text-xs font-bold" style={{ color: colors.error }}>Manage access</Text></Pressable></View></View>)}

        <View className="mb-5 rounded-3xl border border-border bg-surface p-4"><SectionHeader title="Permission plan" /><Text className="mb-3 text-xs leading-4 text-muted">The app will request only the capabilities needed for each feature. Nothing is live until credentials and Google verification are configured.</Text>{permissionRows.map((row, index) => <View key={row.scope} className={`flex-row items-center gap-3 py-3 ${index < permissionRows.length - 1 ? "border-b border-border" : ""}`}><IconSymbol name={row.icon} size={16} color={colors.muted} /><View className="flex-1"><Text className="text-sm font-semibold text-foreground">{row.label}</Text><Text className="mt-0.5 text-xs text-muted">{row.scope}</Text></View><IconSymbol name="checkmark" size={15} color={colors.success} /></View>)}</View>

        <View className="flex-row items-start gap-2 px-1"><IconSymbol name="shield.checkered" size={14} color={colors.muted} /><Text className="flex-1 text-xs leading-4 text-muted">Refresh tokens belong on the server, protected with managed encryption. The mobile binary will never contain Google client secrets.</Text></View>
        {notice ? <View className="mt-4 rounded-2xl border border-warning px-3 py-3" style={{ backgroundColor: `${colors.warning}12` }}><Text className="text-xs leading-4" style={{ color: colors.warning }}>{notice}</Text></View> : null}
      </ScrollView>
    </ScreenContainer>
  );
}
