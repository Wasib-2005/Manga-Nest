// app/(tabs)/checkUpdate.tsx
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
} from "react-native";

const GITHUB_API =
  "https://api.github.com/repos/Wasib-2005/Manga-Nest/releases/latest";
const RELEASES_PAGE = "https://github.com/Wasib-2005/Manga-Nest/releases";

// ── Bump this to the current in-app version ──────────────────────────────────
const CURRENT_VERSION = process.env.EXPO_PUBLIC_APP_VERSION || "0.0.1";

type CheckStatus = "idle" | "checking" | "up_to_date" | "update_available" | "error";

interface ReleaseInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  url: string;
}

export default function CheckUpdate() {
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // ─── STATUS META ────────────────────────────────────────────────────────────
  const statusMeta = {
    idle:             { label: "READY",     color: "#334155", dot: "#475569" },
    checking:         { label: "CHECKING",  color: "#f59e0b", dot: "#f59e0b" },
    up_to_date:       { label: "UP TO DATE",color: "#38D926", dot: "#38D926" },
    update_available: { label: "NEW UPDATE",color: "#60a5fa", dot: "#60a5fa" },
    error:            { label: "FAILED",    color: "#ef4444", dot: "#ef4444" },
  }[status];

  // ─── FETCH LATEST RELEASE ───────────────────────────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    setStatus("checking");
    setRelease(null);
    setErrorMsg("");

    try {
      const res = await fetch(GITHUB_API, {
        headers: { Accept: "application/vnd.github+json" },
      });

      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

      const data = await res.json();

      console.log("GitHub API Response:", data);

      const info: ReleaseInfo = {
        version:     data.tag_name,
        name:        data.name || data.tag_name,
        body:        data.body || "No release notes provided.",
        publishedAt: data.published_at,
        url:         data.html_url,
      };

      setRelease(info);

      // Simple semver-like comparison: strip "v" then compare strings
      const isNewer =
        info.version.replace(/^v/, "").localeCompare(
          CURRENT_VERSION.replace(/^v/, ""),
          undefined,
          { numeric: true, sensitivity: "base" }
        ) > 0;

      setStatus(isNewer ? "update_available" : "up_to_date");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Unknown error");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    handleCheckUpdate();
  },[handleCheckUpdate])

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const isBusy = status === "checking";

  return (
    <View style={{ flex: 1, backgroundColor: "#050a14" }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO HEADER ──────────────────────────────────────────────────── */}
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
                {"\t\tApp Update"}
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
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 28, gap: 16 }}>

          {/* ── CURRENT VERSION CARD ───────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "#0f2a18",
              backgroundColor: "#060f0a",
              overflow: "hidden",
            }}
          >
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
                <Text style={{ fontSize: 16 }}>📱</Text>
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
                  Installed Version
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
                  Currently running
                </Text>
              </View>
            </View>

            <View
              style={{
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: "600", color: "#3a5a42", letterSpacing: 2, textTransform: "uppercase" }}
              >
                Version
              </Text>
              <View
                style={{
                  backgroundColor: "#040d07",
                  borderWidth: 1,
                  borderColor: "#1a4a24",
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{ fontSize: 14, fontWeight: "800", color: "#86efac", letterSpacing: 1 }}
                >
                  {CURRENT_VERSION}
                </Text>
              </View>
            </View>
          </View>

          {/* ── CHECK BUTTON CARD ──────────────────────────────────────────── */}
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "#0f1f35",
              backgroundColor: "#06090f",
              overflow: "hidden",
            }}
          >
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
                <Text style={{ fontSize: 16 }}>🔍</Text>
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
                  Check for Updates
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
                  Fetch from GitHub
                </Text>
              </View>
            </View>

            <View style={{ padding: 18 }}>
              <TouchableOpacity
                onPress={handleCheckUpdate}
                disabled={isBusy}
                style={{
                  backgroundColor: isBusy ? "#070c16" : "#3b82f6",
                  borderWidth: 1,
                  borderColor: isBusy ? "#0f1f35" : "#3b82f6",
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
                    color: isBusy ? "#1e3a5f" : "#ffffff",
                  }}
                >
                  {isBusy ? "Checking..." : "Check Now"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── RESULT PANEL ───────────────────────────────────────────────── */}
          {status !== "idle" && status !== "checking" && (
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor:
                  status === "error"
                    ? "#3b0a0a"
                    : status === "update_available"
                    ? "#0f1f35"
                    : "#0f2a18",
                backgroundColor:
                  status === "error"
                    ? "#0a0404"
                    : status === "update_available"
                    ? "#06090f"
                    : "#060f0a",
                overflow: "hidden",
              }}
            >
              {/* Result header */}
              <View
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor:
                    status === "error"
                      ? "#3b0a0a"
                      : status === "update_available"
                      ? "#0c1628"
                      : "#0c2214",
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor:
                      status === "error"
                        ? "#7f1d1d"
                        : status === "update_available"
                        ? "#1d4ed8"
                        : "#15803d",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 18 }}>
                    {status === "error"
                      ? "❌"
                      : status === "update_available"
                      ? "🆕"
                      : "✅"}
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#f1f5f9",
                    }}
                  >
                    {status === "error"
                      ? "Check Failed"
                      : status === "update_available"
                      ? "Update Available"
                      : "You're Up to Date"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: statusMeta.color,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginTop: 1,
                    }}
                  >
                    {status === "error"
                      ? "Something went wrong"
                      : status === "update_available"
                      ? "New version released"
                      : "Latest version installed"}
                  </Text>
                </View>
              </View>

              <View style={{ padding: 18, gap: 12 }}>
                {/* Error message */}
                {status === "error" && (
                  <View
                    style={{
                      backgroundColor: "#0a0404",
                      borderWidth: 1,
                      borderColor: "#3b0a0a",
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#f87171",
                        lineHeight: 18,
                      }}
                    >
                      {errorMsg}
                    </Text>
                  </View>
                )}

                {/* Release info */}
                {release && (
                  <>
                    {/* Version row */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "#040710",
                        borderWidth: 1,
                        borderColor:
                          status === "update_available" ? "#1a3060" : "#0c2214",
                        borderRadius: 12,
                        padding: 14,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: "#475569",
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                        }}
                      >
                        Latest
                      </Text>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color:
                              status === "update_available"
                                ? "#93c5fd"
                                : "#86efac",
                          }}
                        >
                          {release.version}
                        </Text>
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "600",
                            color: "#334155",
                            letterSpacing: 1,
                          }}
                        >
                          {formatDate(release.publishedAt)}
                        </Text>
                      </View>
                    </View>

                    {/* Release notes */}
                    {release.body.trim().length > 0 && (
                      <View
                        style={{
                          backgroundColor: "#040710",
                          borderWidth: 1,
                          borderColor: "#0c1528",
                          borderRadius: 12,
                          padding: 14,
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "800",
                            color: "#1e3a5f",
                            letterSpacing: 2,
                            textTransform: "uppercase",
                            marginBottom: 2,
                          }}
                        >
                          Release Notes
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "500",
                            color: "#64748b",
                            lineHeight: 18,
                          }}
                        >
                          {release.body.trim()}
                        </Text>
                      </View>
                    )}

                    {/* Download / View button */}
                    {status === "update_available" && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(release.url)}
                        style={{
                          backgroundColor: "#3b82f6",
                          borderWidth: 1,
                          borderColor: "#3b82f6",
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
                            color: "#ffffff",
                          }}
                        >
                          Download Update
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* View all releases link */}
                <TouchableOpacity
                  onPress={() => Linking.openURL(RELEASES_PAGE)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: "#334155",
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                    }}
                  >
                    View all releases on GitHub
                  </Text>
                  <Text style={{ fontSize: 10, color: "#334155" }}>↗</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── IDLE HINT ──────────────────────────────────────────────────── */}
          {status === "idle" && (
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "#0d1117",
                backgroundColor: "#030712",
                padding: 24,
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 36 }}>🛰️</Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#1e3a5f",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                {`Tap "Check Now" to ping{"\n"}the GitHub release server`}
              </Text>
            </View>
          )}

          {/* ── CHECKING HINT ──────────────────────────────────────────────── */}
          {status === "checking" && (
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "#2a1e00",
                backgroundColor: "#0a0800",
                padding: 24,
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 36 }}>📡</Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#78350f",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                Contacting GitHub servers...
              </Text>
            </View>
          )}

        </View>
      </ScrollView>
    </View>
  );
}