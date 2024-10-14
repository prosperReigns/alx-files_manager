import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import redisClient from '../utils/redis';

const dbClient = require('../utils/db');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const keyAuth = `auth_${token}`;
    let userId;
    try {
      userId = await redisClient.getAsync(keyAuth);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const validTypes = ['folder', 'file', 'image'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    // Check if parentId is set and not 0
    if (parentId !== 0) {
      try {
        const filesCollection = dbClient.database.collection('files');
        const parentFile = await filesCollection.findOne({ _id: ObjectId(parentId) });

        if (!parentFile) {
          return res.status(400).json({ error: 'Parent not found' });
        }

        if (parentFile.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      } catch (error) {
        console.error('Error validating parentId:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    const filesCollection = dbClient.database.collection('files');
    if (type === 'folder') {
      try {
        const result = await filesCollection.insertOne({
          userId: ObjectId(userId),
          name,
          type,
          isPublic,
          parentId,
        });
        return res.status(201).json({
          id: result.insertedId,
          userId,
          name,
          type,
          isPublic,
          parentId,
        });
      } catch (error) {
        console.error('Error creating folder:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      if (!data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      const baseDir = process.env.FOLDER_PATH || '/tmp/files_manager';
      const fileUUID = uuidv4();
      const filePath = path.join(baseDir, fileUUID);

      try {
        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }

        const decodedData = Buffer.from(data, 'base64');
        fs.writeFileSync(filePath, decodedData);

        const result = await filesCollection.insertOne({
          userId: ObjectId(userId),
          name,
          type,
          isPublic,
          parentId,
          localPath: filePath,
        });

        return res.status(201).json({
          id: result.insertedId,
          userId,
          name,
          type,
          isPublic,
          parentId,
          localPath: filePath,
        });
      } catch (error) {
        console.error('Error storing file:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    const { id } = req.params;

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

      const filesCollection = dbClient.database.collection('files');
      const file = await filesCollection.findOne({ _id: ObjectId(id) });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      });
    } catch (error) {
      console.error('Error retrieving file:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const { parentId = '0', page = 0 } = req.query;

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

      const filesCollection = dbClient.database.collection('files');

      const pageSize = 20;
      const skip = page * pageSize;

      const query = {
        userId: ObjectId(userId),
        parentId: parentId === '0' ? 0 : ObjectId(parentId),
      };

      // Use MongoDB aggregation with facet for pagination
      const files = await filesCollection.aggregate([
        {
          $match: query,
        },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: pageSize }],
          },
        },
      ]).toArray();

      const response = files.length > 0 ? files[0].data : [];

      return res.json(response.map((file) => ({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      })));
    } catch (error) {
      console.error('Error retrieving files:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = FilesController;
