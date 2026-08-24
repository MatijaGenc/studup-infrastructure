resource "aws_acm_certificate" "studup_wildcard" {
  domain_name       = "*.studup.net"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "studup_root" {
  domain_name       = "studup.net"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "studup_root_cloudfront" {
  provider          = aws.us-east-1
  domain_name       = "studup.net"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "studup_root_cert_validation" {
  zone_id = aws_route53_zone.studup.zone_id
  name    = tolist(aws_acm_certificate.studup_root.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.studup_root.domain_validation_options)[0].resource_record_type
  records = [tolist(aws_acm_certificate.studup_root.domain_validation_options)[0].resource_record_value]
  ttl     = 300
}

resource "aws_route53_record" "studup_root_cloudfront_cert_validation" {
  zone_id = aws_route53_zone.studup.zone_id
  name    = tolist(aws_acm_certificate.studup_root_cloudfront.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.studup_root_cloudfront.domain_validation_options)[0].resource_record_type
  records = [tolist(aws_acm_certificate.studup_root_cloudfront.domain_validation_options)[0].resource_record_value]
  ttl     = 300
}

resource "aws_acm_certificate_validation" "studup_root" {
  certificate_arn         = aws_acm_certificate.studup_root.arn
  validation_record_fqdns = [aws_route53_record.studup_root_cert_validation.fqdn]
}

resource "aws_acm_certificate_validation" "studup_root_cloudfront" {
  provider                = aws.us-east-1
  certificate_arn         = aws_acm_certificate.studup_root_cloudfront.arn
  validation_record_fqdns = [aws_route53_record.studup_root_cloudfront_cert_validation.fqdn]
}

resource "aws_acm_certificate_validation" "studup_wildcard" {
  certificate_arn         = aws_acm_certificate.studup_wildcard.arn
  validation_record_fqdns = [aws_route53_record.studup_root_cert_validation.fqdn]
}

resource "aws_acm_certificate" "www_studup" {
  provider          = aws.us-east-1
  domain_name       = "www.studup.net"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "www_studup_cert_validation" {
  zone_id = aws_route53_zone.studup.zone_id
  name    = tolist(aws_acm_certificate.www_studup.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.www_studup.domain_validation_options)[0].resource_record_type
  records = [tolist(aws_acm_certificate.www_studup.domain_validation_options)[0].resource_record_value]
  ttl     = 300
}

resource "aws_acm_certificate_validation" "www_studup" {
  provider                = aws.us-east-1
  certificate_arn         = aws_acm_certificate.www_studup.arn
  validation_record_fqdns = [aws_route53_record.www_studup_cert_validation.fqdn]
}