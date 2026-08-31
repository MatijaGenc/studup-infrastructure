terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
  }

  backend "s3" {
    bucket         = "studup-terraform-state"
    key            = "terraform.tfstate"
    region         = "eu-south-1"
    encrypt        = true
    dynamodb_table = "studup-terraform-state-lock"
  }
}

resource "aws_dynamodb_table" "terraform_state_lock" {
  name         = "studup-terraform-state-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = "studup-terraform-state-lock"
    Environment = "production"
  }
}

provider "aws" {
  region = "eu-south-1"
}

provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"
}