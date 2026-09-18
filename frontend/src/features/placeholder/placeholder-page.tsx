import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/state-block";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <div className="space-y-7"><PageHeader eyebrow="Coming next" title={title} description={description} /><EmptyState title="该功能暂未开放" description="当前页面只建立统一应用壳和页面入口，数据能力将在后续版本接入。" action={<Button asChild variant="secondary" size="sm"><Link to="/app"><ArrowLeft size={15} />返回首页</Link></Button>} /><div className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole size={14} className="text-teal-700" />页面入口已建立，数据能力将在后续版本接入。</div></div>;
}
