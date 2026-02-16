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

## What this does

* Creates/updates the Cloudflare Pages project `cade-io`
* Binds the apex custom domain `cade.io` to the Pages project

## What to commit vs ignore

Commit:

* `infra/cloudflare/*.tf`
* `infra/cloudflare/terraform.tfvars.example`
* `infra/cloudflare/.terraform.lock.hcl`

Do not commit (already ignored in `.gitignore`):

* `infra/cloudflare/terraform.tfvars`
* `infra/cloudflare/.terraform/`
* `infra/cloudflare/*.tfstate` and backups

## Notes

* No GitHub Actions workflow is required for deployments.
