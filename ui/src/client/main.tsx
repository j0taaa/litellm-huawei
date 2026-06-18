import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, BrainCircuit, ExternalLink, Eye, KeyRound, Layers3, LogOut, MessageSquare, Regex, Search, Users } from "lucide-react";
import type { SessionUser } from "../shared/types";
import { api } from "./api";
import { KeysPage } from "./pages/keys-page";
import { ImageSupportPage } from "./pages/image-support-page";
import { KeyStatsPage, StatsPage, TeamStatsPage } from "./pages/stats-pages";
import { ModelsPage } from "./pages/models-page";
import { PoliciesPage } from "./pages/policies-page";
import { SearchToolsPage } from "./pages/search-tools-page";
import { SkillsPage } from "./pages/skills-page";
import { TeamsPage } from "./pages/teams-page";
import { TestPage } from "./pages/test-page";
import type { RoutePath } from "./types";
import "./styles.css";

const routes: Array<{ path: "/stats" | "/keys" | "/teams" | "/models" | "/policies" | "/skills" | "/image-support" | "/search-tools" | "/test"; label: string; icon: React.ReactNode }> = [
  { path: "/stats", label: "Stats", icon: <BarChart3 size={18} /> },
  { path: "/keys", label: "Keys", icon: <KeyRound size={18} /> },
  { path: "/teams", label: "Teams", icon: <Users size={18} /> },
  { path: "/models", label: "Models", icon: <Layers3 size={18} /> },
  { path: "/policies", label: "Policies", icon: <Regex size={18} /> },
  { path: "/skills", label: "Skills", icon: <BrainCircuit size={18} /> },
  { path: "/image-support", label: "Images", icon: <Eye size={18} /> },
  { path: "/search-tools", label: "Search Tools", icon: <Search size={18} /> },
  { path: "/test", label: "Test", icon: <MessageSquare size={18} /> }
];

function App() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { route, navigate } = useRoute();

  useEffect(() => {
    api<SessionUser>("/api/session")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="boot">Loading</div>;
  if (!session) return <Login onLogin={(nextSession) => { setSession(nextSession); navigate(normalizeRoute(window.location.pathname)); }} />;
  const activeRoute = activeNavRoute(route);
  return (
    <AppLayout session={session} route={activeRoute} onNavigate={navigate} onLogout={() => setSession(null)}>
      {renderRoute(route, navigate)}
    </AppLayout>
  );
}

function Login({ onLogin }: { onLogin: (session: SessionUser) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api<SessionUser>("/api/login", { method: "POST", body: { username, password } }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">Huawei MaaS Gateway</p>
          <h1>LiteLLM Access</h1>
        </div>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="primary" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
    </main>
  );
}

function AppLayout({ session, route, onNavigate, onLogout, children }: { session: SessionUser; route: RoutePath; onNavigate: (path: RoutePath) => void; onLogout: () => void; children: React.ReactNode }) {
  async function logout() {
    await api("/api/logout", { method: "POST" });
    onLogout();
    onNavigate("/stats");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <KeyRound size={20} />
          <span>MaaS LiteLLM</span>
        </div>
        <nav>
          {routes.map((item) => (
            <NavLink key={item.path} active={route === item.path} icon={item.icon} label={item.label} path={item.path} onNavigate={onNavigate} />
          ))}
        </nav>
        <a className="nav litellm-external" href={liteLLMUiUrl()} target="_blank" rel="noreferrer">
          <ExternalLink size={18} /><span>LiteLLM UI</span>
        </a>
        <div className="account">
          <strong>{session.userEmail || session.userId}</strong>
          <span>{session.userRole}</span>
          <button className="ghost" onClick={logout}><LogOut size={16} /> Logout</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function liteLLMUiUrl(): string {
  const host = window.location.hostname.includes(":") ? `[${window.location.hostname}]` : window.location.hostname;
  return `${window.location.protocol}//${host}:4000/ui/`;
}

function NavLink({ active, icon, label, path, onNavigate }: { active: boolean; icon: React.ReactNode; label: string; path: RoutePath; onNavigate: (path: RoutePath) => void }) {
  return (
    <a
      className={active ? "nav active" : "nav"}
      href={path}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(path);
      }}
    >
      {icon}<span>{label}</span>
    </a>
  );
}

function renderRoute(route: RoutePath, navigate: (path: RoutePath) => void): React.ReactNode {
  if (route.startsWith("/stats/keys/")) {
    return <KeyStatsPage keyId={decodeURIComponent(route.slice("/stats/keys/".length))} onBack={() => navigate("/stats")} />;
  }
  if (route.startsWith("/stats/teams/")) {
    return <TeamStatsPage teamId={decodeURIComponent(route.slice("/stats/teams/".length))} onBack={() => navigate("/stats")} />;
  }
  if (route === "/keys") return <KeysPage />;
  if (route === "/teams") return <TeamsPage />;
  if (route === "/models") return <ModelsPage />;
  if (route === "/policies") return <PoliciesPage />;
  if (route === "/skills") return <SkillsPage />;
  if (route === "/image-support") return <ImageSupportPage />;
  if (route === "/search-tools") return <SearchToolsPage />;
  if (route === "/test") return <TestPage />;
  return <StatsPage onNavigate={navigate} />;
}

function activeNavRoute(route: RoutePath): "/stats" | "/keys" | "/teams" | "/models" | "/policies" | "/skills" | "/image-support" | "/search-tools" | "/test" {
  if (route.startsWith("/stats")) return "/stats";
  if (route === "/keys" || route === "/teams" || route === "/models" || route === "/policies" || route === "/skills" || route === "/image-support" || route === "/search-tools" || route === "/test") return route;
  return "/stats";
}

function useRoute() {
  const [route, setRoute] = useState<RoutePath>(() => normalizeRoute(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname !== route) {
      window.history.replaceState({}, "", route);
    }

    function onPopState() {
      setRoute(normalizeRoute(window.location.pathname));
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [route]);

  const navigate = useMemo(() => (path: RoutePath) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setRoute(path);
  }, []);

  return { route, navigate };
}

function normalizeRoute(pathname: string): RoutePath {
  if (pathname.startsWith("/stats/keys/") && pathname.length > "/stats/keys/".length) return pathname as RoutePath;
  if (pathname.startsWith("/stats/teams/") && pathname.length > "/stats/teams/".length) return pathname as RoutePath;
  return routes.some((item) => item.path === pathname) ? pathname as RoutePath : "/stats";
}

createRoot(document.getElementById("root")!).render(<App />);
