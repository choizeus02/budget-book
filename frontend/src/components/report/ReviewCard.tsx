import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { MonthlyReview } from "../../api/types";
import { Card } from "./shared";

export default function ReviewCard({ year, month }: { year: number; month: number }) {
  const [review, setReview] = useState<MonthlyReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReview(null); setError(null);
    api.report.getReview(year, month).then(setReview).catch(() => {});
  }, [year, month]);

  async function generate() {
    setLoading(true); setError(null);
    try {
      setReview(await api.report.generateReview(year, month));
    } catch {
      setError("총평 생성에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="AI 월간 총평" span="lg:col-span-5">
      {review ? (
        <div className="flex flex-col gap-3">
          <p className="text-slate-200 text-sm leading-relaxed">{review.content}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {new Date(review.created_at).toLocaleDateString("ko-KR")} 생성
            </span>
            <button onClick={generate} disabled={loading}
              className="text-xs text-indigo-400 disabled:text-slate-600">
              {loading ? "생성 중..." : "다시 생성"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-slate-500 text-sm">이번 달 총평이 아직 없어요</p>
          <button onClick={generate} disabled={loading}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:bg-slate-700">
            {loading ? "생성 중..." : "총평 생성"}
          </button>
        </div>
      )}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </Card>
  );
}
