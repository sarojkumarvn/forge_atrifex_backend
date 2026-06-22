import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification } from "../utils/notificationSender.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const taskStatuses = new Set(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"]);
const taskPriorities = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const priorityAliases = {
  CRITICAL: "URGENT",
};

const statusTransitions = {
  TODO: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"],
  IN_REVIEW: ["COMPLETED", "BLOCKED", "CANCELLED"],
  BLOCKED: ["TODO", "IN_PROGRESS", "IN_REVIEW", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  githubUsername: true,
  avatar: true,
  phone: true,
  location: true,
  isActive: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
};

const teamSelect = {
  id: true,
  name: true,
  description: true,
  leadId: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
  lead: {
    select: userSelect,
  },
};

const projectSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  progress: true,
  healthScore: true,
  deadline: true,
  assignedTeamId: true,
  organizationId: true,
  assignedTeam: {
    select: teamSelect,
  },
};

const taskInclude = {
  project: {
    select: projectSelect,
  },
  assignedTo: {
    select: userSelect,
  },
  assignedBy: {
    select: userSelect,
  },
};

const isValidUuid = (id) => typeof id === "string" && uuidRegex.test(id);

const parsePagination = (pageQuery, limitQuery) => {
  const page = Math.max(Number.parseInt(pageQuery, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(limitQuery, 10) || 20, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const normalizeStatus = (status) => {
  if (status === undefined || status === null || status === "") {
    return null;
  }

  const normalizedStatus = String(status).trim().toUpperCase();

  if (!taskStatuses.has(normalizedStatus)) {
    throw new ApiError(400, "Invalid task status");
  }

  return normalizedStatus;
};

const normalizePriority = (priority) => {
  if (priority === undefined || priority === null || priority === "") {
    return null;
  }

  const normalizedPriority = String(priority).trim().toUpperCase();
  const schemaPriority = priorityAliases[normalizedPriority] || normalizedPriority;

  if (!taskPriorities.has(schemaPriority)) {
    throw new ApiError(400, "Invalid task priority");
  }

  return schemaPriority;
};

const parseDeadline = (deadline) => {
  if (deadline === undefined) {
    return undefined;
  }

  if (!deadline) {
    throw new ApiError(400, "deadline is required");
  }

  const parsedDate = new Date(deadline);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "deadline must be a valid date");
  }

  return parsedDate;
};

const normalizeProgress = (progress) => {
  const normalizedProgress = Number(progress);

  if (!Number.isInteger(normalizedProgress) || normalizedProgress < 0 || normalizedProgress > 100) {
    throw new ApiError(400, "progress must be an integer between 0 and 100");
  }

  return normalizedProgress;
};

const validateStatusTransition = (currentStatus, nextStatus, user) => {
  if (!nextStatus || nextStatus === currentStatus) {
    return;
  }

  if (user.role === "ADMIN") {
    return;
  }

  const allowedNextStatuses = statusTransitions[currentStatus] || [];

  if (!allowedNextStatuses.includes(nextStatus)) {
    // Status transitions protect completed and cancelled tasks from accidental reopening.
    throw new ApiError(400, `Cannot change task status from ${currentStatus} to ${nextStatus}`);
  }
};

const buildTaskAccessWhere = (user) => {
  const where = {
    // Task access is scoped through the owning project organization.
    project: {
      organizationId: user.organizationId,
    },
  };

  if (user.role === "TEAM_LEAD") {
    // Team leads can only see tasks for projects assigned to teams they lead.
    where.project.assignedTeam = {
      leadId: user.id,
    };
  }

  if (user.role === "TEAM_MEMBER") {
    // Team members can only see tasks directly assigned to them.
    where.assignedToId = user.id;
  }

  return where;
};

const buildSearchWhere = (search) => {
  const trimmedSearch = search?.trim();

  if (!trimmedSearch) {
    return {};
  }

  return {
    OR: [
      {
        title: {
          contains: trimmedSearch,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: trimmedSearch,
          mode: "insensitive",
        },
      },
    ],
  };
};

const formatTask = (task) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  progress: task.progress,
  deadline: task.deadline,
  project: task.project,
  team: task.project.assignedTeam,
  assignee: task.assignedTo,
  creator: task.assignedBy,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const recalculateProjectProgress = async (client, projectId) => {
  const aggregate = await client.task.aggregate({
    where: {
      projectId,
    },
    _avg: {
      progress: true,
    },
  });
  const progress = Math.round(aggregate._avg.progress || 0);

  // Project progress is derived from the average progress of all tasks in that project.
  await client.project.update({
    where: {
      id: projectId,
    },
    data: {
      progress,
    },
  });

  return progress;
};

const findAccessibleTask = async (taskId, user, queryOptions = { include: taskInclude }) => {
  if (!isValidUuid(taskId)) {
    // Validate IDs before Prisma queries so malformed IDs return a clear client error.
    throw new ApiError(400, "Invalid task id");
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...buildTaskAccessWhere(user),
    },
    ...queryOptions,
  });

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  return task;
};

