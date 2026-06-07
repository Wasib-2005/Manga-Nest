import React, { useState, ReactNode, useEffect } from "react";
import { CheckUpdateContext } from "./checkUpdateContext";

interface ProviderProps {
  children: ReactNode;
}

const currentVersionEnv = process.env.EXPO_PUBLIC_APP_VERSION || "0.0.1";

// Helper function to safely compare Semantic Versions (e.g., "1.0.4" vs "1.0.3")
// Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if they are equal
const compareVersions = (v1: string, v2: string) => {
  const parts1 = v1.replace(/^v/, "").split(".").map(Number);
  const parts2 = v2.replace(/^v/, "").split(".").map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const num1 = parts1[i] || 0; // default to 0 if undefined (e.g., "1.0" vs "1.0.1")
    const num2 = parts2[i] || 0;
    
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
};

export const CheckUpdateProvider = ({ children }: ProviderProps) => {
  const [isChecking, setIsChecking] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string>("0.0.1");
  const [error, setError] = useState<string | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setError(null);

    try {
      // Fetch the latest release metadata from GitHub's public API
      const response = await fetch(
        "https://api.github.com/repos/Wasib-2005/Manga-Nest/releases/latest"
      );

      if (!response.ok) {
        throw new Error(`GitHub API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (data && data.tag_name) {
        // Clean up 'v' prefixes
        const cleanedLatest = data.tag_name.replace(/^v/, "");
        const cleanedCurrent = currentVersionEnv.replace(/^v/, "");

        setLatestVersion(cleanedLatest);

        // Use our custom compare function instead of localeCompare
        const isNewer = compareVersions(cleanedLatest, cleanedCurrent) > 0;

        setIsUpdateAvailable(isNewer);
      } else {
        throw new Error("No release tags found.");
      }
    } catch (err) {
      console.error("Update Check Error:", err);
      setError("Failed to check for updates.");
    } finally {
      setIsChecking(false);
    }
  };

  console.log(
    "CheckUpdateProvider Rendered - Current:",
    currentVersionEnv,
    "Latest:",
    latestVersion,
    "Update Available:",
    isUpdateAvailable
  );

  useEffect(() => {
    checkForUpdates();
  }, []);

  return (
    <CheckUpdateContext.Provider
      value={{
        isChecking,
        latestVersion,
        error,
        currentVersion: currentVersionEnv,
        checkForUpdates,
        isUpdateAvailable,
      }}
    >
      {children}
    </CheckUpdateContext.Provider>
  );
};