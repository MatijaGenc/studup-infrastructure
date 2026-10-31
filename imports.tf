import {
  to = aws_route53_record.studup_wildcard_cert_validation
  id = "Z05431083V9E43Y497ZSV__3fbd5ea22469abab4e3742cd6b7d54b4.studup.net_CNAME"
}

import {
  to = aws_dynamodb_table.terraform_state_lock
  id = "studup-terraform-state-lock"
}

import {
  to = aws_lambda_permission.open_api_rest_proxy
  id = "DataHandler/StudUpPublicRestProxyInvoke"
}

import {
  to = aws_lambda_permission.data_api_rest_proxy
  id = "DataHandler/StudUpPrivateRestProxyInvoke"
}

import {
  to = aws_api_gateway_method.data_api_preflight["root"]
  id = "a5ljx6xmme/oigl3qxjhe/OPTIONS"
}
import {
  to = aws_api_gateway_method.data_api_preflight["data"]
  id = "a5ljx6xmme/xd9c6w/OPTIONS"
}
import {
  to = aws_api_gateway_method.data_api_preflight["proxy"]
  id = "a5ljx6xmme/lssh7t/OPTIONS"
}

import {
  to = aws_api_gateway_method_response.data_api_preflight["root"]
  id = "a5ljx6xmme/oigl3qxjhe/OPTIONS/200"
}
import {
  to = aws_api_gateway_method_response.data_api_preflight["data"]
  id = "a5ljx6xmme/xd9c6w/OPTIONS/200"
}
import {
  to = aws_api_gateway_method_response.data_api_preflight["proxy"]
  id = "a5ljx6xmme/lssh7t/OPTIONS/200"
}

import {
  to = aws_api_gateway_integration.data_api_preflight["root"]
  id = "a5ljx6xmme/oigl3qxjhe/OPTIONS"
}
import {
  to = aws_api_gateway_integration.data_api_preflight["data"]
  id = "a5ljx6xmme/xd9c6w/OPTIONS"
}
import {
  to = aws_api_gateway_integration.data_api_preflight["proxy"]
  id = "a5ljx6xmme/lssh7t/OPTIONS"
}

import {
  to = aws_api_gateway_integration_response.data_api_preflight["root"]
  id = "a5ljx6xmme/oigl3qxjhe/OPTIONS/200"
}
import {
  to = aws_api_gateway_integration_response.data_api_preflight["data"]
  id = "a5ljx6xmme/xd9c6w/OPTIONS/200"
}
import {
  to = aws_api_gateway_integration_response.data_api_preflight["proxy"]
  id = "a5ljx6xmme/lssh7t/OPTIONS/200"
}
