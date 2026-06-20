import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;
const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");
const YTDLP_PATH = path.join(process.cwd(), "yt-dlp");

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Ensure yt-dlp is downloaded
async function ensureYtdlp() {
  if (fs.existsSync(YTDLP_PATH)) {
    console.log("yt-dlp is already present.");
    return;
  }
  console.log("Downloading yt-dlp...");
  try {
    const res = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp");
    if (!res.ok) throw new Error(`Failed to fetch yt-dlp: status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(YTDLP_PATH, buffer);
    fs.chmodSync(YTDLP_PATH, "755");
    console.log("yt-dlp downloaded successfully. Size:", buffer.length);
  } catch (error) {
    console.error("Error downloading yt-dlp:", error);
  }
}

// In-memory job state
interface Job {
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

const jobs = new Map<string, Job>();

app.use(express.json());

// API: Post URLs to start downloading
app.post("/api/download-jobs", (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Missing or invalid urls array." });
  }

  const newJobs: Job[] = [];

  for (const rawUrl of urls) {
    const trimmed = rawUrl.trim();
    if (!trimmed) continue;

    // Validate URL shape
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      continue;
    }

    const id = Math.random().toString(36).substring(2, 11);
    const job: Job = {
      id,
      url: trimmed,
      status: "waiting",
      progress: 0,
      speed: "",
      size: "",
      eta: "",
      addedAt: Date.now(),
    };

    jobs.set(id, job);
    newJobs.push(job);

    // Kickoff separate download in background
    runYtdlpDownload(id, trimmed);
  }

  res.json({ jobs: newJobs });
});

// API: Get status of multiple jobs
app.post("/api/download-jobs/status", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: "Ids array required." });
  }

  const statusList = ids.map(id => jobs.get(id)).filter((job): job is Job => !!job);
  res.json({ jobs: statusList });
});

// API: Serve finished files
app.get("/api/files/:id", (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).send("Download job not found.");
  }
  if (job.status !== "completed") {
    return res.status(400).send("Video is not finished downloading yet.");
  }

  const jobDir = path.join(DOWNLOADS_DIR, id);
  if (!fs.existsSync(jobDir)) {
    return res.status(404).send("File directory no longer exists on server.");
  }

  try {
    const files = fs.readdirSync(jobDir);
    // Find first file that isn't a partial download
    const videoFile = files.find(file => !file.endsWith(".part") && !file.endsWith(".ytdl"));
    if (!videoFile) {
      return res.status(404).send("Downloaded video file not found.");
    }

    const fullPath = path.join(jobDir, videoFile);
    // Explicitly set headers to prevent browser from playing/streaming the file inline
    const asciiFallback = videoFile.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, '\\"');
    const safeFilename = encodeURIComponent(videoFile).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFallback}"; filename*=UTF-8''${safeFilename}`);
    res.sendFile(fullPath);
  } catch (error) {
    console.error("Error serving file:", error);
    res.status(500).send("Error serving video file.");
  }
});

// yt-dlp execution helper
function runYtdlpDownload(jobId: string, url: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = "processing";

  const jobDir = path.join(DOWNLOADS_DIR, jobId);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  // Format selection prioritizing 1080p and lower
  const formatStr = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";

  console.log(`Starting download for job ${jobId}: ${url}`);

  const child = spawn("python3", [
    YTDLP_PATH,
    "-f", formatStr,
    "--no-playlist",
    "--no-colors",
    "--newline",
    "-o", path.join(jobDir, "%(title).100s.%(ext)s"),
    url
  ]);

  let stderrLog = "";

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check progress percentages e.g. [download]   5.2% of ~13.56MiB at 410.23KiB/s ETA 00:31
      if (trimmed.startsWith("[download]")) {
        const percentMatch = trimmed.match(/(\d+(?:\.\d+)?)%/);
        if (percentMatch) {
          const progress = parseFloat(percentMatch[1]);
          const currentJob = jobs.get(jobId);
          if (currentJob) {
            currentJob.status = "downloading";
            currentJob.progress = progress;

            // Optional parsing of sizes, speeds, and ETAs
            const sizeMatch = trimmed.match(/of\s+(\S+)/);
            if (sizeMatch) currentJob.size = sizeMatch[1];

            const speedMatch = trimmed.match(/at\s+(\S+)/);
            if (speedMatch) currentJob.speed = speedMatch[1];

            const etaMatch = trimmed.match(/ETA\s+(\S+)/);
            if (etaMatch) currentJob.eta = etaMatch[1];
          }
        }
      }
    }
  });

  child.stderr.on("data", (data) => {
    stderrLog += data.toString();
  });

  child.on("close", (code) => {
    const currentJob = jobs.get(jobId);
    if (!currentJob) return;

    if (code === 0) {
      // Find the file that was downloaded
      try {
        if (fs.existsSync(jobDir)) {
          const files = fs.readdirSync(jobDir);
          const videoFile = files.find(file => !file.endsWith(".part") && !file.endsWith(".ytdl"));
          if (videoFile) {
            currentJob.status = "completed";
            currentJob.progress = 100;
            currentJob.filename = videoFile;
            console.log(`Download completed for job ${jobId}: ${videoFile}`);
          } else {
            throw new Error("No downloaded file found in directory");
          }
        } else {
          throw new Error("Job directory missing after download");
        }
      } catch (err: any) {
        currentJob.status = "failed";
        currentJob.error = err.message || "Failed to find downloaded file";
        console.error(`Status check failed for job ${jobId}:`, err);
      }
    } else {
      currentJob.status = "failed";
      // Format a clean, descriptive error
      let displayError = "Download failed.";
      if (stderrLog.includes("Unsupported URL")) {
        displayError = "Unsupported video platform or URL.";
      } else if (stderrLog.includes("Private video") || stderrLog.includes("Sign in")) {
        displayError = "Access denied (video is private or requires login).";
      } else if (stderrLog.includes("Unable to download webpage")) {
        displayError = "Unable to reach platform. Check URL configuration.";
      } else {
        const lastLine = stderrLog.trim().split("\n").pop() || "";
        if (lastLine.startsWith("ERROR:")) {
          displayError = lastLine.replace("ERROR:", "").trim();
        }
      }
      currentJob.error = displayError;
      console.warn(`Download failed for job ${jobId} with code ${code}. Error: ${displayError}`);
    }
  });
}

// Periodic cleanup: delete files older than 15 minutes of modification.
// This runs every 2 minutes.
setInterval(() => {
  const expirationMs = 15 * 60 * 1000; // 15 minutes
  const now = Date.now();

  try {
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const entries = fs.readdirSync(DOWNLOADS_DIR);
      for (const entry of entries) {
        const entryPath = path.join(DOWNLOADS_DIR, entry);
        const stats = fs.statSync(entryPath);

        // Calculate age
        const age = now - stats.mtimeMs;
        if (stats.isDirectory() && age > expirationMs) {
          console.log(`Cleaning up expired job directory: ${entry}`);
          fs.rmSync(entryPath, { recursive: true, force: true });
          // Also remove from jobs map
          jobs.delete(entry);
        }
      }
    }
  } catch (error) {
    console.error("Error during periodic cleanup:", error);
  }
}, 2 * 60 * 1000); // every 2 minutes

// Start server initialization
async function startServer() {
  await ensureYtdlp();

  // Serve static assets in production, otherwise spin up Vite development server middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server starting on port ${PORT}`);
  });
}

startServer();
