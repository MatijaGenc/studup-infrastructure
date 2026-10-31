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

resource "aws_api_gateway_authorizer" "dta_api" {
  name                             = "studup-jwt-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.dta_api.id
  authorizer_uri                   = aws_lambda_function.api_authorizer.invoke_arn
  authorizer_credentials           = aws_iam_role.api_authorizer.arn
  type                             = "TOKEN"
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 300
}

resource "aws_api_gateway_method" "dta_api_any_root" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  resource_id   = aws_api_gateway_rest_api.dta_api.root_resource_id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.dta_api.id
}

resource "aws_api_gateway_method" "dta_api_any_data" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  resource_id   = aws_api_gateway_resource.dta_api_data.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.dta_api.id
}

resource "aws_api_gateway_method" "dta_api_any_proxy" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  resource_id   = aws_api_gateway_resource.dta_api_proxy.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.dta_api.id
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
    aws_api_gateway_authorizer.dta_api,
    aws_api_gateway_integration_response.dta_api_preflight,
    aws_api_gateway_gateway_response.dta_api_default_4xx,
    aws_api_gateway_gateway_response.dta_api_default_5xx,
  ]
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  triggers = {
    redeployment = sha1(jsonencode([
      filesha256("${path.module}/api-gateway.tf"),
      aws_api_gateway_resource.dta_api_data.id,
      aws_api_gateway_resource.dta_api_proxy.id,
      aws_api_gateway_method.dta_api_any_root.id,
      aws_api_gateway_method.dta_api_any_data.id,
      aws_api_gateway_method.dta_api_any_proxy.id,
      aws_api_gateway_integration.dta_api_any_root.id,
      aws_api_gateway_integration.dta_api_any_data.id,
      aws_api_gateway_integration.dta_api_any_proxy.id,
      aws_api_gateway_authorizer.dta_api.id,
      aws_api_gateway_method.dta_api_preflight,
      aws_api_gateway_integration.dta_api_preflight,
      aws_api_gateway_integration_response.dta_api_preflight,
      aws_api_gateway_gateway_response.dta_api_default_4xx.id,
      aws_api_gateway_gateway_response.dta_api_default_5xx.id,
    ]))
  }
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

resource "aws_api_gateway_authorizer" "data_api" {
  name                             = "studup-jwt-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.data_api.id
  authorizer_uri                   = aws_lambda_function.api_authorizer.invoke_arn
  authorizer_credentials           = aws_iam_role.api_authorizer.arn
  type                             = "TOKEN"
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 300
}

resource "aws_api_gateway_method" "data_api_any_root" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  resource_id   = aws_api_gateway_rest_api.data_api.root_resource_id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.data_api.id
}

resource "aws_api_gateway_method" "data_api_any_dataapi" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  resource_id   = aws_api_gateway_resource.data_api_data.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.data_api.id
}

