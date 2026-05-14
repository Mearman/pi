import hostedGitInfo from "hosted-git-info";

/**
 * Parsed git URL information.
 */
export type GitSource = {
	/** Always "git" for git sources */
	type: "git";
	/** Clone URL (always valid for git clone, without ref suffix) */
	repo: string;
	/** Git host domain (e.g., "github.com") */
	host: string;
	/** Repository path (e.g., "user/repo") */
	path: string;
	/** Git ref (branch, tag, commit) if specified */
	ref?: string;
	/** True if ref was specified (package won't be auto-updated) */
	pinned: boolean;
	/** Subdirectory within the repo to use as the package root */
	subpath?: string;
};

/**
 * Extract and remove a `#` fragment from a git URL.
 * Fragments containing '/' are treated as subpaths (subdirectory within the repo).
 * Fragments without '/' are returned as refs (committish) so the caller can
 * pass them to hosted-git-info.
 */
function splitFragment(url: string): { url: string; subpath?: string; fragmentRef?: string } {
	// For protocol URLs, use URL parsing
	if (url.includes("://")) {
		try {
			const parsed = new URL(url);
			const fragment = parsed.hash.slice(1); // Remove leading '#'
			if (fragment) {
				parsed.hash = "";
				const cleanUrl = parsed.toString().replace(/\/$/, "");
				if (fragment.includes("/")) {
					return { url: cleanUrl, subpath: fragment };
				}
				return { url: cleanUrl, fragmentRef: fragment };
			}
		} catch {
			// Not a valid URL, fall through
		}
	}

	// For shorthand and scp-like URLs, find the last '#'
	const hashIndex = url.lastIndexOf("#");
	if (hashIndex < 0) return { url };
	const fragment = url.slice(hashIndex + 1);
	if (!fragment) return { url: url.slice(0, hashIndex) };

	const cleanUrl = url.slice(0, hashIndex);
	if (fragment.includes("/")) {
		return { url: cleanUrl, subpath: fragment };
	}
	// Single-word fragment like `#v1.0.0` — treat as committish
	return { url: cleanUrl, fragmentRef: fragment };
}

function splitRef(url: string): { repo: string; ref?: string } {
	const scpLikeMatch = url.match(/^git@([^:]+):(.+)$/);
	if (scpLikeMatch) {
		const pathWithMaybeRef = scpLikeMatch[2] ?? "";
		const refSeparator = pathWithMaybeRef.indexOf("@");
		if (refSeparator < 0) return { repo: url };
		const repoPath = pathWithMaybeRef.slice(0, refSeparator);
		const ref = pathWithMaybeRef.slice(refSeparator + 1);
		if (!repoPath || !ref) return { repo: url };
		return {
			repo: `git@${scpLikeMatch[1] ?? ""}:${repoPath}`,
			ref,
		};
	}

	if (url.includes("://")) {
		try {
			const parsed = new URL(url);
			const pathWithMaybeRef = parsed.pathname.replace(/^\/+/, "");
			const refSeparator = pathWithMaybeRef.indexOf("@");
			if (refSeparator < 0) return { repo: url };
			const repoPath = pathWithMaybeRef.slice(0, refSeparator);
			const ref = pathWithMaybeRef.slice(refSeparator + 1);
			if (!repoPath || !ref) return { repo: url };
			parsed.pathname = `/${repoPath}`;
			return {
				repo: parsed.toString().replace(/\/$/, ""),
				ref,
			};
		} catch {
			return { repo: url };
		}
	}

	const slashIndex = url.indexOf("/");
	if (slashIndex < 0) {
		return { repo: url };
	}
	const host = url.slice(0, slashIndex);
	const pathWithMaybeRef = url.slice(slashIndex + 1);
	const refSeparator = pathWithMaybeRef.indexOf("@");
	if (refSeparator < 0) {
		return { repo: url };
	}
	const repoPath = pathWithMaybeRef.slice(0, refSeparator);
	const ref = pathWithMaybeRef.slice(refSeparator + 1);
	if (!repoPath || !ref) {
		return { repo: url };
	}
	return {
		repo: `${host}/${repoPath}`,
		ref,
	};
}

