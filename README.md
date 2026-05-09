# UFOs ET Phone Home

## Project Structure

```
ufos-et-phone-home/
├── CLAUDE.md         # Project-level AI assistant instructions
├── CHANGELOG.md      # Log of all changes (updated with every commit)
├── README.md         # This file — project overview and setup
├── docs/
│   └── superpowers/
│       └── specs/    # Design specs for major features
└── .superpowers/     # Brainstorming artifacts (gitignored)
```

## What this is

A cinematic, interactive archive of the U.S. government's UFO/UAP document releases (starting with the 5/8/26 war.gov release). Built as a static site over a 3D rotating globe — pins colored by media type (video/photo/document), click any pin to see the full record. Data is pulled from the war.gov CSV manifest and geocoded; PDFs link back to the original gov URLs.

See `docs/superpowers/specs/2026-05-08-ufo-archive-design.md` for the full design.

## Documentation Rules

- **CHANGELOG.md** is updated with every change
- **README.md** is updated whenever project structure or setup changes
- Both are included in the same commit as the related change

## AI Assistant Setup

This project uses a two-level CLAUDE.md configuration:

1. **Global** (`~/.claude/CLAUDE.md`) — applies to all sessions automatically via symlinks
2. **Project** (`./CLAUDE.md`) — project-specific rules loaded when working in this folder
