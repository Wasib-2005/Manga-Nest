import { createContext } from "react";

// Define the shape of our context state
interface CheckUpdateContextType {
  isChecking: boolean;
  latestVersion: string;
  currentVersion: string;
  error: string | null;
  checkForUpdates: () => Promise<void>; // Function to trigger update check
  isUpdateAvailable: boolean | true;
}

// Initialize with a proper default object
export const CheckUpdateContext = createContext<CheckUpdateContextType>({
  isChecking: false,
  latestVersion: process.env.EXPO_PUBLIC_APP_VERSION || "0.0.1",
  currentVersion: process.env.EXPO_PUBLIC_APP_VERSION || "0.0.1",
  error: null,
  checkForUpdates: async () => {},
  isUpdateAvailable: true,
});
