export function canAccessAdminDash(role: string): boolean {
  return role === 'admin';
}
