import swaggerJSDoc from "swagger-jsdoc";

const bearerSecurity = [{ bearerAuth: [] }];

const paginationParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
];

const uuidParam = (name, description) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string", format: "uuid" },
});

const successResponse = (schemaRef, description = "Successful response") => ({
  description,
  content: {
    "application/json": {
      schema: {
        allOf: [
          { $ref: "#/components/schemas/SuccessResponse" },
          {
            type: "object",
            properties: {
              data: schemaRef,
            },
          },
        ],
      },
    },
  },
});

const defaultErrors = {
  400: { $ref: "#/components/responses/ValidationError" },
  401: { $ref: "#/components/responses/Unauthorized" },
  403: { $ref: "#/components/responses/Forbidden" },
  404: { $ref: "#/components/responses/NotFound" },
  500: { $ref: "#/components/responses/InternalServerError" },
};

const protectedOperation = ({ summary, description, tags, requestBody, parameters = [], dataSchema, responses = {} }) => ({
  tags,
  summary,
  description,
  security: bearerSecurity,
  parameters,
  ...(requestBody ? { requestBody } : {}),
  responses: {
    200: successResponse(dataSchema || { type: "object" }),
    ...defaultErrors,
    ...responses,
  },
});

const jsonBody = (schemaRef, example) => ({
  required: true,
  content: {
    "application/json": {
      schema: { $ref: schemaRef },
      ...(example ? { example } : {}),
    },
  },
});

