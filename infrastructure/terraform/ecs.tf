#ecs.tf
# ECS 클러스터 생성
resource "aws_ecs_cluster" "main" {
 name = "livecode-cluster"
 
 setting {
   name  = "containerInsights"
   value = "enabled"
 }
}

# ECR 리포지토리 데이터 소스 
data "aws_ecr_repository" "terminal" {
 name = "livecode-terminal-service"
}

# ECS 태스크 정의
resource "aws_ecs_task_definition" "terminal" {
 family                   = "terminal-service"
 network_mode             = "awsvpc"
 requires_compatibilities = ["FARGATE"]
 cpu                      = "256"
 memory                   = "512"
 execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
 task_role_arn           = aws_iam_role.ecs_task_role.arn  # 태스크 역할 추가
 
 container_definitions = jsonencode([
   {
     name  = "terminal-service"
     image = "${data.aws_ecr_repository.terminal.repository_url}:latest"
     portMappings = [
       {
         containerPort = 5002
         protocol      = "tcp"
       }
     ]
     logConfiguration = {
       logDriver = "awslogs"
       options = {
         "awslogs-group"         = aws_cloudwatch_log_group.terminal.name
         "awslogs-region"        = "ap-northeast-2"
         "awslogs-stream-prefix" = "terminal"
       }
     }
   }
 ])
}

# ALB 보안 그룹
resource "aws_security_group" "alb" {
 name        = "livecode-alb"
 description = "Allow inbound traffic for ALB"
 vpc_id      = aws_vpc.main.id

 ingress {
   from_port   = 80
   to_port     = 80
   protocol    = "tcp"
   cidr_blocks = ["0.0.0.0/0"]
 }

 ingress {
   from_port   = 443
   to_port     = 443
   protocol    = "tcp"
   cidr_blocks = ["0.0.0.0/0"]
 }

 egress {
   from_port   = 0
   to_port     = 0
   protocol    = "-1"
   cidr_blocks = ["0.0.0.0/0"]
 }

 tags = {
   Name = "livecode-alb-sg"
 }
}

# ECS 서비스
resource "aws_ecs_service" "terminal" {
 name            = "terminal-service"
 cluster         = aws_ecs_cluster.main.id
 task_definition = aws_ecs_task_definition.terminal.arn
 desired_count   = 2
 launch_type     = "FARGATE"

 network_configuration {
   subnets          = aws_subnet.private[*].id
   security_groups  = [aws_security_group.ecs_tasks.id]
   assign_public_ip = false
 }

 load_balancer {
   target_group_arn = aws_lb_target_group.terminal.arn
   container_name   = "terminal-service"
   container_port   = 5002
 }
}

# Application Load Balancer
resource "aws_lb" "main" {
 name               = "livecode-alb"
 internal           = false
 load_balancer_type = "application"
 security_groups    = [aws_security_group.alb.id]
 subnets           = aws_subnet.public[*].id
}

# Target Group
resource "aws_lb_target_group" "terminal" {
 name        = "terminal-tg"
 port        = 5002
 protocol    = "HTTP"
 vpc_id      = aws_vpc.main.id
 target_type = "ip"

 health_check {
   path                = "/health"
   healthy_threshold   = 2
   unhealthy_threshold = 10
 }
}

# ALB Listener
resource "aws_lb_listener" "terminal" {
 load_balancer_arn = aws_lb.main.arn
 port              = 80
 protocol          = "HTTP"

 default_action {
   type             = "forward"
   target_group_arn = aws_lb_target_group.terminal.arn
 }
}

# CloudWatch 로그 그룹
resource "aws_cloudwatch_log_group" "terminal" {
 name              = "/ecs/terminal-service"
 retention_in_days = 14
}