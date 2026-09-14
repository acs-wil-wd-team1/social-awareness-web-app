const jwt = require('jsonwebtoken');
const { UserSession } = require('../database/models')

async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token){
    return res.status(401).json({
      error: 'Access denied'
    });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);

    const session = await UserSession.findOne({
      where: {
        token: token,
        status: "active",
      },
    })

    if (!session) {
      return res.status(401).json({
        error: "Session expired or logged out",
      });
    }

    req.user = user;
    req.token = token;

    next();
  } catch (err) {
    return res.status(403).json({
      error: "Invalid token",
    })
  }
}

module.exports = verifyToken;