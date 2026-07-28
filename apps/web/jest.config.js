/**
 * Unit tests for the framework-free parts of the web app: the shared authorization
 * helpers and the navigation policy they drive.
 *
 * `jest` and `ts-jest` are already hoisted to the workspace root by apps/api, so this
 * needs no extra dependency. No jsdom environment is required because nothing under test
 * renders React.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testRegex: '.*\\.spec\\.tsx?$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          jsx: 'react-jsx',
          target: 'es2020',
        },
      },
    ],
  },
};
