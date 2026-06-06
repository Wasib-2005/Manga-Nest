/**
 * PdfExtractor.tsx
 *
 * A hidden WebView that loads pdf.js from CDN, receives a base64 PDF,
 * renders every page to canvas and postMessages back:
 *   { type: "page",  page: number, total: number, data: "data:image/jpeg;base64,..." }
 *   { type: "done",  total: number }
 *   { type: "error", message: string }
 *
 * Usage:
 *   <PdfExtractor
 *     pdfBase64={b64string}          // raw base64, no prefix
 *     scale={2}                      // render scale (1 = 72dpi, 2 = 144dpi)
 *     quality={0.88}                 // JPEG quality 0-1
 *     onPage={(pageNum, total, dataUrl) => ...}
 *     onDone={(total) => ...}
 *     onError={(msg) => ...}
 *   />
 */

import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";

interface Props {
  pdfBase64: string;         // raw base64, NO data: prefix
  scale?: number;            // default 2
  quality?: number;          // JPEG quality, default 0.88
  onPage: (page: number, total: number, dataUrl: string) => void;
  onDone: (total: number) => void;
  onError: (msg: string) => void;
}

export const PdfExtractor = ({
  pdfBase64,
  scale = 2,
  quality = 0.88,
  onPage,
  onDone,
  onError,
}: Props) => {
  const ref = useRef<WebView>(null);

  // The HTML runs entirely in the WebView sandbox.
  // pdf.js is loaded from cdnjs (no network restriction for WebView content).
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
<canvas id="c"></canvas>
<script>
(async () => {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const raw = atob(${JSON.stringify(pdfBase64)});
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const total = pdf.numPages;
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const scale = ${scale};
    const quality = ${quality};

    for (let p = 1; p <= total; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale });
      canvas.width  = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'page', page: p, total, data: dataUrl })
      );
    }
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'done', total })
    );
  } catch (e) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'error', message: String(e) })
    );
  }
})();
</script>
</body>
</html>`;

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "page") onPage(msg.page, msg.total, msg.data);
      else if (msg.type === "done") onDone(msg.total);
      else if (msg.type === "error") onError(msg.message);
    } catch {
      onError("Failed to parse extractor message");
    }
  };

  return (
    <View style={s.hidden} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        originWhitelist={["*"]}
        // Allow loading pdf.js from cdnjs
        mixedContentMode="always"
        onError={(e) => onError(e.nativeEvent.description)}
      />
    </View>
  );
};

const s = StyleSheet.create({
  // Tiny off-screen view — WebView must be mounted to run JS
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: "none",
  },
});