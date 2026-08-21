resource "aws_route53_zone" "studup" {
  name          = "studup.net"
  comment       = "HostedZone created by Route53 Registrar"
  force_destroy = false
}

resource "aws_route53_record" "openapi" {
  zone_id = aws_route53_zone.studup.zone_id
  name    = "openapi.studup.net"
  type    = "A"
  alias {
    name                   = aws_api_gateway_domain_name.openapi.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.openapi.regional_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "userapi" {
  zone_id = aws_route53_zone.studup.zone_id
  name    = "userapi.studup.net"
  type    = "A"
  alias {
    name                   = aws_api_gateway_domain_name.userapi.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.userapi.regional_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.studup.zone_id
  name    = "www.studup.net"
  type    = "CNAME"
  ttl     = 300
  records = [aws_cloudfront_distribution.studup.domain_name]
}