import { ThemedView } from "@/components/themed-view";
import * as Auth from "@/lib/_core/auth";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function decodeBase64Url(value: string): string {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  if (typeof atob !== "undefined") return atob(normalized);
  return Buffer.from(normalized, "base64").toString("utf-8");
}

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    error?: string;
    sessionToken?: string;
    user?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      console.log("[OAuth] Callback handler triggered", {
        error: params.error,
        sessionToken: params.sessionToken ? "present" : "missing",
        user: params.user ? "present" : "missing",
      });
      try {
        if (params.error) {
          setStatus("error");
          setErrorMessage(params.error);
          return;
        }

        if (!params.sessionToken) {
          setStatus("error");
          setErrorMessage(
            "Missing application session token. Please try signing in again.",
          );
          return;
        }

        await Auth.setSessionToken(params.sessionToken);

        if (params.user) {
          try {
            const userData = JSON.parse(decodeBase64Url(params.user));
            await Auth.setUserInfo({
              id: userData.id,
              openId: userData.openId,
              name: userData.name,
              email: userData.email,
              loginMethod: userData.loginMethod,
              lastSignedIn: new Date(userData.lastSignedIn || Date.now()),
            });
          } catch (error) {
            console.error("[OAuth] Failed to decode returned user data:", error);
          }
        }

        setStatus("success");
        setTimeout(() => router.replace("/(tabs)"), 1000);
      } catch (error) {
        console.error("[OAuth] Callback error:", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to complete authentication",
        );
      }
    };

    void handleCallback();
  }, [params.error, params.sessionToken, params.user, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              Completing authentication...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-base leading-6 text-center text-foreground">
              Authentication successful!
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              Redirecting...
            </Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">
              Authentication failed
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
