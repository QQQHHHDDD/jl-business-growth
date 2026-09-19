import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/state-block";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <div className="placeholder-page space-y-7"><PageHeader eyebrow="功能预告" title={title} description={description} /><EmptyState title="该功能暂未开放" description="当前页面只建立统一应用壳和页面入口，数据能力将在后续版本接入。" action={<Button asChild variant="secondary" size="sm"><Link to="/app"><ArrowLeft size={15} />返回首页</Link></Button>} /><div className="flex items-center gap-2 rounded-card border border-outline/55 bg-surface-soft/75 px-4 py-3 text-xs text-ink-faint shadow-hairline"><LockKeyhole size={14} className="text-brand-700" />页面入口已建立，数据能力将在后续版本接入。</div></div>;
}
