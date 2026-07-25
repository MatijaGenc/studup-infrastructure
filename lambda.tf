resource "aws_security_group" "lambda_rds" {
  name        = "lambda-rds-sg"
  description = "Security group for Lambda to access RDS"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "lambda_rds_443" {
  security_group_id = aws_security_group.lambda_rds.id
  referenced_security_group_id = aws_security_group.lambda_rds.id
  from_port = 443
  to_port   = 443
  ip_protocol = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_rds_all" {
  security_group_id = aws_security_group.lambda_rds.id
  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
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

resource "aws_lambda_function" "data_handler" {
  function_name = "DataHandler"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
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
      APP_LOG_LEVEL          = "debug"
    }
  }

  lifecycle {
    ignore_changes = [
      runtime,
      s3_key,
      s3_bucket,
      environment,
      last_modified,
      source_code_size,
      source_code_hash,
      version,
    ]
  }
}