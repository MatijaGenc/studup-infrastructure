resource "aws_iam_role" "api_authorizer" {
  name = "studup-api-authorizer-role"
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

resource "aws_iam_policy" "api_authorizer_secrets" {
  name        = "studup-api-authorizer-secrets"
  description = "Allow API authorizer Lambda to read JWT secret from Secrets Manager"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
        ]
        Resource = [
          aws_secretsmanager_secret.jwt_secret.arn,
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_authorizer_secrets" {
  role       = aws_iam_role.api_authorizer.name
  policy_arn = aws_iam_policy.api_authorizer_secrets.arn
}

resource "aws_lambda_function" "api_authorizer" {
  function_name = "studup-api-authorizer"
  role          = aws_iam_role.api_authorizer.arn
  handler       = "index.mjs.handler"
  runtime       = "nodejs20.x"
  memory_size   = 128
  timeout       = 10
  filename      = "authorizer.zip"
  source_code_hash = filebase64sha256("authorizer.zip")
}

resource "aws_lambda_permission" "api_authorizer_data_api" {
  statement_id  = "AllowAPIGatewayInvokeDataApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.data_api.execution_arn}/*"
}

resource "aws_lambda_permission" "api_authorizer_dta_api" {
  statement_id  = "AllowAPIGatewayInvokeDtaApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.dta_api.execution_arn}/*"
}