import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendarBase from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { CalendarDays, Check, Clock, MapPin, Plus, Repeat2, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type { AuthResponse, CalendarEvent, CalendarEventRequest } from "@/api/client";
import { deleteCalendarEvent, listCalendarEvents, saveCalendarEvent } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { errorMessage } from "@/lib/utils";

const FullCalendar = (props: ComponentProps<typeof FullCalendarBase>) => <FullCalendarBase locale={zhCnLocale} firstDay={1} {...props} />;
type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type EndType = "NEVER" | "UNTIL" | "COUNT";
type EditScope = "SERIES" | "THIS_ONLY" | "THIS_AND_FOLLOWING";
type FormState = {
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  allDay: boolean;
  description: string;
  location: string;
  recurrence: Recurrence;
  interval: number;
  weekdays: number[];
  endType: EndType;
  recurrenceUntil: string;
  recurrenceCount: number;
  attendee: string;
  editScope: EditScope;
};

const weekdayOptions = [[1, "周一"], [2, "周二"], [3, "周三"], [4, "周四"], [5, "周五"], [6, "周六"], [0, "周日"]] as const;
const initialRange = () => { const from = new Date(); from.setDate(1); from.setMonth(from.getMonth() - 1); const to = new Date(from); to.setMonth(to.getMonth() + 4); return { from: from.toISOString(), to: to.toISOString() }; };
const localValue = (value: string) => { const date = new Date(value); const pad = (part: number) => String(part).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const isoValue = (value: string) => new Date(value).toISOString();
const emptyForm = (timezone: string, date?: string): FormState => ({ title: "", startAt: date ? `${date}T09:00` : "", endAt: date ? `${date}T10:00` : "", timezone, allDay: false, description: "", location: "", recurrence: "NONE", interval: 1, weekdays: [], endType: "NEVER", recurrenceUntil: "", recurrenceCount: 1, attendee: "", editScope: "SERIES" });
const formFromEvent = (event: CalendarEvent): FormState => ({ title: event.title, startAt: localValue(event.start_at), endAt: localValue(event.end_at), timezone: event.timezone, allDay: event.all_day, description: event.description ?? "", location: event.location_or_link ?? "", recurrence: event.recurrence_freq, interval: event.recurrence_interval, weekdays: event.recurrence_weekdays, endType: event.recurrence_end_type, recurrenceUntil: event.recurrence_until ? localValue(event.recurrence_until) : "", recurrenceCount: event.recurrence_count ?? 1, attendee: event.attendees[0]?.email ?? "", editScope: "SERIES" });

function dateInTimezone(value: string, timezone: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
  catch { return value.slice(0, 10); }
}

export function CalendarPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const timezone = authResponse.data.account.timezone;
  const queryClient = useQueryClient();
  const range = useMemo(initialRange, []);
  const eventsQuery = useQuery({ queryKey: ["user", accountId, "calendar", range.from, range.to], queryFn: () => listCalendarEvents(range.from, range.to) });
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(timezone));
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const editorReturnFocus = useRef<HTMLElement | null>(null);
  const dayReturnFocus = useRef<HTMLElement | null>(null);

  const closeEditor = () => { setEditorOpen(false); window.setTimeout(() => editorReturnFocus.current?.focus(), 0); };
  const closeDay = () => { setSelectedDate(null); window.setTimeout(() => dayReturnFocus.current?.focus(), 0); };
  const openNew = (date?: string) => { editorReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setEditing(null); setForm(emptyForm(timezone, date)); setEditorOpen(true); };
  const openEdit = (event: CalendarEvent) => { editorReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setEditing(event); setForm(formFromEvent(event)); setEditorOpen(true); };
  const openDay = (date: string) => { dayReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelectedDate(date); };

  const saveMutation = useMutation({
    mutationFn: () => saveCalendarEvent(authResponse.data.csrf_token, buildRequest(form, editing), editing?.id),
    onSuccess: () => { closeEditor(); setEditing(null); setNotice("日程已保存，邀请邮件已进入当前邮件模式的投递流程。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar"] }); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const deleteMutation = useMutation({ mutationFn: () => deleteCalendarEvent(authResponse.data.csrf_token, deleteTarget!.id), onSuccess: () => { setDeleteTarget(null); setNotice("日程已删除。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar"] }); }, onError: (value) => setError(errorMessage(value)) });
  const events = eventsQuery.data?.data.items ?? [];
  const calendarEvents = events.map((event) => ({ id: event.occurrence_id, title: event.title, start: event.start_at, end: event.end_at, allDay: event.all_day, extendedProps: { event } }));
  const dayEvents = selectedDate ? events.filter((event) => dateInTimezone(event.start_at, timezone) === selectedDate) : [];

  return <div className="space-y-6">
    <PageHeader eyebrow="安排与节奏" title="日历" description="按事件自身的 IANA 时区保存日程，重复规则会在该时区内展开。" action={<Button onClick={() => openNew()}><Plus size={16} />新建日程</Button>} />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <Panel title="日程总览" description="月、周、日视图共享同一组真实事件数据；点击日期查看当天详情。" action={<span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><CalendarDays size={15} className="text-teal-700" />{timezone}</span>}>
      {eventsQuery.isPending ? <LoadingState label="正在加载日历" /> : eventsQuery.isError ? <ErrorState message="日历暂时无法加载" onRetry={() => void eventsQuery.refetch()} /> : <div className="min-w-0 overflow-x-auto"><div className="min-w-[720px]"><FullCalendar plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]} initialView="dayGridMonth" headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }} buttonText={{ today: "今天", month: "月", week: "周", day: "日" }} events={calendarEvents} dateClick={(info) => openDay(info.dateStr.slice(0, 10))} eventClick={(info) => openEdit(info.event.extendedProps.event as CalendarEvent)} height="min(72vh, 760px)" /></div></div>}
    </Panel>

    <Sheet open={Boolean(selectedDate)} onOpenChange={(open) => !open && closeDay()}>
      {selectedDate && <SheetContent title={selectedDate} description={`${timezone} · 当日日程`} footer={<Button className="w-full" onClick={() => openNew(selectedDate)}><Plus size={16} />新建当日日程</Button>}>
        {dayEvents.length ? <div className="space-y-3">{dayEvents.map((event) => <article key={event.occurrence_id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><button type="button" className="text-left font-bold text-slate-950 hover:text-teal-800" onClick={() => openEdit(event)}>{event.title}</button>{event.recurrence_freq !== "NONE" && <Repeat2 size={16} className="shrink-0 text-teal-700" />}</div><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Clock size={14} />{event.all_day ? "全天" : `${new Date(event.start_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} - ${new Date(event.end_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`}</p>{event.location_or_link && <p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><MapPin size={14} />{event.location_or_link}</p>}<div className="mt-4 flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => openEdit(event)}>编辑</Button><Button variant="icon" size="sm" aria-label={`删除日程 ${event.title}`} onClick={() => setDeleteTarget(event)}><Trash2 size={15} /></Button></div></article>)}</div> : <EmptyState title="当天没有日程" description="可以直接为这一天添加日程。" />}
      </SheetContent>}
    </Sheet>

    <Sheet open={editorOpen} onOpenChange={(open) => !open && closeEditor()}>
      <SheetContent title={editing ? "编辑日程" : "新建日程"} description="受邀邮箱会收到符合当前 MAIL_MODE 的 ICS 日历邀请。" className="sm:w-[min(94vw,580px)]" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={closeEditor}>取消</Button><Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!form.title.trim() || !form.startAt || !form.endAt || !form.timezone.trim()}><Check size={16} />{saveMutation.isPending ? "处理中..." : "保存日程"}</Button></div>}>
        <EventEditor form={form} editing={editing} onChange={setForm} />
      </SheetContent>
    </Sheet>
    <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title="确认删除日程" description={deleteTarget ? `确定删除“${deleteTarget.title}”吗？受邀人会收到取消通知。` : ""} confirmLabel="删除" loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} />
  </div>;
}

