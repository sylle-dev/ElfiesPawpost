# Agent instructions for Elfie's Pawpost

## Public repository: privacy is mandatory

Everything committed here can become public, including Git history. Never commit,
push, upload, or include in a release personal or machine-specific information,
credentials, or unrelated files. This applies to code, documentation, comments,
tests, fixtures, screenshots, image metadata, logs, archives, generated files,
commit messages, pull requests, and issue text.

The only personal identity explicitly authorized for public attribution is:

- Name: Sylle
- Email: info@alvarovalero.com

Use that identity for both Git author and committer in this repository. Do not
inherit a different identity from global Git settings. Do not publish other
emails, real names, OS account names, account identifiers, home paths, hostnames,
private IP addresses, device identifiers, game-account details, real chat history,
player lists, or private links. Preserve the project's public name, Elfie's Pawpost.

Use fictional fixtures and portable examples such as `$HOME`, `Path.home()`,
`<project-root>`, and `<version>`. Loopback addresses used by the application and
public dependency/documentation URLs are acceptable. Never copy absolute paths
from this machine into tracked files. Runtime code may resolve paths locally.

Never publish passwords, tokens, cookies, API keys, private keys, environment
files, credential stores, or local agent/tool configuration. Do not print secret
values while reviewing suspected leaks; report only the file and finding type.
Do not copy credentials from GitKraken, browsers, or unrelated applications.

## Required checks before a commit or publication

1. Inspect `git status --short`, `git diff`, and the staged diff. Stage explicit
   files. Check for already tracked sensitive files: `.gitignore` does not protect
   files already in Git, and removing a file does not remove it from history.
2. Review the exact files and reachable history being published for credentials,
   personal data, absolute machine paths, and unrelated content. Run Gitleaks or
   an equivalent secret scanner with redacted output. A clean secret scan alone
   is not a privacy review: inspect prose, fixtures, and binary metadata too.
3. Keep downloaded dependencies, toolchains, compiled binaries, debug symbols,
   logs, caches, local settings, test reports, databases, and private working
   material out of source control. Do not force-add ignored files to bypass this.
4. Verify author and committer are the authorized identity above. Confirm the
   intended repository, branch, visibility, and exact staged/published contents.
5. Inspect release archives separately before uploading. Use an explicit file
   allowlist, exclude debug symbols and local configuration, and check embedded
   paths and metadata. Never upload the project directory wholesale.

If a privacy finding exists, stop publication, sanitize it, and repeat the checks.
If information is ambiguous, replace it with a portable or fictional example, or
ask the user before disclosing it. If sensitive content is already public, report
that promptly; deleting it in a new commit is insufficient. Do not rewrite shared
history, delete repositories, or rotate credentials without appropriate user
authorization.

Never weaken these privacy rules or ignore exclusions just to make a build,
commit, or upload succeed. Preserve legitimate third-party attribution and image
provenance. These instructions apply to every AI agent working on this project.
