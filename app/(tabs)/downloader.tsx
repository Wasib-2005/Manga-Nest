import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
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

// ─── Error Type Classification ───────────────────────────────────────────────

type ErrorType =
  | "cancel"
  | "partial"
  | "duplicate"
  | "network"
  | "lookup"
  | "unknown";

interface ErrorState {
  type: ErrorType;
  message: string;
  shouldResetForm: boolean; // true = full reset, false = keep form for retry
}

/**
 * Classifies error by message and determines if form should reset.
 *
 * Non-reset errors (user can retry with same settings):
 *   - Cancel: User manually stopped download
 *   - Partial: Some pages failed, can resume
 *   - Duplicate: Already downloaded, change title/ep and retry
 *   - Network: Connection failed, retry later
 *
 * Reset errors (need fresh start):
 *   - Lookup: Invalid URL, need new URL
 *   - Unknown: Unexpected error, start over
 */
function classifyError(rawError: string): ErrorState {
  const msg = rawError.toLowerCase();

  // ✋ User cancelled
  if (msg.includes("cancel")) {
    return {
      type: "cancel",
      message: "Download cancelled — you can retry with the same settings",
      shouldResetForm: false,
    };
  }

  // 📄 Some pages failed
  if (msg.includes("not all") || msg.includes("partial")) {
    return {
      type: "partial",
      message: "Not all pages downloaded — you can retry from where it stopped",
      shouldResetForm: false,
    };
  }

  // 📦 Already have this chapter
  if (msg.includes("already_exists") || msg.includes("already have")) {
    return {
      type: "duplicate",
      message:
        "You already have this chapter — change the title or episode number to retry",
      shouldResetForm: false,
    };
  }

  // 🌐 Network/HTTP issues
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout") ||
    msg.includes("http") ||
    msg.includes("error 40") ||
    msg.includes("error 50")
  ) {
    return {
      type: "network",
      message: "Network error — check your connection and retry",
      shouldResetForm: false,
    };
  }

  // 🔍 Invalid URL/lookup failed
  if (
    msg.includes("lookup") ||
    msg.includes("invalid") ||
    msg.includes("unsupported")
  ) {
    return {
      type: "lookup",
      message: rawError,
      shouldResetForm: true,
    };
  }

  // ❓ Unexpected error
  return {
    type: "unknown",
    message: rawError || "Unknown error",
    shouldResetForm: true,
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Downloader() {
  // Form state
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");

  // Metadata state
  const [meta, setMeta] = useState<MangaMeta | null>(null);
  const [edited, setEdited] = useState<EditedMeta>(EMPTY_EDITED);

  // Download state
  const [progress, setProgress] = useState<DownloadProgress>({
    message: "",
    current: 0,
    total: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [savedUri, setSavedUri] = useState("");

  // Error state
  const [errorState, setErrorState] = useState<ErrorState | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);

  // Cancel reference
  const cancelRef = useRef({ cancelled: false });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const log = (msg: string) => setLogs((p) => [...p, msg]);

  const patch = (key: keyof EditedMeta) => (val: string) =>
    setEdited((p) => ({ ...p, [key]: val }));

  // ── Reset Functions ───────────────────────────────────────────────────────

  /**
   * Full reset — clear everything, back to idle
   * Used after: success or serious error
   */
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

  /**
   * Partial reset — close error, but keep URL + metadata
   * Used after: retryable errors (cancel, partial, duplicate, network)
   * User can click buttons to retry immediately
   */
  const closeError = () => {
    setErrorState(null);
    setPhase("idle");
    // URL and metadata stay visible for retry
  };

  // ── Lookup Handler ────────────────────────────────────────────────────────

  const handleLookup = async () => {
    if (!url.trim()) return;

    setPhase("looking");
    setErrorState(null);
    setLogs([]);
    cancelRef.current.cancelled = false;

    try {
      const m = await lookupManga(url.trim());
      setMeta(m);

      // nhentai auto-fills metadata; mangadex + sequential leave blank for user
      setEdited(
        m.source === "nhentai"
          ? {
              name: m.name,
              author: m.author,
              tags: m.tags.join(", "),
              genres: m.genres.join(", "),
              ep: m.ep,
            }
          : EMPTY_EDITED,
      );

      setPhase("review");
      setModalOpen(true);
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : "Lookup failed";
      const error = classifyError(rawMsg);
      setErrorState(error);
      setPhase("error");
    }
  };

  // ── Download Handler ──────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!meta) return;

    cancelRef.current.cancelled = false;
    setPhase("downloading");
    setLogs([]);
    setErrorState(null);

    try {
      const uri = await downloadManga(
        meta,
        edited,
        (p: DownloadProgress) => {
          setProgress(p);
          if (p.message) log(p.message);
        },
        cancelRef.current,
        log, // sequential scan messages
      );

      setSavedUri(uri);
      setPhase("done");
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : "Download failed";
      const error = classifyError(rawMsg);
      setErrorState(error);
      setPhase("error");
    }
  };

  // ── Error Modal Handler ───────────────────────────────────────────────────

  const handleCloseError = () => {
    if (!errorState) return;

    if (errorState.shouldResetForm) {
      // Fatal error: reset everything
      fullReset();
    } else {
      // Retryable error: close modal, keep form
      closeError();
    }
  };

  // ── MetaModal Close Handler ───────────────────────────────────────────────

  const handleModalClose = () => {
    if (phase === "downloading") return; // can't close during download
    setModalOpen(false);
    if (phase !== "done" && phase !== "error") {
      setPhase("idle");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 bg-[#EBFBE9]"
        contentContainerStyle={{ padding: 20, paddingTop: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text className="text-2xl font-bold mb-6">
          <Text className="text-[#38D926]">Manga </Text>
          <Text className="text-black">Downloader</Text>
        </Text>

        {/* URL Input */}
        <UrlInput
          value={url}
          onChange={setUrl}
          onSubmit={handleLookup}
          onCancel={() => {
            cancelRef.current.cancelled = true;
          }}
          loading={phase === "looking"}
        />

        {/* Progress Bar (during download) */}
        {phase === "downloading" && (
          <ProgressBar current={progress.current} total={progress.total} />
        )}

        {/* Logs Console */}
        {logs.length > 0 && (
          <LogConsole logs={logs} loading={phase === "downloading"} />
        )}
      </ScrollView>

      {/* ── Metadata Modal (review + download) ── */}
      <MetaModal
        visible={modalOpen}
        meta={meta}
        edited={edited}
        phase={phase}
        onChange={patch}
        onDownload={handleDownload}
        onCancel={() => {
          cancelRef.current.cancelled = true;
        }}
        onClose={handleModalClose}
      />

      {/* ── Success Modal ── */}
      <Modal visible={phase === "done"} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center px-4">
          <View className="w-full max-w-sm">
            <DoneCard uri={savedUri} onReset={fullReset} />
          </View>
        </View>
      </Modal>

      {/* ── Error Modal ── */}
      <Modal visible={phase === "error"} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center px-4">
          <View className="w-full max-w-sm">
            {errorState && (
              <ErrorCard
                message={errorState.message}
                onReset={handleCloseError}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
