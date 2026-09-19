import { Check, LocateFixed, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { commonTimezones, deviceTimezone, formatTimezoneOffset, searchTimezones, timezoneLabel } from "@/lib/timezones";

function TimezoneChoice({ timezone, label, selected, onSelect }: { timezone: string; label: string; selected: boolean; onSelect: (value: string) => void }) {
  return <button type="button" role="option" aria-selected={selected} onClick={() => onSelect(timezone)} className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${selected ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{label} · {formatTimezoneOffset(timezone)}</strong><span className="mt-1 block truncate text-xs text-slate-500">{timezone}</span></span>{selected && <Check className="shrink-0 text-teal-700" size={16} />}</button>;
}

export function TimezoneSelect({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const [query, setQuery] = useState("");
  const device = deviceTimezone();
  const options = useMemo(() => searchTimezones(query, value), [query, value]);
  return <div className="space-y-5" aria-label="业务时区选择器">
    <section aria-labelledby="device-timezone-title">
      <div className="mb-2 flex items-center gap-2"><LocateFixed size={16} className="text-teal-700" /><h3 id="device-timezone-title" className="text-sm font-bold text-slate-900">当前设备时区</h3></div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="font-bold text-slate-950">{timezoneLabel(device)}（{formatTimezoneOffset(device)}）</p><p className="mt-1 text-sm text-slate-500">{device}</p><button type="button" onClick={() => onChange(device)} className="mt-3 text-sm font-semibold text-teal-700 hover:text-teal-900">使用当前设备时区</button></div>
    </section>
    <section aria-labelledby="common-timezones-title"><h3 id="common-timezones-title" className="mb-2 text-sm font-bold text-slate-900">常用地区</h3><div className="grid gap-2 sm:grid-cols-2" role="listbox" aria-label="常用时区">{commonTimezones.map((option) => <TimezoneChoice key={option.id} timezone={option.id} label={option.label} selected={value === option.id} onSelect={onChange} />)}</div></section>
    <details className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-bold text-slate-900">更多时区</summary><div className="mt-4 space-y-3"><Input label="搜索更多时区" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="上海 / Tokyo / UTC+8 / Asia/Shanghai" icon={<Search size={16} />} /><div className="max-h-72 space-y-2 overflow-y-auto pr-1" role="listbox" aria-label="全部 IANA 时区">{options.length ? options.map((timezone) => <TimezoneChoice key={timezone} timezone={timezone} label={timezoneLabel(timezone)} selected={value === timezone} onSelect={onChange} />) : <p className="py-5 text-center text-sm text-slate-500">没有匹配的时区</p>}</div></div></details>
    <p className="text-sm text-slate-600">当前选择：<strong className="text-slate-900">{timezoneLabel(value)} · {formatTimezoneOffset(value)}</strong> <span className="text-slate-500">({value})</span></p>
    {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
  </div>;
}
