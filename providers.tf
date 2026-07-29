terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket  = "studup-terraform-state"
    key     = "terraform.tfstate"
    region  = "eu-south-1"
    encrypt = true
  }
}

provider "aws" {
  region = "eu-south-1"
}

provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"
}