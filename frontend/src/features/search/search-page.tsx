import { useMutation } from "@tanstack/react-query";
import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuthResponse, SearchResult } from "@/api/client";
import { searchRecords } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState } from "@/components/ui/state-block";
import { errorMessage } from "@/lib/utils";

const modules = [["goals", "目标"], ["calendar", "日历"], ["team", "团队"], ["knowledge", "学习"], ["tags", "标签"]] as const;
const labels = Object.fromEntries(modules) as Record<string, string>;

export function SearchPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const storageKey = `jl-business-growth:recent-searches:${accountId}`;
  const [query, setQuery] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>(modules.map(([value]) => value));
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const search = useMutation({ mutationFn: ({ value, scopes }: { value: string; scopes: string[] }) => searchRecords(value, scopes) });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
      if (Array.isArray(saved)) setRecentSearches(saved.filter((value): value is string => typeof value === "string").slice(0, 5));
    } catch {
      setRecentSearches([]);
    }
  }, [storageKey]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    search.data?.data.items.forEach((item) => groups.set(item.module, [...(groups.get(item.module) ?? []), item]));
    return [...groups.entries()];
  }, [search.data]);

  const remember = (value: string) => {
    const next = [value, ...recentSearches.filter((item) => item !== value)].slice(0, 5);
    setRecentSearches(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };
  const runSearch = (value = query) => {
    const normalized = value.trim();
    if (!normalized || selectedModules.length === 0) return;
    setQuery(normalized);
    remember(normalized);
    search.mutate({ value: normalized, scopes: selectedModules });
  };
  const toggleModule = (module: string) => setSelectedModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]);

  return <div className="space-y-7">
    <PageHeader eyebrow="统一检索" title="全局搜索" description={`在目标、日历、团队、学习内容和标签中查找 ${authResponse.data.account.username} 的记录；附件正文不会参与搜索。`} />
    <Panel title="查找记录" description="选择搜索范围后，结果会按模块分组展示。">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><Input label="搜索关键词" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" className="flex-1" /><Button type="submit" loading={search.isPending} disabled={!query.trim() || selectedModules.length === 0}><SearchIcon size={16} />搜索</Button></div>
        <fieldset><legend className="text-sm font-semibold text-slate-700">搜索范围</legend><div className="mt-2 flex flex-wrap gap-2">{modules.map(([value, label]) => <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${selectedModules.includes(value) ? "border-teal-300 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600"}`}><input type="checkbox" checked={selectedModules.includes(value)} onChange={() => toggleModule(value)} />{label}</label>)}</div>{selectedModules.length === 0 && <p className="mt-2 text-sm text-rose-700">至少选择一个搜索范围。</p>}</fieldset>
      </form>
      {recentSearches.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">最近搜索</p><Button variant="ghost" size="sm" onClick={() => { setRecentSearches([]); localStorage.removeItem(storageKey); }}><X size={14} />清空</Button></div><div className="mt-2 flex flex-wrap gap-2">{recentSearches.map((item) => <button key={item} type="button" className="rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-800" onClick={() => runSearch(item)}>{item}</button>)}</div></div>}
    </Panel>
    {search.isError && <ErrorState message={errorMessage(search.error)} onRetry={() => runSearch()} />}
    {search.data && <Panel title="搜索结果" description={`共找到 ${search.data.meta.total} 条匹配记录。`}>
      {search.data.data.items.length === 0 ? <EmptyState title="没有匹配记录" description="尝试更短的关键词，或扩大搜索范围。" /> : <div className="space-y-6">{groupedResults.map(([module, items]) => <section key={module} aria-labelledby={`search-group-${module}`}><h2 id={`search-group-${module}`} className="mb-3 text-base font-bold text-slate-900">{labels[module] ?? module}<span className="ml-2 text-xs font-normal text-slate-500">{items.length} 条</span></h2><div className="space-y-3">{items.map((item) => <article key={`${item.module}-${item.id}`} className="border-b border-slate-100 pb-3 last:border-0"><h3 className="font-bold text-slate-900">{item.title}</h3><p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.snippet}</p></article>)}</div></section>)}</div>}
    </Panel>}
  </div>;
}
