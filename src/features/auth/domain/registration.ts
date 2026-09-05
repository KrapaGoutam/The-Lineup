export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
}

export function isValidContact(contact: string): boolean {
  const trimmed = contact.trim();
  return trimmed.length >= 3 && trimmed.length <= 200;
}