function EventEditor({ form, editing, onChange }: { form: FormState; editing: CalendarEvent | null; onChange: (value: FormState) => void }) {
  const recurring = form.recurrence !== "NONE";
  return <div className="space-y-5"><Input label="日程标题" required value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} /><label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.allDay} onChange={(event) => onChange({ ...form, allDay: event.target.checked })} />全天日程</label><div className="grid gap-4 sm:grid-cols-2"><Input label="开始时间" type="datetime-local" required value={form.startAt} onChange={(event) => onChange({ ...form, startAt: event.target.value })} /><Input label="结束时间" type="datetime-local" required value={form.endAt} onChange={(event) => onChange({ ...form, endAt: event.target.value })} /></div><Input label="事件时区" required value={form.timezone} onChange={(event) => onChange({ ...form, timezone: event.target.value })} placeholder="Asia/Shanghai" /><div className="grid gap-4 sm:grid-cols-2"><Select label="重复" value={form.recurrence} onChange={(value) => onChange({ ...form, recurrence: value as Recurrence })}><option value="NONE">不重复</option><option value="DAILY">每天</option><option value="WEEKLY">每周</option><option value="MONTHLY">每月</option><option value="YEARLY">每年</option></Select>{recurring && <Input label="重复间隔" type="number" min={1} value={form.interval} onChange={(event) => onChange({ ...form, interval: Number(event.target.value) })} />}</div>{form.recurrence === "WEEKLY" && <fieldset><legend className="text-sm font-semibold text-slate-700">重复星期</legend><div className="mt-2 flex flex-wrap gap-2">{weekdayOptions.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.weekdays.includes(value) ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="checkbox" checked={form.weekdays.includes(value)} onChange={() => onChange({ ...form, weekdays: form.weekdays.includes(value) ? form.weekdays.filter((day) => day !== value) : [...form.weekdays, value] })} />{label}</label>)}</div></fieldset>}{recurring && <div className="grid gap-4 sm:grid-cols-2"><Select label="重复结束" value={form.endType} onChange={(value) => onChange({ ...form, endType: value as EndType })}><option value="NEVER">永不</option><option value="UNTIL">截止日期</option><option value="COUNT">重复次数</option></Select>{form.endType === "UNTIL" && <Input label="重复截止时间" type="datetime-local" value={form.recurrenceUntil} onChange={(event) => onChange({ ...form, recurrenceUntil: event.target.value })} />}{form.endType === "COUNT" && <Input label="重复次数" type="number" min={1} value={form.recurrenceCount} onChange={(event) => onChange({ ...form, recurrenceCount: Number(event.target.value) })} />}</div>}{editing && editing.recurrence_freq !== "NONE" && <Select label="修改范围" value={form.editScope} onChange={(value) => onChange({ ...form, editScope: value as EditScope })}><option value="THIS_ONLY">仅本次</option><option value="THIS_AND_FOLLOWING">本次及以后</option><option value="SERIES">整个系列</option></Select>}<Input label="受邀邮箱（可选）" type="email" value={form.attendee} onChange={(event) => onChange({ ...form, attendee: event.target.value })} /><Input label="地点或链接" value={form.location} onChange={(event) => onChange({ ...form, location: event.target.value })} /><label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">描述</span><textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></label></div>;
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span><select className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function buildRequest(form: FormState, editing: CalendarEvent | null): CalendarEventRequest {
  const attendees = form.attendee.trim() ? [{ email: form.attendee.trim(), display_name: null }] : [];
  return { title: form.title.trim(), timezone: form.timezone.trim(), start_at: isoValue(form.startAt), end_at: isoValue(form.endAt), description: form.description.trim() || null, location_or_link: form.location.trim() || null, all_day: form.allDay, recurrence_freq: form.recurrence, recurrence_interval: form.interval || 1, recurrence_weekdays: form.recurrence === "WEEKLY" ? form.weekdays : [], recurrence_end_type: form.recurrence === "NONE" ? "NEVER" : form.endType, recurrence_until: form.endType === "UNTIL" && form.recurrenceUntil ? isoValue(form.recurrenceUntil) : null, recurrence_count: form.endType === "COUNT" ? form.recurrenceCount : null, attendees, edit_scope: editing ? form.editScope : "SERIES", occurrence_start: editing ? editing.original_occurrence_start ?? editing.start_at : null };
}
