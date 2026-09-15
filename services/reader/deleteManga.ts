import { Directory, Paths } from "expo-file-system";
import { deleteChapter, deleteManga } from "./database";

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

    const remainingFolders = titleDir.exists
      ? titleDir.list().filter((item) => item instanceof Directory)
      : [];

    if (remainingFolders.length === 0) {
      await deleteManga(uid);
      if (titleDir.exists) {
        titleDir.delete();
      }
      return true; // Full manga gone
    }
    await deleteChapter(uid, ep);
    return false;
  } catch (error) {
    console.error("Error deleting chapter:", error);
    throw error;
  }
};

/**
 * Deletes the entire manga folder and its relational database row.
 */
export const deleteFullManga = async (uid: string) => {
  try {
    const root = new Directory(Paths.document, "manga");
    const titleDir = new Directory(root, uid);
    if (titleDir.exists) {
      titleDir.delete();
    }
    await deleteManga(uid);
  } catch (error) {
    console.error("Error deleting full manga:", error);
    throw error;
  }
};