/**
 * Firebase Phone Auth, loaded only when the sign-in form is used (keeps the menu fast).
 * Configure with VITE_FIREBASE_* variables. Without them the app falls back to the
 * development code flow, which the server only accepts outside production.
 */
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

let verifier: RecaptchaVerifier | null = null;

async function getAuthModule() {
  const [{ initializeApp, getApps }, authMod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = getApps()[0] ?? initializeApp(config);
  const auth = authMod.getAuth(app);
  auth.languageCode = "en";
  return { auth, authMod };
}

/** Sends the SMS code. `containerId` is an element the invisible reCAPTCHA can attach to. */
export async function sendFirebaseCode(e164: string, containerId: string): Promise<ConfirmationResult> {
  const { auth, authMod } = await getAuthModule();
  verifier?.clear();
  verifier = new authMod.RecaptchaVerifier(auth, containerId, { size: "invisible" });
  try {
    return await authMod.signInWithPhoneNumber(auth, e164, verifier);
  } catch (e) {
    verifier.clear();
    verifier = null;
    throw new Error(firebaseMessage(e));
  }
}

export async function confirmFirebaseCode(confirmation: ConfirmationResult, code: string): Promise<string> {
  try {
    const cred = await confirmation.confirm(code);
    const token = await cred.user.getIdToken();
    // The app keeps its own session cookie; the Firebase session is not needed afterwards.
    const { auth } = await getAuthModule();
    void auth.signOut();
    return token;
  } catch (e) {
    throw new Error(firebaseMessage(e));
  }
}

function firebaseMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-verification-code")) return "That code is not right. Check the SMS and try again.";
  if (code.includes("code-expired")) return "That code has expired. Request a new one.";
  if (code.includes("too-many-requests")) return "Too many attempts from this phone. Wait a few minutes and try again.";
  if (code.includes("invalid-phone-number")) return "That phone number is not valid. Check it and try again.";
  if (code.includes("quota-exceeded")) return "We cannot send codes right now. Call the restaurant to order.";
  if (code.includes("network")) return "You seem to be offline. Check your connection and try again.";
  return "We could not send or check the code. Try again.";
}
