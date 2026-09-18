import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { AuthResponse, SearchResult } from "@/api/client";
import { searchRecords } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { errorMessage } from "@/lib/utils";

const modules = [["goals", "目标"], ["calendar", "日历"], ["team", "团队"], ["knowledge", "学习"], ["tags", "标签"]] as const;
const labels = Object.fromEntries(modules) as Record<string, string>;
const moduleRoutes: Record<string, string> = { goals: "/app/goals", calendar: "/app/calendar", team: "/app/team", knowledge: "/app/knowledge", tags: "/app/knowledge" };

function grouped(items: SearchResult[]) { const groups = new Map<string, SearchResult[]>(); items.forEach((item) => groups.set(item.module, [...(groups.get(item.module) ?? []), item])); return [...groups.entries()]; }
function resultRoute(item: SearchResult) {
  const route = moduleRoutes[item.module] ?? "/app/search";
  if (item.module === "tags") return `${route}?tag=${encodeURIComponent(item.title)}`;
  const parameter = { goals: "goal", calendar: "event", team: "member", knowledge: "item" }[item.module];
  return parameter ? `${route}?${parameter}=${encodeURIComponent(item.id)}` : route;
}

export function SearchOverlay({ open, onOpenChange }: { authResponse: AuthResponse; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const search = useMutation({ mutationFn: (value: string) => searchRecords(value, [], 1, 8) });
  const runOverlaySearch = search.mutate;
  const resetOverlaySearch = search.reset;
  const items = search.data?.data.items ?? [];
  useEffect(() => { if (!open) { setQuery(""); resetOverlaySearch(); setSelected(0); } }, [open, resetOverlaySearch]);
  useEffect(() => { const value = query.trim(); if (!open || value.length < 1) return; const timer = window.setTimeout(() => runOverlaySearch(value), 220); return () => window.clearTimeout(timer); }, [open, query, runOverlaySearch]);
  useEffect(() => setSelected(0), [search.data]);
  const openResult = (item: SearchResult) => { onOpenChange(false); navigate(resultRoute(item)); };
  const viewAll = () => { const value = query.trim(); onOpenChange(false); navigate(`/app/search${value ? `?q=${encodeURIComponent(value)}` : ""}`); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="top-[12vh] max-h-[76vh] max-w-2xl -translate-y-0 overflow-hidden rounded-[1.25rem] border-brand-100/70 bg-surface/95 p-0 shadow-overlay"><DialogHeader><div className="px-5 pt-5"><DialogTitle>全局搜索</DialogTitle><DialogDescription>搜索目标、日历、团队和学习内容（含标签）。</DialogDescription></div></DialogHeader><div className="border-y border-outline/55 px-5 py-3"><div className="relative"><SearchIcon className="absolute left-3 top-3 text-ink-faint" size={18} /><input autoFocus aria-label="全局搜索关键词" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(items.length - 1, value + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); } if (event.key === "Enter") { event.preventDefault(); if (items[selected]) openResult(items[selected]); else if (query.trim()) search.mutate(query.trim()); } }} placeholder="输入至少 1 个字符" className="min-h-11 w-full rounded-control border border-outline bg-surface pl-10 pr-4 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" /></div></div><div className="min-h-52 overflow-y-auto p-3">{query.trim().length < 1 ? <EmptyState title="输入关键词开始搜索" description="附件正文不会参与搜索。" /> : search.isPending ? <LoadingState label="正在搜索" /> : search.isError ? <ErrorState message={errorMessage(search.error)} onRetry={() => search.mutate(query.trim())} /> : items.length ? <div className="space-y-4">{grouped(items).map(([module, values]) => <section key={module}><h3 className="px-2 text-xs font-bold text-ink-faint">{labels[module] ?? module}</h3><div className="mt-1 space-y-1">{values.map((item) => { const index = items.indexOf(item); return <button key={`${item.module}-${item.id}`} type="button" onMouseEnter={() => setSelected(index)} onClick={() => openResult(item)} className={`w-full rounded-control px-3 py-2.5 text-left ${selected === index ? "bg-brand-50 text-brand-900" : "hover:bg-surface-muted"}`}><span className="block font-semibold text-ink">{item.title}</span><span className="mt-1 block line-clamp-2 text-xs text-ink-faint">{item.snippet}</span></button>; })}</div></section>)}</div> : <EmptyState title="没有匹配记录" description="尝试更短的关键词。" />}</div><div className="flex justify-end border-t border-outline/55 bg-surface-muted/55 px-5 py-3"><Button variant="ghost" size="sm" onClick={viewAll}>查看全部结果<ArrowRight size={15} /></Button></div></DialogContent></Dialog>;
}

