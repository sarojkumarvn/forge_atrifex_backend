export const safeUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  organizationId: true,
  githubUsername: true,
  avatar: true,
  location: true,
  phone: true,
  isActive: true,
  status: true,
  tokenVersion: true,
  createdAt: true,
  updatedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
    },
  },
};

export const formatSafeUser = (user) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId,
  githubUsername: user.githubUsername,
  avatarUrl: user.avatar,
  location: user.location,
  phone: user.phone,
  isActive: user.isActive,
  status: user.status,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  ...(user.organization ? { organization: user.organization } : {}),
});
