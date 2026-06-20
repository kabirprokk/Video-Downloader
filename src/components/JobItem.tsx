import { Job } from "../types";
import { Download, Loader, Check, AlertTriangle } from "lucide-react";

interface JobItemProps {
  key?: string | number;
  job: Job;
  onDownloadFile: (jobId: string) => void;
}

export default function JobItem({ job, onDownloadFile }: JobItemProps) {
  // Format the platform or display name from URL
  const getDomainName = (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      const host = url.hostname.replace("www.", "");
      return host.split(".")[0].toUpperCase();
    } catch {
      return "EXTERNAL";
    }
  };

  const domain = getDomainName(job.url);
  const isDownloading = job.status === "downloading";
  const bgClass = isDownloading ? "bg-[#BAE6FD]" : "bg-white";

  return (
    <div className={`border-2 border-black p-4 flex flex-col gap-3 justify-between ${bgClass} transition-colors duration-200 select-none`}>
      <div className="flex-grow min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <p className="text-[10px] font-black uppercase tracking-widest text-black/60">
            {domain} Video
          </p>
          <span className="font-mono text-[10px] text-black/50 truncate max-w-full block">
            {job.url.length > 40 ? `${job.url.substring(0, 40)}...` : job.url}
          </span>
        </div>

        {/* Title or output filename */}
        <h3 className="font-mono text-xs font-bold text-black truncate mb-2">
          {job.filename ? job.filename : "Extracting streams..."}
        </h3>

        {/* Progress bar and metadata indicators */}
        {(job.status === "downloading" || job.status === "processing") && (
          <div className="flex flex-col gap-1 w-full mt-2">
            <div className="h-1.5 bg-white border border-black overflow-hidden relative">
              <div
                className="h-full bg-black transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            
            <div className="flex items-center justify-between font-mono text-[9px] text-black mt-1 flex-wrap gap-x-2">
              <span className="font-bold">{Math.round(job.progress)}% downloaded</span>
              <div className="flex items-center gap-1.5">
                {job.size && <span>{job.size}</span>}
                {job.speed && <span>• {job.speed}</span>}
                {job.eta && <span>• ETA {job.eta}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Failed error message */}
        {job.status === "failed" && job.error && (
          <p className="font-mono text-[10px] text-black border border-black border-dashed p-2 bg-white flex items-start gap-1.5 mt-2">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-black" />
            <span>{job.error}</span>
          </p>
        )}
      </div>

      {/* Action and status section */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-black/10 flex-wrap">
        {/* Status badges matching Design Theme perfectly */}
        <div className="flex items-center font-mono text-[10px] font-black">
          {job.status === "waiting" && (
            <span className="px-2 py-0.5 border border-black text-black">
              WAITING
            </span>
          )}
          {job.status === "processing" && (
            <span className="px-2 py-0.5 border border-black text-black bg-white">
              PROCESSING
            </span>
          )}
          {job.status === "downloading" && (
            <span className="px-2 py-0.5 bg-black text-white">
              DOWNLOADING
            </span>
          )}
          {job.status === "completed" && (
            <span className="px-2 py-0.5 bg-black text-white">
              COMPLETED
            </span>
          )}
          {job.status === "failed" && (
            <span className="px-2 py-0.5 border border-black text-black break-keep line-through">
              FAILED
            </span>
          )}
        </div>

        {/* Action Button */}
        {job.status === "completed" && (
          <button
            onClick={() => onDownloadFile(job.id)}
            className="inline-flex items-center gap-1 font-mono font-black text-[10px] bg-black text-white hover:bg-[#BAE6FD] hover:text-black border border-black px-2.5 py-1 transition-colors duration-150 cursor-pointer"
          >
            <Download className="w-3 h-3" /> DOWNLOAD
          </button>
        )}
      </div>
    </div>
  );
}

