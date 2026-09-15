import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, SectionHeader, StatusPill } from "@/components/ui/ops-primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { renderTemplate, validateTemplate } from "@/lib/template-domain";

const defaultSubject = "A thoughtful idea for {company_name}";
const defaultBody = "Hi {first_name},\n\nI noticed what {company_name} is building and thought this may be useful for your team.\n\nWould a short conversation next week be helpful?\n\nBest,\n{sender_name}";

export default function ComposeScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [templateId, setTemplateId] = useState<number | undefined>();
  const [templateVersion, setTemplateVersion] = useState<number | undefined>();
  const [templateName, setTemplateName] = useState("Warm introduction");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [recipient, setRecipient] = useState("");
  const [senderConnectionId, setSenderConnectionId] = useState<number | undefined>();
  const [loaded, setLoaded] = useState(false);

  const templatesQuery = trpc.templates.list.useQuery(undefined, { enabled: isAuthenticated });
  const connectionsQuery = trpc.googleConnections.list.useQuery(undefined, { enabled: isAuthenticated });
  const leadsQuery = trpc.leads.list.useQuery({}, { enabled: isAuthenticated });
  const saveMutation = trpc.templates.save.useMutation();
  const validateMutation = trpc.templates.validate.useMutation();
  const dryRunTestMutation = trpc.sendJobs.dryRunTest.useMutation();
  const selectedLead = leadsQuery.data?.[0];
  const connection = connectionsQuery.data?.find((item) => item.id === senderConnectionId) ?? connectionsQuery.data?.[0];

  useEffect(() => {
    if (loaded || !templatesQuery.data?.length) return;
    const saved = templatesQuery.data[0];
    setTemplateId(saved.id);
    setTemplateVersion(saved.version);
    setTemplateName(saved.name);
    setSubject(saved.subject);
    setBody(saved.body);
    setLoaded(true);
  }, [loaded, templatesQuery.data]);

  useEffect(() => {
    if (!senderConnectionId && connectionsQuery.data?.[0]) setSenderConnectionId(connectionsQuery.data[0].id);
  }, [connectionsQuery.data, senderConnectionId]);

  const validation = useMemo(() => validateTemplate({ subject, body, recipient, senderSelected: Boolean(connection), suppressed: selectedLead?.status === "suppressed" }), [body, connection, recipient, selectedLead?.status, subject]);
  const previewValues = selectedLead ? { first_name: selectedLead.company, company_name: selectedLead.company, sender_name: connection?.displayName ?? "Your team" } : {};
  const renderedSubject = renderTemplate(subject, previewValues);
  const renderedBody = renderTemplate(body, previewValues);

  const handleSave = async (status: "draft" | "ready") => {
    if (!isAuthenticated) {
      setNotice("Sign in from Senders before saving user-owned templates.");
      return;
    }
    if (status === "ready") {
      const serverValidation = await validateMutation.mutateAsync({ subject, body, recipient, senderConnectionId, suppressed: selectedLead?.status === "suppressed" });
      if (!serverValidation.valid) {
        setNotice(serverValidation.errors.join(" "));
        return;
      }
    }
    const result = await saveMutation.mutateAsync({ id: templateId, version: templateVersion, name: templateName, subject, body, status });
    if (result.saved) {
      setTemplateId(result.id ?? templateId);
      setTemplateVersion((current) => (result.id && !current ? 1 : (current ?? 1) + 1));
      await templatesQuery.refetch();
      setNotice(status === "ready" ? "Template validated and saved as ready. No message was sent." : "Draft saved securely to your workspace.");
    }
  };

  const handleSendTest = async () => {
    if (!validation.valid) {
      setNotice(validation.errors.join(" "));
      return;
    }
    if (!isAuthenticated) {
      setNotice("Sign in from Senders before preparing a controlled test.");
      return;
    }
    const serverValidation = await validateMutation.mutateAsync({ subject, body, recipient, senderConnectionId, suppressed: selectedLead?.status === "suppressed" });
    if (!serverValidation.valid) {
      setNotice(serverValidation.errors.join(" "));
      return;
    }
    if (!templateId || !selectedLead || !senderConnectionId) {
      setNotice("Save this template as ready and load an eligible lead and active sender before preparing the controlled test.");
      return;
    }
    try {
      const result = await dryRunTestMutation.mutateAsync({ leadId: selectedLead.id, templateId, connectionId: senderConnectionId, recipient });
      setNotice(result.prepared ? `One-recipient dry-run prepared for ${result.recipient}. No provider send was attempted.` : "Dry-run was not prepared.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The controlled test could not be prepared.");
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 32 }}>
        <View className="mb-5 flex-row items-start justify-between"><View><Text className="text-xs font-bold uppercase tracking-widest text-muted">Workspace</Text><Text className="mt-1 text-3xl font-bold text-foreground">Compose</Text><Text className="mt-1 text-sm leading-5 text-muted">Draft, validate, and preview before any test.</Text></View><View className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"><IconSymbol name="square.and.pencil" size={20} color={colors.primary} /></View></View>

        <View className="mb-5 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"><View className="flex-1"><Text className="text-xs font-bold uppercase tracking-widest text-muted">Template name</Text><TextInput value={templateName} onChangeText={setTemplateName} className="mt-1 text-sm font-bold text-foreground" placeholder="Name this template" placeholderTextColor={colors.muted} /></View><StatusPill tone={validation.valid ? "success" : "warning"} label={validation.valid ? "Ready" : "Draft"} /></View>

        <SectionHeader title="Message setup" />
        <View className="mb-5 gap-3 rounded-3xl border border-border bg-surface p-4">
          <View><Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Sender</Text><Pressable onPress={() => setNotice(connection ? "Sender selection is bound to connected accounts. Add another sender from Senders when multi-sender support is enabled." : "Connect a Google sender from Senders before testing.")} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.72 : 1 }]} className="rounded-2xl border border-border px-3 py-3"><View className="flex-1"><Text className="text-sm text-foreground">{connection?.displayName ?? "No connected sender"}</Text><Text className="mt-0.5 text-xs text-muted">{connection?.email ?? "Connection required"}</Text></View><StatusPill tone={connection ? "success" : "warning"} label={connection ? "Selected" : "Required"} /></Pressable></View>
          <View><Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Explicit test recipient</Text><TextInput value={recipient} onChangeText={setRecipient} keyboardType="email-address" autoCapitalize="none" className="rounded-2xl border border-border px-3 py-3 text-sm text-foreground" placeholder="you@example.com" placeholderTextColor={colors.muted} /></View>
          <View><Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Subject</Text><TextInput value={subject} onChangeText={setSubject} className="rounded-2xl border border-border px-3 py-3 text-sm text-foreground" placeholderTextColor={colors.muted} /></View>
          <View><Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Body</Text><TextInput value={body} onChangeText={setBody} multiline textAlignVertical="top" className="min-h-[190px] rounded-2xl border border-border px-3 py-3 text-sm leading-5 text-foreground" placeholderTextColor={colors.muted} /></View>
          <View className="flex-row flex-wrap gap-2"><Text className="mr-1 py-1 text-xs font-bold text-muted">Insert:</Text>{["{company_name}", "{first_name}", "{sender_name}"].map((token) => <Pressable key={token} onPress={() => setBody((current) => `${current} ${token}`)} style={({ pressed }) => [{ backgroundColor: `${colors.primary}18`, opacity: pressed ? 0.7 : 1 }]} className="rounded-full px-2.5 py-1"><Text className="text-xs font-semibold" style={{ color: colors.primary }}>{token}</Text></Pressable>)}</View>
        </View>

        <View className="mb-5 rounded-3xl border border-border bg-surface p-4"><View className="mb-3 flex-row items-center justify-between"><Text className="text-base font-bold text-foreground">Rendered preview</Text><Pressable onPress={() => setPreview(!preview)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}><Text className="text-sm font-bold" style={{ color: colors.primary }}>{preview ? "Hide" : "Show"}</Text></Pressable></View>{preview ? selectedLead ? <View className="rounded-2xl border border-border px-3 py-3"><Text className="text-sm font-bold text-foreground">{renderedSubject}</Text><Text className="mt-3 text-sm leading-5 text-muted">{renderedBody}</Text></View> : <View className="rounded-2xl border border-dashed border-border px-3 py-5"><Text className="text-sm font-bold text-foreground">No representative lead available</Text><Text className="mt-1 text-xs leading-4 text-muted">Load an authenticated lead into the Queue before rendering a personalized preview. Unresolved placeholders stay visible.</Text></View> : <View className="flex-row items-center gap-2 rounded-2xl px-1 py-2"><IconSymbol name="shield.checkered" size={15} color={colors.warning} /><Text className="text-xs leading-4 text-muted">{validation.valid ? "Validation passed for the current template." : validation.errors[0] ?? "Use preview to verify placeholders."}</Text></View>}</View>

        <View className="mb-3 gap-3"><ActionButton label="Save draft" icon="checkmark" variant="secondary" onPress={() => handleSave("draft")} /><View className="flex-row gap-3"><View className="flex-1"><ActionButton label="Validate & prepare" icon="shield.checkered" onPress={() => handleSave("ready")} /></View><View className="flex-1"><ActionButton label="Send test" variant="secondary" icon="arrow.up.right" onPress={handleSendTest} /></View></View><ActionButton label="Start approved run" variant="danger" icon="pause.fill" onPress={() => setNotice("Approved runs are locked until Stage 6 adds manual approval, idempotency, and the kill switch.")} /></View>
        {notice ? <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-warning px-3 py-3" style={{ backgroundColor: `${colors.warning}12` }}><IconSymbol name="exclamationmark.triangle.fill" size={15} color={colors.warning} /><Text className="flex-1 text-xs leading-4" style={{ color: colors.warning }}>{notice}</Text></View> : null}
        <Text className="mt-1 text-center text-xs leading-4 text-muted">No unresolved placeholder, suppressed recipient, missing sender, or ambiguous action can reach the send pipeline.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}
