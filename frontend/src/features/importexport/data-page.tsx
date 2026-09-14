import { useMutation } from "@tanstack/react-query";
import { Check, Download, FileUp, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { commitImport, createImport, deleteImport, downloadImportTemplate, exportData, type AuthResponse, type ExportFormat, type ExportType, type ImportJob, type ImportType, validateImport } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state-block";
import { errorMessage } from "@/lib/utils";

const importTypes: { value: ImportType; label: string }[] = [
  { value: "WORKLOG", label: "每日工作量" },
  { value: "TURNOVER", label: "营业额历史" },
  { value: "FINANCE", label: "财务流水" },
  { value: "TEAM", label: "团队成员" },
];
const exportTypes: { value: ExportType; label: string; formats: ExportFormat[] }[] = [
  { value: "WORKLOG", label: "工作量", formats: ["csv", "xlsx"] },
  { value: "TURNOVER", label: "营业额", formats: ["csv", "xlsx"] },
  { value: "FINANCE", label: "财务", formats: ["csv", "xlsx"] },
  { value: "TEAM", label: "团队", formats: ["csv", "xlsx"] },
  { value: "KNOWLEDGE", label: "知识", formats: ["json", "markdown"] },
  { value: "ACCOUNT", label: "完整账户", formats: ["zip"] },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DataPage({ authResponse }: { authResponse: AuthResponse }) {
  const [type, setType] = useState<ImportType>("WORKLOG");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const csrfToken = authResponse.data.csrf_token;
  const run = async <T,>(operation: () => Promise<T>, success: (value: T) => void) => {
    setError("");
    try { success(await operation()); } catch (value) { setError(errorMessage(value)); }
  };
  const uploadMutation = useMutation({ mutationFn: () => file ? createImport(csrfToken, type, file) : Promise.reject(new Error("请选择 XLSX 文件")), onSuccess: (response) => { setJob(response.data); setNotice(response.data.invalid_count ? "文件已校验，请先修正错误行。" : "文件已校验，可以确认导入。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const validateMutation = useMutation({ mutationFn: () => validateImport(csrfToken, job!.id), onSuccess: (response) => { setJob(response.data); setNotice("文件已重新校验。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const commitMutation = useMutation({ mutationFn: () => commitImport(csrfToken, job!.id), onSuccess: (response) => { setJob(response.data); setNotice("数据已导入，临时文件已清理。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const discardMutation = useMutation({ mutationFn: () => deleteImport(csrfToken, job!.id), onSuccess: () => { setJob(null); setNotice("导入任务已丢弃。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const busy = uploadMutation.isPending || validateMutation.isPending || commitMutation.isPending || discardMutation.isPending;
  return <div className="space-y-7">
    <PageHeader eyebrow="数据治理" title="导入 / 导出" description="使用系统模板迁移结构化数据，导入确认前不会写入业务表。" action={<FileUp className="text-teal-700" size={28} aria-hidden="true" />} />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="模板导入" description="仅支持本系统下载的 XLSX 模板。">
        <div className="space-y-4">
          <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">导入类型</span><select aria-label="导入类型" className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as ImportType)}>{importTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <Button variant="secondary" size="sm" onClick={() => void run(() => downloadImportTemplate(type), (blob) => downloadBlob(blob, `jl-business-${type.toLowerCase()}-template.xlsx`))}><Download size={15} />下载模板</Button>
          <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">选择 XLSX 文件</span><input aria-label="选择 XLSX 文件" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-semibold" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <Button onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending}><FileUp size={15} />{uploadMutation.isPending ? "处理中..." : "上传并校验"}</Button>
        </div>
      </Panel>
      <Panel title="结构化导出" description="导出内容仅属于当前账号；完整账户 ZIP 不包含密码、Session 和审计日志。">
        <div className="space-y-3">{exportTypes.map((item) => <div key={item.value} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"><span className="text-sm font-semibold text-slate-800">{item.label}</span><div className="flex flex-wrap gap-2">{item.formats.map((format) => <Button key={format} variant="secondary" size="sm" onClick={() => void run(() => exportData(item.value, format), (blob) => downloadBlob(blob, `${item.value.toLowerCase()}.${format}`))}><Download size={14} />{format.toUpperCase()}</Button>)}</div></div>)}</div>
      </Panel>
    </div>
    <Panel title="导入预览" description="逐行校验通过后，明确确认才会执行事务导入。">
      {!job ? <EmptyState title="还没有导入任务" description="下载模板、填写数据并上传后，在这里查看校验预览。" /> : <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><StatusBadge tone={job.status === "VALIDATED" ? "success" : job.status === "COMMITTED" ? "info" : "danger"}>{job.status}</StatusBadge><span className="text-sm text-slate-600">共 {job.row_count} 行，通过 {job.valid_count} 行，错误 {job.invalid_count} 行</span></div><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => validateMutation.mutate()} loading={validateMutation.isPending}><RefreshCcw size={14} />重新校验</Button>{job.status !== "COMMITTED" && <Button variant="icon" size="sm" aria-label="丢弃导入任务" onClick={() => discardMutation.mutate()} disabled={busy}><Trash2 size={15} /></Button>}</div></div>{job.rows.length > 0 && <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-2">行号</th><th className="px-3 py-2">数据</th><th className="px-3 py-2">校验结果</th></tr></thead><tbody>{job.rows.slice(0, 100).map((row) => <tr key={row.row_number} className="border-b border-slate-100 align-top"><td className="px-3 py-3 font-mono text-xs">{row.row_number}</td><td className="max-w-xl px-3 py-3 text-xs text-slate-600">{Object.entries(row.values).filter(([, value]) => value).map(([key, value]) => <span key={key} className="mr-3 inline-block"><strong>{key}:</strong> {value}</span>)}</td><td className="px-3 py-3 text-xs">{row.errors.length ? <span className="text-rose-700">{row.errors.join("；")}</span> : <span className="inline-flex items-center gap-1 text-teal-700"><Check size={14} />通过</span>}</td></tr>)}</tbody></table></div>}{job.status === "VALIDATED" && job.invalid_count === 0 && <Button onClick={() => commitMutation.mutate()} loading={commitMutation.isPending}><Check size={15} />{commitMutation.isPending ? "处理中..." : "确认导入"}</Button>}</div>}
    </Panel>
  </div>;
}
