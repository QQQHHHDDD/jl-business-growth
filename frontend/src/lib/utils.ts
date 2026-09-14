import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

export function roleLabel(role: string) {
  if (role === "SUPER_ADMIN") return "超级管理员";
  if (role === "ADMIN") return "普通管理员";
  return "普通用户";
}

export function roleHome(role?: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN" ? "/admin" : "/app";
}

export function isAllowedPath(pathname: string, role: string) {
  if (role === "USER") return pathname === "/app" || pathname.startsWith("/app/");
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return role === "SUPER_ADMIN" || pathname !== "/admin/admins";
  }
  return pathname === "/app/settings";
}
