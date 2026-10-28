import type { RawSheet, WorkbookReader } from "./workbook";

/**
 * The same read in the browser, for demo mode only (it has no server). Loaded
 * on demand so the reader is not part of the page until a workbook is chosen.
 */
export const readWorkbookBrowser: WorkbookReader = async (bytes) => {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  // The library types a date cell as `typeof Date`; it returns Date objects.
  return (await readXlsxFile(
    new Blob([new Uint8Array(bytes)]),
  )) as unknown as RawSheet[];
};
