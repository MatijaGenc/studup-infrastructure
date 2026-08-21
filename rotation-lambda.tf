resource "aws_iam_role" "rotation_lambda" {
  name = "studup-db-password-rotation"
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

resource "aws_iam_policy" "rotation_secrets" {
  name        = "studup-db-password-rotation-secrets"
  description = "Allow rotation Lambda to read/update DB password secret"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage",
        ]
        Resource = aws_secretsmanager_secret.database_password.arn
      },
      {
        Effect = "Allow"
        Action = "secretsmanager:GetRandomPassword"
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rotation_secrets" {
  role       = aws_iam_role.rotation_lambda.name
  policy_arn = aws_iam_policy.rotation_secrets.arn
}

resource "aws_iam_role_policy_attachment" "rotation_vpc" {
  role       = aws_iam_role.rotation_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "db_password_rotation" {
  function_name = "studup-db-password-rotation"
  role          = aws_iam_role.rotation_lambda.arn
  runtime       = "python3.12"
  handler       = "rotate.lambda_handler"
  timeout       = 60
  memory_size   = 128
  filename      = "rotation-function.zip"
  source_code_hash = filebase64sha256("rotation-function.zip")

  vpc_config {
    subnet_ids         = local.subnet_ids
    security_group_ids = [aws_security_group.lambda_rds.id]
  }

  environment {
    variables = {
      DB_HOST = aws_db_instance.dev.address
      DB_PORT = tostring(aws_db_instance.dev.port)
      DB_USER = aws_db_instance.dev.username
      DB_NAME = "postgres"
    }
  }

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
    ]
  }
}

resource "aws_vpc_security_group_ingress_rule" "lambda_rds_postgres" {
  security_group_id            = aws_security_group.lambda_rds.id
  referenced_security_group_id = aws_security_group.lambda_rds.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_lambda_permission" "rotate_db_password" {
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.db_password_rotation.function_name
  principal      = "secretsmanager.amazonaws.com"
  source_arn     = aws_secretsmanager_secret.database_password.arn
  source_account = data.aws_caller_identity.current.account_id
}

resource "aws_secretsmanager_secret_rotation" "db_password" {
  secret_id           = aws_secretsmanager_secret.database_password.id
  rotation_lambda_arn = aws_lambda_function.db_password_rotation.arn

  rotation_rules {
    automatically_after_days = 30
  }

  lifecycle {
    ignore_changes = [
      secret_id,
    ]
  }
}