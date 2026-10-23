// SPH adapter; distributed under the repository MIT license.
export function saveAs(blob, name = 'document.pdf') {
  if (!(blob instanceof Blob)) throw new Error('Only local Blob downloads are supported.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.rel = 'noopener';
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 40000);
}
