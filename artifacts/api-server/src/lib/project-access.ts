export interface ProjectRequestIdentity {
  user?: { uid?: unknown } | null;
  deviceId?: unknown;
}

export function projectOwnerId(identity: ProjectRequestIdentity): string | null {
  const uid = identity.user?.uid;
  if (typeof uid === "string" && uid.trim()) return uid;
  const deviceId = identity.deviceId;
  if (typeof deviceId === "string" && deviceId.trim() && deviceId !== "default") return deviceId;
  return null;
}

export function projectBelongsTo(project: unknown, ownerId: string): boolean {
  return Boolean(
    project && typeof project === "object"
    && (project as { userId?: unknown }).userId === ownerId
  );
}