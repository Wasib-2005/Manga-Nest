import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { ProgressBar } from "../../components/ui/mangaDownloader/ProgressBar";
import { LogConsole } from "../../components/ui/mangaDownloader/LogConsole";

const MANGA_PATH = "manga";

type OpStatus = "idle" | "running" | "done" | "error";

interface OpState {
  status: OpStatus;
  current: number;
  total: number;
  message: string;
}

const IDLE_OP: OpState = { status: "idle", current: 0, total: 0, message: "" };

export default function BackupRestore() {
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
      const src = new Directory(Paths.document, MANGA_PATH);
      if (!src.exists) {
        log("⚠️  No manga data found.");
        setBackup({ ...IDLE_OP, status: "done" });
        return;
      }

      const items = src.list();
      if (!items.length) {
        log("⚠️  manga/ folder is empty.");
        setBackup({ ...IDLE_OP, status: "done" });
        return;
      }

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const name = `backup_manga_nest_${ts}`;
      log(`Creating backup folder: ${name}`);

      const dest = await new Directory(backupDir).createDirectory(name);

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
          await item.copy(dest);
        } else {
          const f = item as File;
          const data = await f.text();
          const mime = item.name.endsWith(".json")
            ? "application/json"
            : "application/octet-stream";
          const tf = await dest.createFile(item.name, mime);
          await tf.write(data);
        }
      }

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
      // Resolve the actual manga/ directory inside the backup folder
      let src: Directory;
      if (restoreDir.name === "manga") {
        src = restoreDir;
      } else {
        const candidate = new Directory(restoreDir, "manga");
        if (candidate.exists) {
          src = candidate;
        } else {
          // Maybe they picked the backup_manga_nest_XXX folder directly
          src = restoreDir;
        }
      }

      if (!src.exists) {
        throw new Error(
          "Could not find a valid manga backup folder in your selection.",
        );
      }

      const items = src.list();
      if (!items.length) {
        log("⚠️  Selected backup is empty.");
        setRestore({ ...IDLE_OP, status: "done" });
        return;
      }

      const dest = new Directory(Paths.document, MANGA_PATH);
      if (dest.exists) {
        log("🧹 Clearing existing data…");
        await dest.delete();
        await new Promise((r) => setTimeout(r, 100));
      }
      dest.create();

      for (let i = 0; i < items.length; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const item = items[i];

        if (item.name === ".nomedia") continue;

        setRestore({
          status: "running",
          current: i + 1,
          total: items.length - 1,
          message: item.name,
        });
        log(`[${i + 1}/${items.length - 1}] 🔄 ${item.name}`);

        const target = isDir(item)
          ? new Directory(dest, item.name)
          : new File(dest, item.name);
        await item.copy(target);
      }

      log("🎉 Restore complete! Restart the app to reload your library.");
      setRestore({
        status: "done",
        current: items.length,
        total: items.length,
        message: "Complete",
      });
    } catch (e: any) {
      const cancelled = e.message === "CANCELLED";
      log(cancelled ? "🛑 Cancelled." : `❌ ${e.message}`);
      setRestore({ ...IDLE_OP, status: cancelled ? "idle" : "error" });
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const StatusDot = ({ color }: { color: string }) => (
    <View
      style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }}
    />
  );

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
    <View style={{ flex: 1, backgroundColor: "#050a14" }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View
          style={{
            paddingTop: 64,
            paddingHorizontal: 24,
            paddingBottom: 32,
            borderBottomWidth: 1,
            borderBottomColor: "#0f1f35",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 20,
            }}
          >
            <View>
              <View style={{ flexDirection: "row" }}>
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
                }}
              >
                {" "}
                Data Sync
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

        <View style={{ paddingHorizontal: 20, paddingTop: 28, gap: 14 }}>
          {/* ── BACKUP CARD ── */}
          <OperationCard
            title="Backup Library"
            subtitle="Export · Save to storage"
            emoji="📦"
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
            emoji="🔄"
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
          <LogConsole logs={logs} loading={isBusy} />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Reusable operation card ──────────────────────────────────────────────────

interface CardProps {
  title: string;
  subtitle: string;
  emoji: string;
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
  emoji,
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
  const btnColor = btnDisabled ? "#060f08" : accentColor;
  const btnBorder = btnDisabled ? "#0f2a18" : accentColor;
  const btnText = btnDisabled
    ? "#1a4a24"
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
            <Text style={{ fontSize: 18 }}>{emoji}</Text>
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

      <View style={{ padding: 16, gap: 10 }}>
        {/* Dir picker */}
        <TouchableOpacity
          onPress={onPickDir}
          disabled={isBusy}
          activeOpacity={0.7}
          style={{
            backgroundColor: hasDir ? "#061510" : "#040a06",
            borderWidth: 1,
            borderColor: hasDir ? "#1f5a28" : "#0c1f10",
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
              backgroundColor: hasDir ? "#0d2a12" : "#060f08",
              borderWidth: 1,
              borderColor: hasDir ? "#1a4a22" : "#0c1f10",
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
                color: "#2a5a32",
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
                color: hasDir ? "#86efac" : "#1f3a26",
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
            <Text style={{ fontSize: 16, color: "#1a3a20" }}>›</Text>
          )}
        </TouchableOpacity>

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

        {/* Action button + abort */}
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
              {actionLabel}
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