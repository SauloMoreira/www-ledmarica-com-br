import { useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { addDaysBR, endOfDayBR, endOfMonthBR, isoDateBR, parseDateInputBR, startOfDayBR, startOfMonthBR } from "@/lib/dateBR";

export type DashboardPeriod = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";

export type DashboardRange = { start: string; end: string; period: DashboardPeriod };

const PRESETS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "thisMonth", label: "Mês atual" },
  { value: "lastMonth", label: "Mês anterior" },
  { value: "custom", label: "Personalizado" },
];

const startOfDay = startOfDayBR;
const endOfDay = endOfDayBR;

export function computeRange(period: DashboardPeriod, customStart?: string, customEnd?: string) {
  const now = new Date();
  let start: Date;
  let end: Date = endOfDay(now);

  switch (period) {
    case "today":
      start = startOfDay(now);
      break;
    case "last7": {
      const s = addDaysBR(now, -6);
      start = startOfDay(s);
      break;
    }
    case "last30": {
      const s = addDaysBR(now, -29);
      start = startOfDay(s);
      break;
    }
    case "thisMonth":
      start = startOfMonthBR(now);
      break;
    case "lastMonth": {
      start = startOfMonthBR(now, -1);
      end = endOfMonthBR(now, -1);
      break;
    }
    case "custom":
      start = customStart ? startOfDay(parseDateInputBR(customStart)) : startOfDay(now);
      end = customEnd ? endOfDay(parseDateInputBR(customEnd)) : endOfDay(now);
      break;
  }
  return { start: start.toISOString(), end: end.toISOString(), period };
}

interface Props {
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
}

export function DateRangeFilter({ value, onChange }: Props) {
  const [customStart, setCustomStart] = useState(isoDateBR(new Date(value.start)));
  const [customEnd, setCustomEnd] = useState(isoDateBR(new Date(value.end)));

  const showCustom = value.period === "custom";

  const apply = (period: DashboardPeriod) => {
    if (period === "custom") {
      onChange(computeRange("custom", customStart, customEnd));
    } else {
      onChange(computeRange(period));
    }
  };

  const customSummary = useMemo(() => {
    if (!showCustom) return null;
    return `${customStart} → ${customEnd}`;
  }, [showCustom, customStart, customEnd]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
        <Calendar className="w-3.5 h-3.5" /> Período:
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => apply(p.value)}
            className={[
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
              value.period === p.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted",
            ].join(" ")}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 ml-1">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-card border border-border rounded-md px-2 py-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-card border border-border rounded-md px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(computeRange("custom", customStart, customEnd))}
            className="px-3 py-1 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90"
          >
            Aplicar
          </button>
          {customSummary && (
            <span className="text-[10px] text-muted-foreground">{customSummary}</span>
          )}
        </div>
      )}
    </div>
  );
}
