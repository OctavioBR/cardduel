#!/usr/bin/env bash
# Posts the PR Preview comment on PR $PR_NUMBER, or edits it if it already exists.
# Usage: pr-preview-comment.sh <body> [--only-update]
# The body must start with $COMMENT_MARKER, which is how later runs find the comment.
set -euo pipefail

body="$1"
only_update="${2:-}"
repo="$GITHUB_REPOSITORY"

id=$(gh api --paginate "repos/$repo/issues/$PR_NUMBER/comments" \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"$COMMENT_MARKER\"))) | .id" |
  head -n 1)

if [ -n "$id" ]; then
  gh api --method PATCH "repos/$repo/issues/comments/$id" -f body="$body" > /dev/null
  echo "Edited comment $id."
elif [ "$only_update" = "--only-update" ]; then
  echo "No PR Preview comment to update."
else
  gh api --method POST "repos/$repo/issues/$PR_NUMBER/comments" -f body="$body" > /dev/null
  echo "Posted the PR Preview comment."
fi
