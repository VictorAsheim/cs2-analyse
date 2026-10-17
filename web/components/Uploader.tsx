"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Phase = "idle" | "uploading" | "parsing" | "failed";

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(0)} MB`;

export default function Uploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function send(file: File) {
    setError("");
    setPhase("uploading");
    setProgress(0);
    setNote(`${file.name} · ${mb(file.size)}`);

    // XHR rather than fetch: only XHR reports upload progress, and a demo
    // takes long enough to upload that a progress bar is the difference
    // between a usable tool and an apparently hung one.
    const id = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("x-demo-filename", file.name);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let body: { id?: string; error?: string } = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
        if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve(body.id);
        else reject(new Error(body.error ?? `upload failed (HTTP ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("network error during upload"));
      xhr.send(file);
    }).catch((err: Error) => {
      setPhase("failed");
      setError(err.message);
      return null;
    });
    if (!id) return;

    setPhase("parsing");
    setNote("Parser demoen…");

    // Poll until the worker finishes; parsing a 500 MB demo takes seconds.
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      const job = await res.json();
      if (job.status === "done") {
        router.push(`/match/${id}`);
        return;
      }
      if (job.status === "failed") {
        setPhase("failed");
        setError(job.error ?? "parsing failed");
        return;
      }
    }
  }

  const busy = phase === "uploading" || phase === "parsing";

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) void send(file);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition
          ${dragging ? "border-amber-400 bg-amber-400/5" : "border-neutral-700 hover:border-neutral-500"}
          ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".dem"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
            e.target.value = "";
          }}
        />
        <p className="text-lg font-medium text-neutral-200">
          {busy ? note : "Dra en .dem-fil hit"}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {busy ? "" : "eller klikk for å velge fil"}
        </p>

        {phase === "uploading" && (
          <div className="mx-auto mt-5 max-w-md">
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-amber-400 transition-[width] duration-150"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs tabular-nums text-neutral-500">
              laster opp {(progress * 100).toFixed(0)} %
            </p>
          </div>
        )}

        {phase === "parsing" && (
          <p className="mt-5 text-sm text-amber-400">
            <span className="inline-block animate-pulse">●</span> parser demoen
          </p>
        )}
      </div>

      {error && (
        <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
