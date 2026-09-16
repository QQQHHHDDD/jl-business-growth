import { Info } from "lucide-react";

export function TermHelp({ term, description }: { term: string; description: string }) {
  return <span className="ml-1 inline-flex align-middle text-slate-400" title={`${term}：${description}`} aria-label={`${term}说明`} role="img"><Info size={14} /></span>;
}
