/// <reference types="vite/client" />

declare module "*.css?inline" {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
