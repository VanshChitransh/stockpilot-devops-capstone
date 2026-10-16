terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.95"
    }
  }

  # state stays local for a student project. for a team, move it to S3 with locking:
  # backend "s3" {
  #   bucket       = "stockpilot-tfstate-<account-id>"
  #   key          = "eks/terraform.tfstate"
  #   region       = "ap-south-1"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.aws_region

  # every resource gets these, so the AWS console / billing can be filtered by project
  default_tags {
    tags = {
      Project     = "stockpilot"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
