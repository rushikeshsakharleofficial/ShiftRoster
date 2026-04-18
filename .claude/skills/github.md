---
name: GitHub
description: Git and GitHub operations — commit, push, merge, PR, branch management for ShiftRoster
---

## GitHub Skill

Handles all git/GitHub operations for ShiftRoster. Uses credentials from memory.

### Credentials (from memory)
- **Repo**: `https://github.com/rushikeshsakharleofficial/ShiftRoster.git`
- **Account**: `rushikeshsakharleofficial`
- **PAT**: stored in project memory (`reference_github_repo.md`)
- **Git identity**: `user.email=rishiananya123@gmail.com`, `user.name=Rushikesh`
- **Active dev branch**: `beta-testing` | **Stable**: `master`

### Push pattern
```bash
git push https://rushikeshsakharleofficial:<PAT>@github.com/rushikeshsakharleofficial/ShiftRoster.git <branch>
```

### Commit
```bash
git add <files>
git -c user.email="rishiananya123@gmail.com" -c user.name="Rushikesh" commit -m "type(scope): message

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Merge beta-testing → master
**Always ask user before merging.**
```bash
git checkout master
git merge beta-testing --no-edit
git push <PAT-url> master
git checkout beta-testing
```

### Standard Workflow
1. Make changes on `beta-testing`
2. Commit with correct identity
3. Push `beta-testing`
4. Update code-review-graph: `build_or_update_graph_tool(full_rebuild=false, postprocess="minimal")`
5. Ask user: "Merge beta-testing → master?"
6. On yes: merge + push master

### Rules
- **Never auto-merge** — always confirm with user first
- Always use `rishiananya123@gmail.com` as commit email
- After every commit: run graph incremental update
- Use code-review-graph tools before making changes (graph-first)
