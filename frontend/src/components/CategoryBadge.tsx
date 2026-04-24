import { CATEGORY_ICONS } from "../api/types";

interface Props {
  category: string | null;
  confirmed?: boolean;
  onClick?: () => void;
}

export default function CategoryBadge({ category, confirmed, onClick }: Props) {
  const label = category ?? "분류 중...";
  const icon = category ? (CATEGORY_ICONS[category] ?? "📌") : "⏳";

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors
        ${confirmed
          ? "bg-indigo-900/50 text-indigo-300"
          : "bg-slate-700 text-slate-400"
        }
        ${onClick ? "cursor-pointer active:opacity-70" : "cursor-default"}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
