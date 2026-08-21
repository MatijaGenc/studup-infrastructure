resource "aws_secretsmanager_secret" "database_password" {
  name        = "studup-database-password"
  description = "StudUp RDS PostgreSQL password"
}

resource "aws_secretsmanager_secret_version" "database_password" {
  secret_id     = aws_secretsmanager_secret.database_password.id
  secret_string = var.db_password

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "studup-jwt-secret"
  description = "StudUp JWT signing secret"
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "email_api_key" {
  name        = "studup-email-api-key"
  description = "StudUp Brevo email API key"
}

resource "aws_secretsmanager_secret_version" "email_api_key" {
  secret_id     = aws_secretsmanager_secret.email_api_key.id
  secret_string = var.email_api_key

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "vapid_public_key" {
  name        = "studup-vapid-public-key"
  description = "StudUp Web Push VAPID public key"
}

resource "aws_secretsmanager_secret" "vapid_private_key" {
  name        = "studup-vapid-private-key"
  description = "StudUp Web Push VAPID private key"
}