const injectedVersion = import.meta.env.VITE_APP_VERSION?.trim();

export const appVersion = injectedVersion || "dev";
export const appCommit = import.meta.env.VITE_GIT_COMMIT?.trim() || "unknown";
export const appBuildTime = import.meta.env.VITE_BUILD_TIME?.trim() || "unknown";
