# StudUp Infrastructure

Terraform-managed AWS infrastructure for the StudUp platform.

## Resources Managed

| Service | Resource | Region |
|---------|----------|--------|
| **S3** | `studup-website` (frontend hosting) | eu-south-1 |
| **S3** | `stud-up-profile-images` (user images) | eu-south-1 |
| **CloudFront** | CDN for `www.studup.net` | us-east-1 |
| **Lambda** | `DataHandler` (Node.js 24) | eu-south-1 |
| **API Gateway** | `dta-api-new`, `data-api`, `open-api-API` | eu-south-1 |
| **RDS** | PostgreSQL `dev` (db.t3.micro) | eu-south-1 |
| **Route53** | `studup.net` hosted zone | - |
| **ACM** | `*.studup.net` + `www.studup.net` certs | eu-south-1 / us-east-1 |
| **WAF** | Rate limiting (100 req/5min per IP) on all 3 API Gateways + CloudFront WAF (AWS managed rules: common, SQLi, XSS) | eu-south-1 / us-east-1 |
| **Secrets Manager** | DB password, JWT secret, email API key | eu-south-1 |
| **VPC** | Default VPC + `lambda-rds-sg` security group + S3 Gateway Endpoint | eu-south-1 |
| **Budgets** | Monthly cost budget with email alerts | us-east-1 |
| **IAM** | Lambda role + S3 profile images policy | eu-south-1 |

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6
- AWS CLI configured with credentials for account `672791741750`
- [AWS SSO](https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html) or access keys with sufficient permissions

## Quick Start

```bash
# 1. Export AWS credentials (SSO)
eval $(aws configure export-credentials --format env)

# 2. Create terraform.tfvars from example
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with actual secret values

# 3. Initialize (state stored in S3)
terraform init

# 4. See what would change
terraform plan

# 5. Apply changes
terraform apply
```

## First-Time Setup (Import Existing Resources)

If the infrastructure already exists in AWS, import it into Terraform state:

```bash
bash import.sh
terraform plan  # should show no changes
```

## Project Structure

```
studup-infrastructure/
├── providers.tf          # AWS providers + S3 backend
├── variables.tf          # Input variables
├── data.tf               # Data sources (VPC, subnets)
├── s3.tf                 # S3 buckets + versioning + encryption
├── cloudfront.tf         # CloudFront distribution
├── lambda.tf             # Lambda function + IAM role + SG
├── api-gateway.tf        # 3 REST APIs + custom domains
├── rds.tf                # PostgreSQL database
├── route53.tf            # DNS zone + records
├── acm.tf                # SSL/TLS certificates
├── waf.tf                # Web ACL + associations
├── secrets-manager.tf    # Secrets
├── budget.tf             # Monthly cost budget + email alerts
├── outputs.tf            # Output values
├── import.sh             # Script to import existing resources
└── terraform.tfvars.example  # Variable template
```

## Making Changes

1. Edit the relevant `.tf` file
2. Run `terraform plan` to preview
3. Run `terraform apply` to apply

State is stored remotely in S3 (`studup-terraform-state`) — no manual state file management needed.

## Secrets

Secrets are never stored in version control:
- **Local**: `terraform.tfvars` (gitignored)
- **CI**: GitHub Actions Secrets
- **Production**: AWS Secrets Manager (Lambda fetches at cold start)