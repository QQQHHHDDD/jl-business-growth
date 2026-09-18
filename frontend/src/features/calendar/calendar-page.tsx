import type { EventContentArg, EventDropArg } from "@fullcalendar/core";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendarBase from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, MapPin, Pencil, Plus, Repeat2, Trash2, Users } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { AuthResponse, CalendarContact, CalendarEvent, CalendarEventRequest } from "@/api/client";
import { deleteCalendarContact, deleteCalendarEvent, getCalendarEvent, listCalendarContacts, listCalendarEvents, saveCalendarContact, saveCalendarEvent } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-block";
import { DataTable, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { businessDate, formatDateTimeInTimezone, zonedDateTimeToISO } from "@/lib/date";
import { errorMessage } from "@/lib/utils";

const FullCalendar = (props: ComponentProps<typeof FullCalendarBase>) => <FullCalendarBase locale={zhCnLocale} firstDay={1} {...props} />;
type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type EndType = "NEVER" | "UNTIL" | "COUNT";
type EditScope = "SERIES" | "THIS_ONLY" | "THIS_AND_FOLLOWING";
type CalendarView = "calendar" | "contacts";
type FormState = {
  title: string;
  startAt: string;
  endAt: string;
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
  attendeeEmails: string[];
  saveContact: boolean;
  contactName: string;
  editScope: EditScope;
};
type PendingCalendarChange = {
  source: CalendarEvent;
  start: Date;
  end: Date;
  allDay: boolean;
  revert: () => void;
};
type ContactForm = { name: string; email: string };

const weekdayOptions = [[1, "周一"], [2, "周二"], [3, "周三"], [4, "周四"], [5, "周五"], [6, "周六"], [0, "周日"]] as const;
const scopeOptions: Array<{ value: EditScope; label: string }> = [
  { value: "THIS_ONLY", label: "仅此日程" },
  { value: "THIS_AND_FOLLOWING", label: "此日程及之后" },
  { value: "SERIES", label: "整个系列" },
];
const initialRange = () => {
  const from = new Date();
  from.setDate(1);
  from.setMonth(from.getMonth() - 1);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 4);
  return { from: from.toISOString(), to: to.toISOString() };
};
const emptyForm = (date?: string, end?: string): FormState => ({
  title: "",
  startAt: date ? (date.includes("T") ? date : `${date}T09:00`) : "",
  endAt: end ?? (date ? `${date.slice(0, 10)}T10:00` : ""),
  allDay: false,
  description: "",
  location: "",
  recurrence: "NONE",
  interval: 1,
  weekdays: [],
  endType: "NEVER",
  recurrenceUntil: "",
  recurrenceCount: 1,
  attendee: "",
  attendeeEmails: [],
  saveContact: false,
  contactName: "",
  editScope: "SERIES",
});
const formFromEvent = (event: CalendarEvent, timezone: string): FormState => ({
  title: event.title,
  startAt: formatDateTimeInTimezone(event.start_at, timezone),
  endAt: formatDateTimeInTimezone(event.end_at, timezone),
  allDay: event.all_day,
  description: event.description ?? "",
  location: event.location_or_link ?? "",
  recurrence: event.recurrence_freq,
  interval: event.recurrence_interval,
  weekdays: event.recurrence_weekdays,
  endType: event.recurrence_end_type,
  recurrenceUntil: event.recurrence_until ? formatDateTimeInTimezone(event.recurrence_until, timezone) : "",
  recurrenceCount: event.recurrence_count ?? 1,
  attendee: "",
  attendeeEmails: event.attendees.map((attendee) => attendee.email.toLowerCase()),
  saveContact: false,
  contactName: "",
  editScope: "SERIES",
});

function dateInTimezone(value: string, timezone: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
  catch { return value.slice(0, 10); }
}

function timeInTimezone(value: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(typeof value === "string" ? new Date(value) : value);
}