function parseGenericGitUrl(url: string): GitSource | null {
	const { repo: repoWithoutRef, ref } = splitRef(url);
	let repo = repoWithoutRef;
	let host = "";
	let path = "";

	const scpLikeMatch = repoWithoutRef.match(/^git@([^:]+):(.+)$/);
	if (scpLikeMatch) {
		host = scpLikeMatch[1] ?? "";
		path = scpLikeMatch[2] ?? "";
	} else if (
		repoWithoutRef.startsWith("https://") ||
		repoWithoutRef.startsWith("http://") ||
		repoWithoutRef.startsWith("ssh://") ||
		repoWithoutRef.startsWith("git://")
	) {
		try {
			const parsed = new URL(repoWithoutRef);
			host = parsed.hostname;
			path = parsed.pathname.replace(/^\/+/, "");
		} catch {
			return null;
		}
	} else {
		const slashIndex = repoWithoutRef.indexOf("/");
		if (slashIndex < 0) {
			return null;
		}
		host = repoWithoutRef.slice(0, slashIndex);
		path = repoWithoutRef.slice(slashIndex + 1);
		if (!host.includes(".") && host !== "localhost") {
			return null;
		}
		repo = `https://${repoWithoutRef}`;
	}

	const normalizedPath = path.replace(/\.git$/, "").replace(/^\/+/, "");
	if (!host || !normalizedPath || normalizedPath.split("/").length < 2) {
		return null;
	}

	return {
		type: "git",
		repo,
		host,
		path: normalizedPath,
		ref,
		pinned: Boolean(ref),
	};
}

/**
 * Parse git source into a GitSource.
 *
 * Rules:
 * - With git: prefix, accept all historical shorthand forms.
 * - Without git: prefix, only accept explicit protocol URLs.
 */
export function parseGitUrl(source: string): GitSource | null {
	const trimmed = source.trim();
	const hasGitPrefix = trimmed.startsWith("git:");
	const urlWithFragment = hasGitPrefix ? trimmed.slice(4).trim() : trimmed;

	if (!hasGitPrefix && !/^(https?|ssh|git):\/\//i.test(urlWithFragment)) {
		return null;
	}

	// Extract subpath fragment (#path/to/subdir) before parsing ref
	const { url, subpath, fragmentRef } = splitFragment(urlWithFragment);

	const split = splitRef(url);
	// Use @ref first, then #fragment ref
	const effectiveRef = split.ref ?? fragmentRef;

	const hostedCandidates = [effectiveRef ? `${split.repo}#${effectiveRef}` : undefined, url].filter(
		(value): value is string => Boolean(value),
	);
	for (const candidate of hostedCandidates) {
		const info = hostedGitInfo.fromUrl(candidate);
		if (info) {
			if (effectiveRef && info.project?.includes("@")) {
				continue;
			}
			const useHttpsPrefix =
				!split.repo.startsWith("http://") &&
				!split.repo.startsWith("https://") &&
				!split.repo.startsWith("ssh://") &&
				!split.repo.startsWith("git://") &&
				!split.repo.startsWith("git@");
			return {
				type: "git",
				repo: useHttpsPrefix ? `https://${split.repo}` : split.repo,
				host: info.domain || "",
				path: `${info.user}/${info.project}`.replace(/\.git$/, ""),
				ref: info.committish || effectiveRef || undefined,
				pinned: Boolean(info.committish || effectiveRef),
				subpath,
			};
		}
	}

	const httpsCandidates = [
		effectiveRef ? `https://${split.repo}#${effectiveRef}` : undefined,
		`https://${url}`,
	].filter((value): value is string => Boolean(value));
	for (const candidate of httpsCandidates) {
		const info = hostedGitInfo.fromUrl(candidate);
		if (info) {
			if (effectiveRef && info.project?.includes("@")) {
				continue;
			}
			return {
				type: "git",
				repo: `https://${split.repo}`,
				host: info.domain || "",
				path: `${info.user}/${info.project}`.replace(/\.git$/, ""),
				ref: info.committish || effectiveRef || undefined,
				pinned: Boolean(info.committish || effectiveRef),
				subpath,
			};
		}
	}

	const result = parseGenericGitUrl(url);
	if (result) {
		return { ...result, subpath };
	}
	return null;
}
