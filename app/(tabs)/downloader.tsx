import React, { useRef, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { lookupManga, downloadManga } from "../../services/downloader/index";
import type { MangaMeta, EditedMeta, Phase, DownloadProgress } from "../../services/downloader/types/manga";
import { UrlInput }            from "../../components/ui/mangaDownloader/UrlInput";
import { MetaForm }            from "../../components/ui/mangaDownloader/MetaForm";
import { ProgressBar }         from "../../components/ui/mangaDownloader/ProgressBar";
import { LogConsole }          from "../../components/ui/mangaDownloader/LogConsole";
import { DoneCard, ErrorCard } from "../../components/ui/mangaDownloader/StatusCard";

const EMPTY_EDITED: EditedMeta = { name: "", author: "", tags: "", genres: "", ep: "" };

export default function Downloader() {
  const [url,      setUrl]      = useState("");
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [meta,     setMeta]     = useState<MangaMeta | null>(null);
  const [edited,   setEdited]   = useState<EditedMeta>(EMPTY_EDITED);
  const [progress, setProgress] = useState<DownloadProgress>({ message: "", current: 0, total: 0 });
  const [logs,     setLogs]     = useState<string[]>([]);
  const [savedUri, setSavedUri] = useState("");
  const [error,    setError]    = useState("");
  const cancelRef = useRef({ cancelled: false });

  const log   = (msg: string) => setLogs(p => [...p, msg]);
  const patch  = (key: keyof EditedMeta) => (val: string) =>
    setEdited(p => ({ ...p, [key]: val }));

  const handleLookup = async () => {
    if (!url.trim()) return;
    setPhase("looking");
    setError("");
    setLogs([]);
    try {
      const m = await lookupManga(url.trim());
      setMeta(m);
      setEdited({ name: m.name, author: m.author, tags: m.tags.join(", "), genres: m.genres.join(", "), ep: m.ep });
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      setPhase("error");
    }
  };

  const handleDownload = async () => {
    if (!meta) return;
    cancelRef.current.cancelled = false;
    setPhase("downloading");
    setLogs([]);
    try {
      const uri = await downloadManga(meta, edited, (p: DownloadProgress) => {
        setProgress(p);
        log(p.message);
      }, cancelRef.current);
      setSavedUri(uri);
      setPhase("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Download failed";
      // ✅ FIX: friendly message for ALREADY_EXISTS
      if (msg === "ALREADY_EXISTS") {
        setError("You already have this chapter downloaded.");
      } else if (msg === "CANCELLED") {
        setError("Download cancelled.");
      } else {
        setError(msg);
      }
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setUrl("");
    setMeta(null);
    setEdited(EMPTY_EDITED);
    setLogs([]);
    setError("");
    setSavedUri("");
  };

  const showForm = phase === "review" || phase === "downloading" || phase === "done";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
      <ScrollView
        className="flex-1 bg-[#EBFBE9]"
        contentContainerStyle={{ padding: 20, paddingTop: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-2xl font-bold mb-6">
          <Text className="text-[#38D926]">Manga </Text>
          <Text className="text-black">Downloader</Text>
        </Text>

        <UrlInput
          value={url}
          onChange={setUrl}
          onSubmit={handleLookup}
          loading={phase === "looking"}
        />

        {showForm && meta && (
          <MetaForm
            meta={meta}
            edited={edited}
            phase={phase}
            onChange={patch}
            onDownload={handleDownload}
            onCancel={() => { cancelRef.current.cancelled = true; }}
          />
        )}

        {phase === "downloading" && (
          <ProgressBar current={progress.current} total={progress.total} />
        )}

        {phase === "done"  && <DoneCard  uri={savedUri} onReset={reset} />}
        {phase === "error" && <ErrorCard message={error} onReset={reset} />}

        {logs.length > 0 && (
          <LogConsole logs={logs} loading={phase === "downloading"} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}