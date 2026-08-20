#!/usr/bin/env bash
# Source this file to load Terraform variables from AWS Secrets Manager:
#   source ./scripts/load-secrets.sh
set -euo pipefail

echo "Loading secrets from AWS Secrets Manager..."

export TF_VAR_db_password=$(
  aws secretsmanager get-secret-value --secret-id studup-database-password \
    --query SecretString --output text
)

export TF_VAR_jwt_secret=$(
  aws secretsmanager get-secret-value --secret-id studup-jwt-secret \
    --query SecretString --output text
)

export TF_VAR_email_api_key=$(
  aws secretsmanager get-secret-value --secret-id studup-email-api-key \
    --query SecretString --output text
)

export TF_VAR_vapid_public_key=$(
  aws secretsmanager get-secret-value --secret-id studup-vapid-public-key \
    --query SecretString --output text
)

export TF_VAR_vapid_private_key=$(
  aws secretsmanager get-secret-value --secret-id studup-vapid-private-key \
    --query SecretString --output text
)

echo "Secrets loaded: TF_VAR_db_password, TF_VAR_jwt_secret, TF_VAR_email_api_key, TF_VAR_vapid_public_key, TF_VAR_vapid_private_key"