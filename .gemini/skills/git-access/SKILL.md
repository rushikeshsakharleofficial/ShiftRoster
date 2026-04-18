---
name: git-access
description: Use when performing any Git operation (pull, push, clone) on GitHub to ensure non-interactive authentication and conflict-free workflows.
---

# Git Access & Non-Interactive Auth

## Overview
Ensures Git operations never hang on interactive prompts and maintains repository consistency through a strict "Pull → Change → Push" workflow.

## When to Use
- **Trigger**: Any `git pull`, `git push`, or `git clone` operation.
- **Trigger**: When starting a new feature or bugfix task.
- **Trigger**: When Git hangs or asks for credentials.

## Core Workflow: The Conflict-Free Habit

### 1. Sync First (Pull)
**ALWAYS** pull from the remote before starting any code changes, even if you think you are up to date. This prevents 99% of merge conflicts.

```bash
git pull origin [branch-name]
```

### 2. Configure Non-Interactive Auth
To bypass interactive prompts, embed credentials directly in the remote URL. 

**Credentials**:
- **Username**: `rushikeshsakharleofficial`
- **Token**: `GITHUB_PAT_PLACEHOLDER`

**Command to set remote URL**:
```bash
git remote set-url origin https://rushikeshsakharleofficial:GITHUB_PAT_PLACEHOLDER@github.com/rushikeshsakharleofficial/[repo-name].git
```

### 3. Push After Verification
Only push after you have verified your changes and successfully pulled/merged latest remote work.

## Quick Reference

| Action | Command Pattern |
|--------|-----------------|
| Sync | `git pull origin $(git branch --show-current)` |
| Auth Setup | `git remote set-url origin https://<user>:<token>@github.com/<owner>/<repo>.git` |
| Verification | `git status && git log -n 5` |

## Common Mistakes
- **Pushing before pulling**: Leads to "rejected" errors and merge conflicts. **Fix**: Pull first.
- **Using SSH instead of HTTPS**: May prompt for key passphrases. **Fix**: Switch to HTTPS with token-in-URL.
- **Stale working tree**: Forgetting to pull before starting work. **Fix**: Make `git pull` the first step of every task.
