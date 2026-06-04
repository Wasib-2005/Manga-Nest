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

  const [backupTargetDir, setBackupTargetDir] = useState<Directory | null>(
    null,
  );
  const [restoreSourceDir, setRestoreSourceDir] = useState<Directory | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  // ─── 🛠️ HIGH PERFORMANCE LOGGING ──────────────────────────────────────────
  const log = (msg: string) => {
    setLogs((prev) => {
      const newLogs = [...prev, msg];
      return newLogs.length > 500
        ? newLogs.slice(newLogs.length - 500)
        : newLogs;
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
      .replace(
        "content://com.android.externalstorage.documents/tree/primary:",
        "Internal Storage/",
      )
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

      log(
        formatPath(
          "Creating backup directory at: \n" + backupDir.uri + backupFolderName,
        ),
      );

      const mangaDir = await backupDir.createDirectory(backupFolderName);
      console.log("Backup manga directory will be:", mangaDir);

      for (let i = 0; i < total; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const item = contents[i];

        setProgress({
          current: i + 1,
          total,
          message: `Backing up: ${item.name}`,
        });
        log(`[${i + 1}/${total}] 💾 Backing up: ${item.name}`);

        if (isDirectory(item)) {
          await item.copy(mangaDir);
        } else {
          log(
            `Target is a File (${item.name}) -> Creating via Directory.createFile`,
          );
          const sourceFile = item as File;
          const fileData = await sourceFile.text();
          const mimeType = item.name.endsWith(".json")
            ? "application/json"
            : "application/octet-stream";

          const targetFile = await mangaDir.createFile(item.name, mimeType);
          await targetFile.write(fileData);
          log(`✓ Successfully backed up file: ${item.name}`);
        }
      }
      setStatus("done");
    } catch (e: any) {
      console.log(
        e.message === "CANCELLED"
          ? "\n🛑 Stopped by user."
          : `\n❌ Error: ${e.message}`,
      );
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
      } else if (
        new Directory(restoreSourceDir, "backup_manganest_data").exists
      ) {
        const container = new Directory(
          restoreSourceDir,
          "backup_manganest_data",
        );
        trueBackupSource = new Directory(container, "manga");
      } else {
        trueBackupSource =
          restoreSourceDir.name === "manga"
            ? restoreSourceDir
            : new Directory(restoreSourceDir, "manga");
      }

      if (!trueBackupSource.exists) {
        throw new Error(
          "Could not find a valid 'manga' data backup directory in your selection.",
        );
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

        setProgress({
          current: i + 1,
          total,
          message: `Importing: ${item.name}`,
        });
        log(`[${i + 1}/${total}] 🔄 Restoring: ${item.name}`);

        const target = isDirectory(item)
          ? new Directory(localMangaDir, item.name)
          : new File(localMangaDir, item.name);

        await item.copy(target);
      }

      log("\n🎉 App restoration completed successfully!");
      setStatus("done");
    } catch (e: any) {
      log(
        e.message === "CANCELLED"
          ? "\n🛑 Stopped by user."
          : `\n❌ Error: ${e.message}`,
      );
      setStatus(e.message === "CANCELLED" ? "idle" : "error");
    }
  };

  const isBusy = status === "backing_up" || status === "restoring";

  // ─── STATUS META ───────────────────────────────────────────────────────────
  const statusMeta = {
    idle: { label: "READY", color: "#334155", dot: "#475569" },
    backing_up: { label: "SAVING", color: "#38D926", dot: "#38D926" },
    restoring: { label: "LOADING", color: "#60a5fa", dot: "#60a5fa" },
    done: { label: "COMPLETE", color: "#38D926", dot: "#38D926" },
    error: { label: "FAILED", color: "#ef4444", dot: "#ef4444" },
  }[status];

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#050a14" }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO HEADER ───────────────────────────────────────────────── */}
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
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: "white",
                    letterSpacing: 4,
                    marginBottom: 6,
                  }}
                >
                  Manga
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: "#38D926",
                    letterSpacing: 4,
                    marginBottom: 6,
                  }}
                >
                  Nest
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: "900",
                  color: "#f1f5f9",
                  letterSpacing: -1,
                  lineHeight: 34,
                }}
              >
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
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: statusMeta.dot,
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: statusMeta.color,
                  letterSpacing: 2,
                }}
              >
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
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "#94a3b8",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              Inspect Internal Storage
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 28, gap: 16 }}>
          {/* ── BACKUP CARD ─────────────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "#0f2a18",
              backgroundColor: "#060f0a",
              overflow: "hidden",
            }}
          >
            {/* Card header stripe */}
            <View
              style={{
                backgroundColor: "#071209",
                paddingVertical: 14,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#0c2214",
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "#38D926",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16 }}>📦</Text>
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "800",
                    color: "#f1f5f9",
                    letterSpacing: 0.2,
                  }}
                >
                  Backup Library
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: "#38D926",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginTop: 1,
                  }}
                >
                  Export to storage
                </Text>
              </View>
            </View>

            <View style={{ padding: 18, gap: 12 }}>
              {/* Directory picker */}
              <TouchableOpacity
                onPress={handleSelectBackupLocation}
                disabled={isBusy}
                style={{
                  backgroundColor: "#040d07",
                  borderWidth: 1,
                  borderColor: backupTargetDir ? "#1a4a24" : "#0c1f10",
                  borderRadius: 14,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>📁</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      color: "#3a5a42",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    Target Directory
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: backupTargetDir ? "#86efac" : "#2d4a35",
                    }}
                  >
                    {backupTargetDir
                      ? formatPath(backupTargetDir.uri)
                      : "Tap to choose destination folder"}
                  </Text>
                </View>
                {backupTargetDir && (
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: "#38D926",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 10, color: "#030712" }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Action button */}
              <TouchableOpacity
                onPress={handleStartBackup}
                disabled={isBusy || !backupTargetDir}
                style={{
                  backgroundColor:
                    !backupTargetDir || isBusy ? "#071209" : "#38D926",
                  borderWidth: 1,
                  borderColor:
                    !backupTargetDir || isBusy ? "#0f2a18" : "#38D926",
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
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

          {/* ── RESTORE CARD ────────────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "#0f1f35",
              backgroundColor: "#06090f",
              overflow: "hidden",
            }}
          >
            {/* Card header stripe */}
            <View
              style={{
                backgroundColor: "#070c16",
                paddingVertical: 14,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#0c1628",
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "#1d4ed8",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16 }}>🔄</Text>
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "800",
                    color: "#f1f5f9",
                    letterSpacing: 0.2,
                  }}
                >
                  Restore Library
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: "#60a5fa",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginTop: 1,
                  }}
                >
                  Import from backup
                </Text>
              </View>
            </View>

            <View style={{ padding: 18, gap: 12 }}>
              {/* Directory picker */}
              <TouchableOpacity
                onPress={handleSelectRestoreLocation}
                disabled={isBusy}
                style={{
                  backgroundColor: "#040710",
                  borderWidth: 1,
                  borderColor: restoreSourceDir ? "#1a3060" : "#0c1528",
                  borderRadius: 14,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>📂</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      color: "#1e3a5f",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    Source Directory
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: restoreSourceDir ? "#93c5fd" : "#1e3a5f",
                    }}
                  >
                    {restoreSourceDir
                      ? formatPath(restoreSourceDir.uri)
                      : "Tap to locate backup folder"}
                  </Text>
                </View>
                {restoreSourceDir && (
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: "#60a5fa",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 10, color: "#030712" }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Action button */}
              <TouchableOpacity
                onPress={handleStartRestore}
                disabled={isBusy || !restoreSourceDir}
                style={{
                  backgroundColor:
                    !restoreSourceDir || isBusy ? "#070c16" : "#3b82f6",
                  borderWidth: 1,
                  borderColor:
                    !restoreSourceDir || isBusy ? "#0f1f35" : "#3b82f6",
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
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

          {/* ── PROGRESS PANEL ──────────────────────────────────────────── */}
          {status !== "idle" && (
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor:
                  status === "error"
                    ? "#3b0a0a"
                    : status === "done"
                      ? "#0f2a18"
                      : "#0f1f35",
                backgroundColor:
                  status === "error"
                    ? "#0a0404"
                    : status === "done"
                      ? "#060f0a"
                      : "#060911",
                padding: 18,
                gap: 16,
              }}
            >
              {/* Header row */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: statusMeta.dot,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: statusMeta.color,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                    }}
                  >
                    {status.replace("_", " ")}
                  </Text>
                  {progress.total > 0 && (
                    <View
                      style={{
                        backgroundColor: "#0a1628",
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        marginLeft: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: statusMeta.color,
                        }}
                      >
                        {pct}%
                      </Text>
                    </View>
                  )}
                </View>

                {isBusy && (
                  <TouchableOpacity
                    onPress={() => {
                      cancelRef.current = true;
                    }}
                    style={{
                      backgroundColor: "#1a0505",
                      borderWidth: 1,
                      borderColor: "#3b0a0a",
                      borderRadius: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: "#ef4444",
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                      }}
                    >
                      Abort
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <ProgressBar current={progress.current} total={progress.total} />

              {progress.message ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 11,
                    fontWeight: "500",
                    color: "#475569",
                    fontStyle: "italic",
                  }}
                >
                  {progress.message}
                </Text>
              ) : (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "500",
                    color: "#334155",
                    fontStyle: "italic",
                  }}
                >
                  Initializing...
                </Text>
              )}
            </View>
          )}

          {/* ── TERMINAL ────────────────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "#0d1117",
              backgroundColor: "#030712",
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            {/* Terminal top bar */}
            <View
              style={{
                backgroundColor: "#070d1a",
                paddingVertical: 12,
                paddingHorizontal: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottomWidth: 1,
                borderBottomColor: "#0d1a2e",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                {/* Traffic lights */}
                <View style={{ flexDirection: "row", gap: 6, marginRight: 4 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#ef4444",
                    }}
                  />
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#f59e0b",
                    }}
                  />
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#22c55e",
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: "#1e3a5f",
                    letterSpacing: 2,
                    textTransform: "uppercase",
                  }}
                >
                  Console {logs.length === 500 ? "· MAX" : ""}
                </Text>
              </View>

              {logs.length > 0 && (
                <TouchableOpacity
                  onPress={handleCopyLogs}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: copied ? "#071209" : "#0a1628",
                    borderWidth: 1,
                    borderColor: copied ? "#0f2a18" : "#0f1f35",
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: copied ? "#38D926" : "#64748b",
                      letterSpacing: 0.5,
                    }}
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Terminal body */}
            <View style={{ padding: 16 }}>
              <ScrollView
                ref={scrollViewRef}
                onContentSizeChange={() =>
                  scrollViewRef.current?.scrollToEnd({ animated: true })
                }
                showsVerticalScrollIndicator={true}
                style={{ height: 220 }}
              >
                {logs.length === 0 ? (
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "monospace",
                      color: "#1e3a5f",
                      fontStyle: "italic",
                    }}
                  >
                    $ awaiting command...
                  </Text>
                ) : (
                  logs.map((logLine, index) => {
                    const isError =
                      logLine.includes("❌") || logLine.includes("Error");
                    const isWarning = logLine.includes("⚠️");
                    const isSuccess =
                      logLine.includes("✓") || logLine.includes("🎉");
                    const color = isError
                      ? "#f87171"
                      : isWarning
                        ? "#fbbf24"
                        : isSuccess
                          ? "#4ade80"
                          : "#475569";

                    return (
                      <Text
                        key={index}
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color,
                          marginBottom: 4,
                          lineHeight: 18,
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
