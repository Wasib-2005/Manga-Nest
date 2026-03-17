import { Directory, File, Paths } from "expo-file-system";

/**
 * Deletes a specific chapter folder. 
 */
export const deleteChapterFiles = async (uid: string, ep: string): Promise<boolean> => {
  try {
    const root = new Directory(Paths.document, "manga");
    const titleDir = new Directory(root, uid);
    const chapterDir = new Directory(titleDir, ep);

    if (chapterDir.exists) {
      chapterDir.delete();
    }

    // Check if any chapters remain
    const remainingFolders = titleDir.list().filter(item => item instanceof Directory);

    if (remainingFolders.length === 0) {
      await deleteFullManga(uid);
      return true; // Full manga gone
    }
    return false;
  } catch (error) {
    console.error("Error deleting chapter:", error);
    throw error;
  }
};

/**
 * Deletes the entire manga folder and cleans index.json
 */
export const deleteFullManga = async (uid: string) => {
  try {
    const root = new Directory(Paths.document, "manga");
    const titleDir = new Directory(root, uid);
    const indexFile = new File(`${root.uri}/index.json`);

    // Update index.json
    if (indexFile.exists) {
      const entries = JSON.parse(await indexFile.text());
      const updated = entries.filter((e: any) => e.uid !== uid);
      await indexFile.write(JSON.stringify(updated, null, 2));
    }

    if (titleDir.exists) {
      titleDir.delete();
    }
  } catch (error) {
    console.error("Error deleting full manga:", error);
    throw error;
  }
};