exports.handler = async (event) => {
  try {
    console.log('Auth event:', JSON.stringify(event, null, 2));
    
    const projectId = event?.queryStringParameters?.projectId;
    const authHeader = event?.queryStringParameters?.authorization;
    
    if (!projectId || !authHeader) {
      console.log('Missing parameters:', { projectId, authHeader });
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ 
        message: 'Authorized',
        projectId 
      })
    };
  } catch (error) {
    console.error('Auth error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};