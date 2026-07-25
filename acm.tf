resource "aws_acm_certificate" "studup_wildcard" {
  domain_name       = "*.studup.net"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "www_studup" {
  provider          = aws.us-east-1
  domain_name       = "www.studup.net"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}