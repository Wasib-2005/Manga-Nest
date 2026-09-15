import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
} from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTabScreenAnimation } from "../../components/ui/navigation/tabTransitionContext";
import { ProgressBar } from "../../components/ui/mangaDownloader/ProgressBar";
import { LogConsole } from "../../components/ui/mangaDownloader/LogConsole";
import {
  initializeDatabase,
  restoreSerializedDatabase,
  serializeDatabase,
} from "../../services/reader/database";

const MANGA_PATH = "manga";
const SQLITE_PATH = "SQLite";
const SQLITE_FILE = "library.db";

type OpStatus = "idle" | "running" | "done" | "error";

interface OpState {
  status: OpStatus;
  current: number;
  total: number;
  message: string;
}

const IDLE_OP: OpState = { status: "idle", current: 0, total: 0, message: "" };

const styles = {
  backupHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#38D92615",
    borderWidth: 1,
    borderColor: "#38D92635",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  backupHero: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#0a0e17",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderLeftWidth: 3,
    borderLeftColor: "#38D926",
  },
  backupSummary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#07111f",
    borderWidth: 1,
    borderColor: "#10213a",
  },
  summaryItem: { alignItems: "center" as const, gap: 2 },
  summaryValue: { color: "#e2e8f0", fontSize: 11, fontWeight: "800" as const },
  summaryLabel: { color: "#475569", fontSize: 9, fontWeight: "600" as const },
  summaryDivider: { width: 1, height: 26, backgroundColor: "#1e293b" },
};

const StatusDot = ({ color }: { color: string }) => (
  <View
    style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }}
  />
);

