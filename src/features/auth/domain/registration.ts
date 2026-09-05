export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
}

/** Contact (phone/email) is optional — only the display name and passcode are mandatory. */
export function isValidContact(contact: string): boolean {
  const trimmed = contact.trim();
  if (trimmed.length === 0) return true;
  return trimmed.length >= 3 && trimmed.length <= 200;
}
