import type { components } from "./openapi.gen";

export type HealthResponse = components["schemas"]["HealthResponse"];

export async function getLiveHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health/live");

  if (!response.ok) {
    throw new Error("Health endpoint unavailable");
  }

  return (await response.json()) as HealthResponse;
}
