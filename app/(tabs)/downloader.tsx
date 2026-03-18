import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
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
import {
  DoneCard,
  ErrorCard,
} from "../../components/ui/mangaDownloader/StatusCard";
import type {
  MangaMeta,
  EditedMeta,
  Phase,
  DownloadProgress,
} from "../../services/downloader/types/manga";

const EMPTY_EDITED: EditedMeta = {
  name: "",
  author: "",
  tags: "",
  genres: "",
  ep: "",
};

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<MangaMeta | null>(null);
  const [edited, setEdited] = useState<EditedMeta>(EMPTY_EDITED);
  const [progress, setProgress] = useState<DownloadProgress>({
    message: "",
    current: 0,
    total: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [savedUri, setSavedUri] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const cancelRef = useRef({ cancelled: false });

  const log = (msg: string) => setLogs((p) => [...p, msg]);
  const patch = (key: keyof EditedMeta) => (val: string) =>
    setEdited((p) => ({ ...p, [key]: val }));

  const fullReset = () => {
    setPhase("idle");
    setUrl("");
    setMeta(null);
    setLogs([]);
    setSavedUri("");
    setModalOpen(false);
    cancelRef.current.cancelled = false;
  };

  const handleLookup = async () => {
    if (!url.trim()) return;
    setPhase("looking");
    setLogs([]);
    cancelRef.current.cancelled = false;
    try {
      const m = await lookupManga(url.trim());
      if (cancelRef.current.cancelled) return setPhase("idle");
      setMeta(m);
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
    } catch (e: any) {
      setErrorMsg(e.message || "Lookup failed");
      setPhase("error");
    }
  };

  const handleDownload = async () => {
    if (!meta) return;
    setModalOpen(false);
    setPhase("downloading");
    setLogs([]);
    cancelRef.current.cancelled = false;
    try {
      const uri = await downloadManga(
        meta,
        edited,
        (p) => {
          setProgress(p);
          if (p.message) log(p.message);
        },
        cancelRef.current,
        log,
      );
      setSavedUri(uri);
      setPhase("done");
    } catch (e: any) {
      setErrorMsg(e.message || "Download failed");
      setPhase("error");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      <ScrollView
        className="flex-1 bg-[#030712]"
        contentContainerStyle={{ padding: 20, paddingTop: 60 }}
      >
        <View className="mb-8">
          <Text className="text-3xl font-black text-[#f1f5f9] tracking-tight">
            <Text>Manga </Text>
            <Text className="text-[#38D926]">Nest</Text>
          </Text>
          <Text className="font-normal text-[11px] text-white mt-[-1rem] ml-[10.3rem]">-Downloader</Text>
        </View>

        {/* Form hides when downloading starts */}
        {phase !== "downloading" && (
          <UrlInput
            value={url}
            onChange={setUrl}
            onSubmit={handleLookup}
            loading={phase === "looking"}
            onCancel={() => {
              cancelRef.current.cancelled = true;
              setPhase("idle");
            }}
          />
        )}

        {/* Progress View with STOP Button */}
        {phase === "downloading" && (
          <View className="mt-4 mb-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-[#38D926] text-[10px] font-bold uppercase tracking-widest">
                Active Download
              </Text>
              <TouchableOpacity
                onPress={() => {
                  cancelRef.current.cancelled = true;
                }}
                className="bg-red-500/20 border border-red-500 rounded-lg px-3 py-1"
              >
                <Text className="text-red-500 text-[10px] font-bold">STOP</Text>
              </TouchableOpacity>
            </View>
            <ProgressBar current={progress.current} total={progress.total} />
          </View>
        )}

        {logs.length > 0 && (
          <LogConsole logs={logs} loading={phase === "downloading"} />
        )}
      </ScrollView>

      <MetaModal
        visible={modalOpen}
        meta={meta}
        edited={edited}
        phase={phase}
        onChange={patch}
        onDownload={handleDownload}
        onCancel={() => (cancelRef.current.cancelled = true)}
        onClose={() => setModalOpen(false)}
      />

      <Modal visible={phase === "done"} transparent>
        <View className="flex-1 bg-black/80 justify-center items-center px-4">
          <DoneCard uri={savedUri} onReset={fullReset} />
        </View>
      </Modal>

      <Modal visible={phase === "error"} transparent>
        <View className="flex-1 bg-black/80 justify-center items-center px-4">
          <ErrorCard message={errorMsg} onReset={fullReset} />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
