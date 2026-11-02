resource "aws_security_group" "lambda_rds" {
  name        = "lambda-rds-sg"
  description = "Security group for Lambda to access RDS"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "lambda_rds_443" {
  security_group_id            = aws_security_group.lambda_rds.id
  referenced_security_group_id = aws_security_group.lambda_rds.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_rds_dns" {
  security_group_id = aws_security_group.lambda_rds.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 53
  to_port           = 53
  ip_protocol       = "udp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_rds_all" {
  security_group_id = aws_security_group.lambda_rds.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_rds_db" {
  security_group_id = aws_security_group.lambda_rds.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_iam_role" "lambda" {
  name = "DataHandler-role-mptpq4o3"
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

  lifecycle {
    ignore_changes = [
      managed_policy_arns,
    ]
  }
}

resource "aws_iam_policy" "s3_profile_images" {
  name        = "studup-s3-profile-images"
  description = "Allow DataHandler Lambda to upload to profile images bucket"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.profile_images.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "s3_profile_images" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.s3_profile_images.arn
}

resource "aws_iam_policy" "s3_cv_files" {
  name        = "studup-s3-cv-files"
  description = "Allow DataHandler Lambda to upload to CV files bucket"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.cv_files.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "s3_cv_files" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.s3_cv_files.arn
}

resource "aws_lambda_function" "data_handler" {
  function_name = "DataHandler"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs26.x"
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout
  s3_bucket     = "studup-terraform-state"
  s3_key        = var.lambda_s3_key

  vpc_config {
    subnet_ids         = local.subnet_ids
    security_group_ids = [aws_security_group.lambda_rds.id]
  }

  environment {
    variables = {
      APP_EMAIL_FROM_ADDRESS = var.email_from_address
      APP_SUPPORT_EMAIL      = var.support_email
      APP_LOG_LEVEL          = var.lambda_log_level
      CLOUDFRONT_DOMAIN      = aws_cloudfront_distribution.studup.domain_name
      PROFILE_IMAGES_BUCKET  = aws_s3_bucket.profile_images.id
      CV_FILES_BUCKET        = aws_s3_bucket.cv_files.id
      APP_DATABASE_USER      = "studup_app"
      APP_DATABASE_HOST      = "dev.cwkb6xgemtnz.eu-south-1.rds.amazonaws.com"
      APP_DATABASE_NAME      = "postgres"
      APP_DATABASE_PORT      = "5432"
      APP_DATABASE_SECRET_ID = aws_secretsmanager_secret.app_database_password.name
      NODE_EXTRA_CA_CERTS    = "/var/task/global-bundle.pem"
    }
  }

  lifecycle {
    ignore_changes = [
      s3_key,
      s3_bucket,
    ]
  }
}

resource "aws_cloudwatch_log_group" "outbox_worker" {
  name              = "/aws/lambda/studup-outbox-worker"
  retention_in_days = 30
}

resource "aws_iam_policy" "outbox_worker_logs" {
  name        = "studup-outbox-worker-logs"
  description = "Allow the outbox worker Lambda to write to its CloudWatch log group"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.outbox_worker.arn}:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "outbox_worker_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.outbox_worker_logs.arn
}

resource "aws_lambda_function" "outbox_worker" {
  function_name = "studup-outbox-worker"
  role          = aws_iam_role.lambda.arn
  handler       = "outboxWorker.handler"
  runtime       = "nodejs26.x"
  memory_size   = var.lambda_memory_size
  timeout       = 60
  s3_bucket     = "studup-terraform-state"
  s3_key        = var.outbox_worker_s3_key

  vpc_config {
    subnet_ids         = local.subnet_ids
    security_group_ids = [aws_security_group.lambda_rds.id]
  }

  environment {
    variables = {
      APP_EMAIL_FROM_ADDRESS    = var.email_from_address
      APP_SUPPORT_EMAIL         = var.support_email
      APP_LOG_LEVEL             = var.lambda_log_level
      CLOUDFRONT_DOMAIN         = aws_cloudfront_distribution.studup.domain_name
      PROFILE_IMAGES_BUCKET     = aws_s3_bucket.profile_images.id
      CV_FILES_BUCKET           = aws_s3_bucket.cv_files.id
      APP_DATABASE_USER         = "studup_app"
      APP_DATABASE_HOST         = "dev.cwkb6xgemtnz.eu-south-1.rds.amazonaws.com"
      APP_DATABASE_NAME         = "postgres"
      APP_DATABASE_PORT         = "5432"
      APP_DATABASE_SECRET_ID    = aws_secretsmanager_secret.app_database_password.name
      NODE_EXTRA_CA_CERTS       = "/var/task/global-bundle.pem"
      OUTBOX_WORKER_LOG_VERSION = "1"
    }
  }

  depends_on = [aws_cloudwatch_log_group.outbox_worker]

  lifecycle {
    ignore_changes = [
      s3_key,
      s3_bucket,
    ]
  }
}

resource "aws_cloudwatch_event_rule" "outbox_schedule" {
  name                = "studup-outbox-worker-schedule"
  description         = "Runs the notification outbox worker every minute"
  schedule_expression = "rate(1 minute)"
}

resource "aws_cloudwatch_event_target" "outbox_worker" {
  rule      = aws_cloudwatch_event_rule.outbox_schedule.name
  target_id = "studup-outbox-worker"
  arn       = aws_lambda_function.outbox_worker.arn
}

resource "aws_lambda_permission" "outbox_events" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.outbox_worker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.outbox_schedule.arn
}
