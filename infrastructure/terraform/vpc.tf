# vpc.tf
# VPC 관련 설정

# AWS 가용 영역 데이터 소스
data "aws_availability_zones" "available" {
 state = "available"
}

# VPC 생성
resource "aws_vpc" "main" {
 cidr_block           = "10.0.0.0/16"
 enable_dns_hostnames = true
 enable_dns_support   = true

 tags = {
   Name = "livecode-vpc"
 }
}

# 퍼블릭 서브넷 생성
resource "aws_subnet" "public" {
 count                   = 2
 vpc_id                  = aws_vpc.main.id
 cidr_block              = "10.0.${count.index + 1}.0/24"
 availability_zone       = data.aws_availability_zones.available.names[count.index]
 map_public_ip_on_launch = true

 tags = {
   Name = "livecode-public-subnet-${count.index + 1}"
 }
}

# 프라이빗 서브넷 생성
resource "aws_subnet" "private" {
 count             = 2
 vpc_id            = aws_vpc.main.id
 cidr_block        = "10.0.${count.index + 10}.0/24"
 availability_zone = data.aws_availability_zones.available.names[count.index]

 tags = {
   Name = "livecode-private-subnet-${count.index + 1}"
 }
}

# 인터넷 게이트웨이
resource "aws_internet_gateway" "main" {
 vpc_id = aws_vpc.main.id

 tags = {
   Name = "livecode-igw"
 }
}

# NAT 게이트웨이용 Elastic IP
resource "aws_eip" "nat" {
 count  = 2
 domain = "vpc"

 tags = {
   Name = "livecode-nat-eip-${count.index + 1}"
 }
}

# NAT 게이트웨이
resource "aws_nat_gateway" "main" {
 count         = 2
 allocation_id = aws_eip.nat[count.index].id
 subnet_id     = aws_subnet.public[count.index].id

 tags = {
   Name = "livecode-nat-${count.index + 1}"
 }

 depends_on = [aws_internet_gateway.main]
}

# 퍼블릭 라우팅 테이블
resource "aws_route_table" "public" {
 vpc_id = aws_vpc.main.id

 route {
   cidr_block = "0.0.0.0/0"
   gateway_id = aws_internet_gateway.main.id
 }

 tags = {
   Name = "livecode-public-rt"
 }
}

# 퍼블릭 서브넷과 라우팅 테이블 연결
resource "aws_route_table_association" "public" {
 count          = 2
 subnet_id      = aws_subnet.public[count.index].id
 route_table_id = aws_route_table.public.id
}

# 프라이빗 라우팅 테이블
resource "aws_route_table" "private" {
 count  = 2
 vpc_id = aws_vpc.main.id

 route {
   cidr_block     = "0.0.0.0/0"
   nat_gateway_id = aws_nat_gateway.main[count.index].id
 }

 tags = {
   Name = "livecode-private-rt-${count.index + 1}"
 }
}

# 프라이빗 서브넷과 라우팅 테이블 연결
resource "aws_route_table_association" "private" {
 count          = 2
 subnet_id      = aws_subnet.private[count.index].id
 route_table_id = aws_route_table.private[count.index].id
}

# VPC Endpoint용 보안 그룹
resource "aws_security_group" "vpc_endpoints" {
  name        = "livecode-vpc-endpoints"
  description = "Security group for VPC endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "livecode-vpc-endpoints-sg"
  }
}

# ECS 태스크용 보안 그룹
resource "aws_security_group" "ecs_tasks" {
  name        = "livecode-ecs-tasks"
  description = "Allow inbound traffic for ECS tasks"
  vpc_id      = aws_vpc.main.id

  # ALB로부터의 인바운드 트래픽 허용
  ingress {
    from_port       = 5002
    to_port         = 5002
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # VPC 엔드포인트로의 아웃바운드 트래픽 허용
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 일반 아웃바운드 트래픽 허용
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "livecode-ecs-tasks-sg"
  }
}

# S3 VPC Gateway Endpoint
resource "aws_vpc_endpoint" "s3_gateway" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-northeast-2.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = {
    Name = "livecode-s3-gateway-endpoint"
  }
}

# SSM VPC Interface Endpoint
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

# ECS Agent VPC Endpoint
resource "aws_vpc_endpoint" "ecs_agent" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.ecs-agent"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

# ECS Telemetry VPC Endpoint
resource "aws_vpc_endpoint" "ecs_telemetry" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.ecs-telemetry"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

# ECS VPC Endpoint
resource "aws_vpc_endpoint" "ecs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.ecs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

# ECR DKR VPC Endpoint
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

# ECR API VPC Endpoint
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

# CloudWatch Logs VPC Endpoint
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}