export default function BackupRestore() {
  const tabAnimation = useTabScreenAnimation("backup");
  // ── Separate state per operation ─────────────────────────────────────────
  const [backup, setBackup] = useState<OpState>(IDLE_OP);
  const [restore, setRestore] = useState<OpState>(IDLE_OP);

  const [backupDir, setBackupDir] = useState<Directory | null>(null);
  const [restoreDir, setRestoreDir] = useState<Directory | null>(null);

  const [logs, setLogs] = useState<string[]>([]);

  const cancelRef = useRef(false);

  const isBusy = backup.status === "running" || restore.status === "running";

  // ── Helpers ───────────────────────────────────────────────────────────────

  const log = (msg: string) =>
    setLogs((p) => (p.length >= 500 ? [...p.slice(-499), msg] : [...p, msg]));

  const clearLogs = () => setLogs([]);

  const pct = (op: OpState) =>
    op.total > 0 ? Math.round((op.current / op.total) * 100) : 0;

  const formatPath = (uri: string) =>
    decodeURIComponent(uri)
      .replace(
        "content://com.android.externalstorage.documents/tree/primary:",
        "Internal Storage/",
      )
      .replace("file:///storage/emulated/0/", "Internal Storage/");

  const isDir = (item: any): item is Directory =>
    item instanceof Directory || typeof item?.list === "function";
  const isFile = (item: any): item is File => !isDir(item);

  // ── Folder pickers ────────────────────────────────────────────────────────

  const pickBackupDir = async () => {
    try {
      const d = await Directory.pickDirectoryAsync();
      if (d) setBackupDir(d);
    } catch {
      /* cancelled */
    }
  };

  const pickRestoreDir = async () => {
    try {
      const d = await Directory.pickDirectoryAsync();
      if (d) setRestoreDir(d);
    } catch {
      /* cancelled */
    }
  };

  // ── Scan ──────────────────────────────────────────────────────────────────

  const handleScan = () => {
    log("─────────────────────────────");
    log("🔍 Scanning internal storage…");
    const dir = new Directory(Paths.document, MANGA_PATH);
    if (!dir.exists) {
      log("❌ manga/ folder does not exist.");
      return;
    }
    const items = dir.list();
    if (!items.length) {
      log("⚠️  manga/ folder is empty.");
      return;
    }
    log(`📁 ${items.length} items:`);
    items.forEach((i) => log(`   ↳ [${isDir(i) ? "Dir" : "File"}] ${i.name}`));
    log("─────────────────────────────");
  };

  // ── Backup ────────────────────────────────────────────────────────────────

  const handleBackup = async () => {
    if (!backupDir || isBusy) return;
    cancelRef.current = false;
    clearLogs();
    setBackup({ status: "running", current: 0, total: 0, message: "" });
    // Reset restore to idle so its done badge clears
    setRestore(IDLE_OP);

    try {
      // Ensure the SQLite file exists and contains the latest metadata before copying it.
      await initializeDatabase();
      const src = new Directory(Paths.document, MANGA_PATH);
      if (!src.exists) {
        log("⚠️  No manga image folders found; backing up SQLite metadata only.");
      }

      const items = src.exists ? src.list() : [];
      if (!items.length) log("⚠️  manga/ folder is empty.");

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const name = `backup_manga_nest_${ts}`;
      log(`Creating backup folder: ${name}`);

      // SAF-backed folders must use createDirectory(); Directory.create()
      // only works for regular file:// paths.
      const dest = backupDir.createDirectory(name);
      const mangaDest = dest.createDirectory(MANGA_PATH);
      log(`📦 Backup path: ${formatPath(dest.uri)}`);

      for (let i = 0; i < items.length; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const item = items[i];
        setBackup({
          status: "running",
          current: i + 1,
          total: items.length,
          message: item.name,
        });
        log(`[${i + 1}/${items.length}] 💾 ${item.name}`);

        if (isDir(item)) {
          await item.copy(mangaDest);
        } else {
          const f = item as File;
          const data = await f.text();
          const mime = item.name.endsWith(".json")
            ? "application/json"
            : "application/octet-stream";
          const tf = await mangaDest.createFile(item.name, mime);
          await tf.write(data);
        }
      }

      const dbDir = dest.createDirectory(SQLITE_PATH);
      const dbFile = dbDir.createFile(SQLITE_FILE, "application/octet-stream");
      await dbFile.write(await serializeDatabase());
      log("💾 SQLite library database copied.");

      const createNomedia = dest.createFile(
        ".nomedia",
        "application/octet-stream",
      );
      await createNomedia.write("");

      log("📁 Created .nomedia file.");

      log("🎉 Backup complete!");
      setBackup({
        status: "done",
        current: items.length,
        total: items.length,
        message: "Complete",
      });
    } catch (e: any) {
      const cancelled = e.message === "CANCELLED";
      log(cancelled ? "🛑 Cancelled." : `❌ ${e.message}`);
      setBackup({ ...IDLE_OP, status: cancelled ? "idle" : "error" });
    }
  };

  // ── Restore ───────────────────────────────────────────────────────────────

  const handleRestore = async () => {
    if (!restoreDir || isBusy) return;
    cancelRef.current = false;
    clearLogs();
    setRestore({ status: "running", current: 0, total: 0, message: "" });
    // Reset backup state so its done badge clears
    setBackup(IDLE_OP);

    try {
      // New backups contain manga/ and SQLite/ side by side. If the user
      // selects a parent folder containing several backups, let them choose
      // the exact backup instead of guessing.
      const isBackupFolder = (dir: Directory) => {
        const children = dir.list();
        const mangaDir = children.find(
          (item): item is Directory =>
            isDir(item) && item.name.toLowerCase() === MANGA_PATH.toLowerCase(),
        );
        const sqliteDir = children.find(
          (item): item is Directory =>
            isDir(item) && item.name.toLowerCase() === SQLITE_PATH.toLowerCase(),
        );
        if (!mangaDir || !sqliteDir) return false;
        return sqliteDir
          .list()
          .some((item) => item.name.toLowerCase() === SQLITE_FILE.toLowerCase());
      };
      let src = restoreDir;
      if (!isBackupFolder(src)) {
        const candidates = src
          .list()
          .filter((item): item is Directory => isDir(item))
          .filter(isBackupFolder)
          .sort((a, b) => b.name.localeCompare(a.name));
        if (candidates.length === 0) {
          throw new Error(
            "No valid backup folder found. Select a folder containing manga/ and SQLite/library.db, or select its parent folder.",
          );
        }
        if (candidates.length > 1) {
          const selected = await new Promise<Directory | null>((resolve) => {
            Alert.alert(
              "Choose a backup",
              "Select which backup you want to restore.",
              [
                ...candidates.slice(0, 3).map((candidate) => ({
                  text: candidate.name,
                  onPress: () => resolve(candidate),
                })),
                {
                  text: "Cancel",
                  style: "cancel" as const,
                  onPress: () => resolve(null),
                },
              ],
            );
          });
          if (!selected) throw new Error("CANCELLED");
          src = selected;
        } else {
          src = candidates[0];
        }
      }

      const items = src.list();
      const mangaItem = items.find(
        (item): item is Directory =>
          isDir(item) && item.name.toLowerCase() === MANGA_PATH.toLowerCase(),
      );
      const sqliteItem = items.find(
        (item): item is Directory =>
          isDir(item) && item.name.toLowerCase() === SQLITE_PATH.toLowerCase(),
      );
      if (!mangaItem || !sqliteItem) {
        throw new Error(
          "No valid backup folder found. Backup must contain manga/ and SQLite/library.db.",
        );
      }
      const dbItem = sqliteItem
        .list()
        .find(
          (item): item is File =>
            isFile(item) &&
            item.name.toLowerCase() === SQLITE_FILE.toLowerCase(),
        );
      if (!dbItem) {
        throw new Error("No valid SQLite/library.db found in this backup.");
      }
      const mangaItems = mangaItem
        .list()
        .filter((item): item is Directory => isDir(item));
      const restoreTotal = mangaItems.length + 1;

      const dest = new Directory(Paths.document, MANGA_PATH);
      if (dest.exists) {
        log("🧹 Clearing existing data…");
        await dest.delete();
        await new Promise((r) => setTimeout(r, 100));
      }
      dest.create();
      for (let i = 0; i < mangaItems.length; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const mangaFolder = mangaItems[i];
        setRestore({
          status: "running",
          current: i + 1,
          total: restoreTotal,
          message: `${MANGA_PATH}/${mangaFolder.name}`,
        });
        log(
          `[${i + 1}/${restoreTotal}] 🔄 ${MANGA_PATH}/${mangaFolder.name}`,
        );
        await mangaFolder.copy(dest);
      }

      if (cancelRef.current) throw new Error("CANCELLED");
      setRestore({
        status: "running",
        current: restoreTotal,
        total: restoreTotal,
        message: `${SQLITE_PATH}/${SQLITE_FILE}`,
      });
      log(`[${restoreTotal}/${restoreTotal}] 🔄 ${SQLITE_PATH}/${SQLITE_FILE}`);
      await restoreSerializedDatabase(await dbItem.bytes());
      log("💾 SQLite library database restored.");

      log("🎉 Restore complete! Restart the app to reload your library.");
      setRestore({
        status: "done",
        current: restoreTotal,
        total: restoreTotal,
        message: "Complete",
      });
    } catch (e: any) {
      const cancelled = e.message === "CANCELLED";
      log(cancelled ? "🛑 Cancelled." : `❌ ${e.message}`);
      setRestore({ ...IDLE_OP, status: cancelled ? "idle" : "error" });
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const globalStatus = isBusy
    ? backup.status === "running"
      ? "SAVING"
      : "LOADING"
    : backup.status === "done" || restore.status === "done"
      ? "COMPLETE"
      : backup.status === "error" || restore.status === "error"
        ? "FAILED"
        : "READY";

  const globalColor =
    globalStatus === "SAVING"
      ? "#38D926"
      : globalStatus === "LOADING"
        ? "#60a5fa"
        : globalStatus === "COMPLETE"
          ? "#38D926"
          : globalStatus === "FAILED"
            ? "#ef4444"
            : "#475569";

  return (
    <Animated.View entering={FadeIn.duration(280)} style={[{ flex: 1, backgroundColor: "#050a14" }, tabAnimation]}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(360)}
          style={{
            paddingTop: 64,
            paddingHorizontal: 20,
            paddingBottom: 24,
            marginBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#0f1f35",
          }}
        >
          <View style={styles.backupHero}
          >
            <View style={styles.backupHeroIcon}>
              <MaterialCommunityIcons name="database-sync-outline" size={28} color="#38D926" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: "900",
                  color: "#f1f5f9",
                  letterSpacing: -0.5,
                }}
              >
                Backup
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#38D926", marginTop: 2 }}>
                <Text style={{ color: "#f1f5f9" }}>Manga</Text>
                <Text style={{ color: "#38D926" }}>Nest</Text>
              </Text>
            </View>

            {/* Global status pill */}
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
              <StatusDot color={globalColor} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: globalColor,
                  letterSpacing: 2,
                }}
              >
                {globalStatus}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleScan}
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
              marginTop: 16,
            }}
          >
            <MaterialCommunityIcons name="folder-search-outline" size={18} color="#38D926" />
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
          <View style={styles.backupSummary}>
            <View style={styles.summaryItem}>
              <MaterialCommunityIcons name="database-outline" size={16} color="#38D926" />
              <Text style={styles.summaryValue}>SQLite</Text>
              <Text style={styles.summaryLabel}>metadata</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <MaterialCommunityIcons name="folder-multiple-outline" size={16} color="#60a5fa" />
              <Text style={styles.summaryValue}>Manga</Text>
              <Text style={styles.summaryLabel}>files</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <MaterialCommunityIcons name="shield-check-outline" size={16} color="#a78bfa" />
              <Text style={styles.summaryValue}>Safe</Text>
              <Text style={styles.summaryLabel}>restore</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(420)} style={{ paddingHorizontal: 20, paddingTop: 28, gap: 14 }}>
          {/* ── BACKUP CARD ── */}
          <OperationCard
            title="Backup Library"
            subtitle="Export · Save to storage"
            icon="cloud-upload-outline"
            accentColor="#38D926"
            darkBg="#050e08"
            borderColor="#12301a"
            op={backup}
            pct={pct(backup)}
            dirUri={backupDir?.uri}
            dirPlaceholder="Tap to choose destination →"
            dirLabel="Destination Folder"
            isBusy={isBusy}
            onPickDir={pickBackupDir}
            onStart={handleBackup}
            onAbort={() => {
              cancelRef.current = true;
            }}
            actionLabel={
              backup.status === "running" ? "Backing up…" : "Start Backup"
            }
            formatPath={formatPath}
          />

          {/* ── RESTORE CARD ── */}
          <OperationCard
            title="Restore Library"
            subtitle="Import · Load from backup"
            icon="cloud-download-outline"
            accentColor="#60a5fa"
            darkBg="#050810"
            borderColor="#0f1f38"
            op={restore}
            pct={pct(restore)}
            dirUri={restoreDir?.uri}
            dirPlaceholder="Tap to locate backup →"
            dirLabel="Source Folder"
            isBusy={isBusy}
            onPickDir={pickRestoreDir}
            onStart={handleRestore}
            onAbort={() => {
              cancelRef.current = true;
            }}
            actionLabel={
              restore.status === "running" ? "Restoring…" : "Start Restore"
            }
            formatPath={formatPath}
            showWarning
          />

          {/* ── CONSOLE ── */}
          <LogConsole logs={logs} loading={isBusy} onClear={clearLogs} />
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

