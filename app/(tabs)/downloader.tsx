import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import {
  lookupManga,
  downloadManga,
} from "../../services/downloader/downloaderIndex";
import { UrlInput } from "../../components/ui/mangaDownloader/UrlInput";
import { MetaModal } from "../../components/ui/mangaDownloader/MetaModal";
import { ProgressBar } from "../../components/ui/mangaDownloader/ProgressBar";
import { LogConsole } from "../../components/ui/mangaDownloader/LogConsole";
import type {
  MangaMeta,
  EditedMeta,
  Phase,
  DownloadProgress,
} from "../../services/downloader/types/manga";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ItemStatus =
  | "looking"      // metadata fetch in progress
  | "review"       // waiting in modal review queue
  | "queued"       // confirmed, waiting for download slot
  | "downloading"  // actively downloading
  | "done"
  | "error"
  | "cancelled";

interface QueueItem {
  id:        string;
  url:       string;
  status:    ItemStatus;
  name?:     string;
  errorMsg?: string;
  // Stored after lookup, used when download starts
  meta?:     MangaMeta;
  edited?:   EditedMeta;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_EDITED: EditedMeta = { name: "", author: "", tags: "", genres: "", ep: "" };
const genId = () => Math.random().toString(36).slice(2, 9);

const STATUS_ICON: Record<ItemStatus, string> = {
  looking:     "⟳",
  review:      "◈",
  queued:      "○",
  downloading: "↓",
  done:        "✓",
  error:       "✗",
  cancelled:   "⊘",
};

const STATUS_COLOR: Record<ItemStatus, string> = {
  looking:     "#60a5fa",
  review:      "#a78bfa",
  queued:      "#475569",
  downloading: "#38D926",
  done:        "#38D926",
  error:       "#ef4444",
  cancelled:   "#f59e0b",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Downloader() {
  const [urlInput,  setUrlInput]  = useState("");
  const [queue,     setQueue]     = useState<QueueItem[]>([]);
  const [progress,  setProgress]  = useState<DownloadProgress>({ message: "", current: 0, total: 0 });
  const [logs,      setLogs]      = useState<string[]>([]);

  // Modal state — shows one review at a time
  const [modalOpen,    setModalOpen]    = useState(false);
  const [modalMeta,    setModalMeta]    = useState<MangaMeta | null>(null);
  const [modalEdited,  setModalEdited]  = useState<EditedMeta>(EMPTY_EDITED);
  const [modalItemId,  setModalItemId]  = useState<string | null>(null);

  const cancelDownloadRef = useRef({ cancelled: false });
  const queueRef          = useRef<QueueItem[]>([]);
  // IDs of items whose metadata is ready but modal hasn't shown yet
  const reviewQueueRef    = useRef<string[]>([]);
  // Whether the download worker is currently running
  const downloadingRef    = useRef(false);

  // ── Queue sync ──────────────────────────────────────────────────────────────

  const syncQueue = (next: QueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
  };

  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    syncQueue(queueRef.current.map(q => q.id === id ? { ...q, ...patch } : q));

  const log = (msg: string) => setLogs(p => [...p, msg]);

  // ── Add URL → lookup immediately, independent of downloads ─────────────────

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    // Skip exact duplicate that's still active
    if (queueRef.current.some(q =>
      q.url === trimmed &&
      !["done", "error", "cancelled"].includes(q.status)
    )) {
      setUrlInput("");
      return;
    }

    const id = genId();
    syncQueue([...queueRef.current, { id, url: trimmed, status: "looking" }]);
    setUrlInput("");

    // Fire lookup immediately — does NOT wait for any download
    runLookup(id, trimmed);
  };

  // ── Lookup pipeline (always immediate) ─────────────────────────────────────

  const runLookup = async (id: string, url: string) => {
    try {
      const m = await lookupManga(url);

      const resolved: EditedMeta = {
        name:   m.name   || "",
        author: m.author || "",
        tags:   Array.isArray(m.tags)   ? m.tags.join(", ")   : "",
        genres: Array.isArray(m.genres) ? m.genres.join(", ") : "",
        ep:     m.ep     || "",
      };

      // Save meta+edited on the item, mark as review
      updateItem(id, { status: "review", name: m.name, meta: m, edited: resolved });

      // Push into the modal review queue and try to show it
      reviewQueueRef.current.push(id);
      tryShowNextReview();
    } catch (e: any) {
      updateItem(id, { status: "error", errorMsg: e.message || "Lookup failed" });
    }
  };

  // ── Modal review queue — show one modal at a time ──────────────────────────

  const tryShowNextReview = () => {
    if (modalOpen) return; // already showing one, will re-trigger on close
    if (reviewQueueRef.current.length === 0) return;

    const nextId = reviewQueueRef.current.shift()!;
    const item   = queueRef.current.find(q => q.id === nextId);
    if (!item || !item.meta || !item.edited) return;

    setModalItemId(nextId);
    setModalMeta(item.meta);
    setModalEdited(item.edited);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    // Show next queued review after a tick (lets modal animate out)
    setTimeout(tryShowNextReview, 300);
  };

  // ── User confirms metadata → add to download queue ─────────────────────────

  const handleConfirm = () => {
    if (!modalItemId || !modalMeta) return;
    const id = modalItemId;

    // Persist the (possibly edited) meta back onto the item
    updateItem(id, { status: "queued", edited: modalEdited });

    setModalOpen(false);
    setTimeout(tryShowNextReview, 300);

    // Kick off the download worker if it's idle
    if (!downloadingRef.current) {
      runNextDownload();
    }
  };

  // ── User skips item in modal ────────────────────────────────────────────────

  const handleSkip = () => {
    if (modalItemId) updateItem(modalItemId, { status: "cancelled" });
    handleModalClose();
  };

  // ── Download worker — processes one "queued" item at a time ────────────────

  const runNextDownload = async () => {
    const item = queueRef.current.find(q => q.status === "queued");
    if (!item || !item.meta || !item.edited) {
      downloadingRef.current = false;
      return;
    }

    downloadingRef.current = true;
    cancelDownloadRef.current.cancelled = false;

    updateItem(item.id, { status: "downloading" });
    setLogs([]);
    setProgress({ message: "", current: 0, total: 0 });

    try {
      await downloadManga(
        item.meta,
        item.edited,
        (p) => {
          setProgress(p);
          if (p.message) log(p.message);
        },
        cancelDownloadRef.current,
        log,
      );

      updateItem(item.id, { status: "done" });
    } catch (e: any) {
      const isCancelled = e.message === "CANCELLED";
      updateItem(item.id, {
        status:   isCancelled ? "cancelled" : "error",
        errorMsg: isCancelled ? undefined : (e.message || "Download failed"),
      });
      if (isCancelled) {
        downloadingRef.current = false;
        return;
      }
    }

    // Move to next queued item
    runNextDownload();
  };

  // ── Misc ────────────────────────────────────────────────────────────────────

  const removeItem = (id: string) =>
    syncQueue(queueRef.current.filter(q => q.id !== id));

  const clearFinished = () =>
    syncQueue(queueRef.current.filter(q =>
      !["done", "error", "cancelled"].includes(q.status)
    ));

  const patchEdited = (key: keyof EditedMeta) => (val: string) =>
    setModalEdited(p => ({ ...p, [key]: val }));

  // ── Derived ─────────────────────────────────────────────────────────────────

  const activeDownload  = queue.find(q => q.status === "downloading");
  const hasFinished     = queue.some(q => ["done", "error", "cancelled"].includes(q.status));
  const doneCount       = queue.filter(q => q.status === "done").length;

  // phase prop MetaModal needs — only "review" or "downloading" matter here
  const modalPhase: Phase = "review";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      <ScrollView
        className="flex-1 bg-[#030712]"
        contentContainerStyle={{ padding: 20, paddingTop: 60 }}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View className="mb-8">
          <Text className="text-3xl font-black text-[#f1f5f9] tracking-tight">
            <Text>Manga </Text>
            <Text className="text-[#38D926]">Nest</Text>
          </Text>
          <Text className="font-normal text-[11px] text-white mt-[-1rem] ml-[10.3rem]">
            -Downloader
          </Text>
        </View>

        {/* ── URL input — always available ────────────────────────────────── */}
        <UrlInput
          value={urlInput}
          onChange={setUrlInput}
          onSubmit={handleAddUrl}
          loading={false}   // lookup is fire-and-forget, no spinner on input
          onCancel={() => {}}
        />

        {/* ── Active download banner ──────────────────────────────────────── */}
        {activeDownload && (
          <View className="mb-4 bg-[#0f172a] border border-[#1e293b] rounded-2xl px-4 py-3">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-[#38D926] text-[10px] font-bold uppercase tracking-widest">
                Downloading
              </Text>
              <TouchableOpacity
                onPress={() => { cancelDownloadRef.current.cancelled = true; }}
                className="bg-red-500/20 border border-red-500 rounded-lg px-3 py-1"
              >
                <Text className="text-red-500 text-[10px] font-bold">STOP</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-[#f1f5f9] text-xs mb-2" numberOfLines={1}>
              {activeDownload.name || activeDownload.url}
            </Text>
            <ProgressBar current={progress.current} total={progress.total} />
          </View>
        )}

        {/* ── Queue list ──────────────────────────────────────────────────── */}
        {queue.length > 0 && (
          <View className="mt-2">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-[#38D926] text-[10px] font-bold uppercase tracking-widest">
                Queue · {doneCount}/{queue.length} done
              </Text>
              {hasFinished && (
                <TouchableOpacity onPress={clearFinished}>
                  <Text className="text-[#475569] text-[10px] font-semibold">
                    Clear finished
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {queue.map(item => (
              <View
                key={item.id}
                className="flex-row items-center bg-[#0f172a] border border-[#1e293b] rounded-xl px-3 py-2 mb-2"
              >
                <Text style={{ color: STATUS_COLOR[item.status], width: 18, textAlign: "center", fontSize: 13 }}>
                  {STATUS_ICON[item.status]}
                </Text>

                <View className="flex-1 mx-2">
                  <Text className="text-[#f1f5f9] text-[11px]" numberOfLines={1}>
                    {item.name || item.url}
                  </Text>
                  {item.status === "looking" && (
                    <Text className="text-[#60a5fa] text-[9px] mt-0.5">Fetching metadata…</Text>
                  )}
                  {item.status === "review" && (
                    <Text className="text-[#a78bfa] text-[9px] mt-0.5">Waiting for review…</Text>
                  )}
                  {item.status === "queued" && (
                    <Text className="text-[#475569] text-[9px] mt-0.5">Queued for download…</Text>
                  )}
                  {item.errorMsg && (
                    <Text className="text-red-400 text-[9px] mt-0.5" numberOfLines={1}>
                      {item.errorMsg}
                    </Text>
                  )}
                </View>

                {item.status === "downloading" && (
                  <View style={{ width: 56 }}>
                    <ProgressBar current={progress.current} total={progress.total} />
                  </View>
                )}

                {(item.status === "queued") && (
                  <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={10}>
                    <Text className="text-[#334155] text-base leading-none">✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Log console ─────────────────────────────────────────────────── */}
        {logs.length > 0 && (
          <View className="mt-4">
            <LogConsole logs={logs} loading={!!activeDownload} />
          </View>
        )}

      </ScrollView>

      {/* ── MetaModal ────────────────────────────────────────────────────── */}
      <MetaModal
        visible={modalOpen}
        meta={modalMeta}
        edited={modalEdited}
        phase={modalPhase}
        onChange={patchEdited}
        onDownload={handleConfirm}
        onCancel={handleSkip}
        onClose={handleModalClose}
      />

    </KeyboardAvoidingView>
  );
}