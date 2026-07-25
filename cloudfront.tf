resource "aws_cloudfront_distribution" "studup" {
  enabled     = true
  comment     = ""
  price_class = "PriceClass_All"
  http_version = "http2"
  is_ipv6_enabled = true

  aliases = ["www.studup.net"]

  origin {
    domain_name = aws_s3_bucket_website_configuration.website.website_endpoint
    origin_id   = aws_s3_bucket_website_configuration.website.website_endpoint
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = aws_s3_bucket_website_configuration.website.website_endpoint
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.www_studup.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "studup-website-cdn"
  }

  lifecycle {
    ignore_changes = [
      default_cache_behavior[0].default_ttl,
      default_cache_behavior[0].max_ttl,
      default_cache_behavior[0].min_ttl,
    ]
  }
}