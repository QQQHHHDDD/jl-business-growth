import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  FolderPlus,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  deleteCommunicationFriendRecord,
  deleteCommunicationScript,
  deleteCommunicationScriptCategory,
  listCommunicationFriendRecords,
  listCommunicationScriptCategories,
  listCommunicationScripts,
  saveCommunicationFriendRecord,
  saveCommunicationScript,
  saveCommunicationScriptCategory,
  toggleCommunicationScriptFavorite,
  updateCommunicationFriendProgress,
  type AuthResponse,
  type CommunicationFriendRecord,
  type CommunicationScript,
  type CommunicationScriptCategory,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/state-block";
import { Notice } from "@/components/ui/notice";
import { FormLabel } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { copyText } from "@/lib/copy";
import { cn, errorMessage, formatDate } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "friends" | "scripts";
const textareaClass =
  "min-h-24 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";
type PageMeta = { page: number; page_size: number; total: number };
type FriendQueryState = {
  data?: { data: { items: CommunicationFriendRecord[] }; meta: PageMeta };
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};
type ScriptQueryState = {
  data?: { data: { items: CommunicationScript[] }; meta: PageMeta };
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  const inputId = useId();
  return (
    <div className="block space-y-1.5 text-sm font-semibold text-ink-muted">
      <FormLabel required={required} htmlFor={inputId}>{label}</FormLabel>
      {multiline ? (
        <textarea
          id={inputId}
          className={textareaClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
        />
      ) : (
        <input
          id={inputId}
          className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
        />
      )}
    </div>
  );
}

function DirectionBadge({
  direction,
}: {
  direction: CommunicationFriendRecord["add_direction"];
}) {
  const isReverse = direction === "REVERSE";
  return (
    <StatusBadge
      tone="info"
      className="gap-1.5 px-2 py-1"
      aria-label={isReverse ? "逆序，向上添加" : "顺序，向下添加"}
    >
      {isReverse ? (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-100 text-sky-700">
          <ArrowUp size={17} strokeWidth={2.7} aria-hidden="true" />
        </span>
      ) : (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-brand-700">
          <ArrowDown size={17} strokeWidth={2.7} aria-hidden="true" />
        </span>
      )}
      <span>{isReverse ? "逆序" : "顺序"}</span>
    </StatusBadge>
  );
}

type OverflowMenuItem = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
};

function OverflowMenu({ items }: { items: OverflowMenuItem[] }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width ?? 144;
      const menuHeight = menuRect?.height ?? 96;
      const edge = 12;
      const gap = 8;
      const opensUpward =
        triggerRect.bottom + gap + menuHeight > window.innerHeight &&
        triggerRect.top - gap - menuHeight >= edge;
      const top = opensUpward
        ? triggerRect.top - gap - menuHeight
        : triggerRect.bottom + gap;
      const left = Math.min(
        Math.max(edge, triggerRect.right - menuWidth),
        Math.max(edge, window.innerWidth - menuWidth - edge),
      );
      setMenuPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[1000] min-w-28 rounded-control border border-outline/80 bg-surface p-1 text-left shadow-overlay"
      style={
        menuPosition
          ? { top: menuPosition.top, left: menuPosition.left }
          : { top: 0, left: 0, visibility: "hidden" }
      }
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={cn(
            "flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm",
            item.danger
              ? "text-rose-700 hover:bg-rose-50"
              : "text-ink-muted hover:bg-surface-muted hover:text-ink",
          )}
          onClick={() => runAction(item.onSelect)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-control text-ink-muted transition hover:bg-surface-muted/75 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setMenuPosition(null);
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}

function FriendRecordMenu({
  item,
  onEdit,
  onArchive,
  onDelete,
}: {
  item: CommunicationFriendRecord;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <OverflowMenu
      items={[
        { label: "编辑", icon: <Edit3 size={15} />, onSelect: onEdit },
        {
          label: item.archived ? "恢复" : "归档",
          icon: item.archived ? <RotateCcw size={15} /> : <Archive size={15} />,
          onSelect: onArchive,
        },
        { label: "删除", icon: <Trash2 size={15} />, onSelect: onDelete, danger: true },
      ]}
    />
  );
}

function ScriptMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <OverflowMenu
      items={[
        { label: "编辑", icon: <Edit3 size={15} />, onSelect: onEdit },
        { label: "删除", icon: <Trash2 size={15} />, onSelect: onDelete, danger: true },
      ]}
    />
  );
}

