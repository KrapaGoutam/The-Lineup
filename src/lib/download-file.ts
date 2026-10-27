/** Hands a generated text file to the browser as a download. */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
