export interface MangaMeta {
  name:      string;
  author:    string;
  tags:      string[];
  genres:    string[];
  ep:        string;
  source:    "nhentai" | "mangadex" | "sequential";
  imageUrls: string[];
  /** Sequential only — original image URL used to scan during download */
  scanUrl?:  string;
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

export type Phase =
  | "idle"
  | "looking"
  | "review"
  | "downloading"
  | "done"
  | "error";