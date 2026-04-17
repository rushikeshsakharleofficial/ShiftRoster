---
name: git-access
description: Configures Git with a user's name, email, and a GitHub token for authentication. Use when setting up or verifying git credentials.
---

# Git Access Configuration

This skill configures Git to use a specific username, email, and a GitHub Personal Access Token for authentication.

## Usage

The primary way to use this skill is by executing the bundled script.

### `scripts/configure-git.sh`

This script performs the following actions:
1.  Sets the global `user.name` to "rushikeshsakharleofficial".
2.  Sets the global `user.email` to "rishiananya123@gmail.com".
3.  Checks for the `GITHUB_TOKEN` environment variable.
4.  Configures Git to use the `GITHUB_TOKEN` for all HTTPS requests to `github.com`.

### Workflow

When the user asks to set up or configure Git, follow these steps:

1.  **Verify Intent**: Confirm that the user wants to set their global Git identity and authentication token.
2.  **Check Environment**: Remind the user that they must have the `GITHUB_TOKEN` environment variable set with a valid GitHub Personal Access Token before running the script.
3.  **Execute Script**: Run the `scripts/configure-git.sh` script to apply the configuration.
4.  **Confirm**: Report the success or failure message from the script back to the user.
