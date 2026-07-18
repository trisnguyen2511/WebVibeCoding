import type { RoleDef } from './types'

/** Hiển thị & giới hạn cho các nhóm vai gộp (VD 2 bình Phù thủy = 1 nhân vật). */
export const ROLE_BUNDLES: Record<string, { name: string; icon: string; maxCount?: number }> = {
  witch: { name: 'Phù thủy', icon: '🧪', maxCount: 1 },
}

export interface RoleGroup {
  key: string
  name: string
  icon: string
  maxCount?: number
  roleIds: string[]
  roles: RoleDef[]
}

/** Gộp các vai cùng bundleId thành 1 nhóm hiển thị/đếm số lượng chung (VD 2 bình Phù thủy = 1 người). */
export function groupRoles(roles: RoleDef[]): RoleGroup[] {
  const seen = new Set<string>()
  const groups: RoleGroup[] = []
  for (const role of roles) {
    const key = role.bundleId ?? role.id
    if (seen.has(key)) continue
    seen.add(key)
    if (role.bundleId) {
      const members = roles.filter((r) => r.bundleId === role.bundleId)
      const meta = ROLE_BUNDLES[role.bundleId]
      groups.push({
        key,
        name: meta?.name ?? members[0].name,
        icon: meta?.icon ?? members[0].icon,
        maxCount: meta?.maxCount,
        roleIds: members.map((r) => r.id),
        roles: members,
      })
    } else {
      groups.push({ key, name: role.name, icon: role.icon, roleIds: [role.id], roles: [role] })
    }
  }
  return groups
}

/** Tổng số lượng vai đã chọn — mỗi nhóm gộp chỉ tính 1 lần (không nhân đôi theo số vai con). */
export function totalRoleSlots(counts: Record<string, number>, roles: RoleDef[]): number {
  return groupRoles(roles).reduce((sum, g) => sum + (counts[g.roleIds[0]] ?? 0), 0)
}
