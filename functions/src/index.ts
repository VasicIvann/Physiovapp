import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

admin.initializeApp();

type ReminderDoc = {
  userId: string;
  todoId: string;
  title?: string;
  body?: string;
  url?: string;
  scheduledAt: admin.firestore.Timestamp;
  status: "pending" | "sent" | "skipped";
};

const isTokenNotRegistered = (code?: string) =>
  code === "messaging/registration-token-not-registered" ||
  code === "messaging/invalid-registration-token";

async function getUserTokens(userId: string) {
  const snap = await admin.firestore().collection("pushTokens").where("userId", "==", userId).get();
  const tokens = snap.docs.map((d) => (d.get("token") as string) || d.id).filter(Boolean);
  return { tokens, tokenDocIds: snap.docs.map((d) => d.id) };
}

export const sendTestPush = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Not signed in.");

  const title = typeof request.data?.title === "string" ? request.data.title : "Physiovapp";
  const body = typeof request.data?.body === "string" ? request.data.body : "Test notification";
  const url = typeof request.data?.url === "string" ? request.data.url : "/";

  const { tokens } = await getUserTokens(request.auth.uid);
  if (tokens.length === 0) return { ok: false, reason: "no_tokens" };

  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { url },
  });

  return { ok: true, successCount: resp.successCount, failureCount: resp.failureCount };
});

export const sendDueTodoReminders = onSchedule("every 1 minutes", async () => {
  const now = admin.firestore.Timestamp.now();
  const remindersSnap = await admin
    .firestore()
    .collection("todoReminders")
    .where("status", "==", "pending")
    .where("scheduledAt", "<=", now)
    .orderBy("scheduledAt", "asc")
    .limit(100)
    .get();

  if (remindersSnap.empty) return;

  const tokensCache = new Map<string, string[]>();

  await Promise.all(
    remindersSnap.docs.map(async (docSnap) => {
      const data = docSnap.data() as ReminderDoc;
      if (!data?.userId) return;

      const userId = data.userId;
      const tokens = tokensCache.get(userId) ?? (await getUserTokens(userId)).tokens;
      tokensCache.set(userId, tokens);

      if (tokens.length === 0) {
        await docSnap.ref.set(
          { status: "skipped", sentAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
        return;
      }

      const title = data.title ?? "Todo reminder";
      const body = data.body ?? "";
      const url = data.url ?? "/todo";

      const resp = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { url },
      });

      const badTokenIndexes: number[] = [];
      resp.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = (r.error as { code?: string } | undefined)?.code;
        if (isTokenNotRegistered(code)) badTokenIndexes.push(idx);
      });

      if (badTokenIndexes.length > 0) {
        await Promise.all(
          badTokenIndexes.map(async (idx) => {
            const token = tokens[idx];
            if (!token) return;
            await admin.firestore().collection("pushTokens").doc(token).delete().catch(() => undefined);
          }),
        );
      }

      await docSnap.ref.set(
        { status: "sent", sentAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    }),
  );
});

