import * as MediaLibrary from "expo-media-library";

export async function requestSdcardPermission() {
  const { status } = await MediaLibrary.requestPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Storage permission denied");
  }

  console.log("✅ Storage permission granted");
}