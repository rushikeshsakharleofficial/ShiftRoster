#!/bin/bash
# Configures Git for non-interactive authentication.

set -e

USERNAME="rushikeshsakharleofficial"
TOKEN="GITHUB_PAT_PLACEHOLDER"
EMAIL="rishiananya123@gmail.com"

echo "Setting global Git user..."
git config --global user.name "$USERNAME"
git config --global user.email "$EMAIL"

# Detect the current remote URL
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

if [[ -n "$CURRENT_REMOTE" ]]; then
    echo "Current remote: $CURRENT_REMOTE"
    
    # Check if already authenticated with token
    if [[ "$CURRENT_REMOTE" == *"$TOKEN"* ]]; then
        echo "Git is already configured with token-based URL."
    else
        # Construct the new URL
        # Strip existing auth if present (user:pass@ or user@)
        CLEAN_URL=$(echo "$CURRENT_REMOTE" | sed -E 's/https?:\/\/[^@]+@/https:\/\//')
        
        # Insert new auth
        AUTH_URL=$(echo "$CLEAN_URL" | sed -E "s|https?://|https://$USERNAME:$TOKEN@|")
        
        echo "Updating origin to use non-interactive authentication..."
        git remote set-url origin "$AUTH_URL"
        echo "Remote updated."
    fi
else
    echo "Warning: No 'origin' remote found. Run this inside a git repository."
fi

echo "Git configuration complete."
