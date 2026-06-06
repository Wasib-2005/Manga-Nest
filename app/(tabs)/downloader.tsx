import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  TextInput, // <-- Added TextInput here
} from "react-native";
import { WebView } from "react-native-webview";
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
import { ImportModal } from "@/components/ui/mangaDownloader/ImportModal";

// ─── Types & Configuration ──────────────────────────────────────────────────

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
      {item.status === "queued" && (
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
          hitSlop={12}
          style={q.removeBtn}
        >
          <MaterialCommunityIcons name="close" size={14} color="#334155" />
        </TouchableOpacity>
      )}
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

  const [importOpen, setImportOpen] = useState(false);

  // Browser States
  const [browserVisible, setBrowserVisible] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("https://google.com");
  const [browserInput, setBrowserInput] = useState("https://google.com"); // <-- State for typing
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);

  const webViewRef = useRef<WebView>(null);
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

  const handleAddUrlDirect = (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;
    if (
      queueRef.current.some(
        (q) =>
          q.url === trimmed &&
          !["done", "error", "cancelled"].includes(q.status),
      )
    ) {
      return;
    }
    const id = genId();
    syncQueue([...queueRef.current, { id, url: trimmed, status: "looking" }]);
    runLookup(id, trimmed);
  };

  const handleAddUrl = () => {
    handleAddUrlDirect(urlInput);
    setUrlInput("");
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
  const doneCount = queue.filter((q) => q.status === "done").length;
  const hasFinished = queue.some((q) =>
    ["done", "error", "cancelled"].includes(q.status),
  );
  const modalPhase: Phase = "review";

  // Browser Actions
  const handleBrowserBack = () => canGoBack && webViewRef.current?.goBack();
  const handleBrowserForward = () => canGoForward && webViewRef.current?.goForward();
  const handleBrowserReload = () => webViewRef.current?.reload();
  
  const handleCaptureUrl = () => {
    handleAddUrlDirect(browserUrl);
    setBrowserVisible(false);
  };

  // <-- Added logic to process typed URL
  const handleUrlSubmit = () => {
    let finalUrl = browserInput.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      // If it looks like a domain name, prepend https://
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        // Otherwise treat it as a google search
        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
      }
    }
    setBrowserUrl(finalUrl);
    setBrowserInput(finalUrl);
  };

  // <-- This JS strips target="_blank" from links so they never open externally
  const INJECTED_JAVASCRIPT = `
    (function() {
      const removeTargetBlank = () => {
        document.querySelectorAll('a[target="_blank"]').forEach(a => {
          a.removeAttribute('target');
        });
      };
      // Run once on load
      removeTargetBlank();
      
      // Watch for new DOM elements (e.g. lazy-loaded links or infinite scroll)
      const observer = new MutationObserver(removeTargetBlank);
      observer.observe(document.body, { childList: true, subtree: true });
    })();
    true;
  `;

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
        {/* ── HEADER ── */}
        <View style={{ marginBottom: 28 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Dashboard
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 28, fontWeight: "900", color: "#f8fafc", letterSpacing: -0.5 }}>
              Manga
            </Text>
            <Text style={{ fontSize: 28, fontWeight: "900", color: "#38D926", letterSpacing: -0.5 }}>
              Nest
            </Text>
          </View>
        </View>

        {/* ── SECTION: DOWNLOAD URL ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Direct Download URL</Text>
          </View>
          <UrlInput
            value={urlInput}
            onChange={setUrlInput}
            onSubmit={handleAddUrl}
            loading={false}
            onCancel={() => {}}
          />
        </View>

        {/* ── SECTION: IMPORT & BROWSER ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Import & Browse Tools</Text>
          </View>
          
          <View style={styles.toolsContainer}>
            {/* Full-width In-App Browser Card */}
            <Pressable
              style={({ pressed }) => [
                styles.browserCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() => setBrowserVisible(true)}
            >
              <View style={styles.browserIconWrap}>
                <MaterialCommunityIcons name="compass" size={28} color="#38D926" />
              </View>
              <View style={styles.browserCardTextWrap}>
                <Text style={styles.browserCardTitle}>In-App Browser</Text>
                <Text style={styles.browserCardSub}>Find & capture manga URLs</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#334155" />
            </Pressable>

            {/* Local Import Grid */}
            <View style={styles.importGrid}>
              <Pressable
                style={({ pressed }) => [
                  styles.importCard,
                  styles.importCardPdf,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => setImportOpen(true)}
              >
                <View style={styles.importIconWrapPdf}>
                  <MaterialCommunityIcons name="file-pdf-box" size={30} color="#f87171" />
                </View>
                <Text style={styles.importCardTitle}>PDF File</Text>
                <Text style={styles.importCardSub}>Single document</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.importCard,
                  styles.importCardImg,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => setImportOpen(true)}
              >
                <View style={styles.importIconWrapImg}>
                  <MaterialCommunityIcons name="folder-image" size={30} color="#60a5fa" />
                </View>
                <Text style={styles.importCardTitle}>Images</Text>
                <Text style={styles.importCardSub}>Folder selection</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── SECTION: ACTIVE TASK ── */}
        {activeDownload && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Task</Text>
            </View>
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
          </View>
        )}

        {/* ── SECTION: QUEUE ── */}
        {queue.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Queue
                <Text style={{ color: "#38D926" }}> · {doneCount}/{queue.length}</Text>
              </Text>
              {hasFinished && (
                <TouchableOpacity onPress={clearFinished}>
                  <Text style={styles.clearBtn}>Clear done</Text>
                </TouchableOpacity>
              )}
            </View>
            {queue.map((item) => (
              <QueueRow key={item.id} item={item} progress={progress} onRemove={removeItem} />
            ))}
          </View>
        )}

        {/* ── SECTION: CONSOLE ── */}
        {logs.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setLogsOpen((p) => !p)}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionTitle}>System Console</Text>
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

      {/* ── FULL SCREEN WEBVISUALIZER MODAL ── */}
      <Modal
        visible={browserVisible}
        animationType="slide"
        onRequestClose={() => setBrowserVisible(false)}
      >
        <View style={styles.browserContainer}>
          {/* Top Control Header Bar */}
          <View style={styles.browserHeader}>
            <TouchableOpacity
              onPress={() => setBrowserVisible(false)}
              style={styles.browserHeaderClose}
            >
              <MaterialCommunityIcons name="close" size={22} color="#f8fafc" />
            </TouchableOpacity>
            
            {/* <-- Edited: Changed to TextInput so user can change URL --> */}
            <View style={styles.browserUrlBox}>
              <TextInput
                style={styles.browserUrlInput}
                value={browserInput}
                onChangeText={setBrowserInput}
                onSubmitEditing={handleUrlSubmit}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                selectTextOnFocus
                numberOfLines={1}
              />
            </View>

            {browserLoading && (
              <ActivityIndicator size="small" color="#38D926" style={{ marginRight: 4 }} />
            )}
          </View>

          {/* Actual Core WebView Engine Wrapper */}
          <View style={{ flex: 1, backgroundColor: "#fff" }}>
            <WebView
              ref={webViewRef}
              source={{ uri: browserUrl }}
              injectedJavaScript={INJECTED_JAVASCRIPT} // <-- Strip out "_blank" links natively
              setSupportMultipleWindows={false}        // <-- Deny popups natively 
              onNavigationStateChange={(navState) => {
                // Sync internal input bar but DONT trigger a reload
                if (navState.url && navState.url !== browserUrl) {
                  setBrowserInput(navState.url);
                  setBrowserUrl(navState.url);
                }
                setCanGoBack(navState.canGoBack);
                setCanGoForward(navState.canGoForward);
                setBrowserLoading(navState.loading);
              }}
              startInLoadingState
              renderLoading={() => (
                <ActivityIndicator
                  color="#38D926"
                  size="large"
                  style={StyleSheet.absoluteFill}
                />
              )}
            />
          </View>

          {/* Bottom Action Tracking Hub Bar */}
          <View style={styles.browserBottomBar}>
            <View style={styles.browserNavControls}>
              <TouchableOpacity
                onPress={handleBrowserBack}
                disabled={!canGoBack}
                style={[styles.browserNavBtn, !canGoBack && styles.btnDisabled]}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color={canGoBack ? "#f1f5f9" : "#334155"} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleBrowserForward}
                disabled={!canGoForward}
                style={[styles.browserNavBtn, !canGoForward && styles.btnDisabled]}
              >
                <MaterialCommunityIcons name="arrow-right" size={20} color={canGoForward ? "#f1f5f9" : "#334155"} />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleBrowserReload} style={styles.browserNavBtn}>
                <MaterialCommunityIcons name="refresh" size={20} color="#f1f5f9" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleCaptureUrl} style={styles.captureBtn}>
              <MaterialCommunityIcons name="target" size={16} color="#030712" />
              <Text style={styles.captureBtnText}>Capture URL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      {/* ── ImportModal ── */}
      <ImportModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(uri) => {
          console.log("Import done:", uri);
          setImportOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#030712" },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 40 },

  // ── SECTION CONTAINERS ──
  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },

  // ── TOOLS & IMPORT ──
  toolsContainer: {
    flexDirection: "column",
  },
  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  
  // Browser Top Card
  browserCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0e17",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    borderTopWidth: 2,
    borderTopColor: "#38D926",
    marginBottom: 16,
  },
  browserIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(56, 217, 38, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  browserCardTextWrap: {
    flex: 1,
  },
  browserCardTitle: {
    color: "#f1f5f9",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 3,
  },
  browserCardSub: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },

  // Grid Below Browser
  importGrid: { flexDirection: "row", gap: 16 },
  importCard: {
    flex: 1,
    backgroundColor: "#0a0e17",
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderTopWidth: 2,
  },
  importCardPdf: { borderColor: "#1e293b", borderTopColor: "#f87171" },
  importCardImg: { borderColor: "#1e293b", borderTopColor: "#60a5fa" },
  importIconWrapPdf: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  importIconWrapImg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(96, 165, 251, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  importCardTitle: { color: "#f1f5f9", fontSize: 14, fontWeight: "800", marginBottom: 4 },
  importCardSub: { color: "#64748b", fontSize: 10, fontWeight: "600" },

  // ── ACTIVE & QUEUE ELEMENTS ──
  activeCard: {
    backgroundColor: "#0a0e17",
    borderRadius: 18,
    padding: 16,
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
  activePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#38D926" },
  activeCardLabel: {
    color: "#38D926",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  activeCardName: { color: "#f1f5f9", fontSize: 13, fontWeight: "700", marginBottom: 10 },
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
  clearBtn: { color: "#38D926", fontSize: 10, fontWeight: "700" },
  logToggle: {
    backgroundColor: "#0a0e17",
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: "#1e293b",
  },

  // ── FULL SCREEN BROWSER MODAL STYLES ──
  browserContainer: { flex: 1, backgroundColor: "#030712" },
  browserHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0e17",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#141c2b",
    gap: 12,
  },
  browserHeaderClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  browserUrlBox: {
    flex: 1,
    backgroundColor: "#030712",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 0, // removed vertical padding for pure text input alignment
    borderWidth: 1,
    borderColor: "#141c2b",
    height: 36,
    justifyContent: "center",
  },
  browserUrlInput: { 
    color: "#94a3b8", 
    fontSize: 12, 
    fontWeight: "500",
    padding: 0, // Removes default Android padding
  },
  browserBottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0a0e17",
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    paddingTop: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: "#141c2b",
  },
  browserNavControls: { flexDirection: "row", gap: 6 },
  browserNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.3 },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#38D926",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  captureBtnText: { color: "#030712", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
});