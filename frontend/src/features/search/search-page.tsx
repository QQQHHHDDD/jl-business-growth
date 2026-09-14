import { useMutation } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { useState } from "react";
import type { AuthResponse } from "@/api/client";
import { searchRecords } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState } from "@/components/ui/state-block";
import { errorMessage } from "@/lib/utils";

const labels: Record<string, string> = { goals: "目标", calendar: "日历", team: "团队", knowledge: "学习", tags: "标签" };

export function SearchPage({ authResponse }: { authResponse: AuthResponse }) {
  const [query, setQuery] = useState("");
  const search = useMutation({ mutationFn: () => searchRecords(query.trim()) });
  return <div className="space-y-7"><PageHeader eyebrow="统一检索" title="全局搜索" description={`在目标、日历、团队、学习内容和标签中查找 ${authResponse.data.account.username} 的记录；附件正文不会参与搜索。`} /><Panel title="查找记录"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (query.trim()) search.mutate(); }}><Input label="搜索关键词" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" className="flex-1" /><div className="flex items-end"><Button type="submit" loading={search.isPending}><SearchIcon size={16} />搜索</Button></div></form></Panel>{search.isError && <ErrorState message={errorMessage(search.error)} onRetry={() => search.mutate()} />}{search.data && <Panel title="搜索结果" description={`共找到 ${search.data.meta.total} 条匹配记录。`}>{search.data.data.items.length ? <div className="space-y-3">{search.data.data.items.map((item) => <article key={`${item.module}-${item.id}`} className="border-b border-slate-100 pb-3 last:border-0"><div className="flex items-center gap-2"><span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">{labels[item.module] ?? item.module}</span><h2 className="font-bold text-slate-900">{item.title}</h2></div><p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.snippet}</p></article>)}</div> : <EmptyState title="没有匹配记录" description="尝试更短的关键词，或先创建业务记录。" />}</Panel>}</div>;
}
