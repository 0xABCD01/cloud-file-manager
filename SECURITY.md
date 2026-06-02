# Security Policy

## Reporting a vulnerability

If you find a security issue, **do not open a public GitHub issue.**

Email me at: `security@cloudvault.dev` (or DM me on GitHub: [@0xABCD01](https://github.com/0xABCD01))

I'll acknowledge within 48 hours and aim to ship a fix within 7 days for critical issues.

## Scope

Anything in the `backend/app/` directory that handles:
- Authentication or authorization
- File upload, storage, or download
- Path resolution or filename handling
- Share link generation or resolution
- Permission checks

## Out of scope

- Social engineering
- Denial of service
- Issues in third-party dependencies (report upstream)
- Issues that require physical access to the server

## What I care about

- Path traversal (can you escape the upload directory?)
- Auth bypass (can you access someone else's files?)
- Injection (SQL, XSS through file previews, command injection)
- Token handling (replay attacks, brute force, information leakage)
- File type confusion (can you upload a malicious file that gets served unsafely?)

## Recognition

I'll credit reporters in the changelog unless they prefer anonymity.
