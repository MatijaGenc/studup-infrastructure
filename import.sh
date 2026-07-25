#!/bin/bash
set -e

eval $(aws configure export-credentials --format env)

TF_DIR="/Users/danieltosic/Projects/studup-infrastructure"
cd "$TF_DIR"

echo "=== Importing existing AWS resources ==="

# S3 Buckets
terraform import aws_s3_bucket.website studup-website || echo "SKIP: studup-website"
terraform import aws_s3_bucket.profile_images stud-up-profile-images || echo "SKIP: stud-up-profile-images"

# S3 Bucket Versioning
terraform import aws_s3_bucket_versioning.website studup-website || echo "SKIP"
terraform import aws_s3_bucket_versioning.profile_images stud-up-profile-images || echo "SKIP"

# S3 Bucket Encryption
terraform import aws_s3_bucket_server_side_encryption_configuration.website studup-website || echo "SKIP"
terraform import aws_s3_bucket_server_side_encryption_configuration.profile_images stud-up-profile-images || echo "SKIP"

# S3 Website Config
terraform import aws_s3_bucket_website_configuration.website studup-website || echo "SKIP"

# S3 Public Access Block
terraform import aws_s3_bucket_public_access_block.website studup-website || echo "SKIP"
terraform import aws_s3_bucket_public_access_block.profile_images stud-up-profile-images || echo "SKIP"

# S3 Lifecycle
terraform import aws_s3_bucket_lifecycle_configuration.website studup-website || echo "SKIP"
terraform import aws_s3_bucket_lifecycle_configuration.profile_images stud-up-profile-images || echo "SKIP"

# ACM Certificates
terraform import aws_acm_certificate.studup_wildcard arn:aws:acm:eu-south-1:672791741750:certificate/$(aws acm list-certificates --region eu-south-1 --query "CertificateSummaryList[?DomainName=='*.studup.net'].CertificateArn" --output text | awk -F/ '{print $2}') || echo "SKIP"
terraform import aws_acm_certificate.www_studup arn:aws:acm:us-east-1:672791741750:certificate/42f47dc2-9c19-4560-b8a8-fccd4c7e66f6 || echo "SKIP"

# CloudFront
terraform import aws_cloudfront_distribution.studup E3QIPLNGFSS6DH || echo "SKIP"

# Lambda
terraform import aws_lambda_function.data_handler DataHandler || echo "SKIP"

# IAM Role (service-role path)
terraform import aws_iam_role.lambda service-role/DataHandler-role-mptpqo4g || terraform import aws_iam_role.lambda DataHandler-role-mptpqo4g || echo "SKIP"

# API Gateway (REST APIs)
terraform import aws_api_gateway_rest_api.dta_api 9p1f5s3z65 || echo "SKIP"
terraform import aws_api_gateway_rest_api.data_api a5ljx6xmme || echo "SKIP"
terraform import aws_api_gateway_rest_api.open_api t4watftqy1 || echo "SKIP"

# API Gateway Resources
terraform import aws_api_gateway_resource.dta_api_data 9p1f5s3z65/t0pc5m || echo "SKIP"
terraform import aws_api_gateway_resource.data_api_data a5ljx6xmme/xd9c6w || echo "SKIP"
terraform import aws_api_gateway_resource.open_api_path t4watftqy1/vzabvc || echo "SKIP"

# API Gateway Methods
terraform import aws_api_gateway_method.dta_api_any_root 9p1f5s3z65/krazpsvqbj/ANY || echo "SKIP"
terraform import aws_api_gateway_method.dta_api_any_data 9p1f5s3z65/t0pc5m/ANY || echo "SKIP"
terraform import aws_api_gateway_method.data_api_any_root a5ljx6xmme/oigl3qxjhe/ANY || echo "SKIP"
terraform import aws_api_gateway_method.data_api_any_dataapi a5ljx6xmme/xd9c6w/ANY || echo "SKIP"
terraform import aws_api_gateway_method.open_api_any_root t4watftqy1/75cxsfxhhi/ANY || echo "SKIP"
terraform import aws_api_gateway_method.open_api_any_path t4watftqy1/vzabvc/ANY || echo "SKIP"

# API Gateway Integrations
terraform import aws_api_gateway_integration.dta_api_any_root 9p1f5s3z65/krazpsvqbj/ANY || echo "SKIP"
terraform import aws_api_gateway_integration.dta_api_any_data 9p1f5s3z65/t0pc5m/ANY || echo "SKIP"
terraform import aws_api_gateway_integration.data_api_any_root a5ljx6xmme/oigl3qxjhe/ANY || echo "SKIP"
terraform import aws_api_gateway_integration.data_api_any_dataapi a5ljx6xmme/xd9c6w/ANY || echo "SKIP"
terraform import aws_api_gateway_integration.open_api_any_root t4watftqy1/75cxsfxhhi/ANY || echo "SKIP"
terraform import aws_api_gateway_integration.open_api_any_path t4watftqy1/vzabvc/ANY || echo "SKIP"

# API Gateway Domain Names
terraform import aws_api_gateway_domain_name.openapi openapi.studup.net || echo "SKIP"
terraform import aws_api_gateway_domain_name.userapi userapi.studup.net || echo "SKIP"

# Route53
terraform import aws_route53_zone.studup Z05431083V9E43Y497ZSV || echo "SKIP"

# WAF (needs ARN)
WAF_ID="360e0e33-bef2-47c7-8d5d-dd0a73a5f28f"
terraform import aws_wafv2_web_acl.rate_limit "${WAF_ID}/studup-rate-limit/REGIONAL" || echo "SKIP"

# Secrets Manager
terraform import aws_secretsmanager_secret.database_password studup-database-password || echo "SKIP"
terraform import aws_secretsmanager_secret.jwt_secret studup-jwt-secret || echo "SKIP"
terraform import aws_secretsmanager_secret.email_api_key studup-email-api-key || echo "SKIP"

# Security Group
terraform import aws_security_group.lambda_rds sg-0b12753eb52f3a83b || echo "SKIP"

# DB Subnet Group
terraform import aws_db_subnet_group.default default-vpc-07269dbd3168692b5 || echo "SKIP"

# RDS
terraform import aws_db_instance.dev dev || echo "SKIP"

echo ""
echo "=== Import complete ==="
echo "Run 'terraform plan' to verify no changes needed"