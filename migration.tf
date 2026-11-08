resource "random_password" "app_database_password" {
  length           = 32
  special          = true
  override_special = "-_.~"
}

resource "aws_secretsmanager_secret" "app_database_password" {
  name        = "studup-app-database-password"
  description = "StudUp RDS PostgreSQL password for the DML-only studup_app role"
}

resource "aws_secretsmanager_secret_version" "app_database_password" {
  secret_id     = aws_secretsmanager_secret.app_database_password.id
  secret_string = random_password.app_database_password.result

  # Value is generated once by `random_password`; the app-role password is then
  # owned by the backend migration/bootstrap process, not continuously
  # reconciled by Terraform. Owner: backend/data owner.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_iam_role" "db_migrator" {
  name = "studup-db-migrator"
  path = "/service-role/"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "db_migrator" {
  name              = "/aws/lambda/studup-db-migrator"
  retention_in_days = 14
}

resource "aws_iam_policy" "db_migrator" {
  name        = "studup-db-migrator"
  description = "Allow the migration Lambda to write logs and read its DB password secrets"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.db_migrator.arn}:*"
      },
      {
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.database_password.arn,
          aws_secretsmanager_secret.app_database_password.arn,
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "db_migrator" {
  role       = aws_iam_role.db_migrator.name
  policy_arn = aws_iam_policy.db_migrator.arn
}

resource "aws_iam_role_policy_attachment" "db_migrator_vpc" {
  role       = aws_iam_role.db_migrator.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "db_migrator" {
  function_name    = "studup-db-migrator"
  role             = aws_iam_role.db_migrator.arn
  runtime          = "nodejs26.x"
  handler          = "run.handler"
  timeout          = 900
  memory_size      = 512
  filename         = "migration-runner-placeholder.zip"
  source_code_hash = filebase64sha256("migration-runner-placeholder.zip")

  vpc_config {
    subnet_ids         = local.subnet_ids
    security_group_ids = [aws_security_group.lambda_rds.id]
  }

  environment {
    variables = {
      DB_HOST                    = aws_db_instance.dev.address
      DB_PORT                    = tostring(aws_db_instance.dev.port)
      DB_NAME                    = "postgres"
      DB_USER                    = aws_db_instance.dev.username
      DB_PASSWORD_SECRET_ARN     = aws_secretsmanager_secret.database_password.arn
      APP_DB_USER                = "studup_app"
      APP_DB_PASSWORD_SECRET_ARN = aws_secretsmanager_secret.app_database_password.arn
      ALLOW_MIGRATION            = "true"
      DB_SSL_CA                  = "/var/task/global-bundle.pem"
    }
  }

  depends_on = [aws_cloudwatch_log_group.db_migrator]

  # The backend migrate job replaces this handler with the built runner via
  # `aws lambda update-function-code`; Terraform only seeds the placeholder ZIP.
  # Ignore the CI-owned code hash, but keep Terraform ownership of the local
  # placeholder path. Owner: backend release workflow.
  lifecycle {
    ignore_changes = [source_code_hash]
  }
}
