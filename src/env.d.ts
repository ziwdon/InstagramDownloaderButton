/// <reference types="wxt/client" />

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly MODE: string;
  readonly BROWSER: string;
  readonly MANIFEST_VERSION: number;
  readonly DEV: boolean;
  readonly PROD: boolean;
}
