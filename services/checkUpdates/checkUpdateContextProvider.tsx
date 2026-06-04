import React, { useState, ReactNode, useEffect } from "react";
import { CheckUpdateContext } from "./checkUpdateContext";

interface ProviderProps {
  children: ReactNode;
}

const currentVersionEnv = process.env.EXPO_PUBLIC_APP_VERSION || "0.0.1";

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
        "https://api.github.com/repos/Wasib-2005/Manga-Nest/releases/latest",
      );

      if (!response.ok) {
        throw new Error(`GitHub API responded with status: ${response.status}`);
      }

      const data = await response.json();

      // GitHub returns the release version string in the "tag_name" field (e.g., "v1.2.3" or "1.2.3")
      if (data && data.tag_name) {
        // Optional: Clean up 'v' prefix if your git tags use "v1.0.0" but app uses "1.0.0"
        const cleanedVersion = data.tag_name.startsWith("v")
          ? data.tag_name.slice(1)
          : data.tag_name;
        setLatestVersion(cleanedVersion);
        const isNewer =
          data.tag_name
            .replace(/^v/, "")
            .localeCompare(currentVersionEnv.replace(/^v/, ""), undefined, {
              numeric: true,
              sensitivity: "base",
            }) > 0;
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
    "CheckUpdateProvider Rendered - Current Version:",
    currentVersionEnv,
    "Latest Version:",
    latestVersion,
    "Is Checking:",
    isChecking,
    "Error:",
    error,
    "Is Update Available:",
    isUpdateAvailable,
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
        checkForUpdates, // Pass the function down so components can re-trigger it
        isUpdateAvailable: isUpdateAvailable,
      }}
    >
      {children}
    </CheckUpdateContext.Provider>
  );
};
