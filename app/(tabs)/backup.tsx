import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Clipboard from "expo-clipboard";
import { ProgressBar } from "../../components/ui/mangaDownloader/ProgressBar";

const MANGA_PATH = "manga";

type OperationStatus = "idle" | "backing_up" | "restoring" | "done" | "error";

export default function BackupRestore() {
  const [status, setStatus] = useState<OperationStatus>("idle");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    message: "",
  });
  const [logs, setLogs] = useState<string[]>([]);
  const cancelRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const [backupTargetDir, setBackupTargetDir] = useState<Directory | null>(null);
  const [restoreSourceDir, setRestoreSourceDir] = useState<Directory | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── 🛠️ HIGH PERFORMANCE LOGGING ──────────────────────────────────────────
  const log = (msg: string) => {
    setLogs((prev) => {
      const newLogs = [...prev, msg];
      return newLogs.length > 500 ? newLogs.slice(newLogs.length - 500) : newLogs;
    });
  };

  const resetState = (newStatus: OperationStatus) => {
    setStatus(newStatus);
    setProgress({ current: 0, total: 0, message: "" });
    setLogs([]);
    setCopied(false);
    cancelRef.current = false;
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    try {
      await Clipboard.setStringAsync(logs.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      log(`Copy failed: ${e.message}`);
    }
  };

  const formatPath = (uri: string): string => {
    if (!uri) return "Unknown Path";
    let decodedUri = decodeURIComponent(uri);
    let formattedPath = decodedUri
      .replace("content://com.android.externalstorage.documents/tree/primary:", "Internal Storage/")
      .replace("file:///storage/emulated/0/", "Internal Storage/");
    return formattedPath;
  };

  // ─── 📦 SAFE TYPE CHECK ────────────────────────────────────────────────────
  const isDirectory = (item: any): item is Directory => {
    return item instanceof Directory || typeof item?.list === "function";
  };

  const handleScanInternalData = () => {
    log("--------------------------------------");
    log("🔍 SCANNING HIDDEN APP DATA...");
    const localMangaDir = new Directory(Paths.document, MANGA_PATH);

    if (!localMangaDir.exists) {
      log("❌ Internal manga folder does NOT exist yet.");
      log("--------------------------------------");
      return;
    }

    const contents = localMangaDir.list();
    if (contents.length === 0) {
      log("⚠️ Internal manga folder exists, but it is EMPTY.");
    } else {
      log(`📁 Found ${contents.length} items inside App Data:`);
      contents.forEach((item) => {
        const type = isDirectory(item) ? "Folder" : "File";
        log(`   ↳ [${type}] ${item.name}`);
      });
    }
    log("--------------------------------------");
  };

  // ─── STEP 1: SELECT LOCATIONS ──────────────────────────────────────────────
  const handleSelectBackupLocation = async () => {
    try {
      const selectedDir = await Directory.pickDirectoryAsync();
      console.log("Selected backup directory:", selectedDir);
      log("Selected backup directory: " + selectedDir);
      if (selectedDir) setBackupTargetDir(selectedDir);
    } catch (e: any) {
      log(`Selection Cancelled: ${e.message}`);
    }
  };

  const handleSelectRestoreLocation = async () => {
    try {
      const selectedDir = await Directory.pickDirectoryAsync();
      if (selectedDir) setRestoreSourceDir(selectedDir);
    } catch (e: any) {
      log(`Selection Cancelled: ${e.message}`);
    }
  };

  // ─── STEP 2: RUNTIME BACKUP ────────────────────────────────────────────────
  const handleStartBackup = async () => {
    if (!backupTargetDir) return;
    try {
      resetState("backing_up");
      const localMangaDir = new Directory(Paths.document, MANGA_PATH);

      if (!localMangaDir.exists) {
        log(`⚠️ Internal manga folder does not exist.`);
        setStatus("done");
        return;
      }

      const contents = localMangaDir.list();
      const total = contents.length;

      if (total === 0) {
        log(`⚠️ Local manga directory is empty.`);
        setStatus("done");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFolderName = `backup_manga_nest_data_${timestamp}`;
      const backupDir = new Directory(backupTargetDir);

      log(formatPath("Creating backup directory at: \n" + backupDir.uri + backupFolderName));

      const mangaDir = await backupDir.createDirectory(backupFolderName);
      console.log("Backup manga directory will be:", mangaDir);

      for (let i = 0; i < total; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const item = contents[i];

        setProgress({ current: i + 1, total, message: `Backing up: ${item.name}` });
        log(`[${i + 1}/${total}] 💾 Backing up: ${item.name}`);

        if (isDirectory(item)) {
          await item.copy(mangaDir);
        } else {
          log(`Target is a File (${item.name}) -> Creating via Directory.createFile`);
          const sourceFile = item as File;
          const fileData = await sourceFile.text();
          const mimeType = item.name.endsWith(".json") ? "application/json" : "application/octet-stream";
          const targetFile = await mangaDir.createFile(item.name, mimeType);
          await targetFile.write(fileData);
          log(`✓ Successfully backed up file: ${item.name}`);
        }
      }
      setStatus("done");
    } catch (e: any) {
      console.log(e.message === "CANCELLED" ? "\n🛑 Stopped by user." : `\n❌ Error: ${e.message}`);
      setStatus(e.message === "CANCELLED" ? "idle" : "error");
    }
  };

  // ─── STEP 3: RUNTIME RESTORE ───────────────────────────────────────────────
  const handleStartRestore = async () => {
    if (!restoreSourceDir) return;
    try {
      resetState("restoring");
      const localMangaDir = new Directory(Paths.document, MANGA_PATH);

      let trueBackupSource: Directory;
      if (restoreSourceDir.name === "backup_manga_nest_data") {
        trueBackupSource = new Directory(restoreSourceDir, "manga");
      } else if (new Directory(restoreSourceDir, "backup_manganest_data").exists) {
        const container = new Directory(restoreSourceDir, "backup_manganest_data");
        trueBackupSource = new Directory(container, "manga");
      } else {
        trueBackupSource = restoreSourceDir.name === "manga" ? restoreSourceDir : new Directory(restoreSourceDir, "manga");
      }

      if (!trueBackupSource.exists) {
        throw new Error("Could not find a valid 'manga' data backup directory in your selection.");
      }

      const contents = trueBackupSource.list();
      const total = contents.length;

      if (total === 0) {
        log("⚠️ Selected backup folder appears to be entirely empty.");
        setStatus("done");
        return;
      }

      if (localMangaDir.exists) {
        log("🧹 Purging old internal data files for a clean restore...");
        await localMangaDir.delete();
        await new Promise((r) => setTimeout(r, 100));
      }
      localMangaDir.create();

      log(`Found ${total} elements. Extracting...`);

      for (let i = 0; i < total; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const item = contents[i];

        setProgress({ current: i + 1, total, message: `Importing: ${item.name}` });
        log(`[${i + 1}/${total}] 🔄 Restoring: ${item.name}`);

        const target = isDirectory(item) ? new Directory(localMangaDir, item.name) : new File(localMangaDir, item.name);
        await item.copy(target);
      }

      log("\n🎉 App restoration completed successfully!");
      setStatus("done");
    } catch (e: any) {
      log(e.message === "CANCELLED" ? "\n🛑 Stopped by user." : `\n❌ Error: ${e.message}`);
      setStatus(e.message === "CANCELLED" ? "idle" : "error");
    }
  };

  const isBusy = status === "backing_up" || status === "restoring";

  // ─── STATUS META ───────────────────────────────────────────────────────────
  const statusMeta = {
    idle:       { label: "READY",    color: "#334155", dot: "#475569" },
    backing_up: { label: "SAVING",   color: "#38D926", dot: "#38D926" },
    restoring:  { label: "LOADING",  color: "#60a5fa", dot: "#60a5fa" },
    done:       { label: "COMPLETE", color: "#38D926", dot: "#38D926" },
    error:      { label: "FAILED",   color: "#ef4444", dot: "#ef4444" },
  }[status];

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#050a14" }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO HEADER ── untouched ──────────────────────────────────── */}
        <View
          style={{
            paddingTop: 64,
            paddingHorizontal: 24,
            paddingBottom: 32,
            borderBottomWidth: 1,
            borderBottomColor: "#0f1f35",
          }}
        >
          {/* Top row */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 20,
            }}
          >
            <View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "bold", color: "white", letterSpacing: 4, marginBottom: 6 }}>
                  Manga
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "bold", color: "#38D926", letterSpacing: 4, marginBottom: 6 }}>
                  Nest
                </Text>
              </View>
              <Text style={{ fontSize: 30, fontWeight: "900", color: "#f1f5f9", letterSpacing: -1, lineHeight: 34 }}>
                {"\t\tData Sync"}
              </Text>
            </View>

            {/* Status pill */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#0a1628",
                borderWidth: 1,
                borderColor: "#0f1f35",
                borderRadius: 100,
                paddingVertical: 8,
                paddingHorizontal: 14,
                gap: 8,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusMeta.dot }} />
              <Text style={{ fontSize: 10, fontWeight: "800", color: statusMeta.color, letterSpacing: 2 }}>
                {statusMeta.label}
              </Text>
            </View>
          </View>

          {/* Scan button */}
          <TouchableOpacity
            onPress={handleScanInternalData}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: "#0a1628",
              borderWidth: 1,
              borderColor: "#0f2040",
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ fontSize: 14 }}>🔎</Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#94a3b8", letterSpacing: 1.5, textTransform: "uppercase" }}>
              Inspect Internal Storage
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 28, gap: 14 }}>

          {/* ── BACKUP CARD ───────────────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#12301a",
              backgroundColor: "#050e08",
              overflow: "hidden",
            }}
          >
            {/* Accent top bar */}
            <View style={{ height: 3, backgroundColor: "#38D926", opacity: 0.7 }} />

            {/* Card header */}
            <View
              style={{
                paddingVertical: 16,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {/* Icon cluster */}
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    backgroundColor: "#071a0c",
                    borderWidth: 1,
                    borderColor: "#1a4a22",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 18 }}>📦</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#ecfdf5", letterSpacing: 0.3 }}>
                    Backup Library
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: "#38D926", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 2 }}>
                    Export · Save to storage
                  </Text>
                </View>
              </View>
              {/* Mini status badge */}
              {status === "backing_up" && (
                <View style={{ backgroundColor: "#071a0c", borderWidth: 1, borderColor: "#1a4a22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: "#38D926", letterSpacing: 2 }}>{pct}%</Text>
                </View>
              )}
              {status === "done" && (
                <View style={{ backgroundColor: "#071a0c", borderWidth: 1, borderColor: "#1a4a22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: "#38D926", letterSpacing: 1.5 }}>DONE ✓</Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: "#0c2010", marginHorizontal: 18 }} />

            <View style={{ padding: 16, gap: 10 }}>
              {/* Directory picker */}
              <TouchableOpacity
                onPress={handleSelectBackupLocation}
                disabled={isBusy}
                activeOpacity={0.7}
                style={{
                  backgroundColor: backupTargetDir ? "#061510" : "#040a06",
                  boxShadow: backupTargetDir ? "none" : "0 0 10px #1a4a22",
                  borderWidth: 1,
                  borderColor: backupTargetDir ? "#1f5a28" : "#0c1f10",
                  borderRadius: 13,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    backgroundColor: backupTargetDir ? "#0d2a12" : "#060f08",
                    borderWidth: 1,
                    borderColor: backupTargetDir ? "#1a4a22" : "#0c1f10",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 14 }}>📁</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: "#2a5a32", letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>
                    Destination Folder
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: backupTargetDir ? "#86efac" : "#1f3a26" }}>
                    {backupTargetDir ? formatPath(backupTargetDir.uri) : "Tap to choose destination →"}
                  </Text>
                </View>
                {backupTargetDir ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#38D926", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, color: "#030712", fontWeight: "900" }}>✓</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 16, color: "#1a3a20" }}>›</Text>
                )}
              </TouchableOpacity>

              {/* Action button */}
              <TouchableOpacity
                onPress={handleStartBackup}
                disabled={isBusy || !backupTargetDir}
                activeOpacity={0.8}
                style={{
                  backgroundColor: !backupTargetDir || isBusy ? "#060f08" : "#38D926",
                  borderWidth: 1.5,
                  borderColor: !backupTargetDir || isBusy ? "#0f2a18" : "#38D926",
                  borderRadius: 13,
                  paddingVertical: 15,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {status === "backing_up" && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#030712", opacity: 0.5 }} />
                )}
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "900",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: !backupTargetDir || isBusy ? "#1a4a24" : "#030712",
                  }}
                >
                  {status === "backing_up" ? "Backing up..." : "Start Backup"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── RESTORE CARD ──────────────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#0f1f38",
              backgroundColor: "#050810",
              overflow: "hidden",
            }}
          >
            {/* Accent top bar */}
            <View style={{ height: 3, backgroundColor: "#3b82f6", opacity: 0.7 }} />

            {/* Card header */}
            <View
              style={{
                paddingVertical: 16,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    backgroundColor: "#070c1a",
                    borderWidth: 1,
                    borderColor: "#1a2e60",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 18 }}>🔄</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#eff6ff", letterSpacing: 0.3 }}>
                    Restore Library
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: "#60a5fa", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 2 }}>
                    Import · Load from backup
                  </Text>
                </View>
              </View>
              {status === "restoring" && (
                <View style={{ backgroundColor: "#070c1a", borderWidth: 1, borderColor: "#1a2e60", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: "#60a5fa", letterSpacing: 2 }}>{pct}%</Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: "#0c1428", marginHorizontal: 18 }} />

            <View style={{ padding: 16, gap: 10 }}>
              {/* Directory picker */}
              <TouchableOpacity
                onPress={handleSelectRestoreLocation}
                disabled={isBusy}
                activeOpacity={0.7}
                style={{
                  backgroundColor: restoreSourceDir ? "#060a18" : "#040710",
                  borderWidth: 1,
                  borderColor: restoreSourceDir ? "#1a3060" : "#0c1528",
                  boxShadow: restoreSourceDir ? "none" : "0 0 10px #1a3060",
                  borderRadius: 13,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    backgroundColor: restoreSourceDir ? "#0a1228" : "#060a14",
                    borderWidth: 1,
                    borderColor: restoreSourceDir ? "#1a3060" : "#0c1528",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 14 }}>📂</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: "#1e3a5f", letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>
                    Source Folder
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: restoreSourceDir ? "#93c5fd" : "#1e3a5f" }}>
                    {restoreSourceDir ? formatPath(restoreSourceDir.uri) : "Tap to locate backup →"}
                  </Text>
                </View>
                {restoreSourceDir ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#60a5fa", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, color: "#030712", fontWeight: "900" }}>✓</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 16, color: "#1e3a5f" }}>›</Text>
                )}
              </TouchableOpacity>

              {/* Warning note */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "#0a0c18",
                  borderWidth: 1,
                  borderColor: "#1a1f3a",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 11 }}>⚠️</Text>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#334155", flex: 1, lineHeight: 15 }}>
                  Restoring will overwrite your current local data
                </Text>
              </View>

              {/* Action button */}
              <TouchableOpacity
                onPress={handleStartRestore}
                disabled={isBusy || !restoreSourceDir}
                activeOpacity={0.8}
                style={{
                  backgroundColor: !restoreSourceDir || isBusy ? "#060a14" : "#3b82f6",
                  borderWidth: 1.5,
                  borderColor: !restoreSourceDir || isBusy ? "#0f1f35" : "#3b82f6",
                  borderRadius: 13,
                  paddingVertical: 15,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {status === "restoring" && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffffff", opacity: 0.4 }} />
                )}
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "900",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: !restoreSourceDir || isBusy ? "#1e3a5f" : "#ffffff",
                  }}
                >
                  {status === "restoring" ? "Restoring..." : "Start Restore"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── PROGRESS PANEL ────────────────────────────────────────────── */}
          {status !== "idle" && (
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: status === "error" ? "#3b0a0a" : status === "done" ? "#0f2a18" : "#0f1f35",
                backgroundColor: status === "error" ? "#0a0404" : status === "done" ? "#060f0a" : "#060911",
                overflow: "hidden",
              }}
            >
              {/* Colored top strip */}
              <View
                style={{
                  height: 2,
                  backgroundColor: status === "error" ? "#ef4444" : status === "done" ? "#38D926" : status === "backing_up" ? "#38D926" : "#60a5fa",
                }}
              />

              <View style={{ padding: 18, gap: 14 }}>
                {/* Header row */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusMeta.dot }} />
                    <Text style={{ fontSize: 10, fontWeight: "800", color: statusMeta.color, letterSpacing: 2.5, textTransform: "uppercase" }}>
                      {status.replace("_", " ")}
                    </Text>
                    {progress.total > 0 && (
                      <View style={{ backgroundColor: "#0a1628", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: statusMeta.color }}>
                          {progress.current}/{progress.total}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {progress.total > 0 && (
                      <Text style={{ fontSize: 13, fontWeight: "800", color: statusMeta.color }}>
                        {pct}%
                      </Text>
                    )}
                    {isBusy && (
                      <TouchableOpacity
                        onPress={() => { cancelRef.current = true; }}
                        style={{
                          backgroundColor: "#1a0505",
                          borderWidth: 1,
                          borderColor: "#3b0a0a",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "800", color: "#ef4444", letterSpacing: 1.5, textTransform: "uppercase" }}>
                          Abort
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <ProgressBar current={progress.current} total={progress.total} />

                {progress.message ? (
                  <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "500", color: "#475569", fontStyle: "italic" }}>
                    {progress.message}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: "500", color: "#334155", fontStyle: "italic" }}>
                    Initializing...
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* ── TERMINAL ──────────────────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#0d1117",
              backgroundColor: "#020810",
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            {/* Terminal top bar */}
            <View
              style={{
                backgroundColor: "#06091a",
                paddingVertical: 11,
                paddingHorizontal: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottomWidth: 1,
                borderBottomColor: "#0d1530",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {/* Traffic lights */}
                <View style={{ flexDirection: "row", gap: 5, marginRight: 4 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: "#ef4444", opacity: 0.7 }} />
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: "#f59e0b", opacity: 0.7 }} />
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: "#22c55e", opacity: 0.7 }} />
                </View>
                <Text style={{ fontSize: 9, fontWeight: "700", color: "#1a3050", letterSpacing: 2.5, textTransform: "uppercase" }}>
                  System Log {logs.length === 500 ? "· MAX" : `· ${logs.length} lines`}
                </Text>
              </View>

              {logs.length > 0 && (
                <TouchableOpacity
                  onPress={handleCopyLogs}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    backgroundColor: copied ? "#071209" : "#080e20",
                    borderWidth: 1,
                    borderColor: copied ? "#0f2a18" : "#0f1f35",
                    borderRadius: 7,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "800", color: copied ? "#38D926" : "#2a3f5f", letterSpacing: 1 }}>
                    {copied ? "✓ COPIED" : "⎘ COPY"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Terminal body */}
            <View style={{ padding: 14 }}>
              <ScrollView
                ref={scrollViewRef}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                showsVerticalScrollIndicator={true}
                style={{ height: 220 }}
              >
                {logs.length === 0 ? (
                  <Text style={{ fontSize: 12, fontFamily: "monospace", color: "#141e30", fontStyle: "italic" }}>
                    $ awaiting command...
                  </Text>
                ) : (
                  logs.map((logLine, index) => {
                    const isError = logLine.includes("❌") || logLine.includes("Error");
                    const isWarning = logLine.includes("⚠️");
                    const isSuccess = logLine.includes("✓") || logLine.includes("🎉");
                    const isDivider = logLine.startsWith("---");
                    const color = isError ? "#f87171" : isWarning ? "#fbbf24" : isSuccess ? "#4ade80" : isDivider ? "#1a2a3a" : "#3d5068";

                    return (
                      <Text
                        key={index}
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color,
                          marginBottom: 3,
                          lineHeight: 17,
                        }}
                      >
                        {logLine}
                      </Text>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}