export interface MangaMeta {
  name:      string;
  author:    string;
  tags:      string[];
  genres:    string[];
  ep:        string;
  source:    "nhentai" | "mangadex";
  imageUrls: string[];
}

export interface EditedMeta {
  name:   string;
  author: string;
  tags:   string;
  genres: string;
  ep:     string;
}

export interface DownloadProgress {
  message: string;
  current: number;
  total:   number;
}

// ✅ FIX: Phase was used in UI components but never defined
export type Phase =
  | "idle"
  | "looking"
  | "review"
  | "downloading"
  | "done"
  | "error";