resource "aws_api_gateway_method" "data_api_any_proxy" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  resource_id   = aws_api_gateway_resource.data_api_proxy.id
  http_method   = "ANY"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.data_api.id
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
    aws_api_gateway_authorizer.data_api,
    aws_api_gateway_integration_response.data_api_preflight,
    aws_api_gateway_gateway_response.data_api_default_4xx,
    aws_api_gateway_gateway_response.data_api_default_5xx,
  ]
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  triggers = {
    redeployment = sha1(jsonencode([
      filesha256("${path.module}/api-gateway.tf"),
      aws_api_gateway_resource.data_api_data.id,
      aws_api_gateway_resource.data_api_proxy.id,
      aws_api_gateway_method.data_api_any_root.id,
      aws_api_gateway_method.data_api_any_dataapi.id,
      aws_api_gateway_method.data_api_any_proxy.id,
      aws_api_gateway_integration.data_api_any_root.id,
      aws_api_gateway_integration.data_api_any_dataapi.id,
      aws_api_gateway_integration.data_api_any_proxy.id,
      aws_api_gateway_authorizer.data_api.id,
      aws_api_gateway_method.data_api_preflight,
      aws_api_gateway_integration.data_api_preflight,
      aws_api_gateway_integration_response.data_api_preflight,
      aws_api_gateway_gateway_response.data_api_default_4xx.id,
      aws_api_gateway_gateway_response.data_api_default_5xx.id,
    ]))
  }
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
    aws_api_gateway_gateway_response.open_api_default_4xx,
    aws_api_gateway_gateway_response.open_api_default_5xx,
  ]
  rest_api_id = aws_api_gateway_rest_api.open_api.id
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_method.open_api_any_root.id,
      aws_api_gateway_method.open_api_any_path.id,
      aws_api_gateway_method.open_api_any_proxy.id,
      aws_api_gateway_integration.open_api_any_root.uri,
      aws_api_gateway_integration.open_api_any_path.uri,
      aws_api_gateway_integration.open_api_any_proxy.uri,
      aws_api_gateway_gateway_response.open_api_default_4xx.id,
      aws_api_gateway_gateway_response.open_api_default_5xx.id,
      filesha256("${path.module}/api-gateway.tf"),
      aws_api_gateway_resource.open_api_path.id,
      aws_api_gateway_resource.open_api_proxy.id,
      aws_api_gateway_method.open_api_any_root.id,
      aws_api_gateway_method.open_api_any_path.id,
      aws_api_gateway_method.open_api_any_proxy.id,
      aws_api_gateway_integration.open_api_any_root.id,
      aws_api_gateway_integration.open_api_any_path.id,
      aws_api_gateway_integration.open_api_any_proxy.id,
    ]))
  }
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

resource "aws_api_gateway_gateway_response" "dta_api_default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  response_type = "DEFAULT_4XX"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"      = "'https://www.studup.net'"
    "gatewayresponse.header.Access-Control-Allow-Credentials" = "'true'"
    "gatewayresponse.header.Access-Control-Allow-Headers"     = "'Content-Type,Authorization,X-Access-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods"     = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
  }
}

resource "aws_api_gateway_gateway_response" "dta_api_default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  response_type = "DEFAULT_5XX"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"      = "'https://www.studup.net'"
    "gatewayresponse.header.Access-Control-Allow-Credentials" = "'true'"
    "gatewayresponse.header.Access-Control-Allow-Headers"     = "'Content-Type,Authorization,X-Access-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods"     = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
  }
}

resource "aws_api_gateway_gateway_response" "data_api_default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  response_type = "DEFAULT_4XX"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"      = "'https://www.studup.net'"
    "gatewayresponse.header.Access-Control-Allow-Credentials" = "'true'"
    "gatewayresponse.header.Access-Control-Allow-Headers"     = "'Content-Type,Authorization,X-Access-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods"     = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
  }
}

resource "aws_api_gateway_gateway_response" "data_api_default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  response_type = "DEFAULT_5XX"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"      = "'https://www.studup.net'"
    "gatewayresponse.header.Access-Control-Allow-Credentials" = "'true'"
    "gatewayresponse.header.Access-Control-Allow-Headers"     = "'Content-Type,Authorization,X-Access-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods"     = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
  }
}

resource "aws_api_gateway_gateway_response" "open_api_default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.open_api.id
  response_type = "DEFAULT_4XX"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Access-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
  }
}

resource "aws_api_gateway_gateway_response" "open_api_default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.open_api.id
  response_type = "DEFAULT_5XX"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Access-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
  }
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

