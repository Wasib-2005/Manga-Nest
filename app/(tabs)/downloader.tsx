import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  StatusBar,
} from "react-native";
import { lookupManga, downloadManga } from "../../services/downloader/downloaderIndex";
import type {
  MangaMeta,
  EditedMeta,
  Phase,
  DownloadProgress,
} from "../../services/downloader/types/manga";
import { UrlInput } from "../../components/ui/mangaDownloader/UrlInput";
import { MetaModal } from "../../components/ui/mangaDownloader/MetaModal";
import { ProgressBar } from "../../components/ui/mangaDownloader/ProgressBar";
import { LogConsole } from "../../components/ui/mangaDownloader/LogConsole";
import {
  DoneCard,
  ErrorCard,
} from "../../components/ui/mangaDownloader/StatusCard";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_EDITED: EditedMeta = {
  name: "",
  author: "",
  tags: "",
  genres: "",
  ep: "",
};

// ─── Error Classification ─────────────────────────────────────────────────────

type ErrorType = "cancel" | "partial" | "duplicate" | "network" | "lookup" | "unknown";

interface ErrorState {
  type: ErrorType;
  message: string;
  shouldResetForm: boolean;
}

function classifyError(rawError: string): ErrorState {
  const msg = rawError.toLowerCase();
  if (msg.includes("cancel")) return { type: "cancel", message: "Download cancelled.", shouldResetForm: false };
  if (msg.includes("not all") || msg.includes("partial")) return { type: "partial", message: "Partial download — you can retry.", shouldResetForm: false };
  if (msg.includes("already_exists")) return { type: "duplicate", message: "Chapter already exists.", shouldResetForm: false };
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("http")) return { type: "network", message: "Network error — check connection.", shouldResetForm: false };
  if (msg.includes("lookup") || msg.includes("invalid")) return { type: "lookup", message: rawError, shouldResetForm: true };
  return { type: "unknown", message: rawError || "Unknown error", shouldResetForm: true };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<MangaMeta | null>(null);
  const [edited, setEdited] = useState<EditedMeta>(EMPTY_EDITED);
  const [progress, setProgress] = useState<DownloadProgress>({ message: "", current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [savedUri, setSavedUri] = useState("");
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const cancelRef = useRef({ cancelled: false });

  const log = (msg: string) => setLogs((p) => [...p, msg]);
  const patch = (key: keyof EditedMeta) => (val: string) => setEdited((p) => ({ ...p, [key]: val }));

  const fullReset = () => {
    setPhase("idle");
    setUrl("");
    setMeta(null);
    setEdited(EMPTY_EDITED);
    setLogs([]);
    setErrorState(null);
    setSavedUri("");
    setModalOpen(false);
  };

  const closeError = () => {
    setErrorState(null);
    setPhase("idle");
  };

  const handleLookup = async () => {
    if (!url.trim()) return;
    setPhase("looking");
    setErrorState(null);
    setLogs([]);
    cancelRef.current.cancelled = false;
    try {
      const m = await lookupManga(url.trim());
      setMeta(m);
      setEdited(m.source === "nhentai" ? { name: m.name, author: m.author, tags: m.tags.join(", "), genres: m.genres.join(", "), ep: m.ep } : EMPTY_EDITED);
      setPhase("review");
      setModalOpen(true);
    } catch (e) {
      setErrorState(classifyError(e instanceof Error ? e.message : "Lookup failed"));
      setPhase("error");
    }
  };

  const handleDownload = async () => {
    if (!meta) return;
    cancelRef.current.cancelled = false;
    setPhase("downloading");
    setLogs([]);
    setErrorState(null);
    try {
      const uri = await downloadManga(meta, edited, (p: DownloadProgress) => {
        setProgress(p);
        if (p.message) log(p.message);
      }, cancelRef.current, log);
      setSavedUri(uri);
      setPhase("done");
    } catch (e) {
      setErrorState(classifyError(e instanceof Error ? e.message : "Download failed"));
      setPhase("error");
    }
  };

  const handleModalClose = () => {
    if (phase === "downloading") return;
    setModalOpen(false);
    if (phase !== "done" && phase !== "error") setPhase("idle");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
      {/* Match Status Bar to Dark Theme */}
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      
      <ScrollView
        className="flex-1 bg-[#030712]" // Matched to ReaderScreen Background
        contentContainerStyle={{ padding: 20, paddingTop: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Themed Header */}
        <View className="mb-8">
          <Text className="text-2xl font-black tracking-tight">
            <Text className="text-[#38D926]">Manga </Text>
            <Text className="text-[#f1f5f9]">Nest</Text>
          </Text>
          <Text className="text-[#475569] text-xs font-semibold mt-1 uppercase tracking-widest">
            Downloader Module
          </Text>
        </View>

        {/* URL Input Area */}
        <UrlInput
          value={url}
          onChange={setUrl}
          onSubmit={handleLookup}
          onCancel={() => { cancelRef.current.cancelled = true; }}
          loading={phase === "looking"}
        />

        {/* Progress Display */}
        {phase === "downloading" && (
          <View className="mt-6">
            <ProgressBar current={progress.current} total={progress.total} />
          </View>
        )}

        {/* Console Display */}
        {logs.length > 0 && (
          <View className="mt-6">
            <LogConsole logs={logs} loading={phase === "downloading"} />
          </View>
        )}
      </ScrollView>

      {/* Overlays / Modals */}
      <MetaModal
        visible={modalOpen}
        meta={meta}
        edited={edited}
        phase={phase}
        onChange={patch}
        onDownload={handleDownload}
        onCancel={() => { cancelRef.current.cancelled = true; }}
        onClose={handleModalClose}
      />

      <Modal visible={phase === "done"} transparent animationType="fade">
        <View className="flex-1 bg-black/80 justify-center items-center px-4">
          <View className="w-full max-w-sm">
            <DoneCard uri={savedUri} onReset={fullReset} />
          </View>
        </View>
      </Modal>

      <Modal visible={phase === "error"} transparent animationType="fade">
        <View className="flex-1 bg-black/80 justify-center items-center px-4">
          <View className="w-full max-w-sm">
            {errorState && (
              <ErrorCard
                message={errorState.message}
                onReset={() => errorState.shouldResetForm ? fullReset() : closeError()}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}