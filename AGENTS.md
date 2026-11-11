# Release process

When asked to release a version that includes branch changes:

1. Open a pull request from each relevant feature branch into `main` and merge it. Release from `main` so GitHub's generated **What's Changed** notes can include merged PRs.
2. Update and push `main` before tagging. Use the next requested version in the `vX.Y.Z` form, for example `v1.12.3`.
3. Push the tag to trigger `.github/workflows/release.yml`:

   ```sh
   git switch main
   git pull
   git tag -a vX.Y.Z -m 'Release vX.Y.Z'
   git push origin vX.Y.Z
   ```

4. Check the GitHub Actions run and confirm the GitHub release contains `sealhud-vX.Y.Z.zip`. ZIP contains static frontend files for a web server.

The workflow runs on any pushed tag matching `v*`; it does not enforce that the tagged commit is on `main`. Always use `main` for releases with PR-based change notes. Workflow uses `gh release create --generate-notes`; GitHub derives **What's Changed** from merged PRs and commits between releases. Prefer PRs with clear titles for entries to appear in that section.
