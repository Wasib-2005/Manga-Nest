/**
 * ImportModal.tsx (v4) — synced with importService (Directory-based API)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Directory } from "expo-file-system";

import {
  pickPDF,
  readPdfAsBase64,
  pickImages,
  importFromImages,
  resolveOrCreateEntry,
  writeTitleJson,
  writeInfoJson,
  savePageFromDataUrl,
  ImportMeta,
  ImportProgress,
  ChapterDir,
} from "@/services/downloader/importService";
import { LogConsole } from "./LogConsole";
import { PdfExtractor } from "./PdfExtractor";
import { ProgressBar } from "./ProgressBar";

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportMode = "pdf" | "images";
type Phase = "idle" | "reading" | "importing" | "done" | "error";

const EMPTY: ImportMeta = { name: "", author: "", tags: "", genres: "", ep: "1" };

// ─── ModeTab ──────────────────────────────────────────────────────────────────

const ModeTab = ({
  icon, label, active, onPress,
}: {
  icon: string; label: string; active: boolean; onPress: () => void;
}) => (
  <TouchableOpacity onPress={onPress} style={[tab.wrap, active && tab.active]} activeOpacity={0.75}>
    <MaterialCommunityIcons name={icon as any} size={18} color={active ? "#030712" : "#334155"} />
    <Text style={[tab.label, active && tab.labelActive]}>{label}</Text>
  </TouchableOpacity>
);

const tab = StyleSheet.create({
  wrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12 },
  active: { backgroundColor: "#38D926" },
  label: { color: "#334155", fontSize: 13, fontWeight: "700" },
  labelActive: { color: "#030712", fontSize: 13, fontWeight: "900" },
});

// ─── Field ────────────────────────────────────────────────────────────────────

const Field = ({
  label, value, onChangeText, multiline, required, invalid, placeholder, hint,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  multiline?: boolean; required?: boolean; invalid?: boolean;
  placeholder?: string; hint?: string;
}) => (
  <View style={fd.wrap}>
    <View style={fd.labelRow}>
      <Text style={fd.label}>
        {label}{required && <Text style={{ color: "#ef4444" }}> *</Text>}
      </Text>
      {hint && <Text style={fd.hint}>{hint}</Text>}
    </View>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      placeholder={placeholder}
      placeholderTextColor="#1e293b"
      selectionColor="#38D926"
      style={[fd.input, multiline && fd.inputMulti, invalid && fd.inputInvalid]}
    />
  </View>
);

const fd = StyleSheet.create({
  wrap: { marginBottom: 12 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  label: { color: "#475569", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  hint: { color: "#334155", fontSize: 9, fontWeight: "600" },
  input: { backgroundColor: "#060b14", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: "#f1f5f9", fontSize: 14, fontWeight: "500", borderWidth: 1, borderColor: "#141c2b" },
  inputMulti: { minHeight: 64, textAlignVertical: "top" },
  inputInvalid: { borderColor: "#ef4444", backgroundColor: "#ef444408" },
});

// ─── PickerZone ───────────────────────────────────────────────────────────────

const PickerZone = ({
  icon, title, sub, onPress, loading,
}: {
  icon: string; title: string; sub: string; onPress: () => void; loading?: boolean;
}) => (
  <TouchableOpacity style={pz.wrap} onPress={onPress} activeOpacity={0.75}>
    {loading ? <ActivityIndicator color="#38D926" size="large" /> : (
      <View style={pz.iconWrap}>
        <MaterialCommunityIcons name={icon as any} size={28} color="#38D926" />
      </View>
    )}
    <Text style={pz.title}>{loading ? "Reading file…" : title}</Text>
    <Text style={pz.sub}>{loading ? "Please wait" : sub}</Text>
  </TouchableOpacity>
);

const pz = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: "#38D92635", borderStyle: "dashed", borderRadius: 18, backgroundColor: "#38D92605", paddingVertical: 32, alignItems: "center", gap: 10, marginBottom: 18 },
  iconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: "#38D92612", borderWidth: 1, borderColor: "#38D92630", justifyContent: "center", alignItems: "center" },
  title: { color: "#e2e8f0", fontSize: 14, fontWeight: "700" },
  sub: { color: "#334155", fontSize: 11, fontWeight: "500" },
});

// ─── FileChip ─────────────────────────────────────────────────────────────────

const FileChip = ({
  icon, label, badge, onClear,
}: {
  icon: string; label: string; badge?: string; onClear: () => void;
}) => (
  <View style={chip.wrap}>
    <View style={chip.iconBox}>
      <MaterialCommunityIcons name={icon as any} size={16} color="#38D926" />
    </View>
    <Text style={chip.label} numberOfLines={1}>{label}</Text>
    {badge && (
      <View style={chip.badge}>
        <Text style={chip.badgeText}>{badge}</Text>
      </View>
    )}
    <TouchableOpacity onPress={onClear} hitSlop={10} style={chip.close}>
      <MaterialCommunityIcons name="close" size={12} color="#475569" />
    </TouchableOpacity>
  </View>
);

const chip = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#060b14", borderWidth: 1, borderColor: "#38D92630", borderRadius: 12, padding: 12, marginBottom: 18 },
  iconBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#38D92615", justifyContent: "center", alignItems: "center" },
  label: { flex: 1, color: "#e2e8f0", fontSize: 12, fontWeight: "600" },
  badge: { backgroundColor: "#38D92618", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#38D92635" },
  badgeText: { color: "#38D926", fontSize: 9, fontWeight: "900" },
  close: { width: 24, height: 24, borderRadius: 7, backgroundColor: "#141c2b", justifyContent: "center", alignItems: "center" },
});

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onDone?: (chapterUri: string) => void;
}

export const ImportModal = ({ visible, onClose, onDone }: Props) => {
  const [mode, setMode] = useState<ImportMode>("pdf");
  const [phase, setPhase] = useState<Phase>("idle");

  const [pdfFile, setPdfFile] = useState<{ uri: string; name: string } | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [meta, setMeta] = useState<ImportMeta>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({ message: "", current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [extracting, setExtracting] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────
  // titleDir is Directory (new API), chapterDirRef is ChapterDir { uri, delete() }
  const chapterDirRef    = useRef<ChapterDir | null>(null);
  const chapterDirUriRef = useRef<string>("");
  const titleDirRef      = useRef<Directory | null>(null);   // ✅ Directory object
  const uidRef           = useRef<string>("");
  const pagesWrittenRef  = useRef(0);
  const cancelRef        = useRef({ cancelled: false });
  const shakeAnim        = useRef(new Animated.Value(0)).current;
  const metaRef          = useRef<ImportMeta>(EMPTY);

  const log = (msg: string) => setLogs((p) => [...p.slice(-199), msg]);

  const patch = (key: keyof ImportMeta) => (val: string) => {
    setMeta((p) => {
      const next = { ...p, [key]: val };
      metaRef.current = next;
      return next;
    });
  };

  useEffect(() => { metaRef.current = meta; }, [meta]);

  // Reset everything when modal opens
  useEffect(() => {
    if (visible) {
      setPhase("idle");
      setPdfFile(null);
      setPdfBase64(null);
      setImageUris([]);
      setMeta(EMPTY);
      metaRef.current = EMPTY;
      setTouched(false);
      setLogs([]);
      setErrorMsg("");
      setProgress({ message: "", current: 0, total: 0 });
      setExtracting(false);
      cancelRef.current.cancelled = false;
      // ✅ Clean reset — no stale references
      chapterDirRef.current    = null;
      chapterDirUriRef.current = "";
      titleDirRef.current      = null;
      uidRef.current           = "";
      pagesWrittenRef.current  = 0;
    }
  }, [visible]);

  const nameOk  = meta.name.trim().length > 0;
  const epOk    = meta.ep.trim().length > 0;
  const hasFile = mode === "pdf" ? pdfFile !== null : imageUris.length > 0;
  const canStart = nameOk && epOk && hasFile;

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 40, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handlePickPDF = async () => {
    try {
      const result = await pickPDF();
      if (!result) return;
      setPdfFile(result);
      if (!meta.name.trim()) {
        const base = result.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
        patch("name")(base);
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to pick PDF");
      setPhase("error");
    }
  };

  const handlePickImages = async () => {
    try {
      const uris = await pickImages();
      if (!uris.length) return;
      setImageUris(uris);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to pick images");
      setPhase("error");
    }
  };

  const handleStart = async () => {
    if (!canStart) { setTouched(true); shake(); return; }

    cancelRef.current.cancelled = false;
    setLogs([]);
    setProgress({ message: "", current: 0, total: 0 });

    // ── Images mode ───────────────────────────────────────────────────────
    if (mode === "images") {
      setPhase("importing");
      try {
        const uri = await importFromImages(
          imageUris, meta, setProgress, cancelRef.current, log,
        );
        setPhase("done");
        onDone?.(uri);
      } catch (e: any) {
        if (e.message === "CANCELLED") { setPhase("idle"); return; }
        setErrorMsg(e.message || "Import failed");
        setPhase("error");
      }
      return;
    }

    // ── PDF mode ──────────────────────────────────────────────────────────
    setPhase("reading");
    try {
      log("📄 Reading PDF…");
      const b64 = await readPdfAsBase64(pdfFile!.uri);
      log("📄 PDF loaded, preparing directories…");

      // ✅ resolveOrCreateEntry returns { uid, titleDir (Directory), mkChapterDir }
      const { uid, titleDir, mkChapterDir } = await resolveOrCreateEntry(
        meta.name.trim(),
        "pdf",
      );

      uidRef.current      = uid;
      titleDirRef.current = titleDir;   // ✅ Directory object stored in ref

      // ✅ MUST await — mkChapterDir is async
      const chDir = await mkChapterDir(meta.ep.trim());
      chapterDirRef.current    = chDir;
      chapterDirUriRef.current = chDir.uri;

      console.log("✅ chapterDirUri:", chapterDirUriRef.current);

      // ✅ writeTitleJson takes (Directory, uid, meta, source)
      await writeTitleJson(titleDir, uid, meta, "pdf");

      pagesWrittenRef.current = 0;
      log("📄 Starting page extraction…");
      setPdfBase64(b64);
      setPhase("importing");
      setExtracting(true);
    } catch (e: any) {
      console.log("handleStart error:", e);
      setErrorMsg(e.message || "Failed to read PDF");
      setPhase("error");
    }
  };

  const handlePdfPage = useCallback(async (
    page: number, total: number, dataUrl: string,
  ) => {
    if (cancelRef.current.cancelled) return;
    try {
      await savePageFromDataUrl(chapterDirUriRef.current, page, dataUrl);
      pagesWrittenRef.current = page;
      setProgress({ message: `Extracted page ${page} / ${total}`, current: page, total });
      log(`  ✓ page ${page}/${total}`);
    } catch (e: any) {
      log(`  ✗ page ${page}: ${e.message}`);
    }
  }, []);

  const handlePdfDone = useCallback(async (total: number) => {
    setExtracting(false);
    try {
      const m = metaRef.current;
      // ✅ writeInfoJson takes (ChapterDir, uid, meta, source, pageCount)
      await writeInfoJson(chapterDirRef.current!, uidRef.current, m, "pdf", total);
      log(`🎉 PDF import complete — ${total} pages`);
      setPhase("done");
      onDone?.(chapterDirUriRef.current);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to finalise import");
      setPhase("error");
    }
  }, [onDone]);

  const handlePdfError = useCallback((msg: string) => {
    setExtracting(false);
    log(`❌ ${msg}`);
    setErrorMsg(msg);
    setPhase("error");
  }, []);

  const handleCancel = () => {
    cancelRef.current.cancelled = true;
    setExtracting(false);
    // ✅ delete() is sync in new importService
    try { chapterDirRef.current?.delete(); } catch {}
    chapterDirRef.current    = null;
    chapterDirUriRef.current = "";
    setPhase("idle");
  };

  const switchMode = (m: ImportMode) => {
    setMode(m);
    setPdfFile(null);
    setPdfBase64(null);
    setImageUris([]);
  };

  const isImporting = phase === "importing" || phase === "reading";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Hidden WebView for PDF extraction — outside ScrollView */}
      {extracting && pdfBase64 && (
        <PdfExtractor
          pdfBase64={pdfBase64}
          scale={2}
          quality={0.88}
          onPage={handlePdfPage}
          onDone={handlePdfDone}
          onError={handlePdfError}
        />
      )}

      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <View style={s.sheet}>

            <View style={s.grabRow}>
              <View style={s.grabBar} />
            </View>

            <View style={s.header}>
              <View style={s.headerLeft}>
                {!isImporting && phase !== "done" && phase !== "error" && (
                  <View style={[
                    s.modeBadge,
                    mode === "pdf"
                      ? { backgroundColor: "#ef444415", borderColor: "#ef444440" }
                      : { backgroundColor: "#3b82f615", borderColor: "#3b82f640" },
                  ]}>
                    <MaterialCommunityIcons
                      name={mode === "pdf" ? "file-pdf-box" : "image-multiple"}
                      size={12}
                      color={mode === "pdf" ? "#ef4444" : "#3b82f6"}
                    />
                    <Text style={[s.modeBadgeText, { color: mode === "pdf" ? "#ef4444" : "#3b82f6" }]}>
                      {mode === "pdf" ? "PDF" : "Images"}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={s.headerTitle}>
                    Import <Text style={{ color: "#38D926" }}>Manga</Text>
                  </Text>
                  <Text style={s.headerSub}>Local file import</Text>
                </View>
              </View>
              {!isImporting && (
                <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                  <MaterialCommunityIcons name="close" size={18} color="#475569" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>

                {/* ── DONE ── */}
                {phase === "done" && (
                  <View style={s.doneWrap}>
                    <View style={s.doneRing}>
                      <MaterialCommunityIcons name="check" size={36} color="#38D926" />
                    </View>
                    <Text style={s.doneTitle}>Import Complete</Text>
                    <Text style={s.doneSub}>Added to your library</Text>
                    <View style={s.doneActions}>
                      <TouchableOpacity style={s.doneBtnPrimary} onPress={onClose}>
                        <Text style={s.doneBtnPrimaryText}>Open Library</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.doneBtnSecondary} onPress={() => {
                        setPhase("idle"); setPdfFile(null); setPdfBase64(null);
                        setImageUris([]); setMeta(EMPTY); setLogs([]);
                      }}>
                        <Text style={s.doneBtnSecondaryText}>Import Another</Text>
                      </TouchableOpacity>
                    </View>
                    {logs.length > 0 && (
                      <View style={{ width: "100%", marginTop: 8 }}>
                        <LogConsole logs={logs} loading={false} />
                      </View>
                    )}
                  </View>
                )}

                {/* ── ERROR ── */}
                {phase === "error" && (
                  <View style={s.errorWrap}>
                    <View style={s.errorIcon}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#ef4444" />
                    </View>
                    <Text style={s.errorTitle}>Import Failed</Text>
                    <Text style={s.errorMsg}>{errorMsg}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => setPhase("idle")}>
                      <MaterialCommunityIcons name="refresh" size={14} color="#ef4444" />
                      <Text style={s.retryBtnText}>Try Again</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── IMPORTING ── */}
                {isImporting && (
                  <>
                    <View style={s.activeCard}>
                      <View style={s.activeCardHeader}>
                        <View style={s.pulseRow}>
                          <View style={s.pulse} />
                          <Text style={s.activeLabel}>
                            {phase === "reading"
                              ? "Reading PDF…"
                              : mode === "pdf"
                              ? "Extracting Pages…"
                              : "Copying Images…"}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={handleCancel} style={s.stopBtn}>
                          <MaterialCommunityIcons name="stop" size={11} color="#ef4444" />
                          <Text style={s.stopText}>Stop</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={s.activeName} numberOfLines={1}>{meta.name}</Text>
                      {phase === "reading" ? (
                        <View style={s.readingRow}>
                          <ActivityIndicator color="#38D926" size="small" />
                          <Text style={s.readingText}>Decoding PDF binary…</Text>
                        </View>
                      ) : (
                        <ProgressBar current={progress.current} total={progress.total} />
                      )}
                    </View>
                    <LogConsole logs={logs} loading={isImporting} />
                  </>
                )}

                {/* ── IDLE ── */}
                {phase === "idle" && (
                  <>
                    <View style={s.tabRow}>
                      <ModeTab icon="file-pdf-box" label="PDF" active={mode === "pdf"} onPress={() => switchMode("pdf")} />
                      <ModeTab icon="image-multiple-outline" label="Images" active={mode === "images"} onPress={() => switchMode("images")} />
                    </View>

                    <View style={s.dividerRow}>
                      <View style={s.dividerLine} />
                      <Text style={s.dividerLabel}>
                        {mode === "pdf" ? "Select PDF file" : "Select images"}
                      </Text>
                      <View style={s.dividerLine} />
                    </View>

                    {mode === "pdf" ? (
                      pdfFile ? (
                        <FileChip
                          icon="file-pdf-box"
                          label={pdfFile.name}
                          onClear={() => { setPdfFile(null); setPdfBase64(null); }}
                        />
                      ) : (
                        <PickerZone
                          icon="file-pdf-box"
                          title="Tap to select PDF"
                          sub="Each page will be extracted as an image"
                          onPress={handlePickPDF}
                        />
                      )
                    ) : (
                      imageUris.length > 0 ? (
                        <FileChip
                          icon="image-multiple"
                          label={`${imageUris.length} images selected`}
                          badge={`${imageUris.length} pages`}
                          onClear={() => setImageUris([])}
                        />
                      ) : (
                        <PickerZone
                          icon="image-multiple-outline"
                          title="Tap to select images"
                          sub="Select all pages in order from your gallery"
                          onPress={handlePickImages}
                        />
                      )
                    )}

                    <View style={s.dividerRow}>
                      <View style={s.dividerLine} />
                      <Text style={s.dividerLabel}>Manga details</Text>
                      <View style={s.dividerLine} />
                    </View>

                    <Field label="Title" value={meta.name} onChangeText={patch("name")} required invalid={touched && !nameOk} placeholder="e.g. My Hero Academia" />
                    <Field label="Chapter / Episode" value={meta.ep} onChangeText={patch("ep")} required invalid={touched && !epOk} placeholder="e.g. 1  or  Vol.1" />
                    <Field label="Author" value={meta.author} onChangeText={patch("author")} placeholder="e.g. Kohei Horikoshi" />
                    <Field label="Tags" value={meta.tags} onChangeText={patch("tags")} multiline placeholder="action, adventure, school, …" hint="comma separated" />

                    {touched && (!nameOk || !epOk) && (
                      <View style={s.validationHint}>
                        <MaterialCommunityIcons name="information-outline" size={12} color="#ef4444" />
                        <Text style={s.validationHintText}>
                          {!hasFile
                            ? `Select a ${mode === "pdf" ? "PDF" : "images"} file first`
                            : "Title and Episode are required"}
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={handleStart}
                      activeOpacity={0.8}
                      style={[s.startBtn, !canStart && s.startBtnDim]}
                    >
                      <MaterialCommunityIcons
                        name={mode === "pdf" ? "file-pdf-box" : "image-multiple"}
                        size={17}
                        color="#030712"
                      />
                      <Text style={s.startBtnText}>
                        {mode === "pdf" ? "Extract & Import PDF" : "Import Images"}
                      </Text>
                    </TouchableOpacity>

                    <Text style={s.helpText}>
                      {mode === "pdf"
                        ? "PDF pages are rendered at 2× resolution (≈144 dpi) and saved as JPEGs"
                        : "Images are copied in filename order — rename them 1.jpg, 2.jpg … before selecting for best results"}
                    </Text>
                  </>
                )}

              </Animated.View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#030712", borderTopLeftRadius: 30, borderTopRightRadius: 30, borderTopWidth: 1, borderColor: "#0f172a", maxHeight: "95%", shadowColor: "#38D926", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.08, shadowRadius: 30, elevation: 30 },
  grabRow: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  grabBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#141c2b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#060b14" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  headerSub: { color: "#334155", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 1 },
  modeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  modeBadgeText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#0a0e17", borderWidth: 1, borderColor: "#141c2b", justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 20, paddingBottom: 50 },
  tabRow: { flexDirection: "row", gap: 6, backgroundColor: "#060b14", borderRadius: 16, padding: 5, marginBottom: 20, borderWidth: 1, borderColor: "#141c2b" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#0f172a" },
  dividerLabel: { color: "#334155", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  activeCard: { backgroundColor: "#060b14", borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#38D92625", gap: 10 },
  activeCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pulseRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#38D926" },
  activeLabel: { color: "#38D926", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5 },
  activeName: { color: "#f1f5f9", fontSize: 13, fontWeight: "700" },
  stopBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ef444415", borderWidth: 1, borderColor: "#ef444450", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  stopText: { color: "#ef4444", fontSize: 10, fontWeight: "800" },
  readingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  readingText: { color: "#475569", fontSize: 11, fontWeight: "600" },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#38D926", borderRadius: 16, paddingVertical: 16, marginTop: 6 },
  startBtnDim: { opacity: 0.4 },
  startBtnText: { color: "#030712", fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  helpText: { color: "#1e293b", fontSize: 10, fontWeight: "500", textAlign: "center", marginTop: 12, lineHeight: 16 },
  validationHint: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ef444410", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10 },
  validationHintText: { color: "#ef4444", fontSize: 10, fontWeight: "600" },
  doneWrap: { alignItems: "center", paddingVertical: 24, gap: 6 },
  doneRing: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#38D92610", borderWidth: 2, borderColor: "#38D92630", justifyContent: "center", alignItems: "center", marginBottom: 8 },
  doneTitle: { color: "#f1f5f9", fontSize: 20, fontWeight: "900" },
  doneSub: { color: "#475569", fontSize: 12 },
  doneActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  doneBtnPrimary: { backgroundColor: "#38D926", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13 },
  doneBtnPrimaryText: { color: "#030712", fontSize: 12, fontWeight: "900" },
  doneBtnSecondary: { borderWidth: 1, borderColor: "#1e293b", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: "#060b14" },
  doneBtnSecondaryText: { color: "#475569", fontSize: 12, fontWeight: "700" },
  errorWrap: { alignItems: "center", paddingVertical: 28, gap: 8 },
  errorIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#ef444410", borderWidth: 1, borderColor: "#ef444430", justifyContent: "center", alignItems: "center", marginBottom: 4 },
  errorTitle: { color: "#ef4444", fontSize: 16, fontWeight: "800" },
  errorMsg: { color: "#475569", fontSize: 12, textAlign: "center", lineHeight: 18 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, borderWidth: 1, borderColor: "#ef444440", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: "#ef444410" },
  retryBtnText: { color: "#ef4444", fontSize: 12, fontWeight: "800" },
});