// Keep the OpenAPI source centralized so route docs can be validated without starting the server.
const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: "Forge AtriFex API",
    version: "1.0.0",
    description:
      "AI-powered project management platform with team collaboration, analytics, reporting, GitHub integration, and AI insights.",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Development server",
    },
    {
      url: "https://api.forge-atrifex.example.com",
      description: "Production server placeholder",
    },
  ],
  security: bearerSecurity,
  tags: [
    { name: "Health", description: "Liveness and readiness checks" },
    { name: "Auth", description: "Registration, login, and authenticated identity" },
    { name: "Account", description: "Current user profile, password, and account lifecycle" },
    { name: "Users", description: "User role administration" },
    { name: "Organizations", description: "Organization invites, ownership, and membership controls" },
    { name: "Teams", description: "Team CRUD, lead assignment, and member management" },
    { name: "Projects", description: "Project CRUD, assignment, and status management" },
    { name: "Tasks", description: "Task CRUD, progress, status, and reassignment" },
    { name: "Notifications", description: "User inbox and read state actions" },
    { name: "Activity", description: "Organization, team, and project activity timeline" },
    { name: "Dashboard", description: "Role-specific dashboard analytics" },
    { name: "Reports", description: "Operational and executive reports" },
    { name: "AI", description: "AI insights and suggestions. Prompts and provider secrets are never returned." },
    { name: "GitHub", description: "GitHub OAuth, repository linking, and repository analytics" },
  ],
  paths: {
    "/api/health/live": {
      get: {
        tags: ["Health"],
        summary: "Liveness check",
        security: [],
        responses: {
          200: {
            description: "Application process is alive",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Liveness" },
              },
            },
          },
        },
      },
    },
    "/api/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness check",
        description: "Checks database connectivity, AI configuration, and GitHub OAuth configuration.",
        security: [],
        responses: {
          200: {
            description: "Application is ready",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Readiness" },
              },
            },
          },
          503: {
            description: "Application is not ready",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Readiness" },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a user and organization",
        description: "Creates a new organization admin or joins an existing organization as an allowed non-admin role.",
        security: [],
        requestBody: jsonBody("#/components/schemas/RegisterRequest", {
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          password: "Password@123",
          organizationName: "AtriFex Labs",
        }),
        responses: {
          201: successResponse({ $ref: "#/components/schemas/AuthPayload" }, "Registration successful"),
          400: { $ref: "#/components/responses/ValidationError" },
          403: { $ref: "#/components/responses/Forbidden" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        security: [],
        requestBody: jsonBody("#/components/schemas/LoginRequest", {
          email: "admin@example.com",
          password: "Password@123",
        }),
        responses: {
          200: successResponse({ $ref: "#/components/schemas/AuthPayload" }, "Login successful"),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/auth/me": {
      get: protectedOperation({
        tags: ["Auth"],
        summary: "Get current authenticated user",
        description: "Requires `Authorization: Bearer <token>`.",
        dataSchema: { $ref: "#/components/schemas/AuthMePayload" },
      }),
    },
    "/api/auth/logout": {
      post: protectedOperation({
        tags: ["Auth"],
        summary: "Logout current session",
        dataSchema: { type: "object" },
      }),
    },
    "/api/account/me": {
      get: protectedOperation({
        tags: ["Account"],
        summary: "Get current account profile",
        description: "Returns safe current-user profile fields only.",
        dataSchema: { $ref: "#/components/schemas/User" },
      }),
      patch: protectedOperation({
        tags: ["Account"],
        summary: "Update current account profile",
        description: "Updates self-service profile fields and records an account activity entry.",
        requestBody: jsonBody("#/components/schemas/UpdateAccountProfileRequest", {
          fullName: "Ada Lovelace",
          avatar: "https://example.com/avatar.png",
          phone: "+1 555 0100",
          location: "San Francisco, CA",
          githubUsername: "ada-lovelace",
        }),
        dataSchema: { $ref: "#/components/schemas/User" },
      }),
    },
    "/api/account/password": {
      patch: protectedOperation({
        tags: ["Account"],
        summary: "Change current account password",
        description: "Requires the current password and sends a password-changed notification.",
        requestBody: jsonBody("#/components/schemas/ChangePasswordRequest", {
          currentPassword: "Password@123",
          newPassword: "NewPassword@123",
        }),
        dataSchema: { type: "object", properties: { changed: { type: "boolean" } } },
      }),
    },
    "/api/account/deactivate": {
      patch: protectedOperation({
        tags: ["Account"],
        summary: "Deactivate current account",
        description: "Prevents owner deactivation and protects the final active organization admin.",
        dataSchema: { $ref: "#/components/schemas/User" },
      }),
    },
    "/api/users/{id}/role": {
      patch: protectedOperation({
        tags: ["Users"],
        summary: "Update a user's role",
        description: "Requires ADMIN role. Prevents removing the final organization administrator.",
        parameters: [uuidParam("id", "Target user ID")],
        requestBody: jsonBody("#/components/schemas/UpdateRoleRequest", { role: "TEAM_LEAD" }),
        dataSchema: { $ref: "#/components/schemas/User" },
      }),
    },
    "/api/teams": {
      get: protectedOperation({
        tags: ["Teams"],
        summary: "List teams visible to the current user",
        parameters: [...paginationParams, { name: "search", in: "query", schema: { type: "string" } }],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/Team" } },
      }),
      post: protectedOperation({
        tags: ["Teams"],
        summary: "Create a team",
        description: "Requires ADMIN role. `leadId` must point to an active TEAM_LEAD in the organization.",
        requestBody: jsonBody("#/components/schemas/CreateTeamRequest", {
          name: "Platform Team",
          description: "Core delivery team",
          leadId: "00000000-0000-4000-8000-000000000000",
          memberIds: ["00000000-0000-4000-8000-000000000001"],
        }),
        dataSchema: { $ref: "#/components/schemas/Team" },
        responses: { 201: successResponse({ $ref: "#/components/schemas/Team" }, "Team created") },
      }),
    },
    "/api/teams/{id}": {
      get: protectedOperation({
        tags: ["Teams"],
        summary: "Get team details",
        parameters: [uuidParam("id", "Team ID")],
        dataSchema: { $ref: "#/components/schemas/Team" },
      }),
      patch: protectedOperation({
        tags: ["Teams"],
        summary: "Update team",
        description: "Requires ADMIN role. Supports lead assignment by updating `leadId`.",
        parameters: [uuidParam("id", "Team ID")],
        requestBody: jsonBody("#/components/schemas/UpdateTeamRequest", { name: "Platform Delivery" }),
        dataSchema: { $ref: "#/components/schemas/Team" },
      }),
      delete: protectedOperation({
        tags: ["Teams"],
        summary: "Delete team",
        description: "Requires ADMIN role. Active project dependencies are rejected.",
        parameters: [uuidParam("id", "Team ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/teams/{id}/members": {
      post: protectedOperation({
        tags: ["Teams"],
        summary: "Add members to a team",
        description: "Requires ADMIN role. Members must be active TEAM_MEMBER users in the organization.",
        parameters: [uuidParam("id", "Team ID")],
        requestBody: jsonBody("#/components/schemas/MemberIdsRequest", {
          memberIds: ["00000000-0000-4000-8000-000000000001"],
        }),
        dataSchema: { $ref: "#/components/schemas/Team" },
      }),
    },
    "/api/teams/{id}/members/{userId}": {
      delete: protectedOperation({
        tags: ["Teams"],
        summary: "Remove a member from a team",
        description: "Requires ADMIN role. Team leads must be changed through the team update endpoint.",
        parameters: [uuidParam("id", "Team ID"), uuidParam("userId", "Member user ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/projects": {
      get: protectedOperation({
        tags: ["Projects"],
        summary: "List projects visible to the current user",
        parameters: [
          ...paginationParams,
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/ProjectStatus" } },
          { name: "teamId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/Project" } },
      }),
      post: protectedOperation({
        tags: ["Projects"],
        summary: "Create project",
        description: "Requires ADMIN role.",
        requestBody: jsonBody("#/components/schemas/CreateProjectRequest", {
          title: "New Platform",
          description: "Build the platform API",
          teamId: "00000000-0000-4000-8000-000000000010",
        }),
        dataSchema: { $ref: "#/components/schemas/Project" },
        responses: { 201: successResponse({ $ref: "#/components/schemas/Project" }, "Project created") },
      }),
    },
    "/api/projects/team/{teamId}": {
      get: protectedOperation({
        tags: ["Projects"],
        summary: "List projects assigned to a team",
        parameters: [uuidParam("teamId", "Team ID"), ...paginationParams],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/Project" } },
      }),
    },
    "/api/projects/{id}": {
      get: protectedOperation({
        tags: ["Projects"],
        summary: "Get project details",
        parameters: [uuidParam("id", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/Project" },
      }),
      patch: protectedOperation({
        tags: ["Projects"],
        summary: "Update project",
        description: "Requires ADMIN role. Supports status, progress, health score, deadline, and metadata changes.",
        parameters: [uuidParam("id", "Project ID")],
        requestBody: jsonBody("#/components/schemas/UpdateProjectRequest", { status: "IN_PROGRESS", progress: 35 }),
        dataSchema: { $ref: "#/components/schemas/Project" },
      }),
      delete: protectedOperation({
        tags: ["Projects"],
        summary: "Delete project",
        description: "Requires ADMIN role. Active projects and projects with active tasks are rejected.",
        parameters: [uuidParam("id", "Project ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/projects/{id}/assign-team": {
      post: protectedOperation({
        tags: ["Projects"],
        summary: "Assign a team to a project",
        description: "Requires ADMIN role.",
        parameters: [uuidParam("id", "Project ID")],
        requestBody: jsonBody("#/components/schemas/AssignTeamRequest", {
          teamId: "00000000-0000-4000-8000-000000000010",
        }),
        dataSchema: { $ref: "#/components/schemas/Project" },
      }),
    },
    "/api/tasks": {
      get: protectedOperation({
        tags: ["Tasks"],
        summary: "List tasks visible to the current user",
        parameters: [
          ...paginationParams,
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/TaskStatus" } },
          { name: "priority", in: "query", schema: { $ref: "#/components/schemas/TaskPriority" } },
          { name: "projectId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "teamId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "assigneeId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/Task" } },
      }),
      post: protectedOperation({
        tags: ["Tasks"],
        summary: "Create task",
        description: "Requires TEAM_LEAD or ADMIN role.",
        requestBody: jsonBody("#/components/schemas/CreateTaskRequest", {
          title: "Implement API",
          projectId: "00000000-0000-4000-8000-000000000020",
          assigneeId: "00000000-0000-4000-8000-000000000021",
          priority: "HIGH",
        }),
        dataSchema: { $ref: "#/components/schemas/Task" },
        responses: { 201: successResponse({ $ref: "#/components/schemas/Task" }, "Task created") },
      }),
    },
    "/api/tasks/{id}": {
      get: protectedOperation({
        tags: ["Tasks"],
        summary: "Get task details",
        parameters: [uuidParam("id", "Task ID")],
        dataSchema: { $ref: "#/components/schemas/Task" },
      }),
      patch: protectedOperation({
        tags: ["Tasks"],
        summary: "Update task",
        parameters: [uuidParam("id", "Task ID")],
        requestBody: jsonBody("#/components/schemas/UpdateTaskRequest", { progress: 50, status: "IN_PROGRESS" }),
        dataSchema: { $ref: "#/components/schemas/Task" },
      }),
      delete: protectedOperation({
        tags: ["Tasks"],
        summary: "Delete task",
        description: "Requires TEAM_LEAD or ADMIN role.",
        parameters: [uuidParam("id", "Task ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/tasks/{id}/status": {
      patch: protectedOperation({
        tags: ["Tasks"],
        summary: "Update task status",
        parameters: [uuidParam("id", "Task ID")],
        requestBody: jsonBody("#/components/schemas/TaskStatusRequest", { status: "IN_REVIEW" }),
        dataSchema: { $ref: "#/components/schemas/Task" },
      }),
    },
    "/api/tasks/{id}/progress": {
      patch: protectedOperation({
        tags: ["Tasks"],
        summary: "Update task progress",
        parameters: [uuidParam("id", "Task ID")],
        requestBody: jsonBody("#/components/schemas/TaskProgressRequest", { progress: 75 }),
        dataSchema: { $ref: "#/components/schemas/Task" },
      }),
    },
    "/api/tasks/{id}/reassign": {
      patch: protectedOperation({
        tags: ["Tasks"],
        summary: "Reassign task",
        description: "Requires TEAM_LEAD or ADMIN role.",
        parameters: [uuidParam("id", "Task ID")],
        requestBody: jsonBody("#/components/schemas/ReassignTaskRequest", {
          assigneeId: "00000000-0000-4000-8000-000000000021",
        }),
        dataSchema: { $ref: "#/components/schemas/Task" },
      }),
    },
    "/api/notifications": {
      get: protectedOperation({
        tags: ["Notifications"],
        summary: "List current user's notifications",
        parameters: [
          ...paginationParams,
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "read", in: "query", schema: { type: "boolean" } },
        ],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
      }),
    },
    "/api/notifications/unread-count": {
      get: protectedOperation({
        tags: ["Notifications"],
        summary: "Get unread notification count",
        dataSchema: { type: "object", properties: { count: { type: "integer" } } },
      }),
    },
    "/api/notifications/read-all": {
      patch: protectedOperation({
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        dataSchema: { type: "object", properties: { updatedCount: { type: "integer" } } },
      }),
    },
    "/api/notifications/{id}/read": {
      patch: protectedOperation({
        tags: ["Notifications"],
        summary: "Mark one notification as read",
        parameters: [uuidParam("id", "Notification ID")],
        dataSchema: { $ref: "#/components/schemas/Notification" },
      }),
    },
    "/api/activity": {
      get: protectedOperation({
        tags: ["Activity"],
        summary: "Get organization activity feed",
        parameters: [
          ...paginationParams,
          { name: "entityType", in: "query", schema: { type: "string" } },
          { name: "userId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "projectId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "teamId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "dateFrom", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "dateTo", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
      }),
    },
    "/api/activity/team/{teamId}": {
      get: protectedOperation({
        tags: ["Activity"],
        summary: "Get team activity timeline",
        parameters: [uuidParam("teamId", "Team ID"), ...paginationParams],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
      }),
    },
    "/api/activity/project/{projectId}": {
      get: protectedOperation({
        tags: ["Activity"],
        summary: "Get project activity timeline",
        parameters: [uuidParam("projectId", "Project ID"), ...paginationParams],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
      }),
    },
    "/api/activity/{id}": {
      get: protectedOperation({
        tags: ["Activity"],
        summary: "Get activity log details",
        parameters: [uuidParam("id", "Activity log ID")],
        dataSchema: { $ref: "#/components/schemas/ActivityLog" },
      }),
    },
    "/api/dashboard/admin": {
      get: protectedOperation({
        tags: ["Dashboard"],
        summary: "Admin dashboard summary",
        description: "Requires ADMIN role.",
        dataSchema: { $ref: "#/components/schemas/DashboardSummary" },
      }),
    },
    "/api/dashboard/admin/delivery-health": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Admin delivery health", dataSchema: { type: "object" } }),
    },
    "/api/dashboard/admin/contribution-analytics": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Admin contribution analytics", dataSchema: { type: "array", items: { type: "object" } } }),
    },
    "/api/dashboard/team-lead": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Team lead dashboard summary", dataSchema: { $ref: "#/components/schemas/DashboardSummary" } }),
    },
    "/api/dashboard/team-lead/analytics": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Team lead member analytics", dataSchema: { type: "array", items: { type: "object" } } }),
    },
    "/api/dashboard/team-lead/issues": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Team lead delivery issues", dataSchema: { type: "object" } }),
    },
    "/api/dashboard/member": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Member dashboard summary", dataSchema: { $ref: "#/components/schemas/DashboardSummary" } }),
    },
    "/api/dashboard/member/activity": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Member recent activity", dataSchema: { type: "object" } }),
    },
    "/api/dashboard/member/performance": {
      get: protectedOperation({ tags: ["Dashboard"], summary: "Member performance metrics", dataSchema: { type: "object" } }),
    },
    "/api/reports/project/{projectId}": {
      get: protectedOperation({
        tags: ["Reports"],
        summary: "Generate project report",
        parameters: [uuidParam("projectId", "Project ID"), { $ref: "#/components/parameters/DateFrom" }, { $ref: "#/components/parameters/DateTo" }],
        dataSchema: { $ref: "#/components/schemas/Report" },
      }),
    },
    "/api/reports/team/{teamId}": {
      get: protectedOperation({
        tags: ["Reports"],
        summary: "Generate team report",
        parameters: [uuidParam("teamId", "Team ID"), { $ref: "#/components/parameters/DateFrom" }, { $ref: "#/components/parameters/DateTo" }],
        dataSchema: { $ref: "#/components/schemas/Report" },
      }),
    },
    "/api/reports/member/{memberId}": {
      get: protectedOperation({
        tags: ["Reports"],
        summary: "Generate member report",
        parameters: [uuidParam("memberId", "Member ID"), { $ref: "#/components/parameters/DateFrom" }, { $ref: "#/components/parameters/DateTo" }],
        dataSchema: { $ref: "#/components/schemas/Report" },
      }),
    },
    "/api/reports/delivery": {
      get: protectedOperation({
        tags: ["Reports"],
        summary: "Generate delivery report",
        description: "Requires ADMIN role.",
        parameters: [{ $ref: "#/components/parameters/DateFrom" }, { $ref: "#/components/parameters/DateTo" }],
        dataSchema: { $ref: "#/components/schemas/Report" },
      }),
    },
    "/api/reports/executive-summary": {
      get: protectedOperation({
        tags: ["Reports"],
        summary: "Generate executive summary report",
        description: "Requires ADMIN role.",
        parameters: [{ $ref: "#/components/parameters/DateFrom" }, { $ref: "#/components/parameters/DateTo" }],
        dataSchema: { $ref: "#/components/schemas/Report" },
      }),
    },
    "/api/ai/project-analysis/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate project analysis",
        description: "Requires ADMIN or TEAM_LEAD role.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AIResponse" },
      }),
    },
    "/api/ai/risk-analysis/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate project risk analysis",
        description: "Requires ADMIN or TEAM_LEAD role.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AIResponse" },
      }),
    },
    "/api/ai/team-analysis/{teamId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate team analysis",
        description: "Requires ADMIN or TEAM_LEAD role.",
        parameters: [uuidParam("teamId", "Team ID")],
        dataSchema: { $ref: "#/components/schemas/AIResponse" },
      }),
    },
    "/api/ai/task-suggestions/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate task suggestions",
        description: "Requires TEAM_LEAD role.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AIResponse" },
      }),
    },
    "/api/ai/project-health/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate AI project health advice",
        description: "Requires ADMIN or TEAM_LEAD role. Persists an AI insight and returns cached insight data when context is unchanged.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AIProjectHealth" },
      }),
    },
    "/api/ai/task-assignment/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate smart task assignment recommendation",
        description: "Requires TEAM_LEAD role. Uses workload, performance, role, and active task count.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AITaskAssignment" },
      }),
    },
    "/api/ai/sprint-plan/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate sprint plan",
        description: "Requires ADMIN or TEAM_LEAD role.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AISprintPlan" },
      }),
    },
    "/api/ai/daily-standup/{teamId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate daily standup",
        description: "Requires ADMIN or TEAM_LEAD role.",
        parameters: [uuidParam("teamId", "Team ID")],
        dataSchema: { $ref: "#/components/schemas/AIDailyStandup" },
      }),
    },
    "/api/ai/weekly-report/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate weekly project report",
        description: "Requires ADMIN or TEAM_LEAD role.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AIWeeklyReport" },
      }),
    },
    "/api/ai/team-coaching/{teamId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate team performance coaching",
        description: "Requires ADMIN or TEAM_LEAD role.",
        parameters: [uuidParam("teamId", "Team ID")],
        dataSchema: { $ref: "#/components/schemas/AITeamCoaching" },
      }),
    },
    "/api/ai/risk-prediction/{projectId}": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate predictive delivery risk analysis",
        description: "Requires ADMIN or TEAM_LEAD role. High-risk results trigger notifications.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/AIRiskPrediction" },
      }),
    },
    "/api/ai/insights/{insightId}/accept": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Accept an AI recommendation",
        description: "Requires ADMIN or TEAM_LEAD role and records an activity log entry.",
        parameters: [uuidParam("insightId", "AI insight ID")],
        dataSchema: { $ref: "#/components/schemas/AIInsight" },
      }),
    },
    "/api/ai/insights/{insightId}/reject": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Reject an AI recommendation",
        description: "Requires ADMIN or TEAM_LEAD role and records an activity log entry.",
        parameters: [uuidParam("insightId", "AI insight ID")],
        dataSchema: { $ref: "#/components/schemas/AIInsight" },
      }),
    },
    "/api/ai/executive-summary": {
      post: protectedOperation({
        tags: ["AI"],
        summary: "Generate AI executive summary",
        description: "Requires ADMIN role.",
        dataSchema: { $ref: "#/components/schemas/AIResponse" },
      }),
    },
    "/api/github/callback": {
      get: {
        tags: ["GitHub"],
        summary: "GitHub OAuth callback",
        description: "Public OAuth callback. Requires GitHub OAuth environment configuration.",
        security: [],
        parameters: [
          { name: "code", in: "query", required: true, schema: { type: "string" } },
          { name: "state", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: successResponse({ type: "object" }, "GitHub account connected"),
          400: { $ref: "#/components/responses/ValidationError" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/github/connect": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Start GitHub OAuth flow",
        description: "Redirects to GitHub. Requires GitHub OAuth configuration.",
        dataSchema: { type: "object" },
        responses: { 302: { description: "Redirect to GitHub OAuth authorization URL" } },
      }),
    },
    "/api/github/repositories": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "List accessible GitHub repositories",
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/GitHubRepository" } },
      }),
    },
    "/api/github/connect-repository": {
      post: protectedOperation({
        tags: ["GitHub"],
        summary: "Link a GitHub repository to a project",
        description: "Requires ADMIN or TEAM_LEAD role and a connected GitHub account.",
        requestBody: jsonBody("#/components/schemas/ConnectRepositoryRequest", {
          projectId: "00000000-0000-4000-8000-000000000020",
          repositoryOwner: "atrifex",
          repositoryName: "forge-backend",
        }),
        dataSchema: { type: "object" },
      }),
    },
    "/api/github/project/{projectId}/repository": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "View linked repository",
        description: "Requires ADMIN, TEAM_LEAD, or TEAM_MEMBER role.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/LinkedRepository" },
      }),
      delete: protectedOperation({
        tags: ["GitHub"],
        summary: "Disconnect linked repository",
        description: "Requires ADMIN or TEAM_LEAD role. Returns a validation error when no repository is linked.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { type: "object", properties: { disconnected: { type: "boolean", example: true } } },
      }),
    },
    "/api/github/project/{projectId}/sync": {
      post: protectedOperation({
        tags: ["GitHub"],
        summary: "Synchronize linked repository",
        description: "Requires ADMIN or TEAM_LEAD role. Fetches commits, pull requests, issues, refreshes metadata, logs activity, and notifies the caller.",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/GitHubSyncResult" },
      }),
    },
    "/api/github/project/{projectId}/overview": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository overview analytics",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/github/project/{projectId}/commits": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository commit analytics",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/github/project/{projectId}/commit-timeline": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository commit timeline",
        description: "Returns daily commits, weekly commits, top contributors, commit frequency, and paginated commit rows.",
        parameters: [uuidParam("projectId", "Project ID"), ...paginationParams],
        dataSchema: { $ref: "#/components/schemas/CommitTimeline" },
      }),
    },
    "/api/github/project/{projectId}/pull-requests": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository pull request analytics",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/github/project/{projectId}/pr-insights": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository pull request insights",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/PullRequestInsights" },
      }),
    },
    "/api/github/project/{projectId}/issues": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository issue analytics",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/github/project/{projectId}/issue-insights": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository issue insights",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/IssueInsights" },
      }),
    },
    "/api/github/project/{projectId}/contributors": {
      get: protectedOperation({
        tags: ["GitHub"],
        summary: "Repository contributor analytics",
        parameters: [uuidParam("projectId", "Project ID")],
        dataSchema: { $ref: "#/components/schemas/ContributorInsights" },
      }),
    },
    "/api/github/webhook": {
      post: {
        tags: ["GitHub"],
        summary: "GitHub webhook receiver",
        description: "Public GitHub webhook endpoint. Verifies `X-Hub-Signature-256` when `GITHUB_WEBHOOK_SECRET` is configured and routes push, pull_request, issues, repository, and ping skeleton handlers.",
        security: [],
        parameters: [
          { name: "X-GitHub-Event", in: "header", required: true, schema: { type: "string", example: "push" } },
          { name: "X-GitHub-Delivery", in: "header", required: false, schema: { type: "string" } },
          { name: "X-Hub-Signature-256", in: "header", required: false, schema: { type: "string" } },
        ],
        requestBody: jsonBody("#/components/schemas/GitHubWebhookPayload", {
          action: "opened",
          repository: {
            name: "forge-backend",
            full_name: "atrifex/forge-backend",
            owner: { login: "atrifex" },
          },
        }),
        responses: {
          200: successResponse({ $ref: "#/components/schemas/GitHubWebhookResponse" }, "Webhook accepted"),
          400: { $ref: "#/components/responses/ValidationError" },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/InternalServerError" },
        },
      },
    },
    "/api/auth/accept-invite": {
      post: {
        tags: ["Auth"],
        summary: "Accept an organization invitation",
        security: [],
        requestBody: jsonBody("#/components/schemas/AcceptInviteRequest", {
          inviteToken: "invite_token_value",
          email: "member@example.com",
          password: "Password@123",
          fullName: "New Member",
        }),
        responses: {
          201: successResponse({ $ref: "#/components/schemas/AuthPayload" }, "Invitation accepted"),
          400: { $ref: "#/components/responses/ValidationError" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/organizations/me": {
      get: protectedOperation({
        tags: ["Organizations"],
        summary: "Get organization profile",
        description: "Requires ADMIN role.",
        dataSchema: { type: "object" },
      }),
      patch: protectedOperation({
        tags: ["Organizations"],
        summary: "Update organization profile",
        description: "Requires ADMIN role.",
        requestBody: jsonBody("#/components/schemas/UpdateOrganizationRequest", {
          name: "AtriFex Labs",
          website: "https://atrifex.example.com",
          timezone: "Asia/Kolkata",
        }),
        dataSchema: { type: "object" },
      }),
    },
    "/api/organizations/settings": {
      get: protectedOperation({
        tags: ["Organizations"],
        summary: "Get organization settings",
        description: "Requires ADMIN role.",
        dataSchema: { type: "object" },
      }),
      patch: protectedOperation({
        tags: ["Organizations"],
        summary: "Update organization settings",
        description: "Requires ADMIN role.",
        requestBody: jsonBody("#/components/schemas/UpdateOrganizationSettingsRequest", {
          requireAdminApproval: true,
          defaultMemberRole: "TEAM_MEMBER",
          notificationsEnabled: true,
        }),
        dataSchema: { type: "object" },
      }),
    },
    "/api/organizations/members": {
      get: protectedOperation({
        tags: ["Organizations"],
        summary: "List organization members",
        description: "Requires ADMIN role. Supports search, role, status, team, pagination, and sorting filters.",
        parameters: [
          ...paginationParams,
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "role", in: "query", schema: { $ref: "#/components/schemas/UserRole" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/UserStatus" } },
          { name: "teamId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        dataSchema: { type: "array", items: { type: "object" } },
      }),
    },
    "/api/organizations/members/{id}": {
      get: protectedOperation({
        tags: ["Organizations"],
        summary: "Get organization member details",
        description: "Requires ADMIN role.",
        parameters: [uuidParam("id", "Member ID")],
        dataSchema: { type: "object" },
      }),
      delete: protectedOperation({
        tags: ["Organizations"],
        summary: "Remove organization member",
        description: "Requires ADMIN role. Soft-removes the member by marking the account inactive.",
        parameters: [uuidParam("id", "Member ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/organizations/members/{id}/status": {
      patch: protectedOperation({
        tags: ["Organizations"],
        summary: "Update organization member status",
        description: "Requires ADMIN role.",
        parameters: [uuidParam("id", "Member ID")],
        requestBody: jsonBody("#/components/schemas/UpdateMemberStatusRequest", { status: "SUSPENDED" }),
        dataSchema: { type: "object" },
      }),
    },
    "/api/organizations/statistics": {
      get: protectedOperation({
        tags: ["Organizations"],
        summary: "Get organization statistics",
        description: "Requires ADMIN role.",
        dataSchema: { type: "object" },
      }),
    },
    "/api/organizations/activity": {
      get: protectedOperation({
        tags: ["Organizations"],
        summary: "Get organization activity",
        description: "Requires ADMIN role. Reuses organization-scoped ActivityLog entries.",
        parameters: [
          ...paginationParams,
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "entityType", in: "query", schema: { type: "string" } },
        ],
        dataSchema: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
      }),
    },
    "/api/organizations/invite": {
      post: protectedOperation({
        tags: ["Organizations"],
        summary: "Create organization invite",
        description: "Requires ADMIN role.",
        requestBody: jsonBody("#/components/schemas/CreateInviteRequest", {
          invitedEmail: "member@example.com",
          role: "TEAM_MEMBER",
        }),
        dataSchema: { type: "object" },
        responses: { 201: successResponse({ type: "object" }, "Invite created") },
      }),
    },
    "/api/organizations/invites": {
      get: protectedOperation({
        tags: ["Organizations"],
        summary: "List organization invites",
        description: "Requires ADMIN role.",
        dataSchema: { type: "array", items: { type: "object" } },
      }),
    },
    "/api/organizations/invites/{id}": {
      delete: protectedOperation({
        tags: ["Organizations"],
        summary: "Revoke an organization invite",
        description: "Requires ADMIN role.",
        parameters: [uuidParam("id", "Invite ID")],
        dataSchema: { type: "object" },
      }),
    },
    "/api/organizations/transfer-ownership": {
      post: protectedOperation({
        tags: ["Organizations"],
        summary: "Transfer organization ownership",
        description: "Requires ADMIN role.",
        requestBody: jsonBody("#/components/schemas/TransferOwnershipRequest", {
          nextOwnerId: "00000000-0000-4000-8000-000000000001",
        }),
        dataSchema: { type: "object" },
      }),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT bearer token. Example: `Authorization: Bearer <token>`.",
      },
    },
    parameters: {
      DateFrom: { name: "dateFrom", in: "query", schema: { type: "string", format: "date-time" } },
      DateTo: { name: "dateTo", in: "query", schema: { type: "string", format: "date-time" } },
    },
    responses: {
      ValidationError: {
        description: "Validation failed",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationErrorResponse" } } },
      },
      Unauthorized: {
        description: "Unauthorized",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Forbidden: {
        description: "Forbidden",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      NotFound: {
        description: "Resource not found",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Conflict: {
        description: "Conflict",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      InternalServerError: {
        description: "Internal server error",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
    },
    schemas: {
      SuccessResponse: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Operation completed successfully" },
          data: { type: "object" },
          meta: { type: "object" },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["success", "message"],
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Unauthorized" },
        },
      },
      ValidationErrorResponse: {
        type: "object",
        required: ["success", "message", "errors"],
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Validation failed" },
          errors: {
            type: "array",
            items: { $ref: "#/components/schemas/FieldError" },
          },
        },
      },
      FieldError: {
        type: "object",
        properties: {
          field: { type: "string", example: "body.email" },
          message: { type: "string", example: "Invalid email address" },
        },
      },
      UserRole: { type: "string", enum: ["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"] },
      UserStatus: { type: "string", enum: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
      ProjectStatus: { type: "string", enum: ["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] },
      TaskStatus: { type: "string", enum: ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"] },
      TaskPriority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      Organization: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          fullName: { type: "string" },
          email: { type: "string", format: "email" },
          role: { $ref: "#/components/schemas/UserRole" },
          githubUsername: { type: "string", nullable: true },
          avatar: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          location: { type: "string", nullable: true },
          isActive: { type: "boolean" },
          status: { $ref: "#/components/schemas/UserStatus" },
          organizationId: { type: "string", format: "uuid" },
          organization: { $ref: "#/components/schemas/Organization" },
        },
      },
      Team: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          lead: { $ref: "#/components/schemas/User" },
          members: { type: "array", items: { type: "object" } },
          memberCount: { type: "integer" },
          projectsCount: { type: "integer" },
          tasksCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          repositoryUrl: { type: "string", nullable: true },
          deadline: { type: "string", format: "date-time", nullable: true },
          status: { $ref: "#/components/schemas/ProjectStatus" },
          progress: { type: "integer", minimum: 0, maximum: 100 },
          healthScore: { type: "integer", minimum: 0, maximum: 100 },
          assignedTeam: { $ref: "#/components/schemas/Team" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          status: { $ref: "#/components/schemas/TaskStatus" },
          priority: { $ref: "#/components/schemas/TaskPriority" },
          progress: { type: "integer", minimum: 0, maximum: 100 },
          deadline: { type: "string", format: "date-time", nullable: true },
          project: { $ref: "#/components/schemas/Project" },
          team: { $ref: "#/components/schemas/Team" },
          assignee: { $ref: "#/components/schemas/User" },
          creator: { $ref: "#/components/schemas/User" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          message: { type: "string" },
          isRead: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ActivityLog: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          actor: { $ref: "#/components/schemas/User" },
          organization: { $ref: "#/components/schemas/Organization" },
          action: { type: "string" },
          entityType: { type: "string" },
          entityId: { type: "string", format: "uuid" },
          metadata: { type: "object" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Report: {
        type: "object",
        properties: {
          metrics: { type: "object" },
          risks: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
        },
        additionalProperties: true,
      },
      GitHubRepository: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          owner: { type: "string" },
          private: { type: "boolean" },
        },
      },
      LinkedRepository: {
        type: "object",
        properties: {
          projectId: { type: "string", format: "uuid" },
          repository: { type: "string", example: "atrifex/forge-backend" },
          repositoryUrl: { type: "string", example: "https://github.com/atrifex/forge-backend" },
          repositoryId: { type: "string" },
          owner: { type: "string", example: "atrifex" },
          name: { type: "string", example: "forge-backend" },
          defaultBranch: { type: "string", example: "main" },
        },
      },
      GitHubSyncResult: {
        type: "object",
        properties: {
          commitsSynced: { type: "integer", example: 48 },
          pullRequestsSynced: { type: "integer", example: 12 },
          issuesSynced: { type: "integer", example: 9 },
          syncedAt: { type: "string", format: "date-time" },
          repository: { type: "string", example: "atrifex/forge-backend" },
          defaultBranch: { type: "string", example: "main" },
        },
      },
      CommitTimeline: {
        type: "object",
        properties: {
          dailyCommits: { type: "array", items: { type: "object" } },
          weeklyCommits: { type: "array", items: { type: "object" } },
          topContributors: { type: "array", items: { type: "object" } },
          commitFrequency: { type: "integer" },
          commits: { type: "array", items: { type: "object" } },
          pagination: { type: "object" },
        },
      },
      PullRequestInsights: {
        type: "object",
        properties: {
          openPRs: { type: "integer" },
          mergedPRs: { type: "integer" },
          averageMergeTimeHours: { type: "number" },
          reviewActivity: { type: "object" },
          prTrend: { type: "array", items: { type: "object" } },
        },
      },
      IssueInsights: {
        type: "object",
        properties: {
          openIssues: { type: "integer" },
          closedIssues: { type: "integer" },
          averageResolutionTimeHours: { type: "number" },
          issueTrend: { type: "array", items: { type: "object" } },
        },
      },
      ContributorInsights: {
        type: "object",
        properties: {
          contributors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                username: { type: "string" },
                commitCount: { type: "integer" },
                prCount: { type: "integer" },
                issuesClosed: { type: "integer" },
                lastContribution: { type: "string", format: "date-time", nullable: true },
                contributionScore: { type: "integer" },
              },
            },
          },
        },
      },
      GitHubWebhookPayload: {
        type: "object",
        additionalProperties: true,
        properties: {
          action: { type: "string" },
          repository: {
            type: "object",
            properties: {
              name: { type: "string" },
              full_name: { type: "string" },
              owner: { type: "object", additionalProperties: true },
            },
          },
        },
      },
      GitHubWebhookResponse: {
        type: "object",
        properties: {
          accepted: { type: "boolean", example: true },
          event: { type: "string", example: "push" },
          deliveryId: { type: "string" },
          message: { type: "string", example: "push webhook accepted" },
          projectId: { type: "string", format: "uuid", nullable: true },
        },
      },
      AIResponse: {
        type: "object",
        description: "AI response shape varies by workflow but is validated by the backend before return.",
        additionalProperties: true,
      },
      AIInsight: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          type: { type: "string", example: "projectHealth" },
          summary: { type: "string" },
          recommendations: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["GENERATED", "ACCEPTED", "REJECTED"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AIProjectHealth: {
        type: "object",
        properties: {
          insightId: { type: "string", format: "uuid" },
          cached: { type: "boolean", example: false },
          promptVersion: { type: "string", example: "1.0.0" },
          overallHealth: { type: "string" },
          healthScore: { type: "integer", minimum: 0, maximum: 100 },
          majorProblems: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
          predictedDeliveryRisk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
        },
      },
      AITaskAssignment: {
        type: "object",
        properties: {
          insightId: { type: "string", format: "uuid" },
          bestDeveloper: { type: "string" },
          confidenceScore: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
          estimatedCompletion: { type: "string" },
          workloadComparison: { type: "array", items: { type: "object" } },
        },
      },
      AISprintPlan: {
        type: "object",
        properties: {
          insightId: { type: "string", format: "uuid" },
          recommendedSprintBacklog: { type: "array", items: { type: "object" } },
          estimatedSprintLoad: { type: "string" },
          predictedBottlenecks: { type: "array", items: { type: "string" } },
        },
      },
      AIDailyStandup: {
        type: "object",
        properties: {
          insightId: { type: "string", format: "uuid" },
          yesterday: { type: "array", items: { type: "string" } },
          today: { type: "array", items: { type: "string" } },
          blockers: { type: "array", items: { type: "string" } },
          importantHighlights: { type: "array", items: { type: "string" } },
          riskSummary: { type: "string" },
        },
      },
      AIWeeklyReport: {
        type: "object",
        properties: {
          insightId: { type: "string", format: "uuid" },
          executiveSummary: { type: "string" },
          teamAchievements: { type: "array", items: { type: "string" } },
          majorBlockers: { type: "array", items: { type: "string" } },
          deliveryProgress: { type: "string" },
          aiRecommendations: { type: "array", items: { type: "string" } },
        },
      },
      AITeamCoaching: {
        type: "object",
        properties: {
          insightId: { type: "string", format: "uuid" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
        },
      },
      AIRiskPrediction: {
        type: "object",
        properties: {
          insightId: { type: "string", format: "uuid" },
          risks: { type: "array", items: { type: "object" } },
          overallRiskProbability: { type: "integer", minimum: 0, maximum: 100 },
          summary: { type: "string" },
        },
      },
      DashboardSummary: {
        type: "object",
        additionalProperties: true,
      },
      Liveness: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          status: { type: "string", example: "UP" },
        },
      },
      Readiness: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          status: { type: "string", enum: ["READY", "NOT_READY"] },
          checks: {
            type: "object",
            properties: {
              database: { type: "string", enum: ["UP", "DOWN"] },
              ai: { type: "string", enum: ["UP", "DOWN"] },
              github: { type: "string", enum: ["UP", "DOWN"] },
            },
          },
        },
      },
      AuthPayload: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
          dashboardPath: { type: "string" },
        },
      },
      AuthMePayload: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          dashboardPath: { type: "string" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["fullName", "email", "password"],
        properties: {
          fullName: { type: "string", minLength: 2 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, maxLength: 128 },
          organizationName: { type: "string", minLength: 2 },
          inviteToken: { type: "string" },
          role: { $ref: "#/components/schemas/UserRole" },
          githubUsername: { type: "string" },
          phone: { type: "string" },
          location: { type: "string" },
        },
      },
      AcceptInviteRequest: {
        type: "object",
        required: ["inviteToken", "email", "password", "fullName"],
        properties: {
          inviteToken: { type: "string" },
          email: { type: "string", format: "email" },
          password: { type: "string" },
          fullName: { type: "string" },
          githubUsername: { type: "string" },
          phone: { type: "string" },
          location: { type: "string" },
        },
      },
      CreateInviteRequest: {
        type: "object",
        required: ["invitedEmail", "role"],
        properties: {
          invitedEmail: { type: "string", format: "email" },
          role: { $ref: "#/components/schemas/UserRole" },
        },
      },
      UpdateAccountProfileRequest: {
        type: "object",
        properties: {
          fullName: { type: "string", minLength: 2, maxLength: 100 },
          avatar: { type: "string", format: "uri" },
          phone: { type: "string", maxLength: 40 },
          location: { type: "string", maxLength: 120 },
          githubUsername: { type: "string", minLength: 1, maxLength: 39 },
        },
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", maxLength: 128 },
          newPassword: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
      UpdateOrganizationRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          logo: { type: "string", format: "uri" },
          description: { type: "string", maxLength: 1000 },
          website: { type: "string", format: "uri" },
          timezone: { type: "string", maxLength: 80 },
          companySize: { type: "string", maxLength: 80 },
        },
      },
      UpdateOrganizationSettingsRequest: {
        type: "object",
        properties: {
          allowPublicInvites: { type: "boolean" },
          requireAdminApproval: { type: "boolean" },
          defaultMemberRole: { $ref: "#/components/schemas/UserRole" },
          aiEnabled: { type: "boolean" },
          githubIntegrationEnabled: { type: "boolean" },
          notificationsEnabled: { type: "boolean" },
        },
      },
      UpdateMemberStatusRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: { $ref: "#/components/schemas/UserStatus" },
        },
      },
      TransferOwnershipRequest: {
        type: "object",
        required: ["nextOwnerId"],
        properties: {
          nextOwnerId: { type: "string", format: "uuid" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      UpdateRoleRequest: {
        type: "object",
        required: ["role"],
        properties: { role: { $ref: "#/components/schemas/UserRole" } },
      },
      CreateTeamRequest: {
        type: "object",
        required: ["name", "leadId"],
        properties: {
          name: { type: "string" },
          description: { type: "string", nullable: true },
          leadId: { type: "string", format: "uuid" },
          memberIds: { type: "array", items: { type: "string", format: "uuid" } },
        },
      },
      UpdateTeamRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", nullable: true },
          leadId: { type: "string", format: "uuid" },
        },
      },
      MemberIdsRequest: {
        type: "object",
        required: ["memberIds"],
        properties: { memberIds: { type: "array", items: { type: "string", format: "uuid" } } },
      },
      CreateProjectRequest: {
        type: "object",
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          repositoryUrl: { type: "string", format: "uri" },
          deadline: { type: "string", format: "date-time" },
          teamId: { type: "string", format: "uuid" },
        },
      },
      UpdateProjectRequest: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          repositoryUrl: { type: "string", format: "uri" },
          deadline: { type: "string", format: "date-time" },
          status: { $ref: "#/components/schemas/ProjectStatus" },
          progress: { type: "integer", minimum: 0, maximum: 100 },
          healthScore: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      AssignTeamRequest: {
        type: "object",
        required: ["teamId"],
        properties: {
          teamId: { type: "string", format: "uuid" },
          deadline: { type: "string", format: "date-time" },
        },
      },
      CreateTaskRequest: {
        type: "object",
        required: ["title", "projectId", "assigneeId"],
        properties: {
          title: { type: "string" },
          description: { type: "string", nullable: true },
          projectId: { type: "string", format: "uuid" },
          assigneeId: { type: "string", format: "uuid" },
          priority: { $ref: "#/components/schemas/TaskPriority" },
          deadline: { type: "string", format: "date-time" },
        },
      },
      UpdateTaskRequest: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string", nullable: true },
          priority: { $ref: "#/components/schemas/TaskPriority" },
          deadline: { type: "string", format: "date-time" },
          status: { $ref: "#/components/schemas/TaskStatus" },
          progress: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      TaskStatusRequest: {
        type: "object",
        required: ["status"],
        properties: { status: { $ref: "#/components/schemas/TaskStatus" } },
      },
      TaskProgressRequest: {
        type: "object",
        required: ["progress"],
        properties: { progress: { type: "integer", minimum: 0, maximum: 100 } },
      },
      ReassignTaskRequest: {
        type: "object",
        required: ["assigneeId"],
        properties: { assigneeId: { type: "string", format: "uuid" } },
      },
      ConnectRepositoryRequest: {
        type: "object",
        required: ["projectId", "repositoryOwner", "repositoryName"],
        properties: {
          projectId: { type: "string", format: "uuid" },
          repositoryOwner: { type: "string", example: "atrifex" },
          repositoryName: { type: "string", example: "forge-backend" },
        },
      },
    },
  },
};

export const swaggerSpec = swaggerJSDoc({
  definition: swaggerDefinition,
  apis: [],
});

export const swaggerUiOptions = {
  explorer: true,
  customSiteTitle: "Forge AtriFex API Docs",
};

export default swaggerSpec;
