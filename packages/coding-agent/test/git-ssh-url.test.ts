import { describe, expect, it } from "vitest";
import { parseGitUrl } from "../src/utils/git.ts";

describe("Git URL Parsing", () => {
	describe("protocol URLs (accepted without git: prefix)", () => {
		it("should parse HTTPS URL", () => {
			const result = parseGitUrl("https://github.com/user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
			});
		});

		it("should parse ssh:// URL", () => {
			const result = parseGitUrl("ssh://git@github.com/user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "ssh://git@github.com/user/repo",
			});
		});

		it("should parse protocol URL with ref", () => {
			const result = parseGitUrl("https://github.com/user/repo@v1.0.0");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				ref: "v1.0.0",
				repo: "https://github.com/user/repo",
			});
		});

		it("should parse HTTPS URL with subpath fragment", () => {
			const result = parseGitUrl("https://github.com/user/repo#packages/coding-agent/examples/extensions/subagent");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
				subpath: "packages/coding-agent/examples/extensions/subagent",
			});
		});

		it("should parse HTTPS URL with ref and subpath", () => {
			const result = parseGitUrl("https://github.com/user/repo@v1#packages/extension");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				ref: "v1",
				repo: "https://github.com/user/repo",
				subpath: "packages/extension",
				pinned: true,
			});
		});
	});

	describe("shorthand URLs (accepted only with git: prefix)", () => {
		it("should parse git@host:path with git: prefix", () => {
			const result = parseGitUrl("git:git@github.com:user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "git@github.com:user/repo",
			});
		});

		it("should parse host/path shorthand with git: prefix", () => {
			const result = parseGitUrl("git:github.com/user/repo");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
			});
		});

		it("should parse shorthand with ref and git: prefix", () => {
			const result = parseGitUrl("git:git@github.com:user/repo@v1.0.0");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				ref: "v1.0.0",
				repo: "git@github.com:user/repo",
			});
		});

		it("should parse host/path shorthand with subpath", () => {
			const result = parseGitUrl("git:github.com/user/repo#packages/extension");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
				subpath: "packages/extension",
			});
		});

		it("should parse shorthand with ref and subpath", () => {
			const result = parseGitUrl("git:github.com/user/repo@v1#packages/extension");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				ref: "v1",
				repo: "https://github.com/user/repo",
				subpath: "packages/extension",
				pinned: true,
			});
		});

		it("should parse git@host:path with subpath", () => {
			const result = parseGitUrl("git:git@github.com:user/repo#packages/extension");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "git@github.com:user/repo",
				subpath: "packages/extension",
			});
		});
	});

	describe("subpath edge cases", () => {
		it("should not extract subpath when fragment has no slashes (looks like a ref)", () => {
			const result = parseGitUrl("git:github.com/user/repo#v1.0.0");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
				ref: "v1.0.0",
				pinned: true,
			});
			expect(result?.subpath).toBeUndefined();
		});

		it("should not extract subpath when fragment is empty", () => {
			const result = parseGitUrl("git:github.com/user/repo#");
			expect(result).toMatchObject({
				host: "github.com",
				path: "user/repo",
				repo: "https://github.com/user/repo",
			});
			expect(result?.subpath).toBeUndefined();
		});

		it("should not set subpath when no fragment present", () => {
			const result = parseGitUrl("git:github.com/user/repo");
			expect(result?.subpath).toBeUndefined();
		});

		it("should handle deeply nested subpath", () => {
			const result = parseGitUrl(
				"https://github.com/earendil-works/pi-mono#packages/coding-agent/examples/extensions/subagent",
			);
			expect(result).toMatchObject({
				host: "github.com",
				path: "earendil-works/pi-mono",
				subpath: "packages/coding-agent/examples/extensions/subagent",
			});
		});
	});

	describe("unsupported without git: prefix", () => {
		it("should reject git@host:path without git: prefix", () => {
			expect(parseGitUrl("git@github.com:user/repo")).toBeNull();
		});

		it("should reject host/path shorthand without git: prefix", () => {
			expect(parseGitUrl("github.com/user/repo")).toBeNull();
		});

		it("should reject user/repo shorthand", () => {
			expect(parseGitUrl("user/repo")).toBeNull();
		});
	});
});