const validateProjectForTaskCreation = async (projectId, user) => {
  if (!isValidUuid(projectId)) {
    throw new ApiError(400, "Invalid projectId");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      // Project ownership is always validated against the caller organization.
      organizationId: user.organizationId,
      ...(user.role === "TEAM_LEAD"
        ? {
            assignedTeam: {
              leadId: user.id,
            },
          }
        : {}),
    },
    select: projectSelect,
  });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  if (!project.assignedTeamId) {
    // Tasks require a project team because assignment permissions are team-based.
    throw new ApiError(400, "Project must be assigned to a team before tasks can be created");
  }

  return project;
};

const validateAssigneeForTeam = async (assigneeId, teamId, organizationId) => {
  if (!isValidUuid(assigneeId)) {
    throw new ApiError(400, "Invalid assigneeId");
  }

  const assignee = await prisma.user.findFirst({
    where: {
      id: assigneeId,
      organizationId,
      role: "TEAM_MEMBER",
      isActive: true,
      teamMemberships: {
        some: {
          teamId,
        },
      },
    },
    select: userSelect,
  });

  if (!assignee) {
    // Assignees must be active members of the project team to keep work inside the right team boundary.
    throw new ApiError(400, "assigneeId must belong to an active TEAM_MEMBER in the project team");
  }

  return assignee;
};

const ensureUniqueTaskTitle = async ({ title, projectId, excludeTaskId = null }) => {
  const existingTask = await prisma.task.findFirst({
    where: {
      // Prevent duplicate task titles inside one project to reduce assignment ambiguity.
      projectId,
      title,
      ...(excludeTaskId ? { NOT: { id: excludeTaskId } } : {}),
    },
  });

  if (existingTask) {
    throw new ApiError(409, "Task title already exists in this project");
  }
};

export const getTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);
  const where = {
    ...buildTaskAccessWhere(req.user),
    ...buildSearchWhere(req.query.search),
  };

  const status = normalizeStatus(req.query.status);
  const priority = normalizePriority(req.query.priority);

  if (status) {
    where.status = status;
  }

  if (priority) {
    where.priority = priority;
  }

  if (req.query.projectId) {
    if (!isValidUuid(req.query.projectId)) {
      throw new ApiError(400, "Invalid projectId");
    }

    where.projectId = req.query.projectId;
  }

  if (req.query.teamId) {
    if (!isValidUuid(req.query.teamId)) {
      throw new ApiError(400, "Invalid teamId");
    }

    // The team filter is applied through the project assignment relation.
    where.project.assignedTeamId = req.query.teamId;
  }

  if (req.query.assigneeId) {
    if (!isValidUuid(req.query.assigneeId)) {
      throw new ApiError(400, "Invalid assigneeId");
    }

    where.assignedToId = req.query.assigneeId;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Tasks fetched successfully",
    tasks.map(formatTask),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});

export const getTaskById = asyncHandler(async (req, res) => {
  const task = await findAccessibleTask(req.params.id, req.user);

  return sendSuccess(res, 200, "Task fetched successfully", formatTask(task));
});

