import { useMutation } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileUp, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { commitImport, createImport, deleteImport, downloadImportTemplate, exportData, type AuthResponse, type ExportFormat, type ExportType, type ImportJob, type ImportType, validateImport } from "@/api/client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { errorMessage } from "@/lib/utils";

const importTypes: { value: ImportType; label: string }[] = [{ value: "WORKLOG", label: "每日工作量" }, { value: "TURNOVER", label: "营业额历史" }, { value: "FINANCE", label: "财务流水" }, { value: "TEAM", label: "团队成员" }];
const exportTypes: { value: ExportType; label: string; formats: ExportFormat[] }[] = [{ value: "WORKLOG", label: "工作量", formats: ["csv", "xlsx"] }, { value: "TURNOVER", label: "营业额", formats: ["csv", "xlsx"] }, { value: "FINANCE", label: "财务", formats: ["csv", "xlsx"] }, { value: "TEAM", label: "团队", formats: ["csv", "xlsx"] }, { value: "KNOWLEDGE", label: "知识", formats: ["json", "markdown"] }, { value: "ACCOUNT", label: "完整账户", formats: ["zip"] }];
const steps = ["选择类型", "下载模板", "上传文件", "校验预览", "确认导入"];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DataPage({ authResponse }: { authResponse: AuthResponse }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<ImportType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [pendingType, setPendingType] = useState<ImportType | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const csrfToken = authResponse.data.csrf_token;
  const typeLabel = importTypes.find((item) => item.value === type)?.label;
  const run = async <T,>(operation: () => Promise<T>, success: (value: T) => void) => { setError(""); try { success(await operation()); } catch (value) { setError(errorMessage(value)); } };
  const downloadTemplate = () => type && void run(() => downloadImportTemplate(type), (blob) => { downloadBlob(blob, `jl-business-${type.toLowerCase()}-template.xlsx`); setNotice("模板已下载。"); });
  const uploadMutation = useMutation({ mutationFn: () => file && type ? createImport(csrfToken, type, file) : Promise.reject(new Error("请选择导入类型和 XLSX 文件")), onSuccess: (response) => { setJob(response.data); setStep(4); setNotice(response.data.invalid_count ? "文件已校验，请先修正错误行。" : "文件已校验，可以查看预览。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const validateMutation = useMutation({ mutationFn: () => validateImport(csrfToken, job!.id), onSuccess: (response) => { setJob(response.data); setNotice("文件已重新校验。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const commitMutation = useMutation({ mutationFn: () => commitImport(csrfToken, job!.id), onSuccess: (response) => { setJob(response.data); setNotice("数据已导入，临时文件已清理。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const discardMutation = useMutation({ mutationFn: () => deleteImport(csrfToken, job!.id), onSuccess: () => { setJob(null); setFile(null); setStep(3); setNotice("导入任务已丢弃。"); setError(""); }, onError: (value) => setError(errorMessage(value)) });
  const busy = uploadMutation.isPending || validateMutation.isPending || commitMutation.isPending || discardMutation.isPending;
  const applyType = (value: ImportType) => { setType(value); setFile(null); setJob(null); setNotice(""); setError(""); setStep(2); setPendingType(null); };
  const selectType = (value: ImportType) => {
    if (value === type) { setStep(2); return; }
    if (file || job) { setPendingType(value); return; }
    applyType(value);
  };

  return <div className="data-page space-y-6">
    <PageHeader eyebrow="数据治理" title="导入 / 导出" description="使用官方模板迁移结构化数据。上传和校验不会修改现有数据，只有最后确认后才会正式写入。" />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="导入步骤">{steps.map((label, index) => { const number = index + 1; const active = number === step; const complete = number < step; return <li key={label} aria-current={active ? "step" : undefined} className={`flex items-center gap-3 rounded-card border px-3 py-3 text-sm shadow-hairline ${active ? "border-brand-300 bg-brand-50 text-brand-900" : complete ? "border-brand-200 bg-surface text-brand-700" : "border-outline bg-surface text-ink-faint"}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-brand-700 text-white" : complete ? "bg-brand-100 text-brand-800" : "bg-surface-muted"}`}>{complete ? <Check size={14} /> : number}</span><span className="font-semibold">{label}</span></li>; })}</ol>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel title={`模板导入 · ${steps[step - 1]}`} description={typeLabel ? `当前类型：${typeLabel}` : "请选择本次导入的数据类型。"}>
        {step === 1 && <section aria-labelledby="import-step-1"><StepTitle number="1" title="选择类型" /><div className="mt-4 grid gap-3 sm:grid-cols-2">{importTypes.map((item) => <button key={item.value} type="button" aria-pressed={type === item.value} className={`rounded-lg border p-4 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${type === item.value ? "border-teal-500 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-800 hover:border-teal-400 hover:bg-teal-50"}`} onClick={() => selectType(item.value)}>{item.label}</button>)}</div></section>}
        {step === 2 && type && <section aria-labelledby="import-step-2"><StepTitle number="2" title="下载模板" /><p className="mt-3 text-sm text-slate-600">可下载并填写 {typeLabel} 模板；已有正确模板时可直接继续。</p><Button className="mt-4" variant="secondary" onClick={downloadTemplate}><Download size={15} />下载 {typeLabel}模板</Button><StepActions back={() => setStep(1)} next={() => setStep(3)} /></section>}
        {step === 3 && type && <section aria-labelledby="import-step-3"><StepTitle number="3" title="上传文件" /><p className="mt-3 text-sm text-slate-600">当前类型：{typeLabel}</p><label className="mt-4 block rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center"><FileSpreadsheet className="mx-auto text-teal-700" size={28} /><span className="mt-2 block text-sm font-semibold text-slate-800">选择 XLSX 文件</span>{file && <span className="mt-1 block text-xs text-teal-700">已选择：{file.name}</span>}<input aria-label="选择 XLSX 文件" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="mt-3 block w-full text-sm" onChange={(event) => { const nextFile = event.target.files?.[0] ?? null; setFile(nextFile); setJob(null); setNotice(""); setError(""); }} /></label><div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" onClick={() => setStep(2)}><ChevronLeft size={15} />上一步</Button>{job ? <Button onClick={() => setStep(4)}><ChevronRight size={15} />返回校验预览</Button> : <Button onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending} disabled={!file}><FileUp size={15} />{uploadMutation.isPending ? "处理中..." : "上传并校验"}</Button>}</div></section>}
        {step === 4 && job && <section aria-labelledby="import-step-4"><StepTitle number="4" title="校验预览" /><ImportSummary job={job} /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" onClick={() => setStep(3)}><ChevronLeft size={15} />上一步</Button><div className="flex gap-2"><Button variant="secondary" onClick={() => validateMutation.mutate()} loading={validateMutation.isPending}><RefreshCcw size={14} />重新校验</Button><Button variant="icon" aria-label="丢弃导入任务" onClick={() => discardMutation.mutate()} disabled={busy}><Trash2 size={15} /></Button><Button onClick={() => setStep(5)} disabled={job.status !== "VALIDATED" || job.invalid_count > 0}>下一步<ChevronRight size={15} /></Button></div></div></section>}
        {step === 5 && job && <section aria-labelledby="import-step-5"><StepTitle number="5" title="确认导入" /><ImportSummary job={job} compact /><div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" onClick={() => setStep(4)} disabled={job.status === "COMMITTED"}><ChevronLeft size={15} />上一步</Button>{job.status === "COMMITTED" ? <StatusBadge tone="success">导入已完成</StatusBadge> : <Button onClick={() => commitMutation.mutate()} loading={commitMutation.isPending}><Check size={15} />{commitMutation.isPending ? "处理中..." : "确认导入"}</Button>}</div></section>}
      </Panel>
      <ExportList run={run} />
    </div>
    <ConfirmDialog open={Boolean(pendingType)} onOpenChange={(open) => !open && setPendingType(null)} title="切换导入类型" description="切换类型会清除当前文件和校验预览，是否继续？" confirmLabel="切换并清除" onConfirm={() => pendingType && applyType(pendingType)} />
  </div>;
}

function ImportSummary({ job, compact = false }: { job: ImportJob; compact?: boolean }) {
  return <div className="mt-4 space-y-4"><div className="flex flex-wrap items-center gap-3"><StatusBadge tone={job.status === "VALIDATED" ? "success" : job.status === "COMMITTED" ? "info" : "danger"}>{job.status}</StatusBadge><span className="text-sm text-slate-600">共 {job.row_count} 行，通过 {job.valid_count} 行，错误 {job.invalid_count} 行</span></div>{job.warnings?.length ? <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{job.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}{!compact && job.rows.length > 0 && <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-2">行号</th><th className="px-3 py-2">数据</th><th className="px-3 py-2">校验结果</th></tr></thead><tbody>{job.rows.slice(0, 100).map((row) => <tr key={row.row_number} className="border-b border-slate-100 align-top"><td className="px-3 py-3 font-mono text-xs">{row.row_number}</td><td className="max-w-xl px-3 py-3 text-xs text-slate-600">{Object.entries(row.values).filter(([, value]) => value).map(([key, value]) => <span key={key} className="mr-3 inline-block"><strong>{key}:</strong> {value}</span>)}</td><td className="px-3 py-3 text-xs">{row.errors.length ? <span className="text-rose-700">{row.errors.join("；")}</span> : <span className="inline-flex items-center gap-1 text-teal-700"><Check size={14} />通过{row.warnings.length ? `，${row.warnings.join("；")}` : ""}</span>}</td></tr>)}</tbody></table></div>}</div>;
}

function StepActions({ back, next }: { back: () => void; next: () => void }) {
  return <div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" onClick={back}><ChevronLeft size={15} />上一步</Button><Button onClick={next}>下一步<ChevronRight size={15} /></Button></div>;
}

function ExportList({ run }: { run: <T>(operation: () => Promise<T>, success: (value: T) => void) => Promise<void> }) {
  return <Panel title="结构化导出" description="导出只包含当前账号数据；完整账户 ZIP 不含密码和登录会话。"><div className="divide-y divide-slate-100">{exportTypes.map((item) => <div key={item.value} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span className="text-sm font-semibold text-slate-800">{item.label}</span><div className="flex flex-wrap justify-end gap-2">{item.formats.map((format) => <Button key={format} variant="ghost" size="sm" onClick={() => void run(() => exportData(item.value, format), (blob) => downloadBlob(blob, `${item.value.toLowerCase()}.${format}`))}><Download size={14} />{format.toUpperCase()}</Button>)}</div></div>)}</div></Panel>;
}

function StepTitle({ number, title }: { number: string; title: string }) {
  return <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{number}</span><h2 id={`import-step-${number}`} className="font-bold text-slate-900">{title}</h2></div>;
}
