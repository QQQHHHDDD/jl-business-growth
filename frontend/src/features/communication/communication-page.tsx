import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  FolderPlus,
  MessageSquareText,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
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
import { errorMessage, formatDate } from "@/lib/utils";

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

function FriendDialog({
  open,
  onOpenChange,
  csrfToken,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csrfToken: string;
  record?: CommunicationFriendRecord | null;
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
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csrfToken: string;
  script?: CommunicationScript | null;
  categories: CommunicationScriptCategory[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(script?.title ?? "");
  const [type, setType] = useState<"STAGE" | "FAQ">(
    script?.script_type ?? "STAGE",
  );
  const [categoryId, setCategoryId] = useState(script?.category_id ?? "");
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
              <div key={index} className="flex gap-2">
                <textarea
                  className={textareaClass}
                  value={paragraph}
                  onChange={(event) => updateParagraph(index, event.target.value)}
                  placeholder={`第 ${index + 1} 段`}
                  required={index === 0}
                />
                <div className="flex flex-col gap-1">
                <Button
                  variant="icon"
                  size="sm"
                  title="上移"
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
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [friendPlatform, setFriendPlatform] = useState("");
  const [friendAccount, setFriendAccount] = useState("");
  const [friendPage, setFriendPage] = useState(1);
  const [scriptType, setScriptType] = useState<"" | "STAGE" | "FAQ">("");
  const [scriptCategory, setScriptCategory] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [scriptPage, setScriptPage] = useState(1);
  const [friendDialog, setFriendDialog] = useState<
    CommunicationFriendRecord | null | undefined
  >();
  const [progressDialog, setProgressDialog] =
    useState<CommunicationFriendRecord | null>(null);
  const [scriptDialog, setScriptDialog] = useState<
    CommunicationScript | null | undefined
  >();
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "friend" | "script";
    id: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const queryClient = useQueryClient();
  const csrf = authResponse.data.csrf_token;
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
    setQ("");
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="规划与执行"
        title="沟通工具"
        description="记录加好友进度，并整理可复用的话术内容。所有内容仅当前账号可见。"
      />
      <div className="flex flex-wrap gap-2 rounded-card border border-outline/80 bg-surface p-2 shadow-hairline">
        <Button
          variant={tab === "friends" ? "primary" : "ghost"}
          size="sm"
          onClick={() => switchTab("friends")}
        >
          <Users size={16} />
          加好友记录
        </Button>
        <Button
          variant={tab === "scripts" ? "primary" : "ghost"}
          size="sm"
          onClick={() => switchTab("scripts")}
        >
          <MessageSquareText size={16} />
          话术库
        </Button>
      </div>
      {notice && <Notice tone="info">{notice}</Notice>}
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
          onNew={() => setScriptDialog(null)}
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
}) {
  const items = query.data?.data.items ?? [];
  const meta = query.data?.meta;
  const hasNext = Boolean(meta && meta.page * meta.page_size < meta.total);
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-outline text-xs text-ink-faint">
                  <th className="px-3 py-3">平台 / 账号</th>
                  <th className="px-3 py-3">群名称</th>
                  <th className="px-3 py-3">方向</th>
                  <th className="px-3 py-3">最后申请的人</th>
                  <th className="px-3 py-3">更新时间</th>
                  <th className="px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-outline/70 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold">{item.platform}</div>
                      <div className="text-xs text-ink-faint">
                        {item.account_label}
                      </div>
                    </td>
                    <td className="px-3 py-3">{item.group_name}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tone="info">
                        {item.add_direction === "FORWARD" ? "顺序" : "逆序"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3">
                      {item.last_applied_person || "尚未开始"}
                    </td>
                    <td className="px-3 py-3 text-ink-muted">
                      {formatDate(item.updated_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(item)}
                        >
                          <Edit3 size={15} />
                          查看 / 编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onProgress(item)}
                        >
                          <RotateCcw size={14} />
                          更新进度
                        </Button>
                        <Button
                          variant="icon"
                          size="sm"
                          title={item.archived ? "恢复" : "归档"}
                          onClick={() =>
                            onEdit({ ...item, archived: !item.archived })
                          }
                        >
                          {item.archived ? (
                            <RotateCcw size={15} />
                          ) : (
                            <Archive size={15} />
                          )}
                        </Button>
                        <Button
                          variant="icon"
                          size="sm"
                          title="删除"
                          onClick={() => onDelete(item.id)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  onNew: () => void;
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
    setCategoryEditor(null);
  };
  return (
    <Panel
      title="话术库"
      description="阶段话术和常见问题独立整理，正文支持多段和纯文本复制。"
      action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={createCategory}>
            <FolderPlus size={15} />
            新增分类
          </Button>
          <Button size="sm" onClick={onNew}>
            <Plus size={15} />
            新增话术
          </Button>
        </div>
      }
    >
      <div className="mb-5 space-y-3">
        <input
          className="min-h-10 w-full rounded-control border border-outline/90 bg-surface px-3 py-2 text-sm"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜索标题、正文或标签"
        />
        <div className="flex flex-wrap gap-2">
          <select
            className="min-h-9 rounded-control border border-outline/90 bg-surface px-2 text-sm"
            value={scriptType}
            onChange={(event) =>
              setScriptType(event.target.value as "" | "STAGE" | "FAQ")
            }
          >
            <option value="">全部类型</option>
            <option value="STAGE">阶段话术</option>
            <option value="FAQ">常见问题</option>
          </select>
          <select
            className="min-h-9 rounded-control border border-outline/90 bg-surface px-2 text-sm"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">全部分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(event) => setFavoritesOnly(event.target.checked)}
            />
            仅看收藏
          </label>
        </div>
        {categories.length > 0 && (
          <div className="space-y-2 rounded-card border border-outline/70 bg-surface-soft p-3">
            <p className="text-xs font-semibold text-ink-muted">分类管理</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category, index) => (
                <span
                  key={category.id}
                  className="inline-flex items-center gap-1 rounded-full border border-outline bg-surface px-2 py-1 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryEditor(category);
                    }}
                  >
                    {category.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`上移分类 ${category.name}`}
                    disabled={index === 0}
                    onClick={() =>
                      categoryMutation.mutate({
                        category,
                        name: category.name,
                        order: categories[index - 1].sort_order - 1,
                      })
                    }
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`下移分类 ${category.name}`}
                    disabled={index === categories.length - 1}
                    onClick={() =>
                      categoryMutation.mutate({
                        category,
                        name: category.name,
                        order: categories[index + 1].sort_order + 1,
                      })
                    }
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除分类 ${category.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `删除分类“${category.name}”吗？其中的话术会保留并移至未分类。`,
                        )
                      )
                        categoryDeleteMutation.mutate(category.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
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
          title="还没有话术"
          description="把常见问题或阶段经验整理成自己的内容。"
          action={
            <Button size="sm" onClick={onNew}>
              <Plus size={15} />
              新增话术
            </Button>
          }
        />
      ) : (
        <>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-card border border-outline/80 bg-surface-soft p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{item.title}</h3>
                  <p className="mt-1 text-xs text-ink-faint">
                    {item.script_type === "FAQ" ? "常见问题" : "阶段话术"} ·{" "}
                    {item.category_name || "未分类"} · {item.paragraphs.length}{" "}
                    段
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="收藏话术"
                  className="text-amber-500"
                  onClick={() => favoriteMutation.mutate(item.id)}
                >
                  <Star
                    size={18}
                    fill={item.favorite ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-muted">
                {item.paragraphs.join("\n\n")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.paragraphs.map((paragraph, index) => (
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
                    复制本段 {index + 1}
                  </Button>
                ))}
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
                <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
                  <Edit3 size={14} />
                  编辑
                </Button>
                <Button
                  variant="icon"
                  size="sm"
                  title="删除"
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 size={15} />
                </Button>
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