export const createTask = asyncHandler(async (req, res) => {
  const { title, description, projectId, assigneeId, priority, deadline } = req.body;
  const trimmedTitle = title?.trim();
  const trimmedDescription = description?.trim() || null;
  const parsedDeadline = parseDeadline(deadline);
  const normalizedPriority = normalizePriority(priority) || "MEDIUM";

  if (!trimmedTitle) {
    throw new ApiError(400, "title is required");
  }

  if (!projectId) {
    throw new ApiError(400, "projectId is required");
  }

  if (!assigneeId) {
    throw new ApiError(400, "assigneeId is required");
  }

  const project = await validateProjectForTaskCreation(projectId, req.user);
  const assignee = await validateAssigneeForTeam(assigneeId, project.assignedTeamId, req.user.organizationId);
  await ensureUniqueTaskTitle({
    title: trimmedTitle,
    projectId: project.id,
  });

  const task = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.task.create({
      data: {
        title: trimmedTitle,
        description: trimmedDescription,
        projectId: project.id,
        assignedToId: assignee.id,
        assignedById: req.user.id,
        priority: normalizedPriority,
        deadline: parsedDeadline,
        status: "TODO",
        progress: 0,
      },
    });

    await recalculateProjectProgress(tx, project.id);

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TASK_CREATED",
      entityType: "TASK",
      entityId: createdTask.id,
      metadata: {
        taskId: createdTask.id,
        projectId: project.id,
        assigneeId: assignee.id,
      },
      client: tx,
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TASK_ASSIGNED",
      entityType: "TASK",
      entityId: createdTask.id,
      metadata: {
        taskId: createdTask.id,
        projectId: project.id,
        assigneeId: assignee.id,
      },
      client: tx,
    });

    // Notify assignees at creation time because task assignment drives member work queues.
    await createNotification({
      title: "You have been assigned a new task",
      message: `You have been assigned "${createdTask.title}".`,
      recipientId: assignee.id,
      client: tx,
    });

    return createdTask;
  });

  const createdTask = await findAccessibleTask(task.id, req.user);

  return sendSuccess(res, 201, "Task created successfully", formatTask(createdTask));
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await findAccessibleTask(req.params.id, req.user);
  const { title, description, priority, deadline, status, progress } = req.body;
  const data = {};
  const metadata = {};

  if (title !== undefined) {
    const trimmedTitle = title?.trim();

    if (!trimmedTitle) {
      throw new ApiError(400, "title cannot be empty");
    }

    await ensureUniqueTaskTitle({
      title: trimmedTitle,
      projectId: task.projectId,
      excludeTaskId: task.id,
    });
    data.title = trimmedTitle;
  }

  if (description !== undefined) {
    data.description = description?.trim() || null;
  }

  if (priority !== undefined) {
    data.priority = normalizePriority(priority);
  }

  if (deadline !== undefined) {
    data.deadline = parseDeadline(deadline);
  }

  if (status !== undefined) {
    const nextStatus = normalizeStatus(status);
    validateStatusTransition(task.status, nextStatus, req.user);
    data.status = nextStatus;
    metadata.oldStatus = task.status;
    metadata.newStatus = nextStatus;

    if (nextStatus === "COMPLETED") {
      data.progress = 100;
    }
  }

  if (progress !== undefined) {
    const nextProgress = normalizeProgress(progress);
    data.progress = nextProgress;
    metadata.oldProgress = task.progress;
    metadata.newProgress = nextProgress;

    if (nextProgress === 100) {
      validateStatusTransition(task.status, "COMPLETED", req.user);
      // A task at 100 percent is treated as completed to keep status and progress consistent.
      data.status = "COMPLETED";
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedTask = await prisma.$transaction(async (tx) => {
    const savedTask = await tx.task.update({
      where: {
        id: task.id,
      },
      data,
    });

    if (data.progress !== undefined) {
      await recalculateProjectProgress(tx, task.projectId);
    }

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TASK_UPDATED",
      entityType: "TASK",
      entityId: savedTask.id,
      metadata: {
        taskId: savedTask.id,
        projectId: task.projectId,
        updatedFields: Object.keys(data),
        ...metadata,
      },
      client: tx,
    });

    return savedTask;
  });

  const responseTask = await findAccessibleTask(updatedTask.id, req.user);

  return sendSuccess(res, 200, "Task updated successfully", formatTask(responseTask));
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const task = await findAccessibleTask(req.params.id, req.user);
  const nextStatus = normalizeStatus(req.body.status);

  if (!nextStatus) {
    throw new ApiError(400, "status is required");
  }

  validateStatusTransition(task.status, nextStatus, req.user);

  const data = {
    status: nextStatus,
    ...(nextStatus === "COMPLETED" ? { progress: 100 } : {}),
  };

  const updatedTask = await prisma.$transaction(async (tx) => {
    const savedTask = await tx.task.update({
      where: {
        id: task.id,
      },
      data,
    });

    if (data.progress !== undefined) {
      await recalculateProjectProgress(tx, task.projectId);
    }

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TASK_STATUS_UPDATED",
      entityType: "TASK",
      entityId: savedTask.id,
      metadata: {
        taskId: savedTask.id,
        projectId: task.projectId,
        oldStatus: task.status,
        newStatus: nextStatus,
      },
      client: tx,
    });

    return savedTask;
  });

  const responseTask = await findAccessibleTask(updatedTask.id, req.user);

  return sendSuccess(res, 200, "Task status updated successfully", formatTask(responseTask));
});