function eventTooltip(event: CalendarEvent, timezone: string): string[] {
  return [
    event.title,
    event.all_day ? "全天" : `${timeInTimezone(event.start_at, timezone)} - ${timeInTimezone(event.end_at, timezone)}`,
    event.location_or_link ? `地点或链接：${event.location_or_link}` : "",
    event.description ? `描述：${event.description}` : "",
    event.attendees.length ? `受邀人：${event.attendees.map((attendee) => attendee.display_name || attendee.email).join("、")}` : "",
  ].filter(Boolean);
}

function selectionDateTime(value: string, fallback: Date, timezone: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
    ? value.slice(0, 16)
    : formatDateTimeInTimezone(fallback, timezone);
}

function CalendarEventContent({ arg, timezone }: { arg: EventContentArg; timezone: string }) {
  const event = arg.event.extendedProps.event as CalendarEvent | undefined;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const tooltipID = useId();
  const updateTooltipPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const width = Math.min(288, (window.innerWidth - 16) / zoom);
    const estimatedHeight = Math.min(320, 32 + (event ? eventTooltip(event, timezone).length : 1) * 28);
    const physicalHeight = estimatedHeight * zoom;
    const below = rect.bottom + 8 * zoom;
    const physicalTop = below + physicalHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - physicalHeight - 8 * zoom);
    const physicalLeft = Math.max(8, Math.min(rect.left, window.innerWidth - width * zoom - 8));
    setTooltipPosition({ left: physicalLeft / zoom, top: physicalTop / zoom });
  }, [event, timezone]);
  useEffect(() => {
    if (!tooltipOpen || !event) return;
    updateTooltipPosition();
    const handleViewportChange = () => updateTooltipPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [event, tooltipOpen, updateTooltipPosition]);
  if (!event) {
    return <div className="calendar-event-content min-w-0" aria-hidden="true"><span className="block truncate text-xs">{arg.timeText}</span></div>;
  }
  const details = eventTooltip(event, timezone);
  const time = event.all_day ? "全天" : `${timeInTimezone(arg.event.start ?? event.start_at, timezone)}–${timeInTimezone(arg.event.end ?? event.end_at, timezone)}`;
  const month = arg.view.type === "dayGridMonth";
  return <div ref={anchorRef} className="calendar-event-content relative min-w-0" tabIndex={0} aria-label={details.join("；")} aria-describedby={tooltipOpen ? tooltipID : undefined} onMouseEnter={() => setTooltipOpen(true)} onMouseLeave={() => setTooltipOpen(false)} onFocus={() => setTooltipOpen(true)} onBlur={(focusEvent) => { if (!focusEvent.currentTarget.contains(focusEvent.relatedTarget)) setTooltipOpen(false); }}>
    {month ? <p className="truncate text-xs"><strong>{time}</strong> {event.title}</p> : <div className="min-w-0 text-xs leading-4"><strong className="block truncate">{time}</strong><span className="block truncate font-semibold">{event.title}</span>{event.location_or_link && <span className="block truncate opacity-80">{event.location_or_link}</span>}</div>}
    {tooltipOpen && tooltipPosition && createPortal(<div id={tooltipID} role="tooltip" data-testid="calendar-event-tooltip" className="pointer-events-none fixed z-[100] max-h-[min(320px,calc(100vh-1rem))] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-700 shadow-overlay" style={{ left: tooltipPosition.left, top: tooltipPosition.top }}>
      {details.map((line, index) => <p key={`${line}-${index}`} className={index === 0 ? "font-bold text-slate-950" : "mt-1"}>{line}</p>)}
    </div>, document.body)}
  </div>;
}

