import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';

const crypto = require('crypto');
const dbClient = require('../utils/db');

class UsersController {
  static async postNew(req, res) {
    const { email } = req.body;
    const { password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    try {
      const usersCollection = dbClient.database.collection('users');
      const userExists = await usersCollection.findOne({ email });

      if (userExists) {
        return res.status(400).json({ error: 'Already exists' });
      }

      const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

      const result = await usersCollection.insertOne({ email, password: hashedPassword });

      return res.status(201).json({ id: result.insertedId, email });
    } catch (error) {
      console.error('Error creating new user:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMe(req, res) {
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

      const usersCollection = dbClient.database.collection('users');
      const userExists = await usersCollection.findOne({ _id: ObjectId(userId) });

      if (!userExists) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.json({ id: userExists._id, email: userExists.email });
    } catch (error) {
      console.error('Error fetching user data:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = UsersController;
