import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { bindSignOut, publishAccount } from "./appAuth";
import App from "./App";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const queryClient = new QueryClient();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}
if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#725578",
    colorForeground: "#eeeeec",
    colorMutedForeground: "#c5bbc9",
    colorDanger: "#fca5a5",
    colorBackground: "#211b25",
    colorInput: "#342a3a",
    colorInputForeground: "#eeeeec",
    colorNeutral: "#dcdcd9",
    fontFamily: '"Playfair Display", Georgia, serif',
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#211b25] rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#eeeeec]",
    headerSubtitle: "text-[#c5bbc9]",
    socialButtonsBlockButtonText: "text-[#eeeeec]",
    formFieldLabel: "text-[#eeeeec]",
    footerActionLink: "text-[#eeeeec]",
    footerActionText: "text-[#c5bbc9]",
    dividerText: "text-[#c5bbc9]",
    identityPreviewEditButton: "text-[#eeeeec]",
    formFieldSuccessText: "text-[#eeeeec]",
    alertText: "text-[#eeeeec]",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

function AccountBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [readyFor, setReadyFor] = useState<string | null | undefined>();
  const [error, setError] = useState("");
  useEffect(() => {
    bindSignOut(() => signOut({ redirectUrl: basePath || "/" }));
  }, [signOut]);
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    setError("");
    setReadyFor(undefined);
    if (!isSignedIn) {
      publishAccount(null);
      setReadyFor(null);
      return;
    }
    // The local UID can differ from both Clerk's ID and its migrated externalId.
    // Wait for the server bridge; never fetch user-scoped data using the native ID.
    void customFetch<{ user: {
      uid: string; email: string | null; displayName: string | null; email_verified: boolean;
    } }>("/api/account", { cache: "no-store" }).then(({ user: account }) => {
      if (cancelled) return;
      if (!account?.uid) throw new Error("Your account could not be loaded.");
      publishAccount({
        uid: account.uid, email: account.email,
        displayName: user?.fullName || account.displayName,
        photoURL: user?.imageUrl || null, emailVerified: account.email_verified,
      });
      setReadyFor(userId);
    }).catch(() => {
      if (!cancelled) setError("Your account could not be loaded. Retry or sign out to use another account.");
    });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId]);
  if (error) return <div role="alert" className="p-8 text-center">
    <p>{error}</p>
    <button className="m-3 underline" onClick={() => window.location.reload()}>Retry</button>
    <button className="m-3 underline" onClick={() => void signOut({ redirectUrl: basePath || "/" })}>Sign out</button>
  </div>;
  if (!isLoaded || readyFor !== (isSignedIn ? userId : null)) {
    return <div role="status" className="p-8 text-center">Loading account…</div>;
  }
  return <>{children}</>;
}

function SignInPage() {
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4">
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
      forceRedirectUrl={basePath || "/"} />
    <a href={`${basePath}/manual.html`} className="text-sm text-emerald-400 underline underline-offset-4">
      Read the SFT Studio Pro manual
    </a>
  </div>;
}
function SignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center px-4">
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}
      forceRedirectUrl={basePath || "/"} />
  </div>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to access your account" } },
        signUp: { start: { title: "Create your account", subtitle: "Get started today" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route><AccountBridge><App /></AccountBridge></Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
export default function ClerkRoot() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
