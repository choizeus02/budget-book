
interface Props {
  value: string;
  onChange: (v: string) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"];

export default function QuickInput({ value, onChange }: Props) {
  function handleKey(k: string) {
    if (k === "⌫") {
      onChange(value.slice(0, -1) || "");
      return;
    }
    if (value === "0" && k !== "00") {
      onChange(k);
      return;
    }
    const next = (value + k).replace(/^0+(\d)/, "$1");
    // 최대 9자리 (99,999,999원)
    if (next.length > 9) return;
    onChange(next);
  }

  const formatted = value
    ? Number(value).toLocaleString("ko-KR")
    : "0";

  return (
    <div className="flex flex-col gap-4">
      {/* 금액 표시 */}
      <div className="text-center">
        <span className="text-5xl font-bold tracking-tight text-white">
          {formatted}
        </span>
        <span className="text-2xl text-slate-400 ml-2">원</span>
      </div>

      {/* 숫자 패드 */}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(k);
            }}
            className="numpad-btn"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
