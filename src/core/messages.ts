export type DownloadRequest = {
  kind: 'download';
  mediaURL: string;
  accountName: string;
  postShortcode?: string;
  /** 1-based slide index; present only when a post has multiple slides. */
  index?: number;
};

export type ExtensionMessage = DownloadRequest;
