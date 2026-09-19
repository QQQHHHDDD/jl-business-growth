import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { login, register, type AuthResponse } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/layouts/auth-layout";
import { isAllowedPath, roleHome, errorMessage } from "@/lib/utils";

const baseSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "请输入账号")
    .max(32, "账号不能超过 32 个字符"),
  password: z
    .string()
    .min(10, "密码至少需要 10 个字符")
    .max(128, "密码不能超过 128 个字符"),
  invitationCode: z
    .string()
    .trim()
    .max(64, "邀请码不能超过 64 个字符")
    .optional(),
});
const registerSchema = baseSchema.extend({
  invitationCode: z
    .string()
    .trim()
    .min(1, "请输入邀请码")
    .max(64, "邀请码不能超过 64 个字符"),
});
type FormValues = z.infer<typeof baseSchema>;

export function AuthPage({
  mode,
  health,
}: {
  mode: "login" | "register";
  health: { isPending: boolean; isSuccess: boolean };
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const form = useForm<FormValues>({
    resolver: zodResolver(mode === "register" ? registerSchema : baseSchema),
    defaultValues: { username: "", password: "", invitationCode: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      mode === "login"
        ? login(values.username, values.password)
        : register(
            values.username,
            values.password,
            values.invitationCode ?? "",
          ),
    onSuccess: async (response: AuthResponse) => {
      await queryClient.cancelQueries({ queryKey: ["auth", "me"] });
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] !== "auth" && query.queryKey[0] !== "health",
      });
      queryClient.setQueryData(["auth", "me"], response);
      form.reset({ username: "", password: "", invitationCode: "" });
      const target = (location.state as { from?: string } | null)?.from;
      const role = response.data.account.role;
      navigate(
        target && isAllowedPath(target, role) ? target : roleHome(role),
        { replace: true },
      );
    },
    onError: (value) => setError(errorMessage(value)),
  });

  const submit = form.handleSubmit((values) => {
    setError("");
    mutation.mutate(values);
  });
  const togglePath = mode === "login" ? "/register" : "/login";
  return (
    <AuthLayout health={health}>
      <section className="auth-card rounded-panel border border-brand-100/80 bg-surface p-6 shadow-overlay sm:p-8">
        <div className="flex items-start gap-3 border-b border-outline/55 pb-5">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-100 text-brand-800 shadow-hairline"
            aria-hidden="true"
          >
            {mode === "login" ? <LogIn size={19} /> : <UserPlus size={19} />}
          </span>
          <div>
            <h2 className="text-xl font-bold">
              {mode === "login" ? "登录系统" : "注册普通用户"}
            </h2>
            <p className="mt-1 text-sm text-ink-faint">
              {mode === "login" ? "继续你的经营记录" : "使用有效邀请码创建账号"}
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Input
            label="账号"
            {...form.register("username")}
            autoComplete="username"
            required
            error={form.formState.errors.username?.message}
          />
          <Input
            label="密码"
            type="password"
            {...form.register("password")}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            error={form.formState.errors.password?.message}
          />
          {mode === "register" && (
            <Input
              label="邀请码"
              {...form.register("invitationCode")}
              autoCapitalize="characters"
              required
              error={form.formState.errors.invitationCode?.message}
            />
          )}
          {error && (
            <p
              role="alert"
              className="rounded-card border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-800 shadow-hairline"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={mutation.isPending}
          >
            {mode === "login" ? <LogIn size={17} /> : <UserPlus size={17} />}
            {mutation.isPending
              ? "处理中..."
              : mode === "login"
                ? "登录"
                : "注册并登录"}
          </Button>
        </form>
        <Link
          to={togglePath}
          state={location.state}
          className="mt-5 block rounded-control py-2 text-center text-sm font-semibold text-brand-800 hover:bg-brand-50 hover:text-brand-900"
        >
          {mode === "login" ? "首次使用？注册普通用户" : "已有账号？返回登录"}
        </Link>
      </section>
    </AuthLayout>
  );
}
