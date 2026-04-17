#!/bin/bash
# Configures Git user and authentication.

# Exit immediately if a command exits with a non-zero status.
set -e

USERNAME="rushikeshsakharleofficial"
EMAIL="rishiananya123@gmail.com"

echo "Configuring Git with user: $USERNAME and email: $EMAIL..."

# Configure git user name and email
git config --global user.name "$USERNAME"
git config --global user.email "$EMAIL"

echo "Checking for GITHUB_TOKEN environment variable..."

# Check for token in env var
if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: The GITHUB_TOKEN environment variable is not set."
  echo "Please set it to your GitHub Personal Access Token."
  exit 1
fi

echo "Configuring Git to use GITHUB_TOKEN for authentication..."

# Configure git to use the token for HTTPS authentication with GitHub
git config --global http.https://github.com/.extraheader "AUTHORIZATION: bearer $GITHUB_TOKEN"

echo "Git configuration complete."
echo "Git will now use your token for authentication with github.com."