# Enforce HTTPS on all APIs — deny HTTP requests via resource policy
resource "aws_api_gateway_rest_api_policy" "dta_api" {
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.dta_api.execution_arn}/*/OPTIONS/*"
        Condition = { Bool = { "aws:SecureTransport" : "true" } }
      },
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.dta_api.execution_arn}/*"
        Condition = {
          Bool = {
            "aws:SecureTransport" : "false"
          }
        }
      }
    ]
  })
}

resource "aws_api_gateway_rest_api_policy" "data_api" {
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.data_api.execution_arn}/*/OPTIONS/*"
        Condition = { Bool = { "aws:SecureTransport" : "true" } }
      },
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.data_api.execution_arn}/*"
        Condition = {
          Bool = {
            "aws:SecureTransport" : "false"
          }
        }
      }
    ]
  })
}

resource "aws_api_gateway_rest_api_policy" "open_api" {
  rest_api_id = aws_api_gateway_rest_api.open_api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.open_api.execution_arn}/*"
        Condition = {
          Bool = {
            "aws:SecureTransport" : "true"
          }
        }
      },
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "${aws_api_gateway_rest_api.open_api.execution_arn}/*"
        Condition = {
          Bool = {
            "aws:SecureTransport" : "false"
          }
        }
      }
    ]
  })
}
resource "aws_lambda_permission" "open_api_rest_proxy" {
  statement_id   = "StudUpPublicRestProxyInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = "DataHandler"
  principal      = "apigateway.amazonaws.com"
  source_arn     = "${aws_api_gateway_rest_api.open_api.execution_arn}/*/*/*"
  source_account = data.aws_caller_identity.current.account_id
}

locals {
  dta_api_preflight_resources = {
    root  = aws_api_gateway_rest_api.dta_api.root_resource_id
    data  = aws_api_gateway_resource.dta_api_data.id
    proxy = aws_api_gateway_resource.dta_api_proxy.id
  }
  data_api_preflight_resources = {
    root  = aws_api_gateway_rest_api.data_api.root_resource_id
    data  = aws_api_gateway_resource.data_api_data.id
    proxy = aws_api_gateway_resource.data_api_proxy.id
  }
}

resource "aws_api_gateway_method" "dta_api_preflight" {
  for_each      = local.dta_api_preflight_resources
  rest_api_id   = aws_api_gateway_rest_api.dta_api.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "dta_api_preflight" {
  for_each    = local.dta_api_preflight_resources
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.dta_api_preflight[each.key].http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\":200}"
  }
}

resource "aws_api_gateway_method_response" "dta_api_preflight" {
  for_each    = local.dta_api_preflight_resources
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.dta_api_preflight[each.key].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
  }
}

resource "aws_api_gateway_integration_response" "dta_api_preflight" {
  for_each    = local.dta_api_preflight_resources
  rest_api_id = aws_api_gateway_rest_api.dta_api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.dta_api_preflight[each.key].http_method
  status_code = aws_api_gateway_method_response.dta_api_preflight[each.key].status_code
  depends_on  = [aws_api_gateway_integration.dta_api_preflight]
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = "'https://www.studup.net'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
    "method.response.header.Access-Control-Allow-Methods"     = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,Authorization,X-Access-Token'"
  }
}

resource "aws_api_gateway_method" "data_api_preflight" {
  for_each      = local.data_api_preflight_resources
  rest_api_id   = aws_api_gateway_rest_api.data_api.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "data_api_preflight" {
  for_each    = local.data_api_preflight_resources
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.data_api_preflight[each.key].http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\":200}"
  }
}

resource "aws_api_gateway_method_response" "data_api_preflight" {
  for_each    = local.data_api_preflight_resources
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.data_api_preflight[each.key].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Headers"     = true
  }
}

resource "aws_api_gateway_integration_response" "data_api_preflight" {
  for_each    = local.data_api_preflight_resources
  rest_api_id = aws_api_gateway_rest_api.data_api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.data_api_preflight[each.key].http_method
  status_code = aws_api_gateway_method_response.data_api_preflight[each.key].status_code
  depends_on  = [aws_api_gateway_integration.data_api_preflight]
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"      = "'https://www.studup.net'"
    "method.response.header.Access-Control-Allow-Credentials" = "'true'"
    "method.response.header.Access-Control-Allow-Methods"     = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Headers"     = "'Content-Type,Authorization,X-Access-Token'"
  }
}

resource "aws_lambda_permission" "data_api_rest_proxy" {
  statement_id   = "StudUpPrivateRestProxyInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = "DataHandler"
  principal      = "apigateway.amazonaws.com"
  source_arn     = "${aws_api_gateway_rest_api.data_api.execution_arn}/*/*/*"
  source_account = data.aws_caller_identity.current.account_id
}
