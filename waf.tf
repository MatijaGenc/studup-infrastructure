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
        limit                 = 100
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit-100-in-5-min"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "studup-rate-limit"
  }
}

locals {
  open_api_stage_arn = "arn:aws:apigateway:${data.aws_region.current.name}::/restapis/${aws_api_gateway_rest_api.open_api.id}/stages/${aws_api_gateway_stage.open_api.stage_name}"
  dta_api_stage_arn  = "arn:aws:apigateway:${data.aws_region.current.name}::/restapis/${aws_api_gateway_rest_api.dta_api.id}/stages/${aws_api_gateway_stage.dta_api.stage_name}"
  data_api_stage_arn = "arn:aws:apigateway:${data.aws_region.current.name}::/restapis/${aws_api_gateway_rest_api.data_api.id}/stages/${aws_api_gateway_stage.data_api.stage_name}"
}

resource "aws_wafv2_web_acl_association" "open_api" {
  resource_arn = local.open_api_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.rate_limit.arn
}

resource "aws_wafv2_web_acl_association" "dta_api" {
  resource_arn = local.dta_api_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.rate_limit.arn
}

resource "aws_wafv2_web_acl_association" "data_api" {
  resource_arn = local.data_api_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.rate_limit.arn
}

# CloudFront WAF (must be CLOUDFRONT scope in us-east-1)
resource "aws_wafv2_web_acl" "cloudfront" {
  provider    = aws.us-east-1
  name        = "studup-cloudfront-waf"
  description = "WAF for StudUp CloudFront distribution"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-common-rules"
    priority = 0
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-common-rules"
    }
  }

  rule {
    name     = "aws-sqli-rules"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-sqli-rules"
    }
  }

  rule {
    name     = "aws-xss-rules"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-xss-rules"
    }
  }

  rule {
    name     = "rate-limit-2000-in-5-min"
    priority = 3
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = 2000
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit-2000-in-5-min"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "studup-cloudfront-waf"
  }
}

resource "aws_cloudwatch_log_group" "waf_cloudfront" {
  provider          = aws.us-east-1
  name              = "aws-waf-logs-studup-cloudfront"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "cloudfront" {
  provider                = aws.us-east-1
  resource_arn            = aws_wafv2_web_acl.cloudfront.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_cloudfront.arn]
}