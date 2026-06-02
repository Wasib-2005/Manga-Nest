import React, { useState, useRef, useEffect } from "react";
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
// Note: We are replacing your external LogConsole with a high-performance inline one 
// to safely handle the massive 235 manga transfer without lagging.

const MANGA_PATH = "manga"; 

type OperationStatus = "idle" | "backing_up" | "restoring" | "done" | "error";

export default function BackupRestore() {
  const [status, setStatus] = useState<OperationStatus>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const [logs, setLogs] = useState<string[]>([]);
  const cancelRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const [backupTargetDir, setBackupTargetDir] = useState<Directory | null>(null);
  const [restoreSourceDir, setRestoreSourceDir] = useState<Directory | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── 🛠️ HIGH PERFORMANCE LOGGING ──────────────────────────────────────────
  const log = (msg: string) => {
    setLogs((prev) => {
      // Keep only the last 500 logs so 235+ manga don't crash the phone's memory!
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

  // UI HELPER: Make paths look clean and readable
  const formatPath = (uri: string) => {
    if (!uri) return "Unknown Path";
    return uri.replace("file:///storage/emulated/0/", "Internal Storage ➔ ")
              .replace("%3A", " ➔ ")
              .replace("%2F", "/");
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
      log(`📁 Found ${contents.length} series inside App Data:`);
      contents.forEach(item => {
        const type = item instanceof Directory || item.constructor.name === "Directory" ? "Folder" : "File";
        log(`   ↳ [${type}] ${item.name}`);
      });
    }
    log("--------------------------------------");
  };

  const findTrueDataRoot = (startDir: Directory): Directory => {
    let currentDir = startDir;
    while (true) {
      const contents = currentDir.list();
      if (contents.length === 1 && contents[0].name === "manga") {
        log(`🛠️ Bypassing nested folder trap: ${currentDir.name}/manga...`);
        currentDir = new Directory(currentDir, "manga");
      } else {
        break;
      }
    }
    return currentDir;
  };

  // ─── 🛠️ HELPER: GRANULAR DEEP COPY ─────────────────────────────────────────
  const deepCopy = async (sourceItem: File | Directory, targetParentDir: Directory, indent = "") => {
    const isDir = sourceItem instanceof Directory || sourceItem.constructor.name === "Directory";
    
    if (isDir) {
      log(`${indent}📁 Creating: ${sourceItem.name}`);
      const newLocalDir = new Directory(targetParentDir, sourceItem.name);
      if (!newLocalDir.exists) newLocalDir.create();
      
      const children = (sourceItem as Directory).list();
      for (const child of children) {
        if (cancelRef.current) throw new Error("CANCELLED");
        // Pass a slightly larger indent so folders look structured in the log
        await deepCopy(child, newLocalDir, indent + "   ");
      }
    } else {
      // It's a file (Manga Page)
      log(`${indent}📄 Moving page: ${sourceItem.name}`);
      await sourceItem.copy(targetParentDir);
    }
  };

  // ─── STEP 1: SELECT LOCATIONS ──────────────────────────────────────────────
  const handleSelectBackupLocation = async () => {
    try {
      const selectedDir = await Directory.pickDirectoryAsync();
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
        log(`⚠️ Internal folder does not exist.`);
        setStatus("done");
        return;
      }

      const trueSourceDir = findTrueDataRoot(localMangaDir);
      const contents = trueSourceDir.list();
      const total = contents.length;

      if (total === 0) {
        log(`⚠️ Local directory is empty.`);
        setStatus("done");
        return;
      }

      const timestamp = new Date().getTime();
      const backupContainer = backupTargetDir.createDirectory(`manga_backup_${timestamp}`);
      const innerMangaDir = backupContainer.createDirectory("manga");

      for (let i = 0; i < total; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const item = contents[i];
        
        setProgress({ current: i + 1, total, message: `Exporting Series: ${item.name}` });
        log(`\n[${i + 1}/${total}] Starting Export: ${item.name}`);
        
        await deepCopy(item, innerMangaDir, "   ");
        await new Promise((r) => setTimeout(r, 10)); 
      }

      log("\n🎉 Backup complete!");
      setStatus("done");
    } catch (e: any) {
      log(e.message === "CANCELLED" ? "\n🛑 Stopped by user." : `\n❌ Error: ${e.message}`);
      setStatus(e.message === "CANCELLED" ? "idle" : "error");
    }
  };

  // ─── STEP 3: RUNTIME RESTORE ───────────────────────────────────────────────
  const handleStartRestore = async () => {
    if (!restoreSourceDir) return;

    try {
      resetState("restoring");
      const localMangaDir = new Directory(Paths.document, MANGA_PATH);
      
      if (!localMangaDir.exists) localMangaDir.create();

      const trueBackupSource = findTrueDataRoot(restoreSourceDir);
      const contents = trueBackupSource.list();
      const total = contents.length;

      if (total === 0) {
        log("⚠️ Selected backup folder appears to be entirely empty.");
        setStatus("done");
        return;
      }

      log(`Found ${total} series at root. Beginning deep extraction...`);

      for (let i = 0; i < total; i++) {
        if (cancelRef.current) throw new Error("CANCELLED");
        const item = contents[i];

        setProgress({ current: i + 1, total, message: `Importing Series: ${item.name}` });
        log(`\n[${i + 1}/${total}] Starting Import: ${item.name}`);

        try {
          await deepCopy(item, localMangaDir, "   ");
        } catch (err: any) {
           log(`   ↳ Overwrite required for ${item.name}`);
           const isDir = item instanceof Directory || item.constructor.name === "Directory";
           const target = isDir ? new Directory(localMangaDir, item.name) : new File(localMangaDir, item.name);
           
           if (target.exists) target.delete();
           await new Promise((r) => setTimeout(r, 50)); 
           await deepCopy(item, localMangaDir, "   ");
        }
      }

      log("\n🎉 App restoration completed successfully!");
      setStatus("done");
    } catch (e: any) {
      log(e.message === "CANCELLED" ? "\n🛑 Stopped by user." : `\n❌ Error: ${e.message}`);
      setStatus(e.message === "CANCELLED" ? "idle" : "error");
    }
  };

  const isBusy = status === "backing_up" || status === "restoring";

  return (
    <View className="flex-1 bg-[#030712]">
      <StatusBar barStyle="light-content" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        
        {/* HEADER SECTION */}
        <View className="mb-6 flex-row justify-between items-center">
          <View>
            <Text className="text-3xl font-black text-[#f1f5f9] tracking-tight">
              Data <Text className="text-[#38D926]">Sync</Text>
            </Text>
            <Text className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">
              External File Controls
            </Text>
          </View>
          
          <TouchableOpacity 
            onPress={handleScanInternalData}
            className="bg-[#1e293b] px-3 py-2 rounded-lg border border-[#334155]"
          >
            <Text className="text-[10px] font-bold text-gray-300">🔎 Scan App Data</Text>
          </TouchableOpacity>
        </View>

        {/* ─── BACKUP UI ─── */}
        <View className="mb-6 p-5 rounded-3xl bg-[#0f172a] border border-[#1e293b] shadow-lg">
          <Text className="text-white text-lg font-black mb-4">📦 Backup to Device</Text>
          
          <TouchableOpacity 
            onPress={handleSelectBackupLocation} disabled={isBusy}
            className="w-full bg-[#030712] py-4 px-4 rounded-xl mb-4 border border-[#334155]"
          >
            <Text className="text-gray-500 text-[10px] uppercase font-bold mb-1">Destination Path:</Text>
            <Text className="text-gray-200 font-semibold text-xs" numberOfLines={2}>
              {backupTargetDir ? formatPath(backupTargetDir.uri) : "Tap to select storage folder..."}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleStartBackup} disabled={isBusy || !backupTargetDir}
            className={`w-full py-4 rounded-xl items-center shadow-lg ${!backupTargetDir || isBusy ? "bg-emerald-900/20" : "bg-[#38D926]"}`}
          >
            <Text className={`font-black text-sm tracking-wide ${!backupTargetDir || isBusy ? "text-emerald-700" : "text-[#030712]"}`}>
              START BACKUP
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── RESTORE UI ─── */}
        <View className="mb-6 p-5 rounded-3xl bg-[#0f172a] border border-[#1e293b] shadow-lg">
          <Text className="text-white text-lg font-black mb-4">🔄 Restore to App</Text>
          
          <TouchableOpacity 
            onPress={handleSelectRestoreLocation} disabled={isBusy}
            className="w-full bg-[#030712] py-4 px-4 rounded-xl mb-4 border border-[#334155]"
          >
             <Text className="text-gray-500 text-[10px] uppercase font-bold mb-1">Source Path:</Text>
            <Text className="text-gray-200 font-semibold text-xs" numberOfLines={2}>
              {restoreSourceDir ? formatPath(restoreSourceDir.uri) : "Tap to locate backup folder..."}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleStartRestore} disabled={isBusy || !restoreSourceDir}
            className={`w-full py-4 rounded-xl items-center shadow-lg ${!restoreSourceDir || isBusy ? "bg-blue-900/20" : "bg-[#60a5fa]"}`}
          >
            <Text className={`font-black text-sm tracking-wide ${!restoreSourceDir || isBusy ? "text-blue-800" : "text-[#030712]"}`}>
              START RESTORE
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── PROGRESS BAR ─── */}
        {status !== "idle" && (
          <View className="mb-6 bg-[#0f172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-white text-[10px] font-bold uppercase tracking-widest text-[#38D926]">
                {status.replace("_", " ")}
              </Text>
              {isBusy && (
                <TouchableOpacity onPress={() => { cancelRef.current = true; }} className="bg-red-500/20 px-3 py-1 rounded-full">
                  <Text className="text-red-500 text-[10px] font-black tracking-wider">CANCEL</Text>
                </TouchableOpacity>
              )}
            </View>
            <ProgressBar current={progress.current} total={progress.total} />
            <Text className="text-gray-400 text-xs mt-3 font-semibold" numberOfLines={1}>{progress.message}</Text>
          </View>
        )}

        {/* ─── FIXED HEIGHT LOG CONSOLE ─── */}
        <View className="mb-10">
          <View className="flex-row justify-between items-center mb-3 px-1">
            <Text className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">
              Live Console Output {logs.length === 500 ? "(Max Limit Reached)" : ""}
            </Text>
            {logs.length > 0 && (
              <TouchableOpacity onPress={handleCopyLogs} className={`px-3 py-1.5 rounded-lg border ${copied ? "bg-emerald-950/40 border-emerald-500/30" : "bg-[#0f172a] border-[#1e293b]"}`}>
                <Text className={`text-[10px] font-bold tracking-tight ${copied ? "text-[#38D926]" : "text-gray-400"}`}>{copied ? "✓ Copied!" : "📋 Copy Log"}</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* This container has a fixed height of ~256px (h-64) with internal scrolling */}
          <View className="h-64 bg-[#090e17] rounded-2xl border border-[#1e293b] p-4 shadow-inner">
            <ScrollView 
              ref={scrollViewRef}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              showsVerticalScrollIndicator={true}
            >
              {logs.length === 0 ? (
                <Text className="text-gray-600 text-xs font-mono italic">Waiting for operations...</Text>
              ) : (
                logs.map((logLine, index) => (
                  <Text key={index} className="text-gray-300 text-[11px] font-mono mb-1 leading-5">
                    {logLine}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}