export function SearchPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const storageKey = `jl-business-growth:recent-searches:${accountId}`;
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [selectedModules, setSelectedModules] = useState<string[]>(modules.map(([value]) => value));
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const search = useMutation({ mutationFn: ({ value, scopes }: { value: string; scopes: string[] }) => searchRecords(value, scopes) });
  const runFullSearch = search.mutate;
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown; if (Array.isArray(saved)) setRecentSearches(saved.filter((value): value is string => typeof value === "string").slice(0, 5)); } catch { setRecentSearches([]); } }, [storageKey]);
  useEffect(() => { const value = params.get("q")?.trim(); if (value) runFullSearch({ value, scopes: selectedModules }); }, [params, runFullSearch, selectedModules]);
  const groupedResults = useMemo(() => grouped(search.data?.data.items ?? []), [search.data]);
  const remember = (value: string) => { const next = [value, ...recentSearches.filter((item) => item !== value)].slice(0, 5); setRecentSearches(next); localStorage.setItem(storageKey, JSON.stringify(next)); };
  const runSearch = (value = query) => { const normalized = value.trim(); if (!normalized || selectedModules.length === 0) return; setQuery(normalized); setParams({ q: normalized }); remember(normalized); search.mutate({ value: normalized, scopes: selectedModules }); };
  const toggleModule = (module: string) => setSelectedModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]);
  return <div className="space-y-6"><PageHeader eyebrow="统一检索" title="全局搜索" description="搜索目标、日历、团队和学习内容（含标签）；附件正文不参与搜索。" /><Panel><form onSubmit={(event) => { event.preventDefault(); runSearch(); }}><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><Input label="搜索关键词" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" className="flex-1" /><Button type="submit" loading={search.isPending} disabled={!query.trim() || selectedModules.length === 0}><SearchIcon size={16} />搜索</Button></div><fieldset className="mt-4"><legend className="text-sm font-semibold text-slate-700">搜索范围</legend><div className="mt-2 flex flex-wrap gap-2">{modules.map(([value, label]) => <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${selectedModules.includes(value) ? "border-teal-300 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600"}`}><input type="checkbox" checked={selectedModules.includes(value)} onChange={() => toggleModule(value)} />{label}</label>)}</div></fieldset></form>{recentSearches.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">最近搜索</p><Button variant="ghost" size="sm" onClick={() => { setRecentSearches([]); localStorage.removeItem(storageKey); }}><X size={14} />清空</Button></div><div className="mt-2 flex flex-wrap gap-2">{recentSearches.map((item) => <button key={item} type="button" className="rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-800" onClick={() => runSearch(item)}>{item}</button>)}</div></div>}</Panel>{search.isError && <ErrorState message={errorMessage(search.error)} onRetry={() => runSearch()} />}{search.data && <Panel title="搜索结果" description={`共找到 ${search.data.meta.total} 条匹配记录。`}>{search.data.data.items.length === 0 ? <EmptyState title="没有匹配记录" description="尝试更短的关键词，或扩大搜索范围。" /> : <div className="space-y-6">{groupedResults.map(([module, items]) => <section key={module} aria-labelledby={`search-group-${module}`}><h2 id={`search-group-${module}`} className="mb-2 text-sm font-bold text-slate-500">{labels[module] ?? module}<span className="ml-2 font-normal">{items.length} 条</span></h2><div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{items.map((item) => <Link key={`${item.module}-${item.id}`} to={resultRoute(item)} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50"><span className="min-w-0"><strong className="block truncate text-slate-900">{item.title}</strong><span className="mt-1 block line-clamp-2 text-sm text-slate-500">{item.snippet}</span></span><ArrowRight className="shrink-0 text-slate-400" size={16} /></Link>)}</div></section>)}</div>}</Panel>}</div>;
}
