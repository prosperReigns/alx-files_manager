import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Basic ')) {
      const base64Credentials = authHeader.slice(6);
      const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [email, password] = decodedCredentials.split(':');

      try {
        const usersCollection = dbClient.database.collection('users');
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const sha1Password = crypto.createHash('sha1').update(password).digest('hex');

        if (user.password !== sha1Password) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = uuidv4();
        const keyAuth = `auth_${token}`;

        await redisClient.setAsync(keyAuth, user._id.toString(), 'EX', 24 * 60 * 60);

        return res.status(200).json({ token });
      } catch (error) {
        console.error('Error during authentication:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const keyAuth = `auth_${token}`;
    try {
      const userId = await redisClient.getAsync(keyAuth);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await redisClient.delAsync(keyAuth);
      return res.status(204).send(); // No content response
    } catch (error) {
      console.error('Error during disconnection:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = AuthController;
