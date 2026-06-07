interface FriendSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function FriendSearchBar({ value, onChange }: FriendSearchBarProps) {
  return (
    <input
      className="fr-search"
      type="text"
      placeholder="Rechercher"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
