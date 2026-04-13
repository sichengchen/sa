import { startTransition, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { type AriaMobileAppShell } from "./app.js";
import {
  createAriaMobileNativeHostController,
  resolveAriaMobileNativeHostTarget,
} from "./native-host.js";
import { createAriaMobileNativeHostModel } from "./native-model.js";

export function AriaMobileNativeHost() {
  const target = resolveAriaMobileNativeHostTarget({
    serverId: process.env.EXPO_PUBLIC_ARIA_SERVER_ID,
    baseUrl: process.env.EXPO_PUBLIC_ARIA_SERVER_URL,
  });
  const [controller] = useState(() => createAriaMobileNativeHostController(target));
  const [shell, setShell] = useState<AriaMobileAppShell>(() => controller.getBootstrap().shell);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = controller.subscribe((bootstrap) => {
      if (!cancelled) {
        startTransition(() => {
          setShell(bootstrap.shell);
        });
      }
    });

    void controller.start();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [controller, target.baseUrl, target.serverId]);

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
