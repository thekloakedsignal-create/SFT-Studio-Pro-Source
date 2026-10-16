// Replit Auth session, exposed with the same names the app already uses
// (auth.currentUser, onAuthStateChanged, signOut) so the rest of the app is unchanged.
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

const ready = fetch("/api/auth/user", { credentials: "include", cache: "no-store" })
  .then(r => (r.ok ? r.json() : { user: null }))
  .then(data => {
    const u = data?.user;
    auth.currentUser = u?.uid
      ? { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, photoURL: u.photoURL ?? null, emailVerified: Boolean(u.email_verified) }
      : null;
  })
  .catch(() => { auth.currentUser = null; })
  .finally(() => {
    resolved = true;
    listeners.forEach(fn => fn(auth.currentUser));
  });

export function onAuthStateChanged(_auth: typeof auth, callback: Listener): () => void {
  listeners.add(callback);
  if (resolved) callback(auth.currentUser);
  return () => { listeners.delete(callback); };
}

export function login(): void {
  window.location.href = `/api/login?returnTo=${encodeURIComponent(window.location.pathname || "/")}`;
}

export async function signOut(_auth?: typeof auth): Promise<void> {
  await ready;
  window.location.href = "/api/logout";
}
