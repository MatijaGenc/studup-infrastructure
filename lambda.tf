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

resource "aws_vpc_security_group_egress_rule" "lambda_rds_all" {
  security_group_id = aws_security_group.lambda_rds.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
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

resource "aws_lambda_function" "data_handler" {
  function_name = "DataHandler"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x" # actual deployed runtime is nodejs24.x (managed outside Terraform)
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
      CLOUDFRONT_DOMAIN      = aws_cloudfront_distribution.studup.domain_name
      PROFILE_IMAGES_BUCKET  = aws_s3_bucket.profile_images.id
    }
  }

  lifecycle {
    ignore_changes = [
      runtime,
      s3_key,
      s3_bucket,
      environment,
    ]
  }
}