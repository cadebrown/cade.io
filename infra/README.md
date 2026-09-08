# Infrastructure

This repo uses OpenTofu to manage Cloudflare Pages infrastructure (project + apex domain).

## Scope

* Cloudflare Pages project (`cade-io`)
* Apex custom domain (`cade.io`)

## Prerequisites

* OpenTofu installed (`tofu`)
* Cloudflare API token with least-privilege permissions

## Token permissions (minimum)

* Account: Cloudflare Pages - Edit
* Zone: Zone - Read
* Zone: DNS - Edit

## Setup (simple)

```sh
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars
```

Edit `infra/cloudflare/terraform.tfvars`:

* `account_id = "YOUR_CLOUDFLARE_ACCOUNT_ID"`
* `github_owner = "YOUR_GITHUB_USER_OR_ORG"`

Then:

```sh
export CLOUDFLARE_API_TOKEN="..."
tofu init
tofu plan
tofu apply
```

## File layout

All OpenTofu config for this site lives in a single file:

* `infra/cloudflare/main.tf`

## What this does

* Creates/updates the Cloudflare Pages project `cade-io`
* Binds the apex custom domain `cade.io` to the Pages project

## What to commit vs ignore

Commit:

* `infra/cloudflare/main.tf`
* `infra/cloudflare/terraform.tfvars.example`
* `infra/cloudflare/.terraform.lock.hcl`

Do not commit (already ignored in `.gitignore`):

* `infra/cloudflare/terraform.tfvars`
* `infra/cloudflare/.terraform/`
* `infra/cloudflare/*.tfstate` and backups

## Notes

* No GitHub Actions workflow is required for deployments.
* Pages runs `npm run validate:ci`, matching `pages_build_command` in the managed
  configuration. This includes formatting, type checks, build, unit tests, and
  desktop/mobile browser tests before publishing.
  Browser installation runs without `--with-deps` because Pages does not permit
  sudo. On a new self-managed Linux runner, provision Playwright's system
  dependencies with `npx playwright install-deps chromium` before running CI.
* `.node-version` pins Node 24.20.0. A broad `24` previously selected 24.13.1
  in Pages, which cannot install the project's npm 12.0.2 (requires Node 24.15+).
  Keep the pin and `package.json` engine requirement compatible with npm.
