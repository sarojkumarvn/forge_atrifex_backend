export default {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: ["src/**/*.js", "!src/generated/**"],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 180000,
};
