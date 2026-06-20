export interface Job {
  id: string;
  url: string;
  status: "waiting" | "processing" | "downloading" | "completed" | "failed";
  progress: number;
  speed: string;
  size: string;
  eta: string;
  filename?: string;
  error?: string;
  addedAt: number;
}
