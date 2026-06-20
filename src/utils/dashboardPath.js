const dashboardPaths = {
  ADMIN: "/admin/dashboard",
  TEAM_LEAD: "/tl/dashboard",
  TEAM_MEMBER: "/tm/dashboard",
};

export const getDashboardPath = (role) => dashboardPaths[role] || "/";

export default getDashboardPath;
