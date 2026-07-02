import type { Insight } from "../../api/types";
import { Card, Empty } from "./shared";

const ICON: Record<Insight["severity"], string> = { good: "✅", info: "💡", warn: "⚠️" };

export default function InsightsCard({ insights }: { insights: Insight[] | null }) {
  return (
    <Card title="자동 인사이트" span="lg:col-span-7">
      {!insights ? <Empty /> : insights.length === 0 ? (
        <p className="text-slate-500 text-sm py-4">특이사항이 없어요. 무난한 한 달이었습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {insights.map((i, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <span>{ICON[i.severity]}</span>
              <span className={i.severity === "warn" ? "text-amber-300" : "text-slate-200"}>
                {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
