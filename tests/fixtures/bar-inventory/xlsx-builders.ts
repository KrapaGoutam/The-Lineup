import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Builders for workbook test files. Hostile files are generated at test time
 * (a zip bomb is a few KB until it is inflated); no hostile binary is ever
 * committed. `valid` workbooks come from the real writer, so the reader and
 * the guard are tested against what the app itself exports.
 */

type Files = Record<string, Uint8Array>;

export const unzip = (bytes: Uint8Array): Files => unzipSync(bytes);

export const zip = (files: Files, level: 0 | 1 | 6 | 9 = 6): Uint8Array =>
  zipSync(files, { level });

/** Rewrites a workbook's files: return a replacement, or null to remove one. */
export function edit(
  bytes: Uint8Array,
  change: (name: string, text: string) => string | null | undefined,
): Uint8Array {
  const files = unzip(bytes);
  const out: Files = {};
  for (const [name, data] of Object.entries(files)) {
    const next = change(name, strFromU8(data));
    if (next === null) continue;
    out[name] = next === undefined ? data : strToU8(next);
  }
  return zip(out);
}

export const withEntry = (
  bytes: Uint8Array,
  name: string,
  data: Uint8Array | string,
): Uint8Array =>
  zip({
    ...unzip(bytes),
    [name]: typeof data === "string" ? strToU8(data) : data,
  });

/** A minimal, well-formed workbook skeleton with the given worksheet payloads. */
export function skeleton(sheetXml: Uint8Array[]): Files {
  const files: Files = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXml
        .map(
          (_, i) =>
            `<sheet name="S${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships>${sheetXml
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("")}</Relationships>`,
    ),
  };
  sheetXml.forEach((xml, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = xml;
  });
  return files;
}

/** `bytes` of zeros: tiny once compressed, large once inflated. */
export const zeros = (bytes: number) => new Uint8Array(bytes);

/**
 * Overwrites the "uncompressed size" in every local file header with 1, the way
 * a hostile sender can: a guard that trusts declared sizes would be fooled.
 */
export function lieAboutSizes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  const view = new DataView(copy.buffer);
  for (let i = 0; i + 30 < copy.length; i += 1) {
    if (view.getUint32(i, true) === 0x04034b50) view.setUint32(i + 22, 1, true);
  }
  return copy;
}
