// Compatibility adapter for app-specific account UIDs. Clerk owns the session;
// the React bridge publishes only after Clerk and the local account are ready.
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  tenantId?: string | null;
  providerData?: { providerId: string; email?: string | null; displayName?: string | null; photoURL?: string | null }[];
}

type Listener = (user: AppUser | null) => void;

export const auth: { currentUser: AppUser | null } = { currentUser: null };

const listeners = new Set<Listener>();
let resolved = false;

let logout: (() => Promise<void>) | undefined;

export function publishAccount(user: AppUser | null) {
  auth.currentUser = user;
  resolved = true;
  listeners.forEach(fn => fn(user));
}

export function bindSignOut(callback: () => Promise<void>) {
  logout = callback;
}

export function onAuthStateChanged(_auth: typeof auth, callback: Listener): () => void {
  listeners.add(callback);
  if (resolved) callback(auth.currentUser);
  return () => { listeners.delete(callback); };
}

export function login(): void {
  window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`;
}

export async function signOut(_auth?: typeof auth): Promise<void> {
  if (!logout) throw new Error("Authentication is still loading.");
  await logout();
}