export const updateTaskProgress = asyncHandler(async (req, res) => {
  const task = await findAccessibleTask(req.params.id, req.user);
  const nextProgress = normalizeProgress(req.body.progress);

  if (nextProgress === 100) {
    validateStatusTransition(task.status, "COMPLETED", req.user);
  }

  const data = {
    progress: nextProgress,
    ...(nextProgress === 100 ? { status: "COMPLETED" } : {}),
  };

  const updatedTask = await prisma.$transaction(async (tx) => {
    const savedTask = await tx.task.update({
      where: {
        id: task.id,
      },
      data,
    });

    await recalculateProjectProgress(tx, task.projectId);

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TASK_PROGRESS_UPDATED",
      entityType: "TASK",
      entityId: savedTask.id,
      metadata: {
        taskId: savedTask.id,
        projectId: task.projectId,
        oldProgress: task.progress,
        newProgress: nextProgress,
        autoCompleted: nextProgress === 100,
      },
      client: tx,
    });

    return savedTask;
  });

  const responseTask = await findAccessibleTask(updatedTask.id, req.user);

  return sendSuccess(res, 200, "Task progress updated successfully", formatTask(responseTask));
});

export const reassignTask = asyncHandler(async (req, res) => {
  const task = await findAccessibleTask(req.params.id, req.user);
  const { assigneeId } = req.body;

  if (!assigneeId) {
    throw new ApiError(400, "assigneeId is required");
  }

  const assignee = await validateAssigneeForTeam(
    assigneeId,
    task.project.assignedTeamId,
    req.user.organizationId,
  );

  const updatedTask = await prisma.$transaction(async (tx) => {
    const savedTask = await tx.task.update({
      where: {
        id: task.id,
      },
      data: {
        assignedToId: assignee.id,
        assignedById: req.user.id,
      },
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TASK_REASSIGNED",
      entityType: "TASK",
      entityId: savedTask.id,
      metadata: {
        taskId: savedTask.id,
        projectId: task.projectId,
        oldAssigneeId: task.assignedToId,
        newAssigneeId: assignee.id,
      },
      client: tx,
    });

    // Reassignment creates a new inbox signal for the new owner of the task.
    await createNotification({
      title: "A task has been reassigned to you",
      message: `You have been assigned "${savedTask.title}".`,
      recipientId: assignee.id,
      client: tx,
    });

    return savedTask;
  });

  const responseTask = await findAccessibleTask(updatedTask.id, req.user);

  return sendSuccess(res, 200, "Task reassigned successfully", formatTask(responseTask));
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await findAccessibleTask(req.params.id, req.user);

  await prisma.$transaction(async (tx) => {
    await tx.task.delete({
      where: {
        id: task.id,
      },
    });

    await recalculateProjectProgress(tx, task.projectId);

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TASK_DELETED",
      entityType: "TASK",
      entityId: task.id,
      metadata: {
        taskId: task.id,
        projectId: task.projectId,
        assigneeId: task.assignedToId,
      },
      client: tx,
    });
  });

  return sendSuccess(res, 200, "Task deleted successfully");
});