function FriendDialog({
  open,
  onOpenChange,
  csrfToken,
  record,
  template,
  templateLoading,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csrfToken: string;
  record?: CommunicationFriendRecord | null;
  template?: CommunicationFriendRecord | null;
  templateLoading?: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    platform: record?.platform ?? "",
    account_label: record?.account_label ?? "",
    group_name: record?.group_name ?? "",
    add_direction: record?.add_direction ?? "FORWARD",
    last_applied_person: record?.last_applied_person ?? "",
    application_script: record?.application_script ?? "",
    first_message: record?.first_message ?? "",
    note: record?.note ?? "",
    archived: record?.archived ?? false,
  });
  useEffect(() => {
    setForm({
      platform: record?.platform ?? "",
      account_label: record?.account_label ?? "",
      group_name: record?.group_name ?? "",
      add_direction: record?.add_direction ?? "FORWARD",
      last_applied_person: record?.last_applied_person ?? "",
      application_script: record?.application_script ?? "",
      first_message: record?.first_message ?? "",
      note: record?.note ?? "",
      archived: record?.archived ?? false,
    });
  }, [record]);
  const mutation = useMutation({
    mutationFn: () =>
      saveCommunicationFriendRecord(csrfToken, form as never, record?.id),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: () => undefined,
  });
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const applyTemplate = () => {
    if (!template) return;
    const hasFormContent = [
      form.platform,
      form.account_label,
      form.group_name,
      form.application_script,
      form.first_message,
      form.note,
    ].some((value) => value.trim().length > 0);
    if (
      hasFormContent &&
      !window.confirm("当前表单已有内容，是否用上一个记录覆盖？")
    ) {
      return;
    }
    setForm({
      platform: template.platform,
      account_label: template.account_label,
      group_name: template.group_name,
      add_direction: template.add_direction,
      last_applied_person: "",
      application_script: template.application_script,
      first_message: template.first_message,
      note: template.note,
      archived: false,
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden p-0">
        <div className="shrink-0 px-6 pt-6">
          <DialogHeader>
            <DialogTitle>
              {record ? "编辑加好友记录" : "新增加好友记录"}
            </DialogTitle>
            <DialogDescription>
              每个账号和群独立记录，申请话术不会关联话术库。
            </DialogDescription>
            {!record && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-control border border-outline/70 bg-surface-muted/40 px-3 py-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!template || templateLoading}
                  onClick={applyTemplate}
                >
                  <Copy size={15} />
                  {templateLoading
                    ? "正在读取最近记录"
                    : template
                      ? "填入上一个记录"
                      : "暂无可复用记录"}
                </Button>
                <span className="text-xs text-ink-faint">
                  仅填入最近更新的记录，不会带入“最后申请的人”。
                </span>
              </div>
            )}
          </DialogHeader>
        </div>
        <div data-testid="communication-dialog-scroll" className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pr-4 [scrollbar-gutter:stable]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="平台"
              value={form.platform}
              onChange={(v) => set("platform", v)}
              placeholder="微信、QQ 或其他平台"
              required
            />
            <Field
              label="账号"
              value={form.account_label}
              onChange={(v) => set("account_label", v)}
              required
            />
            <Field
              label="群名称"
              value={form.group_name}
              onChange={(v) => set("group_name", v)}
              required
            />
            <div className="block space-y-1.5 text-sm font-semibold text-ink-muted">
              <FormLabel>添加方向</FormLabel>
              <select
                className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm"
                value={form.add_direction}
                onChange={(event) => set("add_direction", event.target.value)}
              >
                <option value="FORWARD">顺序</option>
                <option value="REVERSE">逆序</option>
              </select>
            </div>
            <Field
              label="最后申请的人"
              value={form.last_applied_person}
              onChange={(v) => set("last_applied_person", v)}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={form.archived}
                onChange={(event) => set("archived", event.target.checked)}
              />
              归档此记录
            </label>
          </div>
          <div className="mt-4 grid gap-4">
            <Field
              label="好友申请话术"
              value={form.application_script}
              onChange={(v) => set("application_script", v)}
              multiline
            />
            <Field
              label="通过后第一句话"
              value={form.first_message}
              onChange={(v) => set("first_message", v)}
              multiline
            />
            <Field
              label="备注"
              value={form.note}
              onChange={(v) => set("note", v)}
              multiline
            />
          </div>
          {mutation.isError && (
            <Notice tone="danger" className="mt-4">
              {errorMessage(mutation.error)}
            </Notice>
          )}
        </div>
        <div data-testid="communication-dialog-footer" className="flex shrink-0 justify-end gap-3 border-t border-outline/70 bg-surface px-6 py-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            保存记录
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProgressDialog({
  record,
  csrfToken,
  onOpenChange,
  onSaved,
}: {
  record: CommunicationFriendRecord;
  csrfToken: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<"FORWARD" | "REVERSE">(
    record.add_direction,
  );
  const [person, setPerson] = useState(record.last_applied_person);
  const [note, setNote] = useState(record.note);
  const mutation = useMutation({
    mutationFn: () =>
      updateCommunicationFriendProgress(csrfToken, record.id, {
        add_direction: direction,
        last_applied_person: person,
        note,
      }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
  });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>更新最新进度</DialogTitle>
          <DialogDescription>
            {record.platform} · {record.account_label} · {record.group_name}
            。此操作只更新方向、最后申请的人和备注。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="block space-y-1.5 text-sm font-semibold text-ink-muted">
            <FormLabel>添加方向</FormLabel>
            <select
              className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm"
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as "FORWARD" | "REVERSE")
              }
            >
              <option value="FORWARD">顺序</option>
              <option value="REVERSE">逆序</option>
            </select>
          </div>
          <Field label="最后申请的人" value={person} onChange={setPerson} />
          <Field label="备注" value={note} onChange={setNote} multiline />
        </div>
        {mutation.isError && (
          <Notice tone="danger" className="mt-4">
            {errorMessage(mutation.error)}
          </Notice>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            更新进度
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScriptDialog({
  open,
  onOpenChange,
  csrfToken,
  script,
  initialCategoryId,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csrfToken: string;
  script?: CommunicationScript | null;
  initialCategoryId?: string;
  categories: CommunicationScriptCategory[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(script?.title ?? "");
  const [type, setType] = useState<"STAGE" | "FAQ">(
    script?.script_type ?? "STAGE",
  );
  const [categoryId, setCategoryId] = useState(
    script?.category_id ?? initialCategoryId ?? "",
  );
  const [tags, setTags] = useState(script?.tags.join(", ") ?? "");
  const [note, setNote] = useState(script?.note ?? "");
  const [paragraphs, setParagraphs] = useState(
    script?.paragraphs.length ? script.paragraphs : [""],
  );
  const mutation = useMutation({
    mutationFn: () =>
      saveCommunicationScript(
        csrfToken,
        {
          title,
          script_type: type,
          category_id: categoryId || null,
          tags: tags
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          paragraphs,
          note,
        },
        script?.id,
      ),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: () => undefined,
  });
  const updateParagraph = (index: number, value: string) =>
    setParagraphs((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden p-0">
        <div className="shrink-0 px-6 pt-6">
          <DialogHeader>
            <DialogTitle>{script ? "编辑话术" : "新增话术"}</DialogTitle>
            <DialogDescription>
              正文按纯文本保存；复制全部时会按段落顺序用空行连接。
            </DialogDescription>
          </DialogHeader>
        </div>
        <div data-testid="communication-dialog-scroll" className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pr-4 [scrollbar-gutter:stable]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="标题" value={title} onChange={setTitle} required />
            <div className="block space-y-1.5 text-sm font-semibold text-ink-muted">
              <FormLabel>类型</FormLabel>
              <select
                className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as "STAGE" | "FAQ")
                }
              >
                <option value="STAGE">阶段话术</option>
                <option value="FAQ">常见问题</option>
              </select>
            </div>
            <div className="block space-y-1.5 text-sm font-semibold text-ink-muted">
              <FormLabel>分类</FormLabel>
              <select
                className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">未分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <Field label="标签（逗号分隔）" value={tags} onChange={setTags} />
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <FormLabel required>正文段落</FormLabel>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setParagraphs((items) => [...items, ""])}
              >
                <Plus size={15} />
                添加段落
              </Button>
            </div>
            {paragraphs.map((paragraph, index) => (
              <div
                key={index}
                className="rounded-card border border-outline/75 bg-surface-soft/55 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink-muted">
                    第 {index + 1} 段
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="icon"
                      size="sm"
                      title="上移"
                      aria-label={`上移第 ${index + 1} 段`}
                      disabled={index === 0}
                      onClick={() =>
                        setParagraphs((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index - 1
                              ? items[index]
                              : itemIndex === index
                                ? items[index - 1]
                                : item,
                          ),
                        )
                      }
                    >
                      <ChevronUp size={15} />
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      title="下移"
                      aria-label={`下移第 ${index + 1} 段`}
                      disabled={index === paragraphs.length - 1}
                      onClick={() =>
                        setParagraphs((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? items[index + 1]
                              : itemIndex === index + 1
                                ? items[index]
                                : item,
                          ),
                        )
                      }
                    >
                      <ChevronDown size={15} />
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      title="删除"
                      aria-label={`删除第 ${index + 1} 段`}
                      disabled={paragraphs.length === 1}
                      onClick={() =>
                        setParagraphs((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
                <textarea
                  className={textareaClass}
                  value={paragraph}
                  onChange={(event) => updateParagraph(index, event.target.value)}
                  placeholder={`第 ${index + 1} 段`}
                  required={index === 0}
                />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Field label="使用备注" value={note} onChange={setNote} multiline />
          </div>
          {mutation.isError && (
            <Notice tone="danger" className="mt-4">
              {errorMessage(mutation.error)}
            </Notice>
          )}
        </div>
        <div data-testid="communication-dialog-footer" className="flex shrink-0 justify-end gap-3 border-t border-outline/70 bg-surface px-6 py-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            保存话术
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommunicationPage({
  authResponse,
}: {
  authResponse: AuthResponse;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab =
    searchParams.get("tab") === "scripts" ? "scripts" : "friends";
  const q = searchParams.get("q") ?? "";
  const [archived, setArchived] = useState(false);
  const [friendPlatform, setFriendPlatform] = useState("");
  const [friendAccount, setFriendAccount] = useState("");
  const [friendPage, setFriendPage] = useState(1);
  const scriptTypeParam = searchParams.get("script_type");
  const scriptType: "" | "STAGE" | "FAQ" =
    scriptTypeParam === "STAGE" || scriptTypeParam === "FAQ"
      ? scriptTypeParam
      : "";
  const scriptCategory = searchParams.get("category") ?? "";
  const favoritesOnly = searchParams.get("favorite") === "true";
  const parsedScriptPage = Number(searchParams.get("script_page") ?? "1");
  const scriptPage = Number.isInteger(parsedScriptPage) && parsedScriptPage > 0
    ? parsedScriptPage
    : 1;
  const [friendDialog, setFriendDialog] = useState<
    CommunicationFriendRecord | null | undefined
  >();
  const [progressDialog, setProgressDialog] =
    useState<CommunicationFriendRecord | null>(null);
  const [scriptDialog, setScriptDialog] = useState<
    CommunicationScript | null | undefined
  >();
  const [newScriptCategoryId, setNewScriptCategoryId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "friend" | "script";
    id: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const queryClient = useQueryClient();
  const csrf = authResponse.data.csrf_token;
  const updateSearchParams = (updates: Record<string, string | undefined>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(updates).forEach(([key, value]) => {
          if (!value) next.delete(key);
          else next.set(key, value);
        });
        return next;
      },
      { replace: true },
    );
  };
  const setScriptPage = (value: number) => {
    updateSearchParams({ script_page: value > 1 ? String(value) : undefined });
  };
  const setQ = (value: string) => {
    updateSearchParams({ q: value, script_page: undefined });
  };
  const setScriptType = (value: "" | "STAGE" | "FAQ") => {
    updateSearchParams({ script_type: value, script_page: undefined });
  };
  const setScriptCategory = (value: string) => {
    updateSearchParams({ category: value, script_page: undefined });
  };
  const setFavoritesOnly = (value: boolean) => {
    updateSearchParams({
      favorite: value ? "true" : undefined,
      script_page: undefined,
    });
  };
  const friendsQuery = useQuery({
    queryKey: [
      "communication",
      "friends",
      q,
      archived,
      friendPlatform,
      friendAccount,
      friendPage,
    ],
    queryFn: () =>
      listCommunicationFriendRecords({
        q,
        archived,
        platform: friendPlatform,
        account: friendAccount,
        page: friendPage,
      }),
    enabled: tab === "friends",
  });
  const latestFriendQuery = useQuery({
    queryKey: ["communication", "friends", "latest-template"],
    queryFn: () => listCommunicationFriendRecords({ page: 1, pageSize: 1 }),
    enabled: friendDialog === null,
  });
  const categoriesQuery = useQuery({
    queryKey: ["communication", "categories"],
    queryFn: listCommunicationScriptCategories,
    enabled: tab === "scripts",
  });
  const scriptsQuery = useQuery({
    queryKey: [
      "communication",
      "scripts",
      q,
      scriptType,
      scriptCategory,
      favoritesOnly,
      scriptPage,
    ],
    queryFn: () =>
      listCommunicationScripts({
        q,
        scriptType: scriptType || undefined,
        categoryId: scriptCategory || undefined,
        favorite: favoritesOnly,
        page: scriptPage,
      }),
    enabled: tab === "scripts",
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteTarget?.kind === "friend"
        ? deleteCommunicationFriendRecord(csrf, deleteTarget.id)
        : deleteCommunicationScript(csrf, deleteTarget!.id),
    onSuccess: () => {
      setDeleteTarget(null);
      setNotice("已删除");
      void queryClient.invalidateQueries({ queryKey: ["communication"] });
    },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const switchTab = (value: Tab) => {
    setSearchParams(value === "friends" ? {} : { tab: value });
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="规划与执行"
        title="沟通工具"
        description="记录加好友进度，并整理可复用的话术内容。所有内容仅当前账号可见。"
      />
      <Tabs value={tab} onValueChange={(value) => switchTab(value as Tab)}>
        <TabsList aria-label="沟通工具视图">
          <TabsTrigger value="friends">
            <Users size={16} />
            加好友记录
          </TabsTrigger>
          <TabsTrigger value="scripts">
            <MessageSquareText size={16} />
            话术库
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {notice && (
        <Notice
          tone="info"
          className="fixed left-1/2 top-[4.5rem] z-[100] w-[min(90vw,380px)] -translate-x-1/2 animate-toast-drop-in shadow-overlay"
        >
          {notice}
        </Notice>
      )}
      {tab === "friends" ? (
        <FriendTab
          query={friendsQuery}
          q={q}
          setQ={setQ}
          platform={friendPlatform}
          setPlatform={setFriendPlatform}
          account={friendAccount}
          setAccount={setFriendAccount}
          archived={archived}
          setArchived={setArchived}
          onPage={setFriendPage}
          onNew={() => setFriendDialog(null)}
          onEdit={setFriendDialog}
          onProgress={setProgressDialog}
          onDelete={(id) => setDeleteTarget({ kind: "friend", id })}
          onNotice={setNotice}
        />
      ) : (
        <ScriptTab
          query={scriptsQuery}
          categories={categoriesQuery.data?.data.items ?? []}
          q={q}
          setQ={setQ}
          scriptType={scriptType}
          setScriptType={setScriptType}
          categoryId={scriptCategory}
          setCategoryId={setScriptCategory}
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          onPage={setScriptPage}
          clearFilters={() =>
            updateSearchParams({
              q: undefined,
              script_type: undefined,
              category: undefined,
              favorite: undefined,
              script_page: undefined,
            })
          }
          onNew={(categoryId) => {
            setNewScriptCategoryId(categoryId ?? "");
            setScriptDialog(null);
          }}
          onEdit={setScriptDialog}
          onDelete={(id) => setDeleteTarget({ kind: "script", id })}
          csrf={csrf}
          onNotice={setNotice}
        />
      )}
      {friendDialog !== undefined && (
        <FriendDialog
          open
          onOpenChange={(open) => !open && setFriendDialog(undefined)}
          csrfToken={csrf}
          record={friendDialog}
          template={latestFriendQuery.data?.data.items[0] ?? null}
          templateLoading={latestFriendQuery.isPending}
          onSaved={() => {
            setNotice("加好友记录已保存");
            void queryClient.invalidateQueries({
              queryKey: ["communication", "friends"],
            });
          }}
        />
      )}
      {progressDialog && (
        <ProgressDialog
          record={progressDialog}
          csrfToken={csrf}
          onOpenChange={(open) => !open && setProgressDialog(null)}
          onSaved={() => {
            setNotice("最新进度已更新");
            void queryClient.invalidateQueries({
              queryKey: ["communication", "friends"],
            });
          }}
        />
      )}
      {scriptDialog !== undefined && (
        <ScriptDialog
          open
          onOpenChange={(open) => !open && setScriptDialog(undefined)}
          csrfToken={csrf}
          script={scriptDialog}
          initialCategoryId={newScriptCategoryId}
          categories={categoriesQuery.data?.data.items ?? []}
          onSaved={() => {
            setNotice("话术已保存");
            void queryClient.invalidateQueries({
              queryKey: ["communication", "scripts"],
            });
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="确认删除"
          description="删除后无法恢复，确定继续吗？"
          confirmLabel="永久删除"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </div>
  );
}

function FriendTab({
  query,
  q,
  setQ,
  platform,
  setPlatform,
  account,
  setAccount,
  archived,
  setArchived,
  onPage,
  onNew,
  onEdit,
  onProgress,
  onDelete,
  onNotice,
}: {
  query: FriendQueryState;
  q: string;
  setQ: (value: string) => void;
  platform: string;
  setPlatform: (value: string) => void;
  account: string;
  setAccount: (value: string) => void;
  archived: boolean;
  setArchived: (value: boolean) => void;
  onPage: (value: number) => void;
  onNew: () => void;
  onEdit: (record: CommunicationFriendRecord) => void;
  onProgress: (record: CommunicationFriendRecord) => void;
  onDelete: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const items = query.data?.data.items ?? [];
  const meta = query.data?.meta;
  const hasNext = Boolean(meta && meta.page * meta.page_size < meta.total);
  const copyFriendScript = async (label: string, value: string) => {
    if (!value.trim()) return;
    const copied = await copyText(value);
    onNotice(copied ? `${label}已复制。` : "复制失败，请手动选择文本复制。");
  };
  return (
    <Panel
      title="加好友记录"
      description="按平台、账号和群分别维护最新进度，不记录历史申请。"
      action={
        <Button size="sm" onClick={onNew}>
          <Plus size={16} />
          新增记录
        </Button>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="min-h-10 rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm lg:col-span-2"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜索平台、账号、群或联系人"
        />
        <input
          className="min-h-10 rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm"
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
          placeholder="筛选平台"
        />
        <input
          className="min-h-10 rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm"
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          placeholder="筛选账号"
        />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />
          查看已归档
        </label>
      </div>
      {query.isPending ? (
        <LoadingState label="正在加载加好友记录" />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="还没有加好友记录"
          description="从一个群和账号开始记录你的推进顺序。"
          action={
            <Button size="sm" onClick={onNew}>
              <Plus size={15} />
              新增记录
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden lg:block">
            <table data-testid="friend-record-table" className="w-full table-fixed text-center text-sm">
              <thead>
                <tr className="border-b border-outline text-center text-xs text-ink-faint">
                  <th className="w-[15%] px-3 py-3">平台 / 账号</th>
                  <th className="w-[14%] px-3 py-3">群名称</th>
                  <th className="w-[10%] px-3 py-3">方向</th>
                  <th className="w-[13%] px-3 py-3">最后申请的人</th>
                  <th className="w-[22%] px-3 py-3">话术</th>
                  <th className="w-[9%] px-3 py-3">更新时间</th>
                  <th className="w-[17%] px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-outline/70 text-center transition-colors hover:bg-surface-muted/35 last:border-0"
                  >
                    <td className="break-words px-3 py-3 align-middle">
                      <div className="font-semibold">{item.platform}</div>
                      <div className="text-xs text-ink-faint">
                        {item.account_label}
                      </div>
                    </td>
                    <td className="break-words px-3 py-3 align-middle">
                      {item.group_name}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <DirectionBadge direction={item.add_direction} />
                    </td>
                    <td className="break-words px-3 py-3 align-middle">
                      {item.last_applied_person || "尚未开始"}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex flex-wrap justify-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={!item.application_script.trim()}
                          onClick={() =>
                            void copyFriendScript(
                              "好友申请话术",
                              item.application_script,
                            )
                          }
                        >
                          <Copy size={13} />
                          申请话术
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={!item.first_message.trim()}
                          onClick={() =>
                            void copyFriendScript(
                              "通过后第一句话",
                              item.first_message,
                            )
                          }
                        >
                          <Copy size={13} />
                          第一句话
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle text-ink-muted">
                      {formatDate(item.updated_at)}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => onProgress(item)}
                        >
                          <RotateCcw size={14} />
                          更新进度
                        </Button>
                        <FriendRecordMenu
                          item={item}
                          onEdit={() => onEdit(item)}
                          onArchive={() =>
                            onEdit({ ...item, archived: !item.archived })
                          }
                          onDelete={() => onDelete(item.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 lg:hidden">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-control border border-outline/80 bg-surface-muted/20 p-4 text-center transition-colors hover:bg-surface-muted/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">
                      {item.platform} · {item.account_label}
                    </div>
                    <div className="mt-1 break-words text-sm text-ink-muted">
                      {item.group_name}
                    </div>
                  </div>
                  <DirectionBadge direction={item.add_direction} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-ink-muted">
                  <span className="min-w-0 break-words">
                    最后申请：{item.last_applied_person || "尚未开始"}
                  </span>
                  <span className="shrink-0 text-xs">{formatDate(item.updated_at)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-w-0 px-2 text-xs"
                    disabled={!item.application_script.trim()}
                    onClick={() =>
                      void copyFriendScript("好友申请话术", item.application_script)
                    }
                  >
                    <Copy size={13} />
                    申请话术
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-w-0 px-2 text-xs"
                    disabled={!item.first_message.trim()}
                    onClick={() =>
                      void copyFriendScript("通过后第一句话", item.first_message)
                    }
                  >
                    <Copy size={13} />
                    第一句话
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-1 border-t border-outline/70 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => onProgress(item)}>
                    <RotateCcw size={14} />
                    更新进度
                  </Button>
                  <FriendRecordMenu
                    item={item}
                    onEdit={() => onEdit(item)}
                    onArchive={() =>
                      onEdit({ ...item, archived: !item.archived })
                    }
                    onDelete={() => onDelete(item.id)}
                  />
                </div>
              </article>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <span>{meta?.total ?? items.length} 条记录</span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!meta || meta.page <= 1}
                onClick={() => onPage((meta?.page ?? 2) - 1)}
              >
                上一页
              </Button>
              <span className="px-2 py-2">第 {meta?.page ?? 1} 页</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasNext}
                onClick={() => onPage((meta?.page ?? 1) + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function CategoryDialog({
  open,
  category,
  onOpenChange,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  category: CommunicationScriptCategory | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  loading: boolean;
  error?: string;
}) {
  const [name, setName] = useState(category?.name ?? "");
  useEffect(() => setName(category?.name ?? ""), [category]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "编辑分类" : "新增分类"}</DialogTitle>
          <DialogDescription>
            分类只用于整理自己的话术，删除分类不会删除其中的话术。
          </DialogDescription>
        </DialogHeader>
        <Field label="分类名称" value={name} onChange={setName} required />
        {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button size="sm" loading={loading} disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>
            保存分类
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryManagerDialog({
  open,
  categories,
  onOpenChange,
  onAdd,
  onEdit,
  onMove,
  onDelete,
  loading,
}: {
  open: boolean;
  categories: CommunicationScriptCategory[];
  onOpenChange: (open: boolean) => void;
  onAdd: () => void;
  onEdit: (category: CommunicationScriptCategory) => void;
  onMove: (category: CommunicationScriptCategory, direction: "up" | "down") => void;
  onDelete: (category: CommunicationScriptCategory) => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>管理分类</DialogTitle>
          <DialogDescription>
            分类只用于整理自己的话术。删除分类不会删除话术，会移动到未分类。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {categories.length === 0 ? (
            <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">
              还没有自定义分类，先创建一个吧。
            </p>
          ) : (
            categories.map((category, index) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3 rounded-card border border-outline/75 bg-surface-soft/55 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-ink">
                  {category.name}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="icon"
                    size="sm"
                    title="上移"
                    aria-label={`上移分类 ${category.name}`}
                    disabled={loading || index === 0}
                    onClick={() => onMove(category, "up")}
                  >
                    <ChevronUp size={15} />
                  </Button>
                  <Button
                    variant="icon"
                    size="sm"
                    title="下移"
                    aria-label={`下移分类 ${category.name}`}
                    disabled={loading || index === categories.length - 1}
                    onClick={() => onMove(category, "down")}
                  >
                    <ChevronDown size={15} />
                  </Button>
                  <Button
                    variant="icon"
                    size="sm"
                    title="编辑"
                    aria-label={`编辑分类 ${category.name}`}
                    disabled={loading}
                    onClick={() => onEdit(category)}
                  >
                    <Edit3 size={15} />
                  </Button>
                  <Button
                    variant="icon"
                    size="sm"
                    title="删除"
                    aria-label={`删除分类 ${category.name}`}
                    disabled={loading}
                    onClick={() => onDelete(category)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button size="sm" onClick={onAdd}>
            <Plus size={15} />
            新增分类
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScriptTab({
  query,
  categories,
  q,
  setQ,
  scriptType,
  setScriptType,
  categoryId,
  setCategoryId,
  favoritesOnly,
  setFavoritesOnly,
  onPage,
  clearFilters,
  onNew,
  onEdit,
  onDelete,
  csrf,
  onNotice,
}: {
  query: ScriptQueryState;
  categories: CommunicationScriptCategory[];
  q: string;
  setQ: (value: string) => void;
  scriptType: "" | "STAGE" | "FAQ";
  setScriptType: (value: "" | "STAGE" | "FAQ") => void;
  categoryId: string;
  setCategoryId: (value: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  onPage: (value: number) => void;
  clearFilters: () => void;
  onNew: (categoryId?: string) => void;
  onEdit: (script: CommunicationScript) => void;
  onDelete: (id: string) => void;
  csrf: string;
  onNotice: (message: string) => void;
}) {
  const items = query.data?.data.items ?? [];
  const meta = query.data?.meta;
  const hasNext = Boolean(meta && meta.page * meta.page_size < meta.total);
  const queryClient = useQueryClient();
  const [categoryEditor, setCategoryEditor] = useState<CommunicationScriptCategory | null | undefined>();
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const refreshCategories = () => {
    void queryClient.invalidateQueries({
      queryKey: ["communication", "categories"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["communication", "scripts"],
    });
  };
  const categoryMutation = useMutation({
    mutationFn: ({
      category,
      name,
      order,
    }: {
      category?: CommunicationScriptCategory;
      name: string;
      order?: number;
    }) =>
      saveCommunicationScriptCategory(
        csrf,
        {
          name,
          sort_order: order ?? category?.sort_order ?? categories.length,
        },
        category?.id,
      ),
    onSuccess: () => {
      onNotice("分类已保存");
      refreshCategories();
    },
    onError: (error) => onNotice(errorMessage(error)),
  });
  const categoryDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteCommunicationScriptCategory(csrf, id),
    onSuccess: () => {
      onNotice("分类已删除，其中的话术已移至未分类");
      refreshCategories();
    },
    onError: (error) => onNotice(errorMessage(error)),
  });
  const favoriteMutation = useMutation({
    mutationFn: (id: string) => toggleCommunicationScriptFavorite(csrf, id),
    onSuccess: () => void query.refetch(),
  });
  const createCategory = () => {
    setCategoryManagerOpen(false);
    setCategoryEditor(null);
  };
  const editCategory = (category: CommunicationScriptCategory) => {
    setCategoryManagerOpen(false);
    setCategoryEditor(category);
  };
  const moveCategory = (
    category: CommunicationScriptCategory,
    direction: "up" | "down",
  ) => {
    const index = categories.findIndex((item) => item.id === category.id);
    const neighbor = categories[index + (direction === "up" ? -1 : 1)];
    if (!neighbor) return;
    categoryMutation.mutate({
      category,
      name: category.name,
      order:
        direction === "up"
          ? neighbor.sort_order - 1
          : neighbor.sort_order + 1,
    });
  };
  const deleteCategory = (category: CommunicationScriptCategory) => {
    if (
      window.confirm(
        `删除分类“${category.name}”吗？其中的话术会保留并移至未分类。`,
      )
    ) {
      categoryDeleteMutation.mutate(category.id);
    }
  };
  const activeCategoryName = categories.find((category) => category.id === categoryId)?.name;
  const selectedCategoryLabel = activeCategoryName ?? (categoryId ? "当前分类" : "");
  const hasSearch = q.trim().length > 0;
  const hasAnyFilter = hasSearch || Boolean(scriptType) || Boolean(categoryId) || favoritesOnly;
  const emptyTitle = hasSearch || scriptType
    ? "没有找到匹配的话术"
    : favoritesOnly
      ? "还没有收藏的话术"
      : selectedCategoryLabel
        ? `分类“${selectedCategoryLabel}”还没有话术`
        : "还没有话术";
  const emptyDescription = hasSearch
    ? "可以换个关键词，或清除筛选后重新查看。"
    : favoritesOnly
      ? "收藏常用话术后，它们会集中显示在这里。"
      : selectedCategoryLabel
        ? "可以直接把新话术添加到当前分类。"
        : "把常见问题或阶段经验整理成自己的内容。";
  const openNewScript = () => onNew(categoryId || undefined);
  return (
    <Panel
      title="话术库"
      description="阶段话术和常见问题独立整理，正文支持多段和纯文本复制。"
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCategoryManagerOpen(true)}
          >
            <FolderPlus size={15} />
            管理分类
          </Button>
          <Button size="sm" onClick={openNewScript}>
            <Plus size={15} />
            新增话术
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="relative">
            <input
              className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 pr-10 text-sm"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索标题、正文或标签"
              aria-label="搜索话术"
            />
            {hasSearch && (
              <button
                type="button"
                aria-label="清除搜索"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-ink-faint hover:bg-surface-muted hover:text-ink"
                onClick={() => setQ("")}
              >
                ×
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="min-h-9 rounded-control border border-outline/90 bg-surface px-2 text-sm"
              value={scriptType}
              onChange={(event) =>
                setScriptType(event.target.value as "" | "STAGE" | "FAQ")
              }
              aria-label="按类型筛选"
            >
              <option value="">全部类型</option>
              <option value="STAGE">阶段话术</option>
              <option value="FAQ">常见问题</option>
            </select>
            <select
              className="min-h-9 rounded-control border border-outline/90 bg-surface px-2 text-sm"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-label="按分类筛选"
            >
              <option value="">全部分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <label className="inline-flex min-h-9 items-center gap-2 px-1 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(event) => setFavoritesOnly(event.target.checked)}
              />
              仅看收藏
            </label>
            {hasAnyFilter && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            )}
          </div>
        </div>
        {query.isPending ? (
            <LoadingState label="正在加载话术" />
        ) : query.isError ? (
            <ErrorState
              message={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
        ) : items.length === 0 ? (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {hasAnyFilter && (
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  )}
                  <Button size="sm" onClick={openNewScript}>
                    <Plus size={15} />
                    {selectedCategoryLabel ? "新增到此分类" : "新增话术"}
                  </Button>
                </div>
              }
            />
        ) : (
            <>
              <div className="space-y-3">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-card border border-outline/80 bg-surface-soft p-4 transition-colors hover:border-brand-300 hover:bg-surface"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-ink">{item.title}</h3>
                        <p className="mt-1 text-xs text-ink-faint">
                          {item.script_type === "FAQ" ? "常见问题" : "阶段话术"} · {item.category_name || "未分类"} · {item.paragraphs.length} 段
                        </p>
                        {item.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                                {tag}
                              </span>
                            ))}
                            {item.tags.length > 2 && (
                              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-faint">
                                +{item.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`${item.favorite ? "取消" : "添加"}收藏 ${item.title}`}
                        className="shrink-0 rounded-control p-1 text-amber-500 transition hover:bg-amber-50"
                        onClick={() => favoriteMutation.mutate(item.id)}
                      >
                        <Star size={18} fill={item.favorite ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <p className="mt-3 max-h-24 overflow-hidden whitespace-pre-wrap text-sm leading-6 text-ink-muted">
                      {item.paragraphs.join("\n\n")}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-outline/60 pt-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {item.paragraphs.length === 1 ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () =>
                              onNotice(
                                (await copyText(item.paragraphs[0]))
                                  ? "已复制正文"
                                  : "复制失败，请手动选择正文复制",
                              )
                            }
                          >
                            <Copy size={14} />
                            复制正文
                          </Button>
                        ) : (
                          item.paragraphs.map((paragraph, index) => (
                            <Button
                              key={index}
                              variant="ghost"
                              size="sm"
                              onClick={async () =>
                                onNotice(
                                  (await copyText(paragraph))
                                    ? `已复制第 ${index + 1} 段`
                                    : "复制失败，请手动选择正文复制",
                                )
                              }
                            >
                              <Copy size={13} />
                              复制第 {index + 1} 段
                            </Button>
                          ))
                        )}
                        {item.paragraphs.length > 1 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () =>
                            onNotice(
                              (await copyText(item.paragraphs.join("\n\n")))
                                ? "已复制全部正文"
                                : "复制失败，请手动选择正文复制",
                            )
                          }
                        >
                          <Copy size={14} />
                          复制全部
                        </Button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-ink-faint">更新于 {formatDate(item.updated_at)}</span>
                        <ScriptMenu onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
                <span>{meta?.total ?? items.length} 条话术</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={!meta || meta.page <= 1} onClick={() => onPage((meta?.page ?? 2) - 1)}>上一页</Button>
                  <span className="px-2 py-2">第 {meta?.page ?? 1} 页</span>
                  <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => onPage((meta?.page ?? 1) + 1)}>下一页</Button>
                </div>
              </div>
            </>
          )}
      </div>
      <CategoryManagerDialog
        open={categoryManagerOpen}
        categories={categories}
        onOpenChange={setCategoryManagerOpen}
        onAdd={createCategory}
        onEdit={editCategory}
        onMove={moveCategory}
        onDelete={deleteCategory}
        loading={categoryMutation.isPending || categoryDeleteMutation.isPending}
      />
      {categoryEditor !== undefined && (
        <CategoryDialog
          open
          category={categoryEditor}
          onOpenChange={(open) => !open && setCategoryEditor(undefined)}
          loading={categoryMutation.isPending}
          error={categoryMutation.isError ? errorMessage(categoryMutation.error) : undefined}
          onSubmit={(name) =>
            categoryMutation.mutate(
              { category: categoryEditor ?? undefined, name },
              { onSuccess: () => setCategoryEditor(undefined) },
            )
          }
        />
      )}
    </Panel>
  );
}
