import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus =
  | "looking"
  | "review"
  | "queued"
  | "downloading"
  | "done"
  | "error"
  | "cancelled";

interface QueueItem {
  id: string;
  url: string;
  status: ItemStatus;
  name?: string;
  errorMsg?: string;
  meta?: MangaMeta;
  edited?: EditedMeta;
}

const EMPTY_EDITED: EditedMeta = {
  name: "",
  author: "",
  tags: "",
  genres: "",
  ep: "",
};
const genId = () => Math.random().toString(36).slice(2, 9);

const STATUS_ICON: Record<ItemStatus, string> = {
  looking: "loading",
  review: "eye-outline",
  queued: "clock-outline",
  downloading: "download",
  done: "check-circle",
  error: "alert-circle",
  cancelled: "cancel",
};

const STATUS_COLOR: Record<ItemStatus, string> = {
  looking: "#60a5fa",
  review: "#a78bfa",
  queued: "#475569",
  downloading: "#38D926",
  done: "#38D926",
  error: "#ef4444",
  cancelled: "#f59e0b",
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  looking: "Fetching metadata…",
  review: "Awaiting review",
  queued: "Queued",
  downloading: "Downloading",
  done: "Done",
  error: "Failed",
  cancelled: "Skipped",
};

// ─── Queue Item Row ───────────────────────────────────────────────────────────

