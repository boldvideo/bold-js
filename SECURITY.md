# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within Bold JS, please send an email to security@boldvideo.com. All security vulnerabilities will be promptly addressed.

Please do not report security vulnerabilities through public GitHub issues.

When reporting a vulnerability, please include:

- The version of @boldvideo/bold-js you're using
- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any suggested fixes (if applicable)

## Security Measures

### NPM Publishing

- Releases are automated through GitHub Actions
- NPM tokens are stored as encrypted GitHub secrets
- Only maintainers with write access can trigger releases
- All releases include npm provenance for supply chain security

### Dependencies

- Dependencies are regularly updated via Dependabot
- Security advisories are monitored through GitHub's security features
- Minimal dependencies to reduce attack surface (only axios as runtime dependency)

### Code Review

- All changes require pull request reviews
- CI checks must pass before merging
- Type safety enforced through TypeScript

## Best Practices for Users

When using @boldvideo/bold-js:

1. **Keep your API keys secure**
   - Never commit API keys to version control
   - Use environment variables for API keys
   - Rotate keys regularly

2. **Stay updated**
   - Regularly update to the latest version
   - Monitor security advisories
   - Review the changelog for security updates

3. **Validate input**
   - Always validate and sanitize user input before passing to the SDK
   - Be cautious with data from external sources

## Acknowledgments

We appreciate responsible disclosure of security vulnerabilities and will acknowledge researchers who report issues (with their permission).