resource "aws_cloudfront_distribution" "studup" {
  enabled         = true
  comment         = ""
  price_class     = "PriceClass_All"
  http_version    = "http2"
  is_ipv6_enabled = true
  web_acl_id      = aws_wafv2_web_acl.cloudfront.arn

  aliases = ["www.studup.net"]

  origin {
    domain_name = aws_s3_bucket_website_configuration.website.website_endpoint
    origin_id   = aws_s3_bucket_website_configuration.website.website_endpoint
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name = aws_s3_bucket.profile_images.bucket_regional_domain_name
    origin_id   = "stud-up-profile-images"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.profile_images.cloudfront_access_identity_path
    }
  }

  ordered_cache_behavior {
    path_pattern               = "index.html"
    target_origin_id           = aws_s3_bucket_website_configuration.website.website_endpoint
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.csp.id
  }

  ordered_cache_behavior {
    path_pattern           = "images/*"
    target_origin_id       = "stud-up-profile-images"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  default_cache_behavior {
    target_origin_id           = aws_s3_bucket_website_configuration.website.website_endpoint
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.csp.id
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.www_studup.certificate_arn
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

resource "aws_cloudfront_origin_access_identity" "profile_images" {
  comment = "OAI for stud-up-profile-images bucket"
}

resource "aws_cloudfront_response_headers_policy" "csp" {
  name    = "studup-csp-policy"
  comment = "CSP security headers for StudUp"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.studup.net https://studup.net; frame-src 'none'; object-src 'none'"
      override                = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

resource "aws_cloudfront_distribution" "root_redirect" {
  enabled         = true
  comment         = "Redirect studup.net to www.studup.net"
  price_class     = "PriceClass_100"
  http_version    = "http2"
  is_ipv6_enabled = true
  web_acl_id      = aws_wafv2_web_acl.cloudfront.arn

  aliases = ["studup.net"]

  origin {
    domain_name = aws_s3_bucket_website_configuration.root_redirect.website_endpoint
    origin_id   = "studup-root-redirect"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "studup-root-redirect"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.studup_root_cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "studup-root-redirect"
  }
}