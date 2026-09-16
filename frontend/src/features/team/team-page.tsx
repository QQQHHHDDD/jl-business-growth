import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, GitBranch, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { AuthResponse, TeamMember, TeamMemberRequest } from "@/api/client";
import {
  createTeamSnapshot,
  deleteTeamMember,
  listTeamMembers,
  listTeamSnapshots,
  saveTeamMember,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/state-block";
import { errorMessage } from "@/lib/utils";

type Form = {
  name: string;
  parent_id: string;
  rank: string;
  city: string;
  joined_on: string;
  status: "ACTIVE" | "INACTIVE";
  note: string;
};
const emptyForm: Form = {
  name: "",
  parent_id: "",
  rank: "",
  city: "",
  joined_on: "",
  status: "ACTIVE",
  note: "",
};

function teamNameError(name: string): string | null {
  const value = name.trim();
  if (value.length < 2 || value.length > 200)
    return "成员姓名需要 2 到 200 个字符";
  if (/^\d+$/.test(value)) return "成员姓名不能全部是数字";
  return null;
}

type TeamGraphData = {
  name: string;
  rank: string | null;
  city: string | null;
  status: "ACTIVE" | "INACTIVE";
  isRoot: boolean;
};
type TeamGraphNodeData = {
  id: string;
  position: { x: number; y: number };
  data: TeamGraphData;
};
type TeamGraphEdge = { source: string; target: string };

function teamGraphNodes(members: TeamMember[]): TeamGraphNodeData[] {
  const membersByID = new Map(members.map((member) => [member.id, member]));
  const depthFor = (member: TeamMember, seen = new Set<string>()): number => {
    if (
      !member.parent_id ||
      !membersByID.has(member.parent_id) ||
      seen.has(member.id)
    )
      return 0;
    const nextSeen = new Set(seen);
    nextSeen.add(member.id);
    return 1 + depthFor(membersByID.get(member.parent_id)!, nextSeen);
  };
  const layers = new Map<number, TeamMember[]>();
  members.forEach((member) => {
    const depth = depthFor(member);
    layers.set(depth, [...(layers.get(depth) ?? []), member]);
  });
  return [...layers.entries()].flatMap(([depth, layer]) =>
    layer
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
      .map((member, index) => ({
        id: member.id,
        position: { x: index * 240, y: depth * 168 },
        data: {
          name: member.name,
          rank: member.rank ?? null,
          city: member.city ?? null,
          status: member.status,
          isRoot: !member.parent_id || !membersByID.has(member.parent_id),
        },
      })),
  );
}

function ReactFlow({
  nodes,
  edges,
}: {
  nodes: TeamGraphNodeData[];
  edges: TeamGraphEdge[];
}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const width = Math.max(680, ...nodes.map((node) => node.position.x + 210));
  const height = Math.max(360, ...nodes.map((node) => node.position.y + 135));
  return (
    <div
      className="relative h-full min-w-[680px] overflow-auto bg-slate-50 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px] p-5"
      role="img"
      aria-label="团队关系图"
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {edges.map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);
          if (!source || !target) return null;
          return (
            <path
              key={`${edge.source}-${edge.target}`}
              d={`M ${source.position.x + 84} ${source.position.y + 94} C ${source.position.x + 84} ${source.position.y + 130}, ${target.position.x + 84} ${target.position.y - 36}, ${target.position.x + 84} ${target.position.y}`}
              fill="none"
              stroke="#0f766e"
              strokeWidth="2"
            />
          );
        })}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          className={`absolute w-[168px] rounded-xl border p-3 text-left shadow-float ${node.data.isRoot ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-slate-900"}`}
          style={{ left: node.position.x + 20, top: node.position.y + 20 }}
        >
          <span
            className={`absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 ${node.data.isRoot ? "border-teal-700 bg-white" : "border-teal-600 bg-white"}`}
            aria-hidden="true"
          />
          <span
            className={`absolute bottom-0 left-0 top-0 w-[3px] rounded-l-xl ${node.data.isRoot ? "bg-teal-300" : "bg-teal-500"}`}
            aria-hidden="true"
          />
          <p className="font-bold">{node.data.name}</p>
          <p
            className={`mt-1 text-xs ${node.data.isRoot ? "text-teal-50" : "text-slate-500"}`}
          >
            级别：{node.data.rank || "未设置"} · 城市：
            {node.data.city || "未设置"}
          </p>
          <p
            className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${node.data.status === "ACTIVE" ? (node.data.isRoot ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600") : "bg-slate-100 text-slate-600"}`}
          >
            {node.data.status === "ACTIVE" ? "启用" : "停用"}
          </p>
          <span
            className={`absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 ${node.data.isRoot ? "border-teal-700 bg-white" : "border-teal-600 bg-white"}`}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}

export function TeamPage({ authResponse }: { authResponse: AuthResponse }) {
  const accountId = authResponse.data.account.id;
  const client = useQueryClient();
  const membersQuery = useQuery({
    queryKey: ["user", accountId, "team", "members"],
    queryFn: listTeamMembers,
  });
  const snapshotsQuery = useQuery({
    queryKey: ["user", accountId, "team", "snapshots"],
    queryFn: listTeamSnapshots,
  });
  const members = useMemo(
    () => membersQuery.data?.data.items ?? [],
    [membersQuery.data],
  );
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const validationError = teamNameError(form.name);
      if (validationError) throw new Error(validationError);
      return saveTeamMember(
        authResponse.data.csrf_token,
        formRequest(form),
        editing?.id,
      );
    },
    onSuccess: () => {
      setForm(emptyForm);
      setEditing(null);
      setNameTouched(false);
      setNotice("团队成员已保存");
      setError("");
      void client.invalidateQueries({ queryKey: ["user", accountId, "team"] });
    },
    onError: (value) => {
      setError(errorMessage(value));
      setNotice("");
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      deleteTeamMember(authResponse.data.csrf_token, removeTarget!.id),
    onSuccess: () => {
      setRemoveTarget(null);
      setNotice("团队成员已删除");
      setError("");
      void client.invalidateQueries({ queryKey: ["user", accountId, "team"] });
    },
    onError: (value) => setError(errorMessage(value)),
  });
  const snapshot = useMutation({
    mutationFn: () =>
      createTeamSnapshot(authResponse.data.csrf_token, {
        snapshot_type: "MANUAL",
        captured_late: false,
      }),
    onSuccess: () => {
      setNotice("团队快照已保存");
      void client.invalidateQueries({
        queryKey: ["user", accountId, "team", "snapshots"],
      });
    },
    onError: (value) => setError(errorMessage(value)),
  });
  const nodes = useMemo(() => teamGraphNodes(members), [members]);
  const edges = useMemo(
    () =>
      members
        .filter((member) => member.parent_id)
        .map((member) => ({
          id: `${member.parent_id}-${member.id}`,
          source: member.parent_id!,
          target: member.id,
          type: "smoothstep",
        })),
    [members],
  );
  if (membersQuery.isPending) return <LoadingState label="正在加载团队" />;
  if (membersQuery.isError)
    return (
      <ErrorState
        message="团队数据暂时无法加载"
        onRetry={() => void membersQuery.refetch()}
      />
    );
  const edit = (member: TeamMember) => {
    setNameTouched(true);
    setForm({
      name: member.name,
      parent_id: member.parent_id ?? "",
      rank: member.rank ?? "",
      city: member.city ?? "",
      joined_on: member.joined_on ?? "",
      status: member.status,
      note: member.note ?? "",
    });
  };
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="关系与成长"
        title="团队"
        description="维护当前团队结构，并用月末快照保留历史状态。"
        action={
          <Button
            onClick={() => snapshot.mutate()}
            loading={snapshot.isPending}
          >
            <Camera size={16} />
            保存当前快照
          </Button>
        }
      />
      {(notice || error) && (
        <p
          role={error ? "alert" : "status"}
          className={`rounded-md border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}
        >
          {error || notice}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel
          title={editing ? "编辑成员" : "添加成员"}
          description="父节点通过明确表单调整，不会因拖动画布误改关系。"
        >
          <div className="space-y-4">
            <Input
              label="团队成员姓名"
              required
              error={nameTouched ? teamNameError(form.name) ?? undefined : undefined}
              value={form.name}
              onChange={(event) => {
                setNameTouched(true);
                setForm({ ...form, name: event.target.value });
              }}
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">
                上级成员
              </span>
              <select
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={form.parent_id}
                onChange={(event) =>
                  setForm({ ...form, parent_id: event.target.value })
                }
              >
                <option value="">直属根节点</option>
                {members
                  .filter((member) => member.id !== editing?.id)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="级别"
                value={form.rank}
                onChange={(event) =>
                  setForm({ ...form, rank: event.target.value })
                }
              />
              <Input
                label="城市"
                value={form.city}
                onChange={(event) =>
                  setForm({ ...form, city: event.target.value })
                }
              />
              <Input
                label="加入日期"
                type="date"
                value={form.joined_on}
                onChange={(event) =>
                  setForm({ ...form, joined_on: event.target.value })
                }
              />
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">
                  状态
                </span>
                <select
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as Form["status"],
                    })
                  }
                >
                  <option value="ACTIVE">启用</option>
                  <option value="INACTIVE">停用</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">备注</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(emptyForm);
                  setEditing(null);
                  setNameTouched(false);
                }}
              >
                清空
              </Button>
              <Button
                onClick={() => save.mutate()}
                loading={save.isPending}
                disabled={Boolean(teamNameError(form.name))}
              >
                <Check size={15} />
                保存成员
              </Button>
            </div>
          </div>
        </Panel>
        <Panel
          title="团队关系图"
          description="大屏显示关系画布，移动端可横向查看。"
        >
          <div className="h-[430px] rounded-xl border border-slate-200 bg-slate-50">
            {nodes.length ? (
              <ReactFlow nodes={nodes} edges={edges} />
            ) : (
              <div className="grid h-full place-items-center">
                <EmptyState
                  title="还没有团队成员"
                  description="添加第一位成员后会显示关系图。"
                />
              </div>
            )}
          </div>
        </Panel>
      </div>
      <Panel
        title="成员列表"
        description="成员删除默认阻止存在子节点的情况，需先调整层级。"
      >
        {members.length ? (
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"
              >
                <div>
                  <p className="font-bold text-slate-900">{member.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {member.rank || "未设置级别"} ·{" "}
                    {member.city || "未设置城市"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    tone={member.status === "ACTIVE" ? "success" : "neutral"}
                  >
                    {member.status === "ACTIVE" ? "启用" : "停用"}
                  </StatusBadge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditing(member);
                      edit(member);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="icon"
                    size="sm"
                    aria-label={`删除成员 ${member.name}`}
                    onClick={() => setRemoveTarget(member)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无成员" description="从左侧添加团队成员。" />
        )}
      </Panel>
      <Panel
        title="历史快照"
        description="快照只读，后续成员改名或删除不会影响历史记录。"
      >
        {snapshotsQuery.data?.data.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {snapshotsQuery.data.data.items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-slate-200 p-4"
              >
                <div className="flex items-center gap-2">
                  <GitBranch size={16} className="text-teal-700" />
                  <p className="font-semibold">{item.snapshot_month}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {item.members.length} 位成员 ·{" "}
                  {item.snapshot_type === "AUTO" ? "自动" : "手动"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="暂无历史快照"
            description="保存一次当前快照后会出现在这里。"
          />
        )}
      </Panel>
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="确认删除成员"
        description={
          removeTarget
            ? `确定删除“${removeTarget.name}”吗？存在下属时需要先调整层级。`
            : ""
        }
        confirmLabel="删除"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function formRequest(form: Form): TeamMemberRequest {
  return {
    name: form.name.trim(),
    parent_id: form.parent_id || null,
    rank: form.rank.trim() || null,
    city: form.city.trim() || null,
    joined_on: form.joined_on || null,
    status: form.status,
    note: form.note.trim() || null,
    sort_order: 0,
  };
}
