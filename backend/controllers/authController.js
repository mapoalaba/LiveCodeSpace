// 사용자 인증 컨트롤러


const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
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

// 로그인 API
exports.login = (req, res) => {
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
      const userId = result.idToken.payload.sub;

      const params = {
        TableName: "Users",
        Key: { userId },
        UpdateExpression: "set lastLogin = :lastLogin",
        ExpressionAttributeValues: {
          ":lastLogin": new Date().toISOString(),
        },
      };

      try {
        await dynamoDB.send(new UpdateCommand(params));
        console.log("User last login updated in DynamoDB");
        res.json({ token: idToken, userId });
      } catch (err) {
        console.error("DynamoDB error:", err.message);
        res.status(500).json({ error: "Failed to update user login data." });
      }
    },
    onFailure: (err) => {
      console.error("Cognito login error:", err.message);
      res.status(401).json({ error: err.message });
    },
  });
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

// 토큰 검증 미들웨어
exports.verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
    if (err) {
      console.error("Invalid Token Error:", err.message);
      return res.status(400).json({ error: "Invalid token" });
    }

    console.log("Decoded User:", decoded);

    // JWT에서 필요한 정보를 매핑하여 req.user에 저장
    req.user = {
      userId: decoded.sub, // sub 필드를 userId로 매핑
      name: decoded.name,  // 이름 필드 추가
      email: decoded.email // 이메일 필드 추가
    };

    next();
  });
};