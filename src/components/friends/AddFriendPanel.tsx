import { useState } from "react";
import { addFriend } from "../../services/friends";

export default function AddFriendPanel() {
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setFeedback(null);
    setIsLoading(true);
    try {
      const msg = await addFriend(name.trim());
      setFeedback({ message: msg, isError: false });
      setName("");
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : "Une erreur est survenue",
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="add-friend-panel">
      <p className="add-friend-title">Ajouter un ami</p>
      <p className="add-friend-subtitle">
        Tu peux ajouter un ami avec son nom d'utilisateur.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="add-friend-input-row">
          <input
            type="text"
            placeholder="Nom d'utilisateur"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="btn-primary" style={{ padding: "8px 18px", fontSize: "var(--text-sm)" }} disabled={isLoading || !name.trim()}>
            {isLoading ? "…" : "Envoyer"}
          </button>
        </div>
        {feedback && (
          <p className={`add-friend-feedback ${feedback.isError ? "error" : "success"}`}>
            {feedback.message}
          </p>
        )}
      </form>
    </div>
  );
}
