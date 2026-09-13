import { useQuery } from "@tanstack/react-query";
import { getLiveHealth } from "./api/client";

export function App() {
  const healthQuery = useQuery({
    queryKey: ["health", "live"],
    queryFn: getLiveHealth,
  });

  const healthLabel = healthQuery.isSuccess ? "API 可用" : "API 尚未连接";
  const healthTone = healthQuery.isSuccess ? "bg-emerald-500" : "bg-amber-500";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl flex-col justify-between border-t-4 border-teal-700 py-8">
        <section>
          <p className="text-sm font-medium text-teal-800">工程基线</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">
            JL团队生意成长管理系统
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            前后端基础设施已初始化。业务功能将在既定实施阶段中逐步交付。
          </p>
        </section>

        <section aria-live="polite" className="border-y border-slate-200 py-5">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${healthTone}`} aria-hidden="true" />
            <span className="font-medium">{healthLabel}</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {healthQuery.isSuccess
              ? "基础服务正在响应健康检查。"
              : "启动后端与 PostgreSQL 后，此状态会自动更新。"}
          </p>
        </section>
      </div>
    </main>
  );
}
