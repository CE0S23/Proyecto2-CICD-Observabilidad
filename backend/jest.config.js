/** Jest: proyecto "unit" (servicios con mocks) y "api" (supertest contra PostgreSQL real). */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
};
module.exports = {
  projects: [
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\.spec\.ts$' },
    { ...base, displayName: 'api', rootDir: 'test', testRegex: '.*\.api-spec\.ts$' },
  ],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'jest-junit.xml', addFileAttribute: 'true' }],
  ],
};
