import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// ─── Config ───────────────────────────────────────────────────────────────────

const GITHUB_USER    = "Wasib-2005";
const GITHUB_REPO    = "Manga-Nest";
const RELEASES_URL   = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE  = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases`;

// Bump this every build — format must match GitHub tag e.g. "v1.0.1"
const CURRENT_VERSION = process.env.EXPO_PUBLIC_APP_VERSION || "v0.0.1";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReleaseAsset {
  name:                  string;
  browser_download_url:  string;
  size:                  number;
}

interface Release {
  tag_name:     string;
  name:         string;
  body:         string;
  published_at: string;
  assets:       ReleaseAsset[];
  html_url:     string;
}

type CheckState = "idle" | "checking" | "up-to-date" | "update-available" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1_048_576)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

/** Simple semver-ish comparison — compares v1.2.3 strings numerically. */
function isNewer(remote: string, local: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [ra, rb, rc] = parse(remote);
  const [la, lb, lc] = parse(local);
  if (ra !== la) return ra > la;
  if (rb !== lb) return rb > lb;
  return rc > lc;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CheckUpdate() {
  const [state,   setState]   = useState<CheckState>("idle");
  const [release, setRelease] = useState<Release | null>(null);
  const [error,   setError]   = useState<string>("");

  const checkForUpdate = useCallback(async () => {
    setState("checking");
    setError("");
    setRelease(null);

    try {
      const res = await fetch(RELEASES_URL, {
        headers: {
          "Accept":     "application/vnd.github+json",
          "User-Agent": "MangaNest-App",
        },
      });

      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);

      const data: Release = await res.json();
      setRelease(data);

      if (isNewer(data.tag_name, CURRENT_VERSION)) {
        setState("update-available");
      } else {
        setState("up-to-date");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
      setState("error");
    }
  }, []);

  const openReleasePage = () => {
    const url = release?.html_url ?? RELEASES_PAGE;
    Linking.openURL(url);
  };

  const downloadApk = (asset: ReleaseAsset) => {
    Linking.openURL(asset.browser_download_url);
  };

  // APK assets only
  const apkAssets = release?.assets.filter((a) =>
    a.name.toLowerCase().endsWith(".apk")
  ) ?? [];

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.logo}>
            Manga <Text style={{ color: "#38D926" }}>Nest</Text>
          </Text>
          <Text style={s.headerSub}>· Updates</Text>
        </View>

        {/* ── Version card ── */}
        <View style={s.versionCard}>
          <View style={s.versionRow}>
            <View style={s.versionIconWrap}>
              <MaterialCommunityIcons name="package-variant" size={22} color="#38D926" />
            </View>
            <View>
              <Text style={s.versionLabel}>Installed version</Text>
              <Text style={s.versionValue}>{CURRENT_VERSION}</Text>
            </View>
          </View>

          {release && (
            <View style={[s.versionRow, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#141c2b" }]}>
              <View style={[s.versionIconWrap, { backgroundColor: "#60a5fa18", borderColor: "#60a5fa30" }]}>
                <MaterialCommunityIcons name="tag-outline" size={22} color="#60a5fa" />
              </View>
              <View>
                <Text style={s.versionLabel}>Latest release</Text>
                <Text style={[s.versionValue, { color: "#60a5fa" }]}>{release.tag_name}</Text>
                <Text style={s.versionDate}>{fmtDate(release.published_at)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Status banner ── */}
        {state === "up-to-date" && (
          <View style={[s.banner, s.bannerGreen]}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#38D926" />
            <Text style={[s.bannerText, { color: "#38D926" }]}>
              {"You're on the latest version!"}
            </Text>
          </View>
        )}

        {state === "update-available" && (
          <View style={[s.banner, s.bannerBlue]}>
            <MaterialCommunityIcons name="arrow-up-circle" size={20} color="#60a5fa" />
            <Text style={[s.bannerText, { color: "#60a5fa" }]}>
              Update available — {release?.tag_name}
            </Text>
          </View>
        )}

        {state === "error" && (
          <View style={[s.banner, s.bannerRed]}>
            <MaterialCommunityIcons name="alert-circle" size={20} color="#ef4444" />
            <Text style={[s.bannerText, { color: "#ef4444" }]}>{error}</Text>
          </View>
        )}

        {/* ── Check button ── */}
        <TouchableOpacity
          style={[s.checkBtn, state === "checking" && s.checkBtnBusy]}
          onPress={checkForUpdate}
          disabled={state === "checking"}
          activeOpacity={0.8}
        >
          {state === "checking" ? (
            <>
              <ActivityIndicator color="#030712" size="small" />
              <Text style={s.checkBtnText}>Checking…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={18} color="#030712" />
              <Text style={s.checkBtnText}>
                {state === "idle" ? "Check for Updates" : "Check Again"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Release notes ── */}
        {release?.body && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Release Notes</Text>
            <View style={s.notesBox}>
              <Text style={s.notesText}>{release.body.trim()}</Text>
            </View>
          </View>
        )}

        {/* ── APK downloads ── */}
        {apkAssets.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Download APK</Text>
            {apkAssets.map((asset) => (
              <TouchableOpacity
                key={asset.browser_download_url}
                style={s.assetRow}
                onPress={() => downloadApk(asset)}
                activeOpacity={0.8}
              >
                <View style={s.assetIconWrap}>
                  <MaterialCommunityIcons name="android" size={20} color="#38D926" />
                </View>
                <View style={s.assetInfo}>
                  <Text style={s.assetName} numberOfLines={1}>{asset.name}</Text>
                  <Text style={s.assetSize}>{fmtBytes(asset.size)}</Text>
                </View>
                <MaterialCommunityIcons name="download" size={18} color="#38D926" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── View on GitHub ── */}
        <TouchableOpacity style={s.githubBtn} onPress={openReleasePage} activeOpacity={0.8}>
          <MaterialCommunityIcons name="github" size={18} color="#f1f5f9" />
          <Text style={s.githubBtnText}>View on GitHub</Text>
          <MaterialCommunityIcons name="open-in-new" size={14} color="#475569" />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#030712" },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 60 },

  header: { marginBottom: 28 },
  logo: {
    fontSize: 28,
    fontWeight: "900",
    color: "#f1f5f9",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    fontWeight: "600",
    marginTop: 2,
  },

  // Version card
  versionCard: {
    backgroundColor: "#0a0e17",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#141c2b",
    padding: 16,
    marginBottom: 16,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  versionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#38D92618",
    borderWidth: 1,
    borderColor: "#38D92630",
    justifyContent: "center",
    alignItems: "center",
  },
  versionLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  versionValue: {
    color: "#38D926",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  versionDate: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },

  // Status banners
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  bannerGreen: { backgroundColor: "#38D92610", borderColor: "#38D92630" },
  bannerBlue:  { backgroundColor: "#60a5fa10", borderColor: "#60a5fa30" },
  bannerRed:   { backgroundColor: "#ef444410", borderColor: "#ef444430" },
  bannerText:  { fontSize: 13, fontWeight: "700", flex: 1 },

  // Check button
  checkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#38D926",
    borderRadius: 16,
    paddingVertical: 15,
    marginBottom: 24,
  },
  checkBtnBusy: { opacity: 0.7 },
  checkBtnText: {
    color: "#030712",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 10,
  },

  // Release notes
  notesBox: {
    backgroundColor: "#060b14",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#141c2b",
    padding: 14,
  },
  notesText: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "monospace",
  },

  // APK asset row
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0a0e17",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#141c2b",
    padding: 14,
    marginBottom: 8,
  },
  assetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#38D92618",
    borderWidth: 1,
    borderColor: "#38D92630",
    justifyContent: "center",
    alignItems: "center",
  },
  assetInfo: { flex: 1 },
  assetName: { color: "#f1f5f9", fontSize: 13, fontWeight: "700" },
  assetSize: { color: "#475569", fontSize: 10, fontWeight: "600", marginTop: 2 },

  // GitHub button
  githubBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0a0e17",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingVertical: 14,
  },
  githubBtnText: {
    color: "#f1f5f9",
    fontSize: 13,
    fontWeight: "700",
  },
});