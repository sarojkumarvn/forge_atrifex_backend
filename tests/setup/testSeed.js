import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma, { resetDatabase } from "./testDb.js";
import { encryptGithubToken } from "../../src/utils/githubClient.js";

const password = "Password@123";
const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

const tokenFor = (user) =>
  jwt.sign(
    {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );

export const authHeader = (token) => ({
  Authorization: `Bearer ${token}`,
});

export const seedTestData = async () => {
  await resetDatabase();

  const passwordHash = await bcrypt.hash(password, 12);

  const orgA = await prisma.organization.create({
    data: { name: "Org A" },
  });
  const orgB = await prisma.organization.create({
    data: { name: "Org B" },
  });

  const admin = await prisma.user.create({
    data: {
      fullName: "Admin A",
      email: "admin.a@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgA.id,
    },
  });
  const lead = await prisma.user.create({
    data: {
      fullName: "Lead A",
      email: "lead.a@example.com",
      passwordHash,
      role: "TEAM_LEAD",
      organizationId: orgA.id,
    },
  });
  const member = await prisma.user.create({
    data: {
      fullName: "Member A",
      email: "member.a@example.com",
      passwordHash,
      role: "TEAM_MEMBER",
      organizationId: orgA.id,
      githubAccessToken: encryptGithubToken("github-token-a"),
      githubUsername: "member-a-gh",
    },
  });
  const otherMember = await prisma.user.create({
    data: {
      fullName: "Other Member A",
      email: "other.member.a@example.com",
      passwordHash,
      role: "TEAM_MEMBER",
      organizationId: orgA.id,
    },
  });
  const adminB = await prisma.user.create({
    data: {
      fullName: "Admin B",
      email: "admin.b@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgB.id,
    },
  });
  const leadB = await prisma.user.create({
    data: {
      fullName: "Lead B",
      email: "lead.b@example.com",
      passwordHash,
      role: "TEAM_LEAD",
      organizationId: orgB.id,
    },
  });
  const memberB = await prisma.user.create({
    data: {
      fullName: "Member B",
      email: "member.b@example.com",
      passwordHash,
      role: "TEAM_MEMBER",
      organizationId: orgB.id,
    },
  });

  const team = await prisma.team.create({
    data: {
      name: "Team A",
      description: "Primary test team",
      leadId: lead.id,
      organizationId: orgA.id,
    },
  });
  const teamB = await prisma.team.create({
    data: {
      name: "Team B",
      description: "Second org team",
      leadId: leadB.id,
      organizationId: orgB.id,
    },
  });

  await prisma.teamMembership.createMany({
    data: [
      { teamId: team.id, userId: member.id },
      { teamId: team.id, userId: otherMember.id },
      { teamId: teamB.id, userId: memberB.id },
    ],
  });

  const project = await prisma.project.create({
    data: {
      title: "Project A",
      description: "Primary test project",
      repositoryUrl: "https://github.com/test/project-a",
      status: "IN_PROGRESS",
      progress: 25,
      healthScore: 80,
      organizationId: orgA.id,
      assignedTeamId: team.id,
      createdById: admin.id,
    },
  });
  const projectB = await prisma.project.create({
    data: {
      title: "Project B",
      description: "Second org project",
      status: "IN_PROGRESS",
      progress: 0,
      healthScore: 70,
      organizationId: orgB.id,
      assignedTeamId: teamB.id,
      createdById: adminB.id,
    },
  });

  const task = await prisma.task.create({
    data: {
      title: "Task A",
      description: "Assigned to member A",
      status: "IN_PROGRESS",
      priority: "HIGH",
      progress: 50,
      deadline: pastDate,
      projectId: project.id,
      assignedToId: member.id,
      assignedById: lead.id,
    },
  });
  const otherTask = await prisma.task.create({
    data: {
      title: "Other Task A",
      status: "BLOCKED",
      priority: "MEDIUM",
      progress: 0,
      deadline: futureDate,
      projectId: project.id,
      assignedToId: otherMember.id,
      assignedById: lead.id,
    },
  });
  const taskB = await prisma.task.create({
    data: {
      title: "Task B",
      status: "TODO",
      priority: "LOW",
      progress: 0,
      projectId: projectB.id,
      assignedToId: memberB.id,
      assignedById: leadB.id,
    },
  });

  const notification = await prisma.notification.create({
    data: {
      title: "Own notification",
      message: "For member A",
      recipientId: member.id,
    },
  });
  const otherNotification = await prisma.notification.create({
    data: {
      title: "Other notification",
      message: "For other member",
      recipientId: otherMember.id,
    },
  });

  const activity = await prisma.activityLog.create({
    data: {
      actorId: lead.id,
      organizationId: orgA.id,
      action: "TASK_UPDATED",
      entityType: "TASK",
      entityId: task.id,
      metadata: { taskId: task.id, projectId: project.id },
    },
  });
  const activityB = await prisma.activityLog.create({
    data: {
      actorId: leadB.id,
      organizationId: orgB.id,
      action: "TASK_UPDATED",
      entityType: "TASK",
      entityId: taskB.id,
      metadata: { taskId: taskB.id, projectId: projectB.id },
    },
  });

  const users = { admin, lead, member, otherMember, adminB, leadB, memberB };

  return {
    password,
    orgA,
    orgB,
    users,
    tokens: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, tokenFor(user)])),
    team,
    teamB,
    project,
    projectB,
    task,
    otherTask,
    taskB,
    notification,
    otherNotification,
    activity,
    activityB,
  };
};
