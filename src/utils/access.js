const SCHOOLWIDE_ROLES = new Set(["admin", "mtssLead", "owner"]);

function rolesFor(profile) {
  return Array.isArray(profile?.roles) ? profile.roles : [];
}

function featuresFor(profile) {
  return profile?.features || {};
}

function isEnabled(profile) {
  return profile?.disabled !== true;
}

export function isSchoolwide(profile) {
  if (!isEnabled(profile)) return false;
  const roles = rolesFor(profile);
  return roles.some(role => SCHOOLWIDE_ROLES.has(role)) || featuresFor(profile).admin === true;
}

export function canUseAcademic(profile) {
  if (!isEnabled(profile)) return false;
  const roles = rolesFor(profile);
  const features = featuresFor(profile);
  return isSchoolwide(profile) || roles.includes("academic") || features.academic === true;
}

export function canUseBehavior(profile) {
  if (!isEnabled(profile)) return false;
  const roles = rolesFor(profile);
  const features = featuresFor(profile);
  return isSchoolwide(profile) || roles.includes("behavior") || features.behavior === true;
}

export function canUseLegacyTools(profile) {
  if (!isEnabled(profile)) return false;
  const roles = rolesFor(profile);
  return roles.includes("owner");
}

export function canUseCommandCenter(profile) {
  return canUseLegacyTools(profile);
}

export function canUseAdmin(profile) {
  return isSchoolwide(profile);
}

export function canOverrideBehaviorThreshold(profile) {
  if (!isEnabled(profile)) return false;
  const roles = rolesFor(profile);
  return roles.includes("admin") || roles.includes("owner");
}

export function canCancelBehaviorReteach(profile, userId, record) {
  return Boolean(userId) && canUseBehavior(profile) && record?.status === "pending"
    && (canOverrideBehaviorThreshold(profile) || record.assignedByUid === userId);
}

export function getAllowedGradeLevels(profile) {
  if (!Array.isArray(profile?.gradeLevels)) return [];
  return profile.gradeLevels.map(grade => String(grade));
}

export function hasConfiguredAccess(profile) {
  return (
    canUseAcademic(profile) ||
    canUseBehavior(profile) ||
    canUseLegacyTools(profile) ||
    canUseAdmin(profile)
  );
}

export function canViewStudent(profile, student) {
  if (!student || student.archived === true || student.active === false) return false;
  if (isSchoolwide(profile)) return true;
  const allowedGrades = getAllowedGradeLevels(profile);
  if (!allowedGrades.length) return false;
  return allowedGrades.includes(String(student.grade || ""));
}
