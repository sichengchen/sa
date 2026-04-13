import { startTransition, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Servers</Text>
        {model.availableServers.map((server) => (
          <Pressable
            key={server.serverId}
            onPress={() => {
              void controller.switchServer(server.serverId);
            }}
            style={styles.button}
          >
            <Text>
              {server.label} - {server.selected ? "selected" : "available"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text>Session: {model.sessionId}</Text>
      <Text>Status: {model.sessionStatus}</Text>
      <Text>Approval mode: {model.approvalMode}</Text>
      <Text>Security mode: {model.securityMode}</Text>
      <Text>Transcript items: {model.transcriptCount}</Text>
      <Text>Latest message: {model.latestMessage}</Text>
      <Text>Pending approval: {model.pendingApproval}</Text>
      <Text>Pending question: {model.pendingQuestion}</Text>
      {shell.ariaThread.state.pendingApproval ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Approval</Text>
          <Pressable
            onPress={() => {
              void controller.approveToolCall(
                shell.ariaThread.state.pendingApproval!.toolCallId,
                true,
              );
            }}
            style={styles.button}
          >
            <Text>Approve</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void controller.acceptToolCallForSession(
                shell.ariaThread.state.pendingApproval!.toolCallId,
              );
            }}
            style={styles.button}
          >
            <Text>Allow for session</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void controller.approveToolCall(
                shell.ariaThread.state.pendingApproval!.toolCallId,
                false,
              );
            }}
            style={styles.button}
          >
            <Text>Deny</Text>
          </Pressable>
        </View>
      ) : null}
      {shell.ariaThread.state.pendingQuestion ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Question</Text>
          {(shell.ariaThread.state.pendingQuestion.options ?? []).map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                void controller.answerQuestion(
                  shell.ariaThread.state.pendingQuestion!.questionId,
                  option,
                );
              }}
              style={styles.button}
            >
              <Text>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <Pressable
          onPress={() => {
            void controller.sendMessage("Message Aria");
          }}
          style={styles.button}
        >
          <Text>Send</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void controller.stop();
          }}
          style={styles.button}
        >
          <Text>Stop</Text>
        </Pressable>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Sessions</Text>
        {model.recentSessions.length === 0 ? (
          <Text>None yet</Text>
        ) : (
          model.recentSessions.map((session) => (
            <Pressable
              key={session.sessionId}
              onPress={() => {
                void controller.openSession(session.sessionId);
              }}
              style={styles.button}
            >
              <Text>
                {session.sessionId} - {session.kind}
              </Text>
            </Pressable>
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
  button: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
