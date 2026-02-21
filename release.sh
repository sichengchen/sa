# 1. Bump version (updates package.json with CalVer)
bun run version:bump

# 2. Commit the version bump
git add package.json
git commit -m "chore: bump version to v$(jq -r .version package.json)"

# 3. Tag and push
git tag "v$(jq -r .version package.json)"
git push && git push --tags