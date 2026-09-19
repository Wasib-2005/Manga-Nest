import { createContext } from "react";
import { APP_VERSION } from "@/constants/app-version";

// Define the shape of our context state
interface CheckUpdateContextType {
  isChecking: boolean;
  latestVersion: string;
  currentVersion: string;
  error: string | null;
  checkForUpdates: () => Promise<void>; // Function to trigger update check
  isUpdateAvailable: boolean;
  status?: string;
}

// Initialize with a proper default object
export const CheckUpdateContext = createContext<CheckUpdateContextType>({
  isChecking: false,
  latestVersion: APP_VERSION,
  currentVersion: APP_VERSION,
  error: null,
  checkForUpdates: async () => {},
  isUpdateAvailable: false,
  status: ""
});
