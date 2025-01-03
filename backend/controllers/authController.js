// 사용자 인증 컨트롤러


const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const AmazonCognitoIdentity = require("amazon-cognito-identity-js");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { promisify } = require("util");

// AWS 설정
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

const userPool = new AmazonCognitoIdentity.CognitoUserPool({
  UserPoolId: process.env.COGNITO_USER_POOL_ID,
  ClientId: process.env.COGNITO_CLIENT_ID,
});

// 회원가입 API
exports.register = (req, res) => {
  const { name, email, password, jobTitle } = req.body;

  console.log("Register API called with data:", { name, email, jobTitle });

  const attributeList = [
    new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "email", Value: email }),
    new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "name", Value: name }),
  ];

  userPool.signUp(email, password, attributeList, null, async (err, result) => {
    if (err) {
      console.error("Cognito signUp error:", err.message);
      return res.status(400).json({ error: err.message });
    }

    const userId = result.userSub; // Cognito에서 생성된 사용자 고유 ID
    console.log("Cognito user created with ID:", userId);

    const params = {
      TableName: "Users",
      Item: {
        userId,
        name,
        email,
        jobTitle,
        createdAt: new Date().toISOString(),
      },
    };

    try {
      await dynamoDB.send(new PutCommand(params));
      console.log("User saved to DynamoDB:", params.Item);
      res.status(201).json({ message: "User registered successfully! Please verify your email.", userId });
    } catch (dbError) {
      console.error("DynamoDB error:", dbError.message);
      res.status(500).json({ error: "Failed to save user data in DynamoDB." });
    }
  });
};

// 로그인 API 수정
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const userData = { Username: email, Pool: userPool };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: async (result) => {
        const idToken = result.idToken.jwtToken;
        
        // Users 테이블에서 이메일로 사용자 조회
        const userParams = {
          TableName: "Users",
          FilterExpression: "email = :email",
          ExpressionAttributeValues: {
            ":email": email
          }
        };

        try {
          const userResult = await dynamoDB.send(new ScanCommand(userParams));
          const user = userResult.Items?.[0];
          
          if (!user) {
            return res.status(404).json({ error: "User not found in database" });
          }

          // 실제 DynamoDB의 userId 사용
          const userId = user.userId;
          
          console.log("로그인 성공:", { email, userId });

          // 마지막 로그인 시간 업데이트
          const updateParams = {
            TableName: "Users",
            Key: { userId },
            UpdateExpression: "set lastLogin = :lastLogin",
            ExpressionAttributeValues: {
              ":lastLogin": new Date().toISOString(),
            },
          };

          await dynamoDB.send(new UpdateCommand(updateParams));
          res.json({ token: idToken, userId, name: user.name, message: "로그인 성공" });
        } catch (err) {
          console.error("DynamoDB error:", err);
          res.status(500).json({ error: "Failed to update user login data." });
        }
      },
      onFailure: (err) => {
        console.error("Cognito login error:", err.message);
        res.status(401).json({ error: err.message });
      },
    });
  } catch (error) {
    console.error("로그인 처리 중 오류 발생:", error);
    res.status(500).json({ error: "로그인 처리 중 오류가 발생했습니다." });
  }
};

// 이메일 확인 API
exports.verifyEmail = (req, res) => {
  const { email, code } = req.body;

  const userData = { Username: email, Pool: userPool };
  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.confirmRegistration(code, true, (err, result) => {
    if (err) {
      console.error("Email verification failed:", err.message);
      return res.status(400).json({ error: err.message });
    }
    res.json({ message: "Email verified successfully!" });
  });
};

// 확인 코드 재전송 API
exports.resendConfirmationCode = (req, res) => {
  const { email } = req.body;

  const userData = { Username: email, Pool: userPool };
  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

  cognitoUser.resendConfirmationCode((err, result) => {
    if (err) {
      console.error("Failed to resend confirmation code:", err.message);
      return res.status(400).json({ error: err.message });
    }
    res.json({ message: "Confirmation code resent successfully!" });
  });
};

// 사용자 프로필 조회
exports.getUserProfile = async (req, res) => {
  const { userId } = req.user;

  try {
    const params = {
      TableName: "Users",
      Key: { userId },
    };
    const data = await dynamoDB.send(new GetCommand(params));
    if (!data.Item) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json(data.Item);
  } catch (error) {
    console.error("DynamoDB error:", error.message);
    res.status(500).json({ error: "Failed to retrieve user profile." });
  }
};

// AWS Cognito JWKS 설정
const client = jwksClient({
  jwksUri: `https://cognito-idp.ap-northeast-2.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
});

// 공개 키 가져오기 함수
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error("Error fetching signing key:", err);
      callback(err, null);
    } else {
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    }
  });
}

// verifyToken 미들웨어 수정
exports.verifyToken = async (req, res, next) => {
  console.log("1. verifyToken 미들웨어 시작");
  const token = req.headers.authorization?.split(" ")[1];
  console.log("2. 받은 토큰:", token ? "토큰 있음" : "토큰 없음");

  if (!token) {
    console.log("3. 토큰 없음 에러");
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    // 토큰 검증을 Promise로 변환
    const verifyJwt = promisify(jwt.verify);
    const decoded = await verifyJwt(token, getKey, { algorithms: ["RS256"] });

    console.log("5. 토큰 디코딩 결과:", {
      sub: decoded.sub,
      email: decoded.email
    });

    // Users 테이블에서 이메일로 실제 userId 조회
    const userParams = {
      TableName: "Users",
      FilterExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": decoded.email
      }
    };

    const userResult = await dynamoDB.send(new ScanCommand(userParams));
    const user = userResult.Items?.[0];

    if (!user) {
      throw new Error("User not found in database");
    }

    console.log("5-1. DB에서 찾은 사용자 정보:", {
      userId: user.userId,
      email: user.email
    });

    req.user = {
      userId: user.userId, // Cognito sub 대신 DB의 userId 사용
      name: decoded.name,
      email: decoded.email
    };

    console.log("6. req.user 설정됨:", req.user);
    next();
  } catch (err) {
    console.error("4. 토큰 검증 실패:", err);
    return res.status(400).json({ error: "Invalid token" });
  }
};