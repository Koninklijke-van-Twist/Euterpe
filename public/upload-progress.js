export function overallUploadProgress(
  uploadedBytes,
  totalBytes,
  fileBytes,
  fileFraction,
  fileIndex = 0,
  fileCount = 1
) {
  if (totalBytes > 0) {
    return Math.min(1, (uploadedBytes + fileBytes * fileFraction) / totalBytes);
  }
  if (fileCount <= 0) return 0;
  return Math.min(1, (fileIndex + fileFraction) / fileCount);
}
