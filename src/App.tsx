import React, { useState, useEffect, useRef } from "react";
import { Job } from "./types";
import JobItem from "./components/JobItem";
import { Download, ListRestart, Loader, Trash2, HelpCircle } from "lucide-react";

export default function App() {
  const [inputText, setInputText] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Keep track of which jobs have already been automatically triggered for download
  const autoDownloadedRef = useRef<Set<string>>(new Set());

  // Periodically poll active jobs
  useEffect(() => {
    const activeJobs = jobs.filter(
      (j) => j.status === "waiting" || j.status === "processing" || j.status === "downloading"
    );

    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const ids = activeJobs.map((j) => j.id);
        const res = await fetch("/api/download-jobs/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });

        if (!res.ok) throw new Error("Status check failed");

        const data = await res.json();
        const updatedJobs: Job[] = data.jobs;

        if (updatedJobs && updatedJobs.length > 0) {
          setJobs((currentJobs) =>
            currentJobs.map((job) => {
              const updated = updatedJobs.find((u) => u.id === job.id);
              if (updated) {
                // If job transitioned to completed and wasn't auto-downloaded yet, trigger it
                if (updated.status === "completed" && !autoDownloadedRef.current.has(updated.id)) {
                  autoDownloadedRef.current.add(updated.id);
                  triggerClientDownload(updated.id);
                }
                return updated;
              }
              return job;
            })
          );
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [jobs]);

  // Handle client-side browser file download trigger
  const triggerClientDownload = (jobId: string) => {
    const link = document.createElement("a");
    link.href = `/api/files/${jobId}`;
    link.setAttribute("download", "");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Automatically split multiple pasted links and shift down to a new line
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    
    const items = pastedText.split(/[\s,]+/);
    const formattedItems = items
      .map((item) => {
        const trimmed = item.trim();
        if (!trimmed) return "";
        // Auto-fix protocol if a loose URL was entered
        if (
          !trimmed.startsWith("http://") &&
          !trimmed.startsWith("https://") &&
          (trimmed.includes("facebook.com") ||
            trimmed.includes("tiktok.com") ||
            trimmed.includes("youtube.com") ||
            trimmed.includes("youtu.be") ||
            trimmed.includes("instagram.com") ||
            trimmed.includes("x.com") ||
            trimmed.includes("twitter.com"))
        ) {
          return "https://" + trimmed;
        }
        return trimmed;
      })
      .filter(Boolean);

    // Join with newlines and append a newline to automatically shift down to a new empty line
    const formattedText = formattedItems.join("\n") + "\n";

    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    const beforeVal = inputText.substring(0, start);
    const afterVal = inputText.substring(end);
    
    const newVal = beforeVal + formattedText + afterVal;
    setInputText(newVal);

    // Put cursor focus on the new empty line
    const nextCursor = start + formattedText.length;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  // Extract valid URLs from textarea text
  const extractUrls = (text: string): string[] => {
    const candidates = text.split(/[\s,]+/);
    return candidates
      .map((c) => c.trim())
      .filter((c) => {
        if (!c) return false;
        try {
          const url = new URL(c);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      });
  };

  // Submit jobs to download-jobs endpoint
  const handleDownloadAll = async () => {
    setValidationError(null);
    const urls = extractUrls(inputText);

    if (urls.length === 0) {
      setValidationError("Please paste at least one valid video URL starting with http:// or https://");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/download-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (!res.ok) {
        throw new Error("Failed to start download jobs.");
      }

      const data = await res.json();
      const newJobs: Job[] = data.jobs;

      setJobs((prev) => [...newJobs, ...prev]);
      setInputText(""); // Clear textarea on successful queue
    } catch (err: any) {
      setValidationError(err.message || "An unexpected error occurred while queuing downloads.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasteSample = () => {
    setInputText(
      "https://www.facebook.com/share/v/14fDkav6BN3/\nhttps://www.facebook.com/share/r/1EAhxvodrZ/"
    );
  };

  const handleClearAll = () => {
    setJobs([]);
    autoDownloadedRef.current.clear();
  };

  const handleClearCompleted = () => {
    setJobs((prev) => prev.filter((j) => j.status !== "completed"));
  };

  return (
    <div id="app-container" className="min-h-screen bg-[#BAE6FD] text-black flex items-center justify-center font-sans p-4 sm:p-6 md:p-10 select-none selection:bg-black selection:text-white">
      <div className="max-w-5xl w-full bg-white border-[3px] border-black flex flex-col p-6 sm:p-8 md:p-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        
        {/* Header Block matching theme specification perfectly */}
        <header className="mb-8 border-b-2 border-black pb-6 flex justify-between items-end">
          <h1 className="text-3xl sm:text-4xl font-black text-black uppercase tracking-tighter">
            Video Downloader
          </h1>
          <p className="text-black font-bold text-xs sm:text-sm tracking-widest uppercase">
            Utility v1.0.4
          </p>
        </header>

        {/* Primary Content Grid */}
        <div className="flex flex-col md:flex-row gap-8 md:gap-10 flex-grow">
          
          {/* Left Column: paste and action */}
          <div className="w-full md:w-1/2 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="url-textarea" className="text-xs font-black uppercase tracking-widest text-black">
                Paste URLs (One per line)
              </label>
              <button
                onClick={handlePasteSample}
                className="font-mono text-[9px] uppercase border border-black px-2 py-0.5 hover:bg-[#BAE6FD] transition-colors"
              >
                Sample URL
              </button>
            </div>

            <textarea
              id="url-textarea"
              className="w-full h-48 sm:h-64 border-2 border-black p-4 text-xs sm:text-sm font-mono focus:outline-none focus:ring-0 resize-none bg-white placeholder:text-black/30"
              placeholder="https://www.facebook.com/share/v/14fDkav6BN3/&#10;https://www.tiktok.com/@user/video/123456789&#10;https://x.com/status/987654321..."
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onPaste={handlePaste}
            />

            {validationError && (
              <p className="mt-2 text-[10px] font-mono text-black border border-black border-dashed p-2 bg-[#BAE6FD]">
                [ERROR] {validationError}
              </p>
            )}

            <button
              onClick={handleDownloadAll}
              disabled={isSubmitting}
              className="mt-4 w-full bg-black text-white py-4 text-lg font-black uppercase tracking-[0.2em] hover:bg-[#BAE6FD] hover:text-black border-2 border-black transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  PROCESSING...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  DOWNLOAD ALL
                </>
              )}
            </button>
          </div>

          {/* Right Column: queue & status */}
          <div className="w-full md:w-1/2 flex flex-col border-t-2 md:border-t-0 md:border-l-2 border-black pt-6 md:pt-0 md:pl-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-black">
                Processing Queue
              </h2>
              <span className="text-[10px] bg-black text-white px-2 py-0.5 font-bold uppercase tracking-wide">
                {jobs.length} Video{jobs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {jobs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-black border-dashed min-h-[190px]">
                <HelpCircle className="w-8 h-8 text-black/40 mb-2" />
                <p className="font-mono text-xs text-black/60 uppercase tracking-widest font-bold">
                  Queue is Empty
                </p>
                <p className="font-mono text-[10px] text-black/40 mt-1 uppercase">
                  Paste links on the left and download
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
                {jobs.map((job) => (
                  <JobItem key={job.id} job={job} onDownloadFile={triggerClientDownload} />
                ))}
              </div>
            )}

            {/* Queue Options (when has jobs) */}
            {jobs.length > 0 && (
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={handleClearCompleted}
                  className="font-mono text-[9px] uppercase border border-black px-2.5 py-1 hover:bg-[#BAE6FD] flex items-center gap-1 transition-colors cursor-pointer"
                  title="Remove completed items from lists"
                >
                  <Trash2 className="w-2.5 h-2.5" /> Clear Completed
                </button>
                <button
                  onClick={handleClearAll}
                  className="font-mono text-[9px] uppercase border border-black px-2.5 py-1 hover:bg-[#BAE6FD] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ListRestart className="w-2.5 h-2.5" /> Clear All
                </button>
              </div>
            )}

            {/* Storage tracker widget exactly matching specs */}
            <div className="mt-6 pt-4 border-t border-black border-dashed">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest">Storage Status</span>
                <span className="text-[10px] font-bold">Clean-up in 15m</span>
              </div>
              <div className="w-full h-1 bg-black/10 relative">
                <div className="absolute top-0 left-0 bg-black h-full w-[40%]"></div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer exactly matching design layout */}
        <footer className="mt-8 pt-6 border-t border-black border-dashed flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/70 text-center sm:text-left">
            Videos are automatically deleted 15 minutes after processing
          </p>
          <div className="flex gap-4">
            <div className="h-4 w-4 bg-black"></div>
            <div className="h-4 w-4 bg-[#BAE6FD] border border-black"></div>
            <div className="h-4 w-4 border border-black"></div>
          </div>
        </footer>

      </div>
    </div>
  );
}

