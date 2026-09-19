import Constants from "expo-constants";

/**
 * The version embedded in the installed Expo app configuration.
 * Use this for all runtime version displays and update comparisons.
 */
export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export const APP_RELEASE_TAG = `v${APP_VERSION}`;
