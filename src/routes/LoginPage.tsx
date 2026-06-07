import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/auth.css";

type Mode = "login" | "signup";

export default function LoginPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(name, email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">
          <div className="auth-logo-mark">L</div>
          <div className="auth-logo-word">LiteCord</div>
        </div>

        <h1>{mode === "login" ? "Content de te revoir" : "Crée ton compte"}</h1>
        <p className="auth-subtitle">
          {mode === "login"
            ? "Connecte-toi pour rejoindre tes conversations."
            : "Quelques infos et c'est parti."}
        </p>

        {mode === "signup" && (
          <div className="auth-field">
            <label htmlFor="name">Nom d'utilisateur</label>
            <input
              id="name"
              type="text"
              placeholder="ton_pseudo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="email">Adresse e-mail</label>
          <input
            id="email"
            type="email"
            placeholder="tom@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-submit" disabled={isLoading}>
          {isLoading ? "…" : mode === "login" ? "Se connecter" : "Créer un compte"}
        </button>

        <p className="auth-switch">
          {mode === "login" ? "Pas encore de compte ?" : "Déjà un compte ?"}
          <button type="button" onClick={switchMode}>
            {mode === "login" ? "S'inscrire" : "Se connecter"}
          </button>
        </p>
      </form>
    </div>
  );
}
