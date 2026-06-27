/** @type {import('jest').Config} */
export default {
	preset: 'ts-jest',
	testEnvironment: 'jest-environment-jsdom',
	moduleNameMapper: {
		// Stub out the obsidian package so tests don't need a real Obsidian runtime
		'^obsidian$': '<rootDir>/src/__mocks__/obsidian.ts',
	},
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', useESM: false }],
	},
	extensionsToTreatAsEsm: [],
	testMatch: ['**/src/__tests__/**/*.test.ts'],
};
