# Contributing to @boldvideo/bold-js

First off, thank you for considering contributing to Bold JS! It's people like you that make Bold JS such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- Use a clear and descriptive title
- Describe the exact steps to reproduce the problem
- Provide specific examples to demonstrate the steps
- Describe the behavior you observed and what behavior you expected
- Include your environment details (Node.js version, OS, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- Use a clear and descriptive title
- Provide a step-by-step description of the suggested enhancement
- Provide specific examples to demonstrate the use case
- Explain why this enhancement would be useful to most users

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure the test suite passes (`pnpm run lint && pnpm run build`)
4. Make sure your code follows the existing code style
5. Create a changeset for your changes:
   ```bash
   pnpm changeset
   ```
6. Push your branch and submit a pull request

## Development Setup

1. Fork and clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/bold-js.git
   cd bold-js
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Make your changes and run the build:
   ```bash
   pnpm run build
   pnpm run lint
   ```

## Changesets

We use [changesets](https://github.com/changesets/changesets) to manage versions and changelogs. When you make a change:

1. Run `pnpm changeset`
2. Select the type of change (patch/minor/major)
3. Describe your changes for the changelog
4. Commit the generated changeset file along with your changes

## Style Guide

- Use TypeScript for all new code
- Follow the existing code style (enforced by TypeScript compiler)
- Write clear, self-documenting code
- Add comments only when necessary to explain "why" not "what"
- Keep functions small and focused
- Use meaningful variable and function names

## Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Release Process (Maintainers Only)

Releases are automated through GitHub Actions:

1. When PRs with changesets are merged to main, a "Version Packages" PR is created
2. Review and merge the version PR to trigger a release
3. The workflow will automatically:
   - Publish to npm
   - Create a GitHub release
   - Update the changelog

## Questions?

Feel free to open an issue with your question or reach out to the maintainers directly.