const QueueRow = ({
  item,
  progress,
  onRemove,
}: {
  item: QueueItem;
  progress: DownloadProgress;
  onRemove: (id: string) => void;
}) => {
  const color = STATUS_COLOR[item.status];
  const isActive = item.status === "downloading";

  return (
    <View style={[q.row, isActive && q.rowActive]}>
      {/* Status icon */}
      <View
        style={[
          q.iconWrap,
          { borderColor: color + "40", backgroundColor: color + "12" },
        ]}
      >
        <MaterialCommunityIcons
          name={STATUS_ICON[item.status] as any}
          size={14}
          color={color}
        />
      </View>

      {/* Info */}
      <View style={q.info}>
        <Text style={q.name} numberOfLines={1}>
          {item.name || item.url}
        </Text>
        <Text style={[q.sublabel, { color }]}>
          {item.errorMsg || STATUS_LABEL[item.status]}
        </Text>
        {isActive && progress.total > 0 && (
          <View style={q.miniBar}>
            <View
              style={[
                q.miniBarFill,
                {
                  width:
                    `${Math.round((progress.current / progress.total) * 100)}%` as any,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* Remove button for queued only */}
      {item.status === "queued" && (
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
          hitSlop={12}
          style={q.removeBtn}
        >
          <MaterialCommunityIcons name="close" size={14} color="#334155" />
        </TouchableOpacity>
      )}

      {/* Page count badge for active */}
      {isActive && progress.total > 0 && (
        <View style={q.countBadge}>
          <Text style={q.countText}>
            {progress.current}/{progress.total}
          </Text>
        </View>
      )}
    </View>
  );
};

const q = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0e17",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#141c2b",
    gap: 10,
  },
  rowActive: {
    borderColor: "#38D92630",
    backgroundColor: "#38D92606",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1, gap: 3 },
  name: { color: "#f1f5f9", fontSize: 12, fontWeight: "700" },
  sublabel: { fontSize: 10, fontWeight: "600" },
  miniBar: {
    height: 3,
    backgroundColor: "#1e293b",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  miniBarFill: {
    height: "100%",
    backgroundColor: "#38D926",
    borderRadius: 2,
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
  },
  countBadge: {
    backgroundColor: "#38D92618",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#38D92640",
  },
  countText: { color: "#38D926", fontSize: 9, fontWeight: "800" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Downloader() {
  const [urlInput, setUrlInput] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [progress, setProgress] = useState<DownloadProgress>({
    message: "",
    current: 0,
    total: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMeta, setModalMeta] = useState<MangaMeta | null>(null);
  const [modalEdited, setModalEdited] = useState<EditedMeta>(EMPTY_EDITED);
  const [modalItemId, setModalItemId] = useState<string | null>(null);

  const cancelRef = useRef({ cancelled: false });
  const queueRef = useRef<QueueItem[]>([]);
  const reviewQueueRef = useRef<string[]>([]);
  const downloadingRef = useRef(false);

  const syncQueue = (next: QueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
  };
  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    syncQueue(
      queueRef.current.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    );
  const log = (msg: string) => setLogs((p) => [...p.slice(-199), msg]);

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (
      queueRef.current.some(
        (q) =>
          q.url === trimmed &&
          !["done", "error", "cancelled"].includes(q.status),
      )
    ) {
      setUrlInput("");
      return;
    }

    const id = genId();
    syncQueue([...queueRef.current, { id, url: trimmed, status: "looking" }]);
    setUrlInput("");
    runLookup(id, trimmed);
  };

  const runLookup = async (id: string, url: string) => {
    try {
      const m = await lookupManga(url);
      const resolved: EditedMeta = {
        name: m.name || "",
        author: m.author || "",
        tags: Array.isArray(m.tags) ? m.tags.join(", ") : "",
        genres: Array.isArray(m.genres) ? m.genres.join(", ") : "",
        ep: m.ep || "",
      };
      updateItem(id, {
        status: "review",
        name: m.name,
        meta: m,
        edited: resolved,
      });
      reviewQueueRef.current.push(id);
      tryShowNextReview();
    } catch (e: any) {
      updateItem(id, {
        status: "error",
        errorMsg: e.message || "Lookup failed",
      });
    }
  };

  const tryShowNextReview = () => {
    if (modalOpen || reviewQueueRef.current.length === 0) return;
    const nextId = reviewQueueRef.current.shift()!;
    const item = queueRef.current.find((q) => q.id === nextId);
    if (!item?.meta || !item?.edited) return;
    setModalItemId(nextId);
    setModalMeta(item.meta);
    setModalEdited(item.edited);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setTimeout(tryShowNextReview, 300);
  };

  const handleConfirm = () => {
    if (!modalItemId || !modalMeta) return;
    updateItem(modalItemId, { status: "queued", edited: modalEdited });
    setModalOpen(false);
    setTimeout(tryShowNextReview, 300);
    if (!downloadingRef.current) runNextDownload();
  };

  const handleSkip = () => {
    if (modalItemId) updateItem(modalItemId, { status: "cancelled" });
    handleModalClose();
  };

  const runNextDownload = async () => {
    const item = queueRef.current.find((q) => q.status === "queued");
    if (!item?.meta || !item?.edited) {
      downloadingRef.current = false;
      return;
    }

    downloadingRef.current = true;
    cancelRef.current.cancelled = false;
    updateItem(item.id, { status: "downloading" });
    setLogs([]);
    setLogsOpen(true);
    setProgress({ message: "", current: 0, total: 0 });

    try {
      await downloadManga(
        item.meta,
        item.edited,
        (p) => {
          setProgress(p);
          if (p.message) log(p.message);
        },
        cancelRef.current,
        log,
      );
      updateItem(item.id, { status: "done" });
    } catch (e: any) {
      const isCancelled = e.message === "CANCELLED";
      updateItem(item.id, {
        status: isCancelled ? "cancelled" : "error",
        errorMsg: isCancelled ? undefined : e.message || "Download failed",
      });
      if (isCancelled) {
        downloadingRef.current = false;
        return;
      }
    }
    runNextDownload();
  };

  const removeItem = (id: string) =>
    syncQueue(queueRef.current.filter((q) => q.id !== id));
  const clearFinished = () =>
    syncQueue(
      queueRef.current.filter(
        (q) => !["done", "error", "cancelled"].includes(q.status),
      ),
    );
  const patchEdited = (key: keyof EditedMeta) => (val: string) =>
    setModalEdited((p) => ({ ...p, [key]: val }));

  const activeDownload = queue.find((q) => q.status === "downloading");
  const pendingCount = queue.filter((q) =>
    ["looking", "review", "queued"].includes(q.status),
  ).length;
  const doneCount = queue.filter((q) => q.status === "done").length;
  const hasFinished = queue.some((q) =>
    ["done", "error", "cancelled"].includes(q.status),
  );
  const modalPhase: Phase = "review";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "bold",
              color: "#f1f5f9",
              // letterSpacing: 1,
              lineHeight: 34,
            }}
          >
            Downloader
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{
                fontSize: 30,
                fontWeight: "bold",
                color: "white",
                letterSpacing: 4,
                marginBottom: 6,
              }}
            >
              {"\t\tManga"}
            </Text>
            <Text
              style={{
                fontSize: 30,
                fontWeight: "bold",
                color: "#38D926",
                letterSpacing: 4,
                marginBottom: 6,
              }}
            >
              Nest
            </Text>
          </View>
        </View>

        {/* ── URL input ── */}
        <UrlInput
          value={urlInput}
          onChange={setUrlInput}
          onSubmit={handleAddUrl}
          loading={false}
          onCancel={() => {}}
        />

        {/* ── Active download card ── */}
        {activeDownload && (
          <View style={styles.activeCard}>
            <View style={styles.activeCardHeader}>
              <View style={styles.activeCardLeft}>
                <View style={styles.activePulse} />
                <Text style={styles.activeCardLabel}>Downloading</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  cancelRef.current.cancelled = true;
                }}
                style={styles.stopBtn}
              >
                <MaterialCommunityIcons name="stop" size={12} color="#ef4444" />
                <Text style={styles.stopBtnText}>Stop</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.activeCardName} numberOfLines={1}>
              {activeDownload.name || activeDownload.url}
            </Text>
            <ProgressBar current={progress.current} total={progress.total} />
          </View>
        )}

        {/* ── Queue ── */}
        {queue.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Queue
                <Text style={{ color: "#38D926" }}>
                  {" "}
                  · {doneCount}/{queue.length}
                </Text>
              </Text>
              {hasFinished && (
                <TouchableOpacity onPress={clearFinished}>
                  <Text style={styles.clearBtn}>Clear done</Text>
                </TouchableOpacity>
              )}
            </View>
            {queue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                progress={progress}
                onRemove={removeItem}
              />
            ))}
          </View>
        )}

        {/* ── Log console ── */}
        {logs.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setLogsOpen((p) => !p)}
            >
              <Text style={styles.sectionTitle}>Console</Text>
              <View style={styles.logToggle}>
                <MaterialCommunityIcons
                  name={logsOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#475569"
                />
              </View>
            </TouchableOpacity>
            {logsOpen && <LogConsole logs={logs} loading={!!activeDownload} />}
          </View>
        )}
      </ScrollView>

      {/* ── MetaModal ── */}
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

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#030712" },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 24,
  },
  logoText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#f1f5f9",
    letterSpacing: -0.5,
  },
  logoSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    fontWeight: "600",
    marginTop: 2,
  },
  statsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#38D92610",
    borderWidth: 1,
    borderColor: "#38D92630",
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#38D926",
  },
  statText: { color: "#38D926", fontSize: 10, fontWeight: "700" },

  // Active download card
  activeCard: {
    backgroundColor: "#0a0e17",
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#38D92630",
  },
  activeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  activeCardLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  activePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#38D926",
  },
  activeCardLabel: {
    color: "#38D926",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  activeCardName: {
    color: "#f1f5f9",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ef444418",
    borderWidth: 1,
    borderColor: "#ef4444",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  stopBtnText: { color: "#ef4444", fontSize: 10, fontWeight: "800" },

  // Section
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  clearBtn: { color: "#334155", fontSize: 10, fontWeight: "700" },
  logToggle: {
    backgroundColor: "#0a0e17",
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
});
