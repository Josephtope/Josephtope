import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { SectionHeader, StatusPill, ActionButton } from "@/components/ui/ops-primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { signalState, type ReplySignal } from "@/lib/outreach-domain";

const signalTone = (state: string) => state === "replied" ? "success" as const : ["bounced", "unsubscribed", "stopped"].includes(state) ? "error" as const : "warning" as const;
const stateLabel = (state: string) => state.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function OutreachScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [notice, setNotice] = useState("");
  const conversationsQuery = trpc.outreach.conversations.useQuery(undefined, { enabled: isAuthenticated });
  const notificationsQuery = trpc.notifications.list.useQuery(undefined, { enabled: isAuthenticated });
  const messagesQuery = trpc.outreach.messages.useQuery({ conversationId: selectedId ?? 0 }, { enabled: isAuthenticated && Boolean(selectedId) });
  const replyMutation = trpc.outreach.prepareReply.useMutation();
  const reconcileMutation = trpc.outreach.reconcile.useMutation();
  const readMutation = trpc.notifications.markRead.useMutation();
  const conversations = conversationsQuery.data ?? [];
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const unread = useMemo(() => notificationsQuery.data?.filter((item) => !item.readAt) ?? [], [notificationsQuery.data]);

  const openConversation = (id: number) => {
    setSelectedId(id);
    setReplyBody("");
    setNotice("");
  };

  const handleReply = async () => {
    if (!selected) return;
    try {
      const result = await replyMutation.mutateAsync({ conversationId: selected.id, body: replyBody });
      setNotice(result.reason);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reply preparation failed.");
    }
  };

  const handleSignalDemo = (signal: ReplySignal) => {
    setNotice(`Signal handling is ready: ${stateLabel(signalState(signal))}. Provider reconciliation is still gated until Gmail OAuth is configured.`);
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View className="flex-1 pt-4">
        <View className="mb-5 flex-row items-start justify-between"><View><Text className="text-xs font-bold uppercase tracking-widest text-muted">Workspace</Text><Text className="mt-1 text-3xl font-bold text-foreground">Outreach</Text><Text className="mt-1 text-sm leading-5 text-muted">Replies, stop signals, and conversation recovery.</Text></View><View className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"><IconSymbol name="bubble.left.and.bubble.right.fill" size={20} color={colors.primary} /></View></View>
        <View className="mb-4 flex-row gap-3"><View className="flex-1 rounded-3xl border border-border bg-surface p-4"><Text className="text-2xl font-bold text-foreground">{unread.length}</Text><Text className="mt-1 text-sm font-semibold text-foreground">Unread alerts</Text><Text className="mt-1 text-xs text-muted">Needs your attention</Text></View><View className="flex-1 rounded-3xl border border-border bg-surface p-4"><Text className="text-2xl font-bold text-foreground">{conversations.filter((item) => ["bounced", "unsubscribed", "stopped"].includes(item.state)).length}</Text><Text className="mt-1 text-sm font-semibold text-foreground">Stop signals</Text><Text className="mt-1 text-xs text-muted">Protected automatically</Text></View></View>
        {unread.slice(0, 2).map((notification) => <Pressable key={notification.id} onPress={() => { if (notification.conversationId) openConversation(notification.conversationId); readMutation.mutate({ id: notification.id }); }} style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1 }]} className="mb-2 flex-row items-center gap-3 rounded-2xl border border-primary bg-surface px-3 py-3"><IconSymbol name="bell.fill" size={16} color={colors.primary} /><View className="flex-1"><Text className="text-xs font-bold text-foreground">{notification.title}</Text><Text className="mt-0.5 text-xs text-muted">{notification.body}</Text></View><Text className="text-xs font-bold" style={{ color: colors.primary }}>Open</Text></Pressable>)}
        <View className="mb-3 flex-row items-center justify-between"><SectionHeader title="Conversations" /><Pressable onPress={() => reconcileMutation.mutate()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><Text className="text-sm font-semibold" style={{ color: colors.primary }}>Reconcile</Text></Pressable></View>
        <FlatList data={conversations} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28, gap: 10 }} renderItem={({ item }) => <Pressable onPress={() => openConversation(item.id)} style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1 }]} className="rounded-3xl border border-border bg-surface p-4"><View className="flex-row items-start gap-3"><View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${colors.primary}18` }}><IconSymbol name="bubble.left.and.bubble.right.fill" size={17} color={colors.primary} /></View><View className="flex-1"><View className="flex-row items-start justify-between gap-2"><Text className="flex-1 text-base font-bold text-foreground">{item.subject ?? `Thread ${item.gmailThreadId}`}</Text><StatusPill tone={signalTone(item.state)} label={stateLabel(item.state)} /></View><Text className="mt-1 text-sm text-muted">{item.unreadCount} unread · {item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleDateString() : "Awaiting provider sync"}</Text><Text className="mt-2 text-xs leading-4 text-muted">{item.stopReason ?? "Thread continuity is preserved by Gmail thread ID."}</Text></View></View></Pressable>} ListEmptyComponent={<View className="items-center rounded-3xl border border-dashed border-border px-6 py-12"><IconSymbol name={isAuthenticated ? "bubble.left.and.bubble.right.fill" : "shield.checkered"} size={28} color={isAuthenticated ? colors.primary : colors.warning} /><Text className="mt-3 text-base font-bold text-foreground">{isAuthenticated ? "No synced conversations" : "Authentication required"}</Text><Text className="mt-1 text-center text-sm leading-5 text-muted">{isAuthenticated ? "Gmail Pub/Sub and history reconciliation are ready for an authenticated connection. No placeholder conversations are shown." : "Sign in from Senders before loading conversation data."}</Text></View>} />
        {selected ? <View className="mt-3 rounded-3xl border border-border bg-surface p-4"><View className="flex-row items-center justify-between"><View className="flex-1"><Text className="text-base font-bold text-foreground">Thread review</Text><Text className="mt-1 text-xs text-muted">Gmail thread {selected.gmailThreadId}</Text></View><Pressable onPress={() => setSelectedId(null)}><Text className="text-xs font-bold" style={{ color: colors.primary }}>Close</Text></Pressable></View><View className="mt-3 gap-2">{(messagesQuery.data ?? []).map((message) => <View key={message.id} className="rounded-2xl border border-border px-3 py-3"><View className="flex-row items-center justify-between"><Text className="text-xs font-bold text-foreground">{message.sender ?? "Unknown sender"}</Text><StatusPill tone={message.signal === "reply" ? "success" : ["bounce", "unsubscribe"].includes(message.signal) ? "error" : "warning"} label={message.signal} /></View><Text className="mt-1 text-xs leading-4 text-muted">{message.bodyPreview ?? "No message preview available."}</Text></View>)}</View><TextInput value={replyBody} onChangeText={setReplyBody} multiline className="mt-3 min-h-[80px] rounded-2xl border border-border px-3 py-3 text-sm text-foreground" placeholder="Prepare a threaded reply" placeholderTextColor={colors.muted} textAlignVertical="top" /><View className="mt-3"><ActionButton label="Prepare threaded reply" icon="arrow.up.right" onPress={handleReply} /></View>{notice ? <Text className="mt-2 text-xs leading-4" style={{ color: colors.warning }}>{notice}</Text> : null}</View> : null}
        <View className="mt-4 mb-5 flex-row flex-wrap gap-2"><Text className="w-full text-xs font-bold uppercase tracking-wider text-muted">Signal rules</Text>{(["reply", "bounce", "out_of_office", "unsubscribe"] as ReplySignal[]).map((signal) => <Pressable key={signal} onPress={() => handleSignalDemo(signal)} style={({ pressed }) => [{ backgroundColor: `${colors.primary}18`, opacity: pressed ? 0.7 : 1 }]} className="rounded-full px-3 py-2"><Text className="text-xs font-semibold" style={{ color: colors.primary }}>{stateLabel(signal)}</Text></Pressable>)}</View>
      </View>
    </ScreenContainer>
  );
}
