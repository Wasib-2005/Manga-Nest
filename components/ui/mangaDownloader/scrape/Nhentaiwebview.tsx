/**
 * NhentaiWebView.tsx
 *
 * A persistent hidden WebView that stays mounted in your app.
 * It navigates to nhentai gallery pages (CF challenge passes because
 * it's a real browser engine), waits for the page to fully load,
 * injects JS to extract the gallery JSON, and postMessages it back
 * to nhentai.ts via _onNhentaiMessage().
 *
 * Usage — mount this ONCE near the root of your screen, e.g.:
 *
 *   // In DownloadScreen.tsx or App.tsx
 *   import { NhentaiWebView } from "@/components/NhentaiWebView";
 *   ...
 *   return (
 *     <>
 *       <NhentaiWebView />
 *       ... rest of your screen ...
 *     </>
 *   );
 */

import React, { useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigationEvent } from "react-native-webview";
import {
  _onNhentaiMessage,
  _registerNhentaiWebView,
  EXTRACT_SCRIPT,
} from "@/services/downloader/scrape/nhentai";

export const NhentaiWebView = () => {
  const ref = useRef<WebView>(null);

  // Register this WebView with the scraper module so scrapeNhentai()
  // can navigate it and receive data back.
  useEffect(() => {
    _registerNhentaiWebView(ref);
    return () => _registerNhentaiWebView(null);
  }, []);

  const handleMessage = (e: WebViewMessageEvent) => {
    _onNhentaiMessage(e.nativeEvent.data);
  };

  // When the gallery page finishes loading, inject the extraction script.
  // We check the URL so we only extract on actual gallery pages, not on
  // the CF challenge page (which has a different URL structure).
  const handleLoad = (e: WebViewNavigationEvent) => {
    const url = e.nativeEvent.url;
    const isGalleryPage = /nhentai\.net\/g\/\d+/i.test(url);
    if (isGalleryPage) {
      console.log("[NhentaiWebView] gallery page loaded, injecting extractor…");
      ref.current?.injectJavaScript(EXTRACT_SCRIPT);
    } else {
      console.log("[NhentaiWebView] non-gallery URL loaded:", url);
    }
  };

  return (
    <View style={s.hidden} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ uri: "https://nhentai.net" }} // warm up CF clearance on mount
        onMessage={handleMessage}
        onLoad={handleLoad}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        userAgent={
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36"
        }
        onError={(e) =>
          console.log("[NhentaiWebView] error:", e.nativeEvent.description)
        }
      />
    </View>
  );
};

const s = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});