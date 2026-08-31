resource "aws_api_gateway_account" "studup" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "studup-api-gateway-cloudwatch-logs"
  path = "/service-role/"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_gateway_cloudwatch" {
  name = "studup-api-gateway-cloudwatch-logs"
  role = aws_iam_role.api_gateway_cloudwatch.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_api_gateway_rest_api" "dta_api" {
  name = "dta-api-new"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "dta_api_data" {
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  parent_id   = aws_api_gateway_rest_api.dta_api.root_resource_id
  path_part   = "data"
}

resource "aws_api_gateway_resource" "dta_api_proxy" {
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  parent_id   = aws_api_gateway_rest_api.dta_api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "dta_api_any_root" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  resource_id   = aws_api_gateway_rest_api.dta_api.root_resource_id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "dta_api_any_data" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  resource_id   = aws_api_gateway_resource.dta_api_data.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "dta_api_any_proxy" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  resource_id   = aws_api_gateway_resource.dta_api_proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "dta_api_any_root" {
  rest_api_id             = aws_api_gateway_rest_api.dta_api.id
  resource_id             = aws_api_gateway_rest_api.dta_api.root_resource_id
  http_method             = aws_api_gateway_method.dta_api_any_root.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_integration" "dta_api_any_data" {
  rest_api_id             = aws_api_gateway_rest_api.dta_api.id
  resource_id             = aws_api_gateway_resource.dta_api_data.id
  http_method             = aws_api_gateway_method.dta_api_any_data.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_integration" "dta_api_any_proxy" {
  rest_api_id             = aws_api_gateway_rest_api.dta_api.id
  resource_id             = aws_api_gateway_resource.dta_api_proxy.id
  http_method             = aws_api_gateway_method.dta_api_any_proxy.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_deployment" "dta_api" {
  depends_on = [
    aws_api_gateway_integration.dta_api_any_root,
    aws_api_gateway_integration.dta_api_any_data,
    aws_api_gateway_integration.dta_api_any_proxy,
  ]
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "dta_api" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  stage_name    = "development"
  deployment_id = aws_api_gateway_deployment.dta_api.id
  xray_tracing_enabled = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_dta.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      method         = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
      responseLatency    = "$context.responseLatency"
      stage          = "$context.stage"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_gateway_dta" {
  name              = "API-Gateway-Execution-Logs_dta-api/development"
  retention_in_days = 30
}

resource "aws_api_gateway_rest_api" "data_api" {
  name = "data-api"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "data_api_data" {
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  parent_id   = aws_api_gateway_rest_api.data_api.root_resource_id
  path_part   = "data-api"
}

resource "aws_api_gateway_resource" "data_api_proxy" {
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  parent_id   = aws_api_gateway_rest_api.data_api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "data_api_any_root" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  resource_id   = aws_api_gateway_rest_api.data_api.root_resource_id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "data_api_any_dataapi" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  resource_id   = aws_api_gateway_resource.data_api_data.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "data_api_any_proxy" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  resource_id   = aws_api_gateway_resource.data_api_proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "data_api_any_root" {
  rest_api_id             = aws_api_gateway_rest_api.data_api.id
  resource_id             = aws_api_gateway_rest_api.data_api.root_resource_id
  http_method             = aws_api_gateway_method.data_api_any_root.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_integration" "data_api_any_dataapi" {
  rest_api_id             = aws_api_gateway_rest_api.data_api.id
  resource_id             = aws_api_gateway_resource.data_api_data.id
  http_method             = aws_api_gateway_method.data_api_any_dataapi.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_integration" "data_api_any_proxy" {
  rest_api_id             = aws_api_gateway_rest_api.data_api.id
  resource_id             = aws_api_gateway_resource.data_api_proxy.id
  http_method             = aws_api_gateway_method.data_api_any_proxy.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_deployment" "data_api" {
  depends_on = [
    aws_api_gateway_integration.data_api_any_root,
    aws_api_gateway_integration.data_api_any_dataapi,
    aws_api_gateway_integration.data_api_any_proxy,
  ]
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "data_api" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  stage_name    = "default"
  deployment_id = aws_api_gateway_deployment.data_api.id
  xray_tracing_enabled = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_data.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      method         = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
      responseLatency    = "$context.responseLatency"
      stage          = "$context.stage"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_gateway_data" {
  name              = "API-Gateway-Execution-Logs_data-api/default"
  retention_in_days = 30
}

resource "aws_api_gateway_rest_api" "open_api" {
  name = "open-api-API"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "open_api_path" {
  rest_api_id = aws_api_gateway_rest_api.open_api.id
  parent_id   = aws_api_gateway_rest_api.open_api.root_resource_id
  path_part   = "open-api"
}

resource "aws_api_gateway_resource" "open_api_proxy" {
  rest_api_id = aws_api_gateway_rest_api.open_api.id
  parent_id   = aws_api_gateway_rest_api.open_api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "open_api_any_root" {
  rest_api_id   = aws_api_gateway_rest_api.open_api.id
  resource_id   = aws_api_gateway_rest_api.open_api.root_resource_id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "open_api_any_path" {
  rest_api_id   = aws_api_gateway_rest_api.open_api.id
  resource_id   = aws_api_gateway_resource.open_api_path.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "open_api_any_proxy" {
  rest_api_id   = aws_api_gateway_rest_api.open_api.id
  resource_id   = aws_api_gateway_resource.open_api_proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "open_api_any_root" {
  rest_api_id             = aws_api_gateway_rest_api.open_api.id
  resource_id             = aws_api_gateway_rest_api.open_api.root_resource_id
  http_method             = aws_api_gateway_method.open_api_any_root.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_integration" "open_api_any_path" {
  rest_api_id             = aws_api_gateway_rest_api.open_api.id
  resource_id             = aws_api_gateway_resource.open_api_path.id
  http_method             = aws_api_gateway_method.open_api_any_path.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_integration" "open_api_any_proxy" {
  rest_api_id             = aws_api_gateway_rest_api.open_api.id
  resource_id             = aws_api_gateway_resource.open_api_proxy.id
  http_method             = aws_api_gateway_method.open_api_any_proxy.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.data_handler.invoke_arn
}

resource "aws_api_gateway_deployment" "open_api" {
  depends_on = [
    aws_api_gateway_integration.open_api_any_root,
    aws_api_gateway_integration.open_api_any_path,
    aws_api_gateway_integration.open_api_any_proxy,
  ]
  rest_api_id = aws_api_gateway_rest_api.open_api.id
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "open_api" {
  rest_api_id   = aws_api_gateway_rest_api.open_api.id
  stage_name    = "default"
  deployment_id = aws_api_gateway_deployment.open_api.id
  xray_tracing_enabled = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_open.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      method         = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
      responseLatency    = "$context.responseLatency"
      stage          = "$context.stage"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_gateway_open" {
  name              = "API-Gateway-Execution-Logs_open-api-API/default"
  retention_in_days = 30
}

resource "aws_api_gateway_domain_name" "openapi" {
  domain_name              = "openapi.studup.net"
  regional_certificate_arn = aws_acm_certificate_validation.studup_wildcard.certificate_arn
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "openapi" {
  api_id      = aws_api_gateway_rest_api.open_api.id
  stage_name  = aws_api_gateway_stage.open_api.stage_name
  domain_name = aws_api_gateway_domain_name.openapi.domain_name
}

resource "aws_api_gateway_domain_name" "userapi" {
  domain_name              = "userapi.studup.net"
  regional_certificate_arn = aws_acm_certificate_validation.studup_wildcard.certificate_arn
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "userapi" {
  api_id      = aws_api_gateway_rest_api.data_api.id
  stage_name  = aws_api_gateway_stage.data_api.stage_name
  domain_name = aws_api_gateway_domain_name.userapi.domain_name
}