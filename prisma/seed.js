import bcrypt from "bcrypt";
import prisma from "../src/config/prisma.js";

const seed = async () => {
  const existingOrganization = await prisma.organization.findFirst({
    where: { name: "AtriFex Forge Demo Org" },
  });

  const organization =
    existingOrganization ||
    (await prisma.organization.create({
      data: {
      name: "AtriFex Forge Demo Org",
      },
    }));

  const passwordHashes = {
    admin: await bcrypt.hash("Admin@123", 12),
    lead: await bcrypt.hash("Lead@123", 12),
    member: await bcrypt.hash("Member@123", 12),
  };

  const admin = await prisma.user.upsert({
    where: { email: "admin@atrifex.com" },
    update: {
      passwordHash: passwordHashes.admin,
      role: "ADMIN",
      organizationId: organization.id,
      isActive: true,
    },
    create: {
      fullName: "Demo Admin",
      email: "admin@atrifex.com",
      passwordHash: passwordHashes.admin,
      role: "ADMIN",
      organizationId: organization.id,
    },
  });

  const lead = await prisma.user.upsert({
    where: { email: "lead@atrifex.com" },
    update: {
      passwordHash: passwordHashes.lead,
      role: "TEAM_LEAD",
      organizationId: organization.id,
      isActive: true,
    },
    create: {
      fullName: "Demo Team Lead",
      email: "lead@atrifex.com",
      passwordHash: passwordHashes.lead,
      role: "TEAM_LEAD",
      organizationId: organization.id,
    },
  });

  const memberOne = await prisma.user.upsert({
    where: { email: "member1@atrifex.com" },
    update: {
      passwordHash: passwordHashes.member,
      role: "TEAM_MEMBER",
      organizationId: organization.id,
      isActive: true,
    },
    create: {
      fullName: "Demo Member One",
      email: "member1@atrifex.com",
      passwordHash: passwordHashes.member,
      role: "TEAM_MEMBER",
      organizationId: organization.id,
    },
  });

  const memberTwo = await prisma.user.upsert({
    where: { email: "member2@atrifex.com" },
    update: {
      passwordHash: passwordHashes.member,
      role: "TEAM_MEMBER",
      organizationId: organization.id,
      isActive: true,
    },
    create: {
      fullName: "Demo Member Two",
      email: "member2@atrifex.com",
      passwordHash: passwordHashes.member,
      role: "TEAM_MEMBER",
      organizationId: organization.id,
    },
  });

  const team = await prisma.team.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Alpha Engineering Team",
      },
    },
    update: {
      leadId: lead.id,
      description: "Demo engineering team for Forge AtriFex workflow testing.",
    },
    create: {
      name: "Alpha Engineering Team",
      description: "Demo engineering team for Forge AtriFex workflow testing.",
      leadId: lead.id,
      organizationId: organization.id,
    },
  });

  await prisma.teamMembership.upsert({
    where: {
      userId_teamId: {
        userId: lead.id,
        teamId: team.id,
      },
    },
    update: {},
    create: {
      userId: lead.id,
      teamId: team.id,
    },
  });

  await prisma.teamMembership.upsert({
    where: {
      userId_teamId: {
        userId: memberOne.id,
        teamId: team.id,
      },
    },
    update: {},
    create: {
      userId: memberOne.id,
      teamId: team.id,
    },
  });

  await prisma.teamMembership.upsert({
    where: {
      userId_teamId: {
        userId: memberTwo.id,
        teamId: team.id,
      },
    },
    update: {},
    create: {
      userId: memberTwo.id,
      teamId: team.id,
    },
  });

  const existingProject = await prisma.project.findFirst({
    where: {
      title: "AI Project Management Dashboard",
      organizationId: organization.id,
    },
  });

  const project = existingProject
    ? await prisma.project.update({
        where: { id: existingProject.id },
        data: {
          description: "Demo project for testing the Forge AtriFex workflow.",
          repositoryUrl: "https://github.com/demo/forge-atrifex",
          status: "IN_PROGRESS",
          progress: 25,
          healthScore: 80,
          assignedTeamId: team.id,
          createdById: admin.id,
        },
      })
    : await prisma.project.create({
        data: {
          title: "AI Project Management Dashboard",
          description: "Demo project for testing the Forge AtriFex workflow.",
          repositoryUrl: "https://github.com/demo/forge-atrifex",
          status: "IN_PROGRESS",
          progress: 25,
          healthScore: 80,
          organizationId: organization.id,
          assignedTeamId: team.id,
          createdById: admin.id,
        },
      });

  await prisma.task.deleteMany({
    where: {
      projectId: project.id,
      title: {
        in: [
          "Build authentication UI integration",
          "Create project dashboard cards",
          "Connect task status update flow",
        ],
      },
    },
  });

  const taskOne = await prisma.task.create({
    data: {
        title: "Build authentication UI integration",
        status: "IN_PROGRESS",
        priority: "HIGH",
        progress: 40,
        projectId: project.id,
        assignedToId: memberOne.id,
        assignedById: lead.id,
      },
  });

  await prisma.task.createMany({
    data: [
      {
        title: "Create project dashboard cards",
        status: "TODO",
        priority: "MEDIUM",
        progress: 0,
        projectId: project.id,
        assignedToId: memberTwo.id,
        assignedById: lead.id,
      },
      {
        title: "Connect task status update flow",
        status: "TODO",
        priority: "HIGH",
        progress: 0,
        projectId: project.id,
        assignedToId: memberOne.id,
        assignedById: lead.id,
      },
    ],
  });

  await prisma.notification.deleteMany({
    where: {
      recipientId: {
        in: [memberOne.id, memberTwo.id],
      },
      title: {
        in: ["New task assigned", "Project update"],
      },
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        title: "New task assigned",
        message: "You have been assigned to build authentication UI integration.",
        recipientId: memberOne.id,
      },
      {
        title: "Project update",
        message: "Alpha Engineering Team has been assigned a demo project.",
        recipientId: memberOne.id,
      },
      {
        title: "New task assigned",
        message: "You have been assigned to create project dashboard cards.",
        recipientId: memberTwo.id,
      },
      {
        title: "Project update",
        message: "Alpha Engineering Team has been assigned a demo project.",
        recipientId: memberTwo.id,
      },
    ],
  });

  await prisma.activityLog.deleteMany({
    where: {
      organizationId: organization.id,
      action: {
        in: ["PROJECT_CREATED", "PROJECT_ASSIGNED", "TASK_ASSIGNED"],
      },
    },
  });

  await prisma.activityLog.createMany({
    data: [
      {
        actorId: admin.id,
        organizationId: organization.id,
        action: "PROJECT_CREATED",
        entityType: "PROJECT",
        entityId: project.id,
        metadata: {
          message: "Admin created project",
          projectTitle: project.title,
        },
      },
      {
        actorId: admin.id,
        organizationId: organization.id,
        action: "PROJECT_ASSIGNED",
        entityType: "PROJECT",
        entityId: project.id,
        metadata: {
          message: "Admin assigned project to Alpha Engineering Team",
          teamName: team.name,
        },
      },
      {
        actorId: lead.id,
        organizationId: organization.id,
        action: "TASK_ASSIGNED",
        entityType: "TASK",
        entityId: taskOne.id,
        metadata: {
          message: "Team Lead assigned task to member",
          assignees: [memberOne.fullName, memberTwo.fullName],
        },
      },
    ],
  });

  console.log("Seed data inserted successfully.");
  console.log("Admin: admin@atrifex.com / Admin@123");
  console.log("Team Lead: lead@atrifex.com / Lead@123");
  console.log("Team Member: member1@atrifex.com / Member@123");
};

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