// ─── Reusable operation card ──────────────────────────────────────────────────

interface CardProps {
  title: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  darkBg: string;
  borderColor: string;
  op: OpState;
  pct: number;
  dirUri?: string;
  dirPlaceholder: string;
  dirLabel: string;
  isBusy: boolean;
  onPickDir: () => void;
  onStart: () => void;
  onAbort: () => void;
  actionLabel: string;
  formatPath: (uri: string) => string;
  showWarning?: boolean;
}

function OperationCard({
  title,
  subtitle,
  icon,
  accentColor,
  darkBg,
  borderColor,
  op,
  pct,
  dirUri,
  dirPlaceholder,
  dirLabel,
  isBusy,
  onPickDir,
  onStart,
  onAbort,
  actionLabel,
  formatPath,
  showWarning,
}: CardProps) {
  const isRunning = op.status === "running";
  const isDone = op.status === "done";
  const isError = op.status === "error";
  const hasDir = !!dirUri;

  const btnDisabled = isBusy || !hasDir;
  const btnColor = btnDisabled ? "#172033" : accentColor;
  const btnBorder = btnDisabled ? "#293852" : accentColor;
  const btnText = btnDisabled
    ? "#718096"
    : accentColor === "#38D926"
      ? "#030712"
      : "#ffffff";

  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor,
        backgroundColor: darkBg,
        overflow: "hidden",
      }}
    >
      {/* Accent bar */}
      <View style={{ height: 3, backgroundColor: accentColor, opacity: 0.7 }} />

      {/* Header */}
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
              backgroundColor: darkBg,
              borderWidth: 1,
              borderColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons name={icon as any} size={22} color={accentColor} />
          </View>
          <View>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                color: "#f1f5f9",
                letterSpacing: 0.3,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: accentColor,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          </View>
        </View>

        {/* Status badge — only shows for THIS card's operation */}
        {isRunning && (
          <View
            style={{
              backgroundColor: darkBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "800",
                color: accentColor,
                letterSpacing: 2,
              }}
            >
              {pct}%
            </Text>
          </View>
        )}
        {isDone && (
          <View
            style={{
              backgroundColor: darkBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "800",
                color: accentColor,
                letterSpacing: 1.5,
              }}
            >
              DONE ✓
            </Text>
          </View>
        )}
        {isError && (
          <View
            style={{
              backgroundColor: "#1a0505",
              borderWidth: 1,
              borderColor: "#3b0a0a",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "800",
                color: "#ef4444",
                letterSpacing: 1.5,
              }}
            >
              FAILED ✗
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View
        style={{
          height: 1,
          backgroundColor: borderColor,
          marginHorizontal: 18,
        }}
      />

      <View style={{ padding: 16, gap: 12 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "900",
            color: "#64748b",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          1. Choose a folder
        </Text>

        <TouchableOpacity
          onPress={onPickDir}
          disabled={isBusy}
          activeOpacity={0.7}
          style={{
            backgroundColor: hasDir ? "#061510" : "#0a1220",
            borderWidth: 1,
            borderColor: hasDir ? "#1f5a28" : "#263650",
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
              backgroundColor: hasDir ? "#0d2a12" : "#111d31",
              borderWidth: 1,
              borderColor: hasDir ? "#1a4a22" : "#263650",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 14 }}>{hasDir ? "📁" : "📂"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 9,
                fontWeight: "800",
                color: "#94a3b8",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              {dirLabel}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: hasDir ? "#86efac" : "#64748b",
              }}
            >
              {hasDir ? formatPath(dirUri!) : dirPlaceholder}
            </Text>
          </View>
          {hasDir ? (
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: accentColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ fontSize: 11, color: "#030712", fontWeight: "900" }}
              >
                ✓
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 16, color: "#94a3b8" }}>›</Text>
          )}
        </TouchableOpacity>

        <Text
          style={{
            fontSize: 10,
            fontWeight: "900",
            color: "#64748b",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          2. {isRunning ? "Working…" : "Start"}
        </Text>

        {/* Progress bar — only shown for THIS card when running */}
        {isRunning && op.total > 0 && (
          <View style={{ gap: 6 }}>
            <ProgressBar current={op.current} total={op.total} />
            <Text
              numberOfLines={1}
              style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}
            >
              {op.message}
            </Text>
          </View>
        )}

        {/* Warning */}
        {showWarning && (
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
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: "#334155",
                flex: 1,
                lineHeight: 15,
              }}
            >
              Restoring will overwrite your current local data
            </Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={onStart}
            disabled={btnDisabled}
            activeOpacity={0.8}
            style={{
              flex: 1,
              backgroundColor: btnColor,
              borderWidth: 1.5,
              borderColor: btnBorder,
              borderRadius: 13,
              paddingVertical: 15,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 3,
                textTransform: "uppercase",
                color: btnText,
              }}
            >
              {hasDir ? actionLabel : "CHOOSE A FOLDER FIRST"}
            </Text>
          </TouchableOpacity>

          {isRunning && (
            <TouchableOpacity
              onPress={onAbort}
              style={{
                backgroundColor: "#1a0505",
                borderWidth: 1.5,
                borderColor: "#3b0a0a",
                borderRadius: 13,
                paddingHorizontal: 16,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: "#ef4444",
                  letterSpacing: 1,
                }}
              >
                ABORT
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}