export function CalendarPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const timezone = authResponse.data.account.timezone;
  const queryClient = useQueryClient();
  const range = useMemo(initialRange, []);
  const eventsQuery = useQuery({ queryKey: ["user", accountId, "calendar", range.from, range.to], queryFn: () => listCalendarEvents(range.from, range.to) });
  const contactsQuery = useQuery({ queryKey: ["user", accountId, "calendar-contacts"], queryFn: listCalendarContacts });
  const [searchParams] = useSearchParams();
  const deepLinkEventID = searchParams.get("event");
  const deepLinkQuery = useQuery({ queryKey: ["user", accountId, "calendar", "event", deepLinkEventID], queryFn: () => getCalendarEvent(deepLinkEventID!), enabled: Boolean(deepLinkEventID), retry: false });
  const [view, setView] = useState<CalendarView>("calendar");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [contactDeleteTarget, setContactDeleteTarget] = useState<CalendarContact | null>(null);
  const [contactEditor, setContactEditor] = useState<CalendarContact | "new" | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm>({ name: "", email: "" });
  const [contactSearch, setContactSearch] = useState("");
  const [pendingChange, setPendingChange] = useState<PendingCalendarChange | null>(null);
  const [pendingScope, setPendingScope] = useState<EditScope>("THIS_ONLY");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const editorReturnFocus = useRef<HTMLElement | null>(null);
  const dayReturnFocus = useRef<HTMLElement | null>(null);
  const handledDeepLink = useRef<string | null>(null);

  const closeEditor = () => { setEditorOpen(false); window.setTimeout(() => editorReturnFocus.current?.focus(), 0); };
  const closeDay = () => { setSelectedDate(null); window.setTimeout(() => dayReturnFocus.current?.focus(), 0); };
  const openNew = (date?: string, end?: string) => {
    editorReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const start = date ?? businessDate(timezone);
    setEditing(null);
    setForm(emptyForm(start, end));
    setEditorOpen(true);
  };
  const openEdit = (event: CalendarEvent) => {
    editorReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailEvent(null);
    setEditing(event);
    setForm(formFromEvent(event, timezone));
    setEditorOpen(true);
  };
  const openDay = (date: string) => { dayReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelectedDate(date); };

  useEffect(() => {
    if (!deepLinkEventID || handledDeepLink.current === deepLinkEventID || !deepLinkQuery.data) return;
    handledDeepLink.current = deepLinkEventID;
    setDetailEvent(deepLinkQuery.data.data);
  }, [deepLinkEventID, deepLinkQuery.data]);

  const contacts = contactsQuery.data?.data.items ?? [];
  const filteredContacts = contacts.filter((contact) => `${contact.name ?? ""} ${contact.email}`.toLowerCase().includes(contactSearch.trim().toLowerCase()));
  const saveMutation = useMutation({
    mutationFn: async () => {
      const attendee = form.attendee.trim().toLowerCase();
      const shouldSaveContact = form.saveContact && attendee && !contacts.some((contact) => contact.email.toLowerCase() === attendee);
      if (shouldSaveContact) await saveCalendarContact(authResponse.data.csrf_token, { email: attendee, name: form.contactName.trim() || null });
      return saveCalendarEvent(authResponse.data.csrf_token, buildRequest(form, editing, timezone), editing?.id);
    },
    onSuccess: () => {
      closeEditor();
      setEditing(null);
      setNotice("日程已保存，邀请邮件已进入当前邮件模式的投递流程。");
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar-contacts"] });
    },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const moveMutation = useMutation({
    mutationFn: async ({ change, scope }: { change: PendingCalendarChange; scope: EditScope }) => {
      let base = change.source;
      let start = change.start;
      let end = change.end;
      if (scope === "SERIES" && change.source.recurrence_freq !== "NONE") {
        base = (await getCalendarEvent(change.source.id)).data;
        start = new Date(new Date(base.start_at).getTime() + change.start.getTime() - new Date(change.source.start_at).getTime());
        end = new Date(new Date(base.end_at).getTime() + change.end.getTime() - new Date(change.source.end_at).getTime());
      }
      const movedForm = { ...formFromEvent(base, timezone), startAt: formatDateTimeInTimezone(start, timezone), endAt: formatDateTimeInTimezone(end, timezone), allDay: change.allDay, editScope: scope };
      const request = buildRequest(movedForm, change.source, timezone);
      request.edit_scope = scope;
      request.occurrence_start = change.source.original_occurrence_start ?? change.source.start_at;
      return saveCalendarEvent(authResponse.data.csrf_token, request, change.source.id);
    },
    onSuccess: () => {
      setPendingChange(null);
      setNotice("日程时间已更新。");
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar"] });
    },
    onError: (value, variables) => {
      variables.change.revert();
      setPendingChange(null);
      setError(`日程时间更新失败：${errorMessage(value)}`);
      setNotice("");
    },
  });
  const deleteMutation = useMutation({ mutationFn: () => deleteCalendarEvent(authResponse.data.csrf_token, deleteTarget!.id), onSuccess: () => { setDeleteTarget(null); setNotice("日程已删除。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar"] }); }, onError: (value) => setError(errorMessage(value)) });
  const contactMutation = useMutation({
    mutationFn: () => saveCalendarContact(authResponse.data.csrf_token, { name: contactForm.name.trim() || null, email: contactForm.email.trim().toLowerCase() }, contactEditor === "new" ? undefined : contactEditor?.id),
    onSuccess: () => { setContactEditor(null); setNotice("常用联系人已保存。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar-contacts"] }); },
    onError: (value) => { setError(errorMessage(value)); setNotice(""); },
  });
  const deleteContactMutation = useMutation({ mutationFn: () => deleteCalendarContact(authResponse.data.csrf_token, contactDeleteTarget!.id), onSuccess: () => { setContactDeleteTarget(null); setNotice("常用联系人已删除。"); setError(""); void queryClient.invalidateQueries({ queryKey: ["user", accountId, "calendar-contacts"] }); }, onError: (value) => setError(errorMessage(value)) });
  const events = eventsQuery.data?.data.items ?? [];
  const calendarEvents = events.map((event) => ({ id: event.occurrence_id, title: event.title, start: event.start_at, end: event.end_at, allDay: event.all_day, extendedProps: { event } }));
  const dayEvents = selectedDate ? events.filter((event) => dateInTimezone(event.start_at, timezone) === selectedDate) : [];

  const queueCalendarChange = (info: EventDropArg | EventResizeDoneArg) => {
    const source = info.event.extendedProps.event as CalendarEvent;
    const start = info.event.start;
    if (!start) { info.revert(); return; }
    const end = info.event.end ?? new Date(start.getTime() + new Date(source.end_at).getTime() - new Date(source.start_at).getTime());
    const change = { source, start, end, allDay: info.event.allDay, revert: info.revert };
    if (source.recurrence_freq === "NONE") moveMutation.mutate({ change, scope: "SERIES" });
    else { setPendingScope("THIS_ONLY"); setPendingChange(change); }
  };
  const cancelPendingChange = () => { pendingChange?.revert(); setPendingChange(null); };
  const openContactEditor = (contact: CalendarContact | "new") => {
    setContactEditor(contact);
    setContactForm(contact === "new" ? { name: "", email: "" } : { name: contact.name ?? "", email: contact.email });
  };

  return <div className="space-y-6">
    <PageHeader eyebrow="安排与节奏" title="日历" description="集中安排单次与重复日程，并管理常用联系人。" action={view === "calendar" ? <Button onClick={() => openNew()}><Plus size={16} />新建日程</Button> : undefined} />
    {(notice || error) && <p role={error ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{error || notice}</p>}
    <Tabs value={view} onValueChange={(value) => setView(value as CalendarView)}><TabsList aria-label="日历模块视图"><TabsTrigger value="calendar">日历</TabsTrigger><TabsTrigger value="contacts">常用联系人</TabsTrigger></TabsList></Tabs>

    {view === "calendar" ? <Panel title="日程总览" description="月视图点击日期；周、日视图可拖动选择时间段，也可拖动或缩放已有事件。">
      {eventsQuery.isPending ? <LoadingState label="正在加载日历" /> : eventsQuery.isError ? <ErrorState message="日历暂时无法加载" onRetry={() => void eventsQuery.refetch()} /> : <div className="min-w-0 overflow-x-auto"><div className="min-w-[720px]"><FullCalendar plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]} initialView="dayGridMonth" timeZone={timezone} selectable editable eventStartEditable eventDurationEditable selectMirror selectLongPressDelay={450} headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }} buttonText={{ today: "今天", month: "月", week: "周", day: "日" }} events={calendarEvents} eventContent={(arg) => <CalendarEventContent arg={arg} timezone={timezone} />} dateClick={(info) => openDay(info.dateStr.slice(0, 10))} select={(info) => {
        if (info.view.type.startsWith("timeGrid") && info.start) {
          const end = info.end ?? new Date(info.start.getTime() + 30 * 60 * 1000);
          openNew(selectionDateTime(info.startStr, info.start, timezone), selectionDateTime(info.endStr, end, timezone));
        }
      }} eventClick={(info) => setDetailEvent(info.event.extendedProps.event as CalendarEvent)} eventDrop={queueCalendarChange} eventResize={queueCalendarChange} height="min(72vh, 760px)" /></div></div>}
    </Panel> : <ContactsWorkspace contacts={filteredContacts} loading={contactsQuery.isPending} failed={contactsQuery.isError} search={contactSearch} onSearch={setContactSearch} onRetry={() => void contactsQuery.refetch()} onCreate={() => openContactEditor("new")} onEdit={openContactEditor} onDelete={setContactDeleteTarget} />}

    <Sheet open={Boolean(selectedDate)} onOpenChange={(open) => !open && closeDay()}>
      {selectedDate && <SheetContent title={selectedDate} description="当日日程" footer={<Button className="w-full" onClick={() => openNew(selectedDate)}><Plus size={16} />新建当日日程</Button>}>
        {dayEvents.length ? <div className="space-y-3">{dayEvents.map((event) => <article key={event.occurrence_id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><button type="button" className="text-left font-bold text-slate-950 hover:text-teal-800" onClick={() => setDetailEvent(event)}>{event.title}</button>{event.recurrence_freq !== "NONE" && <Repeat2 size={16} className="shrink-0 text-teal-700" />}</div><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Clock size={14} />{event.all_day ? "全天" : `${timeInTimezone(event.start_at, timezone)} - ${timeInTimezone(event.end_at, timezone)}`}</p>{event.location_or_link && <p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><MapPin size={14} />{event.location_or_link}</p>}<div className="mt-4 flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => setDetailEvent(event)}>查看</Button><Button variant="icon" size="sm" aria-label={`删除日程 ${event.title}`} onClick={() => setDeleteTarget(event)}><Trash2 size={15} /></Button></div></article>)}</div> : <EmptyState title="当天没有日程" description="可以直接为这一天添加日程。" />}
      </SheetContent>}
    </Sheet>

    <Dialog open={Boolean(detailEvent)} onOpenChange={(open) => !open && setDetailEvent(null)}>
      {detailEvent && <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{detailEvent.title}</DialogTitle><DialogDescription>日程详情</DialogDescription></DialogHeader><EventDetail event={detailEvent} timezone={timezone} /><div className="mt-6 flex justify-end gap-3"><Button variant="danger" onClick={() => { setDeleteTarget(detailEvent); setDetailEvent(null); }}><Trash2 size={16} />删除</Button><Button onClick={() => openEdit(detailEvent)}><Pencil size={16} />编辑日程</Button></div></DialogContent>}
    </Dialog>

    <Sheet open={editorOpen} onOpenChange={(open) => !open && closeEditor()}>
      <SheetContent title={editing ? "编辑日程" : "新建日程"} description="填写时间、重复规则和受邀联系人。" className="sm:w-[min(94vw,580px)]" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={closeEditor}>取消</Button><Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!form.title.trim() || !form.startAt || !form.endAt}><Check size={16} />保存日程</Button></div>}>
        <EventEditor form={form} editing={editing} contacts={contacts} onChange={setForm} />
      </SheetContent>
    </Sheet>

    <Dialog open={Boolean(pendingChange)} onOpenChange={(open) => !open && cancelPendingChange()}>
      {pendingChange && <DialogContent><DialogHeader><DialogTitle>选择修改范围</DialogTitle><DialogDescription>这是重复日程，请确认本次拖动或缩放影响哪些日程。</DialogDescription></DialogHeader><fieldset className="space-y-2"><legend className="sr-only">修改范围</legend>{scopeOptions.map((option) => <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${pendingScope === option.value ? "border-teal-500 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-700"}`}><input type="radio" name="calendar-edit-scope" value={option.value} checked={pendingScope === option.value} onChange={() => setPendingScope(option.value)} />{option.label}</label>)}</fieldset><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={cancelPendingChange}>取消</Button><Button loading={moveMutation.isPending} onClick={() => moveMutation.mutate({ change: pendingChange, scope: pendingScope })}>确认修改</Button></div></DialogContent>}
    </Dialog>

    <Dialog open={Boolean(contactEditor)} onOpenChange={(open) => !open && setContactEditor(null)}>
      {contactEditor && <DialogContent><DialogHeader><DialogTitle>{contactEditor === "new" ? "新增联系人" : "编辑联系人"}</DialogTitle><DialogDescription>联系人仅供当前账号创建日程时使用。</DialogDescription></DialogHeader><div className="space-y-4"><Input label="姓名（可选）" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} /><Input label="邮箱" type="email" required value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} /></div><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => setContactEditor(null)}>取消</Button><Button loading={contactMutation.isPending} disabled={!contactForm.email.trim()} onClick={() => contactMutation.mutate()}>保存联系人</Button></div></DialogContent>}
    </Dialog>

    <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title="确认删除日程" description={deleteTarget ? `确定删除“${deleteTarget.title}”吗？受邀人会收到取消通知。` : ""} confirmLabel="删除" loading={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} />
    <ConfirmDialog open={Boolean(contactDeleteTarget)} onOpenChange={(open) => !open && setContactDeleteTarget(null)} title="删除常用联系人" description={contactDeleteTarget ? `确定删除“${contactDeleteTarget.name || contactDeleteTarget.email}”吗？已有日程不会受到影响。` : ""} confirmLabel="删除" loading={deleteContactMutation.isPending} onConfirm={() => deleteContactMutation.mutate()} />
  </div>;
}

function ContactsWorkspace({ contacts, loading, failed, search, onSearch, onRetry, onCreate, onEdit, onDelete }: { contacts: CalendarContact[]; loading: boolean; failed: boolean; search: string; onSearch: (value: string) => void; onRetry: () => void; onCreate: () => void; onEdit: (contact: CalendarContact) => void; onDelete: (contact: CalendarContact) => void }) {
  return <Panel title="常用联系人" description="联系人仅属于当前账号，不会创建系统账号或团队成员。" action={<Button onClick={onCreate}><Plus size={16} />新增联系人</Button>}><div className="mb-5 max-w-md"><Input label="搜索姓名或邮箱" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="输入姓名或邮箱" /></div>{loading ? <LoadingState label="正在加载常用联系人" /> : failed ? <ErrorState message="常用联系人暂时无法加载" onRetry={onRetry} /> : contacts.length ? <DataTable className="min-w-[640px]"><TableHead><tr><TableCell asHeader>姓名</TableCell><TableCell asHeader>邮箱</TableCell><TableCell asHeader className="w-48 text-right">操作</TableCell></tr></TableHead><TableBody>{contacts.map((contact) => <TableRow key={contact.id}><TableCell className="font-semibold text-slate-900">{contact.name || "未填写"}</TableCell><TableCell>{contact.email}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onEdit(contact)}>编辑</Button><Button variant="icon" size="sm" aria-label={`删除联系人 ${contact.name || contact.email}`} onClick={() => onDelete(contact)}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></DataTable> : <EmptyState title={search ? "没有匹配的联系人" : "还没有常用联系人"} description={search ? "调整搜索关键词。" : "新增后可在创建日程时快速选择。"} />}</Panel>;
}

function EventDetail({ event, timezone }: { event: CalendarEvent; timezone: string }) {
  return <div className="space-y-5 text-sm"><div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2"><p className="flex items-center gap-2 text-slate-700"><Clock size={15} className="text-teal-700" />{event.all_day ? "全天" : `${formatDateTimeInTimezone(event.start_at, timezone).replace("T", " ")} 至 ${formatDateTimeInTimezone(event.end_at, timezone).replace("T", " ")}`}</p>{event.location_or_link && <p className="flex items-center gap-2 text-slate-700"><MapPin size={15} className="text-teal-700" />{event.location_or_link}</p>}{event.recurrence_freq !== "NONE" && <p className="flex items-center gap-2 text-slate-700"><Repeat2 size={15} className="text-teal-700" />重复日程</p>}{event.attendees.length > 0 && <p className="flex items-center gap-2 text-slate-700"><Users size={15} className="text-teal-700" />{event.attendees.map((attendee) => attendee.display_name || attendee.email).join("、")}</p>}</div><section><h3 className="font-bold text-slate-900">描述</h3><p className="mt-2 whitespace-pre-wrap leading-6 text-slate-600">{event.description || "未填写描述。"}</p></section></div>;
}

function EventEditor({ form, editing, contacts, onChange }: { form: FormState; editing: CalendarEvent | null; contacts: CalendarContact[]; onChange: (value: FormState) => void }) {
  const contactListID = useId();
  const [contactSearch, setContactSearch] = useState("");
  const recurring = form.recurrence !== "NONE";
  const attendee = form.attendee.trim().toLowerCase();
  const savedContact = contacts.find((contact) => contact.email.toLowerCase() === attendee);
  const filteredContacts = contacts.filter((contact) => `${contact.name ?? ""} ${contact.email}`.toLowerCase().includes(contactSearch.trim().toLowerCase()));
  const toggleAttendee = (email: string) => onChange({ ...form, attendeeEmails: form.attendeeEmails.includes(email) ? form.attendeeEmails.filter((value) => value !== email) : [...form.attendeeEmails, email] });
  return <div className="space-y-5">
    <Input label="日程标题" required value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} />
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.allDay} onChange={(event) => onChange({ ...form, allDay: event.target.checked })} />全天日程</label>
    <div className="grid gap-4 sm:grid-cols-2"><Input label="开始时间" type="datetime-local" required value={form.startAt} onChange={(event) => onChange({ ...form, startAt: event.target.value })} /><Input label="结束时间" type="datetime-local" required value={form.endAt} onChange={(event) => onChange({ ...form, endAt: event.target.value })} /></div>
    <div className="grid gap-4 sm:grid-cols-2"><Select label="重复" value={form.recurrence} onChange={(value) => onChange({ ...form, recurrence: value as Recurrence })}><option value="NONE">不重复</option><option value="DAILY">每天</option><option value="WEEKLY">每周</option><option value="MONTHLY">每月</option><option value="YEARLY">每年</option></Select>{recurring && <Input label="重复间隔" type="number" min={1} value={form.interval} onChange={(event) => onChange({ ...form, interval: Number(event.target.value) })} />}</div>
    {form.recurrence === "WEEKLY" && <fieldset><legend className="text-sm font-semibold text-slate-700">重复星期</legend><div className="mt-2 flex flex-wrap gap-2">{weekdayOptions.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.weekdays.includes(value) ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="checkbox" checked={form.weekdays.includes(value)} onChange={() => onChange({ ...form, weekdays: form.weekdays.includes(value) ? form.weekdays.filter((day) => day !== value) : [...form.weekdays, value] })} />{label}</label>)}</div></fieldset>}
    {recurring && <div className="grid gap-4 sm:grid-cols-2"><Select label="重复结束" value={form.endType} onChange={(value) => onChange({ ...form, endType: value as EndType })}><option value="NEVER">永不</option><option value="UNTIL">截止日期</option><option value="COUNT">重复次数</option></Select>{form.endType === "UNTIL" && <Input label="重复截止时间" type="datetime-local" value={form.recurrenceUntil} onChange={(event) => onChange({ ...form, recurrenceUntil: event.target.value })} />}{form.endType === "COUNT" && <Input label="重复次数" type="number" min={1} value={form.recurrenceCount} onChange={(event) => onChange({ ...form, recurrenceCount: Number(event.target.value) })} />}</div>}
    {editing && editing.recurrence_freq !== "NONE" && <Select label="修改范围" value={form.editScope} onChange={(value) => onChange({ ...form, editScope: value as EditScope })}>{scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>}
    <section className="space-y-3 border-t border-slate-200 pt-5"><h3 className="text-sm font-bold text-slate-900">受邀联系人（可选）</h3><Input label="搜索常用联系人" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="输入姓名或邮箱" />{filteredContacts.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{filteredContacts.map((contact) => <label key={contact.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${form.attendeeEmails.includes(contact.email) ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}><input type="checkbox" checked={form.attendeeEmails.includes(contact.email)} onChange={() => toggleAttendee(contact.email)} /><span className="min-w-0"><strong className="block truncate text-slate-900">{contact.name || contact.email}</strong>{contact.name && <span className="block truncate text-xs text-slate-500">{contact.email}</span>}</span></label>)}</div>}
      <Input label="新增受邀邮箱" type="email" list={contactListID} value={form.attendee} onChange={(event) => onChange({ ...form, attendee: event.target.value, saveContact: false, contactName: "" })} description="可与已选择的常用联系人一起邀请。" />
      <datalist id={contactListID}>{contacts.map((contact) => <option key={contact.id} value={contact.email}>{contact.name ?? contact.email}</option>)}</datalist>
      {attendee && !savedContact && <div className="rounded-lg border border-slate-200 p-3"><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.saveContact} onChange={(event) => onChange({ ...form, saveContact: event.target.checked })} />保存为常用联系人</label>{form.saveContact && <div className="mt-3"><Input label="联系人姓名（可选）" value={form.contactName} onChange={(event) => onChange({ ...form, contactName: event.target.value })} /></div>}</div>}
    </section>
    <Input label="地点或链接" value={form.location} onChange={(event) => onChange({ ...form, location: event.target.value })} />
    <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">描述</span><textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></label>
  </div>;
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span><select className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function buildRequest(form: FormState, editing: CalendarEvent | null, timezone: string): CalendarEventRequest {
  const attendeeEmails = [...form.attendeeEmails, form.attendee.trim().toLowerCase()].filter(Boolean).filter((email, index, values) => values.indexOf(email) === index);
  const attendees = attendeeEmails.map((email) => ({ email, display_name: null }));
  return { title: form.title.trim(), timezone, start_at: zonedDateTimeToISO(form.startAt, timezone), end_at: zonedDateTimeToISO(form.endAt, timezone), description: form.description.trim() || null, location_or_link: form.location.trim() || null, all_day: form.allDay, recurrence_freq: form.recurrence, recurrence_interval: form.interval || 1, recurrence_weekdays: form.recurrence === "WEEKLY" ? form.weekdays : [], recurrence_end_type: form.recurrence === "NONE" ? "NEVER" : form.endType, recurrence_until: form.endType === "UNTIL" && form.recurrenceUntil ? zonedDateTimeToISO(form.recurrenceUntil, timezone) : null, recurrence_count: form.endType === "COUNT" ? form.recurrenceCount : null, attendees, edit_scope: editing ? form.editScope : "SERIES", occurrence_start: editing ? editing.original_occurrence_start ?? editing.start_at : null };
}
