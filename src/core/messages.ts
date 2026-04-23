export type DownloadRequest = {
  kind: 'download';
  mediaURL: string;
  accountName: string;
  postShortcode?: string;
  /** 1-based slide index; present only when a post has multiple slides. */
  index?: number;
};

export type AlertPush = {
  kind: 'alert';
  text: string;
  level: 'default' | 'warn' | 'error';
  dismissible?: boolean;
  timeoutMs?: number;
};

export type LocationChange = {
  kind: 'locationchange';
  href: string;
};

export type ExtensionMessage = DownloadRequest | AlertPush | LocationChange;
