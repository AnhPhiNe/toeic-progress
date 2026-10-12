export function profileDisplayName(name?: string): string {
  return name?.trim() || 'Học viên';
}

/** Two letters for the avatar: the last two words of a Vietnamese name ("Nguyễn Minh Tuấn" → "MT"). */
export function profileInitials(name?: string): string {
  const displayName = profileDisplayName(name);
  const parts = displayName.split(/\s+/).filter(Boolean);
  return parts.length >= 2
    ? (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
    : displayName.slice(0, 2).toUpperCase();
}
