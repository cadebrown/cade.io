variable "account_id" {
  description = "Cloudflare account ID that owns the zone and Pages project."
  type        = string
}

variable "zone_name" {
  description = "Zone name (apex domain) for this site."
  type        = string
  default     = "cade.io"
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name."
  type        = string
  default     = "cade-io"
}

variable "pages_custom_domain" {
  description = "Custom domain to bind to the Pages project."
  type        = string
  default     = "cade.io"
}

variable "pages_production_branch" {
  description = "Git branch used for production deploys."
  type        = string
  default     = "main"
}

variable "github_owner" {
  description = "GitHub org or user that owns the repo."
  type        = string
}

variable "github_repo" {
  description = "GitHub repo name for the Pages project."
  type        = string
  default     = "cade.io"
}

variable "pages_build_command" {
  description = "Build command used by Cloudflare Pages."
  type        = string
  default     = "npm run build"
}

variable "pages_destination_dir" {
  description = "Output directory for the build."
  type        = string
  default     = "dist"
}

variable "pages_root_dir" {
  description = "Root directory for the Pages build (empty means repo root)."
  type        = string
  default     = ""
}
