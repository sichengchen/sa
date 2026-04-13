import { startTransition, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  createAriaMobileAppShell,
  createConnectedAriaMobileAppShell,
  type AriaMobileAppShell,
} from "./app.js";
import { createAriaMobileNativeHostModel } from "./native-model.js";

function resolveDefaultTarget() {
  return {
    serverId: process.env.EXPO_PUBLIC_ARIA_SERVER_ID ?? "mobile",
    baseUrl: process.env.EXPO_PUBLIC_ARIA_SERVER_URL ?? "http://127.0.0.1:7420/",
  };
}

export function AriaMobileNativeHost() {
  const target = resolveDefaultTarget();
  const [shell, setShell] = useState<AriaMobileAppShell>(() =>
    createAriaMobileAppShell({ target }),
  );

  useEffect(() => {
    let cancelled = false;

    void createConnectedAriaMobileAppShell({ target }).then((connected) => {
      if (!cancelled) {
        startTransition(() => {
          setShell(connected);
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [target.baseUrl, target.serverId]);

  const model = createAriaMobileNativeHostModel(shell);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{model.title}</Text>
      <Text style={styles.subtitle}>Server: {model.serverLabel}</Text>
      <Text>Session: {model.sessionId}</Text>
      <Text>Status: {model.sessionStatus}</Text>
      <Text>Approval mode: {model.approvalMode}</Text>
      <Text>Security mode: {model.securityMode}</Text>
      <Text>Transcript items: {model.transcriptCount}</Text>
      <Text>Latest message: {model.latestMessage}</Text>
      <Text>Pending approval: {model.pendingApproval}</Text>
      <Text>Pending question: {model.pendingQuestion}</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Sessions</Text>
        {model.recentSessions.length === 0 ? (
          <Text>None yet</Text>
        ) : (
          model.recentSessions.map((session) => (
            <Text key={session.sessionId}>
              {session.sessionId} - {session.kind}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
  },
  section: {
    gap: 8,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
});
