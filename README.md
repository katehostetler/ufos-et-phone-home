# UFOs ET Phone Home

## Project Structure

```
ufos-et-phone-home/
├── CLAUDE.md        # Project-level AI assistant instructions
├── CHANGELOG.md     # Log of all changes (updated with every commit)
├── README.md        # This file — project overview and setup
```

## Documentation Rules

- **CHANGELOG.md** is updated with every change
- **README.md** is updated whenever project structure or setup changes
- Both are included in the same commit as the related change

## AI Assistant Setup

This project uses a two-level CLAUDE.md configuration:

1. **Global** (`~/.claude/CLAUDE.md`) — applies to all sessions automatically via symlinks
2. **Project** (`./CLAUDE.md`) — project-specific rules loaded when working in this folder
