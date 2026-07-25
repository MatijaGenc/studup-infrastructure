resource "aws_wafv2_web_acl" "rate_limit" {
  name        = "studup-rate-limit"
  description = "Rate limiting for StudUp API Gateways"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-100-in-5-min"
    priority = 0
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                = 100
        evaluation_window_sec = 300
        aggregate_key_type   = "IP"
      }
    }
    visibility_config {
      sampled_requests_enabled = true
      cloudwatch_metrics_enabled = true
      metric_name              = "rate-limit-100-in-5-min"
    }
  }

  visibility_config {
    sampled_requests_enabled = true
    cloudwatch_metrics_enabled = true
    metric_name              = "studup-rate-limit"
  }
}

locals {
  open_api_stage_arn = "arn:aws:apigateway:${data.aws_region.current.name}::/restapis/${aws_api_gateway_rest_api.open_api.id}/stages/${aws_api_gateway_stage.open_api.stage_name}"
  dta_api_stage_arn  = "arn:aws:apigateway:${data.aws_region.current.name}::/restapis/${aws_api_gateway_rest_api.dta_api.id}/stages/${aws_api_gateway_stage.dta_api.stage_name}"
}

resource "aws_wafv2_web_acl_association" "open_api" {
  resource_arn = local.open_api_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.rate_limit.arn
}

resource "aws_wafv2_web_acl_association" "dta_api" {
  resource_arn = local.dta_api_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.rate_limit.arn
}