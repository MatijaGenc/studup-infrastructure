resource "aws_cloudfront_function" "spa_routing" {
  provider = aws.us-east-1
  name     = "studup-spa-routing"
  runtime  = "cloudfront-js-2.0"
  comment  = "Serve index.html for known SPA routes without hiding 404s for unknown URLs"
  publish  = true
  code     = file("${path.module}/cloudfront-functions/spa-routing.js")
}

resource "aws_cloudfront_distribution" "studup" {
  enabled         = true
  comment         = ""
  price_class     = "PriceClass_100"
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
      origin_protocol_policy = "http-only"
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

  origin {
    domain_name = aws_s3_bucket.cv_files.bucket_regional_domain_name
    origin_id   = "stud-up-cv-files"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.cv_files.cloudfront_access_identity_path
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
    cache_policy_id        = aws_cloudfront_cache_policy.profile_images.id
  }

  ordered_cache_behavior {
    path_pattern           = "cv/*"
    target_origin_id       = "stud-up-cv-files"
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

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routing.arn
    }
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

  # TTLs are governed by the referenced managed cache policy; these legacy
  # inline fields are not managed in Terraform. This is a provider/cache-policy
  # default, not an out-of-band change. Owner: infrastructure Terraform.
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

# Avatars use a versioned object key plus a `?v=<version>` query. Both parts are
# cache identities: the path changes on replacement, and forwarding `v` keeps
# legacy/stable-key URLs from sharing a cached object across versions.
resource "aws_cloudfront_cache_policy" "profile_images" {
  name        = "studup-profile-images-cache"
  comment     = "Cache avatars by path and the v= version query; forward v to S3"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings {
        items = ["v"]
      }
    }
  }
}

resource "aws_cloudfront_origin_access_identity" "cv_files" {
  comment = "OAI for stud-up-cv-files bucket"
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
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "studup-root-redirect"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
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