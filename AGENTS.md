# AGENTS.md - obsman

## What is obsman?

`obsman` is a CLI tool for managing Nicolay's Obsidian vault. It creates structured notes with proper frontmatter and backmatter based on templates defined in `templates.yml`.

## Project Structure

```
obsman/
├── src/
│   └── index.ts          # Main CLI logic
├── templates.yml         # Vault configuration and templates
├── package.json          # Bun package config
├── README.md            # User documentation
└── AGENTS.md            # This file - for AI agents
```

## How It Works

1. **Templates are in the repo** at `templates.yml` (not in the vault)
2. All commands read from `templates.yml` to know:
   - Vault path (`vaultPath`)
   - Folder structure (`areasRoot`, `projectsRoot`, etc.)
   - Templates for each entity type
3. Templates use `{{variables}}` that get replaced at runtime:
   - `{{title}}` - Human title
   - `{{slug}}` - Filesystem-safe slug
   - `{{date}}` - Today's date (YYYY-MM-DD)
   - `{{area}}` - Area name (for posts)
   - `{{cursor}}` - Removed after rendering (for editor positioning)

## Current Templates

### Single-file templates (create one .md file)
- **post**: Blog posts in `01_areas/<area>/`
- **resource**: Resource notes in `02_resources/`

### Multi-file templates (create folders with multiple files)
- **project**: Projects in `00_projects/<slug>/` with index.md, quicklinks.md, notes/
- **area**: Areas in `01_areas/<slug>/` with index.md, quicklinks.md

## Building & Installing

```bash
# Build
bun run build

# Install globally
bun link --force

# Test
obsman new post "Test" --area personal_blog
```

## Adding a New Command

When adding a new template type or command:

1. **Add template to `templates.yml`**
   ```yaml
   templates:
     yourtype:
       filePath: "path/to/{{slug}}.md"
       template: |
         ---
         created_date: {{date}}
         ---
         Content here
   ```

2. **Update `printUsage()` in `src/index.ts`**
   - Add the new type to the "Types:" section
   - Add an example to the "Examples:" section
   - Document any new options

3. **Update `README.md`**
   - Add example usage
   - Document the template structure

4. **Rebuild and test**
   ```bash
   bun run build
   bun link --force
   obsman new yourtype "Test Title"
   ```

## Code Conventions

- Use Bun for package management and building
- TypeScript with strict mode
- Templates use YAML format
- All file paths are absolute (constructed from `vaultPath`)
- Date format: `YYYY-MM-DD`
- Slugs: lowercase, hyphen-separated

## Testing

Test each template type after changes:
```bash
cd /Users/nicolaygerold/code/personal/obsman

obsman new post "Test Post" --area personal_blog
obsman new resource "Test Resource"
obsman new project "Test Project"
obsman new area "Test Area"
```

Verify files are created in the correct locations with proper frontmatter.

## Common Tasks

### Update vault path
Edit `vaultPath` in `templates.yml`

### Modify template structure
Edit the relevant template in `templates.yml`, then rebuild

### Add new frontmatter field
Add to the template YAML frontmatter section

### Change default area for posts
Modify the default in `createEntity()` function where `area: options.area || 'personal_blog'`

## Important Notes

- Templates MUST be run from the obsman directory (or have templates.yml in cwd)
- Always rebuild after changing TypeScript: `bun run build`
- Global link updates automatically after rebuild with `bun link --force`
- The CLI reads `templates.yml` at runtime, so vault path changes don't require rebuild
- Template changes don't require rebuild (YAML is parsed at runtime)
- Code changes DO